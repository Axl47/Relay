import type { SearchInput, SearchPage } from "@relay/contracts";
import { BrowserExtractionError } from "../../errors";
import { compactSearchValue, normalizeSearchValue } from "../common/text";
import type { AnimeOnsenSearchApiResponse, SearchCard } from "./types";
import {
  BASE_URL,
  buildAnimeOnsenImageUrl,
  cleanText,
  SEARCH_API_BEARER_TOKEN,
  SEARCH_API_URL,
  uniqueBy,
} from "./shared";

export function scoreTitleAgainstQuery(title: string, query: string) {
  const normalizedTitle = normalizeSearchValue(title);
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedTitle || !normalizedQuery) {
    return 0;
  }

  if (normalizedTitle === normalizedQuery) {
    return 1_000;
  }

  const compactTitle = compactSearchValue(title);
  const compactQuery = compactSearchValue(query);
  const phraseMatch = normalizedTitle.includes(normalizedQuery);
  const compactMatch = compactQuery.length > 0 && compactTitle.includes(compactQuery);
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  const matchedTokens = tokens.filter((token) => normalizedTitle.includes(token));
  const allTokensMatch = tokens.length > 0 && matchedTokens.length === tokens.length;

  if (!phraseMatch && !compactMatch && !allTokensMatch) {
    return 0;
  }

  return (
    (phraseMatch ? 400 : 0) +
    (compactMatch ? 200 : 0) +
    (allTokensMatch ? 150 : 0) +
    matchedTokens.length * 40
  );
}

export async function searchAnimeOnsenCatalog(
  input: SearchInput,
  signal: AbortSignal,
): Promise<SearchPage> {
  const limit = input.limit;
  const offset = (input.page - 1) * input.limit;
  const response = await fetch(SEARCH_API_URL, {
    method: "POST",
    signal,
    headers: {
      accept: "*/*",
      "accept-language": "en-US,en;q=0.9",
      authorization: `Bearer ${SEARCH_API_BEARER_TOKEN}`,
      "content-type": "application/json",
      origin: BASE_URL,
      referer: `${BASE_URL}/`,
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-site",
      "x-meilisearch-client": "Meilisearch JavaScript (v0.27.0)",
    },
    body: JSON.stringify({
      q: input.query,
      limit,
      offset,
    }),
  });

  if (!response.ok) {
    throw new BrowserExtractionError(
      "upstream_error",
      `AnimeOnsen search API failed with status ${response.status} for query "${input.query}".`,
      { statusCode: 502 },
    );
  }

  let payload: AnimeOnsenSearchApiResponse;
  try {
    payload = (await response.json()) as AnimeOnsenSearchApiResponse;
  } catch (error) {
    throw new BrowserExtractionError(
      "upstream_error",
      `AnimeOnsen search API returned invalid JSON for query "${input.query}".`,
      { statusCode: 502, cause: error },
    );
  }

  const rawItems = (payload.hits ?? []).map((hit): SearchCard | null => {
    const externalAnimeId = cleanText(hit.content_id);
    const searchTitles = uniqueBy(
      [
        cleanText(hit.content_title_en),
        cleanText(hit.content_title),
        cleanText(hit.content_title_jp),
      ].filter((value): value is string => value.length > 0),
      (value) => normalizeSearchValue(value),
    );
    const title = searchTitles[0] ?? "";

    if (!externalAnimeId || !title) {
      return null;
    }

    return {
      externalAnimeId,
      title,
      searchTitles,
      synopsis: null,
      coverImage: buildAnimeOnsenImageUrl(externalAnimeId),
      year: null,
    };
  });

  const uniqueItems = uniqueBy(
    rawItems.filter((entry): entry is SearchCard => entry !== null),
    (item) => item.externalAnimeId,
  );
  const rankedItems = uniqueItems
    .map((item) => ({
      item,
      score: Math.max(
        ...item.searchTitles.map((candidateTitle) => scoreTitleAgainstQuery(candidateTitle, input.query)),
      ),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.item.title.localeCompare(right.item.title);
    })
    .slice(0, input.limit)
    .map((entry) => entry.item);

  const estimatedTotalHits = payload.estimatedTotalHits ?? rankedItems.length;
  const hasNextPage =
    rankedItems.length === input.limit &&
    estimatedTotalHits > offset + (payload.hits ?? []).length;

  return {
    providerId: "animeonsen",
    query: input.query,
    page: input.page,
    hasNextPage,
    items: rankedItems.map((item) => ({
      providerId: "animeonsen",
      providerDisplayName: "AnimeOnsen",
      externalAnimeId: item.externalAnimeId,
      title: item.title,
      synopsis: item.synopsis,
      coverImage: item.coverImage,
      year: item.year,
      kind: "unknown",
      language: "en",
      contentClass: "anime",
      requiresAdultGate: false,
    })),
  };
}
