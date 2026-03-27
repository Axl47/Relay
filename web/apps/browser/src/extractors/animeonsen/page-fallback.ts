import type { AnimeDetails, ProviderAnimeRef } from "@relay/contracts";
import { BrowserExtractionError } from "../../errors";
import type { PlaywrightPageLike } from "../common/playwright-types";
import type { ExtractionRuntime } from "../types";
import { parseEpisodesApiPayload } from "./episodes";
import type { AnimeOnsenPageSnapshot } from "./types";
import { ANIMEONSEN_CHALLENGE_MARKERS, BASE_URL, buildAnimeOnsenImageUrl, cleanText } from "./shared";

function looksLikeChallenge(sample: string) {
  const normalized = sample.toLowerCase();
  return ANIMEONSEN_CHALLENGE_MARKERS.some((marker) => normalized.includes(marker));
}

export async function waitForAnimeOnsenReady(
  page: PlaywrightPageLike,
  message: string,
  timeoutMs = 30_000,
) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const state = await page
      .evaluate(() => ({
        title: document.title,
        bodyText: document.body?.innerText ?? "",
        readyState: document.readyState,
        detailsLinks: document.querySelectorAll("a[href*='/details/']").length,
        watchLinks: document.querySelectorAll("a[href*='/watch/']").length,
        searchInputs: document.querySelectorAll(
          "input[type='search'], input[name='query'], input[name='search'], input[placeholder*='Search'], input[aria-label*='Search']",
        ).length,
        episodeOptions: document.querySelectorAll(
          ".ao-player-metadata-episode option, select[name*='episode'] option, select[id*='episode'] option",
        ).length,
        contentId:
          document.querySelector<HTMLMetaElement>("meta[name='ao-content-id']")?.content ??
          document
            .querySelector<HTMLMetaElement>("meta[property='og:image']")
            ?.content.match(/\/v4\/image\/[^/]+\/([^/?#]+)/)?.[1] ??
          "",
      }))
      .catch(() => ({
        title: "",
        bodyText: "",
        readyState: "loading",
        detailsLinks: 0,
        watchLinks: 0,
        searchInputs: 0,
        episodeOptions: 0,
        contentId: "",
      }));

    const sample = `${state.title}\n${state.bodyText}`;
    if (
      state.readyState === "complete" &&
      !looksLikeChallenge(sample) &&
      (state.detailsLinks > 0 ||
        state.watchLinks > 0 ||
        state.searchInputs > 0 ||
        state.episodeOptions > 0 ||
        !!state.contentId)
    ) {
      return;
    }

    await page.waitForTimeout(1_000);
  }

  throw new BrowserExtractionError("challenge_failed", message, { statusCode: 502 });
}

export async function navigate(page: PlaywrightPageLike, path: string) {
  await page.goto(new URL(path, BASE_URL).toString(), {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
}

export async function captureEpisodesApiResponse(
  page: PlaywrightPageLike,
  externalAnimeId: string,
) {
  const apiUrl = `https://api.animeonsen.xyz/v4/content/${encodeURIComponent(externalAnimeId)}/episodes`;

  return new Promise<string | null>((resolve) => {
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) {
        return;
      }

      settled = true;
      resolve(value);
    };

    page.on("response", (response) => {
      if (settled || response.url() !== apiUrl || response.status() !== 200) {
        return;
      }

      void response
        .text()
        .then((body) => finish(body))
        .catch(() => finish(null));
    });

    setTimeout(() => finish(null), 6_000);
  });
}

export async function extractAnimeSnapshot(page: PlaywrightPageLike): Promise<AnimeOnsenPageSnapshot> {
  return page.evaluate(() => {
    const clean = (value?: string | null) => value?.replace(/\s+/g, " ").trim() ?? "";
    const toAbsolute = (value?: string | null) => {
      const cleaned = clean(value);
      if (!cleaned) {
        return null;
      }

      try {
        return new URL(cleaned, window.location.origin).toString();
      } catch {
        return null;
      }
    };
    const extractYear = (value?: string | null) => {
      const match = clean(value).match(/\b(19|20)\d{2}\b/);
      return match ? Number.parseInt(match[0], 10) : null;
    };
    const extractEpisodeCount = (value?: string | null) => {
      const sample = clean(value);
      const explicit = sample.match(/(\d+)\s+episodes?/i);
      if (explicit) {
        return Number.parseInt(explicit[1], 10);
      }

      return null;
    };

    const metaTitle = clean(document.querySelector<HTMLMetaElement>("meta[property='og:title']")?.content);
    const pageTitle = clean(document.querySelector("h1, h2")?.textContent);
    const synopsisMeta = clean(document.querySelector<HTMLMetaElement>("meta[name='description']")?.content);
    const synopsisText = clean(
      document.querySelector(".description, .synopsis, .summary, [data-description], article p, main p")?.textContent,
    );
    const coverImage =
      toAbsolute(document.querySelector<HTMLMetaElement>("meta[property='og:image']")?.content) ??
      toAbsolute(document.querySelector<HTMLImageElement>("img")?.getAttribute("src")) ??
      toAbsolute(document.querySelector<HTMLImageElement>("img")?.getAttribute("data-src"));

    const textSample = clean(document.body?.innerText);
    const tags = Array.from(
      document.querySelectorAll<HTMLAnchorElement>(
        "a[href*='genre'], a[href*='tag'], [data-tag], .badge, .chip",
      ),
    )
      .map((node) => clean(node.textContent))
      .filter(
        (value) =>
          value.length > 1 &&
          !/^(watch|episode|episodes|details|subtitles|dubbed|movie|tv)$/i.test(value),
      );

    const selectEpisodeCount = document.querySelectorAll(
      ".ao-player-metadata-episode option, select[name*='episode'] option, select[id*='episode'] option",
    ).length;

    return {
      title: metaTitle || pageTitle || clean(document.title.replace(/[-|].*$/, "")),
      synopsis: synopsisText || synopsisMeta || null,
      coverImage,
      year: extractYear(textSample),
      tags: Array.from(new Set(tags)),
      totalEpisodes: extractEpisodeCount(textSample) ?? (selectEpisodeCount > 0 ? selectEpisodeCount : null),
      contentId:
        clean(document.querySelector<HTMLMetaElement>("meta[name='ao-content-id']")?.content) ||
        document
          .querySelector<HTMLMetaElement>("meta[property='og:image']")
          ?.content.match(/\/v4\/image\/[^/]+\/([^/?#]+)/)?.[1] ||
        null,
    };
  });
}

export async function submitSearchQuery(page: PlaywrightPageLike, query: string) {
  const handled = await page.evaluate((inputQuery) => {
    const selectors = [
      "input[type='search']",
      "input[name='query']",
      "input[name='search']",
      "input[placeholder*='Search']",
      "input[aria-label*='Search']",
    ];

    for (const selector of selectors) {
      const input = document.querySelector<HTMLInputElement>(selector);
      if (!input) {
        continue;
      }

      input.focus();
      input.value = inputQuery;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));

      const form = input.closest("form");
      if (form) {
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      } else {
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        input.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true }));
      }

      return true;
    }

    return false;
  }, query);

  if (handled) {
    await page.waitForTimeout(2_500);
  }
}

