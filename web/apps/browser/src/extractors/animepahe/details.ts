import type { AnimeDetails, ProviderAnimeRef } from "@relay/contracts";
import { BrowserExtractionError } from "../../errors";
import type { PlaywrightPageLike } from "../common/playwright-types";
import type { ExtractionRuntime } from "../types";
import { waitForAnimePaheReady } from "./api";
import type { AnimePaheDetailsPayload } from "./types";

export async function extractAnimeDetails(
  page: PlaywrightPageLike,
): Promise<AnimePaheDetailsPayload> {
  return page.evaluate(() => {
    const infoEntries = Array.from(document.querySelectorAll(".anime-info p"))
      .map((node) => {
        const text = (node.textContent ?? "").replace(/\s+/g, " ").trim();
        const labelMatch = text.match(/^([^:]+):\s*(.*)$/);
        if (!labelMatch) {
          return null;
        }

        return {
          key: labelMatch[1].replace(/\s+/g, " ").trim().toLowerCase(),
          value: labelMatch[2].replace(/\s+/g, " ").trim(),
        };
      })
      .filter(
        (
          entry,
        ): entry is {
          key: string;
          value: string;
        } => entry !== null,
      );

    const info = new Map(infoEntries.map((entry) => [entry.key, entry.value]));
    const seasonValue = info.get("season") ?? info.get("aired") ?? "";
    const yearMatch = seasonValue.match(/\b(19|20)\d{2}\b/);
    const statusValue = info.get("status") ?? "";
    const title =
      (document.querySelector("h1.user-select-none span")?.textContent ?? "")
        .replace(/\s+/g, " ")
        .trim() ||
      (document.querySelector("h1.user-select-none")?.textContent ?? "")
        .replace(/\s+/g, " ")
        .trim();

    return {
      title,
      synopsis:
        (document.querySelector(".anime-synopsis")?.textContent ?? "")
          .replace(/\s+/g, " ")
          .trim() || null,
      coverImage:
        document.querySelector<HTMLImageElement>(".anime-poster img")?.getAttribute("src") ??
        document.querySelector<HTMLImageElement>(".anime-poster img")?.getAttribute("data-src") ??
        null,
      totalEpisodes: Number.parseInt(info.get("episodes") ?? "", 10) || null,
      year: yearMatch ? Number.parseInt(yearMatch[0], 10) : null,
      status:
        statusValue.toLowerCase().includes("finished")
          ? "completed"
          : statusValue.toLowerCase().includes("airing")
            ? "ongoing"
            : statusValue.toLowerCase().includes("hiatus")
              ? "hiatus"
              : "unknown",
      tags: Array.from(document.querySelectorAll(".anime-genre a"))
        .map((node) => (node.textContent ?? "").replace(/\s+/g, " ").trim())
        .filter(Boolean),
    };
  });
}

export async function getAnimePaheAnime(
  input: ProviderAnimeRef,
  runtime: ExtractionRuntime,
): Promise<AnimeDetails> {
  return runtime.withPage(async (page) => {
    const browserPage = page as unknown as PlaywrightPageLike;
    await browserPage.goto(`https://${runtime.domain}/anime/${input.externalAnimeId}`, {
      waitUntil: "domcontentloaded",
      timeout: 20_000,
    });
    await waitForAnimePaheReady(
      browserPage,
      `AnimePahe challenge did not clear for anime "${input.externalAnimeId}".`,
    );

    const details = await extractAnimeDetails(browserPage);
    if (!details.title) {
      throw new BrowserExtractionError(
        "upstream_error",
        `AnimePahe page for "${input.externalAnimeId}" did not expose an anime title.`,
        { statusCode: 502 },
      );
    }

    return {
      providerId: input.providerId,
      providerDisplayName: "AnimePahe",
      externalAnimeId: input.externalAnimeId,
      title: details.title,
      synopsis: details.synopsis,
      coverImage: details.coverImage,
      bannerImage: null,
      status: details.status,
      year: details.year,
      tags: details.tags,
      kind: "tv",
      language: "ja",
      totalEpisodes: details.totalEpisodes,
      contentClass: "anime",
      requiresAdultGate: false,
    };
  });
}
