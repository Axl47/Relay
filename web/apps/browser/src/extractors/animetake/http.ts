import { BrowserExtractionError } from "../../errors";
import type { PlaywrightPageLike } from "../common/playwright-types";
import {
  ANIMETAKE_HTTP_USER_AGENT,
  BASE_URL,
  CHALLENGE_GRACE_TIMEOUT_MS,
  cleanText,
  looksLikeChallenge,
} from "./shared";

export function createAnimeTakeRequestHeaders(
  referer: string,
  accept: string,
  requestType: "html" | "ajax",
) {
  const headers: Record<string, string> = {
    accept,
    "accept-language": "en-US,en;q=0.9",
    origin: BASE_URL,
    referer,
    "user-agent": ANIMETAKE_HTTP_USER_AGENT,
  };

  if (requestType === "ajax") {
    headers["x-requested-with"] = "XMLHttpRequest";
  }

  return headers;
}

export async function fetchAnimeTakeResponseText(
  url: string,
  signal: AbortSignal,
  referer: string,
  accept: string,
  requestType: "html" | "ajax",
) {
  const response = await fetch(url, {
    method: "GET",
    signal,
    headers: createAnimeTakeRequestHeaders(referer, accept, requestType),
  });
  const body = await response.text();

  if (!response.ok) {
    throw new BrowserExtractionError(
      "upstream_error",
      `AnimeTake request failed with status ${response.status} for ${url}.`,
      { statusCode: 502 },
    );
  }

  if (looksLikeChallenge(body)) {
    throw new BrowserExtractionError("challenge_failed", `AnimeTake challenge did not clear for ${url}.`, {
      statusCode: 502,
    });
  }

  return body;
}

export async function fetchAnimeTakeJson<T>(
  url: string,
  signal: AbortSignal,
  referer: string,
) {
  const body = await fetchAnimeTakeResponseText(
    url,
    signal,
    referer,
    "application/json,text/plain,*/*",
    "ajax",
  );

  try {
    return JSON.parse(body) as T;
  } catch (error) {
    throw new BrowserExtractionError(
      "upstream_error",
      `AnimeTake returned invalid JSON for ${url}.`,
      { statusCode: 502, cause: error },
    );
  }
}

export function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function extractHtmlAttribute(tag: string, attributeName: string) {
  const match = tag.match(new RegExp(`${attributeName}\\s*=\\s*(['"])(.*?)\\1`, "i"));
  return decodeHtmlEntities(cleanText(match?.[2] ?? ""));
}

export async function waitForAnimeTakeReady(
  page: PlaywrightPageLike,
  mode: "home" | "listing" | "search" | "detail" | "episode",
  path: string,
  timeoutMs = 35_000,
) {
  const deadline = Date.now() + timeoutMs;
  let challengeSeenAt: number | null = null;
  const challengeGraceTimeoutMs = CHALLENGE_GRACE_TIMEOUT_MS[mode];

  while (Date.now() < deadline) {
    const state = await page
      .evaluate(() => ({
        title: document.title,
        bodyText: document.body?.innerText ?? "",
        readyState: document.readyState,
        animeLinks: document.querySelectorAll("a[href*='/anime/']").length,
        episodeLinks: document.querySelectorAll("a[href*='/episode/']").length,
        searchItems: document.querySelectorAll(".film-list .item").length,
        searchForms: document.querySelectorAll(
          "form#search input[name='keyword'], form#index-search input[name='keyword']",
        ).length,
        videos: document.querySelectorAll("video, source[src]").length,
        iframes: document.querySelectorAll("iframe[src]").length,
      }))
      .catch(() => ({
        title: "",
        bodyText: "",
        readyState: "loading",
        animeLinks: 0,
        episodeLinks: 0,
        searchItems: 0,
        searchForms: 0,
        videos: 0,
        iframes: 0,
      }));

    const sample = `${state.title}\n${state.bodyText}`;
    const challenge = looksLikeChallenge(sample);
    if (challenge) {
      challengeSeenAt ??= Date.now();
      if (Date.now() - challengeSeenAt >= challengeGraceTimeoutMs) {
        throw new BrowserExtractionError(
          "challenge_failed",
          `AnimeTake challenge did not clear for ${path}.`,
          { statusCode: 502 },
        );
      }
    } else {
      challengeSeenAt = null;
    }

    const hasHomeContent = state.searchForms > 0 || state.animeLinks > 8;
    const hasListingContent = state.animeLinks > 8 || /all anime|anime list|a-z/i.test(sample);
    const hasSearchContent = state.searchItems > 0 || /result for:|no results found/i.test(sample);
    const hasDetailContent = state.animeLinks > 0 || /genres|synopsis|episode/i.test(sample);
    const hasEpisodeContent =
      state.videos > 0 ||
      state.iframes > 0 ||
      state.episodeLinks > 0 ||
      /episode|keyboard shortcuts|cc controls/i.test(sample);

    if (
      state.readyState === "complete" &&
      !challenge &&
      ((mode === "home" && hasHomeContent) ||
        (mode === "listing" && hasListingContent) ||
        (mode === "search" && hasSearchContent) ||
        (mode === "detail" && hasDetailContent) ||
        (mode === "episode" && hasEpisodeContent))
    ) {
      return;
    }

    await page.waitForTimeout(1_000);
  }

  const finalSample = await page.evaluate(() => `${document.title}\n${document.body?.innerText ?? ""}`).catch(() => "");
  const errorCode = looksLikeChallenge(finalSample) ? "challenge_failed" : "upstream_error";
  throw new BrowserExtractionError(errorCode, `AnimeTake did not finish loading ${path}.`, {
    statusCode: errorCode === "challenge_failed" ? 502 : 500,
  });
}

export async function navigate(
  page: PlaywrightPageLike,
  pathOrUrl: string,
  mode: "home" | "listing" | "search" | "detail" | "episode",
) {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${BASE_URL}${pathOrUrl}`;
  await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 25_000,
  });
  await waitForAnimeTakeReady(page, mode, url);
  await page.waitForTimeout(1_000);
}
