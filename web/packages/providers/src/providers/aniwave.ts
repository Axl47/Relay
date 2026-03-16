import type {
  AnimeDetails,
  EpisodeList,
  PlaybackResolution,
  ProviderAnimeRef,
  ProviderEpisodeRef,
  SearchInput,
  SearchPage,
} from "@relay/contracts";
import type { ProviderRequestContext } from "@relay/provider-sdk";
import { SsrManifestProviderBase } from "../base/ssr-manifest-provider-base";
import {
  absoluteUrl,
  cleanText,
  createAnimeDetails,
  createEpisode,
  createPlaybackResolution,
  createSearchResult,
  createStream,
  extractIdAfterPrefix,
  parseNumber,
  parseYear,
  uniqueBy,
} from "../base/provider-utils";

type AniwaveAjaxResponse = {
  status: number | boolean;
  result: string | { url?: string; sources?: unknown[]; tracks?: unknown[] };
};

type AniwaveServerCandidate = {
  label: string;
  linkId: string;
};

function normalizeSearchValue(value: string) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function compactSearchValue(value: string) {
  return normalizeSearchValue(value).replace(/\s+/g, "");
}

function rankAniwaveSearchMatch(
  input: {
    title: string;
    altTitle?: string | null;
    externalAnimeId: string;
  },
  query: string,
) {
  const normalizedQuery = normalizeSearchValue(query);
  const compactQuery = compactSearchValue(query);
  const tokens = normalizedQuery.split(" ").filter(Boolean);
  if (tokens.length === 0) {
    return null;
  }

  const title = normalizeSearchValue(input.title);
  const altTitle = normalizeSearchValue(input.altTitle ?? "");
  const combined = normalizeSearchValue(
    [input.title, input.altTitle, input.externalAnimeId].filter(Boolean).join(" "),
  );
  const compactCombined = compactSearchValue(
    [input.title, input.altTitle, input.externalAnimeId].filter(Boolean).join(" "),
  );

  const exactTitle = title === normalizedQuery || altTitle === normalizedQuery;
  const phraseMatch =
    title.includes(normalizedQuery) ||
    altTitle.includes(normalizedQuery) ||
    combined.includes(normalizedQuery);
  const compactMatch = compactQuery.length > 0 && compactCombined.includes(compactQuery);
  const matchedTokens = tokens.filter((token) => combined.includes(token));
  const allTokensMatch = matchedTokens.length === tokens.length;

  if (!exactTitle && !phraseMatch && !compactMatch && !allTokensMatch) {
    return null;
  }

  return (
    (exactTitle ? 4_000 : 0) +
    (phraseMatch ? 2_000 : 0) +
    (compactMatch ? 1_000 : 0) +
    matchedTokens.length * 120
  );
}

function rc4(key: string, value: string) {
  const state = Array.from({ length: 256 }, (_, index) => index);
  const keyCodes = Array.from(key).map((character) => character.charCodeAt(0));
  let j = 0;

  for (let index = 0; index < 256; index += 1) {
    j = (j + state[index] + keyCodes[index % keyCodes.length]) % 256;
    [state[index], state[j]] = [state[j], state[index]];
  }

  let i = 0;
  j = 0;
  let output = "";
  for (const character of value) {
    i = (i + 1) % 256;
    j = (j + state[i]) % 256;
    [state[i], state[j]] = [state[j], state[i]];
    output += String.fromCharCode(
      character.charCodeAt(0) ^ state[(state[i] + state[j]) % 256],
    );
  }

  return output;
}

function createAniwaveVrf(value: string) {
  return Buffer.from(rc4("simple-hash", value)).toString("base64");
}

function rankAniwaveServerCandidate(label: string) {
  const normalized = normalizeSearchValue(label);
  if (normalized.includes("mycloud")) {
    return 0;
  }

  if (normalized.includes("cloudora")) {
    return 1;
  }

  if (normalized.includes("vidplay")) {
    return 2;
  }

  return 3;
}

export class AniwaveProvider extends SsrManifestProviderBase {
  constructor() {
    super({
      id: "aniwave",
      displayName: "Aniwave",
      baseUrl: "https://aniwaves.ru",
      contentClass: "anime",
      executionMode: "http",
      requiresAdultGate: false,
      supportsSearch: true,
      supportsTrackerSync: true,
      defaultEnabled: true,
    });
  }

