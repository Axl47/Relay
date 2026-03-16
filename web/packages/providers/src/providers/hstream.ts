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
  stripHtml,
  uniqueBy,
} from "../base/provider-utils";

type HstreamPlayerApiResponse = {
  title: string;
  poster: string;
  interpolated: number;
  interpolated_uhd?: number;
  stream_url: string;
  stream_domains: string[];
  asia_stream_domains: string[];
  extra_subtitles: Array<{ language?: string; file?: string; url?: string; label?: string }>;
};

function normalizeHstreamSeriesId(id: string) {
  return id.replace(/-\d+$/, "");
}

export class HstreamProvider extends SsrManifestProviderBase {
  constructor() {
    super({
      id: "hstream",
      displayName: "Hstream",
      baseUrl: "https://hstream.moe",
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
      `${this.metadata.baseUrl}/search?search=${encodeURIComponent(input.query)}`,
      ctx,
    );

    const items: Array<ReturnType<typeof createSearchResult>> = uniqueBy(
      $("div[wire\\:key^='episode-'] a[href*='/hentai/']")
        .toArray()
        .map((node: any) => {
          const href = cleanText($(node).attr("href"));
          const rawId = extractIdAfterPrefix(this.metadata.baseUrl, href, "hentai/");
          const externalAnimeId = normalizeHstreamSeriesId(rawId);
          const title =
            cleanText($(node).attr("title")) ||
            cleanText($(node).find("img").attr("alt")) ||
            externalAnimeId;
          return createSearchResult({
            providerId: this.metadata.id,
            providerDisplayName: this.metadata.displayName,
            externalAnimeId,
            title: title.replace(/\s+-\s+\d+$/, ""),
            synopsis: null,
            coverImage:
              absoluteUrl(
                this.metadata.baseUrl,
                $(node).find("img").attr("src") ?? $(node).find("img").attr("data-src"),
              ) ?? null,
            year: null,
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

  private async fetchSeriesDocument(externalAnimeId: string, ctx: ProviderRequestContext) {
    return this.fetchDocument(`${this.metadata.baseUrl}/hentai/${externalAnimeId}`, ctx);
  }

  private parseEpisodesFromSeriesDocument(
    externalAnimeId: string,
    $: any,
  ) {
    const prefix = `${externalAnimeId}-`;
    const episodes: Array<ReturnType<typeof createEpisode>> = uniqueBy(
      $("a[href*='/hentai/']")
        .toArray()
        .map((node: any) => {
          const href = cleanText($(node).attr("href"));
          if (!href.includes(`${this.metadata.baseUrl}/hentai/${prefix}`)) {
            return null;
          }

          const externalEpisodeId = extractIdAfterPrefix(this.metadata.baseUrl, href, "hentai/");
          const suffix = externalEpisodeId.startsWith(prefix)
            ? externalEpisodeId.slice(prefix.length)
            : "";
          const title =
            cleanText($(node).find("img").attr("alt")) ||
            cleanText($(node).find("p").last().text()) ||
            cleanText($(node).attr("title"));
          const number =
            parseNumber(suffix) ??
            parseNumber(title) ??
            0;
          return createEpisode({
            providerId: this.metadata.id,
            externalAnimeId,
            externalEpisodeId,
            number,
            title: title || `Episode ${number || "?"}`,
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

  async getAnime(
    input: ProviderAnimeRef,
    ctx: ProviderRequestContext,
  ): Promise<AnimeDetails> {
    const $ = await this.fetchSeriesDocument(input.externalAnimeId, ctx);
    const episodes = this.parseEpisodesFromSeriesDocument(input.externalAnimeId, $);
    const descriptionHeader = $("p, h2, h3")
      .toArray()
      .find((node: any) => /description/i.test(cleanText($(node).text())));
    const description = descriptionHeader ? stripHtml($(descriptionHeader).next().html()) : null;

    return createAnimeDetails({
      providerId: this.metadata.id,
      providerDisplayName: this.metadata.displayName,
      externalAnimeId: input.externalAnimeId,
      title:
        cleanText($("h1 a").first().text()) || cleanText($("h1").first().text()) || input.externalAnimeId,
      synopsis: description || cleanText($("meta[name='description']").attr("content")) || null,
      coverImage:
        absoluteUrl(
          this.metadata.baseUrl,
          $("meta[property='og:image']").attr("content") ?? $("img").first().attr("src"),
        ) ?? null,
      bannerImage: null,
      status: "completed",
      year: null,
      tags: uniqueBy(
        $("a[href*='/tag/'], a[href*='/genre/']")
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
    return {
      providerId: this.metadata.id,
      externalAnimeId: input.externalAnimeId,
      episodes: this.parseEpisodesFromSeriesDocument(input.externalAnimeId, $),
    };
  }

  async resolvePlayback(
    input: ProviderEpisodeRef,
    ctx: ProviderRequestContext,
  ): Promise<PlaybackResolution> {
    const episodeUrl = `${this.metadata.baseUrl}/hentai/${input.externalEpisodeId}`;
    const response = await this.request(episodeUrl, ctx);
    const html = await response.text();
    const csrf =
      html.match(/name="_token"\s+value="([^"]+)"/)?.[1] ??
      html.match(/data-csrf="([^"]+)"/)?.[1];
    const episodeId = html.match(/id="e_id"\s+type="hidden"\s+value="(\d+)"/)?.[1];
    if (!csrf || !episodeId) {
      throw new Error("Hstream did not expose the episode id or CSRF token.");
    }

    const cookieHeader =
      typeof response.headers.getSetCookie === "function"
        ? response.headers
            .getSetCookie()
            .map((value) => value.split(";")[0])
            .join("; ")
        : response.headers.get("set-cookie")?.split(",").map((value) => value.split(";")[0]).join("; ") ?? "";

    const player = await this.fetchJson<HstreamPlayerApiResponse>(
      `${this.metadata.baseUrl}/player/api`,
      ctx,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrf,
          "x-requested-with": "XMLHttpRequest",
          referer: episodeUrl,
          ...(cookieHeader ? { cookie: cookieHeader } : {}),
        },
        body: JSON.stringify({ episode_id: episodeId }),
      },
    );

    const [primaryDomain] = player.asia_stream_domains.length
      ? player.asia_stream_domains
      : player.stream_domains;
    if (!primaryDomain) {
      throw new Error("Hstream did not return any stream domains.");
    }

    const streams = [
      createStream({
        id: "dash-720",
        url: `${primaryDomain}/${player.stream_url}/720/manifest.mpd`,
        quality: "720p",
        mimeType: "application/dash+xml",
        headers: {},
        cookies: {},
        proxyMode: "redirect",
        isDefault: false,
      }),
      createStream({
        id: "mp4-720",
        url: `${primaryDomain}/${player.stream_url}/x264.720p.mp4`,
        quality: "720p MP4",
        mimeType: "video/mp4",
        headers: {},
        cookies: {},
        proxyMode: "redirect",
        isDefault: true,
      }),
    ];

    if (player.interpolated) {
      streams.unshift(
        createStream({
          id: "dash-1080",
          url: `${primaryDomain}/${player.stream_url}/1080/manifest.mpd`,
          quality: "1080p",
          mimeType: "application/dash+xml",
          headers: {},
          cookies: {},
          proxyMode: "redirect",
          isDefault: false,
        }),
      );
    }

    const subtitleUrl =
      html.match(/href="([^"]+eng\.ass[^"]*)"/i)?.[1] ??
      `${primaryDomain}/${player.stream_url}/eng.ass`;

    const subtitles = [
      {
        label: "English",
        language: "en",
        url: absoluteUrl(this.metadata.baseUrl, subtitleUrl) ?? subtitleUrl,
        format: "ass" as const,
        isDefault: true,
      },
      ...player.extra_subtitles
        .map((subtitle) => {
          const url = subtitle.url ?? subtitle.file;
          if (!url) {
            return null;
          }
          return {
            label: subtitle.label ?? subtitle.language ?? "Subtitle",
            language: subtitle.language ?? "und",
            url: absoluteUrl(this.metadata.baseUrl, url) ?? url,
            format: "ass" as const,
            isDefault: false,
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null),
    ];

    return createPlaybackResolution({
      providerId: this.metadata.id,
      externalAnimeId: input.externalAnimeId,
      externalEpisodeId: input.externalEpisodeId,
      streams,
      subtitles: uniqueBy(subtitles, (item) => item.url),
      cookies: {},
      expiresAt: this.createResolutionExpiry(ctx),
    });
  }
}
