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
import { getAnimeTakeAnime, getAnimeTakeEpisodes } from "./catalog";
import { resolveAnimeTakePlayback } from "./playback";
import { searchAnimeTake } from "./search";

export class AnimeTakeExtractor implements BrowserProviderExtractor {
  search(input: SearchInput, runtime: ExtractionRuntime): Promise<SearchPage> {
    return searchAnimeTake(input, runtime);
  }

  getAnime(input: ProviderAnimeRef, runtime: ExtractionRuntime): Promise<AnimeDetails> {
    return getAnimeTakeAnime(input, runtime);
  }

  getEpisodes(input: ProviderAnimeRef, runtime: ExtractionRuntime): Promise<EpisodeList> {
    return getAnimeTakeEpisodes(input, runtime);
  }

  resolvePlayback(
    input: ProviderEpisodeRef,
    runtime: ExtractionRuntime,
  ): Promise<PlaybackResolution> {
    return resolveAnimeTakePlayback(input, runtime);
  }
}
