import type { AnimeDetails } from "@relay/contracts";
import { cleanText, compactSearchValue, normalizeSearchValue, safeAbsoluteUrl } from "../common/text";
import type { PlaybackCandidate, PlaybackMimeType } from "./types";

export const BASE_URL = "https://animetake.com.co";
export const PROVIDER_DISPLAY_NAME = "AnimeTake";
const CHALLENGE_MARKERS = [
  "just a moment",
  "performing security verification",
  "enable javascript and cookies to continue",
  "checking your browser before accessing",
];
export const PLAY_BUTTON_SELECTORS = [
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
export const MEDIA_URL_PATTERN =
  /https?:\/\/[^"'`\s)]+?\.(?:m3u8|mpd|mp4)(?:\?[^"'`\s)]*)?/gi;
export const REDIRECT_URL_PATTERN = /(?:https?:\/\/[^"'`\s)]+)?\/redirect[^"'`\s)]*/gi;
const SEARCH_STOP_WORDS = new Set(["the", "a", "an"]);
export const MAX_LISTING_PAGES = 12;
export const DETAIL_FALLBACK_LISTING_PAGES = 2;
export const EPISODE_FALLBACK_LISTING_PAGES = 4;
export const CHALLENGE_GRACE_TIMEOUT_MS = {
  home: 30_000,
  listing: 30_000,
  search: 18_000,
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
export const ANIMETAKE_HTTP_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:148.0) Gecko/20100101 Firefox/148.0";
const VARIANT_TITLE_TERMS = new Set([
  "dub",
  "dubbed",
  "movie",
  "special",
  "specials",
  "ova",
  "ona",
  "zero",
  "part",
  "season",
]);

export function stripVariantTerms(value: string) {
  return value
    .replace(/\b(?:dub|dubbed|movie|specials?|ova|ona|zero|part|season)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function rankTitleAgainstQuery(title: string, query: string) {
  const normalizedTitle = normalizeSearchValue(title);
  const normalizedQuery = normalizeSearchValue(query);
  const compactTitle = compactSearchValue(title);
  const compactQuery = compactSearchValue(query);
  const tokens = normalizedQuery.split(" ").filter(Boolean);
  const queryTokenSet = new Set(tokens);

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

  const canonicalTitle = stripVariantTerms(normalizedTitle);
  const canonicalMatch = canonicalTitle === normalizedQuery;
  const variantPenalty = Array.from(VARIANT_TITLE_TERMS).some(
    (term) => normalizedTitle.includes(term) && !queryTokenSet.has(term),
  )
    ? -850
    : 0;

  return (
    (exactMatch ? 5_000 : 0) +
    (phraseMatch ? 2_000 : 0) +
    (compactMatch ? 1_000 : 0) +
    (canonicalMatch ? 1_800 : 0) +
    matchedTokens.length * 150 +
    variantPenalty
  );
}

export function parseEpisodeNumber(value?: string | null) {
  const cleaned = cleanText(value);
  if (!cleaned) {
    return null;
  }

  const match =
    cleaned.match(/episode\s*0*(\d+(?:\.\d+)?)/i) ??
    cleaned.match(/\bep(?:isode)?\.?\s*0*(\d+(?:\.\d+)?)/i) ??
    cleaned.match(/\b0*(\d+(?:\.\d+)?)\b/);
  if (!match?.[1]) {
    return null;
  }

  const parsed = Number.parseFloat(match[1]);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function parseYear(value?: string | null) {
  const match = cleanText(value).match(/\b(19|20)\d{2}\b/);
  if (!match) {
    return null;
  }

  const parsed = Number.parseInt(match[0], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function mapStatus(value?: string | null): AnimeDetails["status"] {
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

export function looksLikeChallenge(sample: string) {
  const normalized = sample.toLowerCase();
  return CHALLENGE_MARKERS.some((marker) => normalized.includes(marker));
}

export function normalizeHeaders(headers: Record<string, string>) {
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

export function buildListingPath(seed: string, page: number) {
  const safeSeed = encodeURIComponent(seed);
  return `/az-all-anime/${safeSeed}${page > 1 ? `?page=${page}` : ""}`;
}

export function buildSearchUrl(query: string, page = 1) {
  const params = new URLSearchParams({
    keyword: query,
  });
  if (page > 1) {
    params.set("page", `${page}`);
  }
  return `${BASE_URL}/search?${params.toString()}`;
}

export function buildAnimeUrl(slug: string) {
  return `${BASE_URL}/anime/${encodeURIComponent(slug)}/`;
}

export function buildEpisodeUrl(slug: string, episodeId: string) {
  return `${BASE_URL}/anime/${encodeURIComponent(slug)}/episode/${encodeURIComponent(episodeId)}`;
}

export function deriveSearchSeeds(query: string, fallbackValue?: string | null) {
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

export function guessMimeType(url: string): PlaybackMimeType {
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

export function inferQuality(value: string, fallback = "default") {
  const cleaned = cleanText(value);
  const qualityMatch =
    cleaned.match(/\b(2160|1440|1080|720|480|360)p\b/i) ??
    cleaned.match(/\b(2160|1440|1080|720|480|360)\b/i);
  if (qualityMatch?.[1]) {
    return `${qualityMatch[1]}p`;
  }
  if (/master|auto/i.test(cleaned)) {
    return "auto";
  }
  return fallback;
}

export function shouldIgnorePlaybackUrl(url: string) {
  return IGNORED_PLAYBACK_HOST_PATTERNS.some((pattern) => pattern.test(url));
}

export function createPlaybackCandidateMap() {
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

export { cleanText, safeAbsoluteUrl };
