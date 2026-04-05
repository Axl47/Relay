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
import { getAnimePaheEpisodes, searchAnimePahe } from "./api";
import { getAnimePaheAnime } from "./details";
import { resolveAnimePahePlayback } from "./playback";

export class AnimePaheExtractor implements BrowserProviderExtractor {
  search(input: SearchInput, runtime: ExtractionRuntime): Promise<SearchPage> {
    return searchAnimePahe(input, runtime);
  }

  getAnime(input: ProviderAnimeRef, runtime: ExtractionRuntime): Promise<AnimeDetails> {
    return getAnimePaheAnime(input, runtime);
  }

  getEpisodes(input: ProviderAnimeRef, runtime: ExtractionRuntime): Promise<EpisodeList> {
    return getAnimePaheEpisodes(input.providerId, input.externalAnimeId, runtime);
  }

  resolvePlayback(
    input: ProviderEpisodeRef,
    runtime: ExtractionRuntime,
  ): Promise<PlaybackResolution> {
    return resolveAnimePahePlayback(input, runtime);
  }
}
