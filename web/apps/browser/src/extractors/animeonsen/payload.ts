import { compactSearchValue, normalizeSearchValue } from "../common/text";
import type { SearchInput, SearchPage } from "@relay/contracts";
import type { ResolvedStream, ResolvedSubtitle, SearchCard } from "./types";
import { API_BASE_URL, cleanText, safeAbsoluteUrl, uniqueBy } from "./shared";

export function parseSubtitleTracks(payload: unknown): ResolvedSubtitle[] {
  const inferSubtitleFormat = (url: string, formatValue?: string | null) => {
    const normalizedFormat = cleanText(formatValue).toLowerCase();
    if (normalizedFormat === "ass" || normalizedFormat === "srt" || normalizedFormat === "vtt") {
      return normalizedFormat;
    }

    if (/\/v4\/subtitles\//i.test(url) || /\.ass(?:$|\?)/i.test(url) || /\.ssa(?:$|\?)/i.test(url)) {
      return "ass";
    }

    if (/\.srt(?:$|\?)/i.test(url)) {
      return "srt";
    }

    return "vtt";
  };

  const collect = (
    value: unknown,
    labelPrefix = "Subtitle",
    labelMap?: Record<string, string>,
  ): ResolvedSubtitle[] => {
    if (!value) {
      return [];
    }

    if (Array.isArray(value)) {
      return value.flatMap((entry, index) => {
        if (!entry || typeof entry !== "object") {
          return [];
        }

        const item = entry as Record<string, unknown>;
        const url = safeAbsoluteUrl(
          typeof item.url === "string"
            ? item.url
            : typeof item.src === "string"
              ? item.src
              : typeof item.file === "string"
                ? item.file
                : null,
          API_BASE_URL,
        );
        if (!url) {
          return [];
        }

        const language = cleanText(typeof item.language === "string" ? item.language : null) || "und";
        const formatValue = inferSubtitleFormat(
          url,
          typeof item.format === "string" ? item.format : null,
        );

        return [
          {
            label:
              cleanText(typeof item.label === "string" ? item.label : null) ||
              cleanText(labelMap?.[language]) ||
              cleanText(typeof item.language === "string" ? item.language : null) ||
              `${labelPrefix} ${index + 1}`,
            language,
            url,
            format: formatValue,
            isDefault:
              item.default === true ||
              item.isDefault === true ||
              item.kind === "captions" ||
              index === 0,
          },
        ];
      });
    }

    if (typeof value === "object") {
      return Object.entries(value as Record<string, unknown>).flatMap(([label, entry]) => {
        if (typeof entry === "string") {
          const url = safeAbsoluteUrl(entry, API_BASE_URL);
          const language = cleanText(label) || "und";
          return url
            ? [
                {
                  label: cleanText(labelMap?.[language]) || cleanText(label) || "Subtitle",
                  language,
                  url,
                  format: inferSubtitleFormat(url),
                  isDefault: false,
                },
              ]
            : [];
        }

        if (!entry || typeof entry !== "object") {
          return [];
        }

        const item = entry as Record<string, unknown>;
        const url = safeAbsoluteUrl(
          typeof item.url === "string"
            ? item.url
            : typeof item.src === "string"
              ? item.src
              : typeof item.file === "string"
                ? item.file
                : null,
          API_BASE_URL,
        );
        if (!url) {
          return [];
        }

        return [
          {
            label:
              cleanText(typeof item.label === "string" ? item.label : null) ||
              cleanText(labelMap?.[cleanText(label)]) ||
              cleanText(label) ||
              "Subtitle",
            language:
              cleanText(typeof item.language === "string" ? item.language : null) ||
              cleanText(label) ||
              "und",
            url,
            format: inferSubtitleFormat(url, typeof item.format === "string" ? item.format : null),
            isDefault: item.default === true || item.isDefault === true,
          },
        ];
      });
    }

    return [];
  };

  const data = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const dataValue =
    data.data && typeof data.data === "object" ? (data.data as Record<string, unknown>) : null;
  const metadataValue =
    data.metadata && typeof data.metadata === "object"
      ? (data.metadata as Record<string, unknown>)
      : null;
  const dataUri =
    dataValue?.uri && typeof dataValue.uri === "object"
      ? (dataValue.uri as Record<string, unknown>)
      : null;
  const topLevelUri =
    data.uri && typeof data.uri === "object" ? (data.uri as Record<string, unknown>) : null;
  const subtitleLabels =
    metadataValue?.subtitles && typeof metadataValue.subtitles === "object"
      ? Object.fromEntries(
          Object.entries(metadataValue.subtitles as Record<string, unknown>).flatMap(
            ([language, label]) => (typeof label === "string" ? [[language, label]] : []),
          ),
        )
      : undefined;

  return uniqueBy(
    [
      ...collect(dataUri?.subtitles, "Subtitle", subtitleLabels),
      ...collect(topLevelUri?.subtitles, "Subtitle", subtitleLabels),
      ...collect(dataValue?.subtitles, "Subtitle", subtitleLabels),
      ...collect(data.subtitles, "Subtitle", subtitleLabels),
    ],
    (track) => track.url,
  );
}

