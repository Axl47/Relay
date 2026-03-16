import type {
  AnimeDetails,
  EpisodeList,
  PlaybackResolution,
  ProviderAnimeRef,
  ProviderEpisodeRef,
  SearchInput,
  SearchPage,
} from "@relay/contracts";
import { BrowserExtractionError } from "../errors";
import { AkiHExtractor } from "./aki-h";
import { AnimeTakeExtractor } from "./animetake";
import { AnimeOnsenExtractor } from "./animeonsen";
import { AnimePaheExtractor } from "./animepahe";
import { HanimeExtractor } from "./hanime";
import type { BrowserProviderExtractor, ExtractionRuntime } from "./types";

const SUPPORTED_PROVIDER_IDS = [
  "aki-h",
  "animepahe",
  "animeonsen",
  "javguru",
  "gogoanime",
  "hstream",
  "animetake",
  "aniwave",
  "hanime",
  "hentaihaven",
] as const;

class UnimplementedProviderExtractor implements BrowserProviderExtractor {
  constructor(private readonly providerId: string) {}

  private createError() {
    return new BrowserExtractionError(
      "unimplemented_provider",
      `Browser extraction provider "${this.providerId}" is not implemented yet.`,
      {
        statusCode: 501,
      },
    );
  }

  async search(_input: SearchInput, _runtime: ExtractionRuntime): Promise<SearchPage> {
    throw this.createError();
  }

  async getAnime(_input: ProviderAnimeRef, _runtime: ExtractionRuntime): Promise<AnimeDetails> {
    throw this.createError();
  }

  async getEpisodes(_input: ProviderAnimeRef, _runtime: ExtractionRuntime): Promise<EpisodeList> {
    throw this.createError();
  }

  async resolvePlayback(
    _input: ProviderEpisodeRef,
    _runtime: ExtractionRuntime,
  ): Promise<PlaybackResolution> {
    throw this.createError();
  }
}

export class ProviderExtractorRegistry {
  private readonly extractors = new Map<string, BrowserProviderExtractor>();

  register(providerId: string, extractor: BrowserProviderExtractor) {
    this.extractors.set(providerId, extractor);
  }

  get(providerId: string): BrowserProviderExtractor {
    return this.extractors.get(providerId) ?? new UnimplementedProviderExtractor(providerId);
  }
}

export function createDefaultExtractorRegistry() {
  const registry = new ProviderExtractorRegistry();

  for (const providerId of SUPPORTED_PROVIDER_IDS) {
    registry.register(providerId, new UnimplementedProviderExtractor(providerId));
  }

  registry.register("aki-h", new AkiHExtractor());
  registry.register("animetake", new AnimeTakeExtractor());
  registry.register("animeonsen", new AnimeOnsenExtractor());
  registry.register("animepahe", new AnimePaheExtractor());
  registry.register("hanime", new HanimeExtractor());

  return registry;
}
