"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ProviderSummary } from "@relay/contracts";
import { apiFetch } from "../../../../lib/api";

function statusTone(status: ProviderSummary["health"]["status"]) {
  if (status === "healthy") {
    return "healthy";
  }

  if (status === "degraded") {
    return "warn";
  }

  return "danger";
}

export default function ProviderSettingsPage() {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);

  const providersQuery = useQuery({
    queryKey: ["providers"],
    queryFn: () => apiFetch<ProviderSummary[]>("/providers"),
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

  if (providersQuery.isLoading) {
    return <div className="message">Loading providers...</div>;
  }

  if (providersQuery.error) {
    return (
      <div className="message">
        {providersQuery.error instanceof Error
          ? providersQuery.error.message
          : "Unable to load providers."}
      </div>
    );
  }

  return (
    <div className="page-grid providers-page">
      <section className="page-heading">
        <h1>Providers</h1>
        <p>Manage enablement, ordering, and health for Relay&apos;s content sources.</p>
      </section>

      <section className="surface">
        <div className="section-header">
          <div>
            <h2>Provider List</h2>
            <p>
              {providers.filter((provider) => provider.enabled).length} enabled,{" "}
              {providers.filter((provider) => !provider.enabled).length} disabled
            </p>
          </div>
        </div>

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
      </section>

      {message ? <div className="message">{message}</div> : null}
    </div>
  );
}
