"use client";

import type { GroupedHistoryResponse } from "@relay/contracts";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import { queryKeys } from "../lib/query-keys";

export function useGroupedHistoryQuery() {
  return useQuery({
    queryKey: queryKeys.groupedHistory(),
    queryFn: () => apiFetch<GroupedHistoryResponse>("/history/grouped"),
  });
}
