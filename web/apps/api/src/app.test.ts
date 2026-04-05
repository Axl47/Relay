import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApi } from "./app";
import type { ApiServiceContainer } from "./services";
import { DEFAULT_PREFERENCES } from "./services/provider-runtime";

const adminUser = {
  id: "user-1",
  email: "admin@example.com",
  displayName: "Admin",
  isAdmin: true,
};

const now = new Date("2026-03-27T00:00:00.000Z");

type UserPreferences = Awaited<ReturnType<ApiServiceContainer["auth"]["getPreferences"]>>;
type ProviderConfigRow = Awaited<ReturnType<ApiServiceContainer["providers"]["updateProviderConfig"]>>;
type LibraryItemRow = Awaited<ReturnType<ApiServiceContainer["library"]["addLibraryItem"]>>;
type UpdatedLibraryItemRow = Awaited<ReturnType<ApiServiceContainer["library"]["updateLibraryItem"]>>;
type UpdatedCategoryRow = Awaited<ReturnType<ApiServiceContainer["library"]["updateCategory"]>>;
type TrackerConnection = Awaited<ReturnType<ApiServiceContainer["trackers"]["createTrackerConnection"]>>;
type ImportJob = Awaited<ReturnType<ApiServiceContainer["imports"]["createImportJob"]>>;

const userPreferences: UserPreferences = {
  ...DEFAULT_PREFERENCES,
  adultContentVisible: true,
  allowedContentClasses: ["anime", "general", "hentai"],
  watchedThresholdPercent: 85,
};

function buildProviderConfigRow(
  providerId: string,
  input: { enabled?: boolean; priority?: number },
): ProviderConfigRow {
  return {
    userId: "user-1",
    providerId,
    enabled: input.enabled ?? true,
    priority: input.priority ?? 0,
    updatedAt: now,
  };
}

function buildLibraryItemRow(
  overrides: Partial<LibraryItemRow> = {},
): LibraryItemRow {
  return {
    id: "library-1",
    userId: "user-1",
    providerId: "animetake",
    externalAnimeId: "anime-1",
    title: "Example Anime",
    coverImage: null,
    kind: "tv",
    status: "watching",
    addedAt: now,
    updatedAt: now,
    lastEpisodeNumber: null,
    lastWatchedAt: null,
    ...overrides,
  };
}

function buildUpdatedLibraryItemRow(
  libraryItemId: string,
  input: {
    status?: "completed" | "planned" | "watching" | "paused";
    title?: string;
    coverImage?: string | null;
    kind?: "movie" | "tv" | "ova" | "special" | "unknown";
  },
): UpdatedLibraryItemRow {
  return {
    ...buildLibraryItemRow({
      id: libraryItemId,
      status: input.status ?? "watching",
      title: input.title ?? "Example Anime",
      coverImage: input.coverImage ?? null,
      kind: input.kind ?? "tv",
    }),
    updatedAt: now,
  };
}

function buildUpdatedCategoryRow(
  categoryId: string,
  input: { name?: string; position?: number },
): UpdatedCategoryRow {
  return {
    id: categoryId,
    userId: "user-1",
    name: input.name ?? "Favorites",
    position: input.position ?? 0,
    createdAt: now,
    updatedAt: now,
  };
}

function buildTrackerConnection(trackerId: "anilist" | "mal"): TrackerConnection {
  return {
    id: "tracker-1",
    userId: "user-1",
    trackerId,
    status: "pending",
    createdAt: now,
    note: "OAuth flow is scaffolded but not implemented in this pass.",
  };
}

function buildImportJob(): ImportJob {
  return {
    id: "job-1",
    userId: "user-1",
    status: "pending",
    source: "android-backup",
    summary: {
      status: "scaffolded",
    },
    createdAt: now,
    updatedAt: now,
  };
}

