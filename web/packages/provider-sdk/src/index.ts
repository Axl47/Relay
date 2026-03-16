import type {
  AnimeDetails,
  EpisodeList,
  PlaybackResolution,
  ProviderAnimeRef,
  ProviderEpisodeRef,
  ProviderHealth,
  ProviderMetadata,
  SearchInput,
  SearchPage,
} from "@relay/contracts";
import {
  animeDetailsSchema,
  episodeListSchema,
  playbackResolutionSchema,
  providerHealthSchema,
  providerMetadataSchema,
  searchPageSchema,
} from "@relay/contracts";

export interface BrowserBrokerClient {
  extractSearch(providerId: string, input: SearchInput, signal?: AbortSignal): Promise<SearchPage>;
  extractAnime(
    providerId: string,
    input: ProviderAnimeRef,
    signal?: AbortSignal,
  ): Promise<AnimeDetails>;
  extractEpisodes(
    providerId: string,
    input: ProviderAnimeRef,
    signal?: AbortSignal,
  ): Promise<EpisodeList>;
  extractPlayback(
    providerId: string,
    input: ProviderEpisodeRef,
    signal?: AbortSignal,
  ): Promise<PlaybackResolution>;
}

export interface ProviderRequestContext {
  fetch: typeof fetch;
  signal?: AbortSignal;
  browser: BrowserBrokerClient | null;
  now: () => Date;
}

export interface RelayProvider {
  metadata: ProviderMetadata;
  search(input: SearchInput, ctx: ProviderRequestContext): Promise<SearchPage>;
  getAnime(input: ProviderAnimeRef, ctx: ProviderRequestContext): Promise<AnimeDetails>;
  getEpisodes(input: ProviderAnimeRef, ctx: ProviderRequestContext): Promise<EpisodeList>;
  resolvePlayback(
    input: ProviderEpisodeRef,
    ctx: ProviderRequestContext,
  ): Promise<PlaybackResolution>;
  refreshLibraryItem(
    input: ProviderAnimeRef,
    ctx: ProviderRequestContext,
  ): Promise<LibraryRefreshResult>;
}

export interface LibraryRefreshResult {
  providerId: string;
  externalAnimeId: string;
  refreshedAt: string;
  discoveredEpisodes: number;
  totalEpisodes: number;
}

export type ProviderRequestContextInput = Partial<ProviderRequestContext>;

export function createProviderRequestContext(
  input: ProviderRequestContextInput = {},
): ProviderRequestContext {
  return {
    fetch: input.fetch ?? globalThis.fetch.bind(globalThis),
    signal: input.signal,
    browser: input.browser ?? null,
    now: input.now ?? (() => new Date()),
  };
}

export class ProviderRegistry {
  private readonly providers = new Map<string, RelayProvider>();

  register(provider: RelayProvider) {
    providerMetadataSchema.parse(provider.metadata);
    this.providers.set(provider.metadata.id, provider);
  }

  get(providerId: string) {
    return this.providers.get(providerId) ?? null;
  }

  list() {
    return Array.from(this.providers.values());
  }

  metadata() {
    return this.list().map((provider) => provider.metadata);
  }
}

export async function assertProviderContract(
  provider: RelayProvider,
  ctx = createProviderRequestContext(),
) {
  providerMetadataSchema.parse(provider.metadata);

  const search = await provider.search({ query: "test", page: 1, limit: 5 }, ctx);
  searchPageSchema.parse(search);

  const firstAnime = search.items[0];
  if (!firstAnime) {
    throw new Error(
      `Provider "${provider.metadata.id}" returned no search results for contract validation.`,
    );
  }

  const animeRef = {
    providerId: firstAnime.providerId,
    externalAnimeId: firstAnime.externalAnimeId,
  };
  const anime = await provider.getAnime(animeRef, ctx);
  animeDetailsSchema.parse(anime);

  const episodes = await provider.getEpisodes(animeRef, ctx);
  episodeListSchema.parse(episodes);

  const firstEpisode = episodes.episodes[0];
  if (!firstEpisode) {
    throw new Error(
      `Provider "${provider.metadata.id}" returned no episodes for contract validation.`,
    );
  }

  const playback = await provider.resolvePlayback(
    {
      providerId: firstEpisode.providerId,
      externalAnimeId: firstEpisode.externalAnimeId,
      externalEpisodeId: firstEpisode.externalEpisodeId,
    },
    ctx,
  );
  playbackResolutionSchema.parse(playback);
}

export function createHealthyProviderHealth(providerId: string): ProviderHealth {
  return providerHealthSchema.parse({
    providerId,
    status: "healthy",
    reason: "ok",
    checkedAt: new Date().toISOString(),
  });
}
