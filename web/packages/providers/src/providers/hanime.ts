import vm from "node:vm";
import type {
  AnimeDetails,
  EpisodeList,
  PlaybackResolution,
  ProviderAnimeRef,
  ProviderEpisodeRef,
  SearchInput,
  SearchPage,
} from "@relay/contracts";
import type { ProviderRequestContext } from "@relay/provider-sdk";
import { SsrManifestProviderBase } from "../base/ssr-manifest-provider-base";
import {
  absoluteUrl,
  cleanText,
  createAnimeDetails,
  createEpisode,
  createPlaybackResolution,
  createSearchResult,
  createStream,
  detectMimeType,
  extractIdAfterPrefix,
  stripHtml,
  uniqueBy,
} from "../base/provider-utils";

type HanimeVideo = {
  slug: string;
  name: string;
  description?: string | null;
  poster_url?: string | null;
  cover_url?: string | null;
  released_at?: string | null;
  duration_in_ms?: number;
  hentai_tags?: Array<{ text: string }>;
};

type HanimeStream = {
  id: number | string;
  url: string;
  height?: string | number | null;
  kind?: string | null;
  mime_type?: string | null;
};

type HanimeState = {
  state: {
    data: {
      video: {
        hentai_video: HanimeVideo;
        hentai_tags: Array<{ text: string }>;
        hentai_franchise_hentai_videos: HanimeVideo[];
        videos_manifest: {
          servers: Array<{
            name: string;
            streams: HanimeStream[];
          }>;
        };
      };
    };
  };
};

function parseNuxtState(html: string): HanimeState {
  const script = html.match(/<script[^>]*>\s*window\.__NUXT__\s*=\s*(.*?)<\/script>/s)?.[1];
  if (!script) {
    throw new Error("Hanime page did not expose window.__NUXT__.");
  }

  const context = { window: {} as Record<string, unknown> };
  vm.createContext(context);
  vm.runInContext(`window.__NUXT__=${script}`, context, { timeout: 1_000 });
  return context.window.__NUXT__ as HanimeState;
}

export class HanimeProvider extends SsrManifestProviderBase {
  constructor() {
    super({
      id: "hanime",
      displayName: "Hanime",
      baseUrl: "https://hanime.tv",
      contentClass: "hentai",
      executionMode: "http",
      requiresAdultGate: true,
      supportsSearch: true,
      supportsTrackerSync: false,
      defaultEnabled: false,
    });
  }

  async search(input: SearchInput, ctx: ProviderRequestContext): Promise<SearchPage> {
    const $ = await this.fetchDocument(
      `${this.metadata.baseUrl}/search/${encodeURIComponent(input.query)}`,
      ctx,
    );

    const items: Array<ReturnType<typeof createSearchResult>> = uniqueBy(
      $("a[href^='/videos/hentai/']")
        .toArray()
        .map((node: any) => {
          const href = cleanText($(node).attr("href"));
          const title =
            cleanText($(node).attr("alt")) ||
            cleanText($(node).find(".hv-title").first().text()) ||
            cleanText($(node).attr("title"));
          if (!href || !title) {
            return null;
          }

          return createSearchResult({
            providerId: this.metadata.id,
            providerDisplayName: this.metadata.displayName,
            externalAnimeId: extractIdAfterPrefix(this.metadata.baseUrl, href, "videos/hentai/"),
            title,
            synopsis: null,
            coverImage: null,
            year: null,
            kind: "unknown",
            language: "ja",
            contentClass: this.metadata.contentClass,
            requiresAdultGate: this.metadata.requiresAdultGate,
          });
        })
        .filter((item): item is ReturnType<typeof createSearchResult> => item !== null),
      (item) => item.externalAnimeId,
    ).slice(0, input.limit);

    return {
      providerId: this.metadata.id,
      query: input.query,
      page: input.page,
      hasNextPage: false,
      items,
    };
  }

