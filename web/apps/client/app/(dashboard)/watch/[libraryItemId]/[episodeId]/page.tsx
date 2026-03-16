"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { LibraryItemWithCategories, PlaybackSession } from "@relay/contracts";
import { VideoPlayer } from "../../../../../components/video-player";
import { apiFetch } from "../../../../../lib/api";

type Props = {
  params: Promise<{
    libraryItemId: string;
    episodeId: string;
  }>;
};

type LibraryResponse = {
  items: LibraryItemWithCategories[];
};

type PlaybackPayload = {
  libraryItemId: string | null;
  providerId: string;
  externalAnimeId: string;
  externalEpisodeId: string;
};

function isUuid(value: string | null | undefined): value is string {
  if (!value) {
    return false;
  }

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export default function WatchPage({ params }: Props) {
  const searchParams = useSearchParams();
  const [resolvedParams, setResolvedParams] = useState<Awaited<Props["params"]> | null>(null);
  const [session, setSession] = useState<PlaybackSession | null>(null);
  const [payload, setPayload] = useState<PlaybackPayload | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    params.then(setResolvedParams);
  }, [params]);

  useEffect(() => {
    if (!resolvedParams) {
      return;
    }

    setPayload(null);
    const providerId = searchParams.get("providerId");
    const externalAnimeId = searchParams.get("externalAnimeId");
    const libraryItemId = isUuid(resolvedParams.libraryItemId) ? resolvedParams.libraryItemId : null;

    if (providerId && externalAnimeId) {
      setPayload({
        libraryItemId,
        providerId,
        externalAnimeId,
        externalEpisodeId: resolvedParams.episodeId,
      });
      return;
    }

    if (!libraryItemId) {
      setPayload(null);
      setMessage("Missing provider context. Open this episode from an anime or library page.");
      return;
    }

    let cancelled = false;
    apiFetch<LibraryResponse>("/library")
      .then((library) => {
        if (cancelled) {
          return;
        }
        const item = library.items.find((entry) => entry.id === libraryItemId);
        if (!item) {
          setPayload(null);
          setMessage("Library item not found for this watch route.");
          return;
        }
        setPayload({
          libraryItemId,
          providerId: item.providerId,
          externalAnimeId: item.externalAnimeId,
          externalEpisodeId: resolvedParams.episodeId,
        });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setPayload(null);
        setMessage(
          error instanceof Error ? error.message : "Unable to resolve library playback context.",
        );
      });

    return () => {
      cancelled = true;
    };
  }, [resolvedParams, searchParams]);

  useEffect(() => {
    if (!payload) return;
    setSession(null);
    setMessage(null);

    let cancelled = false;
    apiFetch<PlaybackSession>("/playback/sessions", {
      method: "POST",
      body: JSON.stringify(payload),
    })
      .then((nextSession) => {
        if (!cancelled) {
          setSession(nextSession);
        }
      })
      .catch((error) =>
        setMessage(error instanceof Error ? error.message : "Unable to create playback session."),
      );

    return () => {
      cancelled = true;
    };
  }, [payload]);

  useEffect(() => {
    if (!session || session.status !== "resolving") {
      return;
    }

    const timeout = window.setTimeout(() => {
      apiFetch<PlaybackSession>(`/playback/sessions/${session.id}`)
        .then((nextSession) => setSession(nextSession))
        .catch((error) =>
          setMessage(error instanceof Error ? error.message : "Unable to refresh playback session."),
        );
    }, 2_000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [session]);

  const canPlay = session?.status === "ready" && Boolean(session.streamUrl);

  return (
    <div className="page-grid">
      <section className="panel video-shell">
        <div className="topbar-title">
          <h1>Watch</h1>
          <p>Progress is saved every 15 seconds and on pause.</p>
        </div>
        {message ? <div className="message">{message}</div> : null}
        {canPlay && session ? <VideoPlayer session={session} /> : null}
        {!session && payload ? <div className="message">Creating playback session...</div> : null}
        {!session && !payload && !message ? (
          <div className="message">Preparing playback context...</div>
        ) : null}
        {session?.status === "resolving" ? (
          <div className="message">Resolving provider stream...</div>
        ) : null}
        {session?.status === "failed" ? (
          <div className="message">{session.error ?? "Playback resolution failed."}</div>
        ) : null}
        {session?.status === "expired" ? (
          <div className="message">Playback session expired. Reload the page to create a new one.</div>
        ) : null}
      </section>
    </div>
  );
}
