"use client";

import { useEffect, useState } from "react";
import type { HistoryEntry } from "@relay/contracts";
import { apiFetch } from "../../../lib/api";

export default function HistoryPage() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<HistoryEntry[]>("/history")
      .then(setEntries)
      .catch((caught) =>
        setError(caught instanceof Error ? caught.message : "Unable to load history."),
      );
  }, []);

  return (
    <div className="page-grid">
      <section className="panel">
        <div className="topbar-title">
          <h1>History</h1>
          <p>Latest watch events captured by the playback session pipeline.</p>
        </div>
      </section>

      {error ? <div className="message">{error}</div> : null}

      <section className="list">
        {entries.map((entry) => (
          <article className="list-item" key={entry.id}>
            <div className="list-item-main">
              <strong>{entry.animeTitle}</strong>
              <p>
                {entry.episodeTitle} · {entry.completed ? "completed" : `${entry.positionSeconds}s`}
              </p>
            </div>
            <span className="badge">{new Date(entry.watchedAt).toLocaleString()}</span>
          </article>
        ))}
      </section>
    </div>
  );
}
