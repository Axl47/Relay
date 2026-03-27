import type { PlaybackResolution, ProviderEpisodeRef } from "@relay/contracts";
import { BrowserExtractionError } from "../../errors";
import type { PlaywrightPageLike } from "../common/playwright-types";
import type { ExtractionRuntime } from "../types";
import {
  buildEpisodeUrl,
  cleanText,
  guessMimeType,
  inferQuality,
  normalizeAnimeId,
  normalizeEpisodeId,
  parseSubtitleCandidate,
  safeAbsoluteUrl,
  shouldCaptureDirectMedia,
  waitForHentaiHavenReady,
} from "./shared";
import { PLAYER_API_URL } from "./shared";
import { requestPlayerApiPayload } from "./player-api";
import type {
  PlaybackApiPayload,
  PlaybackPageSnapshot,
  ResolvedStreamCandidate,
  SubtitleCandidate,
} from "./types";

export async function extractPlaybackSnapshot(page: PlaywrightPageLike): Promise<PlaybackPageSnapshot> {
  return page.evaluate(() => ({
    iframeUrl:
      document
        .querySelector<HTMLIFrameElement>(".player_logic_item iframe[src*='player.php?data=']")
        ?.getAttribute("src") ?? null,
    title: (document.querySelector("h1")?.textContent ?? document.title).replace(/\s+/g, " ").trim(),
  }));
}

export function buildStreamCandidates(
  apiPayloads: PlaybackApiPayload[],
  capturedMediaUrls: string[],
  iframeUrl: string | null,
) {
  const candidates = new Map<string, ResolvedStreamCandidate>();

  const addCandidate = (candidate: ResolvedStreamCandidate) => {
    if (!candidate.url) {
      return;
    }

    const existing = candidates.get(candidate.url);
    if (!existing) {
      candidates.set(candidate.url, candidate);
      return;
    }

    candidates.set(candidate.url, {
      ...existing,
      ...candidate,
      isDefault: existing.isDefault || candidate.isDefault,
    });
  };

  for (const payload of apiPayloads) {
    for (const source of payload.data?.sources ?? []) {
      const url = safeAbsoluteUrl(source.src);
      if (!url) {
        continue;
      }

      const mimeType = guessMimeType(source.type, url);
      if (mimeType === "text/html") {
        continue;
      }

      addCandidate({
        id: `hentaihaven-stream-${candidates.size + 1}`,
        url,
        mimeType,
        quality: inferQuality(
          source.label ?? source.type ?? url,
          mimeType === "application/vnd.apple.mpegurl" ? "auto" : "default",
        ),
        proxyMode: "proxy",
        isDefault: candidates.size === 0,
      });
    }
  }

  for (const url of capturedMediaUrls) {
    const absoluteUrl = safeAbsoluteUrl(url);
    if (!absoluteUrl || !shouldCaptureDirectMedia(absoluteUrl)) {
      continue;
    }

    const mimeType = guessMimeType("", absoluteUrl);
    if (mimeType === "text/html") {
      continue;
    }

    addCandidate({
      id: `hentaihaven-stream-${candidates.size + 1}`,
      url: absoluteUrl,
      mimeType,
      quality: inferQuality(
        absoluteUrl,
        mimeType === "application/vnd.apple.mpegurl" ? "auto" : "default",
      ),
      proxyMode: "proxy",
      isDefault: candidates.size === 0,
    });
  }

  const iframeCandidateUrl = safeAbsoluteUrl(iframeUrl);
  if (iframeCandidateUrl) {
    addCandidate({
      id: `hentaihaven-stream-${candidates.size + 1}`,
      url: iframeCandidateUrl,
      mimeType: "text/html",
      quality: "embed",
      proxyMode: "redirect",
      isDefault: candidates.size === 0,
    });
  }

  return Array.from(candidates.values()).sort((left, right) => {
    const leftScore =
      left.mimeType === "application/vnd.apple.mpegurl"
        ? 4
        : left.mimeType === "application/dash+xml"
          ? 3
          : left.mimeType === "video/mp4"
            ? 2
            : 1;
    const rightScore =
      right.mimeType === "application/vnd.apple.mpegurl"
        ? 4
        : right.mimeType === "application/dash+xml"
          ? 3
          : right.mimeType === "video/mp4"
            ? 2
            : 1;

    if (leftScore !== rightScore) {
      return rightScore - leftScore;
    }

    if (left.isDefault !== right.isDefault) {
      return left.isDefault ? -1 : 1;
    }

    return left.url.localeCompare(right.url);
  });
}

