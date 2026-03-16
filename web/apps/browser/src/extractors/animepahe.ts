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

type AnimePaheSearchResponse = {
  current_page: number;
  last_page: number;
  data?: AnimePaheSearchEntry[];
};

type AnimePaheSearchEntry = {
  title?: string | null;
  type?: string | null;
  year?: number | null;
  poster?: string | null;
  session?: string | null;
};

type AnimePaheEpisodeResponse = {
  current_page: number;
  last_page: number;
  data?: AnimePaheEpisodeEntry[];
};

type AnimePaheEpisodeEntry = {
  episode?: number | null;
  episode2?: number | null;
  edition?: string | null;
  title?: string | null;
  snapshot?: string | null;
  duration?: string | null;
  session?: string | null;
  created_at?: string | null;
};

type AnimePaheDetailsPayload = {
  title: string;
  synopsis: string | null;
  coverImage: string | null;
  totalEpisodes: number | null;
  year: number | null;
  status: AnimeDetails["status"];
  tags: string[];
};

type AnimePahePlaybackCandidate = {
  embedUrl: string;
  quality: string;
  isDefault: boolean;
};

type ManifestCapture = {
  url: string;
  headers: Record<string, string>;
};

type PlaywrightRequestLike = {
  url(): string;
  allHeaders(): Promise<Record<string, string>>;
};

type PlaywrightResponseLike = {
  url(): string;
  status(): number;
  request(): PlaywrightRequestLike;
};

interface PlaywrightPageLike {
  goto(url: string, options?: Record<string, unknown>): Promise<unknown>;
  waitForTimeout(timeoutMs: number): Promise<void>;
  waitForSelector(selector: string, options?: Record<string, unknown>): Promise<unknown>;
  click(selector: string, options?: Record<string, unknown>): Promise<void>;
  on(event: "request", listener: (request: PlaywrightRequestLike) => void): void;
  on(event: "response", listener: (response: PlaywrightResponseLike) => void): void;
  evaluate<T>(pageFunction: () => T | Promise<T>): Promise<T>;
  evaluate<T, Arg>(pageFunction: (arg: Arg) => T | Promise<T>, arg: Arg): Promise<T>;
}

const ANIMEPAHE_CHALLENGE_MARKERS = [
  "checking your browser before accessing",
  "please wait a few seconds. once this check is complete",
  "ddos-guard",
];

