import { describe, expect, it } from "vitest";
import { buildEpisodeTitle, normalizeHeaders, rankAnimePaheSearchMatch } from "./shared";

describe("animepahe helpers", () => {
  it("ranks exact query matches above unrelated titles", () => {
    expect(rankAnimePaheSearchMatch("Steins Gate", "Steins Gate")).toBeGreaterThan(
      rankAnimePaheSearchMatch("Steins Gate 0", "Steins Gate") ?? 0,
    );
  });

  it("builds fallback episode titles and normalizes captured headers", () => {
    expect(buildEpisodeTitle({ episode: 1, episode2: 2, edition: "uncut", title: null })).toContain(
      "Episode 1-2 uncut",
    );
    expect(
      normalizeHeaders({
        Referer: "https://kwik.cx/embed",
        Origin: "https://kwik.cx",
      }),
    ).toEqual({
      referer: "https://kwik.cx/embed",
      origin: "https://kwik.cx",
    });
  });
});
