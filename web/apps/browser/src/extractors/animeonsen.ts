import type {
  AnimeDetails,
  EpisodeList,
  PlaybackResolution,
  ProviderAnimeRef,
  ProviderEpisodeRef,
  SearchInput,
  SearchPage,
} from "@relay/contracts";
import { BrowserExtractionError } from "../errors";
import type { BrowserProviderExtractor, ExtractionRuntime } from "./types";

type PlaywrightPageLike = {
  goto(url: string, options?: Record<string, unknown>): Promise<unknown>;
  waitForTimeout(timeoutMs: number): Promise<void>;
  waitForSelector(selector: string, options?: Record<string, unknown>): Promise<unknown>;
  evaluate<T>(pageFunction: () => T | Promise<T>): Promise<T>;
  evaluate<T, Arg>(pageFunction: (arg: Arg) => T | Promise<T>, arg: Arg): Promise<T>;
  on(
    event: "response",
    listener: (response: {
      url(): string;
      status(): number;
      text(): Promise<string>;
    }) => void,
  ): void;
};

type SearchCard = {
  externalAnimeId: string;
  title: string;
  synopsis: string | null;
  coverImage: string | null;
  year: number | null;
};

type AnimeOnsenSearchApiHit = {
  content_title?: string | null;
  content_title_en?: string | null;
  content_title_jp?: string | null;
  content_id?: string | null;
};

type AnimeOnsenSearchApiResponse = {
  hits?: AnimeOnsenSearchApiHit[];
  estimatedTotalHits?: number | null;
  limit?: number | null;
  offset?: number | null;
};

type AnimeOnsenEpisodesApiResponse = Record<
  string,
  {
    contentTitle_episode_en?: string | null;
    contentTitle_episode_jp?: string | null;
  }
>;

type AnimeOnsenPageSnapshot = {
  title: string;
  synopsis: string | null;
  coverImage: string | null;
  year: number | null;
  tags: string[];
  totalEpisodes: number | null;
  contentId: string | null;
};

type EpisodeEntry = {
  externalEpisodeId: string;
  number: number;
  title: string;
  thumbnail: string | null;
};

type ApiAttempt = {
  status: number;
  body: string;
  usedToken: string | null;
};

type ResolvedSubtitle = {
  label: string;
  language: string;
  url: string;
  format: "vtt" | "srt" | "ass";
  isDefault: boolean;
};

type ResolvedStream = {
  url: string;
  mimeType: "application/vnd.apple.mpegurl" | "application/dash+xml" | "video/mp4";
  quality: string;
};

const BASE_URL = "https://www.animeonsen.xyz";
const API_BASE_URL = "https://api.animeonsen.xyz";
const SEARCH_API_URL = "https://search.animeonsen.xyz/indexes/content/search";
const SEARCH_API_BEARER_TOKEN =
  "0e36d0275d16b40d7cf153634df78bc229320d073f565db2aaf6d027e0c30b13";
const ANIMEONSEN_CHALLENGE_MARKERS = [
  "just a moment",
  "performing security verification",
  "enable javascript and cookies to continue",
  "verification successful. waiting for",
  "checking your browser before accessing",
];

