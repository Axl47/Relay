import type { AnimeDetails } from "@relay/contracts";
import { cleanText, compactSearchValue, normalizeSearchValue } from "../common/text";
import type { AnimePaheEpisodeEntry } from "./types";

export const ANIMEPAHE_CHALLENGE_MARKERS = [
  "checking your browser before accessing",
  "please wait a few seconds. once this check is complete",
  "ddos-guard",
];

export function parseInteger(value?: string | null) {
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

export function parseDurationSeconds(value?: string | null) {
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

export function mapAnimeKind(value?: string | null) {
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

export function mapAnimeStatus(value?: string | null): AnimeDetails["status"] {
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

export function rankAnimePaheSearchMatch(title: string, query: string) {
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

export function buildEpisodeTitle(entry: AnimePaheEpisodeEntry) {
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

export function normalizeHeaders(headers: Record<string, string>) {
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
