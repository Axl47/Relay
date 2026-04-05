"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  LibraryDashboardResponse,
  UpdateUserPreferencesInput,
  UserPreferences,
} from "@relay/contracts";
import { CoverImage } from "../../../components/cover-image";
import { AuthRequiredState } from "../../../components/auth-required-state";
import { useLibraryDashboardQuery } from "../../../hooks/use-library-dashboard-query";
import { useRouteAccess } from "../../../hooks/use-route-access";
import { useTrackerEntriesQuery } from "../../../hooks/use-tracker-entries-query";
import { apiFetch } from "../../../lib/api";
import { queryKeys } from "../../../lib/query-keys";
import { buildAnimeHref, buildWatchHref } from "../../../lib/routes";

type SortMode = UserPreferences["librarySortMode"];
type LayoutMode = UserPreferences["libraryLayoutMode"];

function sortLibraryItems(
  items: LibraryDashboardResponse["allItems"],
  sortMode: SortMode,
) {
  switch (sortMode) {
    case "title":
      return items.sort((left, right) => left.title.localeCompare(right.title));
    case "dateAdded":
      return items.sort(
        (left, right) => new Date(right.addedAt).valueOf() - new Date(left.addedAt).valueOf(),
      );
    case "updatedAt":
      return items.sort(
        (left, right) => new Date(right.updatedAt).valueOf() - new Date(left.updatedAt).valueOf(),
      );
    case "lastWatched":
    default:
      return items.sort((left, right) => {
        const leftValue = left.progress ? new Date(left.progress.updatedAt).valueOf() : 0;
        const rightValue = right.progress ? new Date(right.progress.updatedAt).valueOf() : 0;
        return rightValue - leftValue;
      });
  }
}

