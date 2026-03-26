import { describe, expect, it } from "vitest";
import { getPlaybackSessionRefreshDelayMs } from "./use-playback-session-query";

describe("playback session refresh timing", () => {
  it("returns null for missing or invalid expirations", () => {
    expect(getPlaybackSessionRefreshDelayMs(null, 1_000)).toBeNull();
    expect(getPlaybackSessionRefreshDelayMs("not-a-date", 1_000)).toBeNull();
  });

  it("refreshes shortly after expiry when a session is already stale", () => {
    expect(getPlaybackSessionRefreshDelayMs("1970-01-01T00:00:00.000Z", 5_000)).toBe(1_000);
  });

  it("waits until just after the session expires when it is still active", () => {
    expect(
      getPlaybackSessionRefreshDelayMs("1970-01-01T00:00:15.000Z", 10_000),
    ).toBe(6_000);
  });
});
