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

  return <video className="video" controls ref={videoRef} />;
}
