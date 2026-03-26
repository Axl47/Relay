import { describe, expect, it } from "vitest";
import {
  buildPlaybackRequestHeaders,
  buildProxyStreamPath,
  normalizeStreamContentType,
  rewriteDashManifest,
  rewriteHlsPlaylist,
  shouldRewriteDashBody,
  shouldRewriteHlsBody,
} from "./proxy";

describe("stream proxy helpers", () => {
  it("rewrites HLS playlists onto session-scoped proxy paths", () => {
    const rewritten = rewriteHlsPlaylist(
      [
        "#EXTM3U",
        '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",URI="subs/en.m3u8"',
        '#EXT-X-STREAM-INF:BANDWIDTH=1280000,SUBTITLES="subs"',
        "variant/main.m3u8",
      ].join("\n"),
      "https://upstream.example/master.m3u8",
      "session-1",
      { stripSubtitleRenditions: true },
    );

    expect(rewritten).not.toContain("TYPE=SUBTITLES");
    expect(rewritten).not.toContain('SUBTITLES="subs"');
    expect(rewritten).toContain(
      buildProxyStreamPath("session-1", "https://upstream.example/variant/main.m3u8"),
    );
  });

  it("rewrites DASH manifests for both base URLs and relative segment templates", () => {
    const rewritten = rewriteDashManifest(
      [
        "<MPD>",
        "  <BaseURL>https://cdn.example/video/</BaseURL>",
        '  <SegmentTemplate initialization="/init.mp4" media="segment-$Number$.m4s" />',
        "</MPD>",
      ].join(""),
      "https://upstream.example/manifest.mpd",
      "session-2",
    );

    expect(rewritten).toContain(buildProxyStreamPath("session-2", "https://cdn.example/video/"));
    expect(rewritten).toContain('/stream/session-2/__root__/init.mp4');
    expect(rewritten).toContain('/stream/session-2/segment-$Number$.m4s');
  });

  it("normalizes disguised fragment content types and rewrite detection", () => {
    expect(
      normalizeStreamContentType(
        "https://vault-99.owocdn.top/segment-1-v1-a1.jpg",
        "image/jpeg",
      ),
    ).toBe("video/mp2t");
    expect(shouldRewriteHlsBody("https://cdn.example/master.m3u8", "application/vnd.apple.mpegurl")).toBe(true);
    expect(shouldRewriteDashBody("https://cdn.example/manifest.mpd", "application/octet-stream")).toBe(true);
  });

  it("builds playback headers with cookies and range forwarding", () => {
    expect(
      buildPlaybackRequestHeaders(
        {
          headers: {
            referer: "https://provider.example/watch",
          },
          cookies: {
            session: "abc",
            token: "def",
          },
        },
        { range: "bytes=0-100" },
      ),
    ).toMatchObject({
      referer: "https://provider.example/watch",
      cookie: "session=abc; token=def",
      range: "bytes=0-100",
    });
  });
});
