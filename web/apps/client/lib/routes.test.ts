import { describe, expect, it } from "vitest";
import {
  buildAnimeHref,
  buildCatalogAnimeViewPath,
  buildWatchContextPath,
  buildWatchHref,
  decodeRouteParam,
} from "./routes";

describe("client route helpers", () => {
  it("decodes slash-containing route params", () => {
    expect(decodeRouteParam("123%2Fslug")).toBe("123/slug");
  });

  it("builds slash-safe anime and watch URLs", () => {
    expect(buildAnimeHref("javguru", "123/slug")).toBe("/anime/javguru/123%2Fslug");
    expect(
      buildWatchHref({
        libraryItemId: null,
        providerId: "animepahe",
        externalAnimeId: "series/slug",
        externalEpisodeId: "episode/1",
      }),
    ).toBe("/watch/direct/episode%2F1?providerId=animepahe&externalAnimeId=series%2Fslug");
  });

  it("builds canonical query-based catalog and watch-context paths", () => {
    expect(buildCatalogAnimeViewPath("animetake", "naruto/shippuden")).toBe(
      "/catalog/anime/view?providerId=animetake&externalAnimeId=naruto%2Fshippuden",
    );
    expect(
      buildWatchContextPath({
        libraryItemId: "1234",
        providerId: "animetake",
        externalAnimeId: "naruto/shippuden",
        externalEpisodeId: "ep/12",
      }),
    ).toBe(
      "/watch/context?providerId=animetake&externalAnimeId=naruto%2Fshippuden&externalEpisodeId=ep%2F12&libraryItemId=1234",
    );
  });
});