  private async fetchVideoState(externalAnimeId: string, ctx: ProviderRequestContext) {
    const html = await this.fetchText(`${this.metadata.baseUrl}/videos/hentai/${externalAnimeId}`, ctx);
    return parseNuxtState(html);
  }

  async getAnime(
    input: ProviderAnimeRef,
    ctx: ProviderRequestContext,
  ): Promise<AnimeDetails> {
    const state = await this.fetchVideoState(input.externalAnimeId, ctx);
    const video = state.state.data.video.hentai_video;
    const related = state.state.data.video.hentai_franchise_hentai_videos;

    return createAnimeDetails({
      providerId: this.metadata.id,
      providerDisplayName: this.metadata.displayName,
      externalAnimeId: input.externalAnimeId,
      title: video.name,
      synopsis: stripHtml(video.description) || null,
      coverImage: video.poster_url ?? null,
      bannerImage: video.cover_url ?? null,
      status: "completed",
      year: video.released_at ? new Date(video.released_at).getUTCFullYear() : null,
      tags: uniqueBy(
        (video.hentai_tags ?? state.state.data.video.hentai_tags ?? [])
          .map((tag) => cleanText(tag.text))
          .filter(Boolean),
        (value) => value,
      ),
      language: "ja",
      totalEpisodes: related.length || 1,
      contentClass: this.metadata.contentClass,
      requiresAdultGate: this.metadata.requiresAdultGate,
    });
  }

  async getEpisodes(
    input: ProviderAnimeRef,
    ctx: ProviderRequestContext,
  ): Promise<EpisodeList> {
    const state = await this.fetchVideoState(input.externalAnimeId, ctx);
    const current = state.state.data.video.hentai_video;
    const related = state.state.data.video.hentai_franchise_hentai_videos;
    const source = related.length ? related : [current];
    const episodes: Array<ReturnType<typeof createEpisode>> = source
      .map((video, index) =>
        createEpisode({
          providerId: this.metadata.id,
          externalAnimeId: input.externalAnimeId,
          externalEpisodeId: video.slug,
          number: index + 1,
          title: video.name,
          synopsis: null,
          thumbnail: video.poster_url ?? null,
          durationSeconds:
            typeof video.duration_in_ms === "number" && video.duration_in_ms > 0
              ? Math.round(video.duration_in_ms / 1_000)
              : null,
          releasedAt: video.released_at ?? null,
        }),
      )
      .sort((left, right) => left.number - right.number);

    return {
      providerId: this.metadata.id,
      externalAnimeId: input.externalAnimeId,
      episodes,
    };
  }

  async resolvePlayback(
    input: ProviderEpisodeRef,
    ctx: ProviderRequestContext,
  ): Promise<PlaybackResolution> {
    const state = await this.fetchVideoState(input.externalEpisodeId, ctx);
    const servers = state.state.data.video.videos_manifest.servers ?? [];
    const streams = uniqueBy(
      servers.flatMap((server) =>
        server.streams.map((stream, index) =>
          createStream({
            id: `${server.name.toLowerCase()}-${stream.id}`,
            url: stream.url,
            quality: stream.height ? `${stream.height}p` : `${server.name} ${index + 1}`,
            mimeType: stream.mime_type === "application/x-mpegURL"
              ? "application/vnd.apple.mpegurl"
              : detectMimeType(stream.url),
            headers: {},
            cookies: {},
            proxyMode: "redirect",
            isDefault: index === 0,
          }),
        ),
      ),
      (stream) => stream.url,
    ) as Array<ReturnType<typeof createStream>>;

    if (streams.length === 0) {
      throw new Error("Hanime did not expose any manifest streams.");
    }

    streams[0].isDefault = true;
    for (const stream of streams.slice(1)) {
      stream.isDefault = false;
    }

    return createPlaybackResolution({
      providerId: this.metadata.id,
      externalAnimeId: input.externalAnimeId,
      externalEpisodeId: input.externalEpisodeId,
      streams,
      subtitles: [],
      cookies: {},
      expiresAt: this.createResolutionExpiry(ctx),
    });
  }
}
