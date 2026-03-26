const DEFAULT_STREAM_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";
const ABSOLUTE_UPSTREAM_PATH_PREFIX = "__upstream__/";
const ROOT_RELATIVE_UPSTREAM_PATH_PREFIX = "__root__/";
const PROXY_UPSTREAM_ALIAS_SUFFIX = "~relay";

export function getMediaProxyHeaders(url: URL) {
  const headers: Record<string, string> = {
    "user-agent": DEFAULT_STREAM_USER_AGENT,
    accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
  };

  if (url.hostname === "hanime-cdn.com" || url.hostname.endsWith(".hanime-cdn.com")) {
    headers.referer = "https://hanime.tv/";
    headers.origin = "https://hanime.tv";
  }

  if (url.hostname === "animetake.com.co" || url.hostname.endsWith(".animetake.com.co")) {
    headers.referer = "https://animetake.com.co/";
    headers.origin = "https://animetake.com.co";
  }

  return headers;
}

export function getSubtitleProxyHeaders(url: URL) {
  const headers: Record<string, string> = {
    "user-agent": DEFAULT_STREAM_USER_AGENT,
    "accept-language": "en-US,en;q=0.9",
  };

  if (url.hostname === "api.animeonsen.xyz" || url.hostname.endsWith(".animeonsen.xyz")) {
    headers.referer = "https://www.animeonsen.xyz/";
    headers.origin = "https://www.animeonsen.xyz";
  }

  return headers;
}

function getProxyUpstreamAlias(upstreamUrl: string) {
  try {
    const parsedUrl = new URL(upstreamUrl);
    const hostname = parsedUrl.hostname.toLowerCase();
    const pathname = parsedUrl.pathname.toLowerCase();

    if (
      hostname === "fdc.anpustream.com" &&
      (/\/snd\/(?:i\.mp4|snd\d+\.jpg)$/i.test(pathname) ||
        /\/(?:i\.mp4|ha\d+\.jpg)$/i.test(pathname))
    ) {
      return `${PROXY_UPSTREAM_ALIAS_SUFFIX}.mp4`;
    }

    if (hostname.endsWith(".owocdn.top") && /\/segment-\d+-v\d+-a\d+\.jpg$/i.test(pathname)) {
      return `${PROXY_UPSTREAM_ALIAS_SUFFIX}.ts`;
    }
  } catch {
    return "";
  }

  return "";
}

function encodeUpstreamUrlForPath(upstreamUrl: string) {
  return `b64.${Buffer.from(upstreamUrl, "utf8").toString("base64url")}`;
}

export function buildProxyStreamPath(sessionId: string, upstreamUrl: string) {
  return `/stream/${sessionId}/${ABSOLUTE_UPSTREAM_PATH_PREFIX}${encodeUpstreamUrlForPath(upstreamUrl)}${getProxyUpstreamAlias(upstreamUrl)}`;
}

function rewritePlaylistUri(value: string, baseUrl: string, sessionId: string) {
  const absoluteUrl = new URL(value, baseUrl).toString();
  return buildProxyStreamPath(sessionId, absoluteUrl);
}

function buildProxyRelativeStreamPath(sessionId: string, requestPath: string) {
  return `/stream/${sessionId}/${requestPath}`;
}

function rewriteDashManifestUri(value: string, baseUrl: string, sessionId: string) {
  const trimmed = value.trim();
  if (!trimmed || /^(?:data:|urn:|#)/i.test(trimmed)) {
    return value;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    if (!trimmed.includes("$")) {
      return buildProxyStreamPath(sessionId, trimmed);
    }

    try {
      const parsedUrl = new URL(trimmed);
      return buildProxyRelativeStreamPath(
        sessionId,
        `${ROOT_RELATIVE_UPSTREAM_PATH_PREFIX}${parsedUrl.pathname.replace(/^\/+/, "")}${parsedUrl.search}${parsedUrl.hash}`,
      );
    } catch {
      return value;
    }
  }

  if (trimmed.startsWith("/")) {
    return buildProxyRelativeStreamPath(
      sessionId,
      `${ROOT_RELATIVE_UPSTREAM_PATH_PREFIX}${trimmed.replace(/^\/+/, "")}`,
    );
  }

  return buildProxyRelativeStreamPath(sessionId, trimmed);
}

function stripHlsSubtitleRenditions(body: string) {
  return body
    .split("\n")
    .filter((line) => !/^#EXT-X-MEDIA:.*TYPE=SUBTITLES/i.test(line.trim()))
    .map((line) => {
      if (!line.startsWith("#EXT-X-STREAM-INF:")) {
        return line;
      }

      return line
        .replace(/,SUBTITLES="[^"]*"/g, "")
        .replace(/SUBTITLES="[^"]*",/g, "");
    })
    .join("\n");
}

export function rewriteHlsPlaylist(
  body: string,
  baseUrl: string,
  sessionId: string,
  options?: { stripSubtitleRenditions?: boolean },
) {
  const normalizedBody = options?.stripSubtitleRenditions ? stripHlsSubtitleRenditions(body) : body;

  return normalizedBody
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return line;
      }

      if (!trimmed.startsWith("#")) {
        return rewritePlaylistUri(trimmed, baseUrl, sessionId);
      }

      if (!trimmed.includes('URI="')) {
        return line;
      }

      return line.replace(/URI="([^"]+)"/g, (_match, uri: string) =>
        `URI="${rewritePlaylistUri(uri, baseUrl, sessionId)}"`,
      );
    })
    .join("\n");
}

