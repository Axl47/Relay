"use client";

import Hls from "hls.js";
import { useEffect, useRef } from "react";
import type { PlaybackSession } from "@relay/contracts";
import { getApiBaseUrl, resolveRelayApiUrlForClient } from "../../lib/api-base-url";
import {
  applyCompatibilityToPrimaryFallback,
  applyPrimaryToCompatibilityFallback,
  createPlaybackFallbackState,
  getCompatibilityPlaybackStartupTimeoutMs,
  supportsCompatibilityPlaybackFallback,
  type SourceMode,
} from "./playback-fallback";

type UsePlaybackSourceInput = {
  session: PlaybackSession;
  setSourceMode: (value: SourceMode) => void;
  sourceMode: SourceMode;
  videoRef: React.RefObject<HTMLVideoElement | null>;
};

export function usePlaybackSource({
  session,
  setSourceMode,
  sourceMode,
  videoRef,
}: UsePlaybackSourceInput) {
  const fallbackStateRef = useRef(createPlaybackFallbackState(session.id));

  useEffect(() => {
    fallbackStateRef.current = createPlaybackFallbackState(session.id);
  }, [session.id]);

  useEffect(() => {
    const apiBaseUrl = getApiBaseUrl();
    const compatibilityMp4Url = `${apiBaseUrl}/playback/sessions/${session.id}/compat.mp4`;
    const resolvedStreamUrl =
      sourceMode === "compatibility-mp4"
        ? compatibilityMp4Url
        : resolveRelayApiUrlForClient(session.streamUrl);
    const mimeType = sourceMode === "compatibility-mp4" ? "video/mp4" : session.mimeType;

    if (!resolvedStreamUrl || mimeType === "text/html") {
      return;
    }

    const video = videoRef.current;
    if (!video) {
      return;
    }

    let hls: Hls | null = null;
    let dashPlayer:
      | {
          initialize: (element: HTMLVideoElement, source: string, autoPlay: boolean) => void;
          reset: () => void;
        }
      | null = null;
    let cancelled = false;
    let restoredStartPosition = false;
    let compatibilityStartupTimeout: number | null = null;
    const supportsCompatibilityFallback = supportsCompatibilityPlaybackFallback(session);

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
      if (!supportsCompatibilityFallback) {
        return;
      }

      const transition = applyPrimaryToCompatibilityFallback(
        fallbackStateRef.current,
        sourceMode,
      );
      fallbackStateRef.current = transition.nextState;
      if (!transition.nextMode) {
        return;
      }

      console.warn("Relay switching to compatibility MP4 playback", {
        reason,
        providerId: session.providerId,
        playbackSessionId: session.id,
        error: error instanceof Error ? error.message : String(error ?? ""),
      });
      setSourceMode(transition.nextMode);
    };

    const handlePrimaryFallback = (reason: string, error?: unknown) => {
      const transition = applyCompatibilityToPrimaryFallback(fallbackStateRef.current, sourceMode);
      fallbackStateRef.current = transition.nextState;
      if (!transition.nextMode) {
        return;
      }

      console.warn("Relay switching back to primary playback source", {
        reason,
        providerId: session.providerId,
        playbackSessionId: session.id,
        error: error instanceof Error ? error.message : String(error ?? ""),
      });
      setSourceMode(transition.nextMode);
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
        hls.loadSource(resolvedStreamUrl);
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
        dashPlayer.initialize(video, resolvedStreamUrl, false);
        return;
      }

      if (sourceMode === "compatibility-mp4") {
        compatibilityStartupTimeout = window.setTimeout(() => {
          if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
            handlePrimaryFallback("compatibilityStartupTimeout");
          }
        }, getCompatibilityPlaybackStartupTimeoutMs(session));
      }

      video.src = resolvedStreamUrl;
    };

    void attachSource();

    const handleVideoError = () => {
      const error = video.error;
      console.error("Relay video element error", {
        providerId: session.providerId,
        playbackSessionId: session.id,
        code: error?.code ?? null,
        message: error?.message ?? null,
      });

      if (sourceMode === "compatibility-mp4") {
        handlePrimaryFallback("compatibilityMediaError", error);
        return;
      }

      if (
        error?.message?.includes("AudioConverter AAC cookie") ||
        error?.code === MediaError.MEDIA_ERR_DECODE
      ) {
        handleCompatibilityFallback("audioDecoderCookieError", error);
      }
    };

    video.addEventListener("loadedmetadata", restoreStartPosition);
    video.addEventListener("loadeddata", restoreStartPosition);
    video.addEventListener("error", handleVideoError);

    return () => {
      cancelled = true;
      if (compatibilityStartupTimeout) {
        window.clearTimeout(compatibilityStartupTimeout);
      }
      video.removeEventListener("loadedmetadata", restoreStartPosition);
      video.removeEventListener("loadeddata", restoreStartPosition);
      video.removeEventListener("error", handleVideoError);
      dashPlayer?.reset();
      hls?.destroy();
      video.removeAttribute("src");
      video.load();
    };
  }, [session, setSourceMode, sourceMode, videoRef]);
}
