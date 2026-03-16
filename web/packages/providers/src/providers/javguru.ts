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
import { WordPressMirrorProviderBase } from "../base/wordpress-mirror-provider-base";
import {
  absoluteUrl,
  cleanText,
  createAnimeDetails,
  createEpisode,
  createPlaybackResolution,
  createSearchResult,
  createStream,
  decodeMaybeBase64,
  extractIdAfterPrefix,
  uniqueBy,
} from "../base/provider-utils";

export class JavGuruProvider extends WordPressMirrorProviderBase {
  constructor() {
    super({
      id: "javguru",
      displayName: "JavGuru",
      baseUrl: "https://jav.guru",
      contentClass: "jav",
      executionMode: "http",
      requiresAdultGate: true,
      supportsSearch: true,
      supportsTrackerSync: false,
      defaultEnabled: false,
    });
  }

  async search(input: SearchInput, ctx: ProviderRequestContext): Promise<SearchPage> {
    const $ = await this.fetchSearchDocument(input, ctx);
    const items: Array<ReturnType<typeof createSearchResult>> = uniqueBy(
      $("article a[href], .inside-article a[href], .entry-title a[href]")
        .toArray()
        .map((node: any) => {
          const href = cleanText($(node).attr("href"));
          if (!href.includes(this.metadata.baseUrl)) {
            return null;
          }

          const externalAnimeId = extractIdAfterPrefix(this.metadata.baseUrl, href, "");
          const card = $(node).closest("article");
          return createSearchResult({
            providerId: this.metadata.id,
            providerDisplayName: this.metadata.displayName,
            externalAnimeId,
            title:
              cleanText(card.find(".entry-title").first().text()) ||
              cleanText($(node).attr("title")) ||
              externalAnimeId,
            synopsis: null,
            coverImage:
              absoluteUrl(
                this.metadata.baseUrl,
                card.find("img").first().attr("data-src") ?? card.find("img").first().attr("src"),
              ) ?? null,
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

  private async fetchPostDocument(externalAnimeId: string, ctx: ProviderRequestContext) {
    return this.fetchDocument(`${this.metadata.baseUrl}/${externalAnimeId.replace(/^\/+/, "")}/`, ctx);
  }

  async getAnime(
    input: ProviderAnimeRef,
    ctx: ProviderRequestContext,
  ): Promise<AnimeDetails> {
    const $ = await this.fetchPostDocument(input.externalAnimeId, ctx);

    return createAnimeDetails({
      providerId: this.metadata.id,
      providerDisplayName: this.metadata.displayName,
      externalAnimeId: input.externalAnimeId,
      title: this.firstText($, ["h1.entry-title", "h1", "title"]),
      synopsis: cleanText($(".entry-content p").first().text()) || null,
      coverImage:
        absoluteUrl(
          this.metadata.baseUrl,
          this.firstAttr($, ["meta[property='og:image']", ".entry-content img", "img"], "content") ||
            this.firstAttr($, [".entry-content img", "img"], "src"),
        ) ?? null,
      bannerImage: null,
      status: "completed",
      year: null,
      tags: uniqueBy(
        $(".tags-links a, .entry-meta a[rel='tag']")
          .toArray()
          .map((node: any) => cleanText($(node).text()))
          .filter(Boolean),
        (value) => value,
      ),
      language: "ja",
      totalEpisodes: 1,
      contentClass: this.metadata.contentClass,
      requiresAdultGate: this.metadata.requiresAdultGate,
    });
  }

  async getEpisodes(
    input: ProviderAnimeRef,
    _ctx: ProviderRequestContext,
  ): Promise<EpisodeList> {
    return {
      providerId: this.metadata.id,
      externalAnimeId: input.externalAnimeId,
      episodes: [
        createEpisode({
          providerId: this.metadata.id,
          externalAnimeId: input.externalAnimeId,
          externalEpisodeId: input.externalAnimeId,
          number: 1,
          title: "Full Video",
          synopsis: null,
          thumbnail: null,
          durationSeconds: null,
          releasedAt: null,
        }),
      ],
    };
  }

  private extractPlaybackUrl(html: string) {
    const iframeDirect = html.match(/<iframe[^>]+src=["']([^"']+)["']/i)?.[1];
    if (iframeDirect) {
      return iframeDirect;
    }

    for (const match of html.matchAll(/(?:Base64\.decode|atob)\(["']([^"']+)["']\)/g)) {
      const decoded = decodeMaybeBase64(match[1]);
      const iframeUrl = decoded.match(/<iframe[^>]+src=["']([^"']+)["']/i)?.[1];
      if (iframeUrl) {
        return iframeUrl;
      }
      if (/^https?:\/\//i.test(decoded)) {
        return decoded;
      }
    }

    return null;
  }

  async resolvePlayback(
    input: ProviderEpisodeRef,
    ctx: ProviderRequestContext,
  ): Promise<PlaybackResolution> {
    const html = await this.fetchText(
      `${this.metadata.baseUrl}/${input.externalEpisodeId.replace(/^\/+/, "")}/`,
      ctx,
    );
    const playbackUrl = this.extractPlaybackUrl(html);
    if (!playbackUrl) {
      throw new Error("JavGuru did not expose any iframe playback URL.");
    }

    return createPlaybackResolution({
      providerId: this.metadata.id,
      externalAnimeId: input.externalAnimeId,
      externalEpisodeId: input.externalEpisodeId,
      streams: [
        createStream({
          id: "iframe",
          url: playbackUrl,
          quality: "embed",
          mimeType: "text/html",
          headers: {},
          cookies: {},
          proxyMode: "redirect",
          isDefault: true,
        }),
      ],
      subtitles: [],
      cookies: {},
      expiresAt: this.createResolutionExpiry(ctx),
    });
  }
}
