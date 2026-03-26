"use client";

import type { WatchPageContext } from "@relay/contracts";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import { queryKeys } from "../lib/query-keys";
import type { WatchHrefInput } from "../lib/routes";
import { buildWatchContextPath } from "../lib/routes";

export function useWatchContextQuery(payload: WatchHrefInput | null) {
  return useQuery({
    queryKey: queryKeys.watchContext(payload),
    queryFn: () => apiFetch<WatchPageContext>(buildWatchContextPath(payload!)),
    enabled: payload !== null,
  });
}
