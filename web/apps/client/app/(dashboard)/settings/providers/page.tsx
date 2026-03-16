"use client";

import { useEffect, useState } from "react";
import type { ProviderSummary } from "@relay/contracts";
import { apiFetch } from "../../../../lib/api";

export default function ProviderSettingsPage() {
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  async function loadProviders() {
    try {
      const response = await apiFetch<ProviderSummary[]>("/providers");
      setProviders(response);
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load providers.");
    }
  }

  useEffect(() => {
    loadProviders();
  }, []);

  async function toggleProvider(provider: ProviderSummary) {
    try {
      await apiFetch(`/providers/${provider.id}/config`, {
        method: "PATCH",
        body: JSON.stringify({
          enabled: !provider.enabled,
          priority: provider.priority,
        }),
      });
      await loadProviders();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update provider.");
    }
  }

  return (
    <div className="page-grid">
      <section className="panel">
        <div className="topbar-title">
          <h1>Providers</h1>
          <p>Curated provider state for the Relay account backend.</p>
        </div>
      </section>

      {message ? <div className="message">{message}</div> : null}

      <section className="list">
        {providers.map((provider) => (
          <article className="list-item" key={provider.id}>
            <div className="list-item-main">
              <strong>{provider.displayName}</strong>
              <p>
                {provider.id} · priority {provider.priority} · {provider.health}
              </p>
            </div>
            <div className="actions">
              <span className="badge">{provider.enabled ? "enabled" : "disabled"}</span>
              <button className="button-secondary" onClick={() => toggleProvider(provider)} type="button">
                Toggle
              </button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