function cleanText(value?: string | null) {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function buildAnimeOnsenImageUrl(contentId: string, size = "210x300") {
  return `${API_BASE_URL}/v4/image/${size}/${encodeURIComponent(contentId)}`;
}

function safeAbsoluteUrl(value?: string | null, baseUrl = BASE_URL) {
  const cleaned = cleanText(value);
  if (!cleaned) {
    return null;
  }

  try {
    return new URL(cleaned, baseUrl).toString();
  } catch {
    return null;
  }
}

function parseNumber(value?: string | null) {
  const match = cleanText(value).match(/\d+(?:\.\d+)?/);
  if (!match) {
    return null;
  }

  const parsed = Number.parseFloat(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseYear(value?: string | null) {
  const match = cleanText(value).match(/\b(19|20)\d{2}\b/);
  if (!match) {
    return null;
  }

  const parsed = Number.parseInt(match[0], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseEpisodeNumber(value?: string | null) {
  const parsed = parseNumber(value);
  if (parsed === null) {
    return null;
  }

  return parsed >= 0 ? parsed : null;
}

function uniqueBy<T>(values: T[], keyFn: (value: T) => string) {
  const seen = new Set<string>();
  const output: T[] = [];

  for (const value of values) {
    const key = keyFn(value);
    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(value);
  }

  return output;
}

function scoreTitleAgainstQuery(title: string, query: string) {
  const normalizedTitle = cleanText(title).toLowerCase();
  const normalizedQuery = cleanText(query).toLowerCase();
  if (!normalizedTitle || !normalizedQuery) {
    return 0;
  }

  if (normalizedTitle === normalizedQuery) {
    return 1_000;
  }

  let score = 0;
  if (normalizedTitle.includes(normalizedQuery)) {
    score += 200;
  }

  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    if (normalizedTitle.includes(token)) {
      score += 30;
    }
  }

  return score;
}

function looksLikeChallenge(sample: string) {
  const normalized = sample.toLowerCase();
  return ANIMEONSEN_CHALLENGE_MARKERS.some((marker) => normalized.includes(marker));
}

async function waitForAnimeOnsenReady(
  page: PlaywrightPageLike,
  message: string,
  timeoutMs = 30_000,
) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const state = await page.evaluate(() => ({
      title: document.title,
      bodyText: document.body?.innerText ?? "",
      readyState: document.readyState,
      detailsLinks: document.querySelectorAll("a[href*='/details/']").length,
      watchLinks: document.querySelectorAll("a[href*='/watch/']").length,
      searchInputs: document.querySelectorAll(
        "input[type='search'], input[name='query'], input[name='search'], input[placeholder*='Search'], input[aria-label*='Search']",
      ).length,
      episodeOptions: document.querySelectorAll(
        ".ao-player-metadata-episode option, select[name*='episode'] option, select[id*='episode'] option",
      ).length,
      contentId:
        document.querySelector<HTMLMetaElement>("meta[name='ao-content-id']")?.content ??
        document
          .querySelector<HTMLMetaElement>("meta[property='og:image']")
          ?.content.match(/\/v4\/image\/[^/]+\/([^/?#]+)/)?.[1] ??
        "",
    })).catch(() => ({
      title: "",
      bodyText: "",
      readyState: "loading",
      detailsLinks: 0,
      watchLinks: 0,
      searchInputs: 0,
      episodeOptions: 0,
      contentId: "",
    }));

    const sample = `${state.title}\n${state.bodyText}`;
    if (
      state.readyState === "complete" &&
      !looksLikeChallenge(sample) &&
      (
        state.detailsLinks > 0 ||
        state.watchLinks > 0 ||
        state.searchInputs > 0 ||
        state.episodeOptions > 0 ||
        !!state.contentId
      )
    ) {
      return;
    }

    await page.waitForTimeout(1_000);
  }

  throw new BrowserExtractionError("challenge_failed", message, { statusCode: 502 });
}

async function navigate(page: PlaywrightPageLike, path: string) {
  await page.goto(new URL(path, BASE_URL).toString(), {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
}

async function searchAnimeOnsenCatalog(
  input: SearchInput,
  signal: AbortSignal,
): Promise<SearchPage> {
  const limit = input.limit;
  const offset = (input.page - 1) * input.limit;
  const response = await fetch(SEARCH_API_URL, {
    method: "POST",
    signal,
    headers: {
      accept: "*/*",
      "accept-language": "en-US,en;q=0.9",
      authorization: `Bearer ${SEARCH_API_BEARER_TOKEN}`,
      "content-type": "application/json",
      origin: BASE_URL,
      referer: `${BASE_URL}/`,
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-site",
      "x-meilisearch-client": "Meilisearch JavaScript (v0.27.0)",
    },
    body: JSON.stringify({
      q: input.query,
      limit,
      offset,
    }),
  });

  if (!response.ok) {
    throw new BrowserExtractionError(
      "upstream_error",
      `AnimeOnsen search API failed with status ${response.status} for query "${input.query}".`,
      { statusCode: 502 },
    );
  }

  let payload: AnimeOnsenSearchApiResponse;
  try {
    payload = (await response.json()) as AnimeOnsenSearchApiResponse;
  } catch (error) {
    throw new BrowserExtractionError(
      "upstream_error",
      `AnimeOnsen search API returned invalid JSON for query "${input.query}".`,
      { statusCode: 502, cause: error },
    );
  }

  const rawItems = (payload.hits ?? []).map((hit): SearchCard | null => {
    const externalAnimeId = cleanText(hit.content_id);
    const title =
      cleanText(hit.content_title_en) ||
      cleanText(hit.content_title) ||
      cleanText(hit.content_title_jp);

    if (!externalAnimeId || !title) {
      return null;
    }

    return {
      externalAnimeId,
      title,
      synopsis: null,
      coverImage: buildAnimeOnsenImageUrl(externalAnimeId),
      year: null,
    };
  });

  const items = uniqueBy(
    rawItems.filter((entry): entry is SearchCard => entry !== null),
    (item) => item.externalAnimeId,
  );

  const estimatedTotalHits = payload.estimatedTotalHits ?? items.length;

  return {
    providerId: "animeonsen",
    query: input.query,
    page: input.page,
    hasNextPage: estimatedTotalHits > offset + items.length,
    items: items.map((item) => ({
      providerId: "animeonsen",
      providerDisplayName: "AnimeOnsen",
      externalAnimeId: item.externalAnimeId,
      title: item.title,
      synopsis: item.synopsis,
      coverImage: item.coverImage,
      year: item.year,
      kind: "unknown",
      language: "en",
      contentClass: "anime",
      requiresAdultGate: false,
    })),
  };
}

function parseEpisodesApiPayload(
  providerId: string,
  externalAnimeId: string,
  body: string,
): EpisodeList {
  let payload: AnimeOnsenEpisodesApiResponse;
  try {
    payload = JSON.parse(body) as AnimeOnsenEpisodesApiResponse;
  } catch (error) {
    throw new BrowserExtractionError(
      "upstream_error",
      `AnimeOnsen episodes API returned invalid JSON for anime "${externalAnimeId}".`,
      { statusCode: 502, cause: error },
    );
  }

  const episodes = Object.entries(payload)
    .map(([episodeId, value]) => {
      const number = parseEpisodeNumber(episodeId);
      if (number === null) {
        return null;
      }

      const title =
        cleanText(value?.contentTitle_episode_en) ||
        cleanText(value?.contentTitle_episode_jp) ||
        `Episode ${number}`;

      return {
        providerId,
        externalAnimeId,
        externalEpisodeId: episodeId,
        number,
        title,
        synopsis: null,
        thumbnail: buildAnimeOnsenImageUrl(externalAnimeId, "640x360"),
        durationSeconds: null,
        releasedAt: null,
      };
    })
    .filter(
      (
        episode,
      ): episode is {
        providerId: string;
        externalAnimeId: string;
        externalEpisodeId: string;
        number: number;
        title: string;
        synopsis: null;
        thumbnail: string;
        durationSeconds: null;
        releasedAt: null;
      } => episode !== null,
    )
    .sort((left, right) => left.number - right.number);

  if (episodes.length === 0) {
    throw new BrowserExtractionError(
      "upstream_error",
      `AnimeOnsen episodes API returned no episodes for anime "${externalAnimeId}".`,
      { statusCode: 502 },
    );
  }

  return {
    providerId,
    externalAnimeId,
    episodes,
  };
}

async function captureEpisodesApiResponse(
  page: PlaywrightPageLike,
  externalAnimeId: string,
) {
  const apiUrl = `${API_BASE_URL}/v4/content/${encodeURIComponent(externalAnimeId)}/episodes`;

  return new Promise<string | null>((resolve) => {
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) {
        return;
      }

      settled = true;
      resolve(value);
    };

    page.on("response", (response) => {
      if (settled || response.url() !== apiUrl || response.status() !== 200) {
        return;
      }

      void response.text()
        .then((body) => finish(body))
        .catch(() => finish(null));
    });

    setTimeout(() => finish(null), 6_000);
  });
}

async function submitSearchQuery(page: PlaywrightPageLike, query: string) {
  const handled = await page.evaluate((inputQuery) => {
    const selectors = [
      "input[type='search']",
      "input[name='query']",
      "input[name='search']",
      "input[placeholder*='Search']",
      "input[aria-label*='Search']",
    ];

    for (const selector of selectors) {
      const input = document.querySelector<HTMLInputElement>(selector);
      if (!input) {
        continue;
      }

      input.focus();
      input.value = inputQuery;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));

      const form = input.closest("form");
      if (form) {
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      } else {
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        input.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true }));
      }

      return true;
    }

    return false;
  }, query);

  if (handled) {
    await page.waitForTimeout(2_500);
  }
}

