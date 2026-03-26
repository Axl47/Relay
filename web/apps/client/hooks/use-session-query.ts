"use client";

import type { MeResponse } from "@relay/contracts";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import { queryKeys } from "../lib/query-keys";

export function useSessionQuery() {
  return useQuery({
    queryKey: queryKeys.me(),
    queryFn: () => apiFetch<MeResponse>("/me"),
    retry: false,
  });
}