function cleanText(value?: string | null) {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function parseInteger(value?: string | null) {
  if (!value) {
    return null;
  }

  const match = value.match(/\d+/);
  if (!match) {
    return null;
  }

  const parsed = Number.parseInt(match[0], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDurationSeconds(value?: string | null) {
  const cleaned = cleanText(value);
  if (!cleaned) {
    return null;
  }

  const segments = cleaned.split(":").map((segment) => Number.parseInt(segment, 10));
  if (segments.some((segment) => !Number.isFinite(segment))) {
    return null;
  }

  const [hours, minutes, seconds] =
    segments.length === 3 ? segments : [0, segments[0] ?? 0, segments[1] ?? 0];
  return hours * 3600 + minutes * 60 + seconds;
}

function mapAnimeKind(value?: string | null) {
  const normalized = cleanText(value).toLowerCase();
  if (normalized === "tv") {
    return "tv" as const;
  }
  if (normalized === "movie") {
    return "movie" as const;
  }
  if (normalized === "ova" || normalized === "ona") {
    return "ova" as const;
  }
  if (normalized === "special") {
    return "special" as const;
  }
  return "unknown" as const;
}

function mapAnimeStatus(value?: string | null): AnimeDetails["status"] {
  const normalized = cleanText(value).toLowerCase();
  if (normalized.includes("finished")) {
    return "completed";
  }
  if (normalized.includes("airing") || normalized.includes("upcoming")) {
    return "ongoing";
  }
  if (normalized.includes("hiatus")) {
    return "hiatus";
  }
  return "unknown";
}

function normalizeSearchValue(value: string) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function compactSearchValue(value: string) {
  return normalizeSearchValue(value).replace(/\s+/g, "");
}

function rankAnimePaheSearchMatch(title: string, query: string) {
  const normalizedQuery = normalizeSearchValue(query);
  const compactQuery = compactSearchValue(query);
  const tokens = normalizedQuery.split(" ").filter(Boolean);
  if (tokens.length === 0) {
    return null;
  }

  const normalizedTitle = normalizeSearchValue(title);
  const compactTitle = compactSearchValue(title);
  const exactTitle = normalizedTitle === normalizedQuery;
  const phraseMatch = normalizedTitle.includes(normalizedQuery);
  const compactMatch = compactQuery.length > 0 && compactTitle.includes(compactQuery);
  const matchedTokens = tokens.filter((token) => normalizedTitle.includes(token));
  const allTokensMatch = matchedTokens.length === tokens.length;

  if (!exactTitle && !phraseMatch && !compactMatch && !allTokensMatch) {
    return null;
  }

  return (
    (exactTitle ? 4_000 : 0) +
    (phraseMatch ? 2_000 : 0) +
    (compactMatch ? 1_000 : 0) +
    matchedTokens.length * 120
  );
}

function buildEpisodeTitle(entry: AnimePaheEpisodeEntry) {
  const baseTitle = cleanText(entry.title);
  if (baseTitle) {
    return baseTitle;
  }

  const start = entry.episode ?? 0;
  const end = entry.episode2 ?? 0;
  const range = end > start ? `${start}-${end}` : `${start}`;
  const edition = cleanText(entry.edition);

  return cleanText(`Episode ${range} ${edition}`);
}

function normalizeHeaders(headers: Record<string, string>) {
  const referer = headers.referer ?? headers.Referer ?? "";
  const origin = headers.origin ?? headers.Origin ?? "";
  const output: Record<string, string> = {};

  if (referer) {
    output.referer = referer;
  }
  if (origin) {
    output.origin = origin;
  }

  return output;
}

async function waitForAnimePaheReady(
  page: PlaywrightPageLike,
  message: string,
  timeoutMs = 18_000,
) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const state = await page.evaluate(() => ({
      title: document.title,
      bodyText: document.body?.innerText ?? "",
    })).catch(() => ({ title: "", bodyText: "" }));

    const sample = `${state.title}\n${state.bodyText}`.toLowerCase();
    const isChallenge = ANIMEPAHE_CHALLENGE_MARKERS.some((marker) => sample.includes(marker));
    const hasContent = cleanText(state.bodyText).length > 0;

    if (!isChallenge && hasContent) {
      return;
    }

    await page.waitForTimeout(1_000);
  }

  throw new BrowserExtractionError("challenge_failed", message, { statusCode: 502 });
}

async function fetchJson<T>(page: PlaywrightPageLike, url: string) {
  const response = await page.evaluate(async (requestUrl) => {
    const result = await fetch(requestUrl, {
      credentials: "include",
      headers: {
        accept: "application/json, text/plain, */*",
      },
    });

    return {
      status: result.status,
      body: await result.text(),
    };
  }, url);

  if (response.status !== 200) {
    throw new BrowserExtractionError(
      "upstream_error",
      `AnimePahe API request failed with status ${response.status} for ${url}.`,
      { statusCode: 502 },
    );
  }

  try {
    return JSON.parse(response.body) as T;
  } catch (error) {
    throw new BrowserExtractionError(
      "upstream_error",
      `AnimePahe API returned invalid JSON for ${url}.`,
      { statusCode: 502, cause: error },
    );
  }
}

async function extractAnimeDetails(page: PlaywrightPageLike): Promise<AnimePaheDetailsPayload> {
  return page.evaluate(() => {
    const infoEntries = Array.from(document.querySelectorAll(".anime-info p"))
      .map((node) => {
        const text = (node.textContent ?? "").replace(/\s+/g, " ").trim();
        const labelMatch = text.match(/^([^:]+):\s*(.*)$/);
        if (!labelMatch) {
          return null;
        }

        return {
          key: labelMatch[1].replace(/\s+/g, " ").trim().toLowerCase(),
          value: labelMatch[2].replace(/\s+/g, " ").trim(),
        };
      })
      .filter(
        (
          entry,
        ): entry is {
          key: string;
          value: string;
        } => entry !== null,
      );

    const info = new Map(infoEntries.map((entry) => [entry.key, entry.value]));
    const seasonValue = info.get("season") ?? info.get("aired") ?? "";
    const yearMatch = seasonValue.match(/\b(19|20)\d{2}\b/);
    const statusValue = info.get("status") ?? "";
    const title =
      (document.querySelector("h1.user-select-none span")?.textContent ?? "")
        .replace(/\s+/g, " ")
        .trim() ||
      (document.querySelector("h1.user-select-none")?.textContent ?? "")
        .replace(/\s+/g, " ")
        .trim();

    return {
      title,
      synopsis:
        (document.querySelector(".anime-synopsis")?.textContent ?? "")
          .replace(/\s+/g, " ")
          .trim() || null,
      coverImage:
        document.querySelector<HTMLImageElement>(".anime-poster img")?.getAttribute("src") ??
        document.querySelector<HTMLImageElement>(".anime-poster img")?.getAttribute("data-src") ??
        null,
      totalEpisodes: Number.parseInt(info.get("episodes") ?? "", 10) || null,
      year: yearMatch ? Number.parseInt(yearMatch[0], 10) : null,
      status:
        statusValue.toLowerCase().includes("finished") ? "completed"
        : statusValue.toLowerCase().includes("airing") ? "ongoing"
        : statusValue.toLowerCase().includes("hiatus") ? "hiatus"
        : "unknown",
      tags: Array.from(document.querySelectorAll(".anime-genre a"))
        .map((node) => (node.textContent ?? "").replace(/\s+/g, " ").trim())
        .filter(Boolean),
    };
  });
}

async function extractPlaybackCandidates(page: PlaywrightPageLike): Promise<AnimePahePlaybackCandidate[]> {
  return page.evaluate(() => {
    const parsed = Array.from(document.querySelectorAll<HTMLElement>("[data-src]"))
      .map((node) => {
        const embedUrl = (node.dataset.src ?? "").replace(/\s+/g, " ").trim();
        if (!embedUrl) {
          return null;
        }

        const resolution = (node.dataset.resolution ?? "").replace(/\s+/g, " ").trim();
        return {
          embedUrl,
          quality:
            resolution ? `${resolution}p`
            : (node.textContent ?? "").replace(/\s+/g, " ").trim() || "auto",
          isDefault: node.classList.contains("active"),
        };
      })
      .filter(
        (
          entry,
        ): entry is {
          embedUrl: string;
          quality: string;
          isDefault: boolean;
        } => entry !== null,
      );

    if (parsed.length > 0) {
      return parsed;
    }

    const inlineScript = Array.from(document.scripts)
      .map((script) => script.textContent ?? "")
      .find((script) => script.includes("let url ="));
    const match = inlineScript?.match(/let\s+url\s*=\s*"([^"]+)"/);
    if (!match?.[1]) {
      return [];
    }

    return [
      {
        embedUrl: match[1],
        quality: "auto",
        isDefault: true,
      },
    ];
  });
}

