"use client";

import Hls from "hls.js";
import { useEffect, useRef } from "react";
import type { PlaybackSession } from "@relay/contracts";
import { apiFetch } from "../lib/api";

type Props = {
  session: PlaybackSession;
};

export function VideoPlayer({ session }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!session.streamUrl || session.mimeType === "text/html") {
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    let hls: Hls | null = null;
    if (session.mimeType === "application/vnd.apple.mpegurl" && Hls.isSupported()) {
      hls = new Hls();
      hls.loadSource(session.streamUrl);
      hls.attachMedia(video);
    } else {
      video.src = session.streamUrl;
    }

    video.currentTime = session.positionSeconds;

    const sendProgress = async () => {
      if (!video.duration || Number.isNaN(video.duration)) return;
      await apiFetch(`/playback/sessions/${session.id}/progress`, {
        method: "POST",
        body: JSON.stringify({
          positionSeconds: Math.round(video.currentTime),
          durationSeconds: Math.round(video.duration),
        }),
      }).catch(() => undefined);
    };

    const interval = window.setInterval(sendProgress, 15_000);
    video.addEventListener("pause", sendProgress);

    return () => {
      window.clearInterval(interval);
      video.removeEventListener("pause", sendProgress);
      hls?.destroy();
    };
  }, [session]);

  if (session.mimeType === "text/html" && session.streamUrl) {
    return (
      <div className="player-frame">
        <iframe
          allow="autoplay; fullscreen"
          className="player-media"
          src={session.streamUrl}
          title="Embedded provider player"
        />
      </div>
    );
  }

  return (
    <div className="player-frame">
      <video className="player-media player-media-video" controls playsInline ref={videoRef} />
    </div>
  );
}
