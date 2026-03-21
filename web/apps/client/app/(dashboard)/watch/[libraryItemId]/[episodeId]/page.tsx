"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { LibraryItemWithCategories, MeResponse, PlaybackSession, WatchPageContext } from "@relay/contracts";
import { VideoPlayer } from "../../../../../components/video-player";
import { apiFetch } from "../../../../../lib/api";

type LibraryResponse = {
  items: LibraryItemWithCategories[];
};

type PlaybackPayload = {
  libraryItemId: string | null;
  providerId: string;
  externalAnimeId: string;
  externalEpisodeId: string;
};

function decodeRouteParam(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isUuid(value: string | null | undefined): value is string {
  if (!value) {
    return false;
  }

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function buildWatchHref(payload: PlaybackPayload, nextEpisodeId: string) {
  return `/watch/${encodeURIComponent(payload.libraryItemId ?? "direct")}/${encodeURIComponent(nextEpisodeId)}?providerId=${encodeURIComponent(payload.providerId)}&externalAnimeId=${encodeURIComponent(payload.externalAnimeId)}`;
}

export default function WatchPage() {
  const routeParams = useParams<{ libraryItemId: string; episodeId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [autoplayCountdown, setAutoplayCountdown] = useState<number | null>(null);
  const [autoplayActive, setAutoplayActive] = useState(false);
  const [shouldPollSession, setShouldPollSession] = useState(false);

  const resolvedParams = useMemo(
    () => ({
      libraryItemId: decodeRouteParam(routeParams.libraryItemId),
      episodeId: decodeRouteParam(routeParams.episodeId),
    }),
    [routeParams.episodeId, routeParams.libraryItemId],
  );

  const libraryQuery = useQuery({
    queryKey: ["library-index"],
    queryFn: () => apiFetch<LibraryResponse>("/library"),
    enabled:
      !searchParams.get("providerId") ||
      !searchParams.get("externalAnimeId") ||
      !isUuid(resolvedParams.libraryItemId),
  });

  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: () => apiFetch<MeResponse>("/me"),
  });

  const payload = useMemo<PlaybackPayload | null>(() => {
    const providerId = searchParams.get("providerId");
    const externalAnimeId = searchParams.get("externalAnimeId");
    const libraryItemId = isUuid(resolvedParams.libraryItemId) ? resolvedParams.libraryItemId : null;

    if (providerId && externalAnimeId) {
      return {
        libraryItemId,
        providerId,
        externalAnimeId,
        externalEpisodeId: resolvedParams.episodeId,
      };
    }

    if (!libraryItemId) {
      return null;
    }

    const libraryItem = libraryQuery.data?.items.find((item) => item.id === libraryItemId);
    if (!libraryItem) {
      return null;
    }

    return {
      libraryItemId,
      providerId: libraryItem.providerId,
      externalAnimeId: libraryItem.externalAnimeId,
      externalEpisodeId: resolvedParams.episodeId,
    };
  }, [libraryQuery.data?.items, resolvedParams, searchParams]);

  const contextQuery = useQuery({
    queryKey: ["watch-context", payload],
    queryFn: () =>
      apiFetch<WatchPageContext>(
        `/watch/context?providerId=${encodeURIComponent(payload!.providerId)}&externalAnimeId=${encodeURIComponent(payload!.externalAnimeId)}&externalEpisodeId=${encodeURIComponent(payload!.externalEpisodeId)}${payload!.libraryItemId ? `&libraryItemId=${encodeURIComponent(payload!.libraryItemId)}` : ""}`,
      ),
    enabled: payload !== null,
  });

  const sessionCreateQuery = useQuery({
    queryKey: ["playback-session-create", payload],
    queryFn: () =>
      apiFetch<PlaybackSession>("/playback/sessions", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    enabled: payload !== null,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });

  const sessionPollQuery = useQuery({
    queryKey: ["playback-session-poll", sessionCreateQuery.data?.id],
    queryFn: () => apiFetch<PlaybackSession>(`/playback/sessions/${sessionCreateQuery.data!.id}`),
    enabled: shouldPollSession && Boolean(sessionCreateQuery.data?.id),
    refetchInterval: 2_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });

  const session = sessionPollQuery.data ?? sessionCreateQuery.data ?? null;
  const context = contextQuery.data ?? null;
  const canPlay = session?.status === "ready" && Boolean(session.streamUrl);
  const autoplaySeconds =
    meQuery.data?.preferences.autoplayNextEpisode === false
      ? 0
      : meQuery.data?.preferences.autoplayCountdownSeconds ?? 15;

  useEffect(() => {
    setAutoplayActive(false);
    setAutoplayCountdown(null);
    setShouldPollSession(false);
  }, [payload?.externalEpisodeId, payload?.externalAnimeId, payload?.libraryItemId, payload?.providerId]);

  useEffect(() => {
    if (sessionCreateQuery.data?.status === "resolving") {
      setShouldPollSession(true);
      return;
    }

    if (sessionCreateQuery.data) {
      setShouldPollSession(false);
    }
  }, [sessionCreateQuery.data]);

  useEffect(() => {
    if (
      sessionPollQuery.data?.status === "ready" ||
      sessionPollQuery.data?.status === "failed" ||
      sessionPollQuery.data?.status === "expired"
    ) {
      setShouldPollSession(false);
    }
  }, [sessionPollQuery.data]);

  useEffect(() => {
    if (!autoplayActive || autoplayCountdown === null) {
      return;
    }

    if (autoplayCountdown <= 0 && context?.nextEpisode && payload) {
      router.push(buildWatchHref(payload, context.nextEpisode.externalEpisodeId));
      return;
    }

    const timeout = window.setTimeout(() => {
      setAutoplayCountdown((current) => (current === null ? current : current - 1));
    }, 1_000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [autoplayActive, autoplayCountdown, context?.nextEpisode, payload, router]);

  function openNextEpisode(nextEpisodeId: string) {
    if (!payload) {
      return;
    }

    router.push(buildWatchHref(payload, nextEpisodeId));
  }

  function handlePlaybackEnded() {
    if (!context?.nextEpisode || autoplaySeconds <= 0) {
      return;
    }

    setAutoplayActive(true);
    setAutoplayCountdown(autoplaySeconds);
  }

  if (!payload && libraryQuery.isLoading) {
    return <div className="message">Preparing playback context...</div>;
  }

  if (!payload) {
    return <div className="message">Missing provider context. Open this episode from Library or Detail.</div>;
  }

  if (contextQuery.isLoading || sessionCreateQuery.isLoading) {
    return <div className="message">Preparing playback context...</div>;
  }

  if (contextQuery.error) {
    return (
      <div className="message">
        {contextQuery.error instanceof Error
          ? contextQuery.error.message
          : "Unable to load watch context."}
      </div>
    );
  }

  if (sessionCreateQuery.error) {
    return (
      <div className="message">
        {sessionCreateQuery.error instanceof Error
          ? sessionCreateQuery.error.message
          : "Unable to create playback session."}
      </div>
    );
  }

  if (!context) {
    return <div className="message">Missing watch context.</div>;
  }

  const currentEpisodeIndex = context.episodes.findIndex(
    (episode) => episode.externalEpisodeId === context.currentEpisode.externalEpisodeId,
  );
  const previousEpisode = currentEpisodeIndex > 0 ? context.episodes[currentEpisodeIndex - 1] : null;

  return (
    <div className="page-grid watch-page">
      <div className="watch-layout">
        <section className="watch-main">
          <div className="watch-topline">
            <Link
              className="watch-backlink"
              href={`/anime/${encodeURIComponent(context.anime.providerId)}/${encodeURIComponent(context.anime.externalAnimeId)}`}
            >
              &larr; {context.anime.title}
            </Link>
            <span className="badge">Episode {context.currentEpisode.number}</span>
          </div>

          {session?.status === "failed" ? (
            <div className="message">{session.error ?? "Playback resolution failed."}</div>
          ) : session?.status === "expired" ? (
            <div className="message">Playback session expired. Reload the page to create a new one.</div>
          ) : null}

          <div className="watch-player-shell">
            {canPlay && session ? (
              <VideoPlayer
                onEnded={handlePlaybackEnded}
                onNextEpisode={
                  context.nextEpisode ? () => openNextEpisode(context.nextEpisode!.externalEpisodeId) : undefined
                }
                onPreviousEpisode={
                  previousEpisode ? () => openNextEpisode(previousEpisode.externalEpisodeId) : undefined
                }
                progressIntervalSeconds={meQuery.data?.preferences.progressSaveIntervalSeconds}
                session={session}
              />
            ) : session?.status === "resolving" ? (
              <div className="surface watch-status">
                <strong>Resolving stream...</strong>
                <p>Trying provider playback options for this episode.</p>
              </div>
            ) : (
              <div className="surface watch-status">
                <strong>Preparing playback</strong>
                <p>Relay is building the playback session for this episode.</p>
              </div>
            )}

            {autoplayActive && context.nextEpisode ? (
              <div className="autoplay-overlay">
                <div className="autoplay-card">
                  <strong>Next: Episode {context.nextEpisode.number}</strong>
                  <p>{context.nextEpisode.title}</p>
                  <p>Auto-play in {autoplayCountdown ?? autoplaySeconds}s</p>
                  <div className="actions">
                    <button
                      className="button"
                      onClick={() => openNextEpisode(context.nextEpisode!.externalEpisodeId)}
                      type="button"
                    >
                      Play now
                    </button>
                    <button
                      className="button-secondary"
                      onClick={() => {
                        setAutoplayActive(false);
                        setAutoplayCountdown(null);
                      }}
                      type="button"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="watch-info-bar">
            <div>
              <strong>Now playing</strong>
              <p>
                Episode {context.currentEpisode.number}
                {context.currentEpisode.title ? ` · ${context.currentEpisode.title}` : ""}
              </p>
            </div>
            <div>
              <strong>Next</strong>
              <p>
                {context.nextEpisode
                  ? `Episode ${context.nextEpisode.number} · ${context.nextEpisode.title}`
                  : "Last available episode"}
              </p>
            </div>
            <div>
              <strong>Source</strong>
              <p>{context.anime.providerDisplayName}</p>
            </div>
          </div>
        </section>

        <aside className="watch-sidebar">
          <div className="section-header">
            <div>
              <h2>Episodes</h2>
              <p>{context.episodes.length} total</p>
            </div>
          </div>

          <div className="episode-list compact">
            {context.episodes.map((episode) => (
              <button
                className={`episode-row${episode.isCurrent ? " current" : ""}`}
                key={episode.externalEpisodeId}
                onClick={() => openNextEpisode(episode.externalEpisodeId)}
                type="button"
              >
                <span className={`episode-state state-${episode.state}`} />
                <div className="episode-number">{episode.number}</div>
                <div className="episode-main">
                  <strong>{episode.title}</strong>
                  <p>
                    {episode.state === "watched"
                      ? "Watched"
                      : episode.progress
                        ? `${episode.progress.percentComplete}% watched`
                        : "Unwatched"}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
