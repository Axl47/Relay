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
import { getHentaiHavenAnime, getHentaiHavenEpisodes } from "./catalog";
import { resolveHentaiHavenPlayback } from "./playback";
import { searchHentaiHaven } from "./search";

export class HentaiHavenExtractor implements BrowserProviderExtractor {
  search(input: SearchInput, runtime: ExtractionRuntime): Promise<SearchPage> {
    return searchHentaiHaven(input, runtime);
  }

  getAnime(input: ProviderAnimeRef, runtime: ExtractionRuntime): Promise<AnimeDetails> {
    return getHentaiHavenAnime(input, runtime);
  }

  getEpisodes(input: ProviderAnimeRef, runtime: ExtractionRuntime): Promise<EpisodeList> {
    return getHentaiHavenEpisodes(input, runtime);
  }

  resolvePlayback(
    input: ProviderEpisodeRef,
    runtime: ExtractionRuntime,
  ): Promise<PlaybackResolution> {
    return resolveHentaiHavenPlayback(input, runtime);
  }
}
