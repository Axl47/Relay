import { describe, expect, it } from "vitest";
import { LibraryService } from "./library-service";

describe("LibraryService", () => {
  it("aggregates dashboard rows with progress and catalog metadata", async () => {
    const service = new LibraryService(
      {
        async listLibraryItems() {
          return [
            {
              id: "library-1",
              userId: "user-1",
              providerId: "animetake",
              externalAnimeId: "anime-1",
              title: "Example",
              coverImage: null,
              status: "watching",
              addedAt: new Date(),
              updatedAt: new Date(),
              lastEpisodeNumber: 2,
              lastWatchedAt: new Date(),
            },
          ];
        },
        async listCategoryAssignments() {
          return [];
        },
        async listCategories() {
          return [];
        },
        async listWatchProgress() {
          return [
            {
              id: "progress-1",
              userId: "user-1",
              libraryItemId: "library-1",
              providerId: "animetake",
              externalAnimeId: "anime-1",
              externalEpisodeId: "2",
              positionSeconds: 120,
              durationSeconds: 600,
              percentComplete: 20,
              completed: false,
              updatedAt: new Date(),
            },
          ];
        },
      } as never,
      {
        async findAnime() {
          return { totalEpisodes: 12 };
        },
        async findEpisode() {
          return { title: "Episode 2", number: 2 };
        },
      } as never,
      {
        async getAllowedProviderIdsForUser() {
          return ["animetake"];
        },
        async getProviderWithPreferences() {
          return { provider: {} };
        },
      } as never,
    );

    const dashboard = await service.getLibraryDashboard("user-1");
    expect(dashboard.continueWatching).toHaveLength(1);
    expect(dashboard.continueWatching[0]).toMatchObject({
      currentEpisodeNumber: 2,
      totalEpisodes: 12,
    });
  });
});