async function captureKwikManifest(
  page: PlaywrightPageLike,
  embedUrl: string,
): Promise<ManifestCapture> {
  let capture: ManifestCapture | null = null;

  page.on("response", (response) => {
    const url = response.url();
    if (capture || !url.includes(".m3u8") || response.status() !== 200) {
      return;
    }

    void response.request().allHeaders().then((headers) => {
      if (capture) {
        return;
      }

      capture = {
        url,
        headers: normalizeHeaders(headers),
      };
    });
  });

  await page.goto(embedUrl, {
    waitUntil: "domcontentloaded",
    timeout: 20_000,
  });

  await page.waitForSelector("video, button[aria-label='Play']", { timeout: 8_000 });
  await page.waitForTimeout(1_500);

  for (let attempt = 0; attempt < 4 && !capture; attempt += 1) {
    await page.click("button[aria-label='Play']", { timeout: 1_000 }).catch(() => undefined);
    await page.click("video", { timeout: 1_000, force: true }).catch(() => undefined);
    await page.evaluate(() => {
      const video = document.querySelector("video") as HTMLVideoElement | null;
      if (!video) {
        return;
      }

      video.muted = true;
      void video.play().catch(() => undefined);
    }).catch(() => undefined);

    await page.waitForTimeout(2_000);
  }

  const resolvedCapture = capture as ManifestCapture | null;

  if (!resolvedCapture) {
    throw new BrowserExtractionError(
      "upstream_error",
      `AnimePahe playback did not expose an HLS manifest for ${embedUrl}.`,
      { statusCode: 502 },
    );
  }

  const defaultHeaders = {
    referer: embedUrl,
    origin: new URL(embedUrl).origin,
  };

  return {
    url: resolvedCapture.url,
    headers: {
      ...defaultHeaders,
      ...resolvedCapture.headers,
    },
  };
}

