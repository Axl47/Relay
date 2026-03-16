"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api";

type MeResponse = {
  user: {
    email: string;
    displayName: string;
    isAdmin: boolean;
  };
  preferences: {
    libraryLayoutMode: string;
    librarySortMode: string;
    autoplayNextEpisode: boolean;
    watchedThresholdPercent: number;
  };
};

export default function SettingsPage() {
  const [data, setData] = useState<MeResponse | null>(null);

  useEffect(() => {
    apiFetch<MeResponse>("/me").then(setData).catch(() => setData(null));
  }, []);

  return (
    <div className="page-grid">
      <section className="panel">
        <div className="topbar-title">
          <h1>Settings</h1>
          <p>Current account and cross-platform preference defaults.</p>
        </div>
      </section>

      <section className="panel">
        <h2>Account</h2>
        {data ? (
          <div className="list">
            <div className="list-item">
              <div className="list-item-main">
                <strong>{data.user.displayName}</strong>
                <p>{data.user.email}</p>
              </div>
              <span className="badge">{data.user.isAdmin ? "admin" : "member"}</span>
            </div>
          </div>
        ) : (
          <div className="message">Log in to inspect account settings.</div>
        )}
      </section>

      <section className="panel">
        <h2>Defaults</h2>
        {data ? (
          <div className="list">
            <div className="list-item">
              <div className="list-item-main">
                <strong>Library layout</strong>
                <p>{data.preferences.libraryLayoutMode}</p>
              </div>
            </div>
            <div className="list-item">
              <div className="list-item-main">
                <strong>Library sort</strong>
                <p>{data.preferences.librarySortMode}</p>
              </div>
            </div>
            <div className="list-item">
              <div className="list-item-main">
                <strong>Autoplay next episode</strong>
                <p>{data.preferences.autoplayNextEpisode ? "enabled" : "disabled"}</p>
              </div>
            </div>
            <div className="list-item">
              <div className="list-item-main">
                <strong>Watched threshold</strong>
                <p>{data.preferences.watchedThresholdPercent}%</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="message">No authenticated session detected.</div>
        )}
      </section>
    </div>
  );
}
