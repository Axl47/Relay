import { load, type CheerioAPI } from "cheerio";
import type {
  LibraryRefreshResult,
  ProviderRequestContext,
  RelayProvider,
} from "@relay/provider-sdk";
import type {
  AnimeDetails,
  EpisodeList,
  PlaybackResolution,
  ProviderAnimeRef,
  ProviderEpisodeRef,
  ProviderMetadata,
  SearchInput,
  SearchPage,
} from "@relay/contracts";
import {
  DEFAULT_USER_AGENT,
  ProviderRuntimeError,
  cleanText,
  createExpiresAt,
  looksLikeChallengePage,
} from "./provider-utils";

type RequestInitLike = Parameters<typeof fetch>[1];

export abstract class RelayProviderBase implements RelayProvider {
  readonly metadata: ProviderMetadata;

  constructor(metadata: ProviderMetadata) {
    this.metadata = metadata;
  }

  abstract search(input: SearchInput, ctx: ProviderRequestContext): Promise<SearchPage>;

  abstract getAnime(
    input: ProviderAnimeRef,
    ctx: ProviderRequestContext,
  ): Promise<AnimeDetails>;

  abstract getEpisodes(
    input: ProviderAnimeRef,
    ctx: ProviderRequestContext,
  ): Promise<EpisodeList>;

  abstract resolvePlayback(
    input: ProviderEpisodeRef,
    ctx: ProviderRequestContext,
  ): Promise<PlaybackResolution>;

  async refreshLibraryItem(
    input: ProviderAnimeRef,
    ctx: ProviderRequestContext,
  ): Promise<LibraryRefreshResult> {
    const episodes = await this.getEpisodes(input, ctx);
    return {
      providerId: this.metadata.id,
      externalAnimeId: input.externalAnimeId,
      refreshedAt: ctx.now().toISOString(),
      discoveredEpisodes: episodes.episodes.length,
      totalEpisodes: episodes.episodes.length,
    };
  }

  protected async request(
    url: string,
    ctx: ProviderRequestContext,
    init: RequestInitLike = {},
  ) {
    const response = await ctx.fetch(url, {
      ...init,
      signal: init?.signal ?? ctx.signal,
      headers: {
        "user-agent": DEFAULT_USER_AGENT,
        "accept-language": "en-US,en;q=0.9",
        ...(init?.headers ?? {}),
      },
    });

    const contentType = response.headers.get("content-type") ?? "";
    const shouldPreviewBody =
      !response.ok || contentType.includes("text/html") || response.status === 403;
    if (shouldPreviewBody) {
      const preview = await response.clone().text().catch(() => "");
      if (looksLikeChallengePage(preview)) {
        throw new ProviderRuntimeError(
          this.metadata.id,
          "challenge_failed",
          `${this.metadata.displayName} is currently challenge-protected.`,
        );
      }

      if (!response.ok) {
        throw new ProviderRuntimeError(
          this.metadata.id,
          "upstream_error",
          `${this.metadata.displayName} request failed with status ${response.status} for ${url}.`,
        );
      }
    }

    return response;
  }

  protected async fetchText(
    url: string,
    ctx: ProviderRequestContext,
    init: RequestInitLike = {},
  ) {
    const response = await this.request(url, ctx, init);
    return response.text();
  }

  protected async fetchJson<T>(
    url: string,
    ctx: ProviderRequestContext,
    init: RequestInitLike = {},
  ): Promise<T> {
    const response = await this.request(url, ctx, {
      ...init,
      headers: {
        accept: "application/json, text/plain, */*",
        ...(init?.headers ?? {}),
      },
    });
    return (await response.json()) as T;
  }

  protected async fetchDocument(
    url: string,
    ctx: ProviderRequestContext,
    init: RequestInitLike = {},
  ) {
    return load(await this.fetchText(url, ctx, init));
  }

  protected firstText($: CheerioAPI, selectors: string[]) {
    for (const selector of selectors) {
      const value = cleanText($(selector).first().text());
      if (value) {
        return value;
      }
    }
    return "";
  }

  protected firstAttr($: CheerioAPI, selectors: string[], attr: string) {
    for (const selector of selectors) {
      const value = cleanText($(selector).first().attr(attr));
      if (value) {
        return value;
      }
    }
    return "";
  }

  protected createResolutionExpiry(ctx: ProviderRequestContext, minutes = 30) {
    return createExpiresAt(minutes, ctx.now());
  }
}

