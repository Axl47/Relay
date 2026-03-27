import type { AnimeDetails, EpisodeList, ProviderAnimeRef } from "@relay/contracts";
import { BrowserExtractionError } from "../../errors";
import type { PlaywrightPageLike } from "../common/playwright-types";
import type { ExtractionRuntime } from "../types";
import {
  buildAnimeUrl,
  cleanText,
  normalizeAnimeId,
  normalizeEpisodeId,
  parseEpisodeNumber,
  parseReleasedAt,
  parseYear,
  PROVIDER_DISPLAY_NAME,
  PROVIDER_ID,
  safeAbsoluteUrl,
  waitForHentaiHavenReady,
} from "./shared";
import type { AnimePageSnapshot } from "./types";

export async function extractAnimePageSnapshot(page: PlaywrightPageLike): Promise<AnimePageSnapshot> {
  return page.evaluate(() => ({
    title: (document.querySelector("h1")?.textContent ?? "").replace(/\s+/g, " ").trim(),
    synopsis:
      (document.querySelector(".description-summary .summary__content")?.textContent ?? "")
        .replace(/\s+/g, " ")
        .trim() || null,
    coverImage:
      document.querySelector<HTMLImageElement>(".summary_image img")?.getAttribute("src") ??
      document.querySelector<HTMLImageElement>(".summary_image img")?.getAttribute("data-src") ??
      document.querySelector<HTMLImageElement>(".summary_image img")?.getAttribute("data-lazy-src") ??
      null,
    metaItems: Array.from(document.querySelectorAll(".post-content_item"))
      .map((node) => {
        const label = (node.querySelector(".summary-heading")?.textContent ?? "")
          .replace(/\s+/g, " ")
          .trim()
          .replace(/:$/, "");
        const value = (node.querySelector(".summary-content")?.textContent ?? "")
          .replace(/\s+/g, " ")
          .trim();

        if (!label || !value) {
          return null;
        }

        return { label, value };
      })
      .filter(
        (item): item is {
          label: string;
          value: string;
        } => item !== null,
      ),
    tagTexts: Array.from(document.querySelectorAll(".c-btn.tag_btn, .wp-manga-tags-list a"))
      .map((node) => (node.textContent ?? "").replace(/\s+/g, " ").trim())
      .filter(Boolean),
    episodes: Array.from(document.querySelectorAll(".wp-manga-chapter"))
      .map((node) => {
        const anchor = node.querySelector<HTMLAnchorElement>("a[href*='/watch/']");
        const href = anchor?.getAttribute("href") ?? "";
        const episodeId = href.match(/\/watch\/[^/]+\/([^/]+)\/?$/i)?.[1] ?? "";
        const title = (anchor?.querySelector("div:last-of-type")?.textContent ??
          anchor?.textContent ??
          "")
          .replace(/\s+/g, " ")
          .trim();

        if (!episodeId) {
          return null;
        }

        return {
          externalEpisodeId: decodeURIComponent(episodeId),
          number:
            Number.parseFloat(episodeId.replace(/^episode-/i, "")) ||
            Number.parseFloat(title.replace(/^episode\s*/i, "")) ||
            null,
          title,
          thumbnail:
            anchor?.querySelector<HTMLImageElement>("img")?.getAttribute("src") ??
            anchor?.querySelector<HTMLImageElement>("img")?.getAttribute("data-src") ??
            null,
          releasedText:
            (anchor?.querySelector(".chapter-release-date")?.textContent ?? "")
              .replace(/\s+/g, " ")
              .trim() || null,
        };
      })
      .filter((item): item is AnimePageSnapshot["episodes"][number] => item !== null),
  }));
}

export function mapMetaItems(metaItems: AnimePageSnapshot["metaItems"]) {
  return new Map(metaItems.map((entry) => [entry.label.toLowerCase(), entry.value]));
}

export async function getHentaiHavenAnime(
  input: ProviderAnimeRef,
  runtime: ExtractionRuntime,
): Promise<AnimeDetails> {
  return runtime.withPage(async (page) => {
    const browserPage = page as unknown as PlaywrightPageLike;
    const animeId = normalizeAnimeId(input.externalAnimeId);
    const animeUrl = buildAnimeUrl(animeId);

    await browserPage.goto(animeUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await waitForHentaiHavenReady(browserPage, "anime", animeUrl);

    const snapshot = await extractAnimePageSnapshot(browserPage);
    if (!snapshot.title) {
      throw new BrowserExtractionError(
        "upstream_error",
        `HentaiHaven detail page "${animeId}" did not expose a title.`,
        { statusCode: 502 },
      );
    }

    const meta = mapMetaItems(snapshot.metaItems);
    const genreTags = cleanText(meta.get("genre(s)"))
      .split(",")
      .map((entry) => cleanText(entry))
      .filter(Boolean);
    const extraTags = snapshot.tagTexts.filter((tag) => tag.toLowerCase() === "censored");
    const tags = Array.from(new Set([...genreTags, ...extraTags]));

    return {
      providerId: PROVIDER_ID,
      providerDisplayName: PROVIDER_DISPLAY_NAME,
      externalAnimeId: animeId,
      title: snapshot.title,
      synopsis: snapshot.synopsis,
      coverImage: safeAbsoluteUrl(snapshot.coverImage),
      bannerImage: null,
      status: "unknown",
      year: parseYear(meta.get("release")),
      tags,
      language: "en",
      totalEpisodes: snapshot.episodes.length > 0 ? snapshot.episodes.length : null,
      contentClass: "hentai",
      requiresAdultGate: true,
    };
  });
}

export async function getHentaiHavenEpisodes(
  input: ProviderAnimeRef,
  runtime: ExtractionRuntime,
): Promise<EpisodeList> {
  return runtime.withPage(async (page) => {
    const browserPage = page as unknown as PlaywrightPageLike;
    const animeId = normalizeAnimeId(input.externalAnimeId);
    const animeUrl = buildAnimeUrl(animeId);

    await browserPage.goto(animeUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await waitForHentaiHavenReady(browserPage, "anime", animeUrl);

    const snapshot = await extractAnimePageSnapshot(browserPage);
    const episodes = snapshot.episodes
      .map((episode) => ({
        providerId: PROVIDER_ID,
        externalAnimeId: animeId,
        externalEpisodeId: normalizeEpisodeId(episode.externalEpisodeId, animeId),
        number: episode.number ?? parseEpisodeNumber(episode.title) ?? 0,
        title: cleanText(episode.title) || `Episode ${episode.number ?? "?"}`,
        synopsis: null,
        thumbnail: safeAbsoluteUrl(episode.thumbnail),
        durationSeconds: null,
        releasedAt: parseReleasedAt(episode.releasedText),
      }))
      .sort((left, right) => left.number - right.number);

    if (episodes.length === 0) {
      throw new BrowserExtractionError(
        "upstream_error",
        `HentaiHaven detail page "${animeId}" exposed no episode links.`,
        { statusCode: 502 },
      );
    }

    return {
      providerId: PROVIDER_ID,
      externalAnimeId: animeId,
      episodes,
    };
  });
}
