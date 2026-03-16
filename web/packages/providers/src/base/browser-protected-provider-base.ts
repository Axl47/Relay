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
import type { ProviderRequestContext } from "@relay/provider-sdk";
import { RelayProviderBase } from "./relay-provider-base";
import { ProviderRuntimeError } from "./provider-utils";

export abstract class BrowserProtectedProviderBase extends RelayProviderBase {
  constructor(metadata: ProviderMetadata) {
    super(metadata);
  }

  private browser(ctx: ProviderRequestContext) {
    if (!ctx.browser) {
      throw new ProviderRuntimeError(
        this.metadata.id,
        "challenge_failed",
        `${this.metadata.displayName} requires the internal browser broker.`,
      );
    }

    return ctx.browser;
  }

  search(input: SearchInput, ctx: ProviderRequestContext): Promise<SearchPage> {
    return this.browser(ctx).extractSearch(this.metadata.id, input, ctx.signal);
  }

  getAnime(input: ProviderAnimeRef, ctx: ProviderRequestContext): Promise<AnimeDetails> {
    return this.browser(ctx).extractAnime(this.metadata.id, input, ctx.signal);
  }

  getEpisodes(input: ProviderAnimeRef, ctx: ProviderRequestContext): Promise<EpisodeList> {
    return this.browser(ctx).extractEpisodes(this.metadata.id, input, ctx.signal);
  }

  resolvePlayback(
    input: ProviderEpisodeRef,
    ctx: ProviderRequestContext,
  ): Promise<PlaybackResolution> {
    return this.browser(ctx).extractPlayback(this.metadata.id, input, ctx.signal);
  }
}

