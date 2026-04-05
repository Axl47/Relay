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
  createPlaybackResolution,
  createSearchResult,
  createStream,
  DEFAULT_USER_AGENT,
} from "../base/provider-utils";
import { getProviderMetadata } from "../provider-definitions";

type XtreamKind = "movie" | "tv";

type TmdbSearchResponse = {
  page: number;
  total_pages: number;
  results: Array<{
    id: number;
    media_type?: string;
    title?: string;
    name?: string;
    overview?: string;
    poster_path?: string | null;
    release_date?: string;
    first_air_date?: string;
    original_language?: string;
  }>;
};

type TmdbGenre = {
  id: number;
  name: string;
};

type TmdbMovieDetails = {
  id: number;
  title: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  genres?: TmdbGenre[];
  original_language?: string;
  runtime?: number | null;
};

type TmdbTvSeasonSummary = {
  season_number: number;
  episode_count: number;
};

type TmdbTvDetails = {
  id: number;
  name: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  first_air_date?: string;
  genres?: TmdbGenre[];
  original_language?: string;
  status?: string;
  number_of_episodes?: number | null;
  seasons?: TmdbTvSeasonSummary[];
};

type TmdbEpisodeDetails = {
  episode_number: number;
  name?: string;
  overview?: string;
  still_path?: string | null;
  runtime?: number | null;
  air_date?: string;
};

type TmdbSeasonDetails = {
  season_number: number;
  episodes: TmdbEpisodeDetails[];
};

type XtreamResolvedTitle =
  | { kind: "movie"; details: TmdbMovieDetails }
  | { kind: "tv"; details: TmdbTvDetails };

const TMDB_API_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p/original";

const XTREAM_MIRRORS = [
  {
    id: "vidsrc",
    quality: "VidSrc",
    isDefault: true,
    movieUrl: (externalAnimeId: string) =>
      `https://www.vidsrc.wtf/api/1/movie/?id=${externalAnimeId}&color=D4A574`,
    tvUrl: (externalAnimeId: string, seasonNumber: number, episodeNumber: number) =>
      `https://www.vidsrc.wtf/api/1/tv/?id=${externalAnimeId}&s=${seasonNumber}&e=${episodeNumber}&color=D4A574`,
  },
  {
    id: "videasy",
    quality: "Videasy",
    isDefault: false,
    movieUrl: (externalAnimeId: string) => `https://player.videasy.net/movie/${externalAnimeId}`,
    tvUrl: (externalAnimeId: string, seasonNumber: number, episodeNumber: number) =>
      `https://player.videasy.net/tv/${externalAnimeId}/${seasonNumber}/${episodeNumber}`,
  },
  {
    id: "vidrock",
    quality: "VidRock",
    isDefault: false,
    movieUrl: (externalAnimeId: string) => `https://vidrock.net/movie/${externalAnimeId}`,
    tvUrl: (externalAnimeId: string, seasonNumber: number, episodeNumber: number) =>
      `https://vidrock.net/tv/${externalAnimeId}/${seasonNumber}/${episodeNumber}`,
  },
  {
    id: "vidzee",
    quality: "Vidzee",
    isDefault: false,
    movieUrl: (externalAnimeId: string) =>
      `https://player.vidzee.wtf/embed/movie/${externalAnimeId}`,
    tvUrl: (externalAnimeId: string, seasonNumber: number, episodeNumber: number) =>
      `https://player.vidzee.wtf/embed/tv/${externalAnimeId}/${seasonNumber}/${episodeNumber}`,
  },
  {
    id: "vidfast",
    quality: "VidFast",
    isDefault: false,
    movieUrl: (externalAnimeId: string) =>
      `https://vidfast.pro/movie/${externalAnimeId}?autoPlay=true`,
    tvUrl: (externalAnimeId: string, seasonNumber: number, episodeNumber: number) =>
      `https://vidfast.pro/tv/${externalAnimeId}/${seasonNumber}/${episodeNumber}?autoPlay=true&nextButton=true&autoNext=true`,
  },
] as const;

function parseYear(value?: string | null) {
  const cleaned = cleanText(value);
  const match = cleaned.match(/\b(19|20)\d{2}\b/);
  return match ? Number.parseInt(match[0], 10) : null;
}

function toImageUrl(path?: string | null) {
  return absoluteUrl(TMDB_IMAGE_BASE_URL, path) ?? null;
}

function mapTvStatus(status?: string | null): AnimeDetails["status"] {
  const normalized = cleanText(status).toLowerCase();
  if (!normalized) {
    return "unknown";
  }

  if (
    normalized === "returning series" ||
    normalized === "in production" ||
    normalized === "planned" ||
    normalized === "pilot"
  ) {
    return "ongoing";
  }

  if (normalized === "ended" || normalized === "canceled") {
    return "completed";
  }

  if (normalized === "hiatus") {
    return "hiatus";
  }

  return "unknown";
}

