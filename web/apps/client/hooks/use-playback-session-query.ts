"use client";

import { useEffect, useState } from "react";
import type { PlaybackSession } from "@relay/contracts";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import { queryKeys } from "../lib/query-keys";
import type { WatchHrefInput } from "../lib/routes";

export function usePlaybackSessionQuery(payload: WatchHrefInput | null) {
  const [shouldPollSession, setShouldPollSession] = useState(false);

  const createQuery = useQuery({
    queryKey: queryKeys.playbackSessionCreate(payload),
    queryFn: () =>
      apiFetch<PlaybackSession>("/playback/sessions", {
        method: "POST",
        body: JSON.stringify({
          libraryItemId: payload!.libraryItemId ?? null,
          providerId: payload!.providerId,
          externalAnimeId: payload!.externalAnimeId,
          externalEpisodeId: payload!.externalEpisodeId,
        }),
      }),
    enabled: payload !== null,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });

  const pollQuery = useQuery({
    queryKey: queryKeys.playbackSessionPoll(createQuery.data?.id),
    queryFn: () => apiFetch<PlaybackSession>(`/playback/sessions/${createQuery.data!.id}`),
    enabled: shouldPollSession && Boolean(createQuery.data?.id),
    refetchInterval: 2_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });

  useEffect(() => {
    setShouldPollSession(false);
  }, [payload?.externalAnimeId, payload?.externalEpisodeId, payload?.libraryItemId, payload?.providerId]);

  useEffect(() => {
    if (createQuery.data?.status === "resolving") {
      setShouldPollSession(true);
      return;
    }

    if (createQuery.data) {
      setShouldPollSession(false);
    }
  }, [createQuery.data]);

  useEffect(() => {
    if (
      pollQuery.data?.status === "ready" ||
      pollQuery.data?.status === "failed" ||
      pollQuery.data?.status === "expired"
    ) {
      setShouldPollSession(false);
    }
  }, [pollQuery.data]);

  return {
    createQuery,
    pollQuery,
    session: pollQuery.data ?? createQuery.data ?? null,
  };
}
