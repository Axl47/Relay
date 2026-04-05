import type {
  AnimeDetailView,
  AnimeDetails,
  CatalogSearchLastResponse,
  CatalogSearchResponse,
  EpisodeList,
  EpisodeListItemView,
  EpisodeProgress,
  EpisodeWatchState,
  SearchInput,
} from "@relay/contracts";
import type { ProviderContentClass } from "@relay/contracts";
import type { RelayProvider } from "@relay/provider-sdk";
import { catalogEpisode, watchProgress } from "../db/schema";
import { CatalogRepository } from "../repositories/catalog-repository";
import { LibraryRepository } from "../repositories/library-repository";
import type { LibraryService } from "./library-service";
import {
  buildAnimetakeFallbackAnimeDetails,
  ProviderRuntime,
  ProviderTimeoutError,
} from "./provider-runtime";
import type { ProviderService } from "./provider-service";

type CatalogSearchProgressStart = {
  totalProviders: number;
};

type CatalogSearchProgressUpdate = {
  completedProviders: number;
  totalProviders: number;
  providerResult: CatalogSearchResponse["providers"][number];
};

export type CatalogSearchProgressHandlers = {
  onStart?: (payload: CatalogSearchProgressStart) => void | Promise<void>;
  onProviderResult?: (payload: CatalogSearchProgressUpdate) => void | Promise<void>;
};

type CatalogEpisodeRow = typeof catalogEpisode.$inferSelect;
type WatchProgressRow = typeof watchProgress.$inferSelect;
type CachedCatalogSearchSnapshot = {
  response: CatalogSearchResponse;
  cachedAtMs: number;
  expiresAtMs: number;
};

const DISCOVER_LAST_SEARCH_TTL_MS = 30 * 60 * 1000;

export class CatalogService {
  private readonly lastCatalogSearchByUser = new Map<string, CachedCatalogSearchSnapshot>();

  constructor(
    private readonly catalogRepository: CatalogRepository,
    private readonly libraryRepository: LibraryRepository,
    private readonly library: Pick<LibraryService, "getLibraryItemByAnime">,
    private readonly providers: ProviderService,
    private readonly runtime: ProviderRuntime,
  ) {}

  search(userId: string, input: SearchInput): Promise<CatalogSearchResponse> {
    return this.runCatalogSearch(userId, input);
  }

  searchWithProgress(
    userId: string,
    input: SearchInput,
    handlers: CatalogSearchProgressHandlers,
  ): Promise<CatalogSearchResponse> {
    return this.runCatalogSearch(userId, input, handlers);
  }

  getLastCatalogSearch(userId: string): Promise<CatalogSearchLastResponse> {
    const snapshot = this.getCachedLastCatalogSearch(userId);
    if (!snapshot) {
      return Promise.resolve({
        result: null,
        cachedAt: null,
        expiresAt: null,
      });
    }

    return Promise.resolve({
      result: snapshot.response,
      cachedAt: new Date(snapshot.cachedAtMs).toISOString(),
      expiresAt: new Date(snapshot.expiresAtMs).toISOString(),
    });
  }

  getAnime(userId: string, providerId: string, externalAnimeId: string): Promise<AnimeDetails> {
    return this.doGetAnime(userId, providerId, externalAnimeId);
  }

  getEpisodes(userId: string, providerId: string, externalAnimeId: string): Promise<EpisodeList> {
    return this.doGetEpisodes(userId, providerId, externalAnimeId);
  }

  getAnimeDetailView(
    userId: string,
    providerId: string,
    externalAnimeId: string,
  ): Promise<AnimeDetailView> {
    return this.doGetAnimeDetailView(userId, providerId, externalAnimeId);
  }

  private toAnimeDetailsFromCatalogRow(
    row: Awaited<ReturnType<CatalogRepository["findAnime"]>> extends infer T
      ? Exclude<T, null>
      : never,
    provider: RelayProvider,
  ): AnimeDetails {
    return {
      providerId: row.providerId,
      providerDisplayName: provider.metadata.displayName,
      externalAnimeId: row.externalAnimeId,
      title: row.title,
      synopsis: row.synopsis,
      coverImage: row.coverImage,
      bannerImage: row.bannerImage,
      status: (row.status as AnimeDetails["status"]) ?? "unknown",
      year: row.year,
      kind: row.kind as AnimeDetails["kind"],
      tags: Array.isArray(row.tags)
        ? row.tags.filter((tag): tag is string => typeof tag === "string")
        : [],
      language: row.language,
      totalEpisodes: row.totalEpisodes,
      contentClass: provider.metadata.contentClass,
      requiresAdultGate: row.requiresAdultGate,
    };
  }

