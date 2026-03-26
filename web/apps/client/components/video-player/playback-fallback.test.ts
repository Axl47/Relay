import { describe, expect, it } from "vitest";
import {
  applyCompatibilityToPrimaryFallback,
  applyPrimaryToCompatibilityFallback,
  createPlaybackFallbackState,
  getCompatibilityPlaybackStartupTimeoutMs,
  shouldStartPlaybackInCompatibilityMode,
  supportsCompatibilityPlaybackFallback,
} from "./playback-fallback";

const firefoxUserAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:137.0) Gecko/20100101 Firefox/137.0";
const chromeUserAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/135.0.0.0 Safari/537.36";

describe("playback fallback state", () => {
  it("starts animepahe firefox sessions in compatibility mode", () => {
    expect(
      shouldStartPlaybackInCompatibilityMode(
        {
          mimeType: "application/vnd.apple.mpegurl",
          providerId: "animepahe",
        },
        firefoxUserAgent,
      ),
    ).toBe(true);
    expect(
      shouldStartPlaybackInCompatibilityMode(
        {
          mimeType: "application/vnd.apple.mpegurl",
          providerId: "animetake",
        },
        firefoxUserAgent,
      ),
    ).toBe(false);
    expect(
      shouldStartPlaybackInCompatibilityMode(
        {
          mimeType: "application/vnd.apple.mpegurl",
          providerId: "animepahe",
        },
        chromeUserAgent,
      ),
    ).toBe(false);
  });

  it("only applies each fallback transition once", () => {
    const initial = createPlaybackFallbackState("session-1");
    const toCompat = applyPrimaryToCompatibilityFallback(initial, "primary");
    const repeatedToCompat = applyPrimaryToCompatibilityFallback(toCompat.nextState, "primary");
    const toPrimary = applyCompatibilityToPrimaryFallback(toCompat.nextState, "compatibility-mp4");
    const repeatedToPrimary = applyCompatibilityToPrimaryFallback(
      toPrimary.nextState,
      "compatibility-mp4",
    );

    expect(toCompat.nextMode).toBe("compatibility-mp4");
    expect(repeatedToCompat.nextMode).toBeNull();
    expect(toPrimary.nextMode).toBe("primary");
    expect(repeatedToPrimary.nextMode).toBeNull();
  });

  it("detects when compatibility fallback is available at all", () => {
    expect(
      supportsCompatibilityPlaybackFallback(
        { mimeType: "application/vnd.apple.mpegurl" },
        firefoxUserAgent,
      ),
    ).toBe(true);
    expect(
      supportsCompatibilityPlaybackFallback(
        { mimeType: "video/mp4" },
        firefoxUserAgent,
      ),
    ).toBe(false);
  });

  it("gives animepahe compatibility playback a longer startup window on firefox", () => {
    expect(
      getCompatibilityPlaybackStartupTimeoutMs(
        {
          mimeType: "application/vnd.apple.mpegurl",
          providerId: "animepahe",
        },
        firefoxUserAgent,
      ),
    ).toBe(90_000);
    expect(
      getCompatibilityPlaybackStartupTimeoutMs(
        {
          mimeType: "application/vnd.apple.mpegurl",
          providerId: "animetake",
        },
        firefoxUserAgent,
      ),
    ).toBe(20_000);
    expect(
      getCompatibilityPlaybackStartupTimeoutMs(
        {
          mimeType: "video/mp4",
          providerId: "animepahe",
        },
        firefoxUserAgent,
      ),
    ).toBe(20_000);
  });
});
