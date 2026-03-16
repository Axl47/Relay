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
  extractIdAfterPrefix,
  parseNumber,
  parseYear,
  uniqueBy,
} from "../base/provider-utils";

type AniwaveAjaxResponse = {
  status: number | boolean;
  result: string | { url?: string; sources?: unknown[]; tracks?: unknown[] };
};

function rc4(key: string, value: string) {
  const state = Array.from({ length: 256 }, (_, index) => index);
  const keyCodes = Array.from(key).map((character) => character.charCodeAt(0));
  let j = 0;

  for (let index = 0; index < 256; index += 1) {
    j = (j + state[index] + keyCodes[index % keyCodes.length]) % 256;
    [state[index], state[j]] = [state[j], state[index]];
  }

  let i = 0;
  j = 0;
  let output = "";
  for (const character of value) {
    i = (i + 1) % 256;
    j = (j + state[i]) % 256;
    [state[i], state[j]] = [state[j], state[i]];
    output += String.fromCharCode(
      character.charCodeAt(0) ^ state[(state[i] + state[j]) % 256],
    );
  }

  return output;
}

function createAniwaveVrf(value: string) {
  return Buffer.from(rc4("simple-hash", value)).toString("base64");
}

export class AniwaveProvider extends SsrManifestProviderBase {
  constructor() {
    super({
      id: "aniwave",
      displayName: "Aniwave",
      baseUrl: "https://aniwaves.ru",
      contentClass: "anime",
      executionMode: "http",
      requiresAdultGate: false,
      supportsSearch: true,
      supportsTrackerSync: true,
      defaultEnabled: true,
    });
  }

