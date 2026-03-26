"use client";

import type { ProviderSummary } from "@relay/contracts";
import { statusTone } from "../lib/provider-status";

type Props = {
  providers: ProviderSummary[];
  isPending: boolean;
  onMoveProvider: (provider: ProviderSummary, direction: -1 | 1) => void | Promise<void>;
  onToggleProvider: (provider: ProviderSummary) => void | Promise<void>;
};

export function ProviderSettingsPanel({
  providers,
  isPending,
  onMoveProvider,
  onToggleProvider,
}: Props) {
  return (
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
              disabled={index === 0 || isPending}
              onClick={() => void onMoveProvider(provider, -1)}
              type="button"
            >
              Up
            </button>
            <button
              className="button-secondary"
              disabled={index === providers.length - 1 || isPending}
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
      ))}
    </div>
  );
}
