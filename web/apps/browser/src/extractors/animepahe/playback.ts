import type { PlaybackResolution, ProviderEpisodeRef } from "@relay/contracts";
import { BrowserExtractionError } from "../../errors";
import type { PlaywrightPageLike } from "../common/playwright-types";
import type { ExtractionRuntime } from "../types";
import { waitForAnimePaheReady } from "./api";
import { normalizeHeaders } from "./shared";
import type { AnimePahePlaybackCandidate, ManifestCapture } from "./types";

export async function extractPlaybackCandidates(
  page: PlaywrightPageLike,
): Promise<AnimePahePlaybackCandidate[]> {
  return page.evaluate(() => {
    const parsed = Array.from(document.querySelectorAll<HTMLElement>("[data-src]"))
      .map((node) => {
        const embedUrl = (node.dataset.src ?? "").replace(/\s+/g, " ").trim();
        if (!embedUrl) {
          return null;
        }

        const resolution = (node.dataset.resolution ?? "").replace(/\s+/g, " ").trim();
        return {
          embedUrl,
          quality:
            resolution
              ? `${resolution}p`
              : (node.textContent ?? "").replace(/\s+/g, " ").trim() || "auto",
          isDefault: node.classList.contains("active"),
        };
      })
      .filter(
        (
          entry,
        ): entry is {
          embedUrl: string;
          quality: string;
          isDefault: boolean;
        } => entry !== null,
      );

    if (parsed.length > 0) {
      return parsed;
    }

    const inlineScript = Array.from(document.scripts)
      .map((script) => script.textContent ?? "")
      .find((script) => script.includes("let url ="));
    const match = inlineScript?.match(/let\s+url\s*=\s*"([^"]+)"/);
    if (!match?.[1]) {
      return [];
    }

    return [
      {
        embedUrl: match[1],
        quality: "auto",
        isDefault: true,
      },
    ];
  });
}

export async function captureKwikManifest(
  page: PlaywrightPageLike,
  embedUrl: string,
): Promise<ManifestCapture> {
  let capture: ManifestCapture | null = null;

  page.on("response", (response) => {
    const url = response.url();
    if (capture || !url.includes(".m3u8") || response.status() !== 200) {
      return;
    }

    void response.request().allHeaders().then((headers) => {
      if (capture) {
        return;
      }

      capture = {
        url,
        headers: normalizeHeaders(headers),
      };
    });
  });

  await page.goto(embedUrl, {
    waitUntil: "domcontentloaded",
    timeout: 20_000,
  });

  await page.waitForSelector("video, button[aria-label='Play']", { timeout: 8_000 });
  await page.waitForTimeout(1_500);

  for (let attempt = 0; attempt < 4 && !capture; attempt += 1) {
    await page.click("button[aria-label='Play']", { timeout: 1_000 }).catch(() => undefined);
    await page.click("video", { timeout: 1_000, force: true }).catch(() => undefined);
    await page
      .evaluate(() => {
        const video = document.querySelector("video") as HTMLVideoElement | null;
        if (!video) {
          return;
        }

        video.muted = true;
        void video.play().catch(() => undefined);
      })
      .catch(() => undefined);

    await page.waitForTimeout(2_000);
  }

  const resolvedCapture = capture as ManifestCapture | null;
  if (!resolvedCapture) {
    throw new BrowserExtractionError(
      "upstream_error",
      `AnimePahe playback did not expose an HLS manifest for ${embedUrl}.`,
      { statusCode: 502 },
    );
  }

  const defaultHeaders = {
    referer: embedUrl,
    origin: new URL(embedUrl).origin,
  };

  return {
    url: resolvedCapture.url,
    headers: {
      ...defaultHeaders,
      ...resolvedCapture.headers,
    },
  };
}

export async function resolveAnimePahePlayback(
  input: ProviderEpisodeRef,
  runtime: ExtractionRuntime,
): Promise<PlaybackResolution> {
  return runtime.withPage(async (page) => {
    const browserPage = page as unknown as PlaywrightPageLike;
    await browserPage.goto(
      `https://${runtime.domain}/play/${input.externalAnimeId}/${input.externalEpisodeId}`,
      {
        waitUntil: "domcontentloaded",
        timeout: 20_000,
      },
    );
    await waitForAnimePaheReady(
      browserPage,
      `AnimePahe challenge did not clear for episode "${input.externalEpisodeId}".`,
    );

    const candidates = await extractPlaybackCandidates(browserPage);
    if (candidates.length === 0) {
      throw new BrowserExtractionError(
        "upstream_error",
        `AnimePahe play page for "${input.externalEpisodeId}" exposed no playback candidates.`,
        { statusCode: 502 },
      );
    }

    const candidate = [...candidates].sort((left, right) => {
      if (left.isDefault !== right.isDefault) {
        return left.isDefault ? -1 : 1;
      }

      const leftQuality = Number.parseInt(left.quality, 10) || 0;
      const rightQuality = Number.parseInt(right.quality, 10) || 0;
      return rightQuality - leftQuality;
    })[0];

    const manifest = await captureKwikManifest(browserPage, candidate.embedUrl);

    return {
      providerId: input.providerId,
      externalAnimeId: input.externalAnimeId,
      externalEpisodeId: input.externalEpisodeId,
      streams: [
        {
          id: `animepahe-${candidate.quality.toLowerCase()}`,
          url: manifest.url,
          quality: candidate.quality,
          mimeType: "application/vnd.apple.mpegurl",
          headers: manifest.headers,
          cookies: {},
          proxyMode: "proxy",
          isDefault: true,
        },
      ],
      subtitles: [],
      cookies: {},
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    };
  });
}
