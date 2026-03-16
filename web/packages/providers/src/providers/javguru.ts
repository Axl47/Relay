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
  normalizePathId,
  uniqueBy,
} from "../base/provider-utils";

export class JavGuruProvider extends WordPressMirrorProviderBase {
  private decodePathSegment(value: string) {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  private isUsableImageUrl(value?: string | null) {
    const normalized = cleanText(value);
    return Boolean(normalized) && !normalized.startsWith("data:image/");
  }

  private extractImageUrl(node: any, $: any) {
    const image = $(node).find("img").first();
    const noscriptHtml = cleanText($(node).find("noscript").first().html());
    const noscriptImgSrc = noscriptHtml.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] ?? "";
    const srcset =
      cleanText(image.attr("data-srcset")) ||
      cleanText(image.attr("srcset"));
    const srcsetUrl = srcset
      .split(",")
      .map((entry: string) => cleanText(entry.split(" ").at(0)))
      .find(Boolean);

    return (
      absoluteUrl(
        this.metadata.baseUrl,
        cleanText(image.attr("data-lazy-src")) ||
          cleanText(image.attr("data-src")) ||
          cleanText(image.attr("data-original")) ||
          noscriptImgSrc ||
          srcsetUrl ||
          cleanText(image.attr("src")),
      ) ?? null
    );
  }

  private extractPostCoverImage($: any) {
    return (
      absoluteUrl(
        this.metadata.baseUrl,
        this.firstAttr($, ["meta[property='og:image']", ".entry-content img", "img"], "content") ||
          this.firstAttr($, [".entry-content img", "img"], "data-lazy-src") ||
          this.firstAttr($, [".entry-content img", "img"], "data-src") ||
          this.firstAttr($, [".entry-content img", "img"], "data-original") ||
          this.firstAttr($, [".entry-content img", "img"], "src"),
      ) ?? null
    );
  }

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
    const rawItems: Array<ReturnType<typeof createSearchResult>> = uniqueBy(
      $("article, .inside-article")
        .toArray()
        .map((node: any) => {
          const card = $(node);
          const link = card
            .find(".entry-title a[href], h1 a[href], h2 a[href], a[rel='bookmark']")
            .first();
          const href = cleanText(link.attr("href"));
          if (!href) {
            return null;
          }

          const normalizedPath = normalizePathId(this.metadata.baseUrl, href);
          const [postId, slug] = normalizedPath.split("/");
          if (!postId || !slug || !/^\d+$/.test(postId)) {
            return null;
          }

          const externalAnimeId = extractIdAfterPrefix(this.metadata.baseUrl, href, "");
          const title =
            cleanText(link.text()) ||
            cleanText(card.find(".entry-title").first().text()) ||
            cleanText(link.attr("title")) ||
            slug;
          if (!title) {
            return null;
          }

          return createSearchResult({
            providerId: this.metadata.id,
            providerDisplayName: this.metadata.displayName,
            externalAnimeId,
            title,
            synopsis:
              cleanText(
                card.find(".entry-content p, .entry-summary, .excerpt, p").first().text(),
              ) || null,
            coverImage: this.extractImageUrl(card, $),
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

    const items = await Promise.all(
      rawItems.map(async (item) => {
        if (this.isUsableImageUrl(item.coverImage)) {
          return item;
        }

        try {
          const post = await this.fetchPostDocument(item.externalAnimeId, ctx);
          const coverImage = this.extractPostCoverImage(post);
          if (!this.isUsableImageUrl(coverImage)) {
            return item;
          }

          return createSearchResult({
            ...item,
            coverImage,
          });
        } catch {
          return item;
        }
      }),
    );

    return {
      providerId: this.metadata.id,
      query: input.query,
      page: input.page,
      hasNextPage: false,
      items,
    };
  }

  private async fetchPostDocument(externalAnimeId: string, ctx: ProviderRequestContext) {
    return this.fetchDocument(
      `${this.metadata.baseUrl}/${this.decodePathSegment(externalAnimeId).replace(/^\/+/, "")}/`,
      ctx,
    );
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
      coverImage: this.extractPostCoverImage($),
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
      `${this.metadata.baseUrl}/${this.decodePathSegment(input.externalEpisodeId).replace(/^\/+/, "")}/`,
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
