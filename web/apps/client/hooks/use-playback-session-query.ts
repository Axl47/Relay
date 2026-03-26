"use client";

import { useEffect, useState } from "react";
import type { PlaybackSession } from "@relay/contracts";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import { queryKeys } from "../lib/query-keys";
import type { WatchHrefInput } from "../lib/routes";

const PLAYBACK_SESSION_REFRESH_GRACE_MS = 1_000;

export function getPlaybackSessionRefreshDelayMs(
  expiresAt: string | null | undefined,
  nowMs = Date.now(),
) {
  if (!expiresAt) {
    return null;
  }

  const expiresAtMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresAtMs)) {
    return null;
  }

  return Math.max(PLAYBACK_SESSION_REFRESH_GRACE_MS, expiresAtMs - nowMs + PLAYBACK_SESSION_REFRESH_GRACE_MS);
}

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

  const session = pollQuery.data ?? createQuery.data ?? null;

  useEffect(() => {
    if (!payload || !session || session.status === "failed") {
      return;
    }

    const refreshDelayMs = getPlaybackSessionRefreshDelayMs(session.expiresAt);
    if (refreshDelayMs === null) {
      return;
    }

    const refreshTimer = window.setTimeout(() => {
      void createQuery.refetch();
    }, refreshDelayMs);

    return () => {
      window.clearTimeout(refreshTimer);
    };
  }, [createQuery, payload, session]);

  return {
    createQuery,
    pollQuery,
    session,
  };
}
