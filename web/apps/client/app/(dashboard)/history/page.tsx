"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { GroupedHistoryResponse } from "@relay/contracts";
import { apiFetch } from "../../../lib/api";
import { FALLBACK_COVER } from "../../../lib/fallback-cover";
import { resolveMediaUrl } from "../../../lib/media";

function buildWatchHref(entry: GroupedHistoryResponse["groups"][number]["entries"][number]) {
  return `/watch/${encodeURIComponent(entry.libraryItemId ?? "direct")}/${encodeURIComponent(entry.externalEpisodeId)}?providerId=${encodeURIComponent(entry.providerId)}&externalAnimeId=${encodeURIComponent(entry.externalAnimeId)}`;
}

export default function HistoryPage() {
  const historyQuery = useQuery({
    queryKey: ["grouped-history"],
    queryFn: () => apiFetch<GroupedHistoryResponse>("/history/grouped"),
  });

  if (historyQuery.isLoading) {
    return <div className="message">Loading history...</div>;
  }

  if (historyQuery.error) {
    return (
      <div className="message">
        {historyQuery.error instanceof Error
          ? historyQuery.error.message
          : "Unable to load history."}
      </div>
    );
  }

  const groups = historyQuery.data?.groups ?? [];
  if (groups.length === 0) {
    return (
      <div className="empty-panel">
        <h1>Nothing watched yet</h1>
        <p>Playback activity will appear here once you start watching.</p>
      </div>
    );
  }

  return (
    <div className="page-grid history-page">
      <section className="page-heading">
        <h1>History</h1>
        <p>A chronological log of what you watched and where you left off.</p>
      </section>

      {groups.map((group) => (
        <section className="surface history-group" key={group.key}>
          <div className="section-header">
            <div>
              <h2>{group.label}</h2>
              <p>{group.entries.length} entries</p>
            </div>
          </div>

          <div className="list">
            {group.entries.map((entry) => (
              <Link className="history-row" href={buildWatchHref(entry)} key={entry.id}>
                <div className="history-row-media">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt={entry.animeTitle}
                    className="history-thumb"
                    src={entry.coverImage ? resolveMediaUrl(entry.coverImage) : FALLBACK_COVER}
                  />
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
                <span className="badge">{entry.timeLabel}</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
