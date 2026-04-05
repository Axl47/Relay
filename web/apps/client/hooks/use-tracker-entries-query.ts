"use client";

import type { TrackerEntriesResponse } from "@relay/contracts";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import { queryKeys } from "../lib/query-keys";

export function useTrackerEntriesQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.trackerEntries(),
    queryFn: () => apiFetch<TrackerEntriesResponse>("/trackers/entries"),
    enabled,
    retry: false,
  });
}
