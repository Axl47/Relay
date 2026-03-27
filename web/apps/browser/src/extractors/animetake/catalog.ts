import type { AnimeDetails, EpisodeList, ProviderAnimeRef } from "@relay/contracts";
import { BrowserExtractionError } from "../../errors";
import type { PlaywrightPageLike } from "../common/playwright-types";
import type { ExtractionRuntime } from "../types";
import type { AnimeTakeDetailsSnapshot, AnimeTakeListingCard, AnimeTakeListingPage } from "./types";
import { fetchAnimeTakeServerSnapshot } from "./ajax";
import { navigate } from "./http";
import { buildAnimeUrl, buildListingPath, deriveSearchSeeds, DETAIL_FALLBACK_LISTING_PAGES, EPISODE_FALLBACK_LISTING_PAGES, MAX_LISTING_PAGES, mapStatus, parseYear, PROVIDER_DISPLAY_NAME } from "./shared";

export async function scrapeListingPage(page: PlaywrightPageLike, currentPage: number): Promise<AnimeTakeListingPage> {
  return page.evaluate((pageNumber) => {
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
    const parseLatestEpisode = (value?: string | null) => {
      const cleaned = clean(value);
      const match =
        cleaned.match(/(?:sub|dub)?\s*ep(?:isode)?\s*0*(\d+(?:\.\d+)?)/i) ??
        cleaned.match(/episode\s*0*(\d+(?:\.\d+)?)/i);
      if (!match?.[1]) {
        return null;
      }
      const parsed = Number.parseFloat(match[1]);
      return Number.isFinite(parsed) ? parsed : null;
    };
    const extractSlug = (href: string) => {
      try {
        const url = new URL(href);
        const match = url.pathname.match(/^\/anime\/([^/?#]+)\/?$/i);
        return clean(match?.[1] ?? "");
      } catch {
        return "";
      }
    };
    const ignoredTitles = new Set([
      "home",
      "filter",
      "all shows",
      "schedule",
      "faq",
      "genres",
      "search",
      "next",
      "prev",
      "previous",
      "page",
    ]);
    const cards = new Map<string, AnimeTakeListingCard>();

    for (const anchor of Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"))) {
      const href = toAbsolute(anchor.getAttribute("href"));
      if (!href || !href.includes("/anime/") || href.includes("/episode/")) {
        continue;
      }

      const slug = extractSlug(href);
      if (!slug) {
        continue;
      }

      const root =
        anchor.closest(
          "article, li, .item, .thumbnail, .anime, .post, .card, .bs, .bsx, .film_list-wrap, .row, .col",
        ) ??
        anchor.parentElement ??
        anchor;
      const title =
        clean(anchor.textContent) ||
        clean(root.querySelector("h1, h2, h3, h4, strong")?.textContent) ||
        clean(root.querySelector("img")?.getAttribute("alt")) ||
        clean(root.querySelector("img")?.getAttribute("title"));
      if (!title || ignoredTitles.has(title.toLowerCase())) {
        continue;
      }

      const synopsis =
        clean(root.querySelector("p")?.textContent) || clean(root.getAttribute("data-description"));
      const coverImage = toAbsolute(
        root.querySelector("img")?.getAttribute("src") ??
          root.querySelector("img")?.getAttribute("data-src") ??
          root.querySelector("img")?.getAttribute("data-lazy-src"),
      );
      const latestEpisode = parseLatestEpisode(root.textContent);

      cards.set(slug, {
        externalAnimeId: slug,
        title,
        synopsis: synopsis && synopsis !== title ? synopsis : null,
        coverImage,
        latestEpisode,
      });
    }

    const hasNextPage = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]")).some(
      (anchor) => {
        const href = toAbsolute(anchor.getAttribute("href"));
        if (!href) {
          return false;
        }

        try {
          const url = new URL(href);
          const nextPage = Number.parseInt(url.searchParams.get("page") ?? "", 10);
          if (Number.isFinite(nextPage) && nextPage === pageNumber + 1) {
            return true;
          }
        } catch {
          return false;
        }

        return clean(anchor.textContent).toLowerCase() === "next";
      },
    );

    return {
      items: Array.from(cards.values()),
      hasNextPage,
    };
  }, currentPage);
}

export async function scrapeAnimeDetailsPage(
  page: PlaywrightPageLike,
  externalAnimeId: string,
): Promise<AnimeTakeDetailsSnapshot> {
  return page.evaluate((animeId) => {
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
    const parseEpisodeNumberLocal = (value?: string | null) => {
      const cleaned = clean(value);
      const match =
        cleaned.match(/\/episode\/([^/?#]+)/i) ??
        cleaned.match(/episode\s*0*(\d+(?:\.\d+)?)/i) ??
        cleaned.match(/\b0*(\d+(?:\.\d+)?)\b/);
      if (!match?.[1]) {
        return null;
      }
      const parsed = Number.parseFloat(match[1]);
      return Number.isFinite(parsed) ? parsed : null;
    };
    const episodeMap = new Map<string, { externalEpisodeId: string; number: number; title: string; thumbnail: string | null }>();
    const episodePathFragment = `/anime/${animeId}/episode/`;

    for (const anchor of Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"))) {
      const href = toAbsolute(anchor.getAttribute("href"));
      if (!href || !href.includes(episodePathFragment)) {
        continue;
      }

      const externalEpisodeId = href.match(/\/episode\/([^/?#]+)/i)?.[1] ?? "";
      const number =
        parseEpisodeNumberLocal(externalEpisodeId) ?? parseEpisodeNumberLocal(anchor.textContent);
      if (number === null) {
        continue;
      }

      const root =
        anchor.closest("article, li, .item, .thumbnail, .episode, .ep, .card, .row, .col") ??
        anchor.parentElement ??
        anchor;
      const title = clean(anchor.textContent) || `Episode ${number}`;
      const thumbnail = toAbsolute(
        root.querySelector("img")?.getAttribute("src") ??
          root.querySelector("img")?.getAttribute("data-src") ??
          root.querySelector("img")?.getAttribute("data-lazy-src"),
      );

      episodeMap.set(`${number}`, {
        externalEpisodeId: `${number}`,
        number,
        title,
        thumbnail,
      });
    }

    const pageText = clean(document.body?.innerText);
    const title =
      clean(document.querySelector("h1")?.textContent) ||
      clean(document.querySelector("meta[property='og:title']")?.getAttribute("content")) ||
      clean(document.title).replace(/at\s+AnimeTake$/i, "").replace(/\s*\|\s*AnimeTake$/i, "");
    const synopsis =
      clean(document.querySelector("meta[name='description']")?.getAttribute("content")) ||
      clean(document.querySelector("[itemprop='description']")?.textContent) ||
      clean(
        document.querySelector(".entry-content p, .description p, .summary p, .synopsis p")
          ?.textContent,
      ) ||
      null;
    const coverImage = toAbsolute(
      document.querySelector("meta[property='og:image']")?.getAttribute("content") ??
        document.querySelector("img")?.getAttribute("src") ??
        document.querySelector("img")?.getAttribute("data-src"),
    );
    const tags = Array.from(
      new Set(
        Array.from(
          document.querySelectorAll<HTMLAnchorElement>("a[href*='/genre/'], a[href*='/genres/']"),
        )
          .map((anchor) => clean(anchor.textContent))
          .filter(Boolean),
      ),
    );
    const yearMatch = pageText.match(/\b(19|20)\d{2}\b/);
    const latestEpisodeMatch =
      pageText.match(/(?:sub|dub)?\s*ep(?:isode)?\s*0*(\d+(?:\.\d+)?)/i) ??
      pageText.match(/latest(?:\s+episode)?\s*[:\-]?\s*0*(\d+(?:\.\d+)?)/i);
    const statusMatch = pageText.match(/status\s*[:\-]?\s*([^\n]+)/i);

    return {
      title,
      synopsis,
      coverImage,
      year: yearMatch ? Number.parseInt(yearMatch[0], 10) : null,
      statusText: clean(statusMatch?.[1] ?? ""),
      tags,
      episodes: Array.from(episodeMap.values()).sort((left, right) => left.number - right.number),
      latestEpisode: latestEpisodeMatch?.[1] ? Number.parseFloat(latestEpisodeMatch[1]) : null,
    };
  }, externalAnimeId);
}

export async function lookupAnimeListingCard(page: PlaywrightPageLike, externalAnimeId: string, maxPages = MAX_LISTING_PAGES) {
  const seeds = deriveSearchSeeds(externalAnimeId, externalAnimeId);

  for (const seed of seeds) {
    for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
      await navigate(page, buildListingPath(seed, pageNumber), "listing");
      const listing = await scrapeListingPage(page, pageNumber);
      const match = listing.items.find((item) => item.externalAnimeId === externalAnimeId);
      if (match) {
        return match;
      }
      if (!listing.hasNextPage) {
        break;
      }
    }
  }

  return null;
}

export async function getAnimeTakeAnime(input: ProviderAnimeRef, runtime: ExtractionRuntime): Promise<AnimeDetails> {
  return runtime.withPage(async (page) => {
    const browserPage = page as unknown as PlaywrightPageLike;
    await navigate(browserPage, buildAnimeUrl(input.externalAnimeId), "detail");
    const details = await scrapeAnimeDetailsPage(browserPage, input.externalAnimeId);

    if (!details.title) {
      throw new BrowserExtractionError(
        "upstream_error",
        `AnimeTake details page for "${input.externalAnimeId}" did not expose a title.`,
        { statusCode: 502 },
      );
    }

    const shouldUseListingFallback =
      details.latestEpisode === null &&
      details.episodes.length === 0 &&
      details.coverImage === null;
    const listingCard = shouldUseListingFallback
      ? await lookupAnimeListingCard(
          browserPage,
          input.externalAnimeId,
          DETAIL_FALLBACK_LISTING_PAGES,
        )
      : null;

    return {
      providerId: input.providerId,
      providerDisplayName: PROVIDER_DISPLAY_NAME,
      externalAnimeId: input.externalAnimeId,
      title: details.title,
      synopsis: details.synopsis,
      coverImage: details.coverImage ?? listingCard?.coverImage ?? null,
      bannerImage: null,
      status: mapStatus(details.statusText),
      year: details.year ?? parseYear(details.title),
      tags: details.tags,
      language: "en",
      totalEpisodes: Math.trunc(details.latestEpisode ?? listingCard?.latestEpisode ?? 0) || null,
      contentClass: "anime",
      requiresAdultGate: false,
    };
  });
}

export async function getAnimeTakeEpisodes(input: ProviderAnimeRef, runtime: ExtractionRuntime): Promise<EpisodeList> {
  try {
    const snapshot = await fetchAnimeTakeServerSnapshot(input.externalAnimeId, runtime.signal);
    return {
      providerId: input.providerId,
      externalAnimeId: input.externalAnimeId,
      episodes: snapshot.episodes.map((episode) => ({
        providerId: input.providerId,
        externalAnimeId: input.externalAnimeId,
        externalEpisodeId: episode.externalEpisodeId,
        number: episode.number,
        title: episode.title || `Episode ${episode.number}`,
        synopsis: null,
        thumbnail: null,
        durationSeconds: null,
        releasedAt: null,
      })),
    };
  } catch {
    return runtime.withPage(async (page) => {
      const browserPage = page as unknown as PlaywrightPageLike;
      await navigate(browserPage, buildAnimeUrl(input.externalAnimeId), "detail");
      const details = await scrapeAnimeDetailsPage(browserPage, input.externalAnimeId);

      let episodes = details.episodes.map((episode) => ({
        providerId: input.providerId,
        externalAnimeId: input.externalAnimeId,
        externalEpisodeId: episode.externalEpisodeId,
        number: episode.number,
        title: episode.title || `Episode ${episode.number}`,
        synopsis: null,
        thumbnail: episode.thumbnail,
        durationSeconds: null,
        releasedAt: null,
      }));

      if (episodes.length === 0) {
        const listingCard = await lookupAnimeListingCard(
          browserPage,
          input.externalAnimeId,
          EPISODE_FALLBACK_LISTING_PAGES,
        );
        const totalEpisodes = Math.trunc(details.latestEpisode ?? listingCard?.latestEpisode ?? 0);
        if (totalEpisodes <= 0) {
          throw new BrowserExtractionError(
            "upstream_error",
            `AnimeTake did not expose an episode list for "${input.externalAnimeId}".`,
            { statusCode: 502 },
          );
        }

        episodes = Array.from({ length: totalEpisodes }, (_, index) => {
          const number = index + 1;
          return {
            providerId: input.providerId,
            externalAnimeId: input.externalAnimeId,
            externalEpisodeId: `${number}`,
            number,
            title: `Episode ${number}`,
            synopsis: null,
            thumbnail: listingCard?.coverImage ?? null,
            durationSeconds: null,
            releasedAt: null,
          };
        });
      }

      episodes.sort((left, right) => left.number - right.number);

      return {
        providerId: input.providerId,
        externalAnimeId: input.externalAnimeId,
        episodes,
      };
    });
  }
}
