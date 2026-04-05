import { describe, expect, it } from "vitest";
import { PlaybackService } from "./playback-service";

describe("PlaybackService", () => {
  it("reuses valid sessions but invalidates animepahe HLS sessions", async () => {
    const createCalls: Array<unknown> = [];
    const service = new PlaybackService(
      {
        async findLatestSession(
          _userId: string,
          _providerId: string,
          _externalAnimeId: string,
          externalEpisodeId: string,
        ) {
          if (externalEpisodeId === "reuse") {
            return {
              id: "existing",
              userId: "user-1",
              providerId: "animetake",
              externalAnimeId: "anime-1",
              externalEpisodeId,
              status: "ready",
              proxyMode: "proxy",
              upstreamUrl: "https://cdn.example/master.m3u8",
              mimeType: "application/vnd.apple.mpegurl",
              headers: {},
              cookies: {},
              subtitles: [],
              positionSeconds: 0,
              expiresAt: new Date(Date.now() + 60_000),
              createdAt: new Date(),
              libraryItemId: null,
              error: null,
            };
          }

          return {
            id: "stale",
            userId: "user-1",
            providerId: "animepahe",
            externalAnimeId: "anime-1",
            externalEpisodeId,
            status: "ready",
            proxyMode: "proxy",
            upstreamUrl: "https://cdn.example/master.m3u8",
            mimeType: "application/vnd.apple.mpegurl",
            headers: {},
            cookies: {},
            subtitles: [],
            positionSeconds: 0,
            expiresAt: new Date(Date.now() + 60_000),
            createdAt: new Date(),
            libraryItemId: null,
            error: null,
          };
        },
        async createSession(input: {
          userId: string;
          providerId: string;
          externalAnimeId: string;
          externalEpisodeId: string;
          libraryItemId: string | null;
          status: string;
          proxyMode: string;
          positionSeconds: number;
          expiresAt: Date;
        }) {
          createCalls.push(input);
          return {
            id: "created",
            userId: "user-1",
            providerId: input.providerId,
            externalAnimeId: input.externalAnimeId,
            externalEpisodeId: input.externalEpisodeId,
            status: "ready",
            proxyMode: "proxy",
            upstreamUrl: "https://cdn.example/master.m3u8",
            mimeType: "application/vnd.apple.mpegurl",
            headers: {},
            cookies: {},
            subtitles: [],
            positionSeconds: 0,
            expiresAt: new Date(Date.now() + 60_000),
            createdAt: new Date(),
            libraryItemId: null,
            error: null,
          };
        },
        async getSession() {
          return {
            id: "created",
            userId: "user-1",
            providerId: "animepahe",
            externalAnimeId: "anime-1",
            externalEpisodeId: "fresh",
            status: "ready",
            proxyMode: "proxy",
            upstreamUrl: "https://cdn.example/master.m3u8",
            mimeType: "application/vnd.apple.mpegurl",
            headers: {},
            cookies: {},
            subtitles: [],
            positionSeconds: 0,
            expiresAt: new Date(Date.now() + 60_000),
            createdAt: new Date(),
            libraryItemId: null,
            error: null,
          };
        },
        async getSessionById() {
          return {
            id: "created",
            userId: "user-1",
            providerId: "animepahe",
            externalAnimeId: "anime-1",
            externalEpisodeId: "fresh",
            status: "ready",
            proxyMode: "proxy",
            upstreamUrl: "https://cdn.example/master.m3u8",
            mimeType: "application/vnd.apple.mpegurl",
            headers: {},
            cookies: {},
            subtitles: [],
            positionSeconds: 0,
            expiresAt: new Date(Date.now() + 60_000),
            createdAt: new Date(),
            libraryItemId: null,
            error: null,
          };
        },
        async updateSession() {
          return null;
        },
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {
        async getProviderWithPreferences(_userId: string, providerId: string) {
          return {
            provider: {
              metadata: {
                id: providerId,
              },
            },
          };
        },
      } as never,
      {} as never,
      {} as never,
      {
        getPlaybackCacheTtlMs() {
          return 60_000;
        },
      } as never,
    );

    const reused = await service.createPlaybackSession("user-1", {
      providerId: "animetake",
      externalAnimeId: "anime-1",
      externalEpisodeId: "reuse",
      libraryItemId: null,
    });
    expect(reused.id).toBe("existing");

    await service.createPlaybackSession("user-1", {
      providerId: "animepahe",
      externalAnimeId: "anime-1",
      externalEpisodeId: "fresh",
      libraryItemId: null,
    });
    expect(createCalls).toHaveLength(1);
  });

  it("builds watch context from detail data", async () => {
    const service = new PlaybackService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        async getAnimeDetailView() {
          return {
            anime: {
              providerId: "animetake",
              providerDisplayName: "AnimeTake",
              externalAnimeId: "anime-1",
              title: "Example",
              synopsis: null,
              coverImage: null,
              bannerImage: null,
              status: "unknown",
              year: null,
              tags: [],
              language: "en",
              totalEpisodes: 2,
              contentClass: "anime",
              requiresAdultGate: false,
            },
            libraryItem: null,
            inLibrary: false,
            resumeEpisodeId: "1",
            resumeEpisodeNumber: 1,
            resumeEpisodeTitle: "Episode 1",
            currentEpisodeId: "1",
            currentEpisodeNumber: 1,
            currentEpisodeTitle: "Episode 1",
            episodes: [
              {
                providerId: "animetake",
                externalAnimeId: "anime-1",
                externalEpisodeId: "1",
                number: 1,
                title: "Episode 1",
                synopsis: null,
                thumbnail: null,
                durationSeconds: null,
                releasedAt: null,
                state: "unwatched",
                progress: null,
                isCurrent: false,
                isNowPlaying: false,
              },
              {
                providerId: "animetake",
                externalAnimeId: "anime-1",
                externalEpisodeId: "2",
                number: 2,
                title: "Episode 2",
                synopsis: null,
                thumbnail: null,
                durationSeconds: null,
                releasedAt: null,
                state: "unwatched",
                progress: null,
                isCurrent: false,
                isNowPlaying: false,
              },
            ],
          };
        },
      } as never,
      {
        async getLibraryItemById() {
          return null;
        },
      } as never,
      {} as never,
    );

    const context = await service.getWatchContext("user-1", {
      providerId: "animetake",
      externalAnimeId: "anime-1",
      externalEpisodeId: "1",
      libraryItemId: null,
    });

    expect(context.currentEpisode.externalEpisodeId).toBe("1");
    expect(context.nextEpisode?.externalEpisodeId).toBe("2");
  });
});