  async search(input: SearchInput, ctx: ProviderRequestContext): Promise<SearchPage> {
    const $ = await this.fetchDocument(
      `${this.metadata.baseUrl}/filter?keyword=${encodeURIComponent(input.query)}`,
      ctx,
    );

    const items = uniqueBy(
      $("#list-items .item")
        .toArray()
        .map((node: any) => {
          const card = $(node);
          const titleNode = card.find(".name.d-title").first();
          const primaryLink = card.find("a[href*='/watch/']").first();
          const href = cleanText(primaryLink.attr("href"));
          const title = cleanText(titleNode.text()) || cleanText(primaryLink.attr("title")) || "Unknown";
          const altTitle = cleanText(titleNode.attr("data-jp")) || cleanText(primaryLink.attr("data-jp"));
          const externalAnimeId = extractIdAfterPrefix(this.metadata.baseUrl, href, "watch/");
          const score = rankAniwaveSearchMatch(
            {
              title,
              altTitle,
              externalAnimeId,
            },
            input.query,
          );
          if (!href || score === null) {
            return null;
          }

          return {
            score,
            item: createSearchResult({
            providerId: this.metadata.id,
            providerDisplayName: this.metadata.displayName,
              externalAnimeId,
              title,
              synopsis: null,
              coverImage:
                absoluteUrl(
                  this.metadata.baseUrl,
                  card.find("img").first().attr("src") ?? card.find("img").first().attr("data-src"),
                ) ?? null,
              year: parseYear(card.text()),
              kind: "unknown",
              language: "ja",
              contentClass: this.metadata.contentClass,
              requiresAdultGate: this.metadata.requiresAdultGate,
            }),
          };
        }),
      (entry) => entry?.item.externalAnimeId ?? "",
    )
      .filter(
        (
          entry,
        ): entry is {
          score: number;
          item: ReturnType<typeof createSearchResult>;
        } => entry !== null,
      )
      .sort((left, right) => right.score - left.score)
      .map((entry) => entry.item)
      .slice(0, input.limit);

    return {
      providerId: this.metadata.id,
      query: input.query,
      page: input.page,
      hasNextPage: false,
      items,
    };
  }

  private async fetchWatchDocument(externalAnimeId: string, ctx: ProviderRequestContext) {
    return this.fetchDocument(`${this.metadata.baseUrl}/watch/${externalAnimeId}`, ctx);
  }

  private getAnimeNumericId($: Awaited<ReturnType<typeof this.fetchWatchDocument>>) {
    const value = cleanText($("#watch-main").attr("data-id"));
    if (!value) {
      throw new Error("Aniwave watch page did not expose a numeric anime id.");
    }
    return value;
  }

  private extractServerCandidates(serverHtml: string) {
    return uniqueBy(
      [...serverHtml.matchAll(/<li[^>]+data-link-id="([^"]+)"[^>]*>([\s\S]*?)<\/li>/g)]
        .map((match) => ({
          linkId: cleanText(match[1]),
          label: cleanText(match[2].replace(/<[^>]+>/g, " ")) || "Unknown",
        }))
        .filter(
          (candidate): candidate is AniwaveServerCandidate =>
            candidate.linkId.length > 0,
        ),
      (candidate) => candidate.linkId,
    ).sort((left, right) => rankAniwaveServerCandidate(left.label) - rankAniwaveServerCandidate(right.label));
  }

  async getAnime(
    input: ProviderAnimeRef,
    ctx: ProviderRequestContext,
  ): Promise<AnimeDetails> {
    const $ = await this.fetchWatchDocument(input.externalAnimeId, ctx);
    return createAnimeDetails({
      providerId: this.metadata.id,
      providerDisplayName: this.metadata.displayName,
      externalAnimeId: input.externalAnimeId,
      title: this.firstText($, ["h1.title.d-title", "h1.title", "h1"]),
      synopsis: cleanText($("meta[name='description']").attr("content")) || null,
      coverImage:
        absoluteUrl(
          this.metadata.baseUrl,
          $("meta[property='og:image']").attr("content") ?? $("img").first().attr("src"),
        ) ?? null,
      bannerImage: null,
      status: /ongoing/i.test($.text()) ? "ongoing" : "unknown",
      year: parseYear($.text()),
      tags: uniqueBy(
        $("a[href*='/genre/'], a[href*='/tag/']")
          .toArray()
          .map((node: any) => cleanText($(node).text()))
          .filter(Boolean),
        (value) => value,
      ),
      language: "ja",
      totalEpisodes: parseNumber($.text()),
      contentClass: this.metadata.contentClass,
      requiresAdultGate: this.metadata.requiresAdultGate,
    });
  }

