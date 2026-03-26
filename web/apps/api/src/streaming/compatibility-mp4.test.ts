import { describe, expect, it } from "vitest";
import { parseByteRange } from "./compatibility-mp4";

describe("compatibility mp4 helpers", () => {
  it("parses standard and suffix byte ranges", () => {
    expect(parseByteRange("bytes=0-99", 500)).toEqual({ start: 0, end: 99 });
    expect(parseByteRange("bytes=-100", 500)).toEqual({ start: 400, end: 499 });
    expect(parseByteRange("bytes=250-", 500)).toEqual({ start: 250, end: 499 });
  });

  it("rejects invalid byte ranges", () => {
    expect(parseByteRange("items=0-99", 500)).toBeNull();
    expect(parseByteRange("bytes=600-700", 500)).toBeNull();
    expect(parseByteRange("bytes=100-50", 500)).toBeNull();
  });
});
