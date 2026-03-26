import { describe, expect, it, vi } from "vitest";
import {
  assertProviderContract,
  createHealthyProviderHealth,
  createProviderRequestContext,
  ProviderRegistry,
  type RelayProvider,
} from "./index";

const dummyProvider: RelayProvider = {
  metadata: {
    id: "dummy",
    displayName: "Dummy",
    baseUrl: "https://dummy.example",
    contentClass: "anime",
    executionMode: "http",
    requiresAdultGate: false,
    supportsSearch: true,
    supportsTrackerSync: false,
    defaultEnabled: true,
  },
  async search() {
    return {
      providerId: "dummy",
      query: "test",
      page: 1,
      hasNextPage: false,
      items: [
        {
          providerId: "dummy",
          providerDisplayName: "Dummy",
          externalAnimeId: "series-1",
          title: "Dummy Series",
          coverImage: null,
          kind: "tv",
          language: "en",
          contentClass: "anime",
          requiresAdultGate: false,
          synopsis: null,
          year: 2024,
        },
      ],
    };
  },
  async getAnime(input) {
    return {
      providerId: input.providerId,
      providerDisplayName: "Dummy",
      externalAnimeId: input.externalAnimeId,
      title: "Dummy Series",
      synopsis: "Contract test",
      coverImage: null,
      bannerImage: null,
      year: 2024,
      totalEpisodes: 1,
      tags: ["test"],
      status: "ongoing",
      language: "en",
      contentClass: "anime",
      requiresAdultGate: false,
    };
  },
  async getEpisodes(input) {
    return {
      providerId: input.providerId,
      externalAnimeId: input.externalAnimeId,
      episodes: [
        {
          providerId: input.providerId,
          externalAnimeId: input.externalAnimeId,
          externalEpisodeId: "episode-1",
          number: 1,
          title: "Episode 1",
          synopsis: null,
          durationSeconds: 1_440,
          thumbnail: null,
          releasedAt: null,
        },
      ],
    };
  },
  async resolvePlayback(input) {
    return {
      providerId: input.providerId,
      externalAnimeId: input.externalAnimeId,
      externalEpisodeId: input.externalEpisodeId,
      streams: [
        {
          id: "stream-1",
          url: "https://dummy.example/master.m3u8",
          quality: "auto",
          mimeType: "application/vnd.apple.mpegurl",
          headers: {},
          cookies: {},
          proxyMode: "proxy",
          isDefault: true,
        },
      ],
      subtitles: [],
      cookies: {},
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
  },
  async refreshLibraryItem(input) {
    return {
      providerId: input.providerId,
      externalAnimeId: input.externalAnimeId,
      refreshedAt: new Date().toISOString(),
      discoveredEpisodes: 1,
      totalEpisodes: 1,
    };
  },
};

describe("provider sdk", () => {
  it("creates request contexts with sensible defaults", () => {
    const now = new Date("2026-03-25T00:00:00.000Z");
    const ctx = createProviderRequestContext({
      fetch: vi.fn() as unknown as typeof fetch,
      now: () => now,
    });

    expect(ctx.browser).toBeNull();
    expect(ctx.now()).toBe(now);
  });

  it("registers provider metadata and validates provider contracts", async () => {
    const registry = new ProviderRegistry();
    registry.register(dummyProvider);

    expect(registry.get("dummy")?.metadata.displayName).toBe("Dummy");
    expect(registry.metadata()).toHaveLength(1);

    await expect(assertProviderContract(dummyProvider)).resolves.toBeUndefined();
  });

  it("creates healthy provider health payloads", () => {
    expect(createHealthyProviderHealth("dummy")).toMatchObject({
      providerId: "dummy",
      status: "healthy",
      reason: "ok",
    });
  });
});