function createServices(): ApiServiceContainer {
  return {
    auth: {
      async bootstrap() {
        return { user: adminUser, sessionId: "admin-session" };
      },
      async login() {
        return { user: adminUser, sessionId: "admin-session" };
      },
      async logout() {},
      async getSessionUser(sessionId?: string | null) {
        if (sessionId === "admin-session") {
          return adminUser;
        }
        if (sessionId === "user-session") {
          return {
            ...adminUser,
            id: "user-2",
            isAdmin: false,
          };
        }
        return null;
      },
      async getPreferences() {
        return userPreferences;
      },
      async updatePreferences(_userId, input) {
        return {
          ...userPreferences,
          ...input,
        };
      },
    },
    providers: {
      async ensureProvidersSeeded() {},
      async listProviders() {
        return [
          {
            id: "animetake",
            displayName: "AnimeTake",
            baseUrl: "https://animetake.com.co",
            contentClass: "anime" as const,
            executionMode: "browser" as const,
            requiresAdultGate: false,
            supportsSearch: true,
            supportsTrackerSync: false,
            defaultEnabled: true,
            enabled: true,
            priority: 0,
            health: {
              providerId: "animetake",
              status: "healthy" as const,
              reason: "ok" as const,
              checkedAt: new Date().toISOString(),
            },
          },
        ];
      },
      async updateProviderConfig(_userId, providerId, input) {
        return buildProviderConfigRow(providerId, input);
      },
      async recordProviderHealth() {},
    },
    catalog: {
      async search(_userId, input) {
        return {
          query: input.query,
          page: input.page,
          limit: input.limit,
          partial: false,
          providers: [],
          items: [],
        };
      },
      async searchWithProgress(_userId, input, handlers) {
        await handlers.onStart?.({ totalProviders: 1 });
        await handlers.onProviderResult?.({
          completedProviders: 1,
          totalProviders: 1,
          providerResult: {
            providerId: "animetake",
            displayName: "AnimeTake",
            contentClass: "anime",
            status: "success",
            latencyMs: 25,
            error: null,
            items: [],
          },
        });
        return {
          query: input.query,
          page: input.page,
          limit: input.limit,
          partial: false,
          providers: [],
          items: [],
        };
      },
      async getLastCatalogSearch() {
        return {
          result: null,
          cachedAt: null,
          expiresAt: null,
        };
      },
      async getAnime(_userId, providerId, externalAnimeId) {
        return {
          providerId,
          providerDisplayName: "AnimeTake",
          externalAnimeId,
          title: "Example Anime",
          synopsis: null,
          coverImage: null,
          bannerImage: null,
          status: "unknown" as const,
          year: null,
          tags: [],
          kind: "tv" as const,
          language: "en",
          totalEpisodes: 12,
          contentClass: "anime" as const,
          requiresAdultGate: false,
        };
      },
      async getEpisodes(_userId, providerId, externalAnimeId) {
        return {
          providerId,
          externalAnimeId,
          episodes: [],
        };
      },
      async getAnimeDetailView(_userId, providerId, externalAnimeId) {
        return {
          anime: await this.getAnime("user-1", providerId, externalAnimeId),
          libraryItem: null,
          inLibrary: false,
          resumeEpisodeId: null,
          resumeEpisodeNumber: null,
          resumeEpisodeTitle: null,
          currentEpisodeId: null,
          currentEpisodeNumber: null,
          currentEpisodeTitle: null,
          episodes: [],
        };
      },
    },
    library: {
      async getLibraryDashboard() {
        return {
          continueWatching: [],
          recentlyAdded: [],
          allItems: [],
          categories: [],
        };
      },
      async listLibrary() {
        return [];
      },
      async addLibraryItem(_userId, input) {
        return buildLibraryItemRow({
          providerId: input.providerId,
          externalAnimeId: input.externalAnimeId,
          title: input.title,
          coverImage: input.coverImage,
          kind: input.kind,
          status: input.status,
        });
      },
      async updateLibraryItem(_userId, libraryItemId, input) {
        return buildUpdatedLibraryItemRow(libraryItemId, input);
      },
      async deleteLibraryItem() {},
      async listCategories() {
        return [];
      },
      async createCategory(_userId, input) {
        return {
          id: "category-1",
          userId: "user-1",
          name: input.name,
          position: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      },
      async updateCategory(_userId, categoryId, input) {
        return buildUpdatedCategoryRow(categoryId, input);
      },
      async assignCategories() {},
    },
    playback: {
      async createPlaybackSession(_userId, input) {
        return {
          id: "playback-1",
          userId: "user-1",
          providerId: input.providerId,
          externalAnimeId: input.externalAnimeId,
          externalEpisodeId: input.externalEpisodeId,
          status: "ready" as const,
          proxyMode: "redirect" as const,
          streamUrl: "https://cdn.example/video.mp4",
          mimeType: "video/mp4",
          subtitles: [],
          headers: {},
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          positionSeconds: 0,
          error: null,
        };
      },
      async getPlaybackSession(_userId, playbackSessionId) {
        return {
          id: playbackSessionId,
          userId: "user-1",
          providerId: "animetake",
          externalAnimeId: "anime-1",
          externalEpisodeId: "1",
          status: "ready" as const,
          proxyMode: "redirect" as const,
          streamUrl: "https://cdn.example/video.mp4",
          mimeType: "video/mp4",
          subtitles: [],
          headers: {},
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          positionSeconds: 0,
          error: null,
        };
      },
      async getPlaybackSessionBySessionId(playbackSessionId) {
        return this.getPlaybackSession("user-1", playbackSessionId);
      },
      async getPlaybackStreamTarget() {
        return {
          sessionId: "playback-1",
          providerId: "animetake",
          upstreamUrl: "https://cdn.example/video.mp4",
          mimeType: "video/mp4",
          proxyMode: "redirect" as const,
          headers: {},
          cookies: {},
        };
      },
      async getPlaybackStreamTargetBySessionId() {
        return {
          sessionId: "playback-1",
          providerId: "animetake",
          upstreamUrl: "https://cdn.example/video.mp4",
          mimeType: "video/mp4",
          proxyMode: "redirect" as const,
          headers: {},
          cookies: {},
        };
      },
      async getPlaybackSubtitleTrack() {
        return {
          label: "English",
          language: "en",
          url: "https://cdn.example/subs.vtt",
          format: "vtt" as const,
          isDefault: true,
        };
      },
      async getPlaybackSubtitleTrackBySessionId() {
        return {
          label: "English",
          language: "en",
          url: "https://cdn.example/subs.vtt",
          format: "vtt" as const,
          isDefault: true,
        };
      },
      async updatePlaybackProgress() {
        return {
          completed: false,
          percentComplete: 20,
          becameCompleted: false,
        };
      },
      async getWatchContext(_userId, input) {
        return {
          anime: {
            providerId: input.providerId,
            providerDisplayName: "AnimeTake",
            externalAnimeId: input.externalAnimeId,
            title: "Example Anime",
            synopsis: null,
            coverImage: null,
            bannerImage: null,
            status: "unknown" as const,
            year: null,
            tags: [],
            kind: "tv" as const,
            language: "en",
            totalEpisodes: 12,
            contentClass: "anime" as const,
            requiresAdultGate: false,
          },
          libraryItem: null,
          currentEpisode: {
            providerId: input.providerId,
            externalAnimeId: input.externalAnimeId,
            externalEpisodeId: input.externalEpisodeId,
            number: 1,
            title: "Episode 1",
            synopsis: null,
            seasonNumber: null,
            episodeNumber: 1,
            thumbnail: null,
            durationSeconds: null,
            releasedAt: null,
            state: "unwatched" as const,
            progress: null,
            isCurrent: true,
            isNowPlaying: true,
          },
          nextEpisode: null,
          episodes: [],
        };
      },
    },
    history: {
      async getHistory() {
        return [];
      },
      async getGroupedHistory() {
        return {
          groups: [],
        };
      },
      async getUpdates() {
        return [];
      },
    },
    trackers: {
      async getTrackerEntries() {
        return {
          accounts: [],
          entries: [],
          supported: ["anilist", "mal"],
        };
      },
      async createTrackerConnection(_userId, trackerId) {
        return buildTrackerConnection(trackerId);
      },
      async deleteTrackerConnection() {},
    },
    imports: {
      async listImportJobs() {
        return {
          jobs: [buildImportJob()],
        };
      },
      async createImportJob() {
        return buildImportJob();
      },
      async getImportJob() {
        return buildImportJob();
      },
    },
  };
}

describe("buildApi route modules", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("serves auth and provider routes through the injected service container", async () => {
    const app = await buildApi({ services: createServices() });

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "admin@example.com",
        password: "secret123",
      },
    });
    expect(login.statusCode).toBe(200);
    expect(login.headers["set-cookie"]).toContain("relay_session");

    const me = await app.inject({
      method: "GET",
      url: "/me",
      headers: {
        "x-relay-session": "admin-session",
      },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({
      user: adminUser,
      preferences: userPreferences,
    });

    const providers = await app.inject({
      method: "GET",
      url: "/providers",
      headers: {
        "x-relay-session": "admin-session",
      },
    });
    expect(providers.statusCode).toBe(200);
    expect(providers.json()).toHaveLength(1);

    await app.close();
  });

  it("exposes canonical catalog routes and removes legacy aliases", async () => {
    const app = await buildApi({ services: createServices() });

    const streamResponse = await app.inject({
      method: "GET",
      url: "/catalog/search/stream?query=naruto&page=1&limit=5",
      headers: {
        "x-relay-session": "admin-session",
      },
    });
    expect(streamResponse.statusCode).toBe(200);
    expect(streamResponse.body).toContain('"type":"start"');
    expect(streamResponse.body).toContain('"type":"done"');

    const anime = await app.inject({
      method: "GET",
      url: "/catalog/anime?providerId=animetake&externalAnimeId=anime-1",
      headers: {
        "x-relay-session": "admin-session",
      },
    });
    expect(anime.statusCode).toBe(200);
    expect(anime.json().externalAnimeId).toBe("anime-1");

    const legacyStream = await app.inject({
      method: "GET",
      url: "/stream?query=naruto",
      headers: {
        "x-relay-session": "admin-session",
      },
    });
    expect(legacyStream.statusCode).toBe(404);

    const legacyAnime = await app.inject({
      method: "GET",
      url: "/catalog/animetake/anime?externalAnimeId=anime-1",
      headers: {
        "x-relay-session": "admin-session",
      },
    });
    expect(legacyAnime.statusCode).toBe(404);

    await app.close();
  });

  it("handles playback, history, tracker, and import routes through injected services", async () => {
    const app = await buildApi({ services: createServices() });

    const playback = await app.inject({
      method: "POST",
      url: "/playback/sessions",
      headers: {
        "x-relay-session": "admin-session",
      },
      payload: {
        providerId: "animetake",
        externalAnimeId: "anime-1",
        externalEpisodeId: "1",
      },
    });
    expect(playback.statusCode).toBe(201);

    const watchContext = await app.inject({
      method: "GET",
      url: "/watch/context?providerId=animetake&externalAnimeId=anime-1&externalEpisodeId=1",
      headers: {
        "x-relay-session": "admin-session",
      },
    });
    expect(watchContext.statusCode).toBe(200);
    expect(watchContext.json().currentEpisode.externalEpisodeId).toBe("1");

    const stream = await app.inject({
      method: "GET",
      url: "/stream/playback-1",
    });
    expect(stream.statusCode).toBe(302);
    expect(stream.headers.location).toBe("https://cdn.example/video.mp4");

    expect(
      (
        await app.inject({
          method: "GET",
          url: "/history/grouped",
          headers: {
            "x-relay-session": "admin-session",
          },
        })
      ).statusCode,
    ).toBe(200);

    expect(
      (
        await app.inject({
          method: "GET",
          url: "/trackers/entries",
          headers: {
            "x-relay-session": "admin-session",
          },
        })
      ).statusCode,
    ).toBe(200);

    expect(
      (
        await app.inject({
          method: "POST",
          url: "/imports/android-backup",
          headers: {
            "x-relay-session": "admin-session",
          },
        })
      ).statusCode,
    ).toBe(200);

    await app.close();
  });
});
