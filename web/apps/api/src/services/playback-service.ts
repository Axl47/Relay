import type {
  CreatePlaybackSessionInput,
  PlaybackSession,
  UpdatePlaybackProgressInput,
  WatchPageContext,
} from "@relay/contracts";
import { CatalogRepository } from "../repositories/catalog-repository";
import { HistoryRepository } from "../repositories/history-repository";
import { LibraryRepository } from "../repositories/library-repository";
import { PlaybackRepository, type PlaybackSessionRow } from "../repositories/playback-repository";
import type { CatalogService } from "./catalog-service";
import type { LibraryService } from "./library-service";
import {
  type PlaybackSubtitleTrack,
  type StreamTarget,
  resolvePlaybackSubtitleTrack,
  shouldReusePlaybackSession,
  toPlaybackSession,
  toStreamTarget,
} from "./playback-service-utils";
import type { ProviderService } from "./provider-service";
import { ProviderRuntime } from "./provider-runtime";

const PLAYBACK_ATTEMPT_TIMEOUT_MS = 2_000;
const PLAYBACK_STALL_GRACE_MS = 5_000;

export class PlaybackService {
  private readonly playbackResolutionJobs = new Map<string, Promise<void>>();

  constructor(
    private readonly playbackRepository: PlaybackRepository,
    private readonly catalogRepository: CatalogRepository,
    private readonly libraryRepository: LibraryRepository,
    private readonly historyRepository: HistoryRepository,
    private readonly providers: ProviderService,
    private readonly catalog: Pick<CatalogService, "getAnimeDetailView">,
    private readonly library: Pick<LibraryService, "getLibraryItemById">,
    private readonly runtime: ProviderRuntime,
  ) {}

  createPlaybackSession(
    userId: string,
    input: CreatePlaybackSessionInput,
  ): Promise<PlaybackSession> {
    return this.doCreatePlaybackSession(userId, input);
  }

  getPlaybackSession(userId: string, playbackSessionId: string): Promise<PlaybackSession | null> {
    return this.doGetPlaybackSession(userId, playbackSessionId);
  }

  getPlaybackSessionBySessionId(playbackSessionId: string): Promise<PlaybackSession | null> {
    return this.doGetPlaybackSessionBySessionId(playbackSessionId);
  }

  getPlaybackStreamTarget(
    userId: string,
    playbackSessionId: string,
    requestPath?: string | null,
  ): Promise<StreamTarget> {
    return this.doGetPlaybackStreamTargetForUser(userId, playbackSessionId, requestPath);
  }

  getPlaybackStreamTargetBySessionId(
    playbackSessionId: string,
    requestPath?: string | null,
  ): Promise<StreamTarget> {
    return this.doGetPlaybackStreamTargetBySessionId(playbackSessionId, requestPath);
  }

  getPlaybackSubtitleTrack(
    userId: string,
    playbackSessionId: string,
    index: number,
  ): Promise<PlaybackSubtitleTrack> {
    return this.doGetPlaybackSubtitleTrackForUser(userId, playbackSessionId, index);
  }

  getPlaybackSubtitleTrackBySessionId(
    playbackSessionId: string,
    index: number,
  ): Promise<PlaybackSubtitleTrack> {
    return this.doGetPlaybackSubtitleTrackBySessionId(playbackSessionId, index);
  }

  updatePlaybackProgress(
    userId: string,
    playbackSessionId: string,
    input: UpdatePlaybackProgressInput,
  ) {
    return this.doUpdatePlaybackProgress(userId, playbackSessionId, input);
  }

  getWatchContext(userId: string, input: CreatePlaybackSessionInput): Promise<WatchPageContext> {
    return this.doGetWatchContext(userId, input);
  }

  private async doGetPlaybackStreamTargetForUser(
    userId: string,
    playbackSessionId: string,
    requestPath?: string | null,
  ): Promise<StreamTarget> {
    return this.doGetPlaybackStreamTarget(
      await this.playbackRepository.getSession(userId, playbackSessionId),
      requestPath,
    );
  }

  private async doGetPlaybackStreamTargetBySessionId(
    playbackSessionId: string,
    requestPath?: string | null,
  ): Promise<StreamTarget> {
    return this.doGetPlaybackStreamTarget(
      await this.playbackRepository.getSessionById(playbackSessionId),
      requestPath,
    );
  }