export function parseStreams(payload: unknown): ResolvedStream[] {
  const candidates: ResolvedStream[] = [];
  const push = (urlValue: unknown, qualityValue?: unknown) => {
    const url = safeAbsoluteUrl(typeof urlValue === "string" ? urlValue : null, API_BASE_URL);
    if (!url || /\.(?:vtt|srt|ass)(?:$|\?)/i.test(url)) {
      return;
    }

    let pathname = url;
    try {
      pathname = new URL(url).pathname;
    } catch {
      pathname = url;
    }

    const mimeType =
      pathname.endsWith(".mpd")
        ? "application/dash+xml"
        : pathname.endsWith(".m3u8")
          ? "application/vnd.apple.mpegurl"
          : "video/mp4";
    candidates.push({
      url,
      mimeType,
      quality: cleanText(typeof qualityValue === "string" ? qualityValue : null) || "default",
    });
  };

  const visit = (value: unknown) => {
    if (!value) {
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item);
      }
      return;
    }

    if (typeof value === "string") {
      push(value);
      return;
    }

    if (typeof value !== "object") {
      return;
    }

    const item = value as Record<string, unknown>;
    push(item.stream, item.quality ?? item.label);
    push(item.playback, item.quality ?? item.label);
    push(item.manifest, item.quality ?? item.label);
    push(item.url, item.quality ?? item.label);
    push(item.file, item.quality ?? item.label);

    if (item.streams) {
      visit(item.streams);
    }
    if (item.sources) {
      visit(item.sources);
    }
    if (item.uri) {
      visit(item.uri);
    }
    if (item.data) {
      visit(item.data);
    }
  };

  visit(payload);

  return uniqueBy(candidates, (stream) => stream.url).sort((left, right) => {
    const leftScore =
      left.mimeType === "application/dash+xml"
        ? 2
        : left.mimeType === "application/vnd.apple.mpegurl"
          ? 1
          : 0;
    const rightScore =
      right.mimeType === "application/dash+xml"
        ? 2
        : right.mimeType === "application/vnd.apple.mpegurl"
          ? 1
          : 0;
    return rightScore - leftScore;
  });
}

export function mapSearchCardsToPage(input: SearchInput, items: SearchCard[]): SearchPage {
  const rankedItems = uniqueBy(items, (item) => item.externalAnimeId)
    .map((item) => ({
      item,
      score: scoreTitleAgainstQuery(item.title, input.query),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.item.title.localeCompare(right.item.title);
    })
    .slice(0, input.limit)
    .map(({ item }) => item);

  return {
    providerId: "animeonsen",
    query: input.query,
    page: input.page,
    hasNextPage: false,
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

function scoreTitleAgainstQuery(title: string, query: string) {
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
