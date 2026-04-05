"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CoverImage } from "../../../components/cover-image";
import { AuthRequiredState } from "../../../components/auth-required-state";
import { useGroupedHistoryQuery } from "../../../hooks/use-grouped-history-query";
import { useRouteAccess } from "../../../hooks/use-route-access";
import { buildWatchHref } from "../../../lib/routes";

type StatusFilter = "all" | "in-progress" | "completed";
type DateFilter = "all" | "today" | "week" | "older";

function inDateBucket(label: string, bucket: DateFilter) {
  if (bucket === "all") {
    return true;
  }

  const normalizedLabel = label.toLowerCase();
  if (bucket === "today") {
    return normalizedLabel === "today";
  }

  if (bucket === "week") {
    return normalizedLabel === "yesterday" || normalizedLabel.includes("days ago");
  }

  return !(
    normalizedLabel === "today" ||
    normalizedLabel === "yesterday" ||
    normalizedLabel.includes("days ago")
  );
}

export default function HistoryPage() {
  const access = useRouteAccess();
  const historyQuery = useGroupedHistoryQuery(access.isAuthenticated);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const groups = historyQuery.data?.groups ?? [];
  const filteredGroups = useMemo(
    () =>
      groups
        .filter((group) => inDateBucket(group.label, dateFilter))
        .map((group) => ({
          ...group,
          entries: group.entries.filter((entry) => {
            if (statusFilter === "completed") {
              return entry.completed;
            }

            if (statusFilter === "in-progress") {
              return !entry.completed;
            }

            return true;
          }),
        }))
        .filter((group) => group.entries.length > 0),
    [dateFilter, groups, statusFilter],
  );

  if (access.isLoading) {
    return <div className="message">Loading activity…</div>;
  }

  if (access.isUnauthenticated) {
    return (
      <AuthRequiredState
        description="Sign in to revisit your watch timeline, resume unfinished episodes, and keep recent activity organized by day."
        title="Activity is personal to your account"
      />
    );
  }

  if (access.error || !access.session) {
    return (
      <div className="message">
        {access.error instanceof Error ? access.error.message : "Unable to load activity."}
      </div>
    );
  }

  if (historyQuery.isLoading) {
    return <div className="message">Loading activity…</div>;
  }

  if (historyQuery.error) {
    return (
      <div className="message">
        {historyQuery.error instanceof Error
          ? historyQuery.error.message
          : "Unable to load activity."}
      </div>
    );
  }

  if (filteredGroups.length === 0) {
    return (
      <div className="page-grid activity-page">
        <section className="page-heading">
          <span className="eyebrow">Activity</span>
          <h1>Replay your recent watch trail</h1>
          <p>Relay groups playback history by day so you can jump back into unfinished episodes quickly.</p>
        </section>

        <section className="empty-panel">
          <div className="empty-panel-copy">
            <h2>No activity yet</h2>
            <p>Start watching from Discover or Library and your watch timeline will appear here.</p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="page-grid activity-page">
      <section className="page-heading page-heading-row">
        <div>
          <span className="eyebrow">Activity</span>
          <h1>Resume from your watch timeline</h1>
          <p>Filter the feed by completion state and time window instead of scanning one long chronological dump.</p>
        </div>
      </section>

      <section className="surface activity-controls">
        <div className="toolbar-cluster">
          <div className="segmented-control">
            {[
              { value: "all", label: "All" },
              { value: "in-progress", label: "In progress" },
              { value: "completed", label: "Completed" },
            ].map((option) => (
              <button
                aria-pressed={statusFilter === option.value}
                className={`segmented-control-button${statusFilter === option.value ? " active" : ""}`}
                key={option.value}
                onClick={() => setStatusFilter(option.value as StatusFilter)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="segmented-control">
            {[
              { value: "all", label: "All dates" },
              { value: "today", label: "Today" },
              { value: "week", label: "This week" },
              { value: "older", label: "Older" },
            ].map((option) => (
              <button
                aria-pressed={dateFilter === option.value}
                className={`segmented-control-button${dateFilter === option.value ? " active" : ""}`}
                key={option.value}
                onClick={() => setDateFilter(option.value as DateFilter)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {filteredGroups.map((group) => (
        <section className="surface history-group" key={group.key}>
          <div className="section-header">
            <div>
              <h2>{group.label}</h2>
              <p>{group.entries.length} entries</p>
            </div>
          </div>

          <div className="timeline-list">
            {group.entries.map((entry) => (
              <Link
                className="history-row timeline-row"
                href={buildWatchHref({
                  libraryItemId: entry.libraryItemId,
                  providerId: entry.providerId,
                  externalAnimeId: entry.externalAnimeId,
                  externalEpisodeId: entry.externalEpisodeId,
                })}
                key={entry.id}
              >
                <div className="history-row-media">
                  <CoverImage alt={entry.animeTitle} className="history-thumb" src={entry.coverImage} />
                </div>
                <div className="list-item-main">
                  <strong>{entry.animeTitle}</strong>
                  <p>
                    {entry.episodeTitle} ·{" "}
                    {entry.completed
                      ? "Completed"
                      : entry.durationSeconds
                        ? `Watched ${Math.max(1, Math.round(entry.positionSeconds / 60))} min`
                        : `${entry.positionSeconds}s`}
                  </p>
                </div>
                <div className="timeline-row-meta">
                  <span className={`badge${entry.completed ? " badge-success" : ""}`}>
                    {entry.completed ? "Done" : "Resume"}
                  </span>
                  <span className="badge">{entry.timeLabel}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
