import type { SearchInput, SearchPage } from "@relay/contracts";
import { BrowserExtractionError } from "../../errors";
import type { PlaywrightPageLike } from "../common/playwright-types";
import type { ExtractionRuntime } from "../types";
import type { AnimeTakeSearchResultsPage } from "./types";
import {
  buildSearchUrl,
  cleanText,
  parseEpisodeNumber,
  parseYear,
  PROVIDER_DISPLAY_NAME,
  rankTitleAgainstQuery,
  safeAbsoluteUrl,
} from "./shared";
import { navigate, waitForAnimeTakeReady } from "./http";

export async function submitNativeSearch(page: PlaywrightPageLike, query: string) {
  const selector = "form#index-search input[name='keyword'], form#search input[name='keyword']";
  await page.waitForSelector(selector, { timeout: 8_000 });
  const input = page.locator(selector).first();
  await input.fill(query);
  await input.press("Enter");
}

export async function openSearchResultsPage(page: PlaywrightPageLike, query: string) {
  await navigate(page, "/", "home");
  await submitNativeSearch(page, query);
  await waitForAnimeTakeReady(page, "search", buildSearchUrl(query, 1), 20_000);
  await page.waitForTimeout(750);
}

export async function scrapeSearchResultsPage(
  page: PlaywrightPageLike,
  currentPage: number,
): Promise<AnimeTakeSearchResultsPage> {
  const cards = new Map<string, { externalAnimeId: string; title: string; coverImage: string | null; latestEpisode: number | null; year: number | null }>();
  const itemLocator = page.locator(".film-list .item");
  const itemCount = await itemLocator.count();

  for (let index = 0; index < itemCount; index += 1) {
    const item = itemLocator.nth(index);
    const nameLink = item.locator("a.name[href]");
    const posterLink = item.locator("a.poster[href]");
    const nameLinkCount = await nameLink.count();
    const posterLinkCount = await posterLink.count();

    const href =
      (nameLinkCount > 0 ? await nameLink.first().getAttribute("href").catch(() => null) : null) ??
      (posterLinkCount > 0 ? await posterLink.first().getAttribute("href").catch(() => null) : null);
    const absoluteHref = safeAbsoluteUrl(href);
    if (!absoluteHref) {
      continue;
    }

    const slugMatch = new URL(absoluteHref).pathname.match(/^\/anime\/([^/?#]+)\/?$/i);
    const slug = cleanText(slugMatch?.[1] ?? "");
    if (!slug) {
      continue;
    }

    const title =
      (nameLinkCount > 0 ? cleanText(await nameLink.first().getAttribute("data-jtitle")) : "") ||
      (nameLinkCount > 0 ? cleanText(await nameLink.first().textContent().catch(() => "")) : "") ||
      cleanText(await item.locator("img").first().getAttribute("alt").catch(() => ""));
    if (!title) {
      continue;
    }

    const image = item.locator("img");
    const imageCount = await image.count();
    const coverImage =
      imageCount > 0
        ? safeAbsoluteUrl(await image.first().getAttribute("data-src").catch(() => null)) ??
          safeAbsoluteUrl(await image.first().getAttribute("src").catch(() => null))
        : null;
    const text = cleanText(await item.textContent().catch(() => ""));

    cards.set(slug, {
      externalAnimeId: slug,
      title,
      coverImage,
      latestEpisode: parseEpisodeNumber(text),
      year: parseYear(text),
    });
  }

  const nextPageLink = page.locator(`a[href*="/search?"][href*="page=${currentPage + 1}"]`).first();
  const nextPageLinkCount = await nextPageLink.count();
  const nextPageClass =
    nextPageLinkCount > 0
      ? cleanText(await nextPageLink.getAttribute("class").catch(() => null))
      : "";
  const hasNextPage = nextPageLinkCount > 0 && !nextPageClass.toLowerCase().includes("disabled");
  const noResults = /no results found/i.test(cleanText(await page.locator("body").textContent().catch(() => "")));

  return {
    items: Array.from(cards.values()),
    hasNextPage,
    noResults,
  };
}

export async function searchAnimeTake(
  input: SearchInput,
  runtime: ExtractionRuntime,
): Promise<SearchPage> {
  return runtime.withPage(async (page) => {
    const browserPage = page as unknown as PlaywrightPageLike;
    await openSearchResultsPage(browserPage, input.query);
    const results = await scrapeSearchResultsPage(browserPage, 1);

    if (results.items.length === 0 && !results.noResults) {
      throw new BrowserExtractionError(
        "upstream_error",
        `AnimeTake search did not expose results for "${input.query}".`,
        { statusCode: 502 },
      );
    }

    const ranked = results.items
      .map((item, index) => ({
        ...item,
        score: rankTitleAgainstQuery(item.title, input.query),
        index,
      }))
      .filter((item) => item.score !== null || results.items.length <= input.limit)
      .map((item) => ({
        ...item,
        score: item.score ?? 0,
      }))
      .sort((left, right) => {
        if (left.score !== right.score) {
          return right.score - left.score;
        }
        return left.index - right.index;
      });

    const start = (input.page - 1) * input.limit;
    const end = start + input.limit;
    const items = ranked.slice(start, end).map((item) => ({
      providerId: runtime.providerId,
      providerDisplayName: PROVIDER_DISPLAY_NAME,
      externalAnimeId: item.externalAnimeId,
      title: item.title,
      synopsis: null,
      coverImage: item.coverImage,
      year: item.year,
      kind: "unknown" as const,
      language: "en",
      contentClass: "anime" as const,
      requiresAdultGate: false,
    }));

    return {
      providerId: runtime.providerId,
      query: input.query,
      page: input.page,
      hasNextPage: results.hasNextPage || end < ranked.length,
      items,
    };
  });
}
