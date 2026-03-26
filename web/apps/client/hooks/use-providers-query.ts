"use client";

import type { ProviderSummary } from "@relay/contracts";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import { queryKeys } from "../lib/query-keys";

export function useProvidersQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.providers(),
    queryFn: () => apiFetch<ProviderSummary[]>("/providers"),
    enabled,
    retry: false,
  });
}
