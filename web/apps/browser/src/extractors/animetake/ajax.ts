import { BrowserExtractionError } from "../../errors";
import type { AnimeTakeEpisodeInfoResponse, AnimeTakeServerSnapshot, PlaybackCandidate } from "./types";
import {
  ANIMETAKE_HTTP_USER_AGENT,
  BASE_URL,
  buildEpisodeUrl,
  cleanText,
  createPlaybackCandidateMap,
  guessMimeType,
  inferQuality,
  MEDIA_URL_PATTERN,
  REDIRECT_URL_PATTERN,
  safeAbsoluteUrl,
  shouldIgnorePlaybackUrl,
} from "./shared";
import { decodeHtmlEntities, extractHtmlAttribute, fetchAnimeTakeJson, fetchAnimeTakeResponseText } from "./http";

export function parseAnimeTakeServerSnapshot(
  html: string,
  externalAnimeId: string,
): AnimeTakeServerSnapshot {
  const servers = new Map<string, { name: string; id: string; type: string }>();
  for (const match of html.matchAll(/<div\b[^>]*class=(['"])[^"']*\bserver\b[^"']*\1[^>]*>/gi)) {
    const tag = match[0] ?? "";
    const name = extractHtmlAttribute(tag, "data-name");
    const id = extractHtmlAttribute(tag, "data-id");
    const type = extractHtmlAttribute(tag, "data-type");
    if (!name || !id) {
      continue;
    }

    servers.set(`${name}:${id}`, { name, id, type });
  }

  const episodes = new Map<string, { externalEpisodeId: string; number: number; title: string; href: string }>();
  const normalizedAnimeId = cleanText(externalAnimeId);
  for (const match of html.matchAll(/<a\b[^>]*href=(['"])([^"']*\/episode\/[^"']+)\1[^>]*>(.*?)<\/a>/gis)) {
    const hrefValue = decodeHtmlEntities(match[2] ?? "");
    const href = safeAbsoluteUrl(hrefValue, BASE_URL);
    if (!href) {
      continue;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(href);
    } catch {
      continue;
    }

    const episodeMatch = parsedUrl.pathname.match(/^\/anime\/([^/?#]+)\/episode\/([^/?#]+)/i);
    if (!episodeMatch?.[1] || !episodeMatch?.[2]) {
      continue;
    }

    const animeIdFromHref = decodeURIComponent(cleanText(episodeMatch[1]));
    if (animeIdFromHref && animeIdFromHref !== normalizedAnimeId) {
      continue;
    }

    const externalEpisodeId = decodeURIComponent(cleanText(episodeMatch[2]));
    const label = cleanText(decodeHtmlEntities((match[3] ?? "").replace(/<[^>]+>/g, " ")));
    const number =
      cleanText(externalEpisodeId).match(/\d+(?:\.\d+)?/)?.[0]
        ? Number.parseFloat(cleanText(externalEpisodeId).match(/\d+(?:\.\d+)?/)?.[0] ?? "")
        : null;
    const parsedNumber =
      number ?? (label.match(/\d+(?:\.\d+)?/)?.[0] ? Number.parseFloat(label.match(/\d+(?:\.\d+)?/)?.[0] ?? "") : null);
    if (parsedNumber === null || !Number.isFinite(parsedNumber)) {
      continue;
    }

    episodes.set(externalEpisodeId, {
      externalEpisodeId,
      number: parsedNumber,
      title: label || `Episode ${parsedNumber}`,
      href,
    });
  }

  return {
    servers: Array.from(servers.values()),
    episodes: Array.from(episodes.values()).sort((left, right) => left.number - right.number),
  };
}

export async function fetchAnimeTakeServerSnapshot(
  externalAnimeId: string,
  signal: AbortSignal,
): Promise<AnimeTakeServerSnapshot> {
  const url = `${BASE_URL}/ajax/film/sv?id=${encodeURIComponent(externalAnimeId)}`;
  const referer = buildEpisodeUrl(externalAnimeId, "1");
  const payload = await fetchAnimeTakeJson<{ html?: unknown }>(url, signal, referer);
  const html = typeof payload.html === "string" ? payload.html : "";
  if (!cleanText(html)) {
    throw new BrowserExtractionError(
      "upstream_error",
      `AnimeTake did not expose server HTML for anime "${externalAnimeId}".`,
      { statusCode: 502 },
    );
  }

  const snapshot = parseAnimeTakeServerSnapshot(html, externalAnimeId);
  if (snapshot.episodes.length === 0) {
    throw new BrowserExtractionError(
      "upstream_error",
      `AnimeTake did not expose episodes for anime "${externalAnimeId}".`,
      { statusCode: 502 },
    );
  }

  return snapshot;
}

export function resolveEpisodeIdFromSnapshot(
  snapshot: AnimeTakeServerSnapshot,
  requestedEpisodeId: string,
) {
  const requested = cleanText(requestedEpisodeId);
  const byId = snapshot.episodes.find((episode) => episode.externalEpisodeId === requested);
  if (byId) {
    return byId.externalEpisodeId;
  }

  const requestedNumber =
    requestedEpisodeId.match(/\d+(?:\.\d+)?/)?.[0]
      ? Number.parseFloat(requestedEpisodeId.match(/\d+(?:\.\d+)?/)?.[0] ?? "")
      : null;
  if (requestedNumber !== null) {
    const byNumber = snapshot.episodes.find((episode) => episode.number === requestedNumber);
    if (byNumber) {
      return byNumber.externalEpisodeId;
    }
  }

  return requested;
}

export function selectPreferredAnimeTakeServer(snapshot: AnimeTakeServerSnapshot) {
  const preferred = snapshot.servers.find((server) => !/\bads?\b/i.test(server.name)) ?? snapshot.servers[0];
  return preferred?.name ?? "vidstreaming.io";
}

export async function fetchAnimeTakeEpisodeInfo(
  externalAnimeId: string,
  externalEpisodeId: string,
  serverName: string,
  signal: AbortSignal,
) {
  const epr = `${externalAnimeId}/${externalEpisodeId}/${serverName}`;
  const params = new URLSearchParams({ epr });
  const url = `${BASE_URL}/ajax/episode/info?${params.toString()}`;
  const referer = buildEpisodeUrl(externalAnimeId, externalEpisodeId);
  const payload = await fetchAnimeTakeJson<AnimeTakeEpisodeInfoResponse>(url, signal, referer);

  return {
    grabber: safeAbsoluteUrl(payload.grabber, BASE_URL),
    params: payload.params ?? null,
    backup: typeof payload.backup === "number" ? payload.backup : null,
    target: safeAbsoluteUrl(payload.target, BASE_URL),
    type: cleanText(payload.type),
    name: cleanText(payload.name),
    subtitle: safeAbsoluteUrl(payload.subtitle, BASE_URL),
  };
}

export function addPlaybackCandidatesFromEpisodeInfo(
  candidates: ReturnType<typeof createPlaybackCandidateMap>,
  payload: Awaited<ReturnType<typeof fetchAnimeTakeEpisodeInfo>>,
  defaultHeaders: Record<string, string>,
) {
  const qualityHint = cleanText(payload.name);
  const typeHint = cleanText(payload.type).toLowerCase();

  if (payload.target && !shouldIgnorePlaybackUrl(payload.target)) {
    const mimeType =
      typeHint === "iframe" || guessMimeType(payload.target) === "text/html"
        ? "text/html"
        : guessMimeType(payload.target);
    const proxyMode = mimeType === "text/html" ? "redirect" : "proxy";

    candidates.add({
      id: `animetake-${candidates.values().length + 1}`,
      url: payload.target,
      mimeType,
      quality: inferQuality(
        `${qualityHint} ${payload.target}`,
        mimeType === "text/html" ? "embed" : "default",
      ),
      headers: proxyMode === "proxy" ? defaultHeaders : {},
      proxyMode,
      isDefault: true,
    });
  }

  const sample = JSON.stringify(payload);
  for (const match of sample.match(MEDIA_URL_PATTERN) ?? []) {
    if (shouldIgnorePlaybackUrl(match)) {
      continue;
    }

    candidates.add({
      id: `animetake-${candidates.values().length + 1}`,
      url: match,
      mimeType: guessMimeType(match),
      quality: inferQuality(match, /\.m3u8/i.test(match) ? "auto" : "default"),
      headers: defaultHeaders,
      proxyMode: "proxy",
      isDefault: false,
    });
  }

  for (const match of sample.match(REDIRECT_URL_PATTERN) ?? []) {
    const absoluteUrl = safeAbsoluteUrl(match, BASE_URL);
    if (!absoluteUrl || shouldIgnorePlaybackUrl(absoluteUrl)) {
      continue;
    }

    candidates.add({
      id: `animetake-${candidates.values().length + 1}`,
      url: absoluteUrl,
      mimeType: "text/html",
      quality: inferQuality(absoluteUrl, "embed"),
      headers: {},
      proxyMode: "redirect",
      isDefault: false,
    });
  }
}

export function orderPlaybackCandidates(candidates: PlaybackCandidate[]) {
  return [...candidates].sort((left, right) => {
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
}
