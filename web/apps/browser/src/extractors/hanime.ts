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
  click(selector: string, options?: Record<string, unknown>): Promise<void>;
  waitForSelector(
    selector: string,
    options?: Record<string, unknown>,
  ): Promise<{ contentFrame(): Promise<PlaywrightFrameLike | null> } | null>;
  evaluate<T>(pageFunction: () => T): Promise<T>;
  on(event: "request", listener: (request: { url(): string }) => void): void;
  on(
    event: "response",
    listener: (response: { url(): string; status(): number; text(): Promise<string> }) => void,
  ): void;
};

type PlaywrightFrameLike = {
  waitForSelector(selector: string, options?: Record<string, unknown>): Promise<unknown>;
  click(selector: string, options?: Record<string, unknown>): Promise<void>;
};

type HanimeManifest = {
  videos_manifest?: {
    servers?: Array<{
      name?: string | null;
      sequence?: number | null;
      streams?: Array<{
        url?: string | null;
        kind?: string | null;
        mime_type?: string | null;
        height?: string | number | null;
        is_guest_allowed?: boolean | null;
      }>;
    }>;
  };
};

const HANIME_PLAY_RESPONSE_PATTERN =
  /^https:\/\/cached\.freeanimehentai\.net\/api\/v8\/hentai_videos\/.+\/play(?:\?|$)/i;
const HANIME_PLAYER_SELECTOR = ".hvp-panel";

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

function pickHanimeManifestStream(payload: HanimeManifest) {
  const candidates = (payload.videos_manifest?.servers ?? [])
    .flatMap((server) =>
      (server.streams ?? []).map((stream) => ({
        url: stream.url ?? null,
        mimeType: stream.mime_type === "application/x-mpegURL"
          ? "application/vnd.apple.mpegurl"
          : (stream.mime_type ?? "application/vnd.apple.mpegurl"),
        height: Number.parseInt(String(stream.height ?? ""), 10),
        sequence: server.sequence ?? 0,
        kind: stream.kind ?? null,
        isGuestAllowed: stream.is_guest_allowed,
      })),
    )
    .filter(
      (stream): stream is {
        url: string;
        mimeType: string;
        height: number;
        sequence: number;
        kind: string | null;
        isGuestAllowed: boolean | null | undefined;
      } => typeof stream.url === "string" && stream.url.length > 0,
    )
    .filter((stream) => stream.isGuestAllowed !== false)
    .sort((left, right) => {
      const leftHeight = Number.isFinite(left.height) ? left.height : 0;
      const rightHeight = Number.isFinite(right.height) ? right.height : 0;
      if (leftHeight !== rightHeight) {
        return rightHeight - leftHeight;
      }

      return right.sequence - left.sequence;
    });

  return candidates[0] ?? null;
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
      const playReadyPromise = new Promise<void>((resolve) => {
        browserPage.on("response", (response) => {
          if (!HANIME_PLAY_RESPONSE_PATTERN.test(response.url()) || response.status() !== 200) {
            return;
          }
          resolve();
        });
      });

      await browserPage.goto(`https://${runtime.domain}/videos/hentai/${input.externalEpisodeId}`, {
        waitUntil: "domcontentloaded",
        timeout: 20_000,
      });

      await browserPage.waitForSelector(HANIME_PLAYER_SELECTOR, { timeout: 8_000 });
      await browserPage.waitForTimeout(1_500);

      let playReady = false;
      for (let attempt = 0; attempt < 3 && !playReady; attempt += 1) {
        await browserPage.click(".unit__close", { timeout: 500 }).catch(() => undefined);
        await browserPage.click(HANIME_PLAYER_SELECTOR, { timeout: 5_000 }).catch(() => undefined);

        playReady = await Promise.race([
          playReadyPromise.then(() => true),
          browserPage.waitForTimeout(3_000).then(() => false),
        ]);

        if (playReady) {
          break;
        }

        const iframeHandle = await browserPage
          .waitForSelector(
            "iframe.hvp-panel, iframe[src*='/omni-player/'], iframe[src*='player.hanime.tv']",
            { timeout: 1_500 },
          )
          .catch(() => null);
        const frame = await iframeHandle?.contentFrame();

        if (!frame) {
          continue;
        }

        await frame.waitForSelector(".op-poster", { timeout: 1_500 }).catch(() => null);
        await frame.click(".op-poster").catch(() => undefined);

        playReady = await Promise.race([
          playReadyPromise.then(() => true),
          browserPage.waitForTimeout(2_500).then(() => false),
        ]);
      }

      if (!playReady) {
        await waitForWithTimeout(
          playReadyPromise,
          5_000,
          `Timed out waiting for Hanime playback for episode "${input.externalEpisodeId}".`,
        );
      }

      const manifestResponse = await browserPage.evaluate(async () => {
        const hvId =
          (globalThis as {
            __NUXT__?: {
              state?: {
                data?: {
                  video?: {
                    hentai_video?: {
                      id?: number;
                    };
                  };
                };
              };
            };
          }).__NUXT__?.state?.data?.video?.hentai_video?.id;

        if (!hvId) {
          throw new Error("Hanime page did not expose a hentai video ID.");
        }

        let lastStatus = 0;
        let lastBody = "";
        for (let attempt = 0; attempt < 10; attempt += 1) {
          const response = await fetch(
            `https://cached.freeanimehentai.net/api/v8/guest/videos/${hvId}/manifest`,
            {
              credentials: "include",
            },
          );
          lastStatus = response.status;
          lastBody = await response.text();
          if (response.status === 200) {
            return {
              status: response.status,
              body: lastBody,
            };
          }

          await new Promise((resolve) => setTimeout(resolve, 500));
        }

        return {
          status: lastStatus,
          body: lastBody,
        };
      });

      if (manifestResponse.status !== 200) {
        throw new BrowserExtractionError(
          "upstream_error",
          `Hanime manifest request failed with status ${manifestResponse.status}.`,
          { statusCode: 502 },
        );
      }

      const stream = pickHanimeManifestStream(JSON.parse(manifestResponse.body) as HanimeManifest);
      if (!stream) {
        throw new BrowserExtractionError(
          "upstream_error",
          `Hanime manifest for episode "${input.externalEpisodeId}" exposed no guest stream.`,
          { statusCode: 502 },
        );
      }

      return {
        providerId: input.providerId,
        externalAnimeId: input.externalAnimeId,
        externalEpisodeId: input.externalEpisodeId,
        streams: [
          {
            id: "hanime-live-hls",
            url: stream.url,
            quality: Number.isFinite(stream.height) && stream.height > 0
              ? `${stream.height}p`
              : "default",
            mimeType: "application/vnd.apple.mpegurl",
            headers: {},
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
}
