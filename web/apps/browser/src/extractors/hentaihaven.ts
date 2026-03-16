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

type PlaywrightResponseLike = {
  url(): string;
  status(): number;
  text(): Promise<string>;
};

type PlaywrightPageLike = {
  goto(url: string, options?: Record<string, unknown>): Promise<unknown>;
  waitForTimeout(timeoutMs: number): Promise<void>;
  waitForSelector(selector: string, options?: Record<string, unknown>): Promise<unknown>;
  evaluate<T>(pageFunction: () => T | Promise<T>): Promise<T>;
  on(event: "response", listener: (response: PlaywrightResponseLike) => void): void;
};

type SearchCard = {
  externalAnimeId: string;
  title: string;
  alternativeTitle: string | null;
  coverImage: string | null;
  year: number | null;
};

type AnimePageEpisodeEntry = {
  externalEpisodeId: string;
  number: number | null;
  title: string;
  thumbnail: string | null;
  releasedText: string | null;
};

type AnimePageSnapshot = {
  title: string;
  synopsis: string | null;
  coverImage: string | null;
  metaItems: Array<{
    label: string;
    value: string;
  }>;
  tagTexts: string[];
  episodes: AnimePageEpisodeEntry[];
};

type PlaybackApiSource = {
  src?: string | null;
  type?: string | null;
  label?: string | null;
};

type PlaybackApiPayload = {
  status?: boolean;
  data?: {
    sources?: PlaybackApiSource[];
  };
};

type PlaybackPageSnapshot = {
  iframeUrl: string | null;
  title: string;
};

type PlayerApiRequestParts = {
  a: string;
  b: string;
};

type StreamMimeType =
  | "application/vnd.apple.mpegurl"
  | "application/dash+xml"
  | "video/mp4"
  | "text/html";

type ResolvedStreamCandidate = {
  id: string;
  url: string;
  mimeType: StreamMimeType;
  quality: string;
  proxyMode: "proxy" | "redirect";
  isDefault: boolean;
};

type SubtitleCandidate = {
  url: string;
  format: "vtt" | "srt" | "ass";
  language: string;
  label: string;
  isDefault: boolean;
};

const BASE_URL = "https://hentaihaven.xxx";
const PROVIDER_ID = "hentaihaven";
const PROVIDER_DISPLAY_NAME = "HentaiHaven";
const SEARCH_PAGE_SIZE = 25;
const PLAYER_API_URL = `${BASE_URL}/wp-content/plugins/player-logic/api.php`;
const CHALLENGE_MARKERS = [
  "just a moment",
  "performing security verification",
  "checking your browser before accessing",
  "enable javascript and cookies to continue",
];