export class AnimePaheExtractor implements BrowserProviderExtractor {
  async search(input: SearchInput, runtime: ExtractionRuntime): Promise<SearchPage> {
    return runtime.withPage(async (page) => {
      const browserPage = page as unknown as PlaywrightPageLike;
      await browserPage.goto(`https://${runtime.domain}/`, {
        waitUntil: "domcontentloaded",
        timeout: 20_000,
      });
      await waitForAnimePaheReady(
        browserPage,
        "AnimePahe challenge did not clear before search extraction.",
      );

      const payload = await fetchJson<AnimePaheSearchResponse>(
        browserPage,
        `https://${runtime.domain}/api?m=search&q=${encodeURIComponent(input.query)}&page=${input.page}`,
      );
      const rankedItems = (payload.data ?? []).reduce<
        Array<{
          score: number;
          item: SearchPage["items"][number];
        }>
      >((items, entry) => {
        if (
          typeof entry.session !== "string" ||
          entry.session.length === 0 ||
          typeof entry.title !== "string" ||
          entry.title.length === 0
        ) {
          return items;
        }

        const title = cleanText(entry.title);
        const score = rankAnimePaheSearchMatch(title, input.query);
        if (score === null) {
          return items;
        }

        items.push({
          score,
          item: {
            providerId: runtime.providerId,
            providerDisplayName: "AnimePahe",
            externalAnimeId: entry.session,
            title,
            synopsis: null,
            coverImage: entry.poster ?? null,
            year: typeof entry.year === "number" ? entry.year : null,
            kind: mapAnimeKind(entry.type),
            language: "ja",
            contentClass: "anime",
            requiresAdultGate: false,
          },
        });

        return items;
      }, []);

      return {
        providerId: runtime.providerId,
        query: input.query,
        page: input.page,
        hasNextPage: payload.current_page < payload.last_page,
        items: rankedItems
          .sort((left, right) => right.score - left.score)
          .map((entry) => entry.item)
          .slice(0, input.limit),
      };
    });
  }

  async getAnime(input: ProviderAnimeRef, runtime: ExtractionRuntime): Promise<AnimeDetails> {
    return runtime.withPage(async (page) => {
      const browserPage = page as unknown as PlaywrightPageLike;
      await browserPage.goto(`https://${runtime.domain}/anime/${input.externalAnimeId}`, {
        waitUntil: "domcontentloaded",
        timeout: 20_000,
      });
      await waitForAnimePaheReady(
        browserPage,
        `AnimePahe challenge did not clear for anime "${input.externalAnimeId}".`,
      );

      const details = await extractAnimeDetails(browserPage);
      if (!details.title) {
        throw new BrowserExtractionError(
          "upstream_error",
          `AnimePahe page for "${input.externalAnimeId}" did not expose an anime title.`,
          { statusCode: 502 },
        );
      }

      return {
        providerId: input.providerId,
        providerDisplayName: "AnimePahe",
        externalAnimeId: input.externalAnimeId,
        title: details.title,
        synopsis: details.synopsis,
        coverImage: details.coverImage,
        bannerImage: null,
        status: details.status,
        year: details.year,
        tags: details.tags,
        language: "ja",
        totalEpisodes: details.totalEpisodes,
        contentClass: "anime",
        requiresAdultGate: false,
      };
    });
  }

