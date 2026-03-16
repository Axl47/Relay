import { describe, expect, it } from "vitest";
import { demoProvider } from "./index";

describe("demo provider", () => {
  it("returns stable search results and playback", async () => {
    const search = await demoProvider.search({ query: "relay", page: 1, limit: 10 });
    expect(search.items.length).toBeGreaterThan(0);

    const anime = await demoProvider.getAnime({
      providerId: "demo",
      externalAnimeId: search.items[0]!.externalAnimeId,
    });
    expect(anime.title).toMatch(/Relay/i);

    const episodes = await demoProvider.getEpisodes({
      providerId: "demo",
      externalAnimeId: anime.externalAnimeId,
    });
    expect(episodes.episodes.length).toBeGreaterThan(0);

    const playback = await demoProvider.resolvePlayback({
      providerId: "demo",
      externalAnimeId: anime.externalAnimeId,
      externalEpisodeId: episodes.episodes[0]!.externalEpisodeId,
    });
    expect(playback.streams[0]?.url).toBeTruthy();
  });
});