export function rewriteDashManifest(body: string, baseUrl: string, sessionId: string) {
  return body
    .replace(/<BaseURL([^>]*)>([^<]+)<\/BaseURL>/g, (_match, attributes: string, uri: string) => {
      const rewrittenUri = rewriteDashManifestUri(uri, baseUrl, sessionId);
      return `<BaseURL${attributes}>${rewrittenUri}</BaseURL>`;
    })
    .replace(
      /\b(initialization|media|sourceURL|href|xlink:href)="([^"]+)"/g,
      (_match, attributeName: string, uri: string) =>
        `${attributeName}="${rewriteDashManifestUri(uri, baseUrl, sessionId)}"`,
    );
}

export function shouldRewriteHlsBody(upstreamUrl: string, contentType: string) {
  if (!/mpegurl/i.test(contentType)) {
    return false;
  }

  try {
    const pathname = new URL(upstreamUrl).pathname.toLowerCase();
    return pathname.endsWith(".m3u8") || pathname.endsWith(".m3u");
  } catch {
    return /\.m3u8?(?:\?|$)/i.test(upstreamUrl);
  }
}

export function shouldRewriteDashBody(upstreamUrl: string, contentType: string) {
  if (/dash\+xml/i.test(contentType)) {
    return true;
  }

  try {
    const pathname = new URL(upstreamUrl).pathname.toLowerCase();
    return pathname.endsWith(".mpd");
  } catch {
    return /\.mpd(?:\?|$)/i.test(upstreamUrl);
  }
}

export function normalizeStreamContentType(upstreamUrl: string, contentType: string) {
  const normalizedContentType = contentType.trim();

  try {
    const parsedUrl = new URL(upstreamUrl);
    const hostname = parsedUrl.hostname.toLowerCase();
    const pathname = parsedUrl.pathname.toLowerCase();

    if (hostname === "fdc.anpustream.com") {
      if (/\/snd\/(?:i\.mp4|snd\d+\.jpg)$/i.test(pathname)) {
        return "audio/mp4";
      }

      if (/\/(?:i\.mp4|ha\d+\.jpg)$/i.test(pathname)) {
        return "video/mp4";
      }
    }

    if (hostname.endsWith(".owocdn.top") && /\/segment-\d+-v\d+-a\d+\.jpg$/i.test(pathname)) {
      return "video/mp2t";
    }

    if (/mpegurl/i.test(normalizedContentType) && pathname.endsWith(".mp4")) {
      return "video/mp4";
    }
  } catch {
    if (/mpegurl/i.test(normalizedContentType) && /\.mp4(?:\?|$)/i.test(upstreamUrl)) {
      return "video/mp4";
    }
  }

  return normalizedContentType || "application/octet-stream";
}

export function buildPlaybackRequestHeaders(
  target: {
    headers: Record<string, string>;
    cookies: Record<string, string>;
  },
  options?: {
    range?: string | null;
  },
) {
  const cookieHeader = Object.entries(target.cookies)
    .map(([key, value]) => `${key}=${value}`)
    .join("; ");

  return {
    "user-agent": target.headers["user-agent"] ?? DEFAULT_STREAM_USER_AGENT,
    "accept-language": target.headers["accept-language"] ?? "en-US,en;q=0.9",
    ...target.headers,
    ...(options?.range ? { range: options.range } : {}),
    ...(cookieHeader ? { cookie: cookieHeader } : {}),
  };
}
