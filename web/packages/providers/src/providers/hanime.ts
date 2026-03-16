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
  cleanText,
  createAnimeDetails,
  createEpisode,
  createPlaybackResolution,
  createSearchResult,
  createStream,
  stripHtml,
  uniqueBy,
} from "../base/provider-utils";

type HanimeVideo = {
  id?: number;
  slug: string;
  name: string;
  search_titles?: string;
  description?: string | null;
  poster_url?: string | null;
  cover_url?: string | null;
  released_at?: string | null;
  released_at_unix?: number;
  created_at_unix?: number;
  duration_in_ms?: number;
  brand?: string | null;
  tags?: string[];
  hentai_tags?: Array<{ text: string }>;
};

const HANIME_SEARCH_API_URL = "https://cached.freeanimehentai.net/api/v10/search_hvs";

type HanimeFranchise = {
  id: string;
  title: string;
  videos: HanimeVideo[];
};

function normalizeSearchValue(value: string) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function compactSearchValue(value: string) {
  return normalizeSearchValue(value).replace(/\s+/g, "");
}

function rankSearchMatch(video: HanimeVideo, query: string) {
  const normalizedQuery = normalizeSearchValue(query);
  const compactQuery = compactSearchValue(query);
  const tokens = normalizedQuery.split(" ").filter(Boolean);
  if (tokens.length === 0) {
    return null;
  }

  const title = normalizeSearchValue(video.name);
  const combined = normalizeSearchValue(
    [
      video.name,
      video.search_titles,
      video.slug,
      video.brand,
      ...(video.tags ?? []),
    ]
      .filter(Boolean)
      .join(" "),
  );
  const compactCombined = compactSearchValue(
    [
      video.name,
      video.search_titles,
      video.slug,
      video.brand,
      ...(video.tags ?? []),
    ]
      .filter(Boolean)
      .join(" "),
  );

  const exactTitle = title === normalizedQuery;
  const phraseMatch = combined.includes(normalizedQuery);
  const compactMatch = compactQuery.length > 0 && compactCombined.includes(compactQuery);
  const matchedTokens = tokens.filter((token) => combined.includes(token));
  const allTokensMatch = matchedTokens.length === tokens.length;

  if (!exactTitle && !phraseMatch && !compactMatch && !allTokensMatch) {
    return null;
  }

  return (
    (exactTitle ? 4_000 : 0) +
    (phraseMatch ? 2_000 : 0) +
    (compactMatch ? 1_000 : 0) +
    matchedTokens.length * 120 +
    (video.released_at_unix ?? video.created_at_unix ?? 0) / 1_000_000_000
  );
}

function parseHanimeEpisodeNumber(video: HanimeVideo) {
  const slugMatch = video.slug.match(/-(\d+)$/);
  const titleMatch = video.name.match(/\s+(\d+)$/);
  if (slugMatch?.[1] && titleMatch?.[1] && slugMatch[1] === titleMatch[1]) {
    return Number.parseInt(slugMatch[1], 10);
  }

  if (slugMatch?.[1]) {
    return Number.parseInt(slugMatch[1], 10);
  }

  return null;
}

function getHanimeFranchiseId(video: HanimeVideo) {
  return parseHanimeEpisodeNumber(video) !== null ? video.slug.replace(/-\d+$/, "") : video.slug;
}

function getHanimeFranchiseTitle(video: HanimeVideo) {
  return parseHanimeEpisodeNumber(video) !== null
    ? video.name.replace(/\s+\d+$/, "").trim() || video.name
    : video.name;
}

function buildHanimeFranchises(catalog: HanimeVideo[]) {
  const franchises = new Map<string, HanimeFranchise>();

  for (const video of catalog) {
    const id = getHanimeFranchiseId(video);
    const existing = franchises.get(id);
    if (existing) {
      existing.videos.push(video);
      continue;
    }

    franchises.set(id, {
      id,
      title: getHanimeFranchiseTitle(video),
      videos: [video],
    });
  }

  for (const franchise of franchises.values()) {
    franchise.videos.sort((left, right) => {
      const leftNumber = parseHanimeEpisodeNumber(left);
      const rightNumber = parseHanimeEpisodeNumber(right);
      if (leftNumber !== null && rightNumber !== null && leftNumber !== rightNumber) {
        return leftNumber - rightNumber;
      }

      return (left.released_at_unix ?? left.created_at_unix ?? 0) -
        (right.released_at_unix ?? right.created_at_unix ?? 0);
    });
  }

  return franchises;
}