  async getEpisodes(
    input: ProviderAnimeRef,
    ctx: ProviderRequestContext,
  ): Promise<EpisodeList> {
    const $ = await this.fetchWatchDocument(input.externalAnimeId, ctx);
    const animeId = this.getAnimeNumericId($);
    const response = await this.fetchJson<AniwaveAjaxResponse>(
      `${this.metadata.baseUrl}/ajax/episode/list/${animeId}?style=&vrf=${encodeURIComponent(
        createAniwaveVrf(animeId),
      )}`,
      ctx,
      {
        headers: {
          "x-requested-with": "XMLHttpRequest",
          referer: `${this.metadata.baseUrl}/watch/${input.externalAnimeId}`,
        },
      },
    );

    const html = typeof response.result === "string" ? response.result : "";
    const episodeMatches = [...html.matchAll(/<a[^>]+data-ids="([^"]+&eps=[^"]+)"[^>]+data-num="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
    const episodes: Array<ReturnType<typeof createEpisode>> = uniqueBy(
      episodeMatches.map((match) =>
        createEpisode({
          providerId: this.metadata.id,
          externalAnimeId: input.externalAnimeId,
          externalEpisodeId: match[2],
          number: parseNumber(match[2]) ?? 0,
          title: `Episode ${match[2]}`,
          synopsis: null,
          thumbnail: null,
          durationSeconds: null,
          releasedAt: null,
        }),
      ),
      (item) => item.externalEpisodeId,
    ).sort((left, right) => left.number - right.number);

    return {
      providerId: this.metadata.id,
      externalAnimeId: input.externalAnimeId,
      episodes,
    };
  }

  async resolvePlayback(
    input: ProviderEpisodeRef,
    ctx: ProviderRequestContext,
  ): Promise<PlaybackResolution> {
    const $ = await this.fetchWatchDocument(input.externalAnimeId, ctx);
    const animeId = this.getAnimeNumericId($);
    const referer = `${this.metadata.baseUrl}/watch/${input.externalAnimeId}`;
    const serverList = await this.fetchJson<AniwaveAjaxResponse>(
      `${this.metadata.baseUrl}/ajax/server/list?servers=${encodeURIComponent(
        animeId,
      )}&eps=${encodeURIComponent(input.externalEpisodeId)}`,
      ctx,
      {
        headers: {
          "x-requested-with": "XMLHttpRequest",
          referer,
        },
      },
    );

    const serverHtml = typeof serverList.result === "string" ? serverList.result : "";
    const serverCandidates = this.extractServerCandidates(serverHtml);
    if (serverCandidates.length === 0) {
      throw new Error("Aniwave did not expose a server link id.");
    }
    const attemptedServers: string[] = [];

    for (const candidate of serverCandidates) {
      try {
        const sources = await this.fetchJson<AniwaveAjaxResponse>(
          `${this.metadata.baseUrl}/ajax/sources?id=${encodeURIComponent(
            candidate.linkId,
          )}&asi=0&autoPlay=0`,
          ctx,
          {
            headers: {
              "x-requested-with": "XMLHttpRequest",
              referer,
            },
          },
        );

        const embedUrl =
          typeof sources.result === "object" && sources.result !== null ? sources.result.url : null;
        if (!embedUrl) {
          attemptedServers.push(`${candidate.label}: missing embed url`);
          continue;
        }

        return createPlaybackResolution({
          providerId: this.metadata.id,
          externalAnimeId: input.externalAnimeId,
          externalEpisodeId: input.externalEpisodeId,
          streams: [
            createStream({
              id: "embed",
              url: embedUrl,
              quality: "embed",
              mimeType: "text/html",
              headers: {},
              cookies: {},
              proxyMode: "redirect",
              isDefault: true,
            }),
          ],
          subtitles: [],
          cookies: {},
          expiresAt: this.createResolutionExpiry(ctx),
        });
      } catch (error) {
        attemptedServers.push(
          `${candidate.label}: ${error instanceof Error ? error.message : "probe failed"}`,
        );
      }
    }

    throw new Error(
      `Aniwave did not expose a playable embed playback URL. Attempts: ${attemptedServers.join(" | ")}`,
    );
  }
}