async function extractAnimeSnapshot(page: PlaywrightPageLike) {
  return page.evaluate(() => {
    const clean = (value?: string | null) => value?.replace(/\s+/g, " ").trim() ?? "";
    const toAbsolute = (value?: string | null) => {
      const cleaned = clean(value);
      if (!cleaned) {
        return null;
      }

      try {
        return new URL(cleaned, window.location.origin).toString();
      } catch {
        return null;
      }
    };
    const extractYear = (value?: string | null) => {
      const match = clean(value).match(/\b(19|20)\d{2}\b/);
      return match ? Number.parseInt(match[0], 10) : null;
    };
    const extractEpisodeCount = (value?: string | null) => {
      const sample = clean(value);
      const explicit = sample.match(/(\d+)\s+episodes?/i);
      if (explicit) {
        return Number.parseInt(explicit[1], 10);
      }

      return null;
    };

    const metaTitle = clean(
      document.querySelector<HTMLMetaElement>("meta[property='og:title']")?.content,
    );
    const pageTitle = clean(document.querySelector("h1, h2")?.textContent);
    const synopsisMeta = clean(
      document.querySelector<HTMLMetaElement>("meta[name='description']")?.content,
    );
    const synopsisText = clean(
      document.querySelector(
        ".description, .synopsis, .summary, [data-description], article p, main p",
      )?.textContent,
    );
    const coverImage =
      toAbsolute(document.querySelector<HTMLMetaElement>("meta[property='og:image']")?.content) ??
      toAbsolute(document.querySelector<HTMLImageElement>("img")?.getAttribute("src")) ??
      toAbsolute(document.querySelector<HTMLImageElement>("img")?.getAttribute("data-src"));

    const textSample = clean(document.body?.innerText);
    const tags = Array.from(
      document.querySelectorAll<HTMLAnchorElement>(
        "a[href*='genre'], a[href*='tag'], [data-tag], .badge, .chip",
      ),
    )
      .map((node) => clean(node.textContent))
      .filter(
        (value) =>
          value.length > 1 &&
          !/^(watch|episode|episodes|details|subtitles|dubbed|movie|tv)$/i.test(value),
      );

    const selectEpisodeCount = document.querySelectorAll(
      ".ao-player-metadata-episode option, select[name*='episode'] option, select[id*='episode'] option",
    ).length;

    return {
      title: metaTitle || pageTitle || clean(document.title.replace(/[-|].*$/, "")),
      synopsis: synopsisText || synopsisMeta || null,
      coverImage,
      year: extractYear(textSample),
      tags: Array.from(new Set(tags)),
      totalEpisodes: extractEpisodeCount(textSample) ?? (selectEpisodeCount > 0 ? selectEpisodeCount : null),
      contentId:
        clean(document.querySelector<HTMLMetaElement>("meta[name='ao-content-id']")?.content) ||
        document
          .querySelector<HTMLMetaElement>("meta[property='og:image']")
          ?.content.match(/\/v4\/image\/[^/]+\/([^/?#]+)/)?.[1] ||
        null,
    };
  });
}

async function extractWatchAnimeId(page: PlaywrightPageLike) {
  return page.evaluate(() => {
    const directWatchLink = document.querySelector<HTMLAnchorElement>(
      "a[href*='/watch/'][href*='episode='], a[href*='/watch/']",
    )?.getAttribute("href");
    const hrefs = [
      directWatchLink,
      ...Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href*='/watch/']")).map((anchor) =>
        anchor.getAttribute("href"),
      ),
    ].filter((value): value is string => typeof value === "string" && value.length > 0);

    for (const href of hrefs) {
      const match = href.match(/\/watch\/([^/?#]+)/);
      if (match?.[1]) {
        return match[1];
      }
    }

    return null;
  });
}

async function extractDetailsAnimeId(page: PlaywrightPageLike) {
  return page.evaluate(() => {
    const hrefs = Array.from(
      document.querySelectorAll<HTMLAnchorElement>("a[href*='/details/']"),
    ).map((anchor) => anchor.getAttribute("href"));

    for (const href of hrefs) {
      if (!href) {
        continue;
      }

      const match = href.match(/\/details\/([^/?#]+)/);
      if (match?.[1]) {
        return match[1];
      }
    }

    return null;
  });
}

async function extractEpisodes(page: PlaywrightPageLike) {
  return page.evaluate(() => {
    const clean = (value?: string | null) => value?.replace(/\s+/g, " ").trim() ?? "";
    const extractNumber = (value?: string | null) => {
      const match = clean(value).match(/\d+(?:\.\d+)?/);
      return match ? Number.parseFloat(match[0]) : null;
    };

    const parsedFromSelect = Array.from(
      document.querySelectorAll<HTMLOptionElement>(
        ".ao-player-metadata-episode option, select[name*='episode'] option, select[id*='episode'] option",
      ),
    )
      .map((option) => {
        const value = clean(option.value);
        const text = clean(option.textContent);
        const episodeNumber = extractNumber(text) ?? extractNumber(value);
        if (episodeNumber === null) {
          return null;
        }

        const episodeIdFromValue =
          value.match(/(?:^|[-_])(\d+(?:\.\d+)?)$/)?.[1] ??
          value.match(/^(\d+(?:\.\d+)?)$/)?.[1] ??
          `${episodeNumber}`;
        const title = text || `Episode ${episodeNumber}`;

        return {
          externalEpisodeId: episodeIdFromValue,
          number: episodeNumber,
          title,
          thumbnail:
            document
              .querySelector<HTMLMetaElement>("meta[property='og:image']")
              ?.content.replace(/\/v4\/image\/[^/]+\//, "/v4/image/640x360/") ?? null,
        };
      })
      .filter(
        (
          entry,
        ): entry is {
          externalEpisodeId: string;
          number: number;
          title: string;
          thumbnail: string | null;
        } => entry !== null,
      );

    if (parsedFromSelect.length > 0) {
      return parsedFromSelect;
    }

    const parsedFromLinks = Array.from(
      document.querySelectorAll<HTMLAnchorElement>("a[href*='/watch/'][href*='episode=']"),
    )
      .map((anchor) => {
        const href = anchor.getAttribute("href") ?? "";
        const url = new URL(href, window.location.origin);
        const episodeId = clean(url.searchParams.get("episode"));
        const title = clean(anchor.textContent);
        const number = extractNumber(title) ?? extractNumber(episodeId);
        if (!episodeId || number === null) {
          return null;
        }

        return {
          externalEpisodeId: episodeId,
          number,
          title: title || `Episode ${number}`,
          thumbnail: null,
        };
      })
      .filter(
        (
          entry,
        ): entry is {
          externalEpisodeId: string;
          number: number;
          title: string;
          thumbnail: null;
        } => entry !== null,
      );

    return parsedFromLinks;
  });
}

async function fetchPlaybackPayload(page: PlaywrightPageLike, externalEpisodeId: string) {
  return page.evaluate(async ({ apiBaseUrl, episodeId }) => {
    const clean = (value?: string | null) => value?.replace(/\s+/g, " ").trim() ?? "";
    const decodeUri = (value: string) => {
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    };
    const decodeBase64 = (value: string) => {
      try {
        return atob(value);
      } catch {
        return null;
      }
    };

    const contentId =
      clean(document.querySelector<HTMLMetaElement>("meta[name='ao-content-id']")?.content) ||
      document
        .querySelector<HTMLMetaElement>("meta[property='og:image']")
        ?.content.match(/\/v4\/image\/[^/]+\/([^/?#]+)/)?.[1] ||
      "";
    if (!contentId) {
      throw new Error("AnimeOnsen page did not expose ao-content-id metadata.");
    }

    const rawCookie = document.cookie
      .split(";")
      .map((segment) => segment.trim())
      .find((segment) => segment.startsWith("ao.session="))
      ?.slice("ao.session=".length);

    const tokenCandidates = new Set<string>();
    const pushCandidate = (value?: string | null) => {
      const cleaned = clean(value);
      if (!cleaned) {
        return;
      }

      tokenCandidates.add(cleaned);
      if (cleaned.length >= 32) {
        tokenCandidates.add(cleaned.slice(-32));
      }
    };

    if (rawCookie) {
      const decodedCookie = decodeUri(rawCookie);
      pushCandidate(rawCookie);
      pushCandidate(decodedCookie);

      for (const candidate of [rawCookie, decodedCookie]) {
        if (!candidate) {
          continue;
        }

        const parts = candidate.split("|").map((part) => clean(part));
        for (const part of parts) {
          pushCandidate(part);
          const base64Decoded = decodeBase64(part);
          pushCandidate(base64Decoded);
          if (base64Decoded) {
            pushCandidate(
              Array.from(base64Decoded, (character) =>
                String.fromCharCode(character.charCodeAt(0) + 1),
              ).join(""),
            );
          }
        }
      }
    }

    const requestUrl = `${apiBaseUrl}/v4/content/${encodeURIComponent(contentId)}/video/${encodeURIComponent(episodeId)}`;
    const attempts: Array<{ token: string | null; headers?: Record<string, string> }> = [
      { token: null },
      ...Array.from(tokenCandidates).map((token) => ({
        token,
        headers: {
          authorization: `Bearer ${token}`,
        },
      })),
    ];

    let lastStatus = 0;
    let lastBody = "";
    let usedToken: string | null = null;

    for (const attempt of attempts) {
      const response = await fetch(requestUrl, {
        credentials: "include",
        headers: {
          accept: "application/json, text/plain, */*",
          ...(attempt.headers ?? {}),
        },
      });
      lastStatus = response.status;
      lastBody = await response.text();
      usedToken = attempt.token ?? null;

      if (response.status === 200) {
        return {
          status: response.status,
          body: lastBody,
          usedToken,
        };
      }
    }

    return {
      status: lastStatus,
      body: lastBody,
      usedToken,
    };
  }, { apiBaseUrl: API_BASE_URL, episodeId: externalEpisodeId });
}

function parseSubtitleTracks(payload: unknown): ResolvedSubtitle[] {
  const collect = (value: unknown, labelPrefix = "Subtitle"): ResolvedSubtitle[] => {
    if (!value) {
      return [];
    }

    if (Array.isArray(value)) {
      return value.flatMap((entry, index) => {
        if (!entry || typeof entry !== "object") {
          return [];
        }

        const item = entry as Record<string, unknown>;
        const url = safeAbsoluteUrl(
          typeof item.url === "string" ? item.url
          : typeof item.src === "string" ? item.src
          : typeof item.file === "string" ? item.file
          : null,
          API_BASE_URL,
        );
        if (!url) {
          return [];
        }

        const formatValue =
          typeof item.format === "string" ? item.format
          : url.endsWith(".ass") ? "ass"
          : url.endsWith(".srt") ? "srt"
          : "vtt";

        return [
          {
            label:
              cleanText(typeof item.label === "string" ? item.label : null) ||
              cleanText(typeof item.language === "string" ? item.language : null) ||
              `${labelPrefix} ${index + 1}`,
            language: cleanText(typeof item.language === "string" ? item.language : null) || "und",
            url,
            format:
              formatValue === "ass" || formatValue === "srt" ? formatValue : "vtt",
            isDefault:
              item.default === true ||
              item.isDefault === true ||
              item.kind === "captions" ||
              index === 0,
          },
        ];
      });
    }

    if (typeof value === "object") {
      return Object.entries(value as Record<string, unknown>).flatMap(([label, entry]) => {
        if (typeof entry === "string") {
          const url = safeAbsoluteUrl(entry, API_BASE_URL);
          return url ?
              [{
                label: cleanText(label) || "Subtitle",
                language: cleanText(label).slice(0, 2).toLowerCase() || "und",
                url,
                format:
                  url.endsWith(".ass") ? "ass"
                  : url.endsWith(".srt") ? "srt"
                  : "vtt",
                isDefault: false,
              }]
            : [];
        }

        if (!entry || typeof entry !== "object") {
          return [];
        }

        const item = entry as Record<string, unknown>;
        const url = safeAbsoluteUrl(
          typeof item.url === "string" ? item.url
          : typeof item.src === "string" ? item.src
          : typeof item.file === "string" ? item.file
          : null,
          API_BASE_URL,
        );
        if (!url) {
          return [];
        }

        return [
          {
            label:
              cleanText(typeof item.label === "string" ? item.label : null) ||
              cleanText(label) ||
              "Subtitle",
            language:
              cleanText(typeof item.language === "string" ? item.language : null) ||
              cleanText(label).slice(0, 2).toLowerCase() ||
              "und",
            url,
            format:
              url.endsWith(".ass") ? "ass"
              : url.endsWith(".srt") ? "srt"
              : "vtt",
            isDefault: item.default === true || item.isDefault === true,
          },
        ];
      });
    }

    return [];
  };

  const data = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const dataValue = data.data && typeof data.data === "object" ? (data.data as Record<string, unknown>) : null;
  const dataUri = dataValue?.uri && typeof dataValue.uri === "object" ?
      (dataValue.uri as Record<string, unknown>)
    : null;
  return uniqueBy(
    [
      ...collect(dataUri?.subtitles),
      ...collect(dataValue?.subtitles),
      ...collect(data.uri),
      ...collect(data.subtitles),
    ],
    (track) => track.url,
  );
}

function parseStreams(payload: unknown): ResolvedStream[] {
  const candidates: ResolvedStream[] = [];
  const push = (urlValue: unknown, qualityValue?: unknown) => {
    const url = safeAbsoluteUrl(typeof urlValue === "string" ? urlValue : null, API_BASE_URL);
    if (!url || /\.(?:vtt|srt|ass)(?:$|\?)/i.test(url)) {
      return;
    }

    const mimeType =
      url.endsWith(".mpd") ? "application/dash+xml"
      : url.endsWith(".m3u8") ? "application/vnd.apple.mpegurl"
      : "video/mp4";
    candidates.push({
      url,
      mimeType,
      quality: cleanText(typeof qualityValue === "string" ? qualityValue : null) || "default",
    });
  };

  const visit = (value: unknown) => {
    if (!value) {
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item);
      }
      return;
    }

    if (typeof value === "string") {
      push(value);
      return;
    }

    if (typeof value !== "object") {
      return;
    }

    const item = value as Record<string, unknown>;
    push(item.stream, item.quality ?? item.label);
    push(item.playback, item.quality ?? item.label);
    push(item.manifest, item.quality ?? item.label);
    push(item.url, item.quality ?? item.label);
    push(item.file, item.quality ?? item.label);

    if (item.streams) {
      visit(item.streams);
    }
    if (item.sources) {
      visit(item.sources);
    }
    if (item.uri) {
      visit(item.uri);
    }
    if (item.data) {
      visit(item.data);
    }
  };

  visit(payload);

  return uniqueBy(candidates, (stream) => stream.url).sort((left, right) => {
    const leftScore = left.mimeType === "application/dash+xml" ? 2 : left.mimeType === "application/vnd.apple.mpegurl" ? 1 : 0;
    const rightScore = right.mimeType === "application/dash+xml" ? 2 : right.mimeType === "application/vnd.apple.mpegurl" ? 1 : 0;
    return rightScore - leftScore;
  });
}

function mapSearchCardsToPage(input: SearchInput, items: SearchCard[]): SearchPage {
  const rankedItems = uniqueBy(items, (item) => item.externalAnimeId)
    .map((item) => ({
      item,
      score: scoreTitleAgainstQuery(item.title, input.query),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.item.title.localeCompare(right.item.title);
    })
    .slice(0, input.limit)
    .map(({ item }) => item);

  return {
    providerId: "animeonsen",
    query: input.query,
    page: input.page,
    hasNextPage: false,
    items: rankedItems.map((item) => ({
      providerId: "animeonsen",
      providerDisplayName: "AnimeOnsen",
      externalAnimeId: item.externalAnimeId,
      title: item.title,
      synopsis: item.synopsis,
      coverImage: item.coverImage,
      year: item.year,
      kind: "unknown",
      language: "en",
      contentClass: "anime",
      requiresAdultGate: false,
    })),
  };
}

export class AnimeOnsenExtractor implements BrowserProviderExtractor {
  async search(input: SearchInput, runtime: ExtractionRuntime): Promise<SearchPage> {
    return searchAnimeOnsenCatalog(input, runtime.signal);
  }

  async getAnime(input: ProviderAnimeRef, runtime: ExtractionRuntime): Promise<AnimeDetails> {
    return runtime.withPage(async (page) => {
      const browserPage = page as unknown as PlaywrightPageLike;
      const episodesResponsePromise = captureEpisodesApiResponse(browserPage, input.externalAnimeId);
      await navigate(browserPage, `/watch/${encodeURIComponent(input.externalAnimeId)}?episode=1`);
      await waitForAnimeOnsenReady(
        browserPage,
        `Timed out waiting for AnimeOnsen anime metadata for anime "${input.externalAnimeId}".`,
      );
      await browserPage.waitForTimeout(1_500);

      const snapshot = await extractAnimeSnapshot(browserPage);
      const episodesBody = await Promise.race([
        episodesResponsePromise,
        browserPage.waitForTimeout(2_000).then(() => null),
      ]);
      const episodesFromApi =
        typeof episodesBody === "string"
          ? parseEpisodesApiPayload(input.providerId, input.externalAnimeId, episodesBody)
          : null;

      const title = cleanText(snapshot.title);
      if (!title) {
        throw new BrowserExtractionError(
          "upstream_error",
          `AnimeOnsen did not expose a title for anime "${input.externalAnimeId}".`,
          { statusCode: 502 },
        );
      }

      return {
        providerId: input.providerId,
        providerDisplayName: "AnimeOnsen",
        externalAnimeId: input.externalAnimeId,
        title,
        synopsis: snapshot.synopsis,
        coverImage: snapshot.coverImage ?? buildAnimeOnsenImageUrl(input.externalAnimeId),
        bannerImage: snapshot.coverImage ?? buildAnimeOnsenImageUrl(input.externalAnimeId, "640x360"),
        status: "unknown",
        year: snapshot.year,
        tags: snapshot.tags,
        language: "en",
        totalEpisodes: snapshot.totalEpisodes ?? episodesFromApi?.episodes.length ?? null,
        contentClass: "anime",
        requiresAdultGate: false,
      };
    });
  }

  async getEpisodes(input: ProviderAnimeRef, runtime: ExtractionRuntime): Promise<EpisodeList> {
    return runtime.withPage(async (page) => {
      const browserPage = page as unknown as PlaywrightPageLike;
      const episodesResponsePromise = captureEpisodesApiResponse(browserPage, input.externalAnimeId);
      await navigate(browserPage, `/watch/${encodeURIComponent(input.externalAnimeId)}?episode=1`);
      await waitForAnimeOnsenReady(
        browserPage,
        `Timed out waiting for AnimeOnsen episodes for anime "${input.externalAnimeId}".`,
      );
      await browserPage.waitForTimeout(1_500);

      const episodesBody = await Promise.race([
        episodesResponsePromise,
        browserPage.waitForTimeout(2_000).then(() => null),
      ]);
      if (typeof episodesBody === "string") {
        return parseEpisodesApiPayload(input.providerId, input.externalAnimeId, episodesBody);
      }

      let episodes = await extractEpisodes(browserPage);
      if (episodes.length === 0) {
        const detailsAnimeId = await extractDetailsAnimeId(browserPage);
        if (detailsAnimeId) {
          await navigate(browserPage, `/details/${encodeURIComponent(detailsAnimeId)}`);
          await waitForAnimeOnsenReady(
            browserPage,
            `Timed out waiting for AnimeOnsen details episode list for anime "${input.externalAnimeId}".`,
          );
          await browserPage.waitForTimeout(1_500);
          episodes = await extractEpisodes(browserPage);
        }
      }

      const dedupedEpisodes = uniqueBy(episodes, (episode) => episode.externalEpisodeId).sort(
        (left, right) => left.number - right.number,
      );
      if (dedupedEpisodes.length === 0) {
        throw new BrowserExtractionError(
          "upstream_error",
          `AnimeOnsen did not expose an episode list for anime "${input.externalAnimeId}".`,
          { statusCode: 502 },
        );
      }

      return {
        providerId: input.providerId,
        externalAnimeId: input.externalAnimeId,
        episodes: dedupedEpisodes.map((episode) => ({
          providerId: input.providerId,
          externalAnimeId: input.externalAnimeId,
          externalEpisodeId: episode.externalEpisodeId,
          number: episode.number,
          title: episode.title || `Episode ${episode.number}`,
          synopsis: null,
          thumbnail: episode.thumbnail ?? buildAnimeOnsenImageUrl(input.externalAnimeId, "640x360"),
          durationSeconds: null,
          releasedAt: null,
        })),
      };
    });
  }

  async resolvePlayback(
    input: ProviderEpisodeRef,
    runtime: ExtractionRuntime,
  ): Promise<PlaybackResolution> {
    return runtime.withPage(async (page) => {
      const browserPage = page as unknown as PlaywrightPageLike;
      await navigate(
        browserPage,
        `/watch/${encodeURIComponent(input.externalAnimeId)}?episode=${encodeURIComponent(input.externalEpisodeId)}`,
      );
      await waitForAnimeOnsenReady(
        browserPage,
        `Timed out waiting for AnimeOnsen playback for episode "${input.externalEpisodeId}".`,
      );
      await browserPage.waitForTimeout(1_500);

      const playbackAttempt = await fetchPlaybackPayload(browserPage, input.externalEpisodeId);
      if (playbackAttempt.status !== 200) {
        throw new BrowserExtractionError(
          "upstream_error",
          `AnimeOnsen video endpoint failed with status ${playbackAttempt.status} for episode "${input.externalEpisodeId}".`,
          {
            statusCode: 502,
            details: {
              usedToken: playbackAttempt.usedToken ? `${playbackAttempt.usedToken.slice(0, 8)}…` : null,
            },
          },
        );
      }

      let payload: unknown;
      try {
        payload = JSON.parse(playbackAttempt.body);
      } catch (error) {
        throw new BrowserExtractionError(
          "upstream_error",
          `AnimeOnsen returned invalid JSON for episode "${input.externalEpisodeId}".`,
          { statusCode: 502, cause: error },
        );
      }

      const streams = parseStreams(payload);
      if (streams.length === 0) {
        throw new BrowserExtractionError(
          "upstream_error",
          `AnimeOnsen did not expose a playable stream for episode "${input.externalEpisodeId}".`,
          { statusCode: 502 },
        );
      }

      const subtitles = parseSubtitleTracks(payload);

      return {
        providerId: input.providerId,
        externalAnimeId: input.externalAnimeId,
        externalEpisodeId: input.externalEpisodeId,
        streams: streams.map((stream, index) => ({
          id: `animeonsen-${index + 1}`,
          url: stream.url,
          quality: stream.quality,
          mimeType: stream.mimeType,
          headers: {},
          cookies: {},
          proxyMode: "proxy",
          isDefault: index === 0,
        })),
        subtitles,
        cookies: {},
        expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      };
    });
  }
}
