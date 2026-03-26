"use client";

import type { LibraryDashboardResponse } from "@relay/contracts";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import { queryKeys } from "../lib/query-keys";

export function useLibraryDashboardQuery() {
  return useQuery({
    queryKey: queryKeys.libraryDashboard(),
    queryFn: () => apiFetch<LibraryDashboardResponse>("/library/dashboard"),
  });
}
