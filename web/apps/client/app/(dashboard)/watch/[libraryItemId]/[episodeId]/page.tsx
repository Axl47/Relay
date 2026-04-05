"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AuthRequiredState } from "../../../../../components/auth-required-state";
import { VideoPlayer } from "../../../../../components/video-player";
import { useLibraryIndexQuery } from "../../../../../hooks/use-library-index-query";
import { usePlaybackSessionQuery } from "../../../../../hooks/use-playback-session-query";
import { useRouteAccess } from "../../../../../hooks/use-route-access";
import { useWatchContextQuery } from "../../../../../hooks/use-watch-context-query";
import type { WatchHrefInput } from "../../../../../lib/routes";
import { buildAnimeHref, buildWatchHref, decodeRouteParam } from "../../../../../lib/routes";

function isUuid(value: string | null | undefined): value is string {
  if (!value) {
    return false;
  }

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export default function WatchPage() {
  const routeParams = useParams<{ libraryItemId: string; episodeId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const access = useRouteAccess();
  const [autoplayCountdown, setAutoplayCountdown] = useState<number | null>(null);
  const [autoplayActive, setAutoplayActive] = useState(false);
  const [showEpisodeSheet, setShowEpisodeSheet] = useState(false);
  const [showEpisodeRail, setShowEpisodeRail] = useState(true);

  const resolvedParams = useMemo(
    () => ({
      libraryItemId: decodeRouteParam(routeParams.libraryItemId),
      episodeId: decodeRouteParam(routeParams.episodeId),
    }),
    [routeParams.episodeId, routeParams.libraryItemId],
  );

  const providerId = searchParams.get("providerId");
  const externalAnimeId = searchParams.get("externalAnimeId");
  const resolvedLibraryItemId = isUuid(resolvedParams.libraryItemId)
    ? resolvedParams.libraryItemId
    : null;

  const libraryQuery = useLibraryIndexQuery(
    access.isAuthenticated &&
      (!providerId || !externalAnimeId || resolvedLibraryItemId === null),
  );

  const payload = useMemo<WatchHrefInput | null>(() => {
    if (providerId && externalAnimeId) {
      return {
        libraryItemId: resolvedLibraryItemId,
        providerId,
        externalAnimeId,
        externalEpisodeId: resolvedParams.episodeId,
      };
    }

    if (!resolvedLibraryItemId) {
      return null;
    }

    const libraryItem = libraryQuery.data?.items.find((item) => item.id === resolvedLibraryItemId);
    if (!libraryItem) {
      return null;
    }

    return {
      libraryItemId: resolvedLibraryItemId,
      providerId: libraryItem.providerId,
      externalAnimeId: libraryItem.externalAnimeId,
      externalEpisodeId: resolvedParams.episodeId,
    };
  }, [
    externalAnimeId,
    libraryQuery.data?.items,
    providerId,
    resolvedLibraryItemId,
    resolvedParams.episodeId,
  ]);

  const contextQuery = useWatchContextQuery(payload, access.isAuthenticated);
  const playbackQuery = usePlaybackSessionQuery(access.isAuthenticated ? payload : null);

  const session = playbackQuery.session;
  const context = contextQuery.data ?? null;
  const canPlay = session?.status === "ready" && Boolean(session.streamUrl);
  const autoplaySeconds =
    access.session?.preferences.autoplayNextEpisode === false
      ? 0
      : access.session?.preferences.autoplayCountdownSeconds ?? 15;

  useEffect(() => {
    setAutoplayActive(false);
    setAutoplayCountdown(null);
    setShowEpisodeSheet(false);
  }, [payload?.externalEpisodeId, payload?.externalAnimeId, payload?.libraryItemId, payload?.providerId]);

  useEffect(() => {
    if (!autoplayActive || autoplayCountdown === null) {
      return;
    }

    if (autoplayCountdown <= 0 && context?.nextEpisode && payload) {
      router.push(
        buildWatchHref({
          ...payload,
          externalEpisodeId: context.nextEpisode.externalEpisodeId,
        }),
      );
      return;
    }

    const timeout = window.setTimeout(() => {
      setAutoplayCountdown((current) => (current === null ? current : current - 1));
    }, 1_000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [autoplayActive, autoplayCountdown, context?.nextEpisode, payload, router]);

  function openEpisode(nextEpisodeId: string) {
    if (!payload) {
      return;
    }

    setShowEpisodeSheet(false);
    router.push(
      buildWatchHref({
        ...payload,
        externalEpisodeId: nextEpisodeId,
      }),
    );
  }

  function handlePlaybackEnded() {
    if (!context?.nextEpisode || autoplaySeconds <= 0) {
      return;
    }

    setAutoplayActive(true);
    setAutoplayCountdown(autoplaySeconds);
  }

  if (access.isLoading) {
    return <div className="message">Preparing playback…</div>;
  }

  if (access.isUnauthenticated) {
    return (
      <AuthRequiredState
        description="Sign in to open playback sessions, keep progress synced, and move through episodes without losing context."
        title="Watching is tied to your account"
      />
    );
  }

  if (access.error || !access.session) {
    return (
      <div className="message">
        {access.error instanceof Error ? access.error.message : "Unable to prepare playback."}
      </div>
    );
  }

  if (!payload && libraryQuery.isLoading) {
    return <div className="message">Preparing playback context…</div>;
  }

  if (!payload) {
    return <div className="message">Missing provider context. Open this episode from Library or Detail.</div>;
  }

  if (contextQuery.isLoading || playbackQuery.createQuery.isLoading) {
    return <div className="message">Preparing playback context…</div>;
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

  if (playbackQuery.createQuery.error || playbackQuery.pollQuery.error) {
    const error = playbackQuery.createQuery.error ?? playbackQuery.pollQuery.error;
    return (
      <div className="message">
        {error instanceof Error ? error.message : "Unable to create playback session."}
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

  const episodeList = (
    <div className="episode-list compact">
      {context.episodes.map((episode) => (
        <button
          className={`episode-row${episode.isCurrent ? " current" : ""}`}
          key={episode.externalEpisodeId}
          onClick={() => openEpisode(episode.externalEpisodeId)}
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
  );

  return (
    <div className="page-grid watch-page">
      <section className="page-heading page-heading-row">
        <div>
          <span className="eyebrow">Watch</span>
          <h1>{context.anime.title}</h1>
          <p>
            Episode {context.currentEpisode.number}
            {context.currentEpisode.title ? ` · ${context.currentEpisode.title}` : ""}
          </p>
        </div>
        <div className="watch-header-actions">
          <button
            className="button-secondary"
            disabled={!previousEpisode}
            onClick={() => previousEpisode && openEpisode(previousEpisode.externalEpisodeId)}
            type="button"
          >
            Previous
          </button>
          <button
            className="button-secondary"
            disabled={!context.nextEpisode}
            onClick={() => context.nextEpisode && openEpisode(context.nextEpisode.externalEpisodeId)}
            type="button"
          >
            Next
          </button>
          <button className="button-secondary watch-episodes-toggle" onClick={() => setShowEpisodeSheet(true)} type="button">
            Episodes
          </button>
          <button className="button-secondary watch-episodes-toggle desktop-only" onClick={() => setShowEpisodeRail((current) => !current)} type="button">
            {showEpisodeRail ? "Hide rail" : "Show rail"}
          </button>
        </div>
      </section>

      <div className={`watch-layout${showEpisodeRail ? "" : " rail-collapsed"}`}>
        <section className="watch-main">
          <div className="watch-topline">
            <Link
              className="watch-backlink"
              href={buildAnimeHref(context.anime.providerId, context.anime.externalAnimeId)}
            >
              &larr; Back to detail
            </Link>
            <span className="badge">{context.anime.providerDisplayName}</span>
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
                  context.nextEpisode
                    ? () => openEpisode(context.nextEpisode!.externalEpisodeId)
                    : undefined
                }
                onPreviousEpisode={
                  previousEpisode ? () => openEpisode(previousEpisode.externalEpisodeId) : undefined
                }
                progressIntervalSeconds={access.session.preferences.progressSaveIntervalSeconds}
                session={session}
              />
            ) : session?.status === "resolving" ? (
              <div className="surface watch-status">
                <strong>Resolving stream…</strong>
                <p>Relay is trying provider playback options for this episode.</p>
              </div>
            ) : (
              <div className="surface watch-status">
                <strong>Preparing playback</strong>
                <p>Relay is building the playback session for this episode.</p>
              </div>
            )}

            {autoplayActive && context.nextEpisode ? (
              <div className="autoplay-dock">
                <div>
                  <strong>Next up: episode {context.nextEpisode.number}</strong>
                  <p>{context.nextEpisode.title}</p>
                </div>
                <div className="actions">
                  <span className="badge">Auto in {autoplayCountdown ?? autoplaySeconds}s</span>
                  <button
                    className="button"
                    onClick={() => openEpisode(context.nextEpisode!.externalEpisodeId)}
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
              <strong>Library state</strong>
              <p>{context.libraryItem ? "Tracked in library" : "Direct watch session"}</p>
            </div>
          </div>
        </section>

        {showEpisodeRail ? (
          <aside className="watch-sidebar">
            <div className="section-header">
              <div>
                <h2>Episode rail</h2>
                <p>{context.episodes.length} total</p>
              </div>
            </div>
            {episodeList}
          </aside>
        ) : null}
      </div>

      {showEpisodeSheet ? (
        <div className="overlay-shell" role="presentation" onClick={() => setShowEpisodeSheet(false)}>
          <aside
            aria-label="Episode picker"
            className="provider-sheet watch-episode-sheet"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="provider-sheet-head">
              <div>
                <span className="eyebrow">Episodes</span>
                <h2>{context.anime.title}</h2>
                <p>{context.episodes.length} total</p>
              </div>
              <button className="button-secondary" onClick={() => setShowEpisodeSheet(false)} type="button">
                Close
              </button>
            </div>
            {episodeList}
          </aside>
        </div>
      ) : null}
    </div>
  );
}