  private async doGetPlaybackSubtitleTrackForUser(
    userId: string,
    playbackSessionId: string,
    index: number,
  ): Promise<PlaybackSubtitleTrack> {
    return this.doGetPlaybackSubtitleTrack(
      await this.playbackRepository.getSession(userId, playbackSessionId),
      index,
    );
  }

  private async doGetPlaybackSubtitleTrackBySessionId(
    playbackSessionId: string,
    index: number,
  ): Promise<PlaybackSubtitleTrack> {
    return this.doGetPlaybackSubtitleTrack(
      await this.playbackRepository.getSessionById(playbackSessionId),
      index,
    );
  }

  private async maybeMarkPlaybackExpired(row: PlaybackSessionRow) {
    if (row.expiresAt > new Date() || row.status === "expired") {
      return row;
    }

    return (
      (await this.playbackRepository.updateSession(row.id, { status: "expired" })) ?? row
    );
  }

  private async maybeMarkPlaybackFailedIfStalled(row: PlaybackSessionRow) {
    if (row.status !== "resolving") {
      return row;
    }

    const provider = await this.providers.getProviderOrThrow(row.providerId).catch(() => null);
    if (!provider) {
      return row;
    }

    const timeoutMs =
      this.runtime.getProviderResolutionTimeout(provider) + PLAYBACK_STALL_GRACE_MS;
    if (Date.now() - row.createdAt.valueOf() <= timeoutMs) {
      return row;
    }

    this.playbackResolutionJobs.delete(row.id);
    return (
      (await this.playbackRepository.updateSession(row.id, {
        status: "failed",
        error: `Provider "${row.providerId}" exceeded timeout after ${this.runtime.getProviderResolutionTimeout(provider)}ms.`,
      })) ?? row
    );
  }

  private async maybeFinalizePlaybackSessionState(row: PlaybackSessionRow) {
    const expired = await this.maybeMarkPlaybackExpired(row);
    return this.maybeMarkPlaybackFailedIfStalled(expired);
  }

  private async resolvePlaybackSession(playbackSessionId: string) {
    const session = await this.playbackRepository.getSessionById(playbackSessionId);
    if (!session || session.status === "ready" || session.status === "expired") {
      return;
    }

    const provider = await this.providers.getProviderOrThrow(session.providerId);
    const timeoutMs = this.runtime.getProviderResolutionTimeout(provider);

    try {
      const resolution = await this.runtime.withProviderTimeout(
        provider,
        timeoutMs,
        async (runtime, signal) =>
          runtime.resolvePlayback(
            {
              providerId: session.providerId,
              externalAnimeId: session.externalAnimeId,
              externalEpisodeId: session.externalEpisodeId,
            },
            this.runtime.createProviderContext(signal),
          ),
      );
      const stream = resolution.streams.find((item) => item.isDefault) ?? resolution.streams[0];
      if (!stream) {
        throw new Error(`Provider "${provider.metadata.id}" returned no playable streams.`);
      }

      const ttlDeadline = Date.now() + this.runtime.getPlaybackCacheTtlMs(provider);
      const expiresAt = new Date(Math.min(new Date(resolution.expiresAt).valueOf(), ttlDeadline));

      await this.playbackRepository.updateSession(playbackSessionId, {
        status: "ready",
        proxyMode: stream.proxyMode,
        upstreamUrl: stream.url,
        mimeType: stream.mimeType,
        headers: stream.headers,
        cookies: {
          ...resolution.cookies,
          ...stream.cookies,
        },
        subtitles: resolution.subtitles,
        error: null,
        expiresAt,
      });
    } catch (error) {
      await this.playbackRepository.updateSession(playbackSessionId, {
        status: "failed",
        error:
          error instanceof Error ? error.message : "Playback resolution failed unexpectedly.",
      });
    }
  }

  private async ensurePlaybackResolution(playbackSessionId: string) {
    const existing = this.playbackResolutionJobs.get(playbackSessionId);
    if (existing) {
      return existing;
    }

    const job = this.resolvePlaybackSession(playbackSessionId).finally(() => {
      this.playbackResolutionJobs.delete(playbackSessionId);
    });
    this.playbackResolutionJobs.set(playbackSessionId, job);
    return job;
  }