export default function LibraryPage() {
  const queryClient = useQueryClient();
  const access = useRouteAccess();
  const [activeCategoryId, setActiveCategoryId] = useState<string>("all");
  const [message, setMessage] = useState<string | null>(null);

  const dashboardQuery = useLibraryDashboardQuery(access.isAuthenticated);
  const trackerEntriesQuery = useTrackerEntriesQuery(access.isAuthenticated);

  const updatePreferencesMutation = useMutation({
    mutationFn: (patch: UpdateUserPreferencesInput) =>
      apiFetch<UserPreferences>("/me/preferences", {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.me() });
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : "Unable to update library preferences.");
    },
  });

  async function updatePreferences(patch: UpdateUserPreferencesInput) {
    setMessage(null);
    await updatePreferencesMutation.mutateAsync(patch);
  }

  useEffect(() => {
    if (
      !dashboardQuery.data?.categories.some((category) => category.id === activeCategoryId) ||
      !access.session?.preferences.categoryTabsVisible
    ) {
      setActiveCategoryId("all");
    }
  }, [access.session?.preferences.categoryTabsVisible, activeCategoryId, dashboardQuery.data?.categories]);

  if (access.isLoading) {
    return <div className="message">Loading library…</div>;
  }

  if (access.isUnauthenticated) {
    return (
      <AuthRequiredState
        description="Sign in to keep a personal library, continue watching, and persist categories across devices."
        title="Your library follows your account"
      />
    );
  }

  if (access.error || !access.session) {
    return (
      <div className="message">
        {access.error instanceof Error ? access.error.message : "Unable to load library."}
      </div>
    );
  }

  if (dashboardQuery.isLoading) {
    return <div className="message">Loading library…</div>;
  }

  if (dashboardQuery.error) {
    return (
      <div className="message">
        {dashboardQuery.error instanceof Error
          ? dashboardQuery.error.message
          : "Unable to load library."}
      </div>
    );
  }

  const dashboard = dashboardQuery.data;
  if (!dashboard) {
    return <div className="message">Library unavailable.</div>;
  }

  if (dashboard.allItems.length === 0) {
    return (
      <div className="page-grid library-page">
        <section className="page-heading">
          <span className="eyebrow">Library</span>
          <h1>Build the queue you actually want to return to</h1>
          <p>Save titles from Discover so Relay can keep progress, categories, and quick resume paths together.</p>
        </section>

        <section className="empty-panel">
          <div className="empty-panel-copy">
            <h2>Your library is empty</h2>
            <p>Search for something to watch, add it once, and Relay will keep the watch flow stitched together.</p>
          </div>
          <div className="actions">
            <Link className="button" href="/discover">
              Go to Discover
            </Link>
          </div>
        </section>
      </div>
    );
  }

  const preferences = access.session.preferences;
  const trackedLibraryItemIds = new Set(
    (trackerEntriesQuery.data?.entries ?? []).map((entry) => entry.libraryItemId),
  );
  const visibleCategories = preferences.categoryTabsVisible ? dashboard.categories : [];
  const filteredItems = dashboard.allItems.filter((item) => {
    if (activeCategoryId === "all") {
      return true;
    }

    return item.categories.some((category) => category.id === activeCategoryId);
  });
  const sortedItems = sortLibraryItems([...filteredItems], preferences.librarySortMode);
  const continueWatching = dashboard.continueWatching.slice(0, 8);
  const recentlyAdded = dashboard.recentlyAdded.slice(0, 8);

  return (
    <div className="page-grid library-page">
      <section className="page-heading page-heading-row">
        <div>
          <span className="eyebrow">Library</span>
          <h1>Pick up where you left off</h1>
          <p>Continue active shows, browse by category, and switch between posters and denser reading views.</p>
        </div>
        <div className="page-heading-meta">
          <span className="badge">{dashboard.allItems.length} titles</span>
          <span className="badge">{dashboard.categories.length} categories</span>
        </div>
      </section>

      <section className="surface library-controls">
        <div className="section-header">
          <div>
            <h2>View controls</h2>
            <p>These preferences follow your account instead of resetting per device.</p>
          </div>
        </div>

        <div className="toolbar-cluster">
          <div className="segmented-control">
            {[
              { value: "grid", label: "Posters" },
              { value: "list", label: "List" },
              { value: "compact", label: "Compact" },
            ].map((option) => (
              <button
                aria-pressed={preferences.libraryLayoutMode === option.value}
                className={`segmented-control-button${preferences.libraryLayoutMode === option.value ? " active" : ""}`}
                key={option.value}
                onClick={() =>
                  updatePreferences({
                    libraryLayoutMode: option.value as LayoutMode,
                  })
                }
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="segmented-control">
            {[
              { value: "lastWatched", label: "Recent" },
              { value: "dateAdded", label: "Added" },
              { value: "title", label: "A-Z" },
              { value: "updatedAt", label: "Updated" },
            ].map((option) => (
              <button
                aria-pressed={preferences.librarySortMode === option.value}
                className={`segmented-control-button${preferences.librarySortMode === option.value ? " active" : ""}`}
                key={option.value}
                onClick={() =>
                  updatePreferences({
                    librarySortMode: option.value as SortMode,
                  })
                }
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>

          <button
            className={`button-secondary toggle-chip${preferences.categoryTabsVisible ? " active" : ""}`}
            onClick={() =>
              updatePreferences({
                categoryTabsVisible: !preferences.categoryTabsVisible,
              })
            }
            type="button"
          >
            {preferences.categoryTabsVisible ? "Hide categories" : "Show categories"}
          </button>
        </div>
      </section>

      {continueWatching.length > 0 ? (
        <section className="surface">
          <div className="section-header">
            <div>
              <h2>Continue watching</h2>
              <p>Resume the shows with active watch progress instead of digging back through detail pages.</p>
            </div>
          </div>

          <div className="shelf-row">
            {continueWatching.map((item) => (
              <Link
                className="continue-card"
                href={buildWatchHref({
                  libraryItemId: item.id,
                  providerId: item.providerId,
                  externalAnimeId: item.externalAnimeId,
                  externalEpisodeId: item.currentEpisodeId ?? "",
                })}
                key={item.id}
              >
                <div className="continue-card-media">
                  <CoverImage alt={item.title} className="card-image" src={item.coverImage} />
                  {item.progress ? (
                    <div className="progress-strip">
                      <span style={{ width: `${item.progress.percentComplete}%` }} />
                    </div>
                  ) : null}
                  {item.currentEpisodeNumber ? (
                    <span className="floating-badge">Ep {item.currentEpisodeNumber}</span>
                  ) : null}
                </div>
                <div className="card-body">
                  <strong>{item.title}</strong>
                  <p>{item.currentEpisodeTitle ?? "Continue where you left off"}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {recentlyAdded.length > 0 ? (
        <section className="surface">
          <div className="section-header">
            <div>
              <h2>Recently added</h2>
              <p>Fresh additions from the last stretch of searching and library cleanup.</p>
            </div>
          </div>

          <div className="shelf-row">
            {recentlyAdded.map((item) => (
              <Link
                className="mini-card"
                href={buildAnimeHref(item.providerId, item.externalAnimeId)}
                key={item.id}
              >
                <div className="result-card-image-wrap">
                  <CoverImage alt={item.title} className="card-image" src={item.coverImage} />
                  <div className="result-card-badges">
                    {trackedLibraryItemIds.has(item.id) ? <span className="badge">Tracked</span> : null}
                  </div>
                </div>
                <div className="card-body">
                  <strong>{item.title}</strong>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="surface">
        <div className="section-header">
          <div>
            <h2>All library</h2>
            <p>{sortedItems.length} visible titles</p>
          </div>
        </div>

        {visibleCategories.length > 0 ? (
          <div className="filter-chip-row category-filter-row">
            <button
              aria-pressed={activeCategoryId === "all"}
              className={`filter-chip${activeCategoryId === "all" ? " active" : ""}`}
              onClick={() => setActiveCategoryId("all")}
              type="button"
            >
              All
            </button>
            {visibleCategories.map((category) => (
              <button
                aria-pressed={activeCategoryId === category.id}
                className={`filter-chip${activeCategoryId === category.id ? " active" : ""}`}
                key={category.id}
                onClick={() => setActiveCategoryId(category.id)}
                type="button"
              >
                {category.name}
              </button>
            ))}
          </div>
        ) : null}

        {preferences.libraryLayoutMode === "grid" ? (
          <div className="discover-results-grid library-grid">
            {sortedItems.map((item) => (
              <Link
                className="result-card"
                href={buildAnimeHref(item.providerId, item.externalAnimeId)}
                key={item.id}
              >
                <div className="result-card-image-wrap">
                  <CoverImage alt={item.title} className="card-image" src={item.coverImage} />
                  <div className="result-card-badges">
                    <span className="badge">{item.providerId}</span>
                    {trackedLibraryItemIds.has(item.id) ? <span className="badge">Tracked</span> : null}
                    {item.isComplete ? <span className="badge badge-success">Complete</span> : null}
                  </div>
                  {item.progress ? (
                    <div className="progress-strip">
                      <span style={{ width: `${item.progress.percentComplete}%` }} />
                    </div>
                  ) : null}
                </div>
                <div className="card-body">
                  <strong>{item.title}</strong>
                  <div className="meta-row">
                    {item.currentEpisodeNumber ? <span>Ep {item.currentEpisodeNumber}</span> : <span>Not started</span>}
                    {item.totalEpisodes ? <span>{item.totalEpisodes} eps</span> : null}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : preferences.libraryLayoutMode === "list" ? (
          <div className="list">
            {sortedItems.map((item) => (
              <Link
                className="list-item library-list-row"
                href={buildAnimeHref(item.providerId, item.externalAnimeId)}
                key={item.id}
              >
                <div className="list-item-main">
                  <strong>{item.title}</strong>
                  <p>
                    {item.currentEpisodeNumber ? `Episode ${item.currentEpisodeNumber}` : "Not started"}
                    {item.currentEpisodeTitle ? ` · ${item.currentEpisodeTitle}` : ""}
                  </p>
                </div>
                <div className="meta-row">
                  <span className="badge">{item.providerId}</span>
                  {trackedLibraryItemIds.has(item.id) ? <span className="badge">Tracked</span> : null}
                  {item.progress ? <span>{item.progress.percentComplete}%</span> : null}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="stack-list compact">
            {sortedItems.map((item) => (
              <Link className="inline-card compact-card" href={buildAnimeHref(item.providerId, item.externalAnimeId)} key={item.id}>
                <div className="compact-card-media">
                  <CoverImage alt={item.title} className="compact-cover" src={item.coverImage} />
                </div>
                <div className="compact-card-copy">
                  <strong>{item.title}</strong>
                  <p>
                    {item.currentEpisodeNumber ? `Episode ${item.currentEpisodeNumber}` : "Not started"}
                    {item.currentEpisodeTitle ? ` · ${item.currentEpisodeTitle}` : ""}
                  </p>
                </div>
                <div className="meta-row">
                  {trackedLibraryItemIds.has(item.id) ? <span className="badge">Tracked</span> : null}
                  {item.progress ? <span>{item.progress.percentComplete}%</span> : null}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {message ? <div className="message">{message}</div> : null}
    </div>
  );
}
