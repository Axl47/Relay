"use client";

import Hls from "hls.js";
import { useEffect, useRef, useState } from "react";
import type { PlaybackSession } from "@relay/contracts";
import { apiFetch } from "../lib/api";

type Props = {
  session: PlaybackSession;
  progressIntervalSeconds?: number;
  onEnded?: () => void;
  onNextEpisode?: () => void;
  onPreviousEpisode?: () => void;
};

function isInteractiveTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select" || target.isContentEditable;
}

export function VideoPlayer({
  session,
  progressIntervalSeconds = 15,
  onEnded,
  onNextEpisode,
  onPreviousEpisode,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const defaultSubtitleIndex =
    session.subtitles.findIndex((subtitle) => subtitle.isDefault) >= 0
      ? session.subtitles.findIndex((subtitle) => subtitle.isDefault)
      : session.subtitles.length > 0
        ? 0
        : null;
  const [activeSubtitleIndex, setActiveSubtitleIndex] = useState<number | null>(defaultSubtitleIndex);

  useEffect(() => {
    setActiveSubtitleIndex(defaultSubtitleIndex);
  }, [defaultSubtitleIndex, session.id]);

  useEffect(() => {
    const streamUrl = session.streamUrl;
    const mimeType = session.mimeType;

    if (!streamUrl || mimeType === "text/html") {
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    let hls: Hls | null = null;
    let dashPlayer:
      | {
          initialize: (element: HTMLVideoElement, source: string, autoPlay: boolean) => void;
          reset: () => void;
        }
      | null = null;
    let cancelled = false;

    const attachSource = async () => {
      if (mimeType === "application/vnd.apple.mpegurl" && Hls.isSupported()) {
        hls = new Hls();
        hls.loadSource(streamUrl);
        hls.attachMedia(video);
        return;
      }

      if (mimeType === "application/dash+xml") {
        const dashjs = await import("dashjs");
        if (cancelled) {
          return;
        }

        dashPlayer = dashjs.MediaPlayer().create();
        dashPlayer.initialize(video, streamUrl, false);
        return;
      }

      video.src = streamUrl;
    };

    void attachSource();

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

    const interval = window.setInterval(sendProgress, Math.max(10, progressIntervalSeconds) * 1_000);
    const handleEnded = () => {
      void sendProgress();
      onEnded?.();
    };

    video.addEventListener("pause", sendProgress);
    video.addEventListener("ended", handleEnded);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      video.removeEventListener("pause", sendProgress);
      video.removeEventListener("ended", handleEnded);
      dashPlayer?.reset();
      hls?.destroy();
      video.removeAttribute("src");
      video.load();
    };
  }, [onEnded, progressIntervalSeconds, session]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    for (let index = 0; index < video.textTracks.length; index += 1) {
      video.textTracks[index].mode = index === activeSubtitleIndex ? "showing" : "disabled";
    }
  }, [activeSubtitleIndex, session.id]);

  useEffect(() => {
    if (session.mimeType === "text/html") {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isInteractiveTarget(event.target)) {
        return;
      }

      const video = videoRef.current;
      if (!video) {
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        if (video.paused) {
          void video.play().catch(() => undefined);
        } else {
          video.pause();
        }
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        video.currentTime = Math.max(0, video.currentTime - (event.shiftKey ? 30 : 10));
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        video.currentTime = Math.min(video.duration || video.currentTime + 10, video.currentTime + (event.shiftKey ? 30 : 10));
        return;
      }

      if (event.key.toLowerCase() === "m") {
        event.preventDefault();
        video.muted = !video.muted;
        return;
      }

      if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        if (document.fullscreenElement) {
          void document.exitFullscreen().catch(() => undefined);
        } else {
          void video.requestFullscreen?.().catch(() => undefined);
        }
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        video.volume = Math.min(1, Number((video.volume + 0.1).toFixed(2)));
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        video.volume = Math.max(0, Number((video.volume - 0.1).toFixed(2)));
        return;
      }

      if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        onNextEpisode?.();
        return;
      }

      if (event.key.toLowerCase() === "p") {
        event.preventDefault();
        onPreviousEpisode?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onNextEpisode, onPreviousEpisode, session.mimeType]);

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

  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

  return (
    <div className="player-frame">
      <video
        className="player-media player-media-video"
        controls
        crossOrigin="anonymous"
        playsInline
        ref={videoRef}
      >
        {session.subtitles.map((subtitle, index) => (
          <track
            data-relay-subtitle="true"
            default={index === activeSubtitleIndex}
            key={`${session.id}-${subtitle.url}`}
            kind="subtitles"
            label={subtitle.label}
            src={`${apiBaseUrl}/playback/sessions/${session.id}/subtitles/${index}`}
            srcLang={subtitle.language}
          />
        ))}
      </video>
    </div>
  );
}
