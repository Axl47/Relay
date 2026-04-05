"use client";

import type { ImportJobsResponse } from "@relay/contracts";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import { queryKeys } from "../lib/query-keys";

export function useImportsQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.imports(),
    queryFn: () => apiFetch<ImportJobsResponse>("/imports"),
    enabled,
    retry: false,
  });
}
