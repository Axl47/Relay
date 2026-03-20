"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  CatalogSearchLastResponse,
  CatalogSearchResponse,
  LibraryItemWithCategories,
} from "@relay/contracts";
import { apiFetch } from "../../../lib/api";
import { FALLBACK_COVER } from "../../../lib/fallback-cover";
import { resolveMediaUrl } from "../../../lib/media";

type LibraryResponse = {
  items: LibraryItemWithCategories[];
};

type CatalogSearchStreamEvent =
  | {
      type: "start";
      completedProviders: number;
      totalProviders: number;
    }
  | {
      type: "progress";
      completedProviders: number;
      totalProviders: number;
    }
  | {
      type: "done";
      response: CatalogSearchResponse;
    }
  | {
      type: "error";
      message: string;
    };

async function streamCatalogSearch(
  searchTerm: string,
  signal: AbortSignal,
  onProgress: (completedProviders: number, totalProviders: number) => void,
) {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
  const response = await fetch(
    `${baseUrl}/catalog/search/stream?query=${encodeURIComponent(searchTerm)}&page=1&limit=24`,
    {
      cache: "no-store",
      credentials: "include",
      signal,
    },
  );

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `Search failed with status ${response.status}`);
  }

  if (!response.body) {
    throw new Error("Search stream did not return a readable response body.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  let finalResponse: CatalogSearchResponse | null = null;

  const processLine = (line: string) => {
    const event = JSON.parse(line) as CatalogSearchStreamEvent;
    if (event.type === "start" || event.type === "progress") {
      onProgress(event.completedProviders, event.totalProviders);
      return;
    }

    if (event.type === "done") {
      finalResponse = event.response;
      return;
    }

    if (event.type === "error") {
      throw new Error(event.message || "Unable to search providers.");
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffered += decoder.decode(value, { stream: true });

    while (true) {
      const lineBreakIndex = buffered.indexOf("\n");
      if (lineBreakIndex < 0) {
        break;
      }

      const line = buffered.slice(0, lineBreakIndex).trim();
      buffered = buffered.slice(lineBreakIndex + 1);
      if (line.length === 0) {
        continue;
      }
      processLine(line);
    }
  }

  const trailing = buffered.trim();
  if (trailing.length > 0) {
    processLine(trailing);
  }

  if (finalResponse) {
    return finalResponse;
  }

  throw new Error("Search stream ended before completion.");
}

function buildResultKey(item: CatalogSearchResponse["items"][number]) {
  return `${item.providerId}:${item.contentClass}:${item.title.trim().toLowerCase()}:${item.year ?? "na"}`;
}

function scoreResult(item: CatalogSearchResponse["items"][number]) {
  return (
    (item.coverImage ? 4 : 0) +
    (item.synopsis ? 2 : 0) +
    (item.year ? 1 : 0)
  );
}

export default function DiscoverPage() {
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [showProviders, setShowProviders] = useState(false);
  const [providerProgress, setProviderProgress] = useState<{
    query: string;
    completedProviders: number;
    totalProviders: number;
  } | null>(null);

  const searchQuery = useQuery<CatalogSearchResponse, Error>({
    queryKey: ["catalog-search", submittedQuery],
    queryFn: ({ signal }) =>
      streamCatalogSearch(submittedQuery, signal, (completedProviders, totalProviders) => {
        setProviderProgress({
          query: submittedQuery,
          completedProviders,
          totalProviders,
        });
      }),
    enabled: submittedQuery.trim().length > 0,
  });

  const lastSearchQuery = useQuery<CatalogSearchLastResponse>({
    queryKey: ["catalog-search-last"],
    queryFn: () => apiFetch<CatalogSearchLastResponse>("/catalog/search/last"),
  });

  const libraryQuery = useQuery({
    queryKey: ["library-index"],
    queryFn: () => apiFetch<LibraryResponse>("/library"),
  });

  const restoredSearchResponse = submittedQuery.trim().length > 0
    ? null
    : (lastSearchQuery.data?.result ?? null);
  const activeSearchResponse = searchQuery.data ?? restoredSearchResponse;
  const activeQueryLabel = activeSearchResponse?.query ?? submittedQuery;

  useEffect(() => {
    const restoredQuery = restoredSearchResponse?.query?.trim();
    if (!restoredQuery) {
      return;
    }

    setQuery((current) => (current.trim().length > 0 ? current : restoredQuery));
  }, [restoredSearchResponse?.query]);

  const groupedResults = useMemo(() => {
    const items = activeSearchResponse?.items ?? [];
    const libraryKeys = new Set(
      (libraryQuery.data?.items ?? []).map(
        (item) => `${item.providerId}:${item.externalAnimeId}`,
      ),
    );
    const groups = new Map<
      string,
      {
        primary: CatalogSearchResponse["items"][number];
        sources: CatalogSearchResponse["items"][number][];
        inLibrary: boolean;
      }
    >();

    for (const item of items) {
      const key = buildResultKey(item);
      const current = groups.get(key);
      if (current) {
        current.sources.push(item);
        if (scoreResult(item) > scoreResult(current.primary)) {
          current.primary = item;
        }
        current.inLibrary =
          current.inLibrary || libraryKeys.has(`${item.providerId}:${item.externalAnimeId}`);
        continue;
      }

      groups.set(key, {
        primary: item,
        sources: [item],
        inLibrary: libraryKeys.has(`${item.providerId}:${item.externalAnimeId}`),
      });
    }

    return Array.from(groups.values());
  }, [activeSearchResponse?.items, libraryQuery.data?.items]);

  const providerSummary = useMemo(() => {
    const providers = activeSearchResponse?.providers ?? [];
    const healthyCount = providers.filter((provider) => provider.status === "success").length;
    const timeoutCount = providers.filter((provider) => provider.status === "timeout").length;
    const errorCount = providers.filter((provider) => provider.status === "error").length;
    const resultCount = activeSearchResponse?.items.length ?? 0;
    const averageLatency =
      providers.filter((provider) => provider.latencyMs !== null).reduce((total, provider) => total + (provider.latencyMs ?? 0), 0) /
      Math.max(1, providers.filter((provider) => provider.latencyMs !== null).length);

    return {
      providers,
      healthyCount,
      timeoutCount,
      errorCount,
      resultCount,
      averageLatency: Number.isFinite(averageLatency) ? Math.round(averageLatency) : null,
    };
  }, [activeSearchResponse]);

  const activeProviderProgress =
    providerProgress && providerProgress.query === submittedQuery ? providerProgress : null;
  const providerProgressLabel = activeProviderProgress
    ? `${Math.min(activeProviderProgress.completedProviders, activeProviderProgress.totalProviders)}/${activeProviderProgress.totalProviders}`
    : "0/0";
  const isRestoringCachedSearch =
    submittedQuery.trim().length === 0 &&
    !searchQuery.data &&
    lastSearchQuery.isLoading;

  function onSearch(event: FormEvent) {
    event.preventDefault();
    const nextQuery = query.trim();
    setSubmittedQuery(nextQuery);
    setProviderProgress(
      nextQuery
        ? {
            query: nextQuery,
            completedProviders: 0,
            totalProviders: 0,
          }
        : null,
    );
    setShowProviders(false);
  }

  return (
    <div className="page-grid discover-page">
      <section className="search-hero">
        <div className="page-heading">
          <h1>Discover</h1>
          <p>Search across enabled providers and jump straight into playback.</p>
        </div>

        <form className="search-form" onSubmit={onSearch}>
          <input
            className="search-input"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search across providers..."
            value={query}
          />
          <button className="button" type="submit">
            Search
          </button>
        </form>

        {searchQuery.isFetching ? (
          <div className="search-status search-status-loading">
            Searching providers... {providerProgressLabel}
          </div>
        ) : isRestoringCachedSearch ? (
          <div className="search-status search-status-loading">Restoring last search...</div>
        ) : searchQuery.error ? (
          <div className="message">
            {searchQuery.error instanceof Error ? searchQuery.error.message : "Unable to search."}
          </div>
        ) : activeSearchResponse ? (
          <button
            className={`provider-summary${showProviders ? " expanded" : ""}`}
            onClick={() => setShowProviders((current) => !current)}
            type="button"
          >
            <span>
              {providerSummary.timeoutCount > 0 || providerSummary.errorCount > 0
                ? `Warning · ${providerSummary.healthyCount} of ${providerSummary.providers.length} providers healthy`
                : `Ready · ${providerSummary.providers.length} providers responded`}
            </span>
            <span>
              {providerSummary.resultCount} results
              {providerSummary.averageLatency !== null
                ? ` · ${providerSummary.averageLatency}ms avg`
                : ""}
            </span>
          </button>
        ) : null}

        {showProviders && providerSummary.providers.length > 0 ? (
          <div className="provider-response-list">
            {providerSummary.providers.map((provider) => (
              <article className="provider-response-row" key={provider.providerId}>
                <div className="provider-response-main">
                  <div className="provider-response-header">
                    <span
                      className={`status-dot status-${provider.status === "success" ? "healthy" : provider.status === "timeout" ? "warn" : "danger"}`}
                    />
                    <strong>{provider.displayName}</strong>
                  </div>
                  <p>
                    {provider.status === "success"
                      ? `${provider.items.length} results`
                      : provider.error ?? provider.status}
                    {provider.latencyMs !== null ? ` · ${provider.latencyMs}ms` : ""}
                  </p>
                </div>
                <span className="badge">{provider.contentClass}</span>
              </article>
            ))}
          </div>
        ) : null}
      </section>

      {searchQuery.isFetching || isRestoringCachedSearch ? (
        <section className="discover-results-grid">
          {Array.from({ length: 8 }).map((_, index) => (
            <div className="result-card result-card-skeleton" key={index} />
          ))}
        </section>
      ) : groupedResults.length > 0 ? (
        <section className="discover-results-grid">
          {groupedResults.map((group) => (
            <Link
              className="result-card"
              href={`/anime/${encodeURIComponent(group.primary.providerId)}/${encodeURIComponent(group.primary.externalAnimeId)}`}
              key={`${group.primary.providerId}-${group.primary.externalAnimeId}`}
            >
              <div className="result-card-image-wrap">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  alt={group.primary.title}
                  className="card-image"
                  src={
                    group.primary.coverImage
                      ? resolveMediaUrl(group.primary.coverImage)
                      : FALLBACK_COVER
                  }
                />
                <div className="result-card-badges">
                  <span className="badge badge-strong">{group.primary.providerDisplayName}</span>
                  {group.sources.length > 1 ? (
                    <span className="badge">{group.sources.length} sources</span>
                  ) : null}
                  {group.inLibrary ? <span className="badge badge-success">In Library</span> : null}
                </div>
              </div>
              <div className="card-body">
                <strong>{group.primary.title}</strong>
                <div className="meta-row">
                  <span>{group.primary.kind.toUpperCase()}</span>
                  {group.primary.year ? <span>{group.primary.year}</span> : null}
                  <span>{group.primary.contentClass}</span>
                </div>
                {group.primary.synopsis ? (
                  <p>{group.primary.synopsis}</p>
                ) : (
                  <p className="card-subtle">
                    {group.primary.year ? `Released ${group.primary.year}` : "Open details"}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </section>
      ) : activeSearchResponse ? (
        <section className="empty-panel">
          <h2>No results</h2>
          <p>No results for "{activeQueryLabel}" across the currently enabled providers.</p>
        </section>
      ) : (
        <section className="empty-panel">
          <h2>Ready to search</h2>
          <p>Use the search bar above to query Relay&apos;s enabled providers.</p>
        </section>
      )}
    </div>
  );
}
