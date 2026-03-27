import { describe, expect, it } from "vitest";
import { buildStreamCandidates } from "./playback";
import { parsePlayerApiRequestParts } from "./player-api";
import { parseSubtitleCandidate } from "./shared";

describe("hentaihaven helpers", () => {
  it("decodes player api request parts from iframe data", () => {
    const raw = Buffer.from("first:|::|:second").toString("base64");
    const result = parsePlayerApiRequestParts(`https://hentaihaven.xxx/player.php?data=${raw}`);
    expect(result).toEqual({
      a: "first",
      b: Buffer.from("second", "utf8").toString("base64"),
    });
  });

  it("parses subtitle candidates and stream priorities", () => {
    expect(parseSubtitleCandidate("https://cdn.example/subs/en.ass")?.format).toBe("ass");

    const streams = buildStreamCandidates(
      [
        {
          data: {
            sources: [
              {
                src: "https://cdn.example/master.m3u8",
                type: "application/vnd.apple.mpegurl",
                label: "1080p",
              },
            ],
          },
        },
      ],
      [],
      null,
    );

    expect(streams[0]?.mimeType).toBe("application/vnd.apple.mpegurl");
  });
});
