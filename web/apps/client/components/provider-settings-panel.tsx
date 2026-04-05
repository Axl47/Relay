"use client";

import { useMemo, useState } from "react";
import type { ProviderSummary } from "@relay/contracts";
import { statusTone } from "../lib/provider-status";

type Props = {
  providers: ProviderSummary[];
  isPending: boolean;
  onMoveProvider: (provider: ProviderSummary, direction: -1 | 1) => void | Promise<void>;
  onReorderProviders: (
    source: ProviderSummary,
    target: ProviderSummary,
  ) => void | Promise<void>;
  onToggleProvider: (provider: ProviderSummary) => void | Promise<void>;
};

export function ProviderSettingsPanel({
  providers,
  isPending,
  onMoveProvider,
  onReorderProviders,
  onToggleProvider,
}: Props) {
  const [draggingProviderId, setDraggingProviderId] = useState<string | null>(null);
  const groupedProviders = useMemo(
    () => ({
      enabled: providers.filter((provider) => provider.enabled),
      disabled: providers.filter((provider) => !provider.enabled),
    }),
    [providers],
  );

  function renderProviderRow(provider: ProviderSummary, index: number, group: ProviderSummary[]) {
    const draggingProvider = draggingProviderId
      ? providers.find((entry) => entry.id === draggingProviderId) ?? null
      : null;

    return (
      <article
        className={`provider-admin-row${draggingProviderId === provider.id ? " dragging" : ""}`}
        draggable={!isPending}
        key={provider.id}
        onDragEnd={() => setDraggingProviderId(null)}
        onDragOver={(event) => {
          if (!draggingProviderId || draggingProviderId === provider.id) {
            return;
          }
          event.preventDefault();
        }}
        onDragStart={() => setDraggingProviderId(provider.id)}
        onDrop={() => {
          if (!draggingProvider || draggingProvider.id === provider.id) {
            return;
          }
          void onReorderProviders(draggingProvider, provider);
          setDraggingProviderId(null);
        }}
      >
        <div className="provider-admin-main">
          <button
            aria-label={`Reorder ${provider.displayName}`}
            className="provider-drag-handle"
            type="button"
          >
            <span />
            <span />
            <span />
          </button>

          <div className="provider-response-main">
            <div className="provider-response-header">
              <span className={`status-dot status-${statusTone(provider.health.status)}`} />
              <strong>{provider.displayName}</strong>
              <span className="badge">{provider.contentClass}</span>
              {provider.requiresAdultGate ? <span className="badge">Adult gate</span> : null}
              {provider.supportsTrackerSync ? <span className="badge">Tracker sync</span> : null}
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
        </div>

        <div className="provider-admin-actions">
          <button
            className="button-secondary"
            disabled={index === 0 || isPending}
            onClick={() => void onMoveProvider(provider, -1)}
            type="button"
          >
            Up
          </button>
          <button
            className="button-secondary"
            disabled={index === group.length - 1 || isPending}
            onClick={() => void onMoveProvider(provider, 1)}
            type="button"
          >
            Down
          </button>
          <button
            className="button-secondary"
            disabled={isPending}
            onClick={() => void onToggleProvider(provider)}
            type="button"
          >
            {provider.enabled ? "Disable" : "Enable"}
          </button>
        </div>
      </article>
    );
  }

  return (
    <div className="sources-groups">
      <section className="provider-group">
        <div className="provider-group-heading">
          <h3>Enabled</h3>
          <p>These providers participate in search and playback for the current account.</p>
        </div>
        <div className="provider-response-list provider-admin-list">
          {groupedProviders.enabled.map((provider, index) =>
            renderProviderRow(provider, index, groupedProviders.enabled),
          )}
        </div>
      </section>

      <section className="provider-group">
        <div className="provider-group-heading">
          <h3>Disabled</h3>
          <p>Keep sources available for later without sending them into active searches.</p>
        </div>
        <div className="provider-response-list provider-admin-list">
          {groupedProviders.disabled.map((provider, index) =>
            renderProviderRow(provider, index, groupedProviders.disabled),
          )}
        </div>
      </section>
    </div>
  );
}
