import type {
  AnimeDetails,
  EpisodeList,
  PlaybackResolution,
  ProviderAnimeRef,
  ProviderEpisodeRef,
  SearchInput,
  SearchPage,
} from "@relay/contracts";
import { ProviderContextManager } from "./browser/context-manager";
import type { BrowserPage } from "./browser/playwright-runtime";
import { BrowserExtractionError, isChallengeFailure } from "./errors";
import { ProviderExtractorRegistry } from "./extractors/registry";
import type { BrowserProviderExtractor, ExtractionRuntime } from "./extractors/types";

const providerBaseUrlMap: Record<string, string> = {
  animepahe: "https://animepahe.si",
  animeonsen: "https://www.animeonsen.xyz",
  javguru: "https://jav.guru",
  gogoanime: "https://gogoanime.by",
  hstream: "https://hstream.moe",
  animetake: "https://animetake.com.co",
  aniwave: "https://aniwaves.ru",
  hanime: "https://hanime.tv",
  hentaihaven: "https://hentaihaven.xxx",
};

function resolveDomain(providerId: string, baseUrl?: string) {
  const targetUrl = baseUrl ?? providerBaseUrlMap[providerId];
  if (!targetUrl) {
    throw new BrowserExtractionError(
      "invalid_request",
      `Missing domain metadata for provider "${providerId}". Supply baseUrl in request.`,
      { statusCode: 400 },
    );
  }

  try {
    return new URL(targetUrl).hostname;
  } catch (error) {
    throw new BrowserExtractionError("invalid_request", `Invalid baseUrl "${targetUrl}".`, {
      statusCode: 400,
      cause: error,
    });
  }
}

async function withTimeout<T>(
  timeoutMs: number,
  task: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await task(controller.signal);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new BrowserExtractionError(
        "timeout",
        `Extraction exceeded timeout after ${timeoutMs}ms.`,
        { statusCode: 504, cause: error },
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export class BrowserExtractionService {
  constructor(
    private readonly contexts: ProviderContextManager,
    private readonly extractors: ProviderExtractorRegistry,
    private readonly timeoutMs: number,
  ) {}

  private createRuntime(
    providerId: string,
    domain: string,
    signal: AbortSignal,
  ): ExtractionRuntime {
    return {
      providerId,
      domain,
      signal,
      withPage: <T>(task: (page: BrowserPage) => Promise<T>) =>
        this.contexts.withPage(providerId, domain, async (page) => task(page)),
    };
  }

  private async runWithRetry<T>(
    providerId: string,
    domain: string,
    operation: (extractor: BrowserProviderExtractor, runtime: ExtractionRuntime) => Promise<T>,
  ): Promise<T> {
    const extractor = this.extractors.get(providerId);
    let attempts = 0;

    while (attempts < 2) {
      attempts += 1;
      try {
        return await withTimeout(this.timeoutMs, async (signal) =>
          operation(extractor, this.createRuntime(providerId, domain, signal)),
        );
      } catch (error) {
        if (attempts < 2 && isChallengeFailure(error)) {
          await this.contexts.resetContext(providerId, domain);
          continue;
        }
        throw error;
      }
    }

    throw new BrowserExtractionError("upstream_error", "Extraction failed after retry.", {
      statusCode: 502,
    });
  }

  async search(providerId: string, input: SearchInput, baseUrl?: string): Promise<SearchPage> {
    const domain = resolveDomain(providerId, baseUrl);
    return this.runWithRetry(providerId, domain, (extractor, runtime) =>
      extractor.search(input, runtime),
    );
  }

  async anime(
    providerId: string,
    input: ProviderAnimeRef,
    baseUrl?: string,
  ): Promise<AnimeDetails> {
    const domain = resolveDomain(providerId, baseUrl);
    return this.runWithRetry(providerId, domain, (extractor, runtime) =>
      extractor.getAnime(input, runtime),
    );
  }

  async episodes(
    providerId: string,
    input: ProviderAnimeRef,
    baseUrl?: string,
  ): Promise<EpisodeList> {
    const domain = resolveDomain(providerId, baseUrl);
    return this.runWithRetry(providerId, domain, (extractor, runtime) =>
      extractor.getEpisodes(input, runtime),
    );
  }

  async playback(
    providerId: string,
    input: ProviderEpisodeRef,
    baseUrl?: string,
  ): Promise<PlaybackResolution> {
    const domain = resolveDomain(providerId, baseUrl);
    return this.runWithRetry(providerId, domain, (extractor, runtime) =>
      extractor.resolvePlayback(input, runtime),
    );
  }
}