  private async doCreatePlaybackSession(
    userId: string,
    input: CreatePlaybackSessionInput,
  ): Promise<PlaybackSession> {
    const { provider } = await this.providers.getProviderWithPreferences(userId, input.providerId);
    const existingSession = await this.playbackRepository.findLatestSession(
      userId,
      input.providerId,
      input.externalAnimeId,
      input.externalEpisodeId,
    );

    if (existingSession && shouldReusePlaybackSession(existingSession)) {
      if (existingSession.status === "resolving") {
        void this.ensurePlaybackResolution(existingSession.id);
      }

      return toPlaybackSession(existingSession);
    }

    const session = await this.playbackRepository.createSession({
      userId,
      libraryItemId: input.libraryItemId,
      providerId: input.providerId,
      externalAnimeId: input.externalAnimeId,
      externalEpisodeId: input.externalEpisodeId,
      status: "resolving",
      proxyMode: "proxy",
      headers: {},
      cookies: {},
      subtitles: [],
      expiresAt: new Date(Date.now() + this.runtime.getPlaybackCacheTtlMs(provider)),
    });

    const resolutionJob = this.ensurePlaybackResolution(session.id);
    const resolvedWithinBudget = await Promise.race([
      resolutionJob.then(() => true),
      new Promise<false>((resolve) =>
        setTimeout(() => resolve(false), PLAYBACK_ATTEMPT_TIMEOUT_MS),
      ),
    ]);

    const latest = await this.playbackRepository.getSession(userId, session.id);
    if (!latest) {
      throw Object.assign(new Error("Playback session not found after creation"), {
        statusCode: 500,
      });
    }

    if (!resolvedWithinBudget && latest.status === "resolving") {
      return toPlaybackSession(latest);
    }

    return toPlaybackSession(await this.maybeFinalizePlaybackSessionState(latest));
  }

  private async doGetPlaybackSession(userId: string, playbackSessionId: string) {
    const row = await this.playbackRepository.getSession(userId, playbackSessionId);
    if (!row) {
      return null;
    }

    const updated = await this.maybeFinalizePlaybackSessionState(row);
    if (updated.status === "resolving") {
      void this.ensurePlaybackResolution(updated.id);
    }

    return toPlaybackSession(updated);
  }

  private async doGetPlaybackSessionBySessionId(playbackSessionId: string) {
    const row = await this.playbackRepository.getSessionById(playbackSessionId);
    if (!row) {
      return null;
    }

    const updated = await this.maybeFinalizePlaybackSessionState(row);
    if (updated.status === "resolving") {
      void this.ensurePlaybackResolution(updated.id);
    }

    return toPlaybackSession(updated);
  }

  private async doGetPlaybackStreamTarget(
    row: PlaybackSessionRow | null,
    requestPath?: string | null,
  ): Promise<StreamTarget> {
    if (!row) {
      throw Object.assign(new Error("Playback session not found"), { statusCode: 404 });
    }

    const updated = await this.maybeFinalizePlaybackSessionState(row);
    if (updated.status !== "ready" || !updated.upstreamUrl) {
      throw Object.assign(new Error("Playback session is not ready"), { statusCode: 409 });
    }

    return toStreamTarget(updated, requestPath);
  }

  private async doGetPlaybackSubtitleTrack(
    row: PlaybackSessionRow | null,
    index: number,
  ): Promise<PlaybackSubtitleTrack> {
    if (!row) {
      throw Object.assign(new Error("Playback session not found"), { statusCode: 404 });
    }

    const updated = await this.maybeMarkPlaybackExpired(row);
    if (updated.status !== "ready") {
      throw Object.assign(new Error("Playback session is not ready"), { statusCode: 409 });
    }

    return resolvePlaybackSubtitleTrack(updated, index);
  }

