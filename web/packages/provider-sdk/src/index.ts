import type {
  AnimeDetails,
  EpisodeList,
  PlaybackResolution,
  ProviderAnimeRef,
  ProviderEpisodeRef,
  SearchInput,
  SearchPage,
} from "@relay/contracts";
import {
  animeDetailsSchema,
  episodeListSchema,
  playbackResolutionSchema,
  searchPageSchema,
} from "@relay/contracts";

export interface RelayProvider {
  id: string;
  displayName: string;
  supportsSearch: boolean;
  search(input: SearchInput): Promise<SearchPage>;
  getAnime(input: ProviderAnimeRef): Promise<AnimeDetails>;
  getEpisodes(input: ProviderAnimeRef): Promise<EpisodeList>;
  resolvePlayback(input: ProviderEpisodeRef): Promise<PlaybackResolution>;
  refreshLibraryItem(input: ProviderAnimeRef): Promise<LibraryRefreshResult>;
}

export interface LibraryRefreshResult {
  providerId: string;
  externalAnimeId: string;
  refreshedAt: string;
  discoveredEpisodes: number;
  totalEpisodes: number;
}

export class ProviderRegistry {
  private readonly providers = new Map<string, RelayProvider>();

  register(provider: RelayProvider) {
    this.providers.set(provider.id, provider);
  }

  get(providerId: string) {
    return this.providers.get(providerId) ?? null;
  }

  list() {
    return Array.from(this.providers.values());
  }
}

export async function assertProviderContract(provider: RelayProvider) {
  const search = await provider.search({ query: "test", page: 1, limit: 5 });
  searchPageSchema.parse(search);

  const firstAnime = search.items[0];
  if (!firstAnime) {
    throw new Error(`Provider "${provider.id}" returned no search results for contract validation.`);
  }

  const animeRef = {
    providerId: firstAnime.providerId,
    externalAnimeId: firstAnime.externalAnimeId,
  };
  const anime = await provider.getAnime(animeRef);
  animeDetailsSchema.parse(anime);

  const episodes = await provider.getEpisodes(animeRef);
  episodeListSchema.parse(episodes);

  const firstEpisode = episodes.episodes[0];
  if (!firstEpisode) {
    throw new Error(`Provider "${provider.id}" returned no episodes for contract validation.`);
  }

  const playback = await provider.resolvePlayback({
    providerId: firstEpisode.providerId,
    externalAnimeId: firstEpisode.externalAnimeId,
    externalEpisodeId: firstEpisode.externalEpisodeId,
  });
  playbackResolutionSchema.parse(playback);
}