  async getEpisodes(input: ProviderAnimeRef, runtime: ExtractionRuntime): Promise<EpisodeList> {
    return runtime.withPage(async (page) => {
      const browserPage = page as unknown as PlaywrightPageLike;
      await browserPage.goto(`https://${runtime.domain}/anime/${input.externalAnimeId}`, {
        waitUntil: "domcontentloaded",
        timeout: 20_000,
      });
      await waitForAnimePaheReady(
        browserPage,
        `AnimePahe challenge did not clear for episodes of "${input.externalAnimeId}".`,
      );

      const episodes: AnimePaheEpisodeEntry[] = [];
      let currentPage = 1;
      let lastPage = 1;

      do {
        const payload = await fetchJson<AnimePaheEpisodeResponse>(
          browserPage,
          `https://${runtime.domain}/api?m=release&id=${encodeURIComponent(input.externalAnimeId)}&sort=episode_asc&page=${currentPage}`,
        );

        episodes.push(...(payload.data ?? []));
        lastPage = payload.last_page;
        currentPage += 1;
      } while (currentPage <= lastPage);

      return {
        providerId: input.providerId,
        externalAnimeId: input.externalAnimeId,
        episodes: episodes
          .filter(
            (entry): entry is AnimePaheEpisodeEntry & { session: string } =>
              typeof entry.session === "string" && entry.session.length > 0,
          )
          .map((entry) => ({
            providerId: input.providerId,
            externalAnimeId: input.externalAnimeId,
            externalEpisodeId: entry.session,
            number: entry.episode ?? 0,
            title: buildEpisodeTitle(entry),
            synopsis: null,
            thumbnail: entry.snapshot ?? null,
            durationSeconds: parseDurationSeconds(entry.duration),
            releasedAt: entry.created_at ?? null,
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
      await browserPage.goto(
        `https://${runtime.domain}/play/${input.externalAnimeId}/${input.externalEpisodeId}`,
        {
          waitUntil: "domcontentloaded",
          timeout: 20_000,
        },
      );
      await waitForAnimePaheReady(
        browserPage,
        `AnimePahe challenge did not clear for episode "${input.externalEpisodeId}".`,
      );

      const candidates = await extractPlaybackCandidates(browserPage);
      if (candidates.length === 0) {
        throw new BrowserExtractionError(
          "upstream_error",
          `AnimePahe play page for "${input.externalEpisodeId}" exposed no playback candidates.`,
          { statusCode: 502 },
        );
      }

      const candidate = [...candidates].sort((left, right) => {
        if (left.isDefault !== right.isDefault) {
          return left.isDefault ? -1 : 1;
        }

        const leftQuality = parseInteger(left.quality) ?? 0;
        const rightQuality = parseInteger(right.quality) ?? 0;
        return rightQuality - leftQuality;
      })[0];

      const manifest = await captureKwikManifest(browserPage, candidate.embedUrl);

      return {
        providerId: input.providerId,
        externalAnimeId: input.externalAnimeId,
        externalEpisodeId: input.externalEpisodeId,
        streams: [
          {
            id: `animepahe-${candidate.quality.toLowerCase()}`,
            url: manifest.url,
            quality: candidate.quality,
            mimeType: "application/vnd.apple.mpegurl",
            headers: manifest.headers,
            cookies: {},
            proxyMode: "proxy",
            isDefault: true,
          },
        ],
        subtitles: [],
        cookies: {},
        expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      };
    });
  }
}
