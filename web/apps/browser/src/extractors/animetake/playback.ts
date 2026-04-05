import type { PlaybackResolution, ProviderEpisodeRef } from "@relay/contracts";
import { BrowserExtractionError } from "../../errors";
import type {
  PlaywrightPageLike,
  PlaywrightRequestLike,
  PlaywrightResponseLike,
} from "../common/playwright-types";
import type { ExtractionRuntime } from "../types";
import {
  addPlaybackCandidatesFromEpisodeInfo,
  fetchAnimeTakeEpisodeInfo,
  fetchAnimeTakeServerSnapshot,
  orderPlaybackCandidates,
  resolveEpisodeIdFromSnapshot,
  selectPreferredAnimeTakeServer,
} from "./ajax";
import { fetchAnimeTakeResponseText, navigate } from "./http";
import {
  ANIMETAKE_HTTP_USER_AGENT,
  BASE_URL,
  buildEpisodeUrl,
  cleanText,
  createPlaybackCandidateMap,
  guessMimeType,
  inferQuality,
  MEDIA_URL_PATTERN,
  normalizeHeaders,
  PLAY_BUTTON_SELECTORS,
  REDIRECT_URL_PATTERN,
  safeAbsoluteUrl,
  shouldIgnorePlaybackUrl,
} from "./shared";
import type { PlaybackCandidate } from "./types";

