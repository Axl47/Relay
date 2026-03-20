import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type {
  AnimeDetailView,
  AnimeDetails,
  AssignCategoriesInput,
  AuthBootstrapInput,
  AuthLoginInput,
  AuthResponse,
  CatalogSearchProviderResult,
  CatalogSearchResponse,
  Category,
  CreateCategoryInput,
  CreatePlaybackSessionInput,
  EpisodeList,
  EpisodeListItemView,
  EpisodeProgress,
  EpisodeWatchState,
  GroupedHistoryResponse,
  HistoryEntry,
  HistoryEntryView,
  LibraryItemWithCategories,
  LibraryDashboardItem,
  LibraryDashboardResponse,
  PlaybackProxyMode,
  PlaybackSession,
  PlaybackSessionStatus,
  ProviderContentClass,
  ProviderHealth,
  ProviderSummary,
  SearchInput,
  UpdateCategoryInput,
  UpdateLibraryItemInput,
  UpdatePlaybackProgressInput,
  UpdateProviderConfigInput,
  UpdateUserPreferencesInput,
  UpsertLibraryItemInput,
  UserPreferences,
  WatchPageContext,
} from "@relay/contracts";
import { userPreferencesSchema } from "@relay/contracts";
import {
  createHealthyProviderHealth,
  createProviderRequestContext,
} from "@relay/provider-sdk";
import type { ProviderRegistry, RelayProvider } from "@relay/provider-sdk";
import { createProviderRegistry } from "@relay/providers";
import { db } from "../db/client";
import { HttpBrowserBrokerClient } from "../modules/providers/browser-broker-client";
import {
  categories,
  categoryItems,
  catalogAnime,
  catalogEpisode,
  historyEntries,
  importJobs,
  libraryItems,
  playbackSessions,
  providerConfigs,
  providerHealthEvents,
  providers,
  sessions,
  trackerAccounts,
  trackerEntries,
  userPreferences,
  users,
  watchProgress,
} from "../db/schema";
import { appConfig } from "../config";
import { hashPassword, verifyPassword } from "../lib/auth";

const DEFAULT_PREFERENCES: UserPreferences = userPreferencesSchema.parse({});
const SEARCH_TIMEOUT_MS = {
  http: 8_000,
  browser: 20_000,
} as const;
const PLAYBACK_ATTEMPT_TIMEOUT_MS = 2_000;
const PROVIDER_RESOLUTION_TIMEOUT_MS = {
  http: 12_000,
  browser: 25_000,
} as const;
const HANIME_PLAYBACK_RESOLUTION_TIMEOUT_MS = 60_000;
const ANIMETAKE_SEARCH_TIMEOUT_MS = 45_000;
const ANIMETAKE_RESOLUTION_TIMEOUT_MS = 45_000;
const ANIMETAKE_CATALOG_TIMEOUT_MS = 6_000;
const PLAYBACK_STALL_GRACE_MS = 5_000;

type SessionUser = {
  id: string;
  email: string;
  displayName: string;
  isAdmin: boolean;
};

type PlaybackSessionRow = typeof playbackSessions.$inferSelect;
type WatchProgressRow = typeof watchProgress.$inferSelect;
type CatalogEpisodeRow = typeof catalogEpisode.$inferSelect;

type StreamTarget = {
  sessionId: string;
  providerId: string;
  upstreamUrl: string;
  mimeType: string | null;
  proxyMode: PlaybackProxyMode;
  headers: Record<string, string>;
  cookies: Record<string, string>;
};

const ABSOLUTE_UPSTREAM_PATH_PREFIX = "__upstream__/";
const ABSOLUTE_UPSTREAM_ALIAS_SUFFIX_PATTERN = /~relay\.(?:mp4|ts|m3u8|m3u|vtt|srt|ass)$/i;

type SubtitleTrack = PlaybackSession["subtitles"][number];
type CatalogAnimeRow = typeof catalogAnime.$inferSelect;
type CatalogSearchProgressStart = {
  totalProviders: number;
};
type CatalogSearchProgressUpdate = {
  completedProviders: number;
  totalProviders: number;
  providerResult: CatalogSearchProviderResult;
};
type CatalogSearchProgressHandlers = {
  onStart?: (payload: CatalogSearchProgressStart) => void | Promise<void>;
  onProviderResult?: (payload: CatalogSearchProgressUpdate) => void | Promise<void>;
};

class ProviderTimeoutError extends Error {
  constructor(providerId: string, timeoutMs: number) {
    super(`Provider "${providerId}" exceeded timeout after ${timeoutMs}ms.`);
    this.name = "ProviderTimeoutError";
  }
}

export class RelayService {
  private readonly registryPromise: Promise<ProviderRegistry>;
  private readonly playbackResolutionJobs = new Map<string, Promise<void>>();
  private readonly browserBroker = new HttpBrowserBrokerClient(appConfig.BROWSER_SERVICE_URL);

  constructor() {
    this.registryPromise = createProviderRegistry();
  }

  private async registry() {
    return this.registryPromise;
  }

  private normalizePreferences(input: Partial<UserPreferences>): UserPreferences {
    const parsed = userPreferencesSchema.parse({
      ...DEFAULT_PREFERENCES,
      ...input,
    });

    const allowed = new Set(parsed.allowedContentClasses);
    allowed.add("anime");

    if (!parsed.adultContentVisible) {
      return {
        ...parsed,
        adultContentVisible: false,
        allowedContentClasses: ["anime"],
      };
    }

    return {
      ...parsed,
      allowedContentClasses: Array.from(allowed).filter(
        (value): value is ProviderContentClass =>
          value === "anime" || value === "hentai" || value === "jav",
      ),
    };
  }

  private isAdultContentClass(contentClass: ProviderContentClass) {
    return contentClass === "hentai" || contentClass === "jav";
  }

  private isContentClassAllowed(
    preferences: UserPreferences,
    contentClass: ProviderContentClass,
  ) {
    if (!preferences.allowedContentClasses.includes(contentClass)) {
      return false;
    }

    if (this.isAdultContentClass(contentClass) && !preferences.adultContentVisible) {
      return false;
    }

    return true;
  }

  private async getProviderOrThrow(providerId: string): Promise<RelayProvider> {
    const provider = (await this.registry()).get(providerId);
    if (!provider) {
      throw Object.assign(new Error(`Unknown provider: ${providerId}`), { statusCode: 404 });
    }
    return provider;
  }

  private async getProviderWithPreferences(
    userId: string,
    providerId: string,
  ): Promise<{ provider: RelayProvider; preferences: UserPreferences }> {
    const [provider, preferences] = await Promise.all([
      this.getProviderOrThrow(providerId),
      this.getPreferences(userId),
    ]);

    if (!this.isContentClassAllowed(preferences, provider.metadata.contentClass)) {
      throw Object.assign(new Error("Adult provider access is disabled for this account."), {
        statusCode: 403,
      });
    }

    return { provider, preferences };
  }