  private getEpisodeWatchState(progress: WatchProgressRow | null | undefined): EpisodeWatchState {
    if (!progress) {
      return "unwatched";
    }

    if (progress.completed) {
      return "watched";
    }

    if (progress.positionSeconds > 0 || progress.percentComplete > 0) {
      return "in_progress";
    }

    return "unwatched";
  }

  private toEpisodeProgress(progress: WatchProgressRow | null | undefined): EpisodeProgress | null {
    if (!progress) {
      return null;
    }

    return {
      positionSeconds: progress.positionSeconds,
      durationSeconds: progress.durationSeconds,
      percentComplete: progress.percentComplete,
      completed: progress.completed,
      updatedAt: progress.updatedAt.toISOString(),
    };
  }

  private toEpisodeListItemView(
    episode: CatalogEpisodeRow | EpisodeList["episodes"][number],
    progress: WatchProgressRow | null | undefined,
    options?: {
      currentEpisodeId?: string | null;
      nowPlayingEpisodeId?: string | null;
    },
  ): EpisodeListItemView {
    return {
      providerId: episode.providerId,
      externalAnimeId: episode.externalAnimeId,
      externalEpisodeId: episode.externalEpisodeId,
      number: episode.number,
      seasonNumber: episode.seasonNumber ?? null,
      episodeNumber: episode.episodeNumber ?? null,
      title: episode.title,
      synopsis: episode.synopsis ?? null,
      thumbnail: episode.thumbnail ?? null,
      durationSeconds: episode.durationSeconds ?? null,
      releasedAt:
        episode.releasedAt instanceof Date
          ? episode.releasedAt.toISOString()
          : episode.releasedAt ?? null,
      state: this.getEpisodeWatchState(progress),
      progress: this.toEpisodeProgress(progress),
      isCurrent: options?.currentEpisodeId === episode.externalEpisodeId,
      isNowPlaying: options?.nowPlayingEpisodeId === episode.externalEpisodeId,
    };
  }

  private toEpisodeListFromCatalogRows(
    providerId: string,
    externalAnimeId: string,
    rows: CatalogEpisodeRow[],
  ): EpisodeList {
    return {
      providerId,
      externalAnimeId,
      episodes: rows
        .map((row) => ({
          providerId: row.providerId,
          externalAnimeId: row.externalAnimeId,
          externalEpisodeId: row.externalEpisodeId,
          number: row.number,
          seasonNumber: row.seasonNumber,
          episodeNumber: row.episodeNumber,
          title: row.title,
          synopsis: row.synopsis,
          thumbnail: row.thumbnail,
          durationSeconds: row.durationSeconds,
          releasedAt: row.releasedAt ? row.releasedAt.toISOString() : null,
        }))
        .sort((left, right) => {
          const seasonDelta = (left.seasonNumber ?? 0) - (right.seasonNumber ?? 0);
          if (seasonDelta !== 0) {
            return seasonDelta;
          }

          const episodeDelta = (left.episodeNumber ?? 0) - (right.episodeNumber ?? 0);
          if (episodeDelta !== 0) {
            return episodeDelta;
          }

          if (left.number !== right.number) {
            return left.number - right.number;
          }
          return left.externalEpisodeId.localeCompare(right.externalEpisodeId);
        }),
    };
  }

  private pruneExpiredLastCatalogSearches(nowMs = Date.now()) {
    for (const [cachedUserId, snapshot] of this.lastCatalogSearchByUser.entries()) {
      if (snapshot.expiresAtMs <= nowMs) {
        this.lastCatalogSearchByUser.delete(cachedUserId);
      }
    }
  }

  private cacheLastCatalogSearch(userId: string, response: CatalogSearchResponse) {
    const cachedAtMs = Date.now();
    this.lastCatalogSearchByUser.set(userId, {
      response,
      cachedAtMs,
      expiresAtMs: cachedAtMs + DISCOVER_LAST_SEARCH_TTL_MS,
    });
    this.pruneExpiredLastCatalogSearches(cachedAtMs);
  }

  private getCachedLastCatalogSearch(userId: string) {
    const nowMs = Date.now();
    this.pruneExpiredLastCatalogSearches(nowMs);
    return this.lastCatalogSearchByUser.get(userId) ?? null;
  }