function parseTvEpisodeId(externalEpisodeId: string) {
  const match = externalEpisodeId.match(/^s(\d+):e(\d+)$/i);
  if (!match) {
    throw new Error(`Xtream episode id "${externalEpisodeId}" is not a TV episode id.`);
  }

  return {
    seasonNumber: Number.parseInt(match[1], 10),
    episodeNumber: Number.parseInt(match[2], 10),
  };
}

export class XtreamProvider extends RelayProviderBase {
  private readonly titleKindById = new Map<string, XtreamKind>();

  constructor(private readonly tmdbApiKey: string) {
    super(getProviderMetadata("xtream")!);
  }

  private buildTmdbUrl(pathname: string, query: Record<string, string | number>) {
    const url = new URL(`${TMDB_API_BASE_URL}${pathname}`);
    url.searchParams.set("api_key", this.tmdbApiKey);

    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, `${value}`);
    }

    return url.toString();
  }

  private async fetchTmdbJson<T>(
    pathname: string,
    ctx: ProviderRequestContext,
    query: Record<string, string | number> = {},
    options?: { allowNotFound?: boolean },
  ): Promise<T | null> {
    const response = await ctx.fetch(this.buildTmdbUrl(pathname, query), {
      signal: ctx.signal,
      headers: {
        accept: "application/json",
        "accept-language": "en-US,en;q=0.9",
        "user-agent": DEFAULT_USER_AGENT,
      },
    });

    if (response.status === 404 && options?.allowNotFound) {
      return null;
    }

    if (!response.ok) {
      throw new Error(
        `Xtream TMDB request failed with status ${response.status} for ${pathname}.`,
      );
    }

    return (await response.json()) as T;
  }

  private async resolveTitle(
    externalAnimeId: string,
    ctx: ProviderRequestContext,
  ): Promise<XtreamResolvedTitle> {
    const cachedKind = this.titleKindById.get(externalAnimeId);
    if (cachedKind === "movie") {
      const details = await this.fetchTmdbJson<TmdbMovieDetails>(
        `/movie/${externalAnimeId}`,
        ctx,
      );
      if (!details) {
        throw new Error(`Xtream movie ${externalAnimeId} was not found on TMDB.`);
      }
      return { kind: "movie", details };
    }

    if (cachedKind === "tv") {
      const details = await this.fetchTmdbJson<TmdbTvDetails>(`/tv/${externalAnimeId}`, ctx);
      if (!details) {
        throw new Error(`Xtream TV title ${externalAnimeId} was not found on TMDB.`);
      }
      return { kind: "tv", details };
    }

    const movieDetails = await this.fetchTmdbJson<TmdbMovieDetails>(
      `/movie/${externalAnimeId}`,
      ctx,
      {},
      { allowNotFound: true },
    );
    if (movieDetails) {
      this.titleKindById.set(externalAnimeId, "movie");
      return { kind: "movie", details: movieDetails };
    }

    const tvDetails = await this.fetchTmdbJson<TmdbTvDetails>(
      `/tv/${externalAnimeId}`,
      ctx,
      {},
      { allowNotFound: true },
    );
    if (tvDetails) {
      this.titleKindById.set(externalAnimeId, "tv");
      return { kind: "tv", details: tvDetails };
    }

    throw new Error(`Xtream title ${externalAnimeId} was not found on TMDB.`);
  }

  async search(input: SearchInput, ctx: ProviderRequestContext): Promise<SearchPage> {
    const response = await this.fetchTmdbJson<TmdbSearchResponse>("/search/multi", ctx, {
      query: input.query,
      page: input.page,
    });

    const items =
      response?.results
        .filter((item) => item.media_type === "movie" || item.media_type === "tv")
        .slice(0, input.limit)
        .map((item) => {
          const kind = item.media_type === "movie" ? "movie" : "tv";
          const externalAnimeId = `${item.id}`;
          this.titleKindById.set(externalAnimeId, kind);

          return createSearchResult({
            providerId: this.metadata.id,
            providerDisplayName: this.metadata.displayName,
            externalAnimeId,
            title: cleanText(item.title ?? item.name) || externalAnimeId,
            synopsis: cleanText(item.overview) || null,
            coverImage: toImageUrl(item.poster_path),
            year: parseYear(item.release_date ?? item.first_air_date),
            kind,
            language: cleanText(item.original_language) || "en",
            contentClass: this.metadata.contentClass,
            requiresAdultGate: this.metadata.requiresAdultGate,
          });
        }) ?? [];

    return {
      providerId: this.metadata.id,
      query: input.query,
      page: input.page,
      hasNextPage: (response?.total_pages ?? input.page) > input.page,
      items,
    };
  }

  async getAnime(
    input: ProviderAnimeRef,
    ctx: ProviderRequestContext,
  ): Promise<AnimeDetails> {
    const resolved = await this.resolveTitle(input.externalAnimeId, ctx);

    if (resolved.kind === "movie") {
      const details = resolved.details;
      return createAnimeDetails({
        providerId: this.metadata.id,
        providerDisplayName: this.metadata.displayName,
        externalAnimeId: input.externalAnimeId,
        title: cleanText(details.title) || input.externalAnimeId,
        synopsis: cleanText(details.overview) || null,
        coverImage: toImageUrl(details.poster_path),
        bannerImage: toImageUrl(details.backdrop_path),
        status: "completed",
        year: parseYear(details.release_date),
        kind: "movie",
        tags: (details.genres ?? []).map((genre) => genre.name).filter(Boolean),
        language: cleanText(details.original_language) || "en",
        totalEpisodes: 1,
        contentClass: this.metadata.contentClass,
        requiresAdultGate: this.metadata.requiresAdultGate,
      });
    }

    const details = resolved.details;
    return createAnimeDetails({
      providerId: this.metadata.id,
      providerDisplayName: this.metadata.displayName,
      externalAnimeId: input.externalAnimeId,
      title: cleanText(details.name) || input.externalAnimeId,
      synopsis: cleanText(details.overview) || null,
      coverImage: toImageUrl(details.poster_path),
      bannerImage: toImageUrl(details.backdrop_path),
      status: mapTvStatus(details.status),
      year: parseYear(details.first_air_date),
      kind: "tv",
      tags: (details.genres ?? []).map((genre) => genre.name).filter(Boolean),
      language: cleanText(details.original_language) || "en",
      totalEpisodes: details.number_of_episodes ?? null,
      contentClass: this.metadata.contentClass,
      requiresAdultGate: this.metadata.requiresAdultGate,
    });
  }

  async getEpisodes(
    input: ProviderAnimeRef,
    ctx: ProviderRequestContext,
  ): Promise<EpisodeList> {
    const resolved = await this.resolveTitle(input.externalAnimeId, ctx);

    if (resolved.kind === "movie") {
      const details = resolved.details;
      return {
        providerId: this.metadata.id,
        externalAnimeId: input.externalAnimeId,
        episodes: [
          createEpisode({
            providerId: this.metadata.id,
            externalAnimeId: input.externalAnimeId,
            externalEpisodeId: "movie",
            number: 1,
            seasonNumber: null,
            episodeNumber: null,
            title: cleanText(details.title) || "Movie",
            synopsis: cleanText(details.overview) || null,
            thumbnail: toImageUrl(details.backdrop_path ?? details.poster_path),
            durationSeconds:
              typeof details.runtime === "number" && details.runtime > 0
                ? details.runtime * 60
                : null,
            releasedAt: cleanText(details.release_date) || null,
          }),
        ],
      };
    }

    const details = resolved.details;
    const seasonSummaries = (details.seasons ?? []).filter((season) => season.episode_count > 0);
    const seasons = await Promise.all(
      seasonSummaries.map(async (season) => {
        const payload = await this.fetchTmdbJson<TmdbSeasonDetails>(
          `/tv/${input.externalAnimeId}/season/${season.season_number}`,
          ctx,
        );
        return payload
          ? {
              seasonNumber: season.season_number,
              episodes: payload.episodes ?? [],
            }
          : null;
      }),
    );

    let absoluteNumber = 0;
    const episodes = seasons
      .filter((season): season is NonNullable<typeof season> => season !== null)
      .flatMap((season) =>
        season.episodes.map((episode) => {
          absoluteNumber += 1;
          return createEpisode({
            providerId: this.metadata.id,
            externalAnimeId: input.externalAnimeId,
            externalEpisodeId: `s${season.seasonNumber}:e${episode.episode_number}`,
            number: absoluteNumber,
            seasonNumber: season.seasonNumber,
            episodeNumber: episode.episode_number,
            title:
              cleanText(episode.name) ||
              `S${season.seasonNumber} E${episode.episode_number}`,
            synopsis: cleanText(episode.overview) || null,
            thumbnail: toImageUrl(episode.still_path),
            durationSeconds:
              typeof episode.runtime === "number" && episode.runtime > 0
                ? episode.runtime * 60
                : null,
            releasedAt: cleanText(episode.air_date) || null,
          });
        }),
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
    const streams =
      input.externalEpisodeId === "movie"
        ? XTREAM_MIRRORS.map((mirror) =>
            createStream({
              id: mirror.id,
              url: mirror.movieUrl(input.externalAnimeId),
              quality: mirror.quality,
              mimeType: "text/html",
              headers: {},
              cookies: {},
              proxyMode: "redirect",
              isDefault: mirror.isDefault,
            }),
          )
        : (() => {
            const { seasonNumber, episodeNumber } = parseTvEpisodeId(input.externalEpisodeId);
            return XTREAM_MIRRORS.map((mirror) =>
              createStream({
                id: mirror.id,
                url: mirror.tvUrl(input.externalAnimeId, seasonNumber, episodeNumber),
                quality: mirror.quality,
                mimeType: "text/html",
                headers: {},
                cookies: {},
                proxyMode: "redirect",
                isDefault: mirror.isDefault,
              }),
            );
          })();

    return createPlaybackResolution({
      providerId: input.providerId,
      externalAnimeId: input.externalAnimeId,
      externalEpisodeId: input.externalEpisodeId,
      streams,
      subtitles: [],
      cookies: {},
      expiresAt: this.createResolutionExpiry(ctx),
    });
  }
}