  async search(input: SearchInput, ctx: ProviderRequestContext): Promise<SearchPage> {
    const $ = await this.fetchDocument(
      `${this.metadata.baseUrl}/filter?keyword=${encodeURIComponent(input.query)}`,
      ctx,
    );

    const items: Array<ReturnType<typeof createSearchResult>> = uniqueBy(
      $("#list-items .item a[href*='/watch/']")
        .toArray()
        .map((node: any) => {
          const href = cleanText($(node).attr("href"));
          const card = $(node).closest(".item");
          return createSearchResult({
            providerId: this.metadata.id,
            providerDisplayName: this.metadata.displayName,
            externalAnimeId: extractIdAfterPrefix(this.metadata.baseUrl, href, "watch/"),
            title:
              cleanText(card.find(".name.d-title").first().text()) ||
              cleanText($(node).attr("title")) ||
              "Unknown",
            synopsis: null,
            coverImage:
              absoluteUrl(
                this.metadata.baseUrl,
                card.find("img").first().attr("src") ?? card.find("img").first().attr("data-src"),
              ) ?? null,
            year: parseYear(card.text()),
            kind: "unknown",
            language: "ja",
            contentClass: this.metadata.contentClass,
            requiresAdultGate: this.metadata.requiresAdultGate,
          });
        }),
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

  private async fetchWatchDocument(externalAnimeId: string, ctx: ProviderRequestContext) {
    return this.fetchDocument(`${this.metadata.baseUrl}/watch/${externalAnimeId}`, ctx);
  }

  private getAnimeNumericId($: Awaited<ReturnType<typeof this.fetchWatchDocument>>) {
    const value = cleanText($("#watch-main").attr("data-id"));
    if (!value) {
      throw new Error("Aniwave watch page did not expose a numeric anime id.");
    }
    return value;
  }

  async getAnime(
    input: ProviderAnimeRef,
    ctx: ProviderRequestContext,
  ): Promise<AnimeDetails> {
    const $ = await this.fetchWatchDocument(input.externalAnimeId, ctx);
    return createAnimeDetails({
      providerId: this.metadata.id,
      providerDisplayName: this.metadata.displayName,
      externalAnimeId: input.externalAnimeId,
      title: this.firstText($, ["h1.title.d-title", "h1.title", "h1"]),
      synopsis: cleanText($("meta[name='description']").attr("content")) || null,
      coverImage:
        absoluteUrl(
          this.metadata.baseUrl,
          $("meta[property='og:image']").attr("content") ?? $("img").first().attr("src"),
        ) ?? null,
      bannerImage: null,
      status: /ongoing/i.test($.text()) ? "ongoing" : "unknown",
      year: parseYear($.text()),
      tags: uniqueBy(
        $("a[href*='/genre/'], a[href*='/tag/']")
          .toArray()
          .map((node: any) => cleanText($(node).text()))
          .filter(Boolean),
        (value) => value,
      ),
      language: "ja",
      totalEpisodes: parseNumber($.text()),
      contentClass: this.metadata.contentClass,
      requiresAdultGate: this.metadata.requiresAdultGate,
    });
  }

  async getEpisodes(
    input: ProviderAnimeRef,
    ctx: ProviderRequestContext,
  ): Promise<EpisodeList> {
    const $ = await this.fetchWatchDocument(input.externalAnimeId, ctx);
    const animeId = this.getAnimeNumericId($);
    const response = await this.fetchJson<AniwaveAjaxResponse>(
      `${this.metadata.baseUrl}/ajax/episode/list/${animeId}?style=&vrf=${encodeURIComponent(
        createAniwaveVrf(animeId),
      )}`,
      ctx,
      {
        headers: {
          "x-requested-with": "XMLHttpRequest",
          referer: `${this.metadata.baseUrl}/watch/${input.externalAnimeId}`,
        },
      },
    );

    const html = typeof response.result === "string" ? response.result : "";
    const episodeMatches = [...html.matchAll(/<a[^>]+data-ids="([^"]+&eps=[^"]+)"[^>]+data-num="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
    const episodes: Array<ReturnType<typeof createEpisode>> = uniqueBy(
      episodeMatches.map((match) =>
        createEpisode({
          providerId: this.metadata.id,
          externalAnimeId: input.externalAnimeId,
          externalEpisodeId: match[2],
          number: parseNumber(match[2]) ?? 0,
          title: `Episode ${match[2]}`,
          synopsis: null,
          thumbnail: null,
          durationSeconds: null,
          releasedAt: null,
        }),
      ),
      (item) => item.externalEpisodeId,
    ).sort((left, right) => left.number - right.number);

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
    const $ = await this.fetchWatchDocument(input.externalAnimeId, ctx);
    const animeId = this.getAnimeNumericId($);
    const referer = `${this.metadata.baseUrl}/watch/${input.externalAnimeId}`;
    const serverList = await this.fetchJson<AniwaveAjaxResponse>(
      `${this.metadata.baseUrl}/ajax/server/list?servers=${encodeURIComponent(
        animeId,
      )}&eps=${encodeURIComponent(input.externalEpisodeId)}`,
      ctx,
      {
        headers: {
          "x-requested-with": "XMLHttpRequest",
          referer,
        },
      },
    );

    const serverHtml = typeof serverList.result === "string" ? serverList.result : "";
    const linkId = serverHtml.match(/data-link-id="([^"]+)"/)?.[1];
    if (!linkId) {
      throw new Error("Aniwave did not expose a server link id.");
    }

    const sources = await this.fetchJson<AniwaveAjaxResponse>(
      `${this.metadata.baseUrl}/ajax/sources?id=${encodeURIComponent(linkId)}&asi=0&autoPlay=0`,
      ctx,
      {
        headers: {
          "x-requested-with": "XMLHttpRequest",
          referer,
        },
      },
    );

    const embedUrl =
      typeof sources.result === "object" && sources.result !== null ? sources.result.url : null;
    if (!embedUrl) {
      throw new Error("Aniwave did not expose an embed playback URL.");
    }

    return createPlaybackResolution({
      providerId: this.metadata.id,
      externalAnimeId: input.externalAnimeId,
      externalEpisodeId: input.externalEpisodeId,
      streams: [
        createStream({
          id: "embed",
          url: embedUrl,
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
