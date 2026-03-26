import { decodeRouteParam, encodeExternalIdPath } from "./routes";

type OriginalAnimeUrlInput = {
  providerId: string;
  externalAnimeId: string;
  firstEpisodeId?: string | null;
};

export function buildOriginalAnimeUrl(input: OriginalAnimeUrlInput) {
  const encodedAnimeId = encodeExternalIdPath(input.externalAnimeId);

  switch (input.providerId) {
    case "aki-h":
      return `https://aki-h.com/${encodedAnimeId}/`;
    case "aniwave":
      return `https://aniwaves.ru/watch/${encodedAnimeId}`;
    case "animeonsen":
      return `https://www.animeonsen.xyz/watch/${encodedAnimeId}?episode=1`;
    case "animepahe":
      return `https://animepahe.si/anime/${encodedAnimeId}`;
    case "animetake":
      return `https://animetake.com.co/anime/${encodedAnimeId}/`;
    case "gogoanime":
      return `https://gogoanime.by/series/${encodedAnimeId}/`;
    case "hanime": {
      const firstEpisodeId = input.firstEpisodeId ? encodeExternalIdPath(input.firstEpisodeId) : "";
      return firstEpisodeId ? `https://hanime.tv/videos/hentai/${firstEpisodeId}` : null;
    }
    case "hentaihaven":
      return `https://hentaihaven.xxx/watch/${encodedAnimeId}/`;
    case "hstream":
      return `https://hstream.moe/hentai/${encodedAnimeId}`;
    case "javguru":
      return `https://jav.guru/${encodedAnimeId}/`;
    default:
      return null;
  }
}

export { decodeRouteParam };
