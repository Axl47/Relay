"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  TrackerId,
  UpdateUserPreferencesInput,
  UserPreferences,
} from "@relay/contracts";
import { apiFetch, isAdminAccessError } from "../../../lib/api";
import { AuthRequiredState } from "../../../components/auth-required-state";
import { queryKeys } from "../../../lib/query-keys";
import { useImportsQuery } from "../../../hooks/use-imports-query";
import { useLibraryIndexQuery } from "../../../hooks/use-library-index-query";
import { useRouteAccess } from "../../../hooks/use-route-access";
import { useTrackerEntriesQuery } from "../../../hooks/use-tracker-entries-query";

const TRACKERS: Array<{ id: TrackerId; label: string }> = [
  { id: "anilist", label: "AniList" },
  { id: "mal", label: "MyAnimeList" },
];

function formatPreferenceLabel(value: string) {
  return value.replace(/-/g, " ");
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const access = useRouteAccess();
  const [message, setMessage] = useState<string | null>(null);

  const libraryQuery = useLibraryIndexQuery(access.isAuthenticated);
  const trackerEntriesQuery = useTrackerEntriesQuery(access.isAuthenticated);
  const importsQuery = useImportsQuery(access.isAuthenticated);

  const updatePreferencesMutation = useMutation({
    mutationFn: (patch: UpdateUserPreferencesInput) =>
      apiFetch<UserPreferences>("/me/preferences", {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: async () => {
      setMessage("Account preferences updated.");
      await queryClient.invalidateQueries({ queryKey: queryKeys.me() });
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : "Unable to update account settings.");
    },
  });

  const trackerConnectMutation = useMutation({
    mutationFn: (trackerId: TrackerId) =>
      apiFetch(`/trackers/${trackerId}/connect`, {
        method: "POST",
      }),
    onSuccess: async () => {
      setMessage("Tracker connection updated.");
      await queryClient.invalidateQueries({ queryKey: queryKeys.trackerEntries() });
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : "Unable to connect tracker.");
    },
  });

  const trackerDisconnectMutation = useMutation({
    mutationFn: (trackerId: TrackerId) =>
      apiFetch(`/trackers/${trackerId}/connect`, {
        method: "DELETE",
      }),
    onSuccess: async () => {
      setMessage("Tracker disconnected.");
      await queryClient.invalidateQueries({ queryKey: queryKeys.trackerEntries() });
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : "Unable to disconnect tracker.");
    },
  });

  const importMutation = useMutation({
    mutationFn: () =>
      apiFetch("/imports/android-backup", {
        method: "POST",
      }),
    onSuccess: async () => {
      setMessage("Android backup import job queued.");
      await queryClient.invalidateQueries({ queryKey: queryKeys.imports() });
    },
    onError: (error) => {
      if (isAdminAccessError(error)) {
        setMessage("Only admin accounts can queue Android backup imports.");
        return;
      }
      setMessage(error instanceof Error ? error.message : "Unable to queue import job.");
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () =>
      apiFetch("/auth/logout", {
        method: "POST",
      }),
    onSuccess: () => {
      window.location.href = "/login";
    },
  });

  const trackerEntries = trackerEntriesQuery.data;
  const trackerTitles = useMemo(() => {
    const titleByLibraryItemId = new Map(
      (libraryQuery.data?.items ?? []).map((item) => [item.id, item.title]),
    );

    return [...(trackerEntries?.entries ?? [])]
      .sort((left, right) => new Date(right.updatedAt).valueOf() - new Date(left.updatedAt).valueOf())
      .slice(0, 6)
      .map((entry) => ({
        ...entry,
        title: titleByLibraryItemId.get(entry.libraryItemId) ?? "Tracked library item",
      }));
  }, [libraryQuery.data?.items, trackerEntries?.entries]);

  async function updatePreferences(patch: UpdateUserPreferencesInput) {
    setMessage(null);
    await updatePreferencesMutation.mutateAsync(patch);
  }

  if (access.isLoading) {
    return <div className="message">Loading account…</div>;
  }

  if (access.isUnauthenticated) {
    return (
      <AuthRequiredState
        description="Sign in to control playback defaults, connect trackers, review imports, and manage your Relay account."
        title="Account access lives behind sign-in"
      />
    );
  }

  if (access.error || !access.session) {
    return (
      <div className="message">
        {access.error instanceof Error ? access.error.message : "Unable to load account."}
      </div>
    );
  }

  const { user, preferences } = access.session;
  const connectedTrackerIds = new Set(trackerEntries?.accounts.map((account) => account.trackerId));

  return (
    <div className="page-grid account-page">
      <section className="page-heading page-heading-row">
        <div>
          <span className="eyebrow">Account</span>
          <h1>{user.displayName}</h1>
          <p>Control how Relay plays, what it reveals, and which external systems it should keep in sync.</p>
        </div>
        <div className="page-heading-meta">
          <span className="badge">{user.isAdmin ? "Admin" : "Member"}</span>
          <span className="badge">{user.email}</span>
        </div>
      </section>

      <div className="account-sections">
        <section className="surface account-section">
          <div className="section-header">
            <div>
              <h2>Playback</h2>
              <p>Defaults applied when a new watch session starts.</p>
            </div>
          </div>

          <div className="settings-list">
            <label className="settings-row">
              <span>Autoplay next episode</span>
              <input
                checked={preferences.autoplayNextEpisode}
                onChange={(event) => updatePreferences({ autoplayNextEpisode: event.target.checked })}
                type="checkbox"
              />
            </label>

            <label className="settings-row">
              <span>Autoplay countdown</span>
              <select
                onChange={(event) =>
                  updatePreferences({ autoplayCountdownSeconds: Number(event.target.value) })
                }
                value={preferences.autoplayCountdownSeconds}
              >
                <option value={0}>Off</option>
                <option value={5}>5 seconds</option>
                <option value={10}>10 seconds</option>
                <option value={15}>15 seconds</option>
              </select>
            </label>

            <label className="settings-row">
              <span>Subtitle language</span>
              <select
                onChange={(event) =>
                  updatePreferences({ preferredSubtitleLanguage: event.target.value })
                }
                value={preferences.preferredSubtitleLanguage}
              >
                <option value="en">English</option>
                <option value="es">Spanish</option>
                <option value="ja">Japanese</option>
                <option value="und">Auto</option>
              </select>
            </label>

            <label className="settings-row">
              <span>Audio normalization</span>
              <select
                onChange={(event) =>
                  updatePreferences({
                    audioNormalization: event.target.value as UserPreferences["audioNormalization"],
                  })
                }
                value={preferences.audioNormalization}
              >
                <option value="off">Off</option>
                <option value="light">Light</option>
                <option value="strong">Strong</option>
              </select>
            </label>

            <label className="settings-row">
              <span>Progress save interval</span>
              <select
                onChange={(event) =>
                  updatePreferences({ progressSaveIntervalSeconds: Number(event.target.value) })
                }
                value={preferences.progressSaveIntervalSeconds}
              >
                <option value={10}>10 seconds</option>
                <option value={15}>15 seconds</option>
                <option value={30}>30 seconds</option>
              </select>
            </label>
          </div>
        </section>

        <section className="surface account-section">
          <div className="section-header">
            <div>
              <h2>Appearance</h2>
              <p>What Relay surfaces by default and how much cover-led theming it uses.</p>
            </div>
          </div>

          <div className="settings-list">
            <label className="settings-row">
              <span>Theme</span>
              <select
                onChange={(event) =>
                  updatePreferences({ theme: event.target.value as UserPreferences["theme"] })
                }
                value={preferences.theme}
              >
                <option value="relay-dark">Relay Dark</option>
              </select>
            </label>

            <label className="settings-row">
              <span>Cover-based theming</span>
              <input
                checked={preferences.coverBasedTheming}
                onChange={(event) =>
                  updatePreferences({ coverBasedTheming: event.target.checked })
                }
                type="checkbox"
              />
            </label>

            <label className="settings-row">
              <span>Adult content visibility</span>
              <input
                checked={preferences.adultContentVisible}
                onChange={(event) =>
                  updatePreferences({
                    adultContentVisible: event.target.checked,
                    allowedContentClasses: event.target.checked
                      ? ["anime", "hentai", "jav"]
                      : ["anime"],
                  })
                }
                type="checkbox"
              />
            </label>

            <div className="settings-row static">
              <span>Current theme preset</span>
              <strong>{formatPreferenceLabel(preferences.theme)}</strong>
            </div>
          </div>
        </section>

        <section className="surface account-section">
          <div className="section-header">
            <div>
              <h2>Integrations</h2>
              <p>Connect trackers and review the Relay sources used by this account.</p>
            </div>
          </div>

          <div className="stack-list">
            <Link className="inline-card" href="/settings/providers">
              <div>
                <strong>Sources</strong>
                <p>Reorder providers, check health, and manage enablement.</p>
              </div>
              <span className="inline-card-action">Open</span>
            </Link>

            {TRACKERS.map((tracker) => {
              const connected = connectedTrackerIds.has(tracker.id);
              const account = trackerEntries?.accounts.find((entry) => entry.trackerId === tracker.id);
              return (
                <article className="inline-card" key={tracker.id}>
                  <div>
                    <strong>{tracker.label}</strong>
                    <p>{connected ? `${account?.status ?? "connected"} connection` : "Not connected"}</p>
                  </div>
                  <div className="actions">
                    {connected ? (
                      <button
                        className="button-secondary"
                        disabled={trackerDisconnectMutation.isPending}
                        onClick={() => trackerDisconnectMutation.mutate(tracker.id)}
                        type="button"
                      >
                        Disconnect
                      </button>
                    ) : (
                      <button
                        className="button-secondary"
                        disabled={trackerConnectMutation.isPending}
                        onClick={() => trackerConnectMutation.mutate(tracker.id)}
                        type="button"
                      >
                        Connect
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>

          <div className="subsection">
            <div className="subsection-header">
              <h3>Recent tracked items</h3>
              <p>Joined client-side against the current library inventory.</p>
            </div>

            {trackerEntriesQuery.isLoading ? (
              <div className="message">Loading tracker entries…</div>
            ) : trackerEntriesQuery.error ? (
              <div className="message">
                {trackerEntriesQuery.error instanceof Error
                  ? trackerEntriesQuery.error.message
                  : "Unable to load tracker entries."}
              </div>
            ) : trackerTitles.length > 0 ? (
              <div className="stack-list compact">
                {trackerTitles.map((entry) => (
                  <article className="inline-card" key={entry.id}>
                    <div>
                      <strong>{entry.title}</strong>
                      <p>
                        {entry.status} · progress {entry.progress}
                        {entry.score !== null ? ` · score ${entry.score}` : ""}
                      </p>
                    </div>
                    <span className="badge">{new Date(entry.updatedAt).toLocaleDateString()}</span>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-inline-state">
                <p>No tracker entries have been synced into Relay yet.</p>
              </div>
            )}
          </div>
        </section>

        <section className="surface account-section">
          <div className="section-header">
            <div>
              <h2>Data</h2>
              <p>Review imports and bootstrap larger library migrations when admin access is available.</p>
            </div>
          </div>

          <div className="actions">
            <button
              className="button"
              disabled={importMutation.isPending || !user.isAdmin}
              onClick={() => importMutation.mutate()}
              type="button"
            >
              {importMutation.isPending ? "Queueing import..." : "Import Android backup"}
            </button>
            {!user.isAdmin ? (
              <span className="support-copy">Only admin accounts can queue imports.</span>
            ) : null}
          </div>

          <div className="subsection">
            <div className="subsection-header">
              <h3>Recent import jobs</h3>
              <p>These jobs are scoped to the current Relay account.</p>
            </div>

            {importsQuery.isLoading ? (
              <div className="message">Loading imports…</div>
            ) : importsQuery.error ? (
              <div className="message">
                {importsQuery.error instanceof Error
                  ? importsQuery.error.message
                  : "Unable to load import jobs."}
              </div>
            ) : importsQuery.data?.jobs.length ? (
              <div className="stack-list compact">
                {importsQuery.data.jobs.map((job) => (
                  <article className="inline-card" key={job.id}>
                    <div>
                      <strong>{job.source}</strong>
                      <p>{job.status}</p>
                    </div>
                    <span className="badge">{new Date(job.updatedAt).toLocaleString()}</span>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-inline-state">
                <p>No import jobs have been started for this account yet.</p>
              </div>
            )}
          </div>
        </section>

        <section className="surface account-section">
          <div className="section-header">
            <div>
              <h2>Session</h2>
              <p>Identity and access information for the current Relay user.</p>
            </div>
          </div>

          <div className="settings-list">
            <div className="settings-row static">
              <span>Display name</span>
              <strong>{user.displayName}</strong>
            </div>
            <div className="settings-row static">
              <span>Email</span>
              <strong>{user.email}</strong>
            </div>
            <div className="settings-row static">
              <span>Role</span>
              <strong>{user.isAdmin ? "Admin" : "Member"}</strong>
            </div>
          </div>

          <div className="actions">
            <button
              className="button-secondary"
              disabled={logoutMutation.isPending}
              onClick={() => logoutMutation.mutate()}
              type="button"
            >
              {logoutMutation.isPending ? "Logging out..." : "Logout"}
            </button>
          </div>
        </section>
      </div>

      {message ? <div className="message">{message}</div> : null}
    </div>
  );
}
