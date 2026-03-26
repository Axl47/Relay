import { describe, expect, it } from "vitest";
import { convertSubtitleToVtt } from "./subtitles";

describe("subtitle conversion", () => {
  it("converts SRT subtitles into WEBVTT", () => {
    const converted = convertSubtitleToVtt(
      ["1", "00:00:01,000 --> 00:00:03,000", "Hello Relay"].join("\n"),
      "srt",
    );

    expect(converted).toContain("WEBVTT");
    expect(converted).toContain("00:00:01.000 --> 00:00:03.000");
    expect(converted).toContain("Hello Relay");
  });

  it("converts ASS subtitles and keeps cue positioning", () => {
    const converted = convertSubtitleToVtt(
      [
        "[Script Info]",
        "PlayResX: 1920",
        "PlayResY: 1080",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
        "Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,{\\pos(960,900)}Line one",
      ].join("\n"),
      "ass",
    );

    expect(converted).toContain("WEBVTT");
    expect(converted).toContain("line:83.3% position:50.0%");
    expect(converted).toContain("Line one");
  });
});