function cleanText(value?: string | null) {
  return value?.replace(/\s+/g, " ").trim() ?? "";
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

function rankTitleAgainstQuery(title: string, query: string) {
  const normalizedTitle = normalizeSearchValue(title);
  const normalizedQuery = normalizeSearchValue(query);
  const compactTitle = compactSearchValue(title);
  const compactQuery = compactSearchValue(query);
  const tokens = normalizedQuery.split(" ").filter(Boolean);

  if (!normalizedTitle || !normalizedQuery || tokens.length === 0) {
    return null;
  }

  const exactMatch = normalizedTitle === normalizedQuery;
  const phraseMatch = normalizedTitle.includes(normalizedQuery);
  const compactMatch = compactQuery.length > 0 && compactTitle.includes(compactQuery);
  const matchedTokens = tokens.filter((token) => normalizedTitle.includes(token));
  const allTokensMatch = matchedTokens.length === tokens.length;

  if (!exactMatch && !phraseMatch && !compactMatch && !allTokensMatch) {
    return null;
  }

  return (
    (exactMatch ? 5_000 : 0) +
    (phraseMatch ? 2_000 : 0) +
    (compactMatch ? 1_000 : 0) +
    matchedTokens.length * 150
  );
}

function parseYear(value?: string | null) {
  const matches = cleanText(value).match(/\b(19|20)\d{2}\b/g);
  if (!matches || matches.length === 0) {
    return null;
  }

  const parsed = matches
    .map((entry) => Number.parseInt(entry, 10))
    .filter((entry) => Number.isFinite(entry));

  return parsed.length > 0 ? Math.min(...parsed) : null;
}

function parseReleasedAt(value?: string | null) {
  const cleaned = cleanText(value);
  if (!cleaned) {
    return null;
  }

  const parsed = new Date(cleaned);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function parseEpisodeNumber(value?: string | null) {
  const cleaned = cleanText(value);
  if (!cleaned) {
    return null;
  }

  const match = cleaned.match(/episode\s*0*(\d+(?:\.\d+)?)/i) ?? cleaned.match(/\b0*(\d+(?:\.\d+)?)\b/);
  if (!match?.[1]) {
    return null;
  }

  const parsed = Number.parseFloat(match[1]);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function normalizeAnimeId(value: string) {
  const cleaned = cleanText(value);
  if (!cleaned) {
    return "";
  }

  try {
    const parsed = new URL(cleaned, BASE_URL);
    const match = parsed.pathname.match(/^\/watch\/([^/]+)\/?$/i);
    if (match?.[1]) {
      return decodeURIComponent(match[1]);
    }
  } catch {
    // Ignore URL parsing failures and continue with path normalization.
  }

  return cleaned.replace(/^\/+|\/+$/g, "").replace(/^watch\//i, "").split("/")[0] ?? "";
}

function normalizeEpisodeId(value: string, animeId?: string) {
  const cleaned = cleanText(value);
  if (!cleaned) {
    return "";
  }

  try {
    const parsed = new URL(cleaned, BASE_URL);
    const match = parsed.pathname.match(/^\/watch\/[^/]+\/([^/]+)\/?$/i);
    if (match?.[1]) {
      return decodeURIComponent(match[1]);
    }
  } catch {
    // Ignore URL parsing failures and continue with path normalization.
  }

  const normalizedAnimeId = animeId ? normalizeAnimeId(animeId) : "";
  const trimmed = cleaned.replace(/^\/+|\/+$/g, "").replace(/^watch\//i, "");
  const segments = trimmed.split("/").filter(Boolean);

  if (segments.length >= 2 && (!normalizedAnimeId || segments[0] === normalizedAnimeId)) {
    return segments[1] ?? "";
  }

  return segments[segments.length - 1] ?? "";
}

function buildSearchUrl(query: string, page: number) {
  const encodedQuery = encodeURIComponent(query).replace(/%20/g, "+");
  const suffix = page > 1 ? `page/${page}/` : "";
  return `${BASE_URL}/search/${encodedQuery}/${suffix}`;
}

function buildAnimeUrl(animeId: string) {
  return `${BASE_URL}/watch/${encodeURIComponent(normalizeAnimeId(animeId))}/`;
}

function buildEpisodeUrl(animeId: string, episodeId: string) {
  return `${buildAnimeUrl(animeId)}${encodeURIComponent(normalizeEpisodeId(episodeId, animeId))}/`;
}

function guessMimeType(type?: string | null, url?: string | null): StreamMimeType {
  const normalizedType = cleanText(type).toLowerCase();
  const normalizedUrl = cleanText(url).toLowerCase();

  if (normalizedType.includes("mpegurl") || /\.m3u8(?:\?|$)/i.test(normalizedUrl)) {
    return "application/vnd.apple.mpegurl";
  }
  if (normalizedType.includes("dash") || /\.mpd(?:\?|$)/i.test(normalizedUrl)) {
    return "application/dash+xml";
  }
  if (normalizedType.includes("mp4") || /\.mp4(?:\?|$)/i.test(normalizedUrl)) {
    return "video/mp4";
  }

  return "text/html";
}

function inferQuality(value: string, fallback = "default") {
  const cleaned = cleanText(value);
  const qualityMatch = cleaned.match(/\b(2160|1440|1080|720|480|360)p\b/i)
    ?? cleaned.match(/\b(2160|1440|1080|720|480|360)\b/i);
  if (qualityMatch?.[1]) {
    return `${qualityMatch[1]}p`;
  }
  if (/auto|master/i.test(cleaned)) {
    return "auto";
  }
  return fallback;
}

function parseTotalPages(title: string, bodyText: string, itemsPerPage: number) {
  const pageMatch = title.match(/page\s+\d+\s+of\s+(\d+)/i);
  if (pageMatch?.[1]) {
    const parsed = Number.parseInt(pageMatch[1], 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  const resultsMatch = bodyText.match(/(\d[\d,]*)\s+results?\s+for/i);
  if (!resultsMatch?.[1] || itemsPerPage <= 0) {
    return null;
  }

  const totalResults = Number.parseInt(resultsMatch[1].replace(/,/g, ""), 10);
  if (!Number.isFinite(totalResults) || totalResults <= 0) {
    return null;
  }

  return Math.ceil(totalResults / itemsPerPage);
}

function buildSubtitleLabel(language: string) {
  switch (language) {
    case "en":
      return "English";
    case "es":
      return "Spanish";
    case "pt":
      return "Portuguese";
    case "fr":
      return "French";
    case "de":
      return "German";
    default:
      return language.toUpperCase();
  }
}

function parseSubtitleCandidate(url: string): SubtitleCandidate | null {
  const cleanedUrl = cleanText(url);
  if (!cleanedUrl) {
    return null;
  }

  const parsedUrl = safeAbsoluteUrl(cleanedUrl);
  if (!parsedUrl) {
    return null;
  }

  if (/\.ass(?:\?|$)/i.test(parsedUrl)) {
    const language = parsedUrl.match(/\/([a-z]{2,3})(?:\.[^./?#]+)?(?:\?|$)/i)?.[1]?.toLowerCase() ?? "und";
    return {
      url: parsedUrl,
      format: "ass",
      language,
      label: buildSubtitleLabel(language),
      isDefault: language === "en",
    };
  }

  if (/\.vtt(?:\?|$)/i.test(parsedUrl)) {
    return {
      url: parsedUrl,
      format: "vtt",
      language: "und",
      label: "Subtitles",
      isDefault: false,
    };
  }

  if (/\.srt(?:\?|$)/i.test(parsedUrl)) {
    return {
      url: parsedUrl,
      format: "srt",
      language: "und",
      label: "Subtitles",
      isDefault: false,
    };
  }

  return null;
}

function shouldCaptureDirectMedia(url: string) {
  const normalized = cleanText(url).toLowerCase();
  if (!normalized) {
    return false;
  }

  if (!/\.m3u8(?:\?|$)|\.mpd(?:\?|$)|\.mp4(?:\?|$)/i.test(normalized)) {
    return false;
  }

  if (/\.m3u8(?:\?|$)/i.test(normalized) && !/\/playlist(?:_[^/]+)?\.m3u8(?:\?|$)/i.test(normalized)) {
    return false;
  }

  return !(
    /\/snd\//.test(normalized) ||
    /\/s\//.test(normalized) ||
    /\/i\.mp4(?:\?|$)/.test(normalized) ||
    /preview\.mp4(?:\?|$)/.test(normalized)
  );
}

async function waitForHentaiHavenReady(
  page: PlaywrightPageLike,
  mode: "search" | "anime" | "episode",
  targetPath: string,
  timeoutMs = 25_000,
) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const state = await page.evaluate(() => ({
      title: document.title,
      bodyText: document.body?.innerText ?? "",
      readyState: document.readyState,
      searchCards: document.querySelectorAll(".page-item-detail.video, .c-tabs-item__content").length,
      metaItems: document.querySelectorAll(".post-content_item").length,
      episodeItems: document.querySelectorAll(".wp-manga-chapter").length,
      playerFrames: document.querySelectorAll(".player_logic_item iframe[src*='player.php?data=']").length,
      heading: (document.querySelector("h1")?.textContent ?? "").replace(/\s+/g, " ").trim(),
    })).catch(() => ({
      title: "",
      bodyText: "",
      readyState: "loading",
      searchCards: 0,
      metaItems: 0,
      episodeItems: 0,
      playerFrames: 0,
      heading: "",
    }));

    const sample = `${state.title}\n${state.bodyText}`.toLowerCase();
    const looksLikeChallenge = CHALLENGE_MARKERS.some((marker) => sample.includes(marker));
    const hasContent =
      mode === "search"
        ? state.searchCards > 0 || /results?\s+for/i.test(state.bodyText)
        : mode === "anime"
          ? !!state.heading || state.metaItems > 0 || state.episodeItems > 0
          : state.playerFrames > 0 || (!!state.heading && state.episodeItems > 0);

    if (!looksLikeChallenge && state.readyState !== "loading" && hasContent) {
      return;
    }

    await page.waitForTimeout(750);
  }

  throw new BrowserExtractionError(
    "challenge_failed",
    `HentaiHaven did not finish loading ${targetPath} before the timeout expired.`,
    { statusCode: 502 },
  );
}

async function extractSearchSnapshot(page: PlaywrightPageLike) {
  return page.evaluate(() => ({
    title: document.title,
    bodyText: document.body?.innerText ?? "",
    items: Array.from(document.querySelectorAll(".page-item-detail.video, .c-tabs-item__content"))
      .map((node) => {
        const anchor =
          node.querySelector<HTMLAnchorElement>(".post-title a") ??
          node.querySelector<HTMLAnchorElement>(".tab-thumb a") ??
          node.querySelector<HTMLAnchorElement>("a[href*='/watch/']");
        const title =
          (node.querySelector(".post-title")?.textContent ?? anchor?.textContent ?? "")
            .replace(/\s+/g, " ")
            .trim();
        const href = anchor?.getAttribute("href") ?? "";
        const slug = href.match(/\/watch\/([^/]+)\/?$/i)?.[1] ?? "";

        if (!slug || !title) {
          return null;
        }

        return {
          externalAnimeId: decodeURIComponent(slug),
          title,
          alternativeTitle:
            (node.querySelector(".mg_alternative .summary-content")?.textContent ?? "")
              .replace(/\s+/g, " ")
              .trim() || null,
          coverImage:
            node.querySelector<HTMLImageElement>("img")?.getAttribute("src") ??
            node.querySelector<HTMLImageElement>("img")?.getAttribute("data-src") ??
            node.querySelector<HTMLImageElement>("img")?.getAttribute("data-lazy-src") ??
            null,
          year:
            (node.querySelector(".mg_release .summary-content")?.textContent ?? "")
              .replace(/\s+/g, " ")
              .trim() || null,
        };
      })
      .filter((item): item is {
        externalAnimeId: string;
        title: string;
        alternativeTitle: string | null;
        coverImage: string | null;
        year: string | null;
      } => item !== null),
  }));
}

async function extractAnimePageSnapshot(page: PlaywrightPageLike): Promise<AnimePageSnapshot> {
  return page.evaluate(() => ({
    title: (document.querySelector("h1")?.textContent ?? "").replace(/\s+/g, " ").trim(),
    synopsis:
      (document.querySelector(".description-summary .summary__content")?.textContent ?? "")
        .replace(/\s+/g, " ")
        .trim() || null,
    coverImage:
      document.querySelector<HTMLImageElement>(".summary_image img")?.getAttribute("src") ??
      document.querySelector<HTMLImageElement>(".summary_image img")?.getAttribute("data-src") ??
      document.querySelector<HTMLImageElement>(".summary_image img")?.getAttribute("data-lazy-src") ??
      null,
    metaItems: Array.from(document.querySelectorAll(".post-content_item"))
      .map((node) => {
        const label = (node.querySelector(".summary-heading")?.textContent ?? "")
          .replace(/\s+/g, " ")
          .trim()
          .replace(/:$/, "");
        const value = (node.querySelector(".summary-content")?.textContent ?? "")
          .replace(/\s+/g, " ")
          .trim();

        if (!label || !value) {
          return null;
        }

        return { label, value };
      })
      .filter(
        (item): item is {
          label: string;
          value: string;
        } => item !== null,
      ),
    tagTexts: Array.from(document.querySelectorAll(".c-btn.tag_btn, .wp-manga-tags-list a"))
      .map((node) => (node.textContent ?? "").replace(/\s+/g, " ").trim())
      .filter(Boolean),
    episodes: Array.from(document.querySelectorAll(".wp-manga-chapter"))
      .map((node) => {
        const anchor = node.querySelector<HTMLAnchorElement>("a[href*='/watch/']");
        const href = anchor?.getAttribute("href") ?? "";
        const episodeId = href.match(/\/watch\/[^/]+\/([^/]+)\/?$/i)?.[1] ?? "";
        const title = (anchor?.querySelector("div:last-of-type")?.textContent ?? anchor?.textContent ?? "")
          .replace(/\s+/g, " ")
          .trim();

        if (!episodeId) {
          return null;
        }

        return {
          externalEpisodeId: decodeURIComponent(episodeId),
          number:
            Number.parseFloat(episodeId.replace(/^episode-/i, "")) ||
            Number.parseFloat(title.replace(/^episode\s*/i, "")) ||
            null,
          title,
          thumbnail:
            anchor?.querySelector<HTMLImageElement>("img")?.getAttribute("src") ??
            anchor?.querySelector<HTMLImageElement>("img")?.getAttribute("data-src") ??
            null,
          releasedText:
            (anchor?.querySelector(".chapter-release-date")?.textContent ?? "")
              .replace(/\s+/g, " ")
              .trim() || null,
        };
      })
      .filter(
        (item): item is AnimePageEpisodeEntry => item !== null,
      ),
  }));
}

async function extractPlaybackSnapshot(page: PlaywrightPageLike): Promise<PlaybackPageSnapshot> {
  return page.evaluate(() => ({
    iframeUrl:
      document
        .querySelector<HTMLIFrameElement>(".player_logic_item iframe[src*='player.php?data=']")
        ?.getAttribute("src") ?? null,
    title: (document.querySelector("h1")?.textContent ?? document.title).replace(/\s+/g, " ").trim(),
  }));
}

function mapMetaItems(metaItems: AnimePageSnapshot["metaItems"]) {
  return new Map(metaItems.map((entry) => [entry.label.toLowerCase(), entry.value]));
}

function buildStreamCandidates(
  apiPayloads: PlaybackApiPayload[],
  capturedMediaUrls: string[],
  iframeUrl: string | null,
) {
  const candidates = new Map<string, ResolvedStreamCandidate>();

  const addCandidate = (candidate: ResolvedStreamCandidate) => {
    if (!candidate.url) {
      return;
    }

    const existing = candidates.get(candidate.url);
    if (!existing) {
      candidates.set(candidate.url, candidate);
      return;
    }

    candidates.set(candidate.url, {
      ...existing,
      ...candidate,
      isDefault: existing.isDefault || candidate.isDefault,
    });
  };

  for (const payload of apiPayloads) {
    for (const source of payload.data?.sources ?? []) {
      const url = safeAbsoluteUrl(source.src);
      if (!url) {
        continue;
      }

      const mimeType = guessMimeType(source.type, url);
      if (mimeType === "text/html") {
        continue;
      }

      addCandidate({
        id: `hentaihaven-stream-${candidates.size + 1}`,
        url,
        mimeType,
        quality: inferQuality(source.label ?? source.type ?? url, mimeType === "application/vnd.apple.mpegurl" ? "auto" : "default"),
        proxyMode: "proxy",
        isDefault: candidates.size === 0,
      });
    }
  }

  for (const url of capturedMediaUrls) {
    const absoluteUrl = safeAbsoluteUrl(url);
    if (!absoluteUrl || !shouldCaptureDirectMedia(absoluteUrl)) {
      continue;
    }

    const mimeType = guessMimeType("", absoluteUrl);
    if (mimeType === "text/html") {
      continue;
    }

    addCandidate({
      id: `hentaihaven-stream-${candidates.size + 1}`,
      url: absoluteUrl,
      mimeType,
      quality: inferQuality(absoluteUrl, mimeType === "application/vnd.apple.mpegurl" ? "auto" : "default"),
      proxyMode: "proxy",
      isDefault: candidates.size === 0,
    });
  }

  const iframeCandidateUrl = safeAbsoluteUrl(iframeUrl);
  if (iframeCandidateUrl) {
    addCandidate({
      id: `hentaihaven-stream-${candidates.size + 1}`,
      url: iframeCandidateUrl,
      mimeType: "text/html",
      quality: "embed",
      proxyMode: "redirect",
      isDefault: candidates.size === 0,
    });
  }

  return Array.from(candidates.values()).sort((left, right) => {
    const leftScore =
      left.mimeType === "application/vnd.apple.mpegurl"
        ? 4
        : left.mimeType === "application/dash+xml"
          ? 3
          : left.mimeType === "video/mp4"
            ? 2
            : 1;
    const rightScore =
      right.mimeType === "application/vnd.apple.mpegurl"
        ? 4
        : right.mimeType === "application/dash+xml"
          ? 3
          : right.mimeType === "video/mp4"
            ? 2
            : 1;

    if (leftScore !== rightScore) {
      return rightScore - leftScore;
    }

    if (left.isDefault !== right.isDefault) {
      return left.isDefault ? -1 : 1;
    }

    return left.url.localeCompare(right.url);
  });
}

function parsePlayerApiRequestParts(iframeUrl: string | null): PlayerApiRequestParts | null {
  const absoluteUrl = safeAbsoluteUrl(iframeUrl);
  if (!absoluteUrl) {
    return null;
  }

  try {
    const parsedUrl = new URL(absoluteUrl);
    const data = parsedUrl.searchParams.get("data");
    if (!data) {
      return null;
    }

    const decoded = Buffer.from(data, "base64").toString("utf8");
    const separator = ":|::|:";
    const separatorIndex = decoded.indexOf(separator);
    if (separatorIndex < 0) {
      return null;
    }

    const a = decoded.slice(0, separatorIndex);
    const bRaw = decoded.slice(separatorIndex + separator.length);
    if (!a || !bRaw) {
      return null;
    }

    return {
      a,
      b: Buffer.from(bRaw, "utf8").toString("base64"),
    };
  } catch {
    return null;
  }
}

async function requestPlayerApiPayload(
  page: PlaywrightPageLike,
  iframeUrl: string | null,
): Promise<PlaybackApiPayload | null> {
  const requestParts = parsePlayerApiRequestParts(iframeUrl);
  if (!requestParts) {
    return null;
  }

  const result = await (page as unknown as {
    evaluate<T, Arg>(pageFunction: (arg: Arg) => T | Promise<T>, arg: Arg): Promise<T>;
  }).evaluate(
    async ({ playerApiUrl, a, b }) => {
      const formData = new FormData();
      formData.set("action", "zarat_get_data_player_ajax");
      formData.set("a", a);
      formData.set("b", b);

      const response = await fetch(playerApiUrl, {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      return {
        status: response.status,
        body: await response.text(),
      };
    },
    {
      playerApiUrl: PLAYER_API_URL,
      a: requestParts.a,
      b: requestParts.b,
    },
  );

  if (result.status !== 200) {
    return null;
  }

  try {
    return JSON.parse(result.body) as PlaybackApiPayload;
  } catch {
    return null;
  }
}

export class HentaiHavenExtractor implements BrowserProviderExtractor {
  async search(input: SearchInput, runtime: ExtractionRuntime): Promise<SearchPage> {
    return runtime.withPage(async (page) => {
      const browserPage = page as unknown as PlaywrightPageLike;
      const searchUrl = buildSearchUrl(input.query, input.page);

      await browserPage.goto(searchUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      await waitForHentaiHavenReady(browserPage, "search", searchUrl);

      const snapshot = await extractSearchSnapshot(browserPage);
      const pageCount = parseTotalPages(snapshot.title, snapshot.bodyText, SEARCH_PAGE_SIZE);
      const ranked = snapshot.items
        .map((item): SearchCard & { score: number } | null => {
          const titleScore = rankTitleAgainstQuery(item.title, input.query);
          const alternativeScore =
            item.alternativeTitle ? rankTitleAgainstQuery(item.alternativeTitle, input.query) : null;
          const score = Math.max(titleScore ?? 0, alternativeScore ?? 0);

          if ((titleScore === null && alternativeScore === null) && snapshot.items.length > input.limit) {
            return null;
          }

          return {
            externalAnimeId: item.externalAnimeId,
            title: item.title,
            alternativeTitle: item.alternativeTitle,
            coverImage: safeAbsoluteUrl(item.coverImage),
            year: parseYear(item.year),
            score,
          };
        })
        .filter((item): item is SearchCard & { score: number } => item !== null)
        .sort((left, right) => {
          if (left.score !== right.score) {
            return right.score - left.score;
          }

          return left.title.localeCompare(right.title);
        });

      const items = ranked.slice(0, input.limit).map((item) => ({
        providerId: PROVIDER_ID,
        providerDisplayName: PROVIDER_DISPLAY_NAME,
        externalAnimeId: item.externalAnimeId,
        title: item.title,
        synopsis: item.alternativeTitle,
        coverImage: item.coverImage,
        year: item.year,
        kind: "unknown" as const,
        language: "en",
        contentClass: "hentai" as const,
        requiresAdultGate: true,
      }));

      return {
        providerId: PROVIDER_ID,
        query: input.query,
        page: input.page,
        hasNextPage: pageCount !== null ? input.page < pageCount : snapshot.items.length >= SEARCH_PAGE_SIZE,
        items,
      };
    });
  }

  async getAnime(input: ProviderAnimeRef, runtime: ExtractionRuntime): Promise<AnimeDetails> {
    return runtime.withPage(async (page) => {
      const browserPage = page as unknown as PlaywrightPageLike;
      const animeId = normalizeAnimeId(input.externalAnimeId);
      const animeUrl = buildAnimeUrl(animeId);

      await browserPage.goto(animeUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      await waitForHentaiHavenReady(browserPage, "anime", animeUrl);

      const snapshot = await extractAnimePageSnapshot(browserPage);
      if (!snapshot.title) {
        throw new BrowserExtractionError(
          "upstream_error",
          `HentaiHaven detail page "${animeId}" did not expose a title.`,
          { statusCode: 502 },
        );
      }

      const meta = mapMetaItems(snapshot.metaItems);
      const genreTags = cleanText(meta.get("genre(s)"))
        .split(",")
        .map((entry) => cleanText(entry))
        .filter(Boolean);
      const extraTags = snapshot.tagTexts.filter((tag) => tag.toLowerCase() === "censored");
      const tags = Array.from(new Set([...genreTags, ...extraTags]));

      return {
        providerId: PROVIDER_ID,
        providerDisplayName: PROVIDER_DISPLAY_NAME,
        externalAnimeId: animeId,
        title: snapshot.title,
        synopsis: snapshot.synopsis,
        coverImage: safeAbsoluteUrl(snapshot.coverImage),
        bannerImage: null,
        status: "unknown",
        year: parseYear(meta.get("release")),
        tags,
        language: "en",
        totalEpisodes: snapshot.episodes.length > 0 ? snapshot.episodes.length : null,
        contentClass: "hentai",
        requiresAdultGate: true,
      };
    });
  }

  async getEpisodes(input: ProviderAnimeRef, runtime: ExtractionRuntime): Promise<EpisodeList> {
    return runtime.withPage(async (page) => {
      const browserPage = page as unknown as PlaywrightPageLike;
      const animeId = normalizeAnimeId(input.externalAnimeId);
      const animeUrl = buildAnimeUrl(animeId);

      await browserPage.goto(animeUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      await waitForHentaiHavenReady(browserPage, "anime", animeUrl);

      const snapshot = await extractAnimePageSnapshot(browserPage);
      const episodes = snapshot.episodes
        .map((episode) => ({
          providerId: PROVIDER_ID,
          externalAnimeId: animeId,
          externalEpisodeId: normalizeEpisodeId(episode.externalEpisodeId, animeId),
          number: episode.number ?? parseEpisodeNumber(episode.title) ?? 0,
          title: cleanText(episode.title) || `Episode ${episode.number ?? "?"}`,
          synopsis: null,
          thumbnail: safeAbsoluteUrl(episode.thumbnail),
          durationSeconds: null,
          releasedAt: parseReleasedAt(episode.releasedText),
        }))
        .sort((left, right) => left.number - right.number);

      if (episodes.length === 0) {
        throw new BrowserExtractionError(
          "upstream_error",
          `HentaiHaven detail page "${animeId}" exposed no episode links.`,
          { statusCode: 502 },
        );
      }

      return {
        providerId: PROVIDER_ID,
        externalAnimeId: animeId,
        episodes,
      };
    });
  }

  async resolvePlayback(
    input: ProviderEpisodeRef,
    runtime: ExtractionRuntime,
  ): Promise<PlaybackResolution> {
    return runtime.withPage(async (page) => {
      const browserPage = page as unknown as PlaywrightPageLike;
      const animeId = normalizeAnimeId(input.externalAnimeId);
      const episodeId = normalizeEpisodeId(input.externalEpisodeId, animeId);
      const episodeUrl = buildEpisodeUrl(animeId, episodeId);
      const apiPayloads: PlaybackApiPayload[] = [];
      const mediaUrls: string[] = [];
      const subtitles = new Map<string, SubtitleCandidate>();
      const apiPayloadTasks: Promise<void>[] = [];

      browserPage.on("response", (response) => {
        const url = response.url();

        if (url === PLAYER_API_URL) {
          if (response.status() !== 200) {
            return;
          }

          apiPayloadTasks.push(
            response.text().then((body) => {
              try {
                apiPayloads.push(JSON.parse(body) as PlaybackApiPayload);
              } catch {
                // Ignore malformed API payloads and fall back to network captures.
              }
            }).catch(() => undefined),
          );
          return;
        }

        if (response.status() === 200 && shouldCaptureDirectMedia(url)) {
          mediaUrls.push(url);
          return;
        }

        if (response.status() !== 200) {
          return;
        }

        const subtitle = parseSubtitleCandidate(url);
        if (subtitle) {
          subtitles.set(subtitle.url, subtitle);
        }
      });

      await browserPage.goto(episodeUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      await waitForHentaiHavenReady(browserPage, "episode", episodeUrl);
      await browserPage.waitForSelector(".player_logic_item iframe[src*='player.php?data=']", {
        timeout: 12_000,
      });
      await browserPage.waitForTimeout(6_000);
      await Promise.allSettled(apiPayloadTasks);

      const snapshot = await extractPlaybackSnapshot(browserPage);
      const directApiPayload = await requestPlayerApiPayload(browserPage, snapshot.iframeUrl);
      if (directApiPayload) {
        apiPayloads.push(directApiPayload);
      }
      const streams = buildStreamCandidates(apiPayloads, mediaUrls, snapshot.iframeUrl).map((stream, index) => ({
        ...stream,
        id: `hentaihaven-${index + 1}`,
        headers: {},
        cookies: {},
      }));

      if (streams.length === 0) {
        throw new BrowserExtractionError(
          "upstream_error",
          `HentaiHaven episode "${episodeId}" exposed no playable stream or iframe.`,
          { statusCode: 502 },
        );
      }

      return {
        providerId: PROVIDER_ID,
        externalAnimeId: animeId,
        externalEpisodeId: episodeId,
        streams,
        subtitles: Array.from(subtitles.values()).sort((left, right) => {
          if (left.isDefault !== right.isDefault) {
            return left.isDefault ? -1 : 1;
          }

          return left.label.localeCompare(right.label);
        }),
        cookies: {},
        expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      };
    });
  }
}
