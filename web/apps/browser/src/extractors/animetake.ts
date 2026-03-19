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

type PlaywrightRequestLike = {
  url(): string;
  allHeaders(): Promise<Record<string, string>>;
};

type PlaywrightResponseLike = {
  url(): string;
  status(): number;
  text(): Promise<string>;
  request(): PlaywrightRequestLike;
};

type PlaywrightPageLike = {
  goto(url: string, options?: Record<string, unknown>): Promise<unknown>;
  waitForTimeout(timeoutMs: number): Promise<void>;
  waitForSelector(selector: string, options?: Record<string, unknown>): Promise<unknown>;
  click(selector: string, options?: Record<string, unknown>): Promise<void>;
  evaluate<T>(pageFunction: () => T | Promise<T>): Promise<T>;
  evaluate<T, Arg>(pageFunction: (arg: Arg) => T | Promise<T>, arg: Arg): Promise<T>;
  on(event: "request", listener: (request: PlaywrightRequestLike) => void): void;
  on(event: "response", listener: (response: PlaywrightResponseLike) => void): void;
};

type AnimeTakeListingCard = {
  externalAnimeId: string;
  title: string;
  synopsis: string | null;
  coverImage: string | null;
  latestEpisode: number | null;
};

type AnimeTakeListingPage = {
  items: AnimeTakeListingCard[];
  hasNextPage: boolean;
};

type AnimeTakeEpisodeEntry = {
  externalEpisodeId: string;
  number: number;
  title: string;
  thumbnail: string | null;
};

type AnimeTakeDetailsSnapshot = {
  title: string;
  synopsis: string | null;
  coverImage: string | null;
  year: number | null;
  statusText: string | null;
  tags: string[];
  episodes: AnimeTakeEpisodeEntry[];
  latestEpisode: number | null;
};

type AnimeTakePlaybackSnapshot = {
  title: string;
  bodyText: string;
  videoSources: string[];
  iframeSources: string[];
  redirectUrls: string[];
  inlineMediaUrls: string[];
  inlineRedirectUrls: string[];
};

type PlaybackMimeType =
  | "application/vnd.apple.mpegurl"
  | "application/dash+xml"
  | "video/mp4"
  | "text/html";

type PlaybackCandidate = {
  id: string;
  url: string;
  mimeType: PlaybackMimeType;
  quality: string;
  headers: Record<string, string>;
  proxyMode: "proxy" | "redirect";
  isDefault: boolean;
};

