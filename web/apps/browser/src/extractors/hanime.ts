import type {
  AnimeDetails,
  EpisodeList,
  PlaybackResolution,
  ProviderAnimeRef,
  ProviderEpisodeRef,
  SearchInput,
  SearchPage,
} from "@relay/contracts";
import { BrowserExtractionError } from "../errors";
import type { BrowserProviderExtractor, ExtractionRuntime } from "./types";

type PlaywrightPageLike = {
  goto(url: string, options?: Record<string, unknown>): Promise<unknown>;
  waitForTimeout(timeoutMs: number): Promise<void>;
  waitForSelector(
    selector: string,
    options?: Record<string, unknown>,
  ): Promise<{ contentFrame(): Promise<PlaywrightFrameLike | null> } | null>;
  evaluate<T>(pageFunction: () => T): Promise<T>;
  on(event: "request", listener: (request: { url(): string }) => void): void;
};

type PlaywrightFrameLike = {
  waitForSelector(selector: string, options?: Record<string, unknown>): Promise<unknown>;
  click(selector: string, options?: Record<string, unknown>): Promise<void>;
};

const M3U8_REQUEST_PATTERN = /^https:\/\/m3u8s\.highwinds-cdn\.com\/api\/v\d+\/m3u8s\/.+\.m3u8(?:\?|$)/i;

function createUnsupportedMethodError() {
  return new BrowserExtractionError(
    "invalid_request",
    "Hanime browser extraction is only implemented for playback.",
    { statusCode: 501 },
  );
}

function waitForWithTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new BrowserExtractionError("timeout", message, { statusCode: 504 }));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export class HanimeExtractor implements BrowserProviderExtractor {
  async search(_input: SearchInput, _runtime: ExtractionRuntime): Promise<SearchPage> {
    throw createUnsupportedMethodError();
  }

  async getAnime(_input: ProviderAnimeRef, _runtime: ExtractionRuntime): Promise<AnimeDetails> {
    throw createUnsupportedMethodError();
  }

  async getEpisodes(_input: ProviderAnimeRef, _runtime: ExtractionRuntime): Promise<EpisodeList> {
    throw createUnsupportedMethodError();
  }

  async resolvePlayback(
    input: ProviderEpisodeRef,
    runtime: ExtractionRuntime,
  ): Promise<PlaybackResolution> {
    return runtime.withPage(async (page) => {
      const browserPage = page as unknown as PlaywrightPageLike;
      const streamUrlPromise = new Promise<string>((resolve) => {
        browserPage.on("request", (request) => {
          const url = request.url();
          if (M3U8_REQUEST_PATTERN.test(url)) {
            resolve(url);
          }
        });
      });

      await browserPage.goto(`https://${runtime.domain}/videos/hentai/${input.externalEpisodeId}`, {
        waitUntil: "domcontentloaded",
      });

      const preferredQuality = await browserPage
        .evaluate(() => {
          const servers =
            (globalThis as {
              __NUXT__?: {
                state?: {
                  data?: {
                    video?: {
                      videos_manifest?: {
                        servers?: Array<{
                          streams?: Array<{ height?: string | number | null }>;
                        }>;
                      };
                    };
                  };
                };
              };
            }).__NUXT__?.state?.data?.video?.videos_manifest?.servers ?? [];

          const heights = servers
            .flatMap((server) => server.streams ?? [])
            .map((stream) => Number.parseInt(String(stream.height ?? ""), 10))
            .filter((height) => Number.isFinite(height))
            .sort((left, right) => right - left);

          return heights[0] ? `${heights[0]}p` : "default";
        })
        .catch(() => "default");

      try {
        await waitForWithTimeout(streamUrlPromise, 6_000, "Timed out waiting for Hanime playback.");
      } catch {
        const iframeHandle = await browserPage.waitForSelector(
          "iframe.hvp-panel, iframe[src*='/omni-player/'], iframe[src*='player.hanime.tv']",
          { timeout: 20_000 },
        );
        const frame = await iframeHandle?.contentFrame();

        if (frame) {
          await frame.waitForSelector(".op-poster", { timeout: 10_000 }).catch(() => null);
          await frame.click(".op-poster").catch(() => undefined);
        }
      }

      const streamUrl = await waitForWithTimeout(
        streamUrlPromise,
        40_000,
        `Timed out waiting for Hanime playback for episode "${input.externalEpisodeId}".`,
      );

      return {
        providerId: input.providerId,
        externalAnimeId: input.externalAnimeId,
        externalEpisodeId: input.externalEpisodeId,
        streams: [
          {
            id: "hanime-live-hls",
            url: streamUrl,
            quality: preferredQuality,
            mimeType: "application/vnd.apple.mpegurl",
            headers: {},
            cookies: {},
            proxyMode: "redirect",
            isDefault: true,
          },
        ],
        subtitles: [],
        cookies: {},
        expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      };
    });
  }
}
