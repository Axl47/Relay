import type { EpisodeList } from "@relay/contracts";
import { BrowserExtractionError } from "../../errors";
import type { AnimeOnsenEpisodesApiResponse } from "./types";
import { API_BASE_URL, CONTENT_API_BEARER_TOKEN, buildAnimeOnsenImageUrl, parseEpisodeNumber, cleanText } from "./shared";

export function parseEpisodesApiPayload(
  providerId: string,
  externalAnimeId: string,
  body: string,
): EpisodeList {
  let payload: AnimeOnsenEpisodesApiResponse;
  try {
    payload = JSON.parse(body) as AnimeOnsenEpisodesApiResponse;
  } catch (error) {
    throw new BrowserExtractionError(
      "upstream_error",
      `AnimeOnsen episodes API returned invalid JSON for anime "${externalAnimeId}".`,
      { statusCode: 502, cause: error },
    );
  }

  const episodes = Object.entries(payload)
    .map(([episodeId, value]) => {
      const number = parseEpisodeNumber(episodeId);
      if (number === null) {
        return null;
      }

      const title =
        cleanText(value?.contentTitle_episode_en) ||
        cleanText(value?.contentTitle_episode_jp) ||
        `Episode ${number}`;

      return {
        providerId,
        externalAnimeId,
        externalEpisodeId: episodeId,
        number,
        title,
        synopsis: null,
        seasonNumber: null,
        episodeNumber: number,
        thumbnail: buildAnimeOnsenImageUrl(externalAnimeId, "640x360"),
        durationSeconds: null,
        releasedAt: null,
      };
    })
    .filter(
      (
        episode,
      ): episode is {
        providerId: string;
        externalAnimeId: string;
        externalEpisodeId: string;
        number: number;
        title: string;
        synopsis: null;
        seasonNumber: null;
        episodeNumber: number;
        thumbnail: string;
        durationSeconds: null;
        releasedAt: null;
      } => episode !== null,
    )
    .sort((left, right) => left.number - right.number);

  if (episodes.length === 0) {
    throw new BrowserExtractionError(
      "upstream_error",
      `AnimeOnsen episodes API returned no episodes for anime "${externalAnimeId}".`,
      { statusCode: 502 },
    );
  }

  return {
    providerId,
    externalAnimeId,
    episodes,
  };
}

export async function fetchAnimeOnsenEpisodes(
  providerId: string,
  externalAnimeId: string,
  signal: AbortSignal,
): Promise<EpisodeList> {
  const response = await fetch(
    `${API_BASE_URL}/v4/content/${encodeURIComponent(externalAnimeId)}/episodes`,
    {
      method: "GET",
      signal,
      headers: {
        accept: "application/json, text/plain, */*",
        authorization: `Bearer ${CONTENT_API_BEARER_TOKEN}`,
        origin: "https://www.animeonsen.xyz",
        referer: "https://www.animeonsen.xyz/",
      },
    },
  );

  if (!response.ok) {
    throw new BrowserExtractionError(
      "upstream_error",
      `AnimeOnsen episodes API failed with status ${response.status} for anime "${externalAnimeId}".`,
      { statusCode: 502 },
    );
  }

  return parseEpisodesApiPayload(providerId, externalAnimeId, await response.text());
}
