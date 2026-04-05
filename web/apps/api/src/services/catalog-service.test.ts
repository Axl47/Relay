import { describe, expect, it } from "vitest";
import { CatalogService } from "./catalog-service";

describe("CatalogService", () => {
  it("emits progress updates and caches the last search response", async () => {
    const upserted: unknown[] = [];
    const events: string[] = [];
    const service = new CatalogService(
      {
        async upsertSearchItems(items: unknown[]) {
          upserted.push(...items);
        },
      } as never,
      {} as never,
      {} as never,
      {
        async listProviders() {
          return [
            {
              id: "animetake",
              displayName: "AnimeTake",
              contentClass: "anime",
              enabled: true,
              supportsSearch: true,
              priority: 0,
            },
          ];
        },
      } as never,
      {
        async registry() {
          return new Map([
            [
              "animetake",
              {
                search: async () => ({
                  items: [
                    {
                      providerId: "animetake",
                      providerDisplayName: "AnimeTake",
                      externalAnimeId: "anime-1",
                      title: "Example",
                      synopsis: null,
                      coverImage: null,
                      year: null,
                      kind: "unknown",
                      language: "en",
                      contentClass: "anime",
                      requiresAdultGate: false,
                    },
                  ],
                }),
              },
            ],
          ]);
        },
        async withProviderTimeout<T>(
          _provider: unknown,
          _timeoutMs: number,
          executor: (provider: unknown, signal: AbortSignal) => Promise<T>,
        ): Promise<T> {
          return executor(
            {
              search: async () => ({
                items: [
                  {
                    providerId: "animetake",
                    providerDisplayName: "AnimeTake",
                    externalAnimeId: "anime-1",
                    title: "Example",
                    synopsis: null,
                    coverImage: null,
                    year: null,
                    kind: "unknown",
                    language: "en",
                    contentClass: "anime",
                    requiresAdultGate: false,
                  },
                ],
              }),
            } as never,
            new AbortController().signal,
          );
        },
        getProviderSearchTimeout() {
          return 1000;
        },
        createProviderContext() {
          return {} as never;
        },
      } as never,
    );

    const response = await service.searchWithProgress(
      "user-1",
      { query: "example", page: 1, limit: 10 },
      {
        onStart: () => {
          events.push("start");
        },
        onProviderResult: () => {
          events.push("progress");
        },
      },
    );

    expect(events).toEqual(["start", "progress"]);
    expect(upserted).toHaveLength(1);
    expect(response.items).toHaveLength(1);

    const last = await service.getLastCatalogSearch("user-1");
    expect(last.result?.query).toBe("example");
  });

  it("persists and returns kind plus season-aware episode fields", async () => {
    const upsertedAnime: unknown[] = [];
    const upsertedEpisodes: unknown[] = [];
    const service = new CatalogService(
      {
        async upsertAnime(input: unknown) {
          upsertedAnime.push(input);
        },
        async upsertEpisodes(input: unknown) {
          upsertedEpisodes.push(input);
        },
        async findAnime() {
          return null;
        },
        async listEpisodes() {
          return [];
        },
      } as never,
      {} as never,
      {
        async getLibraryItemByAnime() {
          return null;
        },
      } as never,
      {
        async getProviderWithPreferences() {
          return {
            provider: {
              metadata: {
                id: "xtream",
                displayName: "Xtream",
                contentClass: "general",
                executionMode: "http",
                requiresAdultGate: false,
                supportsSearch: true,
                supportsTrackerSync: false,
                defaultEnabled: true,
                baseUrl: "https://xtream.rip",
              },
              async getAnime() {
                return {
                  providerId: "xtream",
                  providerDisplayName: "Xtream",
                  externalAnimeId: "95557",
                  title: "Invincible",
                  synopsis: null,
                  coverImage: null,
                  bannerImage: null,
                  status: "ongoing" as const,
                  year: 2021,
                  kind: "tv" as const,
                  tags: [],
                  language: "en",
                  totalEpisodes: 2,
                  contentClass: "general" as const,
                  requiresAdultGate: false,
                };
              },
              async getEpisodes() {
                return {
                  providerId: "xtream",
                  externalAnimeId: "95557",
                  episodes: [
                    {
                      providerId: "xtream",
                      externalAnimeId: "95557",
                      externalEpisodeId: "s1:e1",
                      number: 1,
                      seasonNumber: 1,
                      episodeNumber: 1,
                      title: "Episode 1",
                      synopsis: null,
                      thumbnail: null,
                      durationSeconds: null,
                      releasedAt: null,
                    },
                    {
                      providerId: "xtream",
                      externalAnimeId: "95557",
                      externalEpisodeId: "s1:e2",
                      number: 2,
                      seasonNumber: 1,
                      episodeNumber: 2,
                      title: "Episode 2",
                      synopsis: null,
                      thumbnail: null,
                      durationSeconds: null,
                      releasedAt: null,
                    },
                  ],
                };
              },
            },
          };
        },
      } as never,
      {
        getProviderCatalogTimeout() {
          return null;
        },
        createProviderContext() {
          return {} as never;
        },
      } as never,
    );

    const anime = await service.getAnime("user-1", "xtream", "95557");
    const episodes = await service.getEpisodes("user-1", "xtream", "95557");

    expect(anime.kind).toBe("tv");
    expect(episodes.episodes[0]).toMatchObject({
      externalEpisodeId: "s1:e1",
      seasonNumber: 1,
      episodeNumber: 1,
    });
    expect(upsertedAnime[0]).toMatchObject({
      kind: "tv",
    });
    expect(upsertedEpisodes[0]).toMatchObject({
      episodes: [
        expect.objectContaining({
          externalEpisodeId: "s1:e1",
          seasonNumber: 1,
          episodeNumber: 1,
        }),
        expect.objectContaining({
          externalEpisodeId: "s1:e2",
          seasonNumber: 1,
          episodeNumber: 2,
        }),
      ],
    });
  });
});
