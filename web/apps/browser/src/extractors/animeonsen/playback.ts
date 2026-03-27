import type { PlaybackResolution, ProviderEpisodeRef } from "@relay/contracts";
import { BrowserExtractionError } from "../../errors";
import { parseStreams, parseSubtitleTracks } from "./payload";
import { API_BASE_URL, BASE_URL, CONTENT_API_BEARER_TOKEN } from "./shared";

export async function fetchAnimeOnsenPlaybackPayload(
  externalAnimeId: string,
  externalEpisodeId: string,
  signal: AbortSignal,
) {
  const response = await fetch(
    `${API_BASE_URL}/v4/content/${encodeURIComponent(externalAnimeId)}/video/${encodeURIComponent(externalEpisodeId)}`,
    {
      method: "GET",
      signal,
      headers: {
        accept: "application/json, text/plain, */*",
        authorization: `Bearer ${CONTENT_API_BEARER_TOKEN}`,
        origin: BASE_URL,
        referer: `${BASE_URL}/`,
      },
    },
  );

  if (!response.ok) {
    throw new BrowserExtractionError(
      "upstream_error",
      `AnimeOnsen video API failed with status ${response.status} for episode "${externalEpisodeId}".`,
      { statusCode: 502 },
    );
  }

  try {
    return (await response.json()) as unknown;
  } catch (error) {
    throw new BrowserExtractionError(
      "upstream_error",
      `AnimeOnsen video API returned invalid JSON for episode "${externalEpisodeId}".`,
      { statusCode: 502, cause: error },
    );
  }
}

export async function resolveAnimeOnsenPlayback(
  input: ProviderEpisodeRef,
  signal: AbortSignal,
): Promise<PlaybackResolution> {
  const payload = await fetchAnimeOnsenPlaybackPayload(
    input.externalAnimeId,
    input.externalEpisodeId,
    signal,
  );

  const streams = parseStreams(payload);
  if (streams.length === 0) {
    throw new BrowserExtractionError(
      "upstream_error",
      `AnimeOnsen did not expose a playable stream for episode "${input.externalEpisodeId}".`,
      { statusCode: 502 },
    );
  }

  const subtitles = parseSubtitleTracks(payload);

  return {
    providerId: input.providerId,
    externalAnimeId: input.externalAnimeId,
    externalEpisodeId: input.externalEpisodeId,
    streams: streams.map((stream, index) => ({
      id: `animeonsen-${index + 1}`,
      url: stream.url,
      quality: stream.quality,
      mimeType: stream.mimeType,
      headers: {},
      cookies: {},
      proxyMode: "proxy",
      isDefault: index === 0,
    })),
    subtitles,
    cookies: {},
    expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
  };
}
