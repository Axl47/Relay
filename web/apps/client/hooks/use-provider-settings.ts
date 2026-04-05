"use client";

import { useMemo, useState } from "react";
import type { ProviderSummary } from "@relay/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import { queryKeys } from "../lib/query-keys";
import { useProvidersQuery } from "./use-providers-query";

export function useProviderSettings(enabled = true) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const providersQuery = useProvidersQuery(enabled);

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
      setMessage("Provider settings updated.");
      await queryClient.invalidateQueries({ queryKey: queryKeys.providers() });
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

    await reorderProviders(provider, swapTarget);
  }

  async function reorderProviders(source: ProviderSummary, target: ProviderSummary) {
    if (source.id === target.id) {
      return;
    }

    await updateProviderMutation.mutateAsync({
      providerId: source.id,
      patch: { priority: target.priority },
    });
    await updateProviderMutation.mutateAsync({
      providerId: target.id,
      patch: { priority: source.priority },
    });
  }

  return {
    message,
    providers,
    providersQuery,
    updateProviderMutation,
    toggleProvider,
    moveProvider,
    reorderProviders,
  };
}