export function collectSubtitleMap(
  subtitles: Map<string, SubtitleCandidate>,
  url: string,
) {
  const subtitle = parseSubtitleCandidate(url);
  if (subtitle) {
    subtitles.set(subtitle.url, subtitle);
  }
}

export async function resolveHentaiHavenPlayback(
  input: ProviderEpisodeRef,
  runtime: ExtractionRuntime,
): Promise<PlaybackResolution> {
  return runtime.withPage(async (page) => {
    const browserPage = page as unknown as PlaywrightPageLike;
    const animeId = normalizeAnimeId(input.externalAnimeId);
    const episodeId = normalizeEpisodeId(input.externalEpisodeId, animeId);
    const episodeUrl = buildEpisodeUrl(animeId, episodeId);
    const apiPayloads: PlaybackApiPayload[] = [];
    const mediaUrls: string[] = [];
    const subtitles = new Map<string, SubtitleCandidate>();
    const apiPayloadTasks: Promise<void>[] = [];

    browserPage.on("response", (response) => {
      const url = response.url();

      if (url === PLAYER_API_URL) {
        if (response.status() !== 200) {
          return;
        }

        apiPayloadTasks.push(
          response
            .text()
            .then((body) => {
              try {
                apiPayloads.push(JSON.parse(body) as PlaybackApiPayload);
              } catch {
                // Ignore malformed API payloads and fall back to network captures.
              }
            })
            .catch(() => undefined),
        );
        return;
      }

      if (response.status() === 200 && shouldCaptureDirectMedia(url)) {
        mediaUrls.push(url);
        return;
      }

      if (response.status() !== 200) {
        return;
      }

      collectSubtitleMap(subtitles, url);
    });

    await browserPage.goto(episodeUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await waitForHentaiHavenReady(browserPage, "episode", episodeUrl);
    await browserPage.waitForSelector(".player_logic_item iframe[src*='player.php?data=']", {
      timeout: 12_000,
    });
    await browserPage.waitForTimeout(1_500);
    await Promise.allSettled(apiPayloadTasks);

    const snapshot = await extractPlaybackSnapshot(browserPage);
    const directApiPayload = await requestPlayerApiPayload(browserPage, snapshot.iframeUrl);
    if (directApiPayload) {
      apiPayloads.push(directApiPayload);
    }
    const streams = buildStreamCandidates(apiPayloads, mediaUrls, snapshot.iframeUrl).map(
      (stream, index) => ({
        ...stream,
        id: `hentaihaven-${index + 1}`,
        headers: {},
        cookies: {},
      }),
    );

    if (streams.length === 0) {
      throw new BrowserExtractionError(
        "upstream_error",
        `HentaiHaven episode "${episodeId}" exposed no playable stream or iframe.`,
        { statusCode: 502 },
      );
    }

    return {
      providerId: input.providerId,
      externalAnimeId: animeId,
      externalEpisodeId: episodeId,
      streams,
      subtitles: Array.from(subtitles.values()).sort((left, right) => {
        if (left.isDefault !== right.isDefault) {
          return left.isDefault ? -1 : 1;
        }

        return left.label.localeCompare(right.label);
      }),
      cookies: {},
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    };
  });
}
