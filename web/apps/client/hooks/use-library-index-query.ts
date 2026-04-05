"use client";

import type { LibraryItemWithCategories } from "@relay/contracts";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import { queryKeys } from "../lib/query-keys";

export type LibraryIndexResponse = {
  items: LibraryItemWithCategories[];
};

export function useLibraryIndexQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.libraryIndex(),
    queryFn: () => apiFetch<LibraryIndexResponse>("/library"),
    enabled,
    retry: false,
  });
}