const BASE_URL = "https://animetake.com.co";
const PROVIDER_DISPLAY_NAME = "AnimeTake";
const CHALLENGE_MARKERS = [
  "just a moment",
  "performing security verification",
  "enable javascript and cookies to continue",
  "checking your browser before accessing",
  "cloudflare",
];
const PLAY_BUTTON_SELECTORS = [
  "text=/play/i",
  "button[aria-label*='play' i]",
  "button[class*='play' i]",
  ".jw-icon-display",
  ".jw-display-icon-container",
  ".vjs-big-play-button",
  ".plyr__control--overlaid",
  "video",
  "text=/gstore/i",
  "text=/stream/i",
  "text=/server/i",
  "text=/embed/i",
];
const MEDIA_URL_PATTERN = /https?:\/\/[^"'`\s)]+?\.(?:m3u8|mpd|mp4)(?:\?[^"'`\s)]*)?/gi;
const REDIRECT_URL_PATTERN = /(?:https?:\/\/[^"'`\s)]+)?\/redirect[^"'`\s)]*/gi;
const SEARCH_STOP_WORDS = new Set(["the", "a", "an"]);
const MAX_LISTING_PAGES = 12;
const DETAIL_FALLBACK_LISTING_PAGES = 2;
const EPISODE_FALLBACK_LISTING_PAGES = 4;
const CHALLENGE_GRACE_TIMEOUT_MS = {
  listing: 30_000,
  detail: 18_000,
  episode: 18_000,
} as const;
const IGNORED_PLAYBACK_HOST_PATTERNS = [
  /doubleclick/i,
  /googlesyndication/i,
  /google-analytics/i,
  /googleadservices/i,
  /facebook/i,
  /cloudflareinsights/i,
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

function parseEpisodeNumber(value?: string | null) {
  const cleaned = cleanText(value);
  if (!cleaned) {
    return null;
  }

  const match = cleaned.match(/episode\s*0*(\d+(?:\.\d+)?)/i)
    ?? cleaned.match(/\bep(?:isode)?\.?\s*0*(\d+(?:\.\d+)?)/i)
    ?? cleaned.match(/\b0*(\d+(?:\.\d+)?)\b/);
  if (!match?.[1]) {
    return null;
  }

  const parsed = Number.parseFloat(match[1]);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parseYear(value?: string | null) {
  const match = cleanText(value).match(/\b(19|20)\d{2}\b/);
  if (!match) {
    return null;
  }

  const parsed = Number.parseInt(match[0], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapStatus(value?: string | null): AnimeDetails["status"] {
  const normalized = cleanText(value).toLowerCase();
  if (!normalized) {
    return "unknown";
  }
  if (normalized.includes("completed") || normalized.includes("finished")) {
    return "completed";
  }
  if (normalized.includes("ongoing") || normalized.includes("airing")) {
    return "ongoing";
  }
  if (normalized.includes("hiatus")) {
    return "hiatus";
  }
  return "unknown";
}

function looksLikeChallenge(sample: string) {
  const normalized = sample.toLowerCase();
  return CHALLENGE_MARKERS.some((marker) => normalized.includes(marker));
}

function normalizeHeaders(headers: Record<string, string>) {
  const referer = headers.referer ?? headers.Referer ?? "";
  const origin = headers.origin ?? headers.Origin ?? "";
  const userAgent = headers["user-agent"] ?? headers["User-Agent"] ?? "";
  const output: Record<string, string> = {};

  if (referer) {
    output.referer = referer;
  }
  if (origin) {
    output.origin = origin;
  }
  if (userAgent) {
    output["user-agent"] = userAgent;
  }

  return output;
}

function buildListingPath(seed: string, page: number) {
  const safeSeed = encodeURIComponent(seed);
  return `/az-all-anime/${safeSeed}${page > 1 ? `?page=${page}` : ""}`;
}

function buildAnimeUrl(slug: string) {
  return `${BASE_URL}/anime/${encodeURIComponent(slug)}/`;
}

function buildEpisodeUrl(slug: string, episodeId: string) {
  return `${BASE_URL}/anime/${encodeURIComponent(slug)}/episode/${encodeURIComponent(episodeId)}`;
}

function deriveSearchSeeds(query: string, fallbackValue?: string | null) {
  const normalized = normalizeSearchValue(query);
  const tokens = normalized.split(" ").filter(Boolean);
  const candidates = [
    tokens[0]?.[0] ?? "",
    tokens.length > 1 && SEARCH_STOP_WORDS.has(tokens[0] ?? "") ? tokens[1]?.[0] ?? "" : "",
    cleanText(fallbackValue ?? "")[0]?.toLowerCase() ?? "",
  ]
    .map((value) => value.toLowerCase())
    .filter((value) => /[a-z0-9]/.test(value));

  const unique = Array.from(new Set(candidates));
  return unique.length > 0 ? unique : ["a"];
}

function guessMimeType(url: string): PlaybackMimeType {
  if (/\.mpd(?:\?|$)/i.test(url)) {
    return "application/dash+xml";
  }
  if (/\.mp4(?:\?|$)/i.test(url)) {
    return "video/mp4";
  }
  if (/\.m3u8(?:\?|$)/i.test(url)) {
    return "application/vnd.apple.mpegurl";
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
  if (/master|auto/i.test(cleaned)) {
    return "auto";
  }
  return fallback;
}

function shouldIgnorePlaybackUrl(url: string) {
  return IGNORED_PLAYBACK_HOST_PATTERNS.some((pattern) => pattern.test(url));
}

function createPlaybackCandidateMap() {
  const candidates = new Map<string, PlaybackCandidate>();

  return {
    add(candidate: PlaybackCandidate) {
      const existing = candidates.get(candidate.url);
      if (!existing) {
        candidates.set(candidate.url, candidate);
        return;
      }

      const mergedHeaders = { ...existing.headers, ...candidate.headers };
      const mergedMimeType =
        existing.mimeType === "text/html" && candidate.mimeType !== "text/html"
          ? candidate.mimeType
          : existing.mimeType;
      const mergedProxyMode =
        existing.proxyMode === "redirect" && candidate.proxyMode === "proxy"
          ? candidate.proxyMode
          : existing.proxyMode;

      candidates.set(candidate.url, {
        ...existing,
        ...candidate,
        mimeType: mergedMimeType,
        headers: mergedHeaders,
        proxyMode: mergedProxyMode,
        isDefault: existing.isDefault || candidate.isDefault,
      });
    },
    values() {
      return Array.from(candidates.values());
    },
  };
}

async function waitForAnimeTakeReady(
  page: PlaywrightPageLike,
  mode: "listing" | "detail" | "episode",
  path: string,
  timeoutMs = 35_000,
) {
  const deadline = Date.now() + timeoutMs;
  let challengeSeenAt: number | null = null;
  const challengeGraceTimeoutMs = CHALLENGE_GRACE_TIMEOUT_MS[mode];

  while (Date.now() < deadline) {
    const state = await page.evaluate(() => ({
      title: document.title,
      bodyText: document.body?.innerText ?? "",
      readyState: document.readyState,
      animeLinks: document.querySelectorAll("a[href*='/anime/']").length,
      episodeLinks: document.querySelectorAll("a[href*='/episode/']").length,
      videos: document.querySelectorAll("video, source[src]").length,
      iframes: document.querySelectorAll("iframe[src]").length,
    })).catch(() => ({
      title: "",
      bodyText: "",
      readyState: "loading",
      animeLinks: 0,
      episodeLinks: 0,
      videos: 0,
      iframes: 0,
    }));

    const sample = `${state.title}\n${state.bodyText}`;
    const challenge = looksLikeChallenge(sample);
    if (challenge) {
      challengeSeenAt ??= Date.now();
      if (Date.now() - challengeSeenAt >= challengeGraceTimeoutMs) {
        throw new BrowserExtractionError(
          "challenge_failed",
          `AnimeTake challenge did not clear for ${path}.`,
          { statusCode: 502 },
        );
      }
    } else {
      challengeSeenAt = null;
    }

    const hasListingContent = state.animeLinks > 8 || /all anime|anime list|a-z/i.test(sample);
    const hasDetailContent = state.animeLinks > 0 || /genres|synopsis|episode/i.test(sample);
    const hasEpisodeContent =
      state.videos > 0 ||
      state.iframes > 0 ||
      state.episodeLinks > 0 ||
      /episode|keyboard shortcuts|cc controls/i.test(sample);

    if (
      state.readyState === "complete" &&
      !challenge &&
      (
        (mode === "listing" && hasListingContent) ||
        (mode === "detail" && hasDetailContent) ||
        (mode === "episode" && hasEpisodeContent)
      )
    ) {
      return;
    }

    await page.waitForTimeout(1_000);
  }

  const finalSample = await page
    .evaluate(() => `${document.title}\n${document.body?.innerText ?? ""}`)
    .catch(() => "");
  const errorCode = looksLikeChallenge(finalSample) ? "challenge_failed" : "upstream_error";
  throw new BrowserExtractionError(
    errorCode,
    `AnimeTake did not finish loading ${path}.`,
    { statusCode: errorCode === "challenge_failed" ? 502 : 500 },
  );
}

async function navigate(
  page: PlaywrightPageLike,
  pathOrUrl: string,
  mode: "listing" | "detail" | "episode",
) {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${BASE_URL}${pathOrUrl}`;
  await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 25_000,
  });
  await waitForAnimeTakeReady(page, mode, url);
  await page.waitForTimeout(1_000);
}

async function scrapeListingPage(
  page: PlaywrightPageLike,
  currentPage: number,
): Promise<AnimeTakeListingPage> {
  return page.evaluate((pageNumber) => {
    const clean = (value?: string | null) => value?.replace(/\s+/g, " ").trim() ?? "";
    const toAbsolute = (value?: string | null) => {
      const cleaned = clean(value);
      if (!cleaned) {
        return null;
      }

      try {
        return new URL(cleaned, location.origin).toString();
      } catch {
        return null;
      }
    };
    const parseLatestEpisode = (value?: string | null) => {
      const cleaned = clean(value);
      const match = cleaned.match(/(?:sub|dub)?\s*ep(?:isode)?\s*0*(\d+(?:\.\d+)?)/i)
        ?? cleaned.match(/episode\s*0*(\d+(?:\.\d+)?)/i);
      if (!match?.[1]) {
        return null;
      }
      const parsed = Number.parseFloat(match[1]);
      return Number.isFinite(parsed) ? parsed : null;
    };
    const extractSlug = (href: string) => {
      try {
        const url = new URL(href);
        const match = url.pathname.match(/^\/anime\/([^/?#]+)\/?$/i);
        return clean(match?.[1] ?? "");
      } catch {
        return "";
      }
    };
    const ignoredTitles = new Set([
      "home",
      "filter",
      "all shows",
      "schedule",
      "faq",
      "genres",
      "search",
      "next",
      "prev",
      "previous",
      "page",
    ]);
    const cards = new Map<string, AnimeTakeListingCard>();

    for (const anchor of Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"))) {
      const href = toAbsolute(anchor.getAttribute("href"));
      if (!href || !href.includes("/anime/") || href.includes("/episode/")) {
        continue;
      }

      const slug = extractSlug(href);
      if (!slug) {
        continue;
      }

      const root = anchor.closest(
        "article, li, .item, .thumbnail, .anime, .post, .card, .bs, .bsx, .film_list-wrap, .row, .col",
      ) ?? anchor.parentElement ?? anchor;
      const title =
        clean(anchor.textContent)
        || clean(root.querySelector("h1, h2, h3, h4, strong")?.textContent)
        || clean(root.querySelector("img")?.getAttribute("alt"))
        || clean(root.querySelector("img")?.getAttribute("title"));
      if (!title || ignoredTitles.has(title.toLowerCase())) {
        continue;
      }

      const synopsis =
        clean(root.querySelector("p")?.textContent) || clean(root.getAttribute("data-description"));
      const coverImage = toAbsolute(
        root.querySelector("img")?.getAttribute("src")
          ?? root.querySelector("img")?.getAttribute("data-src")
          ?? root.querySelector("img")?.getAttribute("data-lazy-src"),
      );
      const latestEpisode = parseLatestEpisode(root.textContent);

      cards.set(slug, {
        externalAnimeId: slug,
        title,
        synopsis: synopsis && synopsis !== title ? synopsis : null,
        coverImage,
        latestEpisode,
      });
    }

    const hasNextPage = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]")).some(
      (anchor) => {
        const href = toAbsolute(anchor.getAttribute("href"));
        if (!href) {
          return false;
        }

        try {
          const url = new URL(href);
          const nextPage = Number.parseInt(url.searchParams.get("page") ?? "", 10);
          if (Number.isFinite(nextPage) && nextPage === pageNumber + 1) {
            return true;
          }
        } catch {
          return false;
        }

        return clean(anchor.textContent).toLowerCase() === "next";
      },
    );

    return {
      items: Array.from(cards.values()),
      hasNextPage,
    };
  }, currentPage);
}

async function scrapeAnimeDetailsPage(
  page: PlaywrightPageLike,
  externalAnimeId: string,
): Promise<AnimeTakeDetailsSnapshot> {
  return page.evaluate((animeId) => {
    const clean = (value?: string | null) => value?.replace(/\s+/g, " ").trim() ?? "";
    const toAbsolute = (value?: string | null) => {
      const cleaned = clean(value);
      if (!cleaned) {
        return null;
      }

      try {
        return new URL(cleaned, location.origin).toString();
      } catch {
        return null;
      }
    };
    const parseEpisodeNumberLocal = (value?: string | null) => {
      const cleaned = clean(value);
      const match = cleaned.match(/\/episode\/([^/?#]+)/i)
        ?? cleaned.match(/episode\s*0*(\d+(?:\.\d+)?)/i)
        ?? cleaned.match(/\b0*(\d+(?:\.\d+)?)\b/);
      if (!match?.[1]) {
        return null;
      }
      const parsed = Number.parseFloat(match[1]);
      return Number.isFinite(parsed) ? parsed : null;
    };
    const episodeMap = new Map<string, AnimeTakeEpisodeEntry>();
    const episodePathFragment = `/anime/${animeId}/episode/`;

    for (const anchor of Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"))) {
      const href = toAbsolute(anchor.getAttribute("href"));
      if (!href || !href.includes(episodePathFragment)) {
        continue;
      }

      const externalEpisodeId = href.match(/\/episode\/([^/?#]+)/i)?.[1] ?? "";
      const number = parseEpisodeNumberLocal(externalEpisodeId) ?? parseEpisodeNumberLocal(anchor.textContent);
      if (number === null) {
        continue;
      }

      const root = anchor.closest(
        "article, li, .item, .thumbnail, .episode, .ep, .card, .row, .col",
      ) ?? anchor.parentElement ?? anchor;
      const title = clean(anchor.textContent) || `Episode ${number}`;
      const thumbnail = toAbsolute(
        root.querySelector("img")?.getAttribute("src")
          ?? root.querySelector("img")?.getAttribute("data-src")
          ?? root.querySelector("img")?.getAttribute("data-lazy-src"),
      );

      episodeMap.set(`${number}`, {
        externalEpisodeId: `${number}`,
        number,
        title,
        thumbnail,
      });
    }

    const pageText = clean(document.body?.innerText);
    const title =
      clean(document.querySelector("h1")?.textContent)
      || clean(document.querySelector("meta[property='og:title']")?.getAttribute("content"))
      || clean(document.title).replace(/at\s+AnimeTake$/i, "").replace(/\s*\|\s*AnimeTake$/i, "");
    const synopsis =
      clean(document.querySelector("meta[name='description']")?.getAttribute("content"))
      || clean(document.querySelector("[itemprop='description']")?.textContent)
      || clean(document.querySelector(".entry-content p, .description p, .summary p, .synopsis p")?.textContent)
      || null;
    const coverImage = toAbsolute(
      document.querySelector("meta[property='og:image']")?.getAttribute("content")
        ?? document.querySelector("img")?.getAttribute("src")
        ?? document.querySelector("img")?.getAttribute("data-src"),
    );
    const tags = Array.from(
      new Set(
        Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href*='/genre/'], a[href*='/genres/']"))
          .map((anchor) => clean(anchor.textContent))
          .filter(Boolean),
      ),
    );
    const yearMatch = pageText.match(/\b(19|20)\d{2}\b/);
    const latestEpisodeMatch = pageText.match(/(?:sub|dub)?\s*ep(?:isode)?\s*0*(\d+(?:\.\d+)?)/i)
      ?? pageText.match(/latest(?:\s+episode)?\s*[:\-]?\s*0*(\d+(?:\.\d+)?)/i);
    const statusMatch = pageText.match(/status\s*[:\-]?\s*([^\n]+)/i);

    return {
      title,
      synopsis,
      coverImage,
      year: yearMatch ? Number.parseInt(yearMatch[0], 10) : null,
      statusText: clean(statusMatch?.[1] ?? ""),
      tags,
      episodes: Array.from(episodeMap.values()).sort((left, right) => left.number - right.number),
      latestEpisode: latestEpisodeMatch?.[1] ? Number.parseFloat(latestEpisodeMatch[1]) : null,
    };
  }, externalAnimeId);
}

async function lookupAnimeListingCard(
  page: PlaywrightPageLike,
  externalAnimeId: string,
  maxPages = MAX_LISTING_PAGES,
) {
  const seeds = deriveSearchSeeds(externalAnimeId, externalAnimeId);

  for (const seed of seeds) {
    for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
      await navigate(page, buildListingPath(seed, pageNumber), "listing");
      const listing = await scrapeListingPage(page, pageNumber);
      const match = listing.items.find((item) => item.externalAnimeId === externalAnimeId);
      if (match) {
        return match;
      }
      if (!listing.hasNextPage) {
        break;
      }
    }
  }

  return null;
}

async function extractPlaybackSnapshot(page: PlaywrightPageLike): Promise<AnimeTakePlaybackSnapshot> {
  return page.evaluate(() => {
    const clean = (value?: string | null) => value?.replace(/\s+/g, " ").trim() ?? "";
    const toAbsolute = (value?: string | null) => {
      const cleaned = clean(value);
      if (!cleaned) {
        return null;
      }

      try {
        return new URL(cleaned, location.origin).toString();
      } catch {
        return null;
      }
    };
    const urls = new Set<string>();
    const redirectUrls = new Set<string>();

    const addUrl = (value?: string | null) => {
      const absolute = toAbsolute(value);
      if (!absolute) {
        return;
      }

      if (/\/redirect/i.test(absolute)) {
        redirectUrls.add(absolute);
        return;
      }

      urls.add(absolute);
    };

    for (const element of Array.from(document.querySelectorAll<HTMLElement>("[src], [href], [data-src], [data-url], [data-embed], [data-stream]"))) {
      addUrl(element.getAttribute("src"));
      addUrl(element.getAttribute("href"));
      addUrl(element.getAttribute("data-src"));
      addUrl(element.getAttribute("data-url"));
      addUrl(element.getAttribute("data-embed"));
      addUrl(element.getAttribute("data-stream"));
    }

    const html = document.documentElement.outerHTML;
    for (const match of html.match(/https?:\/\/[^"'`\s)]+?\.(?:m3u8|mpd|mp4)(?:\?[^"'`\s)]*)?/gi) ?? []) {
      addUrl(match);
    }
    for (const match of html.match(/(?:https?:\/\/[^"'`\s)]+)?\/redirect[^"'`\s)]*/gi) ?? []) {
      addUrl(match);
    }

    return {
      title: document.title,
      bodyText: clean(document.body?.innerText),
      videoSources: Array.from(document.querySelectorAll<HTMLMediaElement>("video, source[src]"))
        .map((element) => toAbsolute(element.getAttribute("src")))
        .filter((value): value is string => typeof value === "string"),
      iframeSources: Array.from(document.querySelectorAll<HTMLIFrameElement>("iframe[src]"))
        .map((iframe) => toAbsolute(iframe.getAttribute("src")))
        .filter((value): value is string => typeof value === "string"),
      redirectUrls: Array.from(redirectUrls),
      inlineMediaUrls: Array.from(urls).filter((url) => /\.(?:m3u8|mpd|mp4)(?:\?|$)/i.test(url)),
      inlineRedirectUrls: Array.from(redirectUrls),
    };
  });
}

async function triggerPlayback(page: PlaywrightPageLike) {
  for (const selector of PLAY_BUTTON_SELECTORS) {
    await page.click(selector, { timeout: 1_500 }).catch(() => undefined);
    await page.waitForTimeout(800);
  }
}

export class AnimeTakeExtractor implements BrowserProviderExtractor {
  async search(input: SearchInput, runtime: ExtractionRuntime): Promise<SearchPage> {
    return runtime.withPage(async (page) => {
      const browserPage = page as unknown as PlaywrightPageLike;
      const matches: Array<AnimeTakeListingCard & { score: number }> = [];
      const seen = new Set<string>();
      const seeds = deriveSearchSeeds(input.query);

      for (const seed of seeds) {
        for (let pageNumber = 1; pageNumber <= MAX_LISTING_PAGES; pageNumber += 1) {
          await navigate(browserPage, buildListingPath(seed, pageNumber), "listing");
          const listing = await scrapeListingPage(browserPage, pageNumber);

          for (const item of listing.items) {
            if (seen.has(item.externalAnimeId)) {
              continue;
            }

            const score = rankTitleAgainstQuery(item.title, input.query);
            if (score === null) {
              continue;
            }

            seen.add(item.externalAnimeId);
            matches.push({ ...item, score });
          }

          if (!listing.hasNextPage) {
            break;
          }
        }
      }

      matches.sort((left, right) => {
        if (left.score !== right.score) {
          return right.score - left.score;
        }
        return left.title.localeCompare(right.title);
      });

      const start = (input.page - 1) * input.limit;
      const end = start + input.limit;
      const items = matches.slice(start, end).map((item) => ({
        providerId: runtime.providerId,
        providerDisplayName: PROVIDER_DISPLAY_NAME,
        externalAnimeId: item.externalAnimeId,
        title: item.title,
        synopsis: item.synopsis,
        coverImage: item.coverImage,
        year: null,
        kind: "unknown" as const,
        language: "en",
        contentClass: "anime" as const,
        requiresAdultGate: false,
      }));

      return {
        providerId: runtime.providerId,
        query: input.query,
        page: input.page,
        hasNextPage: end < matches.length,
        items,
      };
    });
  }

  async getAnime(input: ProviderAnimeRef, runtime: ExtractionRuntime): Promise<AnimeDetails> {
    return runtime.withPage(async (page) => {
      const browserPage = page as unknown as PlaywrightPageLike;
      await navigate(browserPage, buildAnimeUrl(input.externalAnimeId), "detail");
      const details = await scrapeAnimeDetailsPage(browserPage, input.externalAnimeId);

      if (!details.title) {
        throw new BrowserExtractionError(
          "upstream_error",
          `AnimeTake details page for "${input.externalAnimeId}" did not expose a title.`,
          { statusCode: 502 },
        );
      }

      const shouldUseListingFallback =
        details.latestEpisode === null &&
        details.episodes.length === 0 &&
        details.coverImage === null;
      const listingCard = shouldUseListingFallback
        ? await lookupAnimeListingCard(
            browserPage,
            input.externalAnimeId,
            DETAIL_FALLBACK_LISTING_PAGES,
          )
        : null;

      return {
        providerId: input.providerId,
        providerDisplayName: PROVIDER_DISPLAY_NAME,
        externalAnimeId: input.externalAnimeId,
        title: details.title,
        synopsis: details.synopsis,
        coverImage: details.coverImage ?? listingCard?.coverImage ?? null,
        bannerImage: null,
        status: mapStatus(details.statusText),
        year: details.year ?? parseYear(details.title),
        tags: details.tags,
        language: "en",
        totalEpisodes: Math.trunc(details.latestEpisode ?? listingCard?.latestEpisode ?? 0) || null,
        contentClass: "anime",
        requiresAdultGate: false,
      };
    });
  }

  async getEpisodes(input: ProviderAnimeRef, runtime: ExtractionRuntime): Promise<EpisodeList> {
    return runtime.withPage(async (page) => {
      const browserPage = page as unknown as PlaywrightPageLike;
      await navigate(browserPage, buildAnimeUrl(input.externalAnimeId), "detail");
      const details = await scrapeAnimeDetailsPage(browserPage, input.externalAnimeId);

      let episodes = details.episodes.map((episode) => ({
        providerId: input.providerId,
        externalAnimeId: input.externalAnimeId,
        externalEpisodeId: episode.externalEpisodeId,
        number: episode.number,
        title: episode.title || `Episode ${episode.number}`,
        synopsis: null,
        thumbnail: episode.thumbnail,
        durationSeconds: null,
        releasedAt: null,
      }));

      if (episodes.length === 0) {
        const listingCard = await lookupAnimeListingCard(
          browserPage,
          input.externalAnimeId,
          EPISODE_FALLBACK_LISTING_PAGES,
        );
        const totalEpisodes = Math.trunc(details.latestEpisode ?? listingCard?.latestEpisode ?? 0);
        if (totalEpisodes <= 0) {
          throw new BrowserExtractionError(
            "upstream_error",
            `AnimeTake did not expose an episode list for "${input.externalAnimeId}".`,
            { statusCode: 502 },
          );
        }

        episodes = Array.from({ length: totalEpisodes }, (_, index) => {
          const number = index + 1;
          return {
            providerId: input.providerId,
            externalAnimeId: input.externalAnimeId,
            externalEpisodeId: `${number}`,
            number,
            title: `Episode ${number}`,
            synopsis: null,
            thumbnail: listingCard?.coverImage ?? null,
            durationSeconds: null,
            releasedAt: null,
          };
        });
      }

      episodes.sort((left, right) => left.number - right.number);

      return {
        providerId: input.providerId,
        externalAnimeId: input.externalAnimeId,
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
      const episodeUrl = buildEpisodeUrl(input.externalAnimeId, input.externalEpisodeId);
      const defaultHeaders = {
        referer: episodeUrl,
        origin: BASE_URL,
      };
      const candidates = createPlaybackCandidateMap();

      browserPage.on("request", async (request) => {
        const url = request.url();
        if (!/\.(?:m3u8|mpd|mp4)(?:\?|$)/i.test(url) || shouldIgnorePlaybackUrl(url)) {
          return;
        }

        const headers = normalizeHeaders(await request.allHeaders().catch(() => ({})));
        candidates.add({
          id: `animetake-${candidates.values().length + 1}`,
          url,
          mimeType: guessMimeType(url),
          quality: inferQuality(url, /\.m3u8/i.test(url) ? "auto" : "default"),
          headers: { ...defaultHeaders, ...headers },
          proxyMode: "proxy",
          isDefault: true,
        });
      });

      browserPage.on("response", async (response) => {
        const url = response.url();
        if (response.status() >= 400 || shouldIgnorePlaybackUrl(url)) {
          return;
        }

        const headers = normalizeHeaders(await response.request().allHeaders().catch(() => ({})));
        if (/\.(?:m3u8|mpd|mp4)(?:\?|$)/i.test(url)) {
          candidates.add({
            id: `animetake-${candidates.values().length + 1}`,
            url,
            mimeType: guessMimeType(url),
            quality: inferQuality(url, /\.m3u8/i.test(url) ? "auto" : "default"),
            headers: { ...defaultHeaders, ...headers },
            proxyMode: "proxy",
            isDefault: true,
          });
          return;
        }

        if (!/(json|source|embed|player|redirect|watch|episode|ajax)/i.test(url)) {
          return;
        }

        const body = await response.text().catch(() => "");
        for (const match of body.match(MEDIA_URL_PATTERN) ?? []) {
          candidates.add({
            id: `animetake-${candidates.values().length + 1}`,
            url: match,
            mimeType: guessMimeType(match),
            quality: inferQuality(match, /\.m3u8/i.test(match) ? "auto" : "default"),
            headers: { ...defaultHeaders, ...headers },
            proxyMode: "proxy",
            isDefault: true,
          });
        }

        for (const match of body.match(REDIRECT_URL_PATTERN) ?? []) {
          const absoluteUrl = safeAbsoluteUrl(match);
          if (!absoluteUrl) {
            continue;
          }

          candidates.add({
            id: `animetake-${candidates.values().length + 1}`,
            url: absoluteUrl,
            mimeType: "text/html",
            quality: "embed",
            headers: {},
            proxyMode: "redirect",
            isDefault: false,
          });
        }
      });

      await navigate(browserPage, episodeUrl, "episode");
      await browserPage.waitForTimeout(2_000);
      await triggerPlayback(browserPage);
      await browserPage.waitForTimeout(3_000);

      const snapshot = await extractPlaybackSnapshot(browserPage);
      for (const url of [...snapshot.videoSources, ...snapshot.inlineMediaUrls]) {
        if (shouldIgnorePlaybackUrl(url)) {
          continue;
        }

        candidates.add({
          id: `animetake-${candidates.values().length + 1}`,
          url,
          mimeType: guessMimeType(url),
          quality: inferQuality(url, /\.m3u8/i.test(url) ? "auto" : "default"),
          headers: defaultHeaders,
          proxyMode: "proxy",
          isDefault: true,
        });
      }

      for (const url of [...snapshot.iframeSources, ...snapshot.redirectUrls, ...snapshot.inlineRedirectUrls]) {
        if (shouldIgnorePlaybackUrl(url)) {
          continue;
        }

        candidates.add({
          id: `animetake-${candidates.values().length + 1}`,
          url,
          mimeType: "text/html",
          quality: inferQuality(url, "embed"),
          headers: {},
          proxyMode: "redirect",
          isDefault: false,
        });
      }

      const ordered = candidates.values().sort((left, right) => {
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

        return left.url.localeCompare(right.url);
      });

      if (ordered.length === 0) {
        throw new BrowserExtractionError(
          "upstream_error",
          `AnimeTake did not expose a playable source for episode "${input.externalEpisodeId}".`,
          {
            statusCode: 502,
            details: {
              title: snapshot.title,
              sample: cleanText(snapshot.bodyText).slice(0, 240),
            },
          },
        );
      }

      const streams = ordered.slice(0, 4).map((candidate, index) => ({
        id: candidate.id,
        url: candidate.url,
        quality: candidate.quality,
        mimeType: candidate.mimeType,
        headers: candidate.headers,
        cookies: {},
        proxyMode: candidate.proxyMode,
        isDefault: index === 0,
      }));

      return {
        providerId: input.providerId,
        externalAnimeId: input.externalAnimeId,
        externalEpisodeId: input.externalEpisodeId,
        streams,
        subtitles: [],
        cookies: {},
        expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      };
    });
  }
}
