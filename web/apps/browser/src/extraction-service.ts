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
import {
  getExtractionRetryAttempts,
  getExtractionTimeoutMs,
  resolveProviderDomainOrThrow,
  shouldResetContextAfterExtraction,
  withExtractionTimeout,
} from "./extraction-policy";
import { ProviderExtractorRegistry } from "./extractors/registry";
import type { BrowserProviderExtractor, ExtractionRuntime } from "./extractors/types";

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

  private async maybeResetContextAfterOperation(
    providerId: string,
    domain: string,
    operationName: "search" | "anime" | "episodes" | "playback",
  ) {
    if (shouldResetContextAfterExtraction(providerId, operationName)) {
      await this.contexts.resetContext(providerId, domain);
    }
  }

  private async runWithRetry<T>(
    providerId: string,
    domain: string,
    operationName: "search" | "anime" | "episodes" | "playback",
    operation: (extractor: BrowserProviderExtractor, runtime: ExtractionRuntime) => Promise<T>,
  ): Promise<T> {
    const extractor = this.extractors.get(providerId);
    let attempts = 0;
    const timeoutMs = getExtractionTimeoutMs(providerId, operationName, this.timeoutMs);
    const maxAttempts = getExtractionRetryAttempts(providerId);

    while (attempts < maxAttempts) {
      attempts += 1;
      try {
        const result = await withExtractionTimeout(timeoutMs, async (signal) =>
          operation(extractor, this.createRuntime(providerId, domain, signal)),
        );
        await this.maybeResetContextAfterOperation(providerId, domain, operationName);
        return result;
      } catch (error) {
        await this.maybeResetContextAfterOperation(providerId, domain, operationName);
        if (attempts < maxAttempts && isChallengeFailure(error)) {
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
    const domain = resolveProviderDomainOrThrow(providerId, baseUrl);
    return this.runWithRetry(providerId, domain, "search", (extractor, runtime) =>
      extractor.search(input, runtime),
    );
  }

  async anime(
    providerId: string,
    input: ProviderAnimeRef,
    baseUrl?: string,
  ): Promise<AnimeDetails> {
    const domain = resolveProviderDomainOrThrow(providerId, baseUrl);
    return this.runWithRetry(providerId, domain, "anime", (extractor, runtime) =>
      extractor.getAnime(input, runtime),
    );
  }

  async episodes(
    providerId: string,
    input: ProviderAnimeRef,
    baseUrl?: string,
  ): Promise<EpisodeList> {
    const domain = resolveProviderDomainOrThrow(providerId, baseUrl);
    return this.runWithRetry(providerId, domain, "episodes", (extractor, runtime) =>
      extractor.getEpisodes(input, runtime),
    );
  }

  async playback(
    providerId: string,
    input: ProviderEpisodeRef,
    baseUrl?: string,
  ): Promise<PlaybackResolution> {
    const domain = resolveProviderDomainOrThrow(providerId, baseUrl);
    return this.runWithRetry(providerId, domain, "playback", (extractor, runtime) =>
      extractor.resolvePlayback(input, runtime),
    );
  }
}
