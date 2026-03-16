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
import { RelayProviderBase } from "../base/relay-provider-base";
import {
  absoluteUrl,
  cleanText,
  createAnimeDetails,
  createEpisode,
  createSearchResult,
  extractIdAfterPrefix,
  parseNumber,
  parseYear,
  ProviderRuntimeError,
  uniqueBy,
} from "../base/provider-utils";

type AkiHEpisodeCandidate = {
  externalEpisodeId: string;
  title: string;
  thumbnail: string | null;
};

export class AkiHProvider extends RelayProviderBase {
  constructor() {
    super({
      id: "aki-h",
      displayName: "Aki-H",
      baseUrl: "https://aki-h.com",
      contentClass: "hentai",
      executionMode: "browser",
      requiresAdultGate: true,
      supportsSearch: true,
      supportsTrackerSync: false,
      defaultEnabled: false,
    });
  }

  private createSearchUrl(input: SearchInput) {
    const url = new URL("/search/", this.metadata.baseUrl);
    if (input.page > 1) {
      url.searchParams.set("q", input.query);
      url.searchParams.set("page", `${input.page}/`);
    }
    return url;
  }

  private async fetchSearchDocument(input: SearchInput, ctx: ProviderRequestContext) {
    const url = this.createSearchUrl(input);
    if (input.page > 1) {
      return this.fetchDocument(url.toString(), ctx);
    }

    return this.fetchDocument(url.toString(), ctx, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin: this.metadata.baseUrl,
        referer: url.toString(),
      },
      body: new URLSearchParams({
        q: input.query,
      }).toString(),
    });
  }

  private async fetchSeriesDocument(externalAnimeId: string, ctx: ProviderRequestContext) {
    return this.fetchDocument(`${this.metadata.baseUrl}/${externalAnimeId.replace(/^\/+/, "")}/`, ctx);
  }

  private parseInfoMap($: any) {
    const info = new Map<string, string>();
    $(".anisc-info .item")
      .toArray()
      .forEach((node: any) => {
        const label = cleanText($(node).find(".item-head").first().text())
          .replace(/:\s*$/, "")
          .toLowerCase();
        if (!label) {
          return;
        }

        const value = cleanText(
          $(node).find(".name").text() ||
            $(node).find("a").toArray().map((anchor: any) => cleanText($(anchor).text())).join(", ") ||
            $(node).find(".text").text() ||
            $(node).text(),
        )
          .replace(new RegExp(`^${label}:?\\s*`, "i"), "")
          .trim();
        info.set(label, value);
      });

    return info;
  }

  private extractBannerImage($: any) {
    const style = cleanText($(".anis-cover").first().attr("style"));
    return absoluteUrl(
      this.metadata.baseUrl,
      style.match(/background-image:\s*url\((['"]?)([^'")]+)\1\)/i)?.[2] ?? null,
    );
  }

  private extractCoverImage($: any) {
    return (
      absoluteUrl(
        this.metadata.baseUrl,
        $(".anisc-poster img").first().attr("data-src") ??
          $(".anisc-poster img").first().attr("src") ??
          $("meta[property='og:image']").attr("content"),
      ) ??
      this.extractBannerImage($)
    );
  }

  private parseEpisodeCandidates($: any) {
    return $(".live__-wrap .item")
      .toArray()
      .map((node: any) => {
        const card = $(node);
        const link = card.find(".live-name a[href], .live-thumbnail[href]").first();
        const href = cleanText(link.attr("href"));
        if (!href || !href.includes("/watch/")) {
          return null;
        }

        const externalEpisodeId = extractIdAfterPrefix(this.metadata.baseUrl, href, "watch/");
        const title =
          cleanText(card.find(".live-name a").first().text()) ||
          cleanText(link.attr("title")) ||
          externalEpisodeId;
        if (!externalEpisodeId || !title) {
          return null;
        }

        return {
          externalEpisodeId,
          title,
          thumbnail:
            absoluteUrl(
              this.metadata.baseUrl,
              card.find("img").first().attr("data-src") ?? card.find("img").first().attr("src"),
            ) ?? null,
        } satisfies AkiHEpisodeCandidate;
      })
      .filter((item: AkiHEpisodeCandidate | null): item is AkiHEpisodeCandidate => item !== null);
  }

  async search(input: SearchInput, ctx: ProviderRequestContext): Promise<SearchPage> {
    const $ = await this.fetchSearchDocument(input, ctx);
    const items = uniqueBy(
      $(".film_list-wrap .flw-item")
        .toArray()
        .map((node: any) => {
          const card = $(node);
          const link = card.find(".film-poster-ahref[href], .film-name a[href]").first();
          const href = cleanText(link.attr("href"));
          if (!href || href.includes("/watch/")) {
            return null;
          }

          const externalAnimeId = extractIdAfterPrefix(this.metadata.baseUrl, href, "");
          const title =
            cleanText(card.find(".film-name a").first().text()) ||
            cleanText(link.attr("title")) ||
            externalAnimeId;
          if (!externalAnimeId || !title) {
            return null;
          }

          return createSearchResult({
            providerId: this.metadata.id,
            providerDisplayName: this.metadata.displayName,
            externalAnimeId,
            title,
            synopsis: null,
            coverImage:
              absoluteUrl(
                this.metadata.baseUrl,
                card.find(".film-poster img").first().attr("data-src") ??
                  card.find(".film-poster img").first().attr("src"),
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

    const pageNumbers = $(".pagination .page-link[href]")
      .toArray()
      .map((node: any) => cleanText($(node).attr("href")))
      .map((href: string) => href.match(/[?&]page=(\d+)/)?.[1] ?? null)
      .map((value) => (value ? Number.parseInt(value, 10) : null))
      .filter((value): value is number => Number.isFinite(value));

    return {
      providerId: this.metadata.id,
      query: input.query,
      page: input.page,
      hasNextPage: pageNumbers.some((pageNumber) => pageNumber > input.page),
      items,
    };
  }

  async getAnime(
    input: ProviderAnimeRef,
    ctx: ProviderRequestContext,
  ): Promise<AnimeDetails> {
    const $ = await this.fetchSeriesDocument(input.externalAnimeId, ctx);
    const info = this.parseInfoMap($);
    const episodes = this.parseEpisodeCandidates($);
    const statusText = info.get("status") ?? "";

    return createAnimeDetails({
      providerId: this.metadata.id,
      providerDisplayName: this.metadata.displayName,
      externalAnimeId: input.externalAnimeId,
      title: this.firstText($, [".anisc-detail .film-name", "meta[property='og:title']", "title"]),
      synopsis:
        cleanText($(".film-description .text").first().text()) ||
        cleanText($(".anisc-info .item .text").first().text()) ||
        cleanText($("meta[name='description']").attr("content")) ||
        null,
      coverImage: this.extractCoverImage($),
      bannerImage: this.extractBannerImage($),
      status:
        /airing/i.test(statusText) ? "ongoing" : /completed/i.test(statusText) ? "completed" : "unknown",
      year: parseYear(info.get("premiered") ?? info.get("aired") ?? $.text()),
      tags: uniqueBy(
        $(".anisc-info .item-list a")
          .toArray()
          .map((node: any) => cleanText($(node).text()))
          .filter(Boolean),
        (value) => value,
      ),
      language: "ja",
      totalEpisodes: episodes.length || null,
      contentClass: this.metadata.contentClass,
      requiresAdultGate: this.metadata.requiresAdultGate,
    });
  }

  async getEpisodes(
    input: ProviderAnimeRef,
    ctx: ProviderRequestContext,
  ): Promise<EpisodeList> {
    const $ = await this.fetchSeriesDocument(input.externalAnimeId, ctx);
    const episodes = this.parseEpisodeCandidates($).map((episode: AkiHEpisodeCandidate, index: number) =>
      createEpisode({
        providerId: this.metadata.id,
        externalAnimeId: input.externalAnimeId,
        externalEpisodeId: episode.externalEpisodeId,
        number: parseNumber(episode.title) ?? index + 1,
        title: episode.title,
        synopsis: null,
        thumbnail: episode.thumbnail,
        durationSeconds: null,
        releasedAt: null,
      })
    );

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
    if (!ctx.browser) {
      throw new ProviderRuntimeError(
        this.metadata.id,
        "challenge_failed",
        `${this.metadata.displayName} playback requires the internal browser broker.`,
      );
    }

    return ctx.browser.extractPlayback(this.metadata.id, input, ctx.signal);
  }
}
