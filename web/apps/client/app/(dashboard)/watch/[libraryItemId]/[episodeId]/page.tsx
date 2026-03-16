"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { PlaybackSession } from "@relay/contracts";
import { VideoPlayer } from "../../../../../components/video-player";
import { apiFetch } from "../../../../../lib/api";

type Props = {
  params: Promise<{
    libraryItemId: string;
    episodeId: string;
  }>;
};

export default function WatchPage({ params }: Props) {
  const searchParams = useSearchParams();
  const [resolvedParams, setResolvedParams] = useState<Awaited<Props["params"]> | null>(null);
  const [session, setSession] = useState<PlaybackSession | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    params.then(setResolvedParams);
  }, [params]);

  const payload = useMemo(() => {
    if (!resolvedParams) return null;
    return {
      libraryItemId: null,
      providerId: searchParams.get("providerId") ?? "demo",
      externalAnimeId: searchParams.get("externalAnimeId") ?? "relay-signal",
      externalEpisodeId: resolvedParams.episodeId,
    };
  }, [resolvedParams, searchParams]);

  useEffect(() => {
    if (!payload) return;
    apiFetch<PlaybackSession>("/playback/sessions", {
      method: "POST",
      body: JSON.stringify(payload),
    })
      .then(setSession)
      .catch((error) =>
        setMessage(error instanceof Error ? error.message : "Unable to create playback session."),
      );
  }, [payload]);

  return (
    <div className="page-grid">
      <section className="panel video-shell">
        <div className="topbar-title">
          <h1>Watch</h1>
          <p>Progress is saved every 15 seconds and on pause.</p>
        </div>
        {message ? <div className="message">{message}</div> : null}
        {session ? <VideoPlayer session={session} /> : <div className="message">Creating session...</div>}
      </section>
    </div>
  );
}