function findHanimeFranchise(franchises: Map<string, HanimeFranchise>, externalAnimeId: string) {
  const direct = franchises.get(externalAnimeId);
  if (direct) {
    return direct;
  }

  for (const franchise of franchises.values()) {
    if (franchise.videos.some((video) => video.slug === externalAnimeId)) {
      return franchise;
    }
  }

  return null;
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
    const catalog = await this.fetchJson<HanimeVideo[]>(
      HANIME_SEARCH_API_URL,
      ctx,
      {
        headers: {
          origin: this.metadata.baseUrl,
          referer: `${this.metadata.baseUrl}/`,
        },
      },
    );

    const franchises = buildHanimeFranchises(catalog);
    const matches = Array.from(franchises.values())
      .map((franchise) => {
        const scoredVideos = franchise.videos
          .map((video) => ({
            video,
            score: rankSearchMatch(video, input.query),
          }))
          .filter(
            (
              item,
            ): item is {
              video: HanimeVideo;
              score: number;
            } => item.score !== null,
          )
          .sort((left, right) => right.score - left.score);

        if (scoredVideos.length === 0) {
          return null;
        }

        const representative = scoredVideos[0]?.video ?? franchise.videos[franchise.videos.length - 1];
        return {
          franchise,
          representative,
          score: scoredVideos[0]?.score ?? 0,
        };
      })
      .filter(
        (
          item,
        ): item is {
          franchise: HanimeFranchise;
          representative: HanimeVideo;
          score: number;
        } => item !== null,
      )
      .sort((left, right) => right.score - left.score);

    const offset = (input.page - 1) * input.limit;
    const pageItems = matches.slice(offset, offset + input.limit);
    const items = pageItems.map(({ franchise, representative }) =>
      createSearchResult({
        providerId: this.metadata.id,
        providerDisplayName: this.metadata.displayName,
        externalAnimeId: franchise.id,
        title: franchise.title,
        synopsis: stripHtml(representative.description) || null,
        coverImage: representative.poster_url ?? representative.cover_url ?? null,
        year: representative.released_at ? new Date(representative.released_at).getUTCFullYear() : null,
        kind: "unknown",
        language: "ja",
        contentClass: this.metadata.contentClass,
        requiresAdultGate: this.metadata.requiresAdultGate,
      }),
    );

    return {
      providerId: this.metadata.id,
      query: input.query,
      page: input.page,
      hasNextPage: offset + input.limit < matches.length,
      items,
    };
  }

  private async fetchCatalog(ctx: ProviderRequestContext) {
    return this.fetchJson<HanimeVideo[]>(HANIME_SEARCH_API_URL, ctx, {
      headers: {
        origin: this.metadata.baseUrl,
        referer: `${this.metadata.baseUrl}/`,
      },
    });
  }

  async getAnime(
    input: ProviderAnimeRef,
    ctx: ProviderRequestContext,
  ): Promise<AnimeDetails> {
    const catalog = await this.fetchCatalog(ctx);
    const franchise = findHanimeFranchise(buildHanimeFranchises(catalog), input.externalAnimeId);
    if (!franchise) {
      throw new Error(`Hanime franchise "${input.externalAnimeId}" was not found.`);
    }

    const video = franchise.videos[franchise.videos.length - 1] ?? franchise.videos[0];

    return createAnimeDetails({
      providerId: this.metadata.id,
      providerDisplayName: this.metadata.displayName,
      externalAnimeId: franchise.id,
      title: franchise.title,
      synopsis: stripHtml(video.description) || null,
      coverImage: video.poster_url ?? null,
      bannerImage: video.cover_url ?? null,
      status: "completed",
      year: video.released_at ? new Date(video.released_at).getUTCFullYear() : null,
      tags: uniqueBy(
        franchise.videos
          .flatMap((entry) => [
            ...(entry.tags ?? []),
            ...(entry.hentai_tags ?? []).map((tag) => cleanText(tag.text)),
          ])
          .filter(Boolean),
        (value) => value,
      ),
      language: "ja",
      totalEpisodes: franchise.videos.length,
      contentClass: this.metadata.contentClass,
      requiresAdultGate: this.metadata.requiresAdultGate,
    });
  }

  async getEpisodes(
    input: ProviderAnimeRef,
    ctx: ProviderRequestContext,
  ): Promise<EpisodeList> {
    const catalog = await this.fetchCatalog(ctx);
    const franchise = findHanimeFranchise(buildHanimeFranchises(catalog), input.externalAnimeId);
    if (!franchise) {
      throw new Error(`Hanime franchise "${input.externalAnimeId}" was not found.`);
    }

    const episodes: Array<ReturnType<typeof createEpisode>> = franchise.videos.map((video, index) =>
      createEpisode({
        providerId: this.metadata.id,
        externalAnimeId: franchise.id,
        externalEpisodeId: video.slug,
        number: parseHanimeEpisodeNumber(video) ?? index + 1,
        title: video.name,
        synopsis: stripHtml(video.description) || null,
        thumbnail: video.poster_url ?? null,
        durationSeconds:
          typeof video.duration_in_ms === "number" && video.duration_in_ms > 0
            ? Math.round(video.duration_in_ms / 1_000)
            : null,
        releasedAt: video.released_at ?? null,
      }),
    );

    return {
      providerId: this.metadata.id,
      externalAnimeId: franchise.id,
      episodes,
    };
  }

  async resolvePlayback(
    input: ProviderEpisodeRef,
    ctx: ProviderRequestContext,
  ): Promise<PlaybackResolution> {
    return createPlaybackResolution({
      providerId: this.metadata.id,
      externalAnimeId: input.externalAnimeId,
      externalEpisodeId: input.externalEpisodeId,
      streams: [
        createStream({
          id: "hanime-watch-page",
          url: `${this.metadata.baseUrl}/videos/hentai/${input.externalEpisodeId}`,
          quality: "embedded",
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