  private async runCatalogSearch(
    userId: string,
    input: SearchInput,
    handlers?: CatalogSearchProgressHandlers,
  ): Promise<CatalogSearchResponse> {
    const availableProviders = await this.providers.listProviders(userId);
    const registry = await this.runtime.registry();
    const enabledProviders = availableProviders
      .filter((provider) => provider.enabled && provider.supportsSearch)
      .sort((left, right) => left.priority - right.priority);
    const totalProviders = enabledProviders.length;
    let completedProviders = 0;

    if (handlers?.onStart) {
      await handlers.onStart({ totalProviders });
    }

    const emitProviderResult = async (providerResult: CatalogSearchResponse["providers"][number]) => {
      completedProviders += 1;
      if (!handlers?.onProviderResult) {
        return;
      }

      try {
        await handlers.onProviderResult({
          completedProviders,
          totalProviders,
          providerResult,
        });
      } catch {
        // Search should keep running even when progress observers disconnect.
      }
    };

    const providerResults = await Promise.all(
      enabledProviders.map(async (providerSummary): Promise<CatalogSearchResponse["providers"][number]> => {
        const provider = registry.get(providerSummary.id);
        if (!provider) {
          const result: CatalogSearchResponse["providers"][number] = {
            providerId: providerSummary.id,
            displayName: providerSummary.displayName,
            contentClass: providerSummary.contentClass,
            status: "error",
            latencyMs: null,
            error: "Provider runtime is not registered.",
            items: [],
          };
          await emitProviderResult(result);
          return result;
        }

        const startedAt = Date.now();
        try {
          const page = await this.runtime.withProviderTimeout(
            provider,
            this.runtime.getProviderSearchTimeout(provider),
            async (runtime, signal) =>
              runtime.search(input, this.runtime.createProviderContext(signal)),
          );

          const result: CatalogSearchResponse["providers"][number] = {
            providerId: providerSummary.id,
            displayName: providerSummary.displayName,
            contentClass: providerSummary.contentClass,
            status: "success",
            latencyMs: Date.now() - startedAt,
            error: null,
            items: page.items,
          };
          await emitProviderResult(result);
          return result;
        } catch (error) {
          const result: CatalogSearchResponse["providers"][number] = {
            providerId: providerSummary.id,
            displayName: providerSummary.displayName,
            contentClass: providerSummary.contentClass,
            status: error instanceof ProviderTimeoutError ? "timeout" : "error",
            latencyMs: Date.now() - startedAt,
            error: error instanceof Error ? error.message : "Provider search failed.",
            items: [],
          };
          await emitProviderResult(result);
          return result;
        }
      }),
    );

    const discoveredItems = providerResults.flatMap((result) => result.items);
    if (discoveredItems.length > 0) {
      await this.catalogRepository.upsertSearchItems(discoveredItems);
    }

    const response: CatalogSearchResponse = {
      query: input.query,
      page: input.page,
      limit: input.limit,
      partial: providerResults.some((result) => result.status !== "success"),
      providers: providerResults,
      items: discoveredItems,
    };

    this.cacheLastCatalogSearch(userId, response);
    return response;
  }

  private async doGetAnime(
    userId: string,
    providerId: string,
    externalAnimeId: string,
  ): Promise<AnimeDetails> {
    const { provider } = await this.providers.getProviderWithPreferences(userId, providerId);
    const cachedAnime = await this.catalogRepository.findAnime(providerId, externalAnimeId);

    if (providerId === "animeonsen" && cachedAnime) {
      return this.toAnimeDetailsFromCatalogRow(cachedAnime, provider);
    }

    const runtimeCall = () => {
      const timeoutMs = this.runtime.getProviderCatalogTimeout(provider);
      if (timeoutMs !== null) {
        return this.runtime.withProviderTimeout(
          provider,
          timeoutMs,
          (runtime, signal) =>
            runtime.getAnime(
              { providerId, externalAnimeId },
              this.runtime.createProviderContext(signal),
            ),
        );
      }

      return provider.getAnime(
        { providerId, externalAnimeId },
        this.runtime.createProviderContext(),
      );
    };

    const anime = await runtimeCall().catch((error) => {
      if (cachedAnime) {
        return this.toAnimeDetailsFromCatalogRow(cachedAnime, provider);
      }

      if (providerId === "animetake") {
        return buildAnimetakeFallbackAnimeDetails(provider, providerId, externalAnimeId);
      }

      throw error;
    });

    await this.catalogRepository.upsertAnime({
      providerId,
      externalAnimeId,
      title: anime.title,
      synopsis: anime.synopsis,
      coverImage: anime.coverImage,
      bannerImage: anime.bannerImage,
      status: anime.status,
      year: anime.year,
      kind: anime.kind,
      language: anime.language,
      contentClass: anime.contentClass as ProviderContentClass,
      requiresAdultGate: anime.requiresAdultGate,
      tags: anime.tags,
      totalEpisodes: anime.totalEpisodes,
    });

    return anime;
  }

