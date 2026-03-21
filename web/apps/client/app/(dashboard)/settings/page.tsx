"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  MeResponse,
  ProviderSummary,
  UpdateUserPreferencesInput,
  UserPreferences,
} from "@relay/contracts";
import { apiFetch } from "../../../lib/api";

function formatPreferenceLabel(value: string) {
  return value.replace(/-/g, " ");
}

function statusTone(status: ProviderSummary["health"]["status"]) {
  if (status === "healthy") {
    return "healthy";
  }

  if (status === "degraded") {
    return "warn";
  }

  return "danger";
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"general" | "providers">("general");
  const [message, setMessage] = useState<string | null>(null);

  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: () => apiFetch<MeResponse>("/me"),
    retry: false,
  });

  const updatePreferencesMutation = useMutation({
    mutationFn: (patch: UpdateUserPreferencesInput) =>
      apiFetch<UserPreferences>("/me/preferences", {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: async () => {
      setMessage("Settings updated.");
      await queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : "Unable to update settings.");
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

  const providersQuery = useQuery({
    queryKey: ["providers"],
    queryFn: () => apiFetch<ProviderSummary[]>("/providers"),
    enabled: activeTab === "providers",
    retry: false,
  });

  const updateProviderMutation = useMutation({
    mutationFn: ({
      providerId,
      patch,
    }: {
      providerId: string;
      patch: { enabled?: boolean; priority?: number };
    }) =>
      apiFetch(`/providers/${providerId}/config`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: async () => {
      setMessage(null);
      await queryClient.invalidateQueries({ queryKey: ["providers"] });
    },
    onError: (error) => {
      setMessage(error instanceof Error ? error.message : "Unable to update provider.");
    },
  });

  const providers = useMemo(
    () => [...(providersQuery.data ?? [])].sort((left, right) => left.priority - right.priority),
    [providersQuery.data],
  );

  async function updatePreferences(patch: UpdateUserPreferencesInput) {
    setMessage(null);
    await updatePreferencesMutation.mutateAsync(patch);
  }

  async function toggleProvider(provider: ProviderSummary) {
    await updateProviderMutation.mutateAsync({
      providerId: provider.id,
      patch: {
        enabled: !provider.enabled,
        priority: provider.priority,
      },
    });
  }

  async function moveProvider(provider: ProviderSummary, direction: -1 | 1) {
    const index = providers.findIndex((entry) => entry.id === provider.id);
    const swapTarget = providers[index + direction];
    if (!swapTarget) {
      return;
    }

    await updateProviderMutation.mutateAsync({
      providerId: provider.id,
      patch: { priority: swapTarget.priority },
    });
    await updateProviderMutation.mutateAsync({
      providerId: swapTarget.id,
      patch: { priority: provider.priority },
    });
  }

  if (meQuery.isLoading) {
    return <div className="message">Loading settings...</div>;
  }

  const isUnauthenticated =
    meQuery.error instanceof Error &&
    meQuery.error.message.toLowerCase().includes("authentication required");

  if (isUnauthenticated) {
    return (
      <div className="empty-panel">
        <h2>Sign in required</h2>
        <p>Settings are available after you log in or bootstrap the first account.</p>
        <Link className="button" href="/login">
          Open login
        </Link>
      </div>
    );
  }

  if (meQuery.error || !meQuery.data) {
    return (
      <div className="message">
        {meQuery.error instanceof Error ? meQuery.error.message : "Unable to load settings."}
      </div>
    );
  }

  const { user, preferences } = meQuery.data;

  return (
    <div className="page-grid settings-page">
      <section className="page-heading">
        <h1>Settings</h1>
        <p>Playback defaults, appearance preferences, and account controls.</p>
      </section>

      <section className="settings-mobile-tabs" aria-label="Settings sections">
        <button
          aria-pressed={activeTab === "general"}
          className={`button-secondary settings-mobile-tab${activeTab === "general" ? " active" : ""}`}
          onClick={() => setActiveTab("general")}
          type="button"
        >
          General
        </button>
        <button
          aria-pressed={activeTab === "providers"}
          className={`button-secondary settings-mobile-tab${activeTab === "providers" ? " active" : ""}`}
          onClick={() => setActiveTab("providers")}
          type="button"
        >
          Providers
        </button>
      </section>

      {activeTab === "general" ? (
        <section className="settings-grid">
          <article className="surface">
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
          </article>

          <article className="surface">
            <div className="section-header">
              <div>
                <h2>Appearance</h2>
                <p>Dark-first presentation and cover-driven accents.</p>
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
            </div>
          </article>

          <article className="surface">
            <div className="section-header">
              <div>
                <h2>Account</h2>
                <p>Identity and safety controls for this Relay account.</p>
              </div>
            </div>

            <div className="settings-list">
              <div className="settings-row static">
                <span>Username</span>
                <strong>{user.displayName}</strong>
              </div>
              <div className="settings-row static">
                <span>Email</span>
                <strong>{user.email}</strong>
              </div>
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
          </article>

          <article className="surface">
            <div className="section-header">
              <div>
                <h2>About</h2>
                <p>Relay version and lineage.</p>
              </div>
            </div>

            <div className="settings-list">
              <div className="settings-row static">
                <span>Theme preset</span>
                <strong>{formatPreferenceLabel(preferences.theme)}</strong>
              </div>
              <div className="settings-row static">
                <span>Default quality</span>
                <strong>{preferences.preferredQuality}</strong>
              </div>
              <div className="settings-row static">
                <span>Lineage</span>
                <strong>Anikku / Aniyomi / Tachiyomi</strong>
              </div>
            </div>
          </article>
        </section>
      ) : (
        <section className="surface">
          <div className="section-header">
            <div>
              <h2>Providers</h2>
              <p>Manage enablement, ordering, and health for Relay&apos;s content sources.</p>
            </div>
          </div>

          {providersQuery.isLoading ? <div className="message">Loading providers...</div> : null}
          {providersQuery.error ? (
            <div className="message">
              {providersQuery.error instanceof Error
                ? providersQuery.error.message
                : "Unable to load providers."}
            </div>
          ) : null}

          {!providersQuery.isLoading && !providersQuery.error ? (
            <div className="provider-response-list provider-admin-list">
              {providers.map((provider, index) => (
                <article className="provider-admin-row" key={provider.id}>
                  <div className="provider-response-main">
                    <div className="provider-response-header">
                      <span className={`status-dot status-${statusTone(provider.health.status)}`} />
                      <strong>{provider.displayName}</strong>
                      <span className="badge">{provider.contentClass}</span>
                    </div>
                    <p>
                      {provider.enabled ? "Enabled" : "Disabled"} · priority {provider.priority} ·{" "}
                      {provider.executionMode}
                    </p>
                    <p>
                      {provider.health.status} · {provider.health.reason} · checked{" "}
                      {new Date(provider.health.checkedAt).toLocaleString()}
                    </p>
                  </div>

                  <div className="provider-admin-actions">
                    <button
                      className="button-secondary"
                      disabled={index === 0 || updateProviderMutation.isPending}
                      onClick={() => moveProvider(provider, -1)}
                      type="button"
                    >
                      Up
                    </button>
                    <button
                      className="button-secondary"
                      disabled={index === providers.length - 1 || updateProviderMutation.isPending}
                      onClick={() => moveProvider(provider, 1)}
                      type="button"
                    >
                      Down
                    </button>
                    <button
                      className="button-secondary"
                      disabled={updateProviderMutation.isPending}
                      onClick={() => toggleProvider(provider)}
                      type="button"
                    >
                      {provider.enabled ? "Disable" : "Enable"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </section>
      )}

      {message ? <div className="message">{message}</div> : null}
    </div>
  );
}