  private async withProviderTimeout<T>(
    provider: RelayProvider,
    timeoutMs: number,
    executor: (provider: RelayProvider, signal: AbortSignal) => Promise<T>,
  ) {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const task = executor(provider, controller.signal);
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(new ProviderTimeoutError(provider.metadata.id, timeoutMs));
      }, timeoutMs);
    });

    try {
      return await Promise.race([task, timeoutPromise]);
    } catch (error) {
      if (controller.signal.aborted) {
        throw new ProviderTimeoutError(provider.metadata.id, timeoutMs);
      }
      throw error;
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  private createProviderContext(signal?: AbortSignal) {
    return createProviderRequestContext({
      signal,
      browser: this.browserBroker,
    });
  }

  private getPlaybackSessionStreamUrl(sessionId: string, mimeType: string | null) {
    const suffix = mimeType === "application/dash+xml" ? "/" : "";
    return `${appConfig.PUBLIC_API_URL}/stream/${sessionId}${suffix}`;
  }

  private decodeAbsoluteUpstreamRequestPath(requestPath: string) {
    const encodedUrl = requestPath
      .slice(ABSOLUTE_UPSTREAM_PATH_PREFIX.length)
      .replace(ABSOLUTE_UPSTREAM_ALIAS_SUFFIX_PATTERN, "");
    return decodeURIComponent(encodedUrl);
  }

  private getPlaybackCacheTtlMs(provider: RelayProvider) {
    return provider.metadata.executionMode === "browser" ? 15 * 60 * 1000 : 30 * 60 * 1000;
  }

  private getProviderSearchTimeout(provider: RelayProvider) {
    if (provider.metadata.id === "animetake") {
      return ANIMETAKE_SEARCH_TIMEOUT_MS;
    }

    return SEARCH_TIMEOUT_MS[provider.metadata.executionMode];
  }

  private toAnimeDetailsFromCatalogRow(row: CatalogAnimeRow, provider: RelayProvider): AnimeDetails {
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
      tags: Array.isArray(row.tags) ? row.tags.filter((tag): tag is string => typeof tag === "string") : [],
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
          title: row.title,
          synopsis: row.synopsis,
          thumbnail: row.thumbnail,
          durationSeconds: row.durationSeconds,
          releasedAt: row.releasedAt ? row.releasedAt.toISOString() : null,
        }))
        .sort((left, right) => {
          if (left.number !== right.number) {
            return left.number - right.number;
          }
          return left.externalEpisodeId.localeCompare(right.externalEpisodeId);
        }),
    };
  }

  private createHistoryDayLabel(day: Date, now = new Date()) {
    const current = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(day.getFullYear(), day.getMonth(), day.getDate());
    const diffDays = Math.round((current.valueOf() - target.valueOf()) / 86_400_000);

    if (diffDays === 0) {
      return "Today";
    }

    if (diffDays === 1) {
      return "Yesterday";
    }

    return new Intl.DateTimeFormat("en-US", {
      month: "long",
      day: "numeric",
    }).format(day);
  }

  private createHistoryTimeLabel(value: Date) {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
    }).format(value);
  }

  private async getLibraryItemById(userId: string, libraryItemId: string) {
    const items = await this.listLibrary(userId);
    return items.find((item) => item.id === libraryItemId) ?? null;
  }

  private async getLibraryItemByAnime(userId: string, providerId: string, externalAnimeId: string) {
    const items = await this.listLibrary(userId);
    return (
      items.find(
        (item) => item.providerId === providerId && item.externalAnimeId === externalAnimeId,
      ) ?? null
    );
  }

  private getProviderResolutionTimeout(provider: RelayProvider) {
    if (provider.metadata.id === "hanime") {
      return HANIME_PLAYBACK_RESOLUTION_TIMEOUT_MS;
    }

    if (provider.metadata.id === "animetake") {
      return ANIMETAKE_RESOLUTION_TIMEOUT_MS;
    }

    return PROVIDER_RESOLUTION_TIMEOUT_MS[provider.metadata.executionMode];
  }

  private getProviderCatalogTimeout(provider: RelayProvider) {
    if (provider.metadata.id === "animetake") {
      return ANIMETAKE_CATALOG_TIMEOUT_MS;
    }

    return null;
  }

  private humanizeAnimeId(externalAnimeId: string) {
    return externalAnimeId
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (value) => value.toUpperCase());
  }

  private buildAnimetakeFallbackAnimeDetails(
    provider: RelayProvider,
    providerId: string,
    externalAnimeId: string,
  ): AnimeDetails {
    return {
      providerId,
      providerDisplayName: provider.metadata.displayName,
      externalAnimeId,
      title: this.humanizeAnimeId(externalAnimeId) || externalAnimeId,
      synopsis: null,
      coverImage: null,
      bannerImage: null,
      status: "unknown",
      year: null,
      tags: [],
      language: "en",
      totalEpisodes: null,
      contentClass: provider.metadata.contentClass,
      requiresAdultGate: provider.metadata.requiresAdultGate,
    };
  }

  private async buildProviderHealthMap() {
    const rows = await db
      .select()
      .from(providerHealthEvents)
      .orderBy(asc(providerHealthEvents.providerId), desc(providerHealthEvents.createdAt));

    const healthByProvider = new Map<string, ProviderHealth>();
    for (const row of rows) {
      if (healthByProvider.has(row.providerId)) {
        continue;
      }

      healthByProvider.set(row.providerId, {
        providerId: row.providerId,
        status: row.status as ProviderHealth["status"],
        reason: row.reason as ProviderHealth["reason"],
        checkedAt: row.createdAt.toISOString(),
      });
    }

    return healthByProvider;
  }

  private toPlaybackSession(row: PlaybackSessionRow): PlaybackSession {
    const expired = row.expiresAt <= new Date();
    const status =
      expired && row.status !== "failed"
        ? ("expired" as PlaybackSessionStatus)
        : (row.status as PlaybackSessionStatus);

    return {
      id: row.id,
      userId: row.userId,
      providerId: row.providerId,
      externalAnimeId: row.externalAnimeId,
      externalEpisodeId: row.externalEpisodeId,
      status,
      proxyMode: row.proxyMode as PlaybackProxyMode,
      streamUrl:
        status === "ready" && row.upstreamUrl
          ? this.getPlaybackSessionStreamUrl(row.id, row.mimeType ?? null)
          : null,
      mimeType: row.mimeType ?? null,
      subtitles: row.subtitles as PlaybackSession["subtitles"],
      headers: row.headers as PlaybackSession["headers"],
      expiresAt: row.expiresAt.toISOString(),
      positionSeconds: row.positionSeconds,
      error: row.error ?? null,
    };
  }

  private async getPlaybackSessionRow(userId: string, playbackSessionId: string) {
    const [session] = await db
      .select()
      .from(playbackSessions)
      .where(and(eq(playbackSessions.id, playbackSessionId), eq(playbackSessions.userId, userId)))
      .limit(1);

    return session ?? null;
  }

  private async getPlaybackSessionRowById(playbackSessionId: string) {
    const [session] = await db
      .select()
      .from(playbackSessions)
      .where(eq(playbackSessions.id, playbackSessionId))
      .limit(1);

    return session ?? null;
  }

  private shouldReusePlaybackSession(row: PlaybackSessionRow) {
    if (row.expiresAt <= new Date()) {
      return false;
    }

    if (row.status === "failed") {
      return false;
    }

    if (row.providerId === "hstream" && row.mimeType === "application/dash+xml") {
      return false;
    }

    if (
      row.providerId === "hstream" &&
      typeof row.upstreamUrl === "string" &&
      row.upstreamUrl.includes("komako-b-str.musume-h.xyz")
    ) {
      return false;
    }

    if (row.providerId === "hanime" && row.mimeType === "text/html") {
      return false;
    }

    if (
      row.providerId === "hanime" &&
      row.mimeType === "application/vnd.apple.mpegurl" &&
      row.proxyMode === "redirect"
    ) {
      return false;
    }

    if (
      row.providerId === "hentaihaven" &&
      (row.mimeType === "text/html" || row.proxyMode !== "proxy")
    ) {
      return false;
    }

    if (
      row.providerId === "javguru" &&
      (row.mimeType === "text/html" ||
        row.mimeType === "application/vnd.apple.mpegurl" ||
        (typeof row.upstreamUrl === "string" &&
          (row.upstreamUrl.includes("creative.mnaspm.com") ||
            row.upstreamUrl.includes("/searcho/"))))
    ) {
      return false;
    }

    if (
      row.providerId === "aniwave" &&
      typeof row.upstreamUrl === "string" &&
      row.upstreamUrl.includes("shipimagesbolt.online/embed-1/")
    ) {
      return false;
    }

    if (row.providerId === "animepahe" && row.mimeType === "application/vnd.apple.mpegurl") {
      return false;
    }

    return true;
  }

  private async getAllowedProviderIdsForUser(userId: string) {
    const preferences = await this.getPreferences(userId);
    const rows = await db.select().from(providers);

    return rows
      .filter((providerRow) =>
        this.isContentClassAllowed(
          preferences,
          providerRow.contentClass as ProviderContentClass,
        ),
      )
      .map((providerRow) => providerRow.id);
  }

  private async maybeMarkPlaybackExpired(row: PlaybackSessionRow) {
    if (row.expiresAt > new Date() || row.status === "expired") {
      return row;
    }

    const [updated] = await db
      .update(playbackSessions)
      .set({ status: "expired" })
      .where(eq(playbackSessions.id, row.id))
      .returning();

    return updated ?? row;
  }

  private async maybeMarkPlaybackFailedIfStalled(row: PlaybackSessionRow) {
    if (row.status !== "resolving") {
      return row;
    }

    const provider = await this.getProviderOrThrow(row.providerId).catch(() => null);
    if (!provider) {
      return row;
    }

    const timeoutMs = this.getProviderResolutionTimeout(provider) + PLAYBACK_STALL_GRACE_MS;
    if (Date.now() - row.createdAt.valueOf() <= timeoutMs) {
      return row;
    }

    this.playbackResolutionJobs.delete(row.id);
    const [updated] = await db
      .update(playbackSessions)
      .set({
        status: "failed",
        error: `Provider "${row.providerId}" exceeded timeout after ${this.getProviderResolutionTimeout(provider)}ms.`,
      })
      .where(eq(playbackSessions.id, row.id))
      .returning();

    return updated ?? row;
  }

  private async maybeFinalizePlaybackSessionState(row: PlaybackSessionRow) {
    const expired = await this.maybeMarkPlaybackExpired(row);
    return this.maybeMarkPlaybackFailedIfStalled(expired);
  }

  private async resolvePlaybackSession(playbackSessionId: string) {
    const [session] = await db
      .select()
      .from(playbackSessions)
      .where(eq(playbackSessions.id, playbackSessionId))
      .limit(1);

    if (!session || session.status === "ready" || session.status === "expired") {
      return;
    }

    const provider = await this.getProviderOrThrow(session.providerId);
    const timeoutMs = this.getProviderResolutionTimeout(provider);

    try {
      const resolution = await this.withProviderTimeout(
        provider,
        timeoutMs,
        async (runtime, signal) =>
          runtime.resolvePlayback(
            {
              providerId: session.providerId,
              externalAnimeId: session.externalAnimeId,
              externalEpisodeId: session.externalEpisodeId,
            },
            this.createProviderContext(signal),
          ),
      );
      const stream = resolution.streams.find((item) => item.isDefault) ?? resolution.streams[0];
      if (!stream) {
        throw new Error(`Provider "${provider.metadata.id}" returned no playable streams.`);
      }

      const ttlDeadline = Date.now() + this.getPlaybackCacheTtlMs(provider);
      const expiresAt = new Date(
        Math.min(new Date(resolution.expiresAt).valueOf(), ttlDeadline),
      );

      await db
        .update(playbackSessions)
        .set({
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
        })
        .where(eq(playbackSessions.id, playbackSessionId));
    } catch (error) {
      await db
        .update(playbackSessions)
        .set({
          status: "failed",
          error:
            error instanceof Error ? error.message : "Playback resolution failed unexpectedly.",
        })
        .where(eq(playbackSessions.id, playbackSessionId));
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

  async ensureProvidersSeeded() {
    const registry = await this.registry();
    const values = registry.list().map((provider, index) => ({
      id: provider.metadata.id,
      displayName: provider.metadata.displayName,
      baseUrl: provider.metadata.baseUrl,
      contentClass: provider.metadata.contentClass,
      executionMode: provider.metadata.executionMode,
      requiresAdultGate: provider.metadata.requiresAdultGate,
      supportsSearch: provider.metadata.supportsSearch,
      supportsTrackerSync: provider.metadata.supportsTrackerSync,
      defaultEnabled: provider.metadata.defaultEnabled,
      defaultPriority: index,
    }));

    for (const value of values) {
      await db
        .insert(providers)
        .values({
          id: value.id,
          displayName: value.displayName,
          baseUrl: value.baseUrl,
          contentClass: value.contentClass,
          executionMode: value.executionMode,
          requiresAdultGate: value.requiresAdultGate,
          supportsSearch: value.supportsSearch,
          supportsTrackerSync: value.supportsTrackerSync,
          defaultEnabled: value.defaultEnabled,
        })
        .onConflictDoUpdate({
          target: providers.id,
          set: {
            displayName: value.displayName,
            baseUrl: value.baseUrl,
            contentClass: value.contentClass,
            executionMode: value.executionMode,
            requiresAdultGate: value.requiresAdultGate,
            supportsSearch: value.supportsSearch,
            supportsTrackerSync: value.supportsTrackerSync,
            defaultEnabled: value.defaultEnabled,
          },
        });
    }
  }

  async bootstrap(input: AuthBootstrapInput): Promise<AuthResponse> {
    const existingUsers = await db.select({ count: sql<number>`count(*)` }).from(users);
    if (Number(existingUsers[0]?.count ?? 0) > 0) {
      throw Object.assign(new Error("Bootstrap has already been completed"), { statusCode: 409 });
    }

    const [user] = await db
      .insert(users)
      .values({
        email: input.email,
        passwordHash: await hashPassword(input.password),
        displayName: input.displayName,
        isAdmin: true,
      })
      .returning({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        isAdmin: users.isAdmin,
      });

    await db.insert(userPreferences).values({
      userId: user.id,
      value: DEFAULT_PREFERENCES,
    });

    await this.ensureProvidersSeeded();

    const registry = await this.registry();
    for (const [priority, provider] of registry.list().entries()) {
      await db
        .insert(providerConfigs)
        .values({
          userId: user.id,
          providerId: provider.metadata.id,
          enabled: provider.metadata.defaultEnabled,
          priority,
        })
        .onConflictDoNothing();
    }

    const [session] = await db
      .insert(sessions)
      .values({
        userId: user.id,
        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      })
      .returning({ id: sessions.id });

    return {
      user,
      sessionId: session.id,
    };
  }

  async login(input: AuthLoginInput): Promise<AuthResponse> {
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        isAdmin: users.isAdmin,
        passwordHash: users.passwordHash,
      })
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1);

    if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
      throw Object.assign(new Error("Invalid email or password"), { statusCode: 401 });
    }

    const [session] = await db
      .insert(sessions)
      .values({
        userId: user.id,
        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      })
      .returning({ id: sessions.id });

    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        isAdmin: user.isAdmin,
      },
      sessionId: session.id,
    };
  }

  async logout(sessionId: string) {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
  }

  async getSessionUser(sessionId?: string | null): Promise<SessionUser | null> {
    if (!sessionId) return null;

    const [result] = await db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        isAdmin: users.isAdmin,
        expiresAt: sessions.expiresAt,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(eq(sessions.id, sessionId))
      .limit(1);

    if (!result || result.expiresAt < new Date()) {
      return null;
    }

    return {
      id: result.id,
      email: result.email,
      displayName: result.displayName,
      isAdmin: result.isAdmin,
    };
  }

  async getPreferences(userId: string) {
    const [row] = await db
      .select({ value: userPreferences.value })
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1);

    return this.normalizePreferences((row?.value as Partial<UserPreferences>) ?? DEFAULT_PREFERENCES);
  }

  async updatePreferences(userId: string, input: UpdateUserPreferencesInput) {
    const current = await this.getPreferences(userId);
    const next = this.normalizePreferences({
      ...current,
      ...input,
    });

    const [row] = await db
      .insert(userPreferences)
      .values({
        userId,
        value: next,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userPreferences.userId,
        set: {
          value: next,
          updatedAt: new Date(),
        },
      })
      .returning({ value: userPreferences.value });

    return this.normalizePreferences(row.value as Partial<UserPreferences>);
  }

  async listProviders(userId: string): Promise<ProviderSummary[]> {
    await this.ensureProvidersSeeded();

    const [preferences, registry, providerRows, configRows, healthByProvider] = await Promise.all([
      this.getPreferences(userId),
      this.registry(),
      db.select().from(providers).orderBy(asc(providers.id)),
      db.select().from(providerConfigs).where(eq(providerConfigs.userId, userId)),
      this.buildProviderHealthMap(),
    ]);

    const configByProvider = new Map(configRows.map((row) => [row.providerId, row]));
    const orderByProvider = new Map(registry.list().map((provider, index) => [provider.metadata.id, index]));

    return providerRows
      .filter((providerRow) =>
        this.isContentClassAllowed(
          preferences,
          providerRow.contentClass as ProviderContentClass,
        ),
      )
      .map((providerRow) => {
        const config = configByProvider.get(providerRow.id);
        return {
          id: providerRow.id,
          displayName: providerRow.displayName,
          baseUrl: providerRow.baseUrl,
          contentClass: providerRow.contentClass as ProviderSummary["contentClass"],
          executionMode: providerRow.executionMode as ProviderSummary["executionMode"],
          requiresAdultGate: providerRow.requiresAdultGate,
          supportsSearch: providerRow.supportsSearch,
          supportsTrackerSync: providerRow.supportsTrackerSync,
          defaultEnabled: providerRow.defaultEnabled,
          enabled: config?.enabled ?? providerRow.defaultEnabled,
          priority: config?.priority ?? orderByProvider.get(providerRow.id) ?? 0,
          health:
            healthByProvider.get(providerRow.id) ?? createHealthyProviderHealth(providerRow.id),
        };
      })
      .sort((left, right) => left.priority - right.priority);
  }

  async updateProviderConfig(
    userId: string,
    providerId: string,
    input: UpdateProviderConfigInput,
  ) {
    await this.ensureProvidersSeeded();

    const [provider, preferences, existing] = await Promise.all([
      this.getProviderOrThrow(providerId),
      this.getPreferences(userId),
      db
        .select()
        .from(providerConfigs)
        .where(and(eq(providerConfigs.userId, userId), eq(providerConfigs.providerId, providerId)))
        .limit(1)
        .then((rows) => rows[0] ?? null),
    ]);

    if (
      provider.metadata.requiresAdultGate &&
      input.enabled === true &&
      !preferences.adultContentVisible
    ) {
      throw Object.assign(
        new Error("Enable adult content in settings before turning on adult providers."),
        { statusCode: 403 },
      );
    }

    const [row] = await db
      .insert(providerConfigs)
      .values({
        userId,
        providerId,
        enabled: input.enabled ?? existing?.enabled ?? provider.metadata.defaultEnabled,
        priority: input.priority ?? existing?.priority ?? 0,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [providerConfigs.userId, providerConfigs.providerId],
        set: {
          enabled: input.enabled ?? sql`${providerConfigs.enabled}`,
          priority: input.priority ?? sql`${providerConfigs.priority}`,
          updatedAt: new Date(),
        },
      })
      .returning();

    return row;
  }

  async search(userId: string, input: SearchInput): Promise<CatalogSearchResponse> {
    return this.runCatalogSearch(userId, input);
  }

  async searchWithProgress(
    userId: string,
    input: SearchInput,
    handlers: CatalogSearchProgressHandlers,
  ): Promise<CatalogSearchResponse> {
    return this.runCatalogSearch(userId, input, handlers);
  }

  private async runCatalogSearch(
    userId: string,
    input: SearchInput,
    handlers?: CatalogSearchProgressHandlers,
  ): Promise<CatalogSearchResponse> {
    const availableProviders = await this.listProviders(userId);
    const registry = await this.registry();
    const enabledProviders = availableProviders
      .filter((provider) => provider.enabled && provider.supportsSearch)
      .sort((left, right) => left.priority - right.priority);
    const totalProviders = enabledProviders.length;
    let completedProviders = 0;

    if (handlers?.onStart) {
      await handlers.onStart({ totalProviders });
    }

    const emitProviderResult = async (providerResult: CatalogSearchProviderResult) => {
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
      enabledProviders.map(async (providerSummary): Promise<CatalogSearchProviderResult> => {
        const provider = registry.get(providerSummary.id);
        if (!provider) {
          const result: CatalogSearchProviderResult = {
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
          const page = await this.withProviderTimeout(
            provider,
            this.getProviderSearchTimeout(provider),
            async (runtime, signal) =>
              runtime.search(input, this.createProviderContext(signal)),
          );

          const result: CatalogSearchProviderResult = {
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
          const result: CatalogSearchProviderResult = {
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
      await Promise.all(
        discoveredItems.map((item) =>
          db
            .insert(catalogAnime)
            .values({
              providerId: item.providerId,
              externalAnimeId: item.externalAnimeId,
              title: item.title,
              synopsis: item.synopsis,
              coverImage: item.coverImage,
              bannerImage: item.coverImage,
              status: "unknown",
              year: item.year,
              language: item.language,
              contentClass: item.contentClass,
              requiresAdultGate: item.requiresAdultGate,
              tags: [],
              totalEpisodes: null,
              updatedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: [catalogAnime.providerId, catalogAnime.externalAnimeId],
              set: {
                title: item.title,
                synopsis: item.synopsis,
                coverImage: item.coverImage,
                bannerImage: item.coverImage,
                year: item.year,
                language: item.language,
                contentClass: item.contentClass,
                requiresAdultGate: item.requiresAdultGate,
                updatedAt: new Date(),
              },
            }),
        ),
      );
    }

    return {
      query: input.query,
      page: input.page,
      limit: input.limit,
      partial: providerResults.some((result) => result.status !== "success"),
      providers: providerResults,
      items: discoveredItems,
    };
  }

  async getAnime(userId: string, providerId: string, externalAnimeId: string): Promise<AnimeDetails> {
    const { provider } = await this.getProviderWithPreferences(userId, providerId);
    const [cachedAnime] = await db
      .select()
      .from(catalogAnime)
      .where(
        and(
          eq(catalogAnime.providerId, providerId),
          eq(catalogAnime.externalAnimeId, externalAnimeId),
        ),
      )
      .limit(1);

    if (providerId === "animeonsen" && cachedAnime) {
      return this.toAnimeDetailsFromCatalogRow(cachedAnime, provider);
    }

    const runtimeCall = () => {
      const timeoutMs = this.getProviderCatalogTimeout(provider);
      if (timeoutMs !== null) {
        return this.withProviderTimeout(
          provider,
          timeoutMs,
          (runtime, signal) =>
            runtime.getAnime(
              { providerId, externalAnimeId },
              this.createProviderContext(signal),
            ),
        );
      }

      return provider.getAnime(
        { providerId, externalAnimeId },
        this.createProviderContext(),
      );
    };

    const anime = await runtimeCall().catch((error) => {
      if (cachedAnime) {
        return this.toAnimeDetailsFromCatalogRow(cachedAnime, provider);
      }

      if (providerId === "animetake") {
        return this.buildAnimetakeFallbackAnimeDetails(provider, providerId, externalAnimeId);
      }

      throw error;
    });

    await db
      .insert(catalogAnime)
      .values({
        providerId,
        externalAnimeId,
        title: anime.title,
        synopsis: anime.synopsis,
        coverImage: anime.coverImage,
        bannerImage: anime.bannerImage,
        status: anime.status,
        year: anime.year,
        language: anime.language,
        contentClass: anime.contentClass,
        requiresAdultGate: anime.requiresAdultGate,
        tags: anime.tags,
        totalEpisodes: anime.totalEpisodes,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [catalogAnime.providerId, catalogAnime.externalAnimeId],
        set: {
          title: anime.title,
          synopsis: anime.synopsis,
          coverImage: anime.coverImage,
          bannerImage: anime.bannerImage,
          status: anime.status,
          year: anime.year,
          language: anime.language,
          contentClass: anime.contentClass,
          requiresAdultGate: anime.requiresAdultGate,
          tags: anime.tags,
          totalEpisodes: anime.totalEpisodes,
          updatedAt: new Date(),
        },
      });

    return anime;
  }

  async getEpisodes(
    userId: string,
    providerId: string,
    externalAnimeId: string,
  ): Promise<EpisodeList> {
    const { provider } = await this.getProviderWithPreferences(userId, providerId);
    const cachedEpisodeRows = await db
      .select()
      .from(catalogEpisode)
      .where(
        and(
          eq(catalogEpisode.providerId, providerId),
          eq(catalogEpisode.externalAnimeId, externalAnimeId),
        ),
      )
      .orderBy(asc(catalogEpisode.number), asc(catalogEpisode.externalEpisodeId));

    const cachedEpisodeList = cachedEpisodeRows.length > 0
      ? this.toEpisodeListFromCatalogRows(providerId, externalAnimeId, cachedEpisodeRows)
      : null;

    const runtimeCall = () => {
      const timeoutMs = this.getProviderCatalogTimeout(provider);
      if (timeoutMs !== null) {
        return this.withProviderTimeout(
          provider,
          timeoutMs,
          (runtime, signal) =>
            runtime.getEpisodes(
              { providerId, externalAnimeId },
              this.createProviderContext(signal),
            ),
        );
      }

      return provider.getEpisodes(
        { providerId, externalAnimeId },
        this.createProviderContext(),
      );
    };

    const payload = await runtimeCall().catch((error) => {
      if (cachedEpisodeList) {
        return cachedEpisodeList;
      }

      throw error;
    });

    for (const episode of payload.episodes) {
      await db
        .insert(catalogEpisode)
        .values({
          providerId,
          externalAnimeId,
          externalEpisodeId: episode.externalEpisodeId,
          number: Math.round(episode.number),
          title: episode.title,
          synopsis: episode.synopsis,
          thumbnail: episode.thumbnail,
          durationSeconds: episode.durationSeconds,
          releasedAt: episode.releasedAt ? new Date(episode.releasedAt) : null,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            catalogEpisode.providerId,
            catalogEpisode.externalAnimeId,
            catalogEpisode.externalEpisodeId,
          ],
          set: {
            number: Math.round(episode.number),
            title: episode.title,
            synopsis: episode.synopsis,
            thumbnail: episode.thumbnail,
            durationSeconds: episode.durationSeconds,
            releasedAt: episode.releasedAt ? new Date(episode.releasedAt) : null,
            updatedAt: new Date(),
          },
        });
    }

    return payload;
  }

  async getAnimeDetailView(
    userId: string,
    providerId: string,
    externalAnimeId: string,
  ): Promise<AnimeDetailView> {
    const [anime, episodeList, libraryItem] = await Promise.all([
      this.getAnime(userId, providerId, externalAnimeId),
      this.getEpisodes(userId, providerId, externalAnimeId),
      this.getLibraryItemByAnime(userId, providerId, externalAnimeId),
    ]);

    const progressRows = await db
      .select()
      .from(watchProgress)
      .where(
        and(
          eq(watchProgress.userId, userId),
          eq(watchProgress.providerId, providerId),
          eq(watchProgress.externalAnimeId, externalAnimeId),
        ),
      )
      .orderBy(desc(watchProgress.updatedAt));

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
        currentEpisodeId: inProgressEpisode?.externalEpisodeId ?? latestEpisode?.externalEpisodeId ?? null,
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

  async getWatchContext(
    userId: string,
    input: CreatePlaybackSessionInput,
  ): Promise<WatchPageContext> {
    const detail = await this.getAnimeDetailView(
      userId,
      input.providerId,
      input.externalAnimeId,
    );

    const libraryItem =
      input.libraryItemId !== null
        ? await this.getLibraryItemById(userId, input.libraryItemId)
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

  async getLibraryDashboard(userId: string): Promise<LibraryDashboardResponse> {
    const [items, categories] = await Promise.all([
      this.listLibrary(userId),
      this.listCategories(userId),
    ]);

    if (items.length === 0) {
      return {
        continueWatching: [],
        recentlyAdded: [],
        allItems: [],
        categories,
      };
    }

    const allowedProviderIds = await this.getAllowedProviderIdsForUser(userId);
    const progressRows =
      allowedProviderIds.length > 0
        ? await db
            .select()
            .from(watchProgress)
            .where(
              and(
                eq(watchProgress.userId, userId),
                inArray(watchProgress.providerId, allowedProviderIds),
              ),
            )
            .orderBy(desc(watchProgress.updatedAt))
        : [];

    const progressByLibraryItem = new Map<string, WatchProgressRow>();
    const progressByAnime = new Map<string, WatchProgressRow>();

    for (const row of progressRows) {
      if (row.libraryItemId && !progressByLibraryItem.has(row.libraryItemId)) {
        progressByLibraryItem.set(row.libraryItemId, row);
      }

      const animeKey = `${row.providerId}:${row.externalAnimeId}`;
      if (!progressByAnime.has(animeKey)) {
        progressByAnime.set(animeKey, row);
      }
    }

    const enrichedItems = await Promise.all(
      items.map(async (item): Promise<LibraryDashboardItem> => {
        const progress =
          progressByLibraryItem.get(item.id) ??
          progressByAnime.get(`${item.providerId}:${item.externalAnimeId}`) ??
          null;

        const [animeRow, episodeRow] = await Promise.all([
          db
            .select()
            .from(catalogAnime)
            .where(
              and(
                eq(catalogAnime.providerId, item.providerId),
                eq(catalogAnime.externalAnimeId, item.externalAnimeId),
              ),
            )
            .limit(1)
            .then((rows) => rows[0] ?? null),
          progress
            ? db
                .select()
                .from(catalogEpisode)
                .where(
                  and(
                    eq(catalogEpisode.providerId, progress.providerId),
                    eq(catalogEpisode.externalAnimeId, progress.externalAnimeId),
                    eq(catalogEpisode.externalEpisodeId, progress.externalEpisodeId),
                  ),
                )
                .limit(1)
                .then((rows) => rows[0] ?? null)
            : Promise.resolve(null),
        ]);

        return {
          ...item,
          totalEpisodes: animeRow?.totalEpisodes ?? null,
          progress: this.toEpisodeProgress(progress),
          currentEpisodeId: progress?.externalEpisodeId ?? null,
          currentEpisodeNumber: episodeRow?.number ?? item.lastEpisodeNumber ?? null,
          currentEpisodeTitle: episodeRow?.title ?? null,
          isComplete: progress?.completed ?? item.status === "completed",
        };
      }),
    );

    const continueWatching = enrichedItems
      .filter((item) => item.progress && !item.isComplete)
      .sort((left, right) => {
        const leftValue = left.progress ? new Date(left.progress.updatedAt).valueOf() : 0;
        const rightValue = right.progress ? new Date(right.progress.updatedAt).valueOf() : 0;
        return rightValue - leftValue;
      })
      .slice(0, 6);

    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recentlyAdded = enrichedItems
      .filter((item) => new Date(item.addedAt).valueOf() >= thirtyDaysAgo)
      .sort((left, right) => new Date(right.addedAt).valueOf() - new Date(left.addedAt).valueOf())
      .slice(0, 6);

    const allItems = [...enrichedItems].sort((left, right) => {
      const leftValue = left.lastWatchedAt ? new Date(left.lastWatchedAt).valueOf() : 0;
      const rightValue = right.lastWatchedAt ? new Date(right.lastWatchedAt).valueOf() : 0;
      if (leftValue !== rightValue) {
        return rightValue - leftValue;
      }

      return left.title.localeCompare(right.title);
    });

    return {
      continueWatching,
      recentlyAdded,
      allItems,
      categories,
    };
  }

  async getGroupedHistory(userId: string): Promise<GroupedHistoryResponse> {
    const entries = await this.getHistory(userId);
    const groups = new Map<string, { key: string; label: string; entries: HistoryEntryView[] }>();

    for (const entry of entries) {
      const watchedAt = new Date(entry.watchedAt);
      const dayKey = watchedAt.toISOString().slice(0, 10);
      const dayLabel = this.createHistoryDayLabel(watchedAt);
      const timeLabel = this.createHistoryTimeLabel(watchedAt);
      const view: HistoryEntryView = {
        ...entry,
        dayKey,
        dayLabel,
        timeLabel,
      };

      const current = groups.get(dayKey) ?? {
        key: dayKey,
        label: dayLabel,
        entries: [],
      };
      current.entries.push(view);
      groups.set(dayKey, current);
    }

    return {
      groups: Array.from(groups.values()),
    };
  }

  async listLibrary(userId: string): Promise<LibraryItemWithCategories[]> {
    const allowedProviderIds = await this.getAllowedProviderIdsForUser(userId);
    if (allowedProviderIds.length === 0) {
      return [];
    }

    const items = await db
      .select()
      .from(libraryItems)
      .where(
        and(eq(libraryItems.userId, userId), inArray(libraryItems.providerId, allowedProviderIds)),
      )
      .orderBy(desc(libraryItems.updatedAt));

    const ids = items.map((item) => item.id);
    if (ids.length === 0) return [];

    const assignments = await db
      .select({
        libraryItemId: categoryItems.libraryItemId,
        categoryId: categories.id,
        name: categories.name,
        position: categories.position,
      })
      .from(categoryItems)
      .innerJoin(categories, eq(categories.id, categoryItems.categoryId))
      .where(inArray(categoryItems.libraryItemId, ids));

    const categoriesByItem = new Map<string, Array<{ id: string; name: string; position: number }>>();
    for (const assignment of assignments) {
      const current = categoriesByItem.get(assignment.libraryItemId) ?? [];
      current.push({
        id: assignment.categoryId,
        name: assignment.name,
        position: assignment.position,
      });
      categoriesByItem.set(assignment.libraryItemId, current);
    }

    return items.map((item) => ({
      id: item.id,
      userId: item.userId,
      providerId: item.providerId,
      externalAnimeId: item.externalAnimeId,
      title: item.title,
      coverImage: item.coverImage,
      status: item.status as LibraryItemWithCategories["status"],
      addedAt: item.addedAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      lastEpisodeNumber: item.lastEpisodeNumber,
      lastWatchedAt: item.lastWatchedAt?.toISOString() ?? null,
      categories: categoriesByItem.get(item.id) ?? [],
    }));
  }

  async addLibraryItem(userId: string, input: UpsertLibraryItemInput) {
    await this.getProviderWithPreferences(userId, input.providerId);

    const [item] = await db
      .insert(libraryItems)
      .values({
        userId,
        providerId: input.providerId,
        externalAnimeId: input.externalAnimeId,
        title: input.title,
        coverImage: input.coverImage,
        status: input.status,
      })
      .returning();

    return item;
  }

  async updateLibraryItem(userId: string, libraryItemId: string, input: UpdateLibraryItemInput) {
    const [item] = await db
      .update(libraryItems)
      .set({
        title: input.title,
        coverImage: input.coverImage,
        status: input.status,
        updatedAt: new Date(),
      })
      .where(and(eq(libraryItems.userId, userId), eq(libraryItems.id, libraryItemId)))
      .returning();

    return item;
  }

  async deleteLibraryItem(userId: string, libraryItemId: string) {
    await db
      .delete(libraryItems)
      .where(and(eq(libraryItems.userId, userId), eq(libraryItems.id, libraryItemId)));
  }

  async listCategories(userId: string): Promise<Category[]> {
    const rows = await db
      .select()
      .from(categories)
      .where(eq(categories.userId, userId))
      .orderBy(asc(categories.position), asc(categories.createdAt));

    return rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      name: row.name,
      position: row.position,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async createCategory(userId: string, input: CreateCategoryInput): Promise<Category> {
    const [{ nextPosition }] = await db
      .select({
        nextPosition: sql<number>`coalesce(max(${categories.position}), -1) + 1`,
      })
      .from(categories)
      .where(eq(categories.userId, userId));

    const [category] = await db
      .insert(categories)
      .values({
        userId,
        name: input.name,
        position: Number(nextPosition ?? 0),
      })
      .returning();

    return {
      id: category.id,
      userId: category.userId,
      name: category.name,
      position: category.position,
      createdAt: category.createdAt.toISOString(),
      updatedAt: category.updatedAt.toISOString(),
    };
  }

  async updateCategory(userId: string, categoryId: string, input: UpdateCategoryInput) {
    const [category] = await db
      .update(categories)
      .set({
        name: input.name,
        position: input.position,
        updatedAt: new Date(),
      })
      .where(and(eq(categories.userId, userId), eq(categories.id, categoryId)))
      .returning();

    return category;
  }

  async assignCategories(userId: string, libraryItemId: string, input: AssignCategoriesInput) {
    await db
      .delete(categoryItems)
      .where(
        and(
          eq(categoryItems.libraryItemId, libraryItemId),
          inArray(
            categoryItems.categoryId,
            db
              .select({ id: categories.id })
              .from(categories)
              .where(eq(categories.userId, userId)),
          ),
        ),
      );

    for (const categoryId of input.categoryIds) {
      await db.insert(categoryItems).values({ categoryId, libraryItemId }).onConflictDoNothing();
    }
  }

  async createPlaybackSession(
    userId: string,
    input: CreatePlaybackSessionInput,
  ): Promise<PlaybackSession> {
    const { provider } = await this.getProviderWithPreferences(userId, input.providerId);
    const [existingSession] = await db
      .select()
      .from(playbackSessions)
      .where(
        and(
          eq(playbackSessions.userId, userId),
          eq(playbackSessions.providerId, input.providerId),
          eq(playbackSessions.externalAnimeId, input.externalAnimeId),
          eq(playbackSessions.externalEpisodeId, input.externalEpisodeId),
        ),
      )
      .orderBy(desc(playbackSessions.createdAt))
      .limit(1);

    if (existingSession && this.shouldReusePlaybackSession(existingSession)) {
      if (existingSession.status === "resolving") {
        void this.ensurePlaybackResolution(existingSession.id);
      }

      return this.toPlaybackSession(existingSession);
    }

    const [session] = await db
      .insert(playbackSessions)
      .values({
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
        expiresAt: new Date(Date.now() + this.getPlaybackCacheTtlMs(provider)),
      })
      .returning();

    const resolutionJob = this.ensurePlaybackResolution(session.id);
    const resolvedWithinBudget = await Promise.race([
      resolutionJob.then(() => true),
      new Promise<false>((resolve) => setTimeout(() => resolve(false), PLAYBACK_ATTEMPT_TIMEOUT_MS)),
    ]);

    const latest = await this.getPlaybackSessionRow(userId, session.id);
    if (!latest) {
      throw Object.assign(new Error("Playback session not found after creation"), {
        statusCode: 500,
      });
    }

    if (!resolvedWithinBudget && latest.status === "resolving") {
      return this.toPlaybackSession(latest);
    }

    return this.toPlaybackSession(await this.maybeFinalizePlaybackSessionState(latest));
  }

  async getPlaybackSession(userId: string, playbackSessionId: string): Promise<PlaybackSession | null> {
    const row = await this.getPlaybackSessionRow(userId, playbackSessionId);
    if (!row) return null;

    const updated = await this.maybeFinalizePlaybackSessionState(row);
    if (updated.status === "resolving") {
      void this.ensurePlaybackResolution(updated.id);
    }

    return this.toPlaybackSession(updated);
  }

  async getPlaybackStreamTarget(
    userId: string,
    playbackSessionId: string,
    requestPath?: string | null,
  ): Promise<StreamTarget> {
    const row = await this.getPlaybackSessionRow(userId, playbackSessionId);
    if (!row) {
      throw Object.assign(new Error("Playback session not found"), { statusCode: 404 });
    }

    const updated = await this.maybeFinalizePlaybackSessionState(row);
    if (updated.status !== "ready" || !updated.upstreamUrl) {
      throw Object.assign(new Error("Playback session is not ready"), { statusCode: 409 });
    }

    const targetUrl =
      requestPath && requestPath.length > 0
        ? requestPath.startsWith(ABSOLUTE_UPSTREAM_PATH_PREFIX)
          ? this.decodeAbsoluteUpstreamRequestPath(requestPath)
          : new URL(requestPath, updated.upstreamUrl).toString()
        : updated.upstreamUrl;

    return {
      sessionId: updated.id,
      providerId: updated.providerId,
      upstreamUrl: targetUrl,
      mimeType: updated.mimeType ?? null,
      proxyMode: updated.proxyMode as PlaybackProxyMode,
      headers: updated.headers as Record<string, string>,
      cookies: updated.cookies as Record<string, string>,
    };
  }

  async getPlaybackStreamTargetBySessionId(
    playbackSessionId: string,
    requestPath?: string | null,
  ): Promise<StreamTarget> {
    const row = await this.getPlaybackSessionRowById(playbackSessionId);
    if (!row) {
      throw Object.assign(new Error("Playback session not found"), { statusCode: 404 });
    }

    const updated = await this.maybeFinalizePlaybackSessionState(row);
    if (updated.status !== "ready" || !updated.upstreamUrl) {
      throw Object.assign(new Error("Playback session is not ready"), { statusCode: 409 });
    }

    const targetUrl =
      requestPath && requestPath.length > 0
        ? requestPath.startsWith(ABSOLUTE_UPSTREAM_PATH_PREFIX)
          ? this.decodeAbsoluteUpstreamRequestPath(requestPath)
          : new URL(requestPath, updated.upstreamUrl).toString()
        : updated.upstreamUrl;

    return {
      sessionId: updated.id,
      providerId: updated.providerId,
      upstreamUrl: targetUrl,
      mimeType: updated.mimeType ?? null,
      proxyMode: updated.proxyMode as PlaybackProxyMode,
      headers: updated.headers as Record<string, string>,
      cookies: updated.cookies as Record<string, string>,
    };
  }

  private resolvePlaybackSubtitleTrack(row: PlaybackSessionRow, index: number): SubtitleTrack {
    if (!Number.isInteger(index) || index < 0) {
      throw Object.assign(new Error("Subtitle track index must be a non-negative integer"), {
        statusCode: 400,
      });
    }

    const subtitles = row.subtitles as PlaybackSession["subtitles"];
    const subtitle = subtitles[index];
    if (!subtitle) {
      throw Object.assign(new Error("Subtitle track not found"), { statusCode: 404 });
    }

    return subtitle;
  }

  async getPlaybackSubtitleTrack(userId: string, playbackSessionId: string, index: number) {
    const row = await this.getPlaybackSessionRow(userId, playbackSessionId);
    if (!row) {
      throw Object.assign(new Error("Playback session not found"), { statusCode: 404 });
    }

    const updated = await this.maybeMarkPlaybackExpired(row);
    if (updated.status !== "ready") {
      throw Object.assign(new Error("Playback session is not ready"), { statusCode: 409 });
    }

    return this.resolvePlaybackSubtitleTrack(updated, index);
  }

  async getPlaybackSubtitleTrackBySessionId(playbackSessionId: string, index: number) {
    const row = await this.getPlaybackSessionRowById(playbackSessionId);
    if (!row) {
      throw Object.assign(new Error("Playback session not found"), { statusCode: 404 });
    }

    const updated = await this.maybeMarkPlaybackExpired(row);
    if (updated.status !== "ready") {
      throw Object.assign(new Error("Playback session is not ready"), { statusCode: 409 });
    }

    return this.resolvePlaybackSubtitleTrack(updated, index);
  }

  async updatePlaybackProgress(
    userId: string,
    playbackSessionId: string,
    input: UpdatePlaybackProgressInput,
  ) {
    const session = await this.getPlaybackSessionRow(userId, playbackSessionId);
    if (!session) {
      throw Object.assign(new Error("Playback session not found"), { statusCode: 404 });
    }

    const threshold = (await this.getPreferences(userId)).watchedThresholdPercent;
    const duration = input.durationSeconds ?? null;
    const percentComplete =
      duration && duration > 0
        ? Math.min(100, Math.round((input.positionSeconds / duration) * 100))
        : 0;
    const completed = percentComplete >= threshold;
    const watchedAt = new Date();

    const [existingProgress] = await db
      .select({
        id: watchProgress.id,
        completed: watchProgress.completed,
      })
      .from(watchProgress)
      .where(
        and(
          eq(watchProgress.userId, userId),
          eq(watchProgress.providerId, session.providerId),
          eq(watchProgress.externalAnimeId, session.externalAnimeId),
          eq(watchProgress.externalEpisodeId, session.externalEpisodeId),
        ),
      )
      .limit(1);

    if (existingProgress) {
      await db
        .update(watchProgress)
        .set({
          positionSeconds: input.positionSeconds,
          durationSeconds: duration,
          percentComplete,
          completed,
          updatedAt: watchedAt,
        })
        .where(eq(watchProgress.id, existingProgress.id));
    } else {
      await db.insert(watchProgress).values({
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

    const [anime] = await db
      .select({
        title: catalogAnime.title,
        coverImage: catalogAnime.coverImage,
      })
      .from(catalogAnime)
      .where(
        and(
          eq(catalogAnime.providerId, session.providerId),
          eq(catalogAnime.externalAnimeId, session.externalAnimeId),
        ),
      )
      .limit(1);

    const [episode] = await db
      .select({ title: catalogEpisode.title, number: catalogEpisode.number })
      .from(catalogEpisode)
      .where(
        and(
          eq(catalogEpisode.providerId, session.providerId),
          eq(catalogEpisode.externalAnimeId, session.externalAnimeId),
          eq(catalogEpisode.externalEpisodeId, session.externalEpisodeId),
        ),
      )
      .limit(1);

    const libraryTarget =
      session.libraryItemId !== null
        ? { id: session.libraryItemId }
        : await db
            .select({ id: libraryItems.id })
            .from(libraryItems)
            .where(
              and(
                eq(libraryItems.userId, userId),
                eq(libraryItems.providerId, session.providerId),
                eq(libraryItems.externalAnimeId, session.externalAnimeId),
              ),
            )
            .limit(1)
            .then((rows) => rows[0] ?? null);

    if (libraryTarget) {
      await db
        .update(libraryItems)
        .set({
          lastEpisodeNumber: episode?.number ?? null,
          lastWatchedAt: watchedAt,
          updatedAt: watchedAt,
        })
        .where(and(eq(libraryItems.userId, userId), eq(libraryItems.id, libraryTarget.id)));
    }

    await db.insert(historyEntries).values({
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

    await db
      .update(playbackSessions)
      .set({ positionSeconds: input.positionSeconds })
      .where(eq(playbackSessions.id, playbackSessionId));

    return {
      completed,
      percentComplete,
      becameCompleted: completed && !existingProgress?.completed,
    };
  }

  async getHistory(userId: string): Promise<HistoryEntry[]> {
    const allowedProviderIds = await this.getAllowedProviderIdsForUser(userId);
    if (allowedProviderIds.length === 0) {
      return [];
    }

    const rows = await db
      .select()
      .from(historyEntries)
      .where(
        and(eq(historyEntries.userId, userId), inArray(historyEntries.providerId, allowedProviderIds)),
      )
      .orderBy(desc(historyEntries.watchedAt))
      .limit(100);

    return rows.map((entry) => ({
      id: entry.id,
      userId: entry.userId,
      libraryItemId: entry.libraryItemId,
      providerId: entry.providerId,
      externalAnimeId: entry.externalAnimeId,
      externalEpisodeId: entry.externalEpisodeId,
      animeTitle: entry.animeTitle,
      episodeTitle: entry.episodeTitle,
      coverImage: entry.coverImage,
      watchedAt: entry.watchedAt.toISOString(),
      positionSeconds: entry.positionSeconds,
      durationSeconds: entry.durationSeconds,
      completed: entry.completed,
    }));
  }

  async getUpdates(userId: string) {
    const allowedProviderIds = await this.getAllowedProviderIdsForUser(userId);
    if (allowedProviderIds.length === 0) {
      return [];
    }

    return db
      .select()
      .from(libraryItems)
      .where(
        and(eq(libraryItems.userId, userId), inArray(libraryItems.providerId, allowedProviderIds)),
      )
      .orderBy(desc(libraryItems.updatedAt))
      .limit(30);
  }

  async createImportJob(userId: string) {
    const [job] = await db
      .insert(importJobs)
      .values({
        userId,
        status: "pending",
        source: "android-backup",
        summary: {
          status: "scaffolded",
          message: "Worker-side Android backup parsing is not implemented yet.",
        },
      })
      .returning();

    return job;
  }

  async getImportJob(userId: string, jobId: string) {
    const [job] = await db
      .select()
      .from(importJobs)
      .where(and(eq(importJobs.id, jobId), eq(importJobs.userId, userId)))
      .limit(1);

    return job;
  }

  async getTrackerEntries(userId: string) {
    const accounts = await db
      .select()
      .from(trackerAccounts)
      .where(eq(trackerAccounts.userId, userId))
      .orderBy(desc(trackerAccounts.createdAt));

    const accountIds = accounts.map((account) => account.id);
    const entries =
      accountIds.length === 0
        ? []
        : await db
            .select()
            .from(trackerEntries)
            .where(inArray(trackerEntries.trackerAccountId, accountIds));

    return {
      accounts,
      entries,
      supported: ["anilist", "mal"],
    };
  }

  async createTrackerConnection(userId: string, trackerId: "anilist" | "mal") {
    const [account] = await db
      .insert(trackerAccounts)
      .values({
        userId,
        trackerId,
        status: "pending",
      })
      .returning();

    return {
      ...account,
      note: "OAuth flow is scaffolded but not implemented in this pass.",
    };
  }

  async deleteTrackerConnection(userId: string, trackerId: string) {
    await db
      .delete(trackerAccounts)
      .where(and(eq(trackerAccounts.userId, userId), eq(trackerAccounts.trackerId, trackerId)));
  }

  async recordProviderHealth(
    providerId: string,
    status: ProviderHealth["status"],
    reason: ProviderHealth["reason"],
    message?: string,
  ) {
    await db.insert(providerHealthEvents).values({ providerId, status, reason, message });
  }
}
