import { describe, expect, it } from "vitest";
import { buildOriginalAnimeUrl } from "./provider-links";

describe("provider external URL helpers", () => {
  it("builds slash-safe URLs for providers with nested ids", () => {
    expect(
      buildOriginalAnimeUrl({
        providerId: "javguru",
        externalAnimeId: "123/slug",
      }),
    ).toBe("https://jav.guru/123/slug/");
  });

  it("uses the first episode id for providers whose upstream URL needs it", () => {
    expect(
      buildOriginalAnimeUrl({
        providerId: "hanime",
        externalAnimeId: "ignored",
        firstEpisodeId: "episode/1",
      }),
    ).toBe("https://hanime.tv/videos/hentai/episode/1");
  });
});
