import type { EpisodeList, SearchInput, SearchPage } from "@relay/contracts";
import { BrowserExtractionError } from "../../errors";
import { cleanText } from "../common/text";
import type { PlaywrightPageLike } from "../common/playwright-types";
import type { ExtractionRuntime } from "../types";
import { ANIMEPAHE_CHALLENGE_MARKERS } from "./shared";
import {
  buildEpisodeTitle,
  mapAnimeKind,
  parseDurationSeconds,
  rankAnimePaheSearchMatch,
} from "./shared";
import type { AnimePaheEpisodeEntry, AnimePaheEpisodeResponse, AnimePaheSearchResponse } from "./types";

export async function waitForAnimePaheReady(
  page: PlaywrightPageLike,
  message: string,
  timeoutMs = 18_000,
) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const state = await page
      .evaluate(() => ({
        title: document.title,
        bodyText: document.body?.innerText ?? "",
      }))
      .catch(() => ({ title: "", bodyText: "" }));

    const sample = `${state.title}\n${state.bodyText}`.toLowerCase();
    const isChallenge = ANIMEPAHE_CHALLENGE_MARKERS.some((marker) => sample.includes(marker));
    const hasContent = cleanText(state.bodyText).length > 0;

    if (!isChallenge && hasContent) {
      return;
    }

    await page.waitForTimeout(1_000);
  }

  throw new BrowserExtractionError("challenge_failed", message, { statusCode: 502 });
}

export async function fetchJson<T>(page: PlaywrightPageLike, url: string) {
  const response = await page.evaluate(async (requestUrl) => {
    const result = await fetch(requestUrl, {
      credentials: "include",
      headers: {
        accept: "application/json, text/plain, */*",
      },
    });

    return {
      status: result.status,
      body: await result.text(),
    };
  }, url);

  if (response.status !== 200) {
    throw new BrowserExtractionError(
      "upstream_error",
      `AnimePahe API request failed with status ${response.status} for ${url}.`,
      { statusCode: 502 },
    );
  }

  try {
    return JSON.parse(response.body) as T;
  } catch (error) {
    throw new BrowserExtractionError(
      "upstream_error",
      `AnimePahe API returned invalid JSON for ${url}.`,
      { statusCode: 502, cause: error },
    );
  }
}

export async function searchAnimePahe(
  input: SearchInput,
  runtime: ExtractionRuntime,
): Promise<SearchPage> {
  return runtime.withPage(async (page) => {
    const browserPage = page as unknown as PlaywrightPageLike;
    await browserPage.goto(`https://${runtime.domain}/`, {
      waitUntil: "domcontentloaded",
      timeout: 20_000,
    });
    await waitForAnimePaheReady(
      browserPage,
      "AnimePahe challenge did not clear before search extraction.",
    );

    const payload = await fetchJson<AnimePaheSearchResponse>(
      browserPage,
      `https://${runtime.domain}/api?m=search&q=${encodeURIComponent(input.query)}&page=${input.page}`,
    );
    const rankedItems = (payload.data ?? []).reduce<
      Array<{ score: number; item: SearchPage["items"][number] }>
    >((items, entry) => {
      if (
        typeof entry.session !== "string" ||
        entry.session.length === 0 ||
        typeof entry.title !== "string" ||
        entry.title.length === 0
      ) {
        return items;
      }

      const title = entry.title.replace(/\s+/g, " ").trim();
      const score = rankAnimePaheSearchMatch(title, input.query);
      if (score === null) {
        return items;
      }

      items.push({
        score,
        item: {
          providerId: runtime.providerId,
          providerDisplayName: "AnimePahe",
          externalAnimeId: entry.session,
          title,
          synopsis: null,
          coverImage: entry.poster ?? null,
          year: typeof entry.year === "number" ? entry.year : null,
          kind: mapAnimeKind(entry.type),
          language: "ja",
          contentClass: "anime",
          requiresAdultGate: false,
        },
      });

      return items;
    }, []);

    return {
      providerId: runtime.providerId,
      query: input.query,
      page: input.page,
      hasNextPage: payload.current_page < payload.last_page,
      items: rankedItems
        .sort((left, right) => right.score - left.score)
        .map((entry) => entry.item)
        .slice(0, input.limit),
    };
  });
}

export async function getAnimePaheEpisodes(
  providerId: string,
  externalAnimeId: string,
  runtime: ExtractionRuntime,
): Promise<EpisodeList> {
  return runtime.withPage(async (page) => {
    const browserPage = page as unknown as PlaywrightPageLike;
    await browserPage.goto(`https://${runtime.domain}/anime/${externalAnimeId}`, {
      waitUntil: "domcontentloaded",
      timeout: 20_000,
    });
    await waitForAnimePaheReady(
      browserPage,
      `AnimePahe challenge did not clear for episodes of "${externalAnimeId}".`,
    );

    const episodes: AnimePaheEpisodeEntry[] = [];
    let currentPage = 1;
    let lastPage = 1;

    do {
      const payload = await fetchJson<AnimePaheEpisodeResponse>(
        browserPage,
        `https://${runtime.domain}/api?m=release&id=${encodeURIComponent(externalAnimeId)}&sort=episode_asc&page=${currentPage}`,
      );

      episodes.push(...(payload.data ?? []));
      lastPage = payload.last_page;
      currentPage += 1;
    } while (currentPage <= lastPage);

    return {
      providerId,
      externalAnimeId,
      episodes: episodes
        .filter(
          (entry): entry is AnimePaheEpisodeEntry & { session: string } =>
            typeof entry.session === "string" && entry.session.length > 0,
        )
        .map((entry) => ({
          providerId,
          externalAnimeId,
          externalEpisodeId: entry.session,
          number: entry.episode ?? 0,
          title: buildEpisodeTitle(entry),
          synopsis: null,
          thumbnail: entry.snapshot ?? null,
          durationSeconds: parseDurationSeconds(entry.duration),
          releasedAt: entry.created_at ?? null,
        })),
    };
  });
}
