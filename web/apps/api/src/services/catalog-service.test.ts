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
});
