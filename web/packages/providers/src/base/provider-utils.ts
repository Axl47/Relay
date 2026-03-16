import type {
  AnimeDetails,
  EpisodeSummary,
  PlaybackResolution,
  ProviderHealth,
  ResolvedStream,
  SearchResult,
} from "@relay/contracts";

export const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";

export class ProviderRuntimeError extends Error {
  readonly providerId: string;
  readonly reason: ProviderHealth["reason"];

  constructor(providerId: string, reason: ProviderHealth["reason"], message: string) {
    super(message);
    this.name = "ProviderRuntimeError";
    this.providerId = providerId;
    this.reason = reason;
  }
}

export function cleanText(value?: string | null) {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

export function stripHtml(value?: string | null) {
  return cleanText(value?.replace(/<[^>]+>/g, " "));
}

export function absoluteUrl(baseUrl: string, value?: string | null) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return null;
  }
}

export function normalizePathId(baseUrl: string, value: string) {
  const url = new URL(value, baseUrl);
  return url.pathname.replace(/^\/+/, "").replace(/\/+$/, "");
}

export function extractIdAfterPrefix(baseUrl: string, value: string, prefix: string) {
  const path = normalizePathId(baseUrl, value);
  if (!path.startsWith(prefix)) {
    return path;
  }

  return path.slice(prefix.length).replace(/^\/+/, "").replace(/\/+$/, "");
}

export function parseInteger(value?: string | null) {
  if (!value) {
    return null;
  }

  const match = value.replace(/,/g, "").match(/-?\d+/);
  if (!match) {
    return null;
  }

  const parsed = Number.parseInt(match[0], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseYear(value?: string | null) {
  if (!value) {
    return null;
  }

  const match = value.match(/\b(19|20)\d{2}\b/);
  return match ? Number.parseInt(match[0], 10) : null;
}

export function parseNumber(value?: string | null) {
  if (!value) {
    return null;
  }

  const match = value.match(/\d+(?:\.\d+)?/);
  return match ? Number.parseFloat(match[0]) : null;
}

export function uniqueBy<T>(items: T[], getKey: (item: T) => string) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = getKey(item);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function detectMimeType(url: string): ResolvedStream["mimeType"] {
  if (/\.m3u8(?:$|\?)/i.test(url)) {
    return "application/vnd.apple.mpegurl";
  }

  if (/\.mpd(?:$|\?)/i.test(url)) {
    return "application/dash+xml";
  }

  if (
    /\.(?:mp4|m4v)(?:$|\?)/i.test(url) ||
    /(?:^|\/\/)[^/]*googlevideo\.com\/videoplayback(?:$|\?)/i.test(url)
  ) {
    return "video/mp4";
  }

  return "text/html";
}

export function createSearchResult(input: SearchResult): SearchResult {
  return input;
}

export function createAnimeDetails(input: AnimeDetails): AnimeDetails {
  return input;
}

export function createEpisode(input: EpisodeSummary): EpisodeSummary {
  return input;
}

export function createStream(input: ResolvedStream): ResolvedStream {
  return input;
}

export function createPlaybackResolution(input: PlaybackResolution): PlaybackResolution {
  return input;
}

export function createExpiresAt(minutesFromNow: number, now = new Date()) {
  return new Date(now.valueOf() + minutesFromNow * 60_000).toISOString();
}

export function looksLikeChallengePage(html: string) {
  const sample = html.toLowerCase();
  return (
    sample.includes("just a moment") ||
    sample.includes("cf-challenge") ||
    sample.includes("cloudflare") ||
    sample.includes("ddos-guard") ||
    sample.includes("checking your browser")
  );
}

export function decodeMaybeBase64(value: string) {
  try {
    return Buffer.from(value, "base64").toString("utf8");
  } catch {
    return value;
  }
}

export function ensureAbsoluteUrl(baseUrl: string, value?: string | null) {
  const resolved = absoluteUrl(baseUrl, value);
  if (!resolved) {
    throw new Error(`Unable to resolve URL from "${value ?? ""}" against "${baseUrl}".`);
  }
  return resolved;
}
