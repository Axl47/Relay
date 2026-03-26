"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CoverImage } from "../../../components/cover-image";
import { useLibraryDashboardQuery } from "../../../hooks/use-library-dashboard-query";
import { buildAnimeHref, buildWatchHref } from "../../../lib/routes";

type LibraryViewMode = "grid" | "list";
type LibrarySortMode = "title" | "recentlyWatched" | "recentlyAdded" | "year";

export default function LibraryPage() {
  const [viewMode, setViewMode] = useState<LibraryViewMode>("grid");
  const [sortMode, setSortMode] = useState<LibrarySortMode>("recentlyWatched");

  const dashboardQuery = useLibraryDashboardQuery();

  const sortedItems = useMemo(() => {
    const items = [...(dashboardQuery.data?.allItems ?? [])];

    switch (sortMode) {
      case "title":
        return items.sort((left, right) => left.title.localeCompare(right.title));
      case "recentlyAdded":
        return items.sort(
          (left, right) => new Date(right.addedAt).valueOf() - new Date(left.addedAt).valueOf(),
        );
      case "year":
        return items.sort((left, right) => (right.totalEpisodes ?? 0) - (left.totalEpisodes ?? 0));
      case "recentlyWatched":
      default:
        return items.sort((left, right) => {
          const leftValue = left.progress ? new Date(left.progress.updatedAt).valueOf() : 0;
          const rightValue = right.progress ? new Date(right.progress.updatedAt).valueOf() : 0;
          return rightValue - leftValue;
        });
    }
  }, [dashboardQuery.data?.allItems, sortMode]);

  if (dashboardQuery.isLoading) {
    return <div className="message">Loading library...</div>;
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
      <div className="empty-panel">
        <h1>Your library is empty</h1>
        <p>Search for something to watch and add it to your Relay library.</p>
        <Link className="button" href="/discover">
          Go to Discover
        </Link>
      </div>
    );
  }

  return (
    <div className="page-grid library-page">
      <section className="page-heading">
        <h1>Library</h1>
        <p>What you are watching now, what you added recently, and what to pick next.</p>
      </section>

      {dashboard.continueWatching.length > 0 ? (
        <section className="surface">
          <div className="section-header">
            <div>
              <h2>Continue Watching</h2>
              <p>Resume the latest in-progress titles without opening detail first.</p>
            </div>
          </div>

          <div className="shelf-row">
            {dashboard.continueWatching.map((item) => (
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

      {dashboard.recentlyAdded.length > 0 ? (
        <section className="surface">
          <div className="section-header">
            <div>
              <h2>Recently Added</h2>
              <p>Fresh library additions from the last 30 days.</p>
            </div>
          </div>

          <div className="shelf-row">
            {dashboard.recentlyAdded.map((item) => (
              <Link
                className="mini-card"
                href={buildAnimeHref(item.providerId, item.externalAnimeId)}
                key={item.id}
              >
                <CoverImage alt={item.title} className="card-image" src={item.coverImage} />
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
            <h2>All Library</h2>
            <p>{dashboard.allItems.length} saved titles</p>
          </div>

          <div className="actions">
            <button
              className={viewMode === "grid" ? "button-secondary active-pill" : "button-secondary"}
              onClick={() => setViewMode("grid")}
              type="button"
            >
              Grid
            </button>
            <button
              className={viewMode === "list" ? "button-secondary active-pill" : "button-secondary"}
              onClick={() => setViewMode("list")}
              type="button"
            >
              List
            </button>
            <select onChange={(event) => setSortMode(event.target.value as LibrarySortMode)} value={sortMode}>
              <option value="recentlyWatched">Recently Watched</option>
              <option value="recentlyAdded">Recently Added</option>
              <option value="title">A-Z</option>
              <option value="year">Episode Count</option>
            </select>
          </div>
        </div>

        {viewMode === "grid" ? (
          <div className="discover-results-grid">
            {sortedItems.map((item) => (
              <Link
                className="result-card"
                href={buildAnimeHref(item.providerId, item.externalAnimeId)}
                key={item.id}
              >
                <div className="result-card-image-wrap">
                  <CoverImage alt={item.title} className="card-image" src={item.coverImage} />
                  {item.progress ? (
                    <div className="progress-strip">
                      <span style={{ width: `${item.progress.percentComplete}%` }} />
                    </div>
                  ) : null}
                </div>
                <div className="card-body">
                  <strong>{item.title}</strong>
                  <div className="meta-row">
                    <span>{item.providerId}</span>
                    {item.currentEpisodeNumber ? <span>Ep {item.currentEpisodeNumber}</span> : null}
                    {item.isComplete ? <span>Complete</span> : null}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
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
                  {item.progress ? <span>{item.progress.percentComplete}%</span> : null}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
