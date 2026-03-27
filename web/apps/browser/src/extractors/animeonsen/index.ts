import type {
  AnimeDetails,
  EpisodeList,
  PlaybackResolution,
  ProviderAnimeRef,
  ProviderEpisodeRef,
  SearchInput,
  SearchPage,
} from "@relay/contracts";
import type { BrowserProviderExtractor, ExtractionRuntime } from "../types";
import { fetchAnimeOnsenEpisodes } from "./episodes";
import { getAnimeOnsenAnime } from "./page-fallback";
import { resolveAnimeOnsenPlayback } from "./playback";
import { searchAnimeOnsenCatalog } from "./search-api";

export class AnimeOnsenExtractor implements BrowserProviderExtractor {
  search(input: SearchInput, runtime: ExtractionRuntime): Promise<SearchPage> {
    return searchAnimeOnsenCatalog(input, runtime.signal);
  }

  getAnime(input: ProviderAnimeRef, runtime: ExtractionRuntime): Promise<AnimeDetails> {
    return getAnimeOnsenAnime(input, runtime);
  }

  getEpisodes(input: ProviderAnimeRef, runtime: ExtractionRuntime): Promise<EpisodeList> {
    return fetchAnimeOnsenEpisodes(input.providerId, input.externalAnimeId, runtime.signal);
  }

  resolvePlayback(
    input: ProviderEpisodeRef,
    runtime: ExtractionRuntime,
  ): Promise<PlaybackResolution> {
    return resolveAnimeOnsenPlayback(input, runtime.signal);
  }
}
