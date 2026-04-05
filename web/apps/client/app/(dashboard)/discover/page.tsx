"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CatalogSearchLastResponse, CatalogSearchResponse } from "@relay/contracts";
import { CoverImage } from "../../../components/cover-image";
import { AuthRequiredState } from "../../../components/auth-required-state";
import { useLibraryIndexQuery } from "../../../hooks/use-library-index-query";
import { useRouteAccess } from "../../../hooks/use-route-access";
import { apiFetch } from "../../../lib/api";
import { queryKeys } from "../../../lib/query-keys";
import { buildAnimeHref } from "../../../lib/routes";
import { streamCatalogSearch } from "../../../lib/search-stream";

type ContentFilter = "all" | "anime" | "hentai" | "jav";
type DensityMode = "comfortable" | "compact";

function buildResultKey(item: CatalogSearchResponse["items"][number]) {
  return `${item.providerId}:${item.contentClass}:${item.title.trim().toLowerCase()}:${item.year ?? "na"}`;
}

function scoreResult(item: CatalogSearchResponse["items"][number]) {
  return (item.coverImage ? 4 : 0) + (item.synopsis ? 2 : 0) + (item.year ? 1 : 0);
}

export default function DiscoverPage() {
  const access = useRouteAccess();
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [showProviderSheet, setShowProviderSheet] = useState(false);
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [contentFilter, setContentFilter] = useState<ContentFilter>("all");
  const [showOnlyLibrary, setShowOnlyLibrary] = useState(false);
  const [densityMode, setDensityMode] = useState<DensityMode>("comfortable");
  const [providerProgress, setProviderProgress] = useState<{
    query: string;
    completedProviders: number;
    totalProviders: number;
  } | null>(null);

  const searchQuery = useQuery<CatalogSearchResponse, Error>({
    queryKey: queryKeys.catalogSearch(submittedQuery),
    queryFn: ({ signal }) =>
      streamCatalogSearch(submittedQuery, signal, (completedProviders, totalProviders) => {
        setProviderProgress({
          query: submittedQuery,
          completedProviders,
          totalProviders,
        });
      }),
    enabled: access.isAuthenticated && submittedQuery.trim().length > 0,
    retry: false,
  });

  const lastSearchQuery = useQuery<CatalogSearchLastResponse>({
    queryKey: queryKeys.catalogSearchLast(),
    queryFn: () => apiFetch<CatalogSearchLastResponse>("/catalog/search/last"),
    enabled: access.isAuthenticated,
    retry: false,
  });

  const libraryQuery = useLibraryIndexQuery(access.isAuthenticated);

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

  useEffect(() => {
    if (!activeSearchResponse?.providers.some((provider) => provider.providerId === providerFilter)) {
      setProviderFilter("all");
    }
  }, [activeSearchResponse?.providers, providerFilter]);

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
      providers
        .filter((provider) => provider.latencyMs !== null)
        .reduce((total, provider) => total + (provider.latencyMs ?? 0), 0) /
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

  const filteredResults = groupedResults.filter((group) => {
    if (showOnlyLibrary && !group.inLibrary) {
      return false;
    }

    if (contentFilter !== "all" && group.primary.contentClass !== contentFilter) {
      return false;
    }

    if (
      providerFilter !== "all" &&
      !group.sources.some((source) => source.providerId === providerFilter)
    ) {
      return false;
    }

    return true;
  });

  const activeProviderProgress =
    providerProgress && providerProgress.query === submittedQuery ? providerProgress : null;
  const providerProgressLabel = activeProviderProgress
    ? `${Math.min(activeProviderProgress.completedProviders, activeProviderProgress.totalProviders)}/${activeProviderProgress.totalProviders}`
    : "0/0";
  const isRestoringCachedSearch =
    access.isAuthenticated &&
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
    setShowProviderSheet(false);
  }

  if (access.isLoading) {
    return <div className="message">Loading Discover…</div>;
  }

  if (access.isUnauthenticated) {
    return (
      <AuthRequiredState
        description="Sign in to search across your enabled providers, restore the last search, and jump straight into playback."
        title="Discover opens after account sign-in"
      />
    );
  }

  if (access.error || !access.session) {
    return (
      <div className="message">
        {access.error instanceof Error ? access.error.message : "Unable to load Discover."}
      </div>
    );
  }

  return (
    <div className="page-grid discover-page">
      <section className="page-heading">
        <span className="eyebrow">Discover</span>
        <h1>Search across enabled providers</h1>
        <p>Search stays front-and-center while provider health, partial failures, and library overlap stay one click away.</p>
      </section>

      <section className="surface sticky-search-surface">
        <form className="search-form search-form-rebuilt" onSubmit={onSearch}>
          <input
            className="search-input"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search titles, franchises, or exact episode names…"
            value={query}
          />
          <button className="button" type="submit">
            Search
          </button>
        </form>

        <div className="filter-chip-row">
          <button
            aria-pressed={contentFilter === "all"}
            className={`filter-chip${contentFilter === "all" ? " active" : ""}`}
            onClick={() => setContentFilter("all")}
            type="button"
          >
            All classes
          </button>
          {(["anime", "hentai", "jav"] as const).map((contentClass) => (
            <button
              aria-pressed={contentFilter === contentClass}
              className={`filter-chip${contentFilter === contentClass ? " active" : ""}`}
              key={contentClass}
              onClick={() => setContentFilter(contentClass)}
              type="button"
            >
              {contentClass}
            </button>
          ))}

          <button
            aria-pressed={showOnlyLibrary}
            className={`filter-chip${showOnlyLibrary ? " active" : ""}`}
            onClick={() => setShowOnlyLibrary((current) => !current)}
            type="button"
          >
            In library only
          </button>
        </div>
      </section>

      <section className="surface discover-status-bar">
        <div className="discover-status-copy">
          {searchQuery.isFetching ? (
            <div className="search-status search-status-loading">
              Searching providers… {providerProgressLabel}
            </div>
          ) : isRestoringCachedSearch ? (
            <div className="search-status search-status-loading">Restoring last search…</div>
          ) : searchQuery.error ? (
            <div className="message">
              {searchQuery.error instanceof Error ? searchQuery.error.message : "Unable to search."}
            </div>
          ) : activeSearchResponse ? (
            <>
              <strong>{activeQueryLabel ? `Results for "${activeQueryLabel}"` : "Ready"}</strong>
              <p>
                {filteredResults.length} visible groups · {providerSummary.resultCount} raw results
                {activeSearchResponse.partial ? " · partial provider coverage" : ""}
              </p>
            </>
          ) : (
            <>
              <strong>Ready to search</strong>
              <p>Run a query to pull matching titles from the providers enabled for this account.</p>
            </>
          )}
        </div>

        <div className="discover-status-actions">
          <div className="segmented-control">
            {[
              { value: "comfortable", label: "Comfortable" },
              { value: "compact", label: "Compact" },
            ].map((option) => (
              <button
                aria-pressed={densityMode === option.value}
                className={`segmented-control-button${densityMode === option.value ? " active" : ""}`}
                key={option.value}
                onClick={() => setDensityMode(option.value as DensityMode)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>

          {providerSummary.providers.length > 0 ? (
            <button className="button-secondary" onClick={() => setShowProviderSheet(true)} type="button">
              Provider health
            </button>
          ) : null}
        </div>
      </section>

      {searchQuery.isFetching || isRestoringCachedSearch ? (
        <section className={`discover-results-grid${densityMode === "compact" ? " compact" : ""}`}>
          {Array.from({ length: densityMode === "compact" ? 10 : 8 }).map((_, index) => (
            <div className="result-card result-card-skeleton" key={index} />
          ))}
        </section>
      ) : filteredResults.length > 0 ? (
        <section className={`discover-results-grid${densityMode === "compact" ? " compact" : ""}`}>
          {filteredResults.map((group) => (
            <Link
              className={`result-card${densityMode === "compact" ? " compact" : ""}`}
              href={buildAnimeHref(group.primary.providerId, group.primary.externalAnimeId)}
              key={`${group.primary.providerId}-${group.primary.externalAnimeId}`}
            >
              <div className="result-card-image-wrap">
                <CoverImage alt={group.primary.title} className="card-image" src={group.primary.coverImage} />
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
          <div className="empty-panel-copy">
            <h2>No visible results</h2>
            <p>
              No titles for "{activeQueryLabel}" match the filters you currently have enabled.
            </p>
          </div>
        </section>
      ) : (
        <section className="empty-panel">
          <div className="empty-panel-copy">
            <h2>Start with a title or keyword</h2>
            <p>Relay will search across enabled sources and remember the last successful query for quick return visits.</p>
          </div>
        </section>
      )}

      {showProviderSheet && providerSummary.providers.length > 0 ? (
        <div className="overlay-shell" role="presentation" onClick={() => setShowProviderSheet(false)}>
          <aside
            aria-label="Provider health"
            className="provider-sheet"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="provider-sheet-head">
              <div>
                <span className="eyebrow">Providers</span>
                <h2>Search coverage and health</h2>
                <p>
                  {providerSummary.healthyCount} healthy · {providerSummary.timeoutCount} timed out ·{" "}
                  {providerSummary.errorCount} errors
                </p>
              </div>
              <button className="button-secondary" onClick={() => setShowProviderSheet(false)} type="button">
                Close
              </button>
            </div>

            <div className="filter-chip-row provider-filter-row">
              <button
                aria-pressed={providerFilter === "all"}
                className={`filter-chip${providerFilter === "all" ? " active" : ""}`}
                onClick={() => setProviderFilter("all")}
                type="button"
              >
                All providers
              </button>
              {providerSummary.providers.map((provider) => (
                <button
                  aria-pressed={providerFilter === provider.providerId}
                  className={`filter-chip${providerFilter === provider.providerId ? " active" : ""}`}
                  key={provider.providerId}
                  onClick={() => setProviderFilter(provider.providerId)}
                  type="button"
                >
                  {provider.displayName}
                </button>
              ))}
            </div>

            <div className="provider-response-list">
              {providerSummary.providers
                .filter((provider) => providerFilter === "all" || provider.providerId === providerFilter)
                .map((provider) => (
                  <article className="provider-response-row" key={provider.providerId}>
                    <div className="provider-response-main">
                      <div className="provider-response-header">
                        <span
                          className={`status-dot status-${provider.status === "success" ? "healthy" : provider.status === "timeout" ? "warn" : "danger"}`}
                        />
                        <strong>{provider.displayName}</strong>
                        <span className="badge">{provider.contentClass}</span>
                      </div>
                      <p>
                        {provider.status === "success"
                          ? `${provider.items.length} results`
                          : provider.error ?? provider.status}
                        {provider.latencyMs !== null ? ` · ${provider.latencyMs}ms` : ""}
                      </p>
                    </div>
                  </article>
                ))}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
