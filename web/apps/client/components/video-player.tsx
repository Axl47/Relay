"use client";

import Hls from "hls.js";
import { useEffect, useRef, useState } from "react";
import type { PlaybackSession } from "@relay/contracts";
import { apiFetch } from "../lib/api";
import { getApiBaseUrl, resolveRelayApiUrlForClient } from "../lib/api-base-url";

type Props = {
  session: PlaybackSession;
  progressIntervalSeconds?: number;
  onEnded?: () => void;
  onNextEpisode?: () => void;
  onPreviousEpisode?: () => void;
};

type SourceMode = "primary" | "compatibility-mp4";

function isFirefoxUserAgent() {
  if (typeof navigator === "undefined") {
    return false;
  }

  return navigator.userAgent.toLowerCase().includes("firefox");
}

function isAndroidUserAgent() {
  if (typeof navigator === "undefined") {
    return false;
  }

  return navigator.userAgent.toLowerCase().includes("android");
}

function isInteractiveTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select" || target.isContentEditable;
}

function shouldUseCompatibilityMp4(session: PlaybackSession) {
  if (session.mimeType !== "application/vnd.apple.mpegurl") {
    return false;
  }

  if (!isFirefoxUserAgent()) {
    return false;
  }

  // AnimePahe always starts in compatibility mode on Firefox, and Android Firefox
  // uses compatibility mode for all HLS providers due to unreliable MSE playback.
  return session.providerId === "animepahe" || isAndroidUserAgent();
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
  const [sourceMode, setSourceMode] = useState<SourceMode>(() =>
    shouldUseCompatibilityMp4(session) ? "compatibility-mp4" : "primary",
  );

  const apiBaseUrl = getApiBaseUrl();
  const compatibilityMp4Url = `${apiBaseUrl}/playback/sessions/${session.id}/compat.mp4`;
  const resolvedSessionStreamUrl = resolveRelayApiUrlForClient(session.streamUrl);

  useEffect(() => {
    setActiveSubtitleIndex(defaultSubtitleIndex);
  }, [defaultSubtitleIndex, session.id]);

  useEffect(() => {
    setSourceMode(shouldUseCompatibilityMp4(session) ? "compatibility-mp4" : "primary");
  }, [session.id, session.mimeType, session.providerId]);

  useEffect(() => {
    const streamUrl = sourceMode === "compatibility-mp4" ? compatibilityMp4Url : resolvedSessionStreamUrl;
    const mimeType = sourceMode === "compatibility-mp4" ? "video/mp4" : session.mimeType;

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
    let restoredStartPosition = false;
    const supportsCompatibilityFallback =
      session.mimeType === "application/vnd.apple.mpegurl" && isFirefoxUserAgent();

    const restoreStartPosition = () => {
      if (restoredStartPosition || session.positionSeconds <= 0) {
        return;
      }

      if (Number.isFinite(video.duration) && video.duration > 0) {
        video.currentTime = Math.min(session.positionSeconds, Math.max(0, video.duration - 1));
      } else {
        video.currentTime = session.positionSeconds;
      }
      restoredStartPosition = true;
    };

    const handleCompatibilityFallback = (reason: string, error?: unknown) => {
      if (!supportsCompatibilityFallback || sourceMode === "compatibility-mp4") {
        return;
      }

      console.warn("Relay switching to compatibility MP4 playback", {
        reason,
        providerId: session.providerId,
        playbackSessionId: session.id,
        error: error instanceof Error ? error.message : String(error ?? ""),
      });
      setSourceMode("compatibility-mp4");
    };

    const attachSource = async () => {
      if (mimeType === "application/vnd.apple.mpegurl" && Hls.isSupported()) {
        hls = new Hls();
        hls.on(Hls.Events.ERROR, (_event, data) => {
          console.error("Relay HLS playback error", {
            providerId: session.providerId,
            playbackSessionId: session.id,
            type: data?.type ?? "unknown",
            details: data?.details ?? "unknown",
            fatal: Boolean(data?.fatal),
            error: data?.error instanceof Error ? data.error.message : String(data?.error ?? ""),
          });

          if (data?.fatal) {
            handleCompatibilityFallback(`hlsFatal:${data.details ?? "unknown"}`, data.error ?? data);
          }
        });
        hls.loadSource(streamUrl);
        hls.attachMedia(video);
        return;
      }

      if (mimeType === "application/vnd.apple.mpegurl" && !Hls.isSupported()) {
        handleCompatibilityFallback("hlsNotSupported");
        if (supportsCompatibilityFallback) {
          return;
        }
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
    const handleVideoError = () => {
      const error = video.error;
      console.error("Relay video element error", {
        providerId: session.providerId,
        playbackSessionId: session.id,
        code: error?.code ?? null,
        message: error?.message ?? null,
      });

      if (error?.message?.includes("AudioConverter AAC cookie") || error?.code === MediaError.MEDIA_ERR_DECODE) {
        handleCompatibilityFallback("audioDecoderCookieError", error);
      }
    };

    video.addEventListener("pause", sendProgress);
    video.addEventListener("ended", handleEnded);
    video.addEventListener("loadedmetadata", restoreStartPosition);
    video.addEventListener("loadeddata", restoreStartPosition);
    video.addEventListener("error", handleVideoError);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      video.removeEventListener("pause", sendProgress);
      video.removeEventListener("ended", handleEnded);
      video.removeEventListener("loadedmetadata", restoreStartPosition);
      video.removeEventListener("loadeddata", restoreStartPosition);
      video.removeEventListener("error", handleVideoError);
      dashPlayer?.reset();
      hls?.destroy();
      video.removeAttribute("src");
      video.load();
    };
  }, [compatibilityMp4Url, onEnded, progressIntervalSeconds, resolvedSessionStreamUrl, session, sourceMode]);

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

  if (session.mimeType === "text/html" && resolvedSessionStreamUrl) {
    return (
      <div className="player-frame">
        <iframe
          allow="autoplay; fullscreen"
          className="player-media"
          src={resolvedSessionStreamUrl}
          title="Embedded provider player"
        />
      </div>
    );
  }

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
