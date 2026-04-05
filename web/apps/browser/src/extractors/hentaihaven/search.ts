import type { SearchInput, SearchPage } from "@relay/contracts";
import type { ExtractionRuntime } from "../types";
import { cleanText, compactSearchValue, normalizeSearchValue } from "./shared";
import type { PlaywrightPageLike } from "../common/playwright-types";
import {
  buildSearchUrl,
  parseTotalPages,
  parseYear,
  PROVIDER_DISPLAY_NAME,
  PROVIDER_ID,
  safeAbsoluteUrl,
  SEARCH_PAGE_SIZE,
  waitForHentaiHavenReady,
} from "./shared";
import type { SearchCard } from "./types";

export function rankTitleAgainstQuery(title: string, query: string) {
  const normalizedTitle = normalizeSearchValue(title);
  const normalizedQuery = normalizeSearchValue(query);
  const compactTitle = compactSearchValue(title);
  const compactQuery = compactSearchValue(query);
  const tokens = normalizedQuery.split(" ").filter(Boolean);

  if (!normalizedTitle || !normalizedQuery || tokens.length === 0) {
    return null;
  }

  const exactMatch = normalizedTitle === normalizedQuery;
  const phraseMatch = normalizedTitle.includes(normalizedQuery);
  const compactMatch = compactQuery.length > 0 && compactTitle.includes(compactQuery);
  const matchedTokens = tokens.filter((token) => normalizedTitle.includes(token));
  const allTokensMatch = matchedTokens.length === tokens.length;

  if (!exactMatch && !phraseMatch && !compactMatch && !allTokensMatch) {
    return null;
  }

  return (
    (exactMatch ? 5_000 : 0) +
    (phraseMatch ? 2_000 : 0) +
    (compactMatch ? 1_000 : 0) +
    matchedTokens.length * 150
  );
}

export async function extractSearchSnapshot(page: PlaywrightPageLike) {
  return page.evaluate(() => ({
    title: document.title,
    bodyText: document.body?.innerText ?? "",
    items: Array.from(document.querySelectorAll(".page-item-detail.video, .c-tabs-item__content"))
      .map((node) => {
        const anchor =
          node.querySelector<HTMLAnchorElement>(".post-title a") ??
          node.querySelector<HTMLAnchorElement>(".tab-thumb a") ??
          node.querySelector<HTMLAnchorElement>("a[href*='/watch/']");
        const title =
          (node.querySelector(".post-title")?.textContent ?? anchor?.textContent ?? "")
            .replace(/\s+/g, " ")
            .trim();
        const href = anchor?.getAttribute("href") ?? "";
        const slug = href.match(/\/watch\/([^/]+)\/?$/i)?.[1] ?? "";

        if (!slug || !title) {
          return null;
        }

        return {
          externalAnimeId: decodeURIComponent(slug),
          title,
          alternativeTitle:
            (node.querySelector(".mg_alternative .summary-content")?.textContent ?? "")
              .replace(/\s+/g, " ")
              .trim() || null,
          coverImage:
            node.querySelector<HTMLImageElement>("img")?.getAttribute("src") ??
            node.querySelector<HTMLImageElement>("img")?.getAttribute("data-src") ??
            node.querySelector<HTMLImageElement>("img")?.getAttribute("data-lazy-src") ??
            null,
          year:
            (node.querySelector(".mg_release .summary-content")?.textContent ?? "")
              .replace(/\s+/g, " ")
              .trim() || null,
        };
      })
      .filter(
        (item): item is {
          externalAnimeId: string;
          title: string;
          alternativeTitle: string | null;
          coverImage: string | null;
          year: string | null;
        } => item !== null,
      ),
  }));
}

export async function searchHentaiHaven(
  input: SearchInput,
  runtime: ExtractionRuntime,
): Promise<SearchPage> {
  return runtime.withPage(async (page) => {
    const browserPage = page as unknown as PlaywrightPageLike;
    const searchUrl = buildSearchUrl(input.query, input.page);

    await browserPage.goto(searchUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await waitForHentaiHavenReady(browserPage, "search", searchUrl);

    const snapshot = await extractSearchSnapshot(browserPage);
    const pageCount = parseTotalPages(snapshot.title, snapshot.bodyText, SEARCH_PAGE_SIZE);
    const ranked = snapshot.items
      .map((item): SearchCard & { score: number } | null => {
        const titleScore = rankTitleAgainstQuery(item.title, input.query);
        const alternativeScore = item.alternativeTitle
          ? rankTitleAgainstQuery(item.alternativeTitle, input.query)
          : null;
        const score = Math.max(titleScore ?? 0, alternativeScore ?? 0);

        if (titleScore === null && alternativeScore === null && snapshot.items.length > input.limit) {
          return null;
        }

        return {
          externalAnimeId: item.externalAnimeId,
          title: item.title,
          alternativeTitle: item.alternativeTitle,
          coverImage: safeAbsoluteUrl(item.coverImage),
          year: parseYear(item.year),
          score,
        };
      })
      .filter((item): item is SearchCard & { score: number } => item !== null)
      .sort((left, right) => {
        if (left.score !== right.score) {
          return right.score - left.score;
        }

        return left.title.localeCompare(right.title);
      });

    const items = ranked.slice(0, input.limit).map((item) => ({
      providerId: PROVIDER_ID,
      providerDisplayName: PROVIDER_DISPLAY_NAME,
      externalAnimeId: item.externalAnimeId,
      title: item.title,
      synopsis: item.alternativeTitle,
      coverImage: item.coverImage,
      year: item.year,
      kind: "unknown" as const,
      language: "en",
      contentClass: "hentai" as const,
      requiresAdultGate: true,
    }));

    return {
      providerId: PROVIDER_ID,
      query: input.query,
      page: input.page,
      hasNextPage:
        pageCount !== null ? input.page < pageCount : snapshot.items.length >= SEARCH_PAGE_SIZE,
      items,
    };
  });
}