export async function extractPlaybackSnapshot(page: PlaywrightPageLike) {
  return page.evaluate(() => {
    const clean = (value?: string | null) => value?.replace(/\s+/g, " ").trim() ?? "";
    const toAbsolute = (value?: string | null) => {
      const cleaned = clean(value);
      if (!cleaned) {
        return null;
      }

      try {
        return new URL(cleaned, location.origin).toString();
      } catch {
        return null;
      }
    };
    const urls = new Set<string>();
    const redirectUrls = new Set<string>();

    const addUrl = (value?: string | null) => {
      const absolute = toAbsolute(value);
      if (!absolute) {
        return;
      }

      if (/\/redirect/i.test(absolute)) {
        redirectUrls.add(absolute);
        return;
      }

      urls.add(absolute);
    };

    for (const element of Array.from(document.querySelectorAll<HTMLElement>("[src], [href], [data-src], [data-url], [data-embed], [data-stream]"))) {
      addUrl(element.getAttribute("src"));
      addUrl(element.getAttribute("href"));
      addUrl(element.getAttribute("data-src"));
      addUrl(element.getAttribute("data-url"));
      addUrl(element.getAttribute("data-embed"));
      addUrl(element.getAttribute("data-stream"));
    }

    const html = document.documentElement.outerHTML;
    for (const match of html.match(/https?:\/\/[^"'`\s)]+?\.(?:m3u8|mpd|mp4)(?:\?[^"'`\s)]*)?/gi) ?? []) {
      addUrl(match);
    }
    for (const match of html.match(/(?:https?:\/\/[^"'`\s)]+)?\/redirect[^"'`\s)]*/gi) ?? []) {
      addUrl(match);
    }

    return {
      title: document.title,
      bodyText: clean(document.body?.innerText),
      videoSources: Array.from(document.querySelectorAll<HTMLMediaElement>("video, source[src]"))
        .map((element) => toAbsolute(element.getAttribute("src")))
        .filter((value): value is string => typeof value === "string"),
      iframeSources: Array.from(document.querySelectorAll<HTMLIFrameElement>("iframe[src]"))
        .map((iframe) => toAbsolute(iframe.getAttribute("src")))
        .filter((value): value is string => typeof value === "string"),
      redirectUrls: Array.from(redirectUrls),
      inlineMediaUrls: Array.from(urls).filter((url) => /\.(?:m3u8|mpd|mp4)(?:\?|$)/i.test(url)),
      inlineRedirectUrls: Array.from(redirectUrls),
    };
  });
}

export async function triggerPlayback(page: PlaywrightPageLike, selectors: string[]) {
  for (const selector of selectors) {
    await page.click(selector, { timeout: 1_500 }).catch(() => undefined);
    await page.waitForTimeout(800);
  }
}

export async function resolveAnimeTakePlayback(
  input: ProviderEpisodeRef,
  runtime: ExtractionRuntime,
): Promise<PlaybackResolution> {
  try {
    const serverSnapshot = await fetchAnimeTakeServerSnapshot(input.externalAnimeId, runtime.signal);
    const resolvedEpisodeId = resolveEpisodeIdFromSnapshot(
      serverSnapshot,
      input.externalEpisodeId,
    );
    const episodeUrl = buildEpisodeUrl(input.externalAnimeId, resolvedEpisodeId);
    const defaultHeaders = {
      referer: episodeUrl,
      origin: BASE_URL,
      "user-agent": ANIMETAKE_HTTP_USER_AGENT,
    };
    const candidates = createPlaybackCandidateMap();
    const preferredServer = selectPreferredAnimeTakeServer(serverSnapshot);

    const payload = await fetchAnimeTakeEpisodeInfo(
      input.externalAnimeId,
      resolvedEpisodeId,
      preferredServer,
      runtime.signal,
    );
    addPlaybackCandidatesFromEpisodeInfo(candidates, payload, defaultHeaders);

    if (candidates.values().length === 0 && payload.grabber) {
      const grabberUrl = `${payload.grabber}${encodeURIComponent(preferredServer)}`;
      const grabberBody = await fetchAnimeTakeResponseText(
        grabberUrl,
        runtime.signal,
        episodeUrl,
        "application/json,text/plain,*/*",
        "ajax",
      ).catch(() => "");

      for (const match of grabberBody.match(MEDIA_URL_PATTERN) ?? []) {
        if (shouldIgnorePlaybackUrl(match)) {
          continue;
        }

        candidates.add({
          id: `animetake-${candidates.values().length + 1}`,
          url: match,
          mimeType: guessMimeType(match),
          quality: inferQuality(match, /\.m3u8/i.test(match) ? "auto" : "default"),
          headers: defaultHeaders,
          proxyMode: "proxy",
          isDefault: true,
        });
      }
    }

    const ordered = orderPlaybackCandidates(candidates.values());
    if (ordered.length === 0) {
      throw new BrowserExtractionError(
        "upstream_error",
        `AnimeTake did not expose a playable source for episode "${input.externalEpisodeId}".`,
        { statusCode: 502 },
      );
    }

    return finishPlaybackResolution(input, ordered);
  } catch {
    return runtime.withPage(async (page) => {
      const browserPage = page as unknown as PlaywrightPageLike;
      const episodeUrl = buildEpisodeUrl(input.externalAnimeId, input.externalEpisodeId);
      const defaultHeaders = {
        referer: episodeUrl,
        origin: BASE_URL,
      };
      const candidates = createPlaybackCandidateMap();

      browserPage.on("request", async (request: PlaywrightRequestLike) => {
        const url = request.url();
        if (!/\.(?:m3u8|mpd|mp4)(?:\?|$)/i.test(url) || shouldIgnorePlaybackUrl(url)) {
          return;
        }

        const headers = normalizeHeaders(await request.allHeaders().catch(() => ({})));
        candidates.add({
          id: `animetake-${candidates.values().length + 1}`,
          url,
          mimeType: guessMimeType(url),
          quality: inferQuality(url, /\.m3u8/i.test(url) ? "auto" : "default"),
          headers: { ...defaultHeaders, ...headers },
          proxyMode: "proxy",
          isDefault: true,
        });
      });

      browserPage.on("response", async (response: PlaywrightResponseLike) => {
        const url = response.url();
        if (response.status() >= 400 || shouldIgnorePlaybackUrl(url)) {
          return;
        }

        const headers = normalizeHeaders(await response.request().allHeaders().catch(() => ({})));
        if (/\.(?:m3u8|mpd|mp4)(?:\?|$)/i.test(url)) {
          candidates.add({
            id: `animetake-${candidates.values().length + 1}`,
            url,
            mimeType: guessMimeType(url),
            quality: inferQuality(url, /\.m3u8/i.test(url) ? "auto" : "default"),
            headers: { ...defaultHeaders, ...headers },
            proxyMode: "proxy",
            isDefault: true,
          });
          return;
        }

        if (!/(json|source|embed|player|redirect|watch|episode|ajax)/i.test(url)) {
          return;
        }

        const body = await response.text().catch(() => "");
        for (const match of body.match(MEDIA_URL_PATTERN) ?? []) {
          candidates.add({
            id: `animetake-${candidates.values().length + 1}`,
            url: match,
            mimeType: guessMimeType(match),
            quality: inferQuality(match, /\.m3u8/i.test(match) ? "auto" : "default"),
            headers: { ...defaultHeaders, ...headers },
            proxyMode: "proxy",
            isDefault: true,
          });
        }

        for (const match of body.match(REDIRECT_URL_PATTERN) ?? []) {
          const absoluteUrl = safeAbsoluteUrl(match, BASE_URL);
          if (!absoluteUrl) {
            continue;
          }

          candidates.add({
            id: `animetake-${candidates.values().length + 1}`,
            url: absoluteUrl,
            mimeType: "text/html",
            quality: "embed",
            headers: {},
            proxyMode: "redirect",
            isDefault: false,
          });
        }
      });

      await navigate(browserPage, episodeUrl, "episode");
      await browserPage.waitForTimeout(2_000);
      await triggerPlayback(browserPage, PLAY_BUTTON_SELECTORS);
      await browserPage.waitForTimeout(3_000);

      const snapshot = await extractPlaybackSnapshot(browserPage);
      for (const url of [...snapshot.videoSources, ...snapshot.inlineMediaUrls]) {
        if (shouldIgnorePlaybackUrl(url)) {
          continue;
        }

        candidates.add({
          id: `animetake-${candidates.values().length + 1}`,
          url,
          mimeType: guessMimeType(url),
          quality: inferQuality(url, /\.m3u8/i.test(url) ? "auto" : "default"),
          headers: defaultHeaders,
          proxyMode: "proxy",
          isDefault: true,
        });
      }

      for (const url of [
        ...snapshot.iframeSources,
        ...snapshot.redirectUrls,
        ...snapshot.inlineRedirectUrls,
      ]) {
        if (shouldIgnorePlaybackUrl(url)) {
          continue;
        }

        candidates.add({
          id: `animetake-${candidates.values().length + 1}`,
          url,
          mimeType: "text/html",
          quality: inferQuality(url, "embed"),
          headers: {},
          proxyMode: "redirect",
          isDefault: false,
        });
      }

      const ordered = orderPlaybackCandidates(candidates.values());
      if (ordered.length === 0) {
        throw new BrowserExtractionError(
          "upstream_error",
          `AnimeTake did not expose a playable source for episode "${input.externalEpisodeId}".`,
          {
            statusCode: 502,
            details: {
              title: snapshot.title,
              sample: cleanText(snapshot.bodyText).slice(0, 240),
            },
          },
        );
      }

      return finishPlaybackResolution(input, ordered);
    });
  }
}

function finishPlaybackResolution(
  input: ProviderEpisodeRef,
  streams: PlaybackCandidate[],
): PlaybackResolution {
  return {
    providerId: input.providerId,
    externalAnimeId: input.externalAnimeId,
    externalEpisodeId: input.externalEpisodeId,
    streams: streams.slice(0, 4).map((candidate, index) => ({
      id: candidate.id,
      url: candidate.url,
      quality: candidate.quality,
      mimeType: candidate.mimeType,
      headers: candidate.headers,
      cookies: {},
      proxyMode: candidate.proxyMode,
      isDefault: index === 0,
    })),
    subtitles: [],
    cookies: {},
    expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
  };
}
