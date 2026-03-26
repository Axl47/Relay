"use client";

import { useEffect } from "react";
import { apiFetch } from "../../lib/api";

type UsePlaybackProgressInput = {
  enabled: boolean;
  onEnded?: () => void;
  progressIntervalSeconds: number;
  sessionId: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
};

export function usePlaybackProgress({
  enabled,
  onEnded,
  progressIntervalSeconds,
  sessionId,
  videoRef,
}: UsePlaybackProgressInput) {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const video = videoRef.current;
    if (!video) {
      return;
    }

    const sendProgress = async () => {
      if (!video.duration || Number.isNaN(video.duration)) {
        return;
      }

      await apiFetch(`/playback/sessions/${sessionId}/progress`, {
        method: "POST",
        body: JSON.stringify({
          positionSeconds: Math.round(video.currentTime),
          durationSeconds: Math.round(video.duration),
        }),
      }).catch(() => undefined);
    };

    const interval = window.setInterval(
      sendProgress,
      Math.max(10, progressIntervalSeconds) * 1_000,
    );
    const handleEnded = () => {
      void sendProgress();
      onEnded?.();
    };

    video.addEventListener("pause", sendProgress);
    video.addEventListener("ended", handleEnded);

    return () => {
      window.clearInterval(interval);
      video.removeEventListener("pause", sendProgress);
      video.removeEventListener("ended", handleEnded);
    };
  }, [enabled, onEnded, progressIntervalSeconds, sessionId, videoRef]);
}
