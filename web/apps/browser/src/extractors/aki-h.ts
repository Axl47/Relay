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

type PlaywrightElementLike = {
  click(options?: Record<string, unknown>): Promise<void>;
};

type PlaywrightFrameLike = {
  url(): string;
  $(selector: string): Promise<PlaywrightElementLike | null>;
};

type PlaywrightPageLike = {
  goto(url: string, options?: Record<string, unknown>): Promise<unknown>;
  waitForTimeout(timeoutMs: number): Promise<void>;
  frames(): PlaywrightFrameLike[];
  on(
    event: "response",
    listener: (response: { url(): string; status(): number }) => void,
  ): void;
};

const AKI_H_PLAY_SELECTOR_CANDIDATES = [
  ".play-icon",
  "#vid_play",
  ".jw-icon-display",
  ".jw-display-icon-container",
  ".jw-display",
];

const AKI_H_PLAYLIST_PATTERN =
  /^https:\/\/aki-h\.stream\/(?:file|file2|quality|quality2)\/[^/?#]+(?:\/[^/?#]+\/?)?$/i;

function createUnsupportedMethodError() {
  return new BrowserExtractionError(
    "invalid_request",
    "Aki-H browser extraction is only implemented for playback.",
    { statusCode: 501 },
  );
}

function pickBestPlaylistUrl(candidates: string[]) {
  const master = candidates.find((url) => /\/file2?\//i.test(url));
  if (master) {
    return master;
  }

  const quality = candidates.find((url) => /\/quality2?\//i.test(url));
  if (!quality) {
    return null;
  }

  const parsed = new URL(quality);
  const match = parsed.pathname.match(/^\/quality(2)?\/([^/]+)\/[^/]+\/?$/i);
  if (!match?.[2]) {
    return quality;
  }

  return `${parsed.origin}/file${match[1] ?? ""}/${match[2]}/`;
}

function derivePlaylistHeaders(playlistUrl: string) {
  const parsed = new URL(playlistUrl);
  const match = parsed.pathname.match(/^\/(file|file2|quality|quality2)\/([^/]+)/i);
  const kind = match?.[1]?.toLowerCase() ?? "file";
  const id = match?.[2] ?? "";
  const playbackPath = /2$/.test(kind) ? "v2" : "v";
  const referer = `${parsed.origin}/${playbackPath}/${id}`;

  return {
    referer,
    origin: parsed.origin,
  };
}

export class AkiHExtractor implements BrowserProviderExtractor {
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
      const playlistCandidates: string[] = [];

      browserPage.on("response", (response) => {
        const url = response.url();
        if (!AKI_H_PLAYLIST_PATTERN.test(url) || response.status() !== 200) {
          return;
        }

        if (!playlistCandidates.includes(url)) {
          playlistCandidates.push(url);
        }
      });

      await browserPage.goto(`https://${runtime.domain}/watch/${input.externalEpisodeId}/`, {
        waitUntil: "domcontentloaded",
        timeout: 20_000,
      });

      await browserPage.waitForTimeout(4_000);

      for (let attempt = 0; attempt < 6 && playlistCandidates.length === 0; attempt += 1) {
        for (const frame of browserPage.frames()) {
          for (const selector of AKI_H_PLAY_SELECTOR_CANDIDATES) {
            const handle = await frame.$(selector).catch(() => null);
            if (!handle) {
              continue;
            }

            await handle.click({ timeout: 1_000 }).catch(() => undefined);
            await browserPage.waitForTimeout(1_200);

            if (playlistCandidates.length > 0) {
              break;
            }
          }

          if (playlistCandidates.length > 0) {
            break;
          }
        }

        if (playlistCandidates.length === 0) {
          await browserPage.waitForTimeout(1_000);
        }
      }

      const playlistUrl = pickBestPlaylistUrl(playlistCandidates);
      if (!playlistUrl) {
        throw new BrowserExtractionError(
          "upstream_error",
          `Aki-H did not expose a direct playlist for episode "${input.externalEpisodeId}".`,
          { statusCode: 502 },
        );
      }

      return {
        providerId: input.providerId,
        externalAnimeId: input.externalAnimeId,
        externalEpisodeId: input.externalEpisodeId,
        streams: [
          {
            id: "aki-h-hls",
            url: playlistUrl,
            quality: "auto",
            mimeType: "application/vnd.apple.mpegurl",
            headers: derivePlaylistHeaders(playlistUrl),
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
