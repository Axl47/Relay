export function decodeRouteParam(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function encodeRouteParam(value: string) {
  return encodeURIComponent(decodeRouteParam(value));
}

export function encodeExternalIdPath(value: string) {
  return value
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeRouteParam(segment))
    .join("/");
}

function buildQueryPath(pathname: string, params: Record<string, string | null | undefined>) {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      searchParams.set(key, value);
    }
  }

  const query = searchParams.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function buildAnimeHref(providerId: string, externalAnimeId: string) {
  return `/anime/${encodeRouteParam(providerId)}/${encodeRouteParam(externalAnimeId)}`;
}

export type WatchHrefInput = {
  libraryItemId?: string | null;
  providerId: string;
  externalAnimeId: string;
  externalEpisodeId: string;
};

export function buildWatchHref(input: WatchHrefInput) {
  return buildQueryPath(
    `/watch/${encodeRouteParam(input.libraryItemId ?? "direct")}/${encodeRouteParam(input.externalEpisodeId)}`,
    {
      providerId: input.providerId,
      externalAnimeId: input.externalAnimeId,
    },
  );
}

export function buildCatalogAnimePath(providerId: string, externalAnimeId: string) {
  return buildQueryPath("/catalog/anime", { providerId, externalAnimeId });
}

export function buildCatalogAnimeViewPath(providerId: string, externalAnimeId: string) {
  return buildQueryPath("/catalog/anime/view", { providerId, externalAnimeId });
}

export function buildCatalogEpisodesPath(providerId: string, externalAnimeId: string) {
  return buildQueryPath("/catalog/episodes", { providerId, externalAnimeId });
}

export function buildWatchContextPath(input: WatchHrefInput) {
  return buildQueryPath("/watch/context", {
    providerId: input.providerId,
    externalAnimeId: input.externalAnimeId,
    externalEpisodeId: input.externalEpisodeId,
    libraryItemId: input.libraryItemId ?? null,
  });
}
