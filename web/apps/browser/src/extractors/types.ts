import type {
  AnimeDetails,
  EpisodeList,
  PlaybackResolution,
  ProviderAnimeRef,
  ProviderEpisodeRef,
  SearchInput,
  SearchPage,
} from "@relay/contracts";
import type { BrowserPage } from "../browser/playwright-runtime";

export interface ExtractionRuntime {
  readonly providerId: string;
  readonly domain: string;
  readonly signal: AbortSignal;
  withPage<T>(task: (page: BrowserPage) => Promise<T>): Promise<T>;
}

export interface BrowserProviderExtractor {
  search(input: SearchInput, runtime: ExtractionRuntime): Promise<SearchPage>;
  getAnime(input: ProviderAnimeRef, runtime: ExtractionRuntime): Promise<AnimeDetails>;
  getEpisodes(input: ProviderAnimeRef, runtime: ExtractionRuntime): Promise<EpisodeList>;
  resolvePlayback(
    input: ProviderEpisodeRef,
    runtime: ExtractionRuntime,
  ): Promise<PlaybackResolution>;
}
