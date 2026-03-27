import type {
  PlaybackProxyMode,
  PlaybackSession,
  PlaybackSessionStatus,
} from "@relay/contracts";
import { appConfig } from "../config";
import type { PlaybackSessionRow } from "../repositories/playback-repository";

export type PlaybackSubtitleTrack = PlaybackSession["subtitles"][number];

export type StreamTarget = {
  sessionId: string;
  providerId: string;
  upstreamUrl: string;
  mimeType: string | null;
  proxyMode: PlaybackSession["proxyMode"];
  headers: Record<string, string>;
  cookies: Record<string, string>;
};

const ABSOLUTE_UPSTREAM_PATH_PREFIX = "__upstream__/";
const ROOT_RELATIVE_UPSTREAM_PATH_PREFIX = "__root__/";
const ABSOLUTE_UPSTREAM_ALIAS_SUFFIX_PATTERN = /~relay\.(?:mp4|ts|m3u8|m3u|vtt|srt|ass)$/i;

function getPlaybackSessionStreamUrl(
  sessionId: string,
  mimeType: string | null,
  upstreamUrl: string | null,
) {
  const normalizedMimeType = mimeType?.toLowerCase() ?? "";
  const isDashManifestMime = normalizedMimeType.includes("dash+xml");
  const isDashManifestUrl = upstreamUrl ? /\.mpd(?:\?|$)/i.test(upstreamUrl) : false;
  const suffix = isDashManifestMime || isDashManifestUrl ? "/" : "";
  return `${appConfig.PUBLIC_API_URL}/stream/${sessionId}${suffix}`;
}

function decodeAbsoluteUpstreamRequestPath(requestPath: string) {
  const encodedUrl = requestPath
    .slice(ABSOLUTE_UPSTREAM_PATH_PREFIX.length)
    .replace(ABSOLUTE_UPSTREAM_ALIAS_SUFFIX_PATTERN, "");
  if (encodedUrl.startsWith("b64.")) {
    return Buffer.from(encodedUrl.slice(4), "base64url").toString("utf8");
  }

  return decodeURIComponent(encodedUrl);
}

export function toPlaybackSession(row: PlaybackSessionRow): PlaybackSession {
  const expired = row.expiresAt <= new Date();
  const status =
    expired && row.status !== "failed"
      ? ("expired" as PlaybackSessionStatus)
      : (row.status as PlaybackSessionStatus);

  return {
    id: row.id,
    userId: row.userId,
    providerId: row.providerId,
    externalAnimeId: row.externalAnimeId,
    externalEpisodeId: row.externalEpisodeId,
    status,
    proxyMode: row.proxyMode as PlaybackProxyMode,
    streamUrl:
      status === "ready" && row.upstreamUrl
        ? getPlaybackSessionStreamUrl(row.id, row.mimeType ?? null, row.upstreamUrl)
        : null,
    mimeType: row.mimeType ?? null,
    subtitles: row.subtitles as PlaybackSession["subtitles"],
    headers: row.headers as PlaybackSession["headers"],
    expiresAt: row.expiresAt.toISOString(),
    positionSeconds: row.positionSeconds,
    error: row.error ?? null,
  };
}

export function shouldReusePlaybackSession(row: PlaybackSessionRow) {
  if (row.expiresAt <= new Date()) {
    return false;
  }

  if (row.status === "failed") {
    return false;
  }

  if (row.providerId === "hstream" && row.mimeType === "application/dash+xml") {
    return false;
  }

  if (
    row.providerId === "hstream" &&
    typeof row.upstreamUrl === "string" &&
    row.upstreamUrl.includes("komako-b-str.musume-h.xyz")
  ) {
    return false;
  }

  if (row.providerId === "hanime" && row.mimeType === "text/html") {
    return false;
  }

  if (
    row.providerId === "hanime" &&
    row.mimeType === "application/vnd.apple.mpegurl" &&
    row.proxyMode === "redirect"
  ) {
    return false;
  }

  if (
    row.providerId === "hentaihaven" &&
    (row.mimeType === "text/html" || row.proxyMode !== "proxy")
  ) {
    return false;
  }

  if (
    row.providerId === "javguru" &&
    (row.mimeType === "text/html" ||
      row.mimeType === "application/vnd.apple.mpegurl" ||
      (typeof row.upstreamUrl === "string" &&
        (row.upstreamUrl.includes("creative.mnaspm.com") ||
          row.upstreamUrl.includes("/searcho/"))))
  ) {
    return false;
  }

  if (
    row.providerId === "aniwave" &&
    typeof row.upstreamUrl === "string" &&
    row.upstreamUrl.includes("shipimagesbolt.online/embed-1/")
  ) {
    return false;
  }

  if (row.providerId === "animepahe" && row.mimeType === "application/vnd.apple.mpegurl") {
    return false;
  }

  return true;
}

export function toStreamTarget(
  row: PlaybackSessionRow,
  requestPath?: string | null,
): StreamTarget {
  const upstreamUrl =
    requestPath && requestPath.length > 0
      ? requestPath.startsWith(ABSOLUTE_UPSTREAM_PATH_PREFIX)
        ? decodeAbsoluteUpstreamRequestPath(requestPath)
        : requestPath.startsWith(ROOT_RELATIVE_UPSTREAM_PATH_PREFIX)
          ? new URL(
              requestPath.slice(ROOT_RELATIVE_UPSTREAM_PATH_PREFIX.length),
              `${new URL(row.upstreamUrl ?? "").origin}/`,
            ).toString()
          : new URL(requestPath, row.upstreamUrl ?? "").toString()
      : (row.upstreamUrl ?? "");

  return {
    sessionId: row.id,
    providerId: row.providerId,
    upstreamUrl,
    mimeType: row.mimeType ?? null,
    proxyMode: row.proxyMode as PlaybackProxyMode,
    headers: row.headers as Record<string, string>,
    cookies: row.cookies as Record<string, string>,
  };
}

export function resolvePlaybackSubtitleTrack(
  row: PlaybackSessionRow,
  index: number,
): PlaybackSubtitleTrack {
  if (!Number.isInteger(index) || index < 0) {
    throw Object.assign(new Error("Subtitle track index must be a non-negative integer"), {
      statusCode: 400,
    });
  }

  const subtitles = row.subtitles as PlaybackSession["subtitles"];
  const subtitle = subtitles[index];
  if (!subtitle) {
    throw Object.assign(new Error("Subtitle track not found"), { statusCode: 404 });
  }

  return subtitle;
}
