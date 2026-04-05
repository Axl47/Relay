import { BrowserExtractionError } from "../../errors";
import { cleanText, compactSearchValue, normalizeSearchValue, safeAbsoluteUrl } from "../common/text";
import type { PlaywrightPageLike } from "../common/playwright-types";
import type { StreamMimeType, SubtitleCandidate } from "./types";

export const BASE_URL = "https://hentaihaven.xxx";
export const PROVIDER_ID = "hentaihaven";
export const PROVIDER_DISPLAY_NAME = "HentaiHaven";
export const SEARCH_PAGE_SIZE = 25;
export const PLAYER_API_URL = `${BASE_URL}/wp-content/plugins/player-logic/api.php`;
const CHALLENGE_MARKERS = [
  "just a moment",
  "performing security verification",
  "checking your browser before accessing",
  "enable javascript and cookies to continue",
];

export function parseYear(value?: string | null) {
  const matches = cleanText(value).match(/\b(19|20)\d{2}\b/g);
  if (!matches || matches.length === 0) {
    return null;
  }

  const parsed = matches
    .map((entry) => Number.parseInt(entry, 10))
    .filter((entry) => Number.isFinite(entry));

  return parsed.length > 0 ? Math.min(...parsed) : null;
}

export function parseReleasedAt(value?: string | null) {
  const cleaned = cleanText(value);
  if (!cleaned) {
    return null;
  }

  const parsed = new Date(cleaned);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function parseEpisodeNumber(value?: string | null) {
  const cleaned = cleanText(value);
  if (!cleaned) {
    return null;
  }

  const match =
    cleaned.match(/episode\s*0*(\d+(?:\.\d+)?)/i) ?? cleaned.match(/\b0*(\d+(?:\.\d+)?)\b/);
  if (!match?.[1]) {
    return null;
  }

  const parsed = Number.parseFloat(match[1]);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function normalizeAnimeId(value: string) {
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

export function normalizeEpisodeId(value: string, animeId?: string) {
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

export function buildSearchUrl(query: string, page: number) {
  const encodedQuery = encodeURIComponent(query).replace(/%20/g, "+");
  const suffix = page > 1 ? `page/${page}/` : "";
  return `${BASE_URL}/search/${encodedQuery}/${suffix}`;
}

export function buildAnimeUrl(animeId: string) {
  return `${BASE_URL}/watch/${encodeURIComponent(normalizeAnimeId(animeId))}/`;
}

export function buildEpisodeUrl(animeId: string, episodeId: string) {
  return `${buildAnimeUrl(animeId)}${encodeURIComponent(normalizeEpisodeId(episodeId, animeId))}/`;
}

export function guessMimeType(type?: string | null, url?: string | null): StreamMimeType {
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

export function inferQuality(value: string, fallback = "default") {
  const cleaned = cleanText(value);
  const qualityMatch =
    cleaned.match(/\b(2160|1440|1080|720|480|360)p\b/i) ??
    cleaned.match(/\b(2160|1440|1080|720|480|360)\b/i);
  if (qualityMatch?.[1]) {
    return `${qualityMatch[1]}p`;
  }
  if (/auto|master/i.test(cleaned)) {
    return "auto";
  }
  return fallback;
}

export function parseTotalPages(title: string, bodyText: string, itemsPerPage: number) {
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

export function buildSubtitleLabel(language: string) {
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

export function parseSubtitleCandidate(url: string): SubtitleCandidate | null {
  const cleanedUrl = cleanText(url);
  if (!cleanedUrl) {
    return null;
  }

  const parsedUrl = safeAbsoluteUrl(cleanedUrl, BASE_URL);
  if (!parsedUrl) {
    return null;
  }

  if (/\.ass(?:\?|$)/i.test(parsedUrl)) {
    const language =
      parsedUrl.match(/\/([a-z]{2,3})(?:\.[^./?#]+)?(?:\?|$)/i)?.[1]?.toLowerCase() ?? "und";
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

export function shouldCaptureDirectMedia(url: string) {
  const normalized = cleanText(url).toLowerCase();
  if (!normalized) {
    return false;
  }

  if (!/\.m3u8(?:\?|$)|\.mpd(?:\?|$)|\.mp4(?:\?|$)/i.test(normalized)) {
    return false;
  }

  if (
    /\.m3u8(?:\?|$)/i.test(normalized) &&
    !/\/playlist(?:_[^/]+)?\.m3u8(?:\?|$)/i.test(normalized)
  ) {
    return false;
  }

  return !(
    /\/snd\//.test(normalized) ||
    /\/s\//.test(normalized) ||
    /\/i\.mp4(?:\?|$)/.test(normalized) ||
    /preview\.mp4(?:\?|$)/.test(normalized)
  );
}

export async function waitForHentaiHavenReady(
  page: PlaywrightPageLike,
  mode: "search" | "anime" | "episode",
  targetPath: string,
  timeoutMs = 25_000,
) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const state = await page
      .evaluate(() => ({
        title: document.title,
        bodyText: document.body?.innerText ?? "",
        readyState: document.readyState,
        searchCards: document.querySelectorAll(".page-item-detail.video, .c-tabs-item__content")
          .length,
        metaItems: document.querySelectorAll(".post-content_item").length,
        episodeItems: document.querySelectorAll(".wp-manga-chapter").length,
        playerFrames: document.querySelectorAll(
          ".player_logic_item iframe[src*='player.php?data=']",
        ).length,
        heading: (document.querySelector("h1")?.textContent ?? "")
          .replace(/\s+/g, " ")
          .trim(),
      }))
      .catch(() => ({
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

export { cleanText, compactSearchValue, normalizeSearchValue, safeAbsoluteUrl };
