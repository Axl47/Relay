import { load } from "cheerio";
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
import { getProviderMetadata } from "../provider-definitions";
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
  parseNumber,
  parseYear,
  uniqueBy,
} from "../base/provider-utils";

type GogoPlayerButton = {
  type: string;
  label: string;
  enc1: string;
  enc2: string;
  enc3: string;
  subtitle: string;
  key: string;
  plainUrl: string;
};

export class GogoanimeProvider extends WordPressMirrorProviderBase {
  constructor() {
    super(getProviderMetadata("gogoanime")!);
  }

  async search(input: SearchInput, ctx: ProviderRequestContext): Promise<SearchPage> {
    const $ = await this.fetchSearchDocument(input, ctx);
    const items: Array<ReturnType<typeof createSearchResult>> = uniqueBy(
      $(".listupd .bs, article.bs, .result-item")
        .toArray()
        .map((node: any) => {
          const card = $(node);
          const link = card.find("a[href*='/series/']").first();
          const href = cleanText(link.attr("href"));
          if (!href || /\/series\/\?/.test(href)) {
            return null;
          }

          const externalAnimeId = extractIdAfterPrefix(this.metadata.baseUrl, href, "series/");
          if (!externalAnimeId || externalAnimeId.includes("?")) {
            return null;
          }

          const rawNodeText = cleanText(link.text());
          const rawNodeTitle = cleanText(link.attr("title"));
          const imageAlt = cleanText(card.find("img").first().attr("alt"));
          const title =
            rawNodeTitle ||
            rawNodeText ||
            imageAlt ||
            cleanText(card.find("h2, .tt, .entry-title, [itemprop='headline']").first().text()) ||
            externalAnimeId;
          if (!rawNodeTitle && !rawNodeText && !imageAlt && title === externalAnimeId) {
            return null;
          }
          const coverImage =
            absoluteUrl(
              this.metadata.baseUrl,
              card.find("img").first().attr("data-src") ??
                card.find("img").first().attr("src") ??
                link.find("img").first().attr("data-src") ??
                link.find("img").first().attr("src"),
            ) ?? null;

          return createSearchResult({
            providerId: this.metadata.id,
            providerDisplayName: this.metadata.displayName,
            externalAnimeId,
            title,
            synopsis: null,
            coverImage,
            year: parseYear(card.text()),
            kind: "unknown",
            language: "en",
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

  private async fetchSeriesDocument(
    externalAnimeId: string,
    ctx: ProviderRequestContext,
  ) {
    return this.fetchDocument(`${this.metadata.baseUrl}/series/${externalAnimeId}/`, ctx);
  }

  async getAnime(
    input: ProviderAnimeRef,
    ctx: ProviderRequestContext,
  ): Promise<AnimeDetails> {
    const $ = await this.fetchSeriesDocument(input.externalAnimeId, ctx);
    const episodes = this.parseEpisodesFromSeriesDocument(input.externalAnimeId, $);

    return createAnimeDetails({
      providerId: this.metadata.id,
      providerDisplayName: this.metadata.displayName,
      externalAnimeId: input.externalAnimeId,
      title: this.firstText($, [".entry-title", ".infolimit h2", "h1"]),
      synopsis:
        this.firstText($, [".infox .desc", ".entry-content p", "meta[name='description']"]) || null,
      coverImage:
        absoluteUrl(
          this.metadata.baseUrl,
          this.firstAttr($, ["meta[property='og:image']", ".thumb img", "img"], "content") ||
            this.firstAttr($, [".thumb img", "img"], "src"),
        ) ?? null,
      bannerImage: null,
      status:
        /complete/i.test($.text()) ? "completed" : /ongoing/i.test($.text()) ? "ongoing" : "unknown",
      year: parseYear($.text()),
      tags: uniqueBy(
        $(".genxed a, .genres a")
          .toArray()
          .map((node) => cleanText($(node).text()))
          .filter(Boolean),
        (value) => value,
      ),
      language: "en",
      totalEpisodes: episodes.length || null,
      contentClass: this.metadata.contentClass,
      requiresAdultGate: this.metadata.requiresAdultGate,
    });
  }

  private parseEpisodesFromSeriesDocument(externalAnimeId: string, $: any) {
    const episodes: Array<ReturnType<typeof createEpisode>> = uniqueBy(
      $(".episodes-container .episode-item, .episodes-container a[href*='episode']")
        .toArray()
        .map((node: any) => {
          const link = $(node).is("a") ? $(node) : $(node).find("a").first();
          const href = cleanText(link.attr("href"));
          if (!href) {
            return null;
          }

          const externalEpisodeId = extractIdAfterPrefix(this.metadata.baseUrl, href, "");
          const number =
            parseNumber($(node).attr("data-episode-number")) ??
            parseNumber(link.text()) ??
            parseNumber(externalEpisodeId) ??
            0;

          return createEpisode({
            providerId: this.metadata.id,
            externalAnimeId,
            externalEpisodeId,
            number,
            title: cleanText(link.attr("title")) || `Episode ${number || "?"}`,
            synopsis: null,
            thumbnail: null,
            durationSeconds: null,
            releasedAt: null,
          });
        })
        .filter(
          (item: ReturnType<typeof createEpisode> | null): item is ReturnType<typeof createEpisode> =>
            item !== null,
        ),
      (item) => item.externalEpisodeId,
    );
    return episodes.sort((left, right) => left.number - right.number);
  }

  async getEpisodes(
    input: ProviderAnimeRef,
    ctx: ProviderRequestContext,
  ): Promise<EpisodeList> {
    const $ = await this.fetchSeriesDocument(input.externalAnimeId, ctx);
    return {
      providerId: this.metadata.id,
      externalAnimeId: input.externalAnimeId,
      episodes: this.parseEpisodesFromSeriesDocument(input.externalAnimeId, $),
    };
  }

  private parsePlayerButtons(html: string) {
    const $ = load(html);
    return $("li.player-type-link")
      .toArray()
      .map((node: any) => ({
        type: cleanText($(node).attr("data-type")),
        label: cleanText($(node).text()),
        enc1: cleanText($(node).attr("data-encrypted-url1")),
        enc2: cleanText($(node).attr("data-encrypted-url2")),
        enc3: cleanText($(node).attr("data-encrypted-url3")),
        subtitle: cleanText($(node).attr("data-subtitle")),
        key: cleanText($(node).attr("data-key")),
        plainUrl: cleanText($(node).attr("data-plain-url")),
      }))
      .filter((button) => button.type && (button.enc1 || button.plainUrl));
  }

  private rankPlayerButton(button: GogoPlayerButton) {
    const label = button.label.toLowerCase();
    const type = button.type.toLowerCase();

    if (label.includes("hd")) {
      return 0;
    }

    if (label.includes("megacloud") || label.includes("vidsrc") || label.includes("vidhide")) {
      return 1;
    }

    if (label.includes("streamwish")) {
      return 2;
    }

    if (label.includes("dood")) {
      return 3;
    }

    if (button.plainUrl && (type === "embed" || type === "double_player" || type === "kiwi")) {
      return 4;
    }

    if (label.includes("fast server") || type === "blogger") {
      return 9;
    }

    return 5;
  }

  private async extractPlayableSource(
    episodeUrl: string,
    button: GogoPlayerButton,
    postId: string,
    ctx: ProviderRequestContext,
  ) {
    if (button.plainUrl) {
      return {
        stream: createStream({
          id: button.type.toLowerCase(),
          url: absoluteUrl(this.metadata.baseUrl, button.plainUrl) ?? button.plainUrl,
          quality: button.label || "embed",
          mimeType: "text/html",
          headers: {},
          cookies: {},
          proxyMode: "redirect",
          isDefault: true,
        }),
        subtitles: [],
      };
    }

    const outerUrl = new URL(
      "https://9animetv.be/wp-content/plugins/video-player/includes/player/player.php",
    );
    outerUrl.searchParams.set(button.type, button.enc1);
    outerUrl.searchParams.set("url2", button.enc2);
    outerUrl.searchParams.set("url3", button.enc3);
    outerUrl.searchParams.set("feature_image", "");
    outerUrl.searchParams.set("ref", new URL(this.metadata.baseUrl).hostname);
    outerUrl.searchParams.set("postId", postId);
    if (button.subtitle) {
      outerUrl.searchParams.set("subtitle", button.subtitle);
    }
    if (button.key) {
      outerUrl.searchParams.set("key", button.key);
    }

    const outerHtml = await this.fetchText(outerUrl.toString(), ctx, {
      headers: { referer: episodeUrl },
    });
    const iframeUrl =
      absoluteUrl(
        outerUrl.toString(),
        outerHtml.match(/<iframe[^>]+src=["']([^"']+)/i)?.[1],
      ) ?? outerUrl.toString();
    const innerHtml = await this.fetchText(iframeUrl, ctx, {
      headers: { referer: outerUrl.toString() },
    });

    const sourcesMatch = innerHtml.match(/var\s+sources\s*=\s*(\[[\s\S]*?\]);/);
    const sources = sourcesMatch ? JSON.parse(sourcesMatch[1]) as Array<Record<string, unknown>> : [];
    const fileUrl =
      (sources.find((source) => typeof source.file === "string")?.file as string | undefined) ??
      innerHtml.match(/var\s+fileUrl\s*=\s*"([^"]+)"/)?.[1];
    if (!fileUrl) {
      throw new Error("Gogoanime did not expose a playable stream URL.");
    }

    const mimeType = detectMimeType(fileUrl);
    const stream = createStream({
      id: button.type.toLowerCase(),
      url: fileUrl,
      quality:
        String(
          sources.find((source) => typeof source.label === "string")?.label ??
            (mimeType === "video/mp4" ? "mp4" : "auto"),
        ),
      mimeType,
      headers: {},
      cookies: {},
      proxyMode: "proxy",
      isDefault: true,
    });

    const subtitles =
      button.subtitle && absoluteUrl(this.metadata.baseUrl, button.subtitle)
        ? [
            {
              label: "English",
              language: "en",
              url: absoluteUrl(this.metadata.baseUrl, button.subtitle)!,
              format: "vtt" as const,
              isDefault: true,
            },
          ]
        : [];

    return { stream, subtitles };
  }

  async resolvePlayback(
    input: ProviderEpisodeRef,
    ctx: ProviderRequestContext,
  ): Promise<PlaybackResolution> {
    const episodeUrl = `${this.metadata.baseUrl}/${input.externalEpisodeId.replace(/^\/+/, "")}/`;
    const html = await this.fetchText(episodeUrl, ctx);
    const buttons = this.parsePlayerButtons(html).sort(
      (left, right) => this.rankPlayerButton(left) - this.rankPlayerButton(right),
    );
    const postId =
      html.match(/name=['"]comment_post_ID['"] value=['"](\d+)['"]/)?.[1] ??
      html.match(/id=['"]comment_post_ID['"] value=['"](\d+)['"]/)?.[1] ??
      "";

    if (!buttons.length || !postId) {
      throw new Error("Gogoanime did not expose any player buttons.");
    }

    let lastError: Error | null = null;
    for (const button of buttons) {
      try {
        const playback = await this.extractPlayableSource(episodeUrl, button, postId, ctx);
        return createPlaybackResolution({
          providerId: this.metadata.id,
          externalAnimeId: input.externalAnimeId,
          externalEpisodeId: input.externalEpisodeId,
          streams: [playback.stream],
          subtitles: playback.subtitles,
          cookies: {},
          expiresAt: this.createResolutionExpiry(ctx),
        });
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }

    if (lastError) {
      throw lastError;
    }

    throw new Error("Gogoanime did not expose a playable stream URL.");
  }
}