  private async doGetEpisodes(
    userId: string,
    providerId: string,
    externalAnimeId: string,
  ): Promise<EpisodeList> {
    const { provider } = await this.providers.getProviderWithPreferences(userId, providerId);
    const cachedEpisodeRows = await this.catalogRepository.listEpisodes(providerId, externalAnimeId);
    const cachedEpisodeList =
      cachedEpisodeRows.length > 0
        ? this.toEpisodeListFromCatalogRows(providerId, externalAnimeId, cachedEpisodeRows)
        : null;

    const runtimeCall = () => {
      const timeoutMs = this.runtime.getProviderCatalogTimeout(provider);
      if (timeoutMs !== null) {
        return this.runtime.withProviderTimeout(
          provider,
          timeoutMs,
          (runtime, signal) =>
            runtime.getEpisodes(
              { providerId, externalAnimeId },
              this.runtime.createProviderContext(signal),
            ),
        );
      }

      return provider.getEpisodes(
        { providerId, externalAnimeId },
        this.runtime.createProviderContext(),
      );
    };

    const payload = await runtimeCall().catch((error) => {
      if (cachedEpisodeList) {
        return cachedEpisodeList;
      }

      throw error;
    });

    await this.catalogRepository.upsertEpisodes(payload);
    return payload;
  }

  private async doGetAnimeDetailView(
    userId: string,
    providerId: string,
    externalAnimeId: string,
  ): Promise<AnimeDetailView> {
    const [anime, episodeList, libraryItem] = await Promise.all([
      this.doGetAnime(userId, providerId, externalAnimeId),
      this.doGetEpisodes(userId, providerId, externalAnimeId),
      this.library.getLibraryItemByAnime(userId, providerId, externalAnimeId),
    ]);

    const progressRows = await this.libraryRepository.listAnimeWatchProgress(
      userId,
      providerId,
      externalAnimeId,
    );
    const progressByEpisode = new Map<string, WatchProgressRow>();
    for (const row of progressRows) {
      if (!progressByEpisode.has(row.externalEpisodeId)) {
        progressByEpisode.set(row.externalEpisodeId, row);
      }
    }

    const inProgressEpisode =
      progressRows.find((row) => !row.completed && row.percentComplete > 0) ?? null;
    const latestEpisode = progressRows[0] ?? null;
    const episodeViews = episodeList.episodes.map((episode) =>
      this.toEpisodeListItemView(episode, progressByEpisode.get(episode.externalEpisodeId), {
        currentEpisodeId:
          inProgressEpisode?.externalEpisodeId ?? latestEpisode?.externalEpisodeId ?? null,
      }),
    );

    const resumeEpisode =
      episodeViews.find((episode) => episode.state === "in_progress") ??
      episodeViews.find((episode) => episode.state !== "watched") ??
      episodeViews[0] ??
      null;
    const currentEpisode =
      episodeViews.find((episode) => episode.externalEpisodeId === inProgressEpisode?.externalEpisodeId) ??
      episodeViews.find((episode) => episode.externalEpisodeId === latestEpisode?.externalEpisodeId) ??
      resumeEpisode;

    return {
      anime,
      libraryItem,
      inLibrary: libraryItem !== null,
      resumeEpisodeId: resumeEpisode?.externalEpisodeId ?? null,
      resumeEpisodeNumber: resumeEpisode?.number ?? null,
      resumeEpisodeTitle: resumeEpisode?.title ?? null,
      currentEpisodeId: currentEpisode?.externalEpisodeId ?? null,
      currentEpisodeNumber: currentEpisode?.number ?? null,
      currentEpisodeTitle: currentEpisode?.title ?? null,
      episodes: episodeViews,
    };
  }
}
