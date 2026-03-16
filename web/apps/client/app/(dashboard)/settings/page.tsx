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
    adultContentVisible: boolean;
    allowedContentClasses: string[];
  };
};

export default function SettingsPage() {
  const [data, setData] = useState<MeResponse | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<MeResponse>("/me")
      .then((response) => {
        setData(response);
        setMessage(null);
      })
      .catch(() => setData(null));
  }, []);

  async function toggleAdultContent() {
    if (!data) {
      return;
    }

    const enabling = !data.preferences.adultContentVisible;
    if (
      enabling &&
      !window.confirm(
        "Enable hentai and JAV providers for this account? Relay will surface adult catalog and playback routes after this change.",
      )
    ) {
      return;
    }

    try {
      const preferences = await apiFetch<MeResponse["preferences"]>("/me/preferences", {
        method: "PATCH",
        body: JSON.stringify({
          adultContentVisible: enabling,
          allowedContentClasses: enabling ? ["anime", "hentai", "jav"] : ["anime"],
        }),
      });
      setData((current) => (current ? { ...current, preferences } : current));
      setMessage(
        enabling
          ? "Adult providers are now visible. Provider enablement stays separate."
          : "Adult providers are hidden again for this account.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to update adult content preferences.",
      );
    }
  }

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
            <div className="list-item">
              <div className="list-item-main">
                <strong>Adult content visibility</strong>
                <p>
                  {data.preferences.adultContentVisible ? "enabled" : "disabled"} · allowed classes{" "}
                  {data.preferences.allowedContentClasses.join(", ")}
                </p>
              </div>
              <button className="button-secondary" onClick={toggleAdultContent} type="button">
                {data.preferences.adultContentVisible ? "Hide Adult Sources" : "Enable Adult Sources"}
              </button>
            </div>
          </div>
        ) : (
          <div className="message">No authenticated session detected.</div>
        )}
      </section>

      {message ? <div className="message">{message}</div> : null}
    </div>
  );
}
