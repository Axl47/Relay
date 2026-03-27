import { describe, expect, it } from "vitest";
import {
  addPlaybackCandidatesFromEpisodeInfo,
  parseAnimeTakeServerSnapshot,
  resolveEpisodeIdFromSnapshot,
} from "./ajax";
import { createPlaybackCandidateMap, rankTitleAgainstQuery } from "./shared";

describe("animetake helpers", () => {
  it("ranks canonical matches and parses ajax server snapshots", () => {
    expect(rankTitleAgainstQuery("Naruto", "Naruto")).toBeGreaterThan(
      rankTitleAgainstQuery("Naruto Movie", "Naruto") ?? 0,
    );

    const snapshot = parseAnimeTakeServerSnapshot(
      [
        '<div class="server" data-name="main" data-id="1" data-type="hls"></div>',
        '<a href="/anime/naruto/episode/1">Episode 1</a>',
      ].join(""),
      "naruto",
    );

    expect(snapshot.servers).toHaveLength(1);
    expect(resolveEpisodeIdFromSnapshot(snapshot, "1")).toBe("1");
  });

  it("builds playback candidates from ajax episode info", () => {
    const candidates = createPlaybackCandidateMap();
    addPlaybackCandidatesFromEpisodeInfo(
      candidates,
      {
        grabber: null,
        params: null,
        backup: null,
        target: "https://cdn.example/master.m3u8",
        type: "hls",
        name: "1080p",
        subtitle: null,
      },
      {
        referer: "https://animetake.com.co/anime/naruto/episode/1",
      },
    );

    expect(candidates.values()).toHaveLength(1);
    expect(candidates.values()[0]?.mimeType).toBe("application/vnd.apple.mpegurl");
  });
});