export async function getAnimeOnsenAnime(
  input: ProviderAnimeRef,
  runtime: ExtractionRuntime,
): Promise<AnimeDetails> {
  return runtime.withPage(async (page) => {
    const browserPage = page as unknown as PlaywrightPageLike;
    const episodesResponsePromise = captureEpisodesApiResponse(browserPage, input.externalAnimeId);
    await navigate(browserPage, `/watch/${encodeURIComponent(input.externalAnimeId)}?episode=1`);
    await waitForAnimeOnsenReady(
      browserPage,
      `Timed out waiting for AnimeOnsen anime metadata for anime "${input.externalAnimeId}".`,
    );
    await browserPage.waitForTimeout(1_500);

    const snapshot = await extractAnimeSnapshot(browserPage);
    const episodesBody = await Promise.race([
      episodesResponsePromise,
      browserPage.waitForTimeout(2_000).then(() => null),
    ]);
    const episodesFromApi =
      typeof episodesBody === "string"
        ? parseEpisodesApiPayload(input.providerId, input.externalAnimeId, episodesBody)
        : null;

    const title = cleanText(snapshot.title);
    if (!title) {
      throw new BrowserExtractionError(
        "upstream_error",
        `AnimeOnsen did not expose a title for anime "${input.externalAnimeId}".`,
        { statusCode: 502 },
      );
    }

    return {
      providerId: input.providerId,
      providerDisplayName: "AnimeOnsen",
      externalAnimeId: input.externalAnimeId,
      title,
      synopsis: snapshot.synopsis,
      coverImage: snapshot.coverImage ?? buildAnimeOnsenImageUrl(input.externalAnimeId),
      bannerImage:
        snapshot.coverImage ?? buildAnimeOnsenImageUrl(input.externalAnimeId, "640x360"),
      status: "unknown",
      year: snapshot.year,
      tags: snapshot.tags,
      language: "en",
      totalEpisodes: snapshot.totalEpisodes ?? episodesFromApi?.episodes.length ?? null,
      contentClass: "anime",
      requiresAdultGate: false,
    };
  });
}