  private async doUpdatePlaybackProgress(
    userId: string,
    playbackSessionId: string,
    input: UpdatePlaybackProgressInput,
  ) {
    const session = await this.playbackRepository.getSession(userId, playbackSessionId);
    if (!session) {
      throw Object.assign(new Error("Playback session not found"), { statusCode: 404 });
    }

    const threshold = (await this.providers.getPreferences(userId)).watchedThresholdPercent;
    const duration = input.durationSeconds ?? null;
    const percentComplete =
      duration && duration > 0
        ? Math.min(100, Math.round((input.positionSeconds / duration) * 100))
        : 0;
    const completed = percentComplete >= threshold;
    const watchedAt = new Date();

    const existingProgress = await this.libraryRepository.findWatchProgress(
      userId,
      session.providerId,
      session.externalAnimeId,
      session.externalEpisodeId,
    );

    if (existingProgress) {
      await this.libraryRepository.updateWatchProgress(existingProgress.id, {
        positionSeconds: input.positionSeconds,
        durationSeconds: duration,
        percentComplete,
        completed,
        updatedAt: watchedAt,
      });
    } else {
      await this.libraryRepository.createWatchProgress({
        userId,
        libraryItemId: session.libraryItemId,
        providerId: session.providerId,
        externalAnimeId: session.externalAnimeId,
        externalEpisodeId: session.externalEpisodeId,
        positionSeconds: input.positionSeconds,
        durationSeconds: duration,
        percentComplete,
        completed,
        updatedAt: watchedAt,
      });
    }

    const [anime, episode] = await Promise.all([
      this.catalogRepository.findAnime(session.providerId, session.externalAnimeId),
      this.catalogRepository.findEpisode(
        session.providerId,
        session.externalAnimeId,
        session.externalEpisodeId,
      ),
    ]);

    const libraryTarget =
      session.libraryItemId !== null
        ? { id: session.libraryItemId }
        : await this.libraryRepository.findLibraryItemIdByAnime(
            userId,
            session.providerId,
            session.externalAnimeId,
          );

    if (libraryTarget) {
      await this.libraryRepository.updateLibraryItemResume(userId, libraryTarget.id, {
        lastEpisodeNumber: episode?.number ?? null,
        watchedAt,
      });
    }

    await this.historyRepository.createHistoryEntry({
      userId,
      libraryItemId: libraryTarget?.id ?? session.libraryItemId,
      providerId: session.providerId,
      externalAnimeId: session.externalAnimeId,
      externalEpisodeId: session.externalEpisodeId,
      animeTitle: anime?.title ?? "Unknown anime",
      episodeTitle: episode?.title ?? "Episode",
      coverImage: anime?.coverImage ?? null,
      watchedAt,
      positionSeconds: input.positionSeconds,
      durationSeconds: duration,
      completed,
    });

    await this.playbackRepository.updateSession(playbackSessionId, {
      positionSeconds: input.positionSeconds,
    });

    return {
      completed,
      percentComplete,
      becameCompleted: completed && !existingProgress?.completed,
    };
  }

  private async doGetWatchContext(
    userId: string,
    input: CreatePlaybackSessionInput,
  ): Promise<WatchPageContext> {
    const detail = await this.catalog.getAnimeDetailView(
      userId,
      input.providerId,
      input.externalAnimeId,
    );

    const libraryItem =
      input.libraryItemId !== null
        ? await this.library.getLibraryItemById(userId, input.libraryItemId)
        : detail.libraryItem;

    const currentEpisode = detail.episodes.find(
      (episode) => episode.externalEpisodeId === input.externalEpisodeId,
    );
    if (!currentEpisode) {
      throw Object.assign(new Error("Episode not found for this anime."), { statusCode: 404 });
    }

    const orderedEpisodes = [...detail.episodes].sort((left, right) => left.number - right.number);
    const currentIndex = orderedEpisodes.findIndex(
      (episode) => episode.externalEpisodeId === input.externalEpisodeId,
    );
    const nextEpisode = currentIndex >= 0 ? orderedEpisodes[currentIndex + 1] ?? null : null;

    return {
      anime: detail.anime,
      libraryItem,
      currentEpisode: {
        ...currentEpisode,
        isCurrent: true,
        isNowPlaying: true,
      },
      nextEpisode:
        nextEpisode !== null
          ? {
              ...nextEpisode,
              isCurrent: false,
              isNowPlaying: false,
            }
          : null,
      episodes: detail.episodes.map((episode) => ({
        ...episode,
        isCurrent: episode.externalEpisodeId === input.externalEpisodeId,
        isNowPlaying: episode.externalEpisodeId === input.externalEpisodeId,
      })),
    };
  }
}
