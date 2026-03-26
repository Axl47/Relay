import { describe, expect, it, vi } from "vitest";
import {
  resolvePlaybackSessionUrlForClient,
  resolveRelayApiUrlForClient,
} from "./api-base-url";

describe("api base url helpers", () => {
  it("keeps direct loopback stream URLs when the browser is also on loopback", () => {
    vi.stubGlobal("window", {
      location: {
        href: "http://localhost:3000/watch/example",
        hostname: "localhost",
      },
    });

    expect(resolveRelayApiUrlForClient("http://localhost:4000/stream/session-id")).toBe(
      "http://localhost:4000/stream/session-id",
    );
    expect(
      resolvePlaybackSessionUrlForClient(
        "http://localhost:4000/stream/session-id",
        "session-id",
        "/compat.mp4",
      ),
    ).toBe("http://localhost:4000/playback/sessions/session-id/compat.mp4");
  });

  it("rewrites loopback stream URLs through the client proxy on non-loopback browsers", () => {
    vi.stubGlobal("window", {
      location: {
        href: "http://192.168.1.25:3000/watch/example",
        hostname: "192.168.1.25",
      },
    });

    expect(resolveRelayApiUrlForClient("http://localhost:4000/stream/session-id")).toBe(
      "/__relay_api/stream/session-id",
    );
    expect(
      resolvePlaybackSessionUrlForClient(
        "http://localhost:4000/stream/session-id",
        "session-id",
        "/compat.mp4",
      ),
    ).toBe("http://192.168.1.25:3000/__relay_api/playback/sessions/session-id/compat.mp4");
  });
});
