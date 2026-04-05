import { describe, expect, it } from "vitest";
import { parseEpisodesApiPayload } from "./episodes";
import { parseStreams, parseSubtitleTracks } from "./payload";
import { scoreTitleAgainstQuery } from "./search-api";

describe("animeonsen helpers", () => {
  it("scores close title matches and parses episode payloads", () => {
    expect(scoreTitleAgainstQuery("Attack on Titan", "Attack on Titan")).toBeGreaterThan(0);

    const episodes = parseEpisodesApiPayload(
      "animeonsen",
      "anime-1",
      JSON.stringify({
        "1": {
          contentTitle_episode_en: "Episode 1",
        },
      }),
    );

    expect(episodes.episodes).toHaveLength(1);
    expect(episodes.episodes[0].externalEpisodeId).toBe("1");
  });

  it("parses stream and subtitle payloads", () => {
    const streams = parseStreams({
      data: {
        sources: [
          {
            url: "https://cdn.example/video.mpd",
            quality: "1080p",
          },
        ],
      },
    });
    expect(streams[0]?.mimeType).toBe("application/dash+xml");

    const subtitles = parseSubtitleTracks({
      subtitles: [
        {
          url: "https://api.animeonsen.xyz/v4/subtitles/file",
          language: "en",
        },
      ],
    });
    expect(subtitles[0]?.format).toBe("ass");
  });
});
