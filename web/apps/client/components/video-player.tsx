"use client";

import { useEffect, useRef, useState } from "react";
import type { PlaybackSession } from "@relay/contracts";
import { getApiBaseUrl, resolveRelayApiUrlForClient } from "../lib/api-base-url";
import {
  shouldStartPlaybackInCompatibilityMode,
  type SourceMode,
} from "./video-player/playback-fallback";
import { useKeyboardShortcuts } from "./video-player/use-keyboard-shortcuts";
import { usePlaybackProgress } from "./video-player/use-playback-progress";
import { usePlaybackSource } from "./video-player/use-playback-source";

type Props = {
  session: PlaybackSession;
  progressIntervalSeconds?: number;
  onEnded?: () => void;
  onNextEpisode?: () => void;
  onPreviousEpisode?: () => void;
};

export function VideoPlayer({
  session,
  progressIntervalSeconds = 15,
  onEnded,
  onNextEpisode,
  onPreviousEpisode,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const shouldStartInCompatibilityMode = shouldStartPlaybackInCompatibilityMode(session);
  const defaultSubtitleIndex =
    session.subtitles.findIndex((subtitle) => subtitle.isDefault) >= 0
      ? session.subtitles.findIndex((subtitle) => subtitle.isDefault)
      : session.subtitles.length > 0
        ? 0
        : null;
  const [activeSubtitleIndex, setActiveSubtitleIndex] = useState<number | null>(defaultSubtitleIndex);
  const [sourceMode, setSourceMode] = useState<SourceMode>(() =>
    shouldStartInCompatibilityMode ? "compatibility-mp4" : "primary",
  );

  useEffect(() => {
    setActiveSubtitleIndex(defaultSubtitleIndex);
  }, [defaultSubtitleIndex, session.id]);

  useEffect(() => {
    setSourceMode(shouldStartInCompatibilityMode ? "compatibility-mp4" : "primary");
  }, [session.id, shouldStartInCompatibilityMode]);

  usePlaybackSource({
    session,
    setSourceMode,
    sourceMode,
    videoRef,
  });

  usePlaybackProgress({
    enabled: session.mimeType !== "text/html",
    onEnded,
    progressIntervalSeconds,
    sessionId: session.id,
    videoRef,
  });

  useKeyboardShortcuts({
    enabled: session.mimeType !== "text/html",
    onNextEpisode,
    onPreviousEpisode,
    videoRef,
  });

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    for (let index = 0; index < video.textTracks.length; index += 1) {
      video.textTracks[index].mode = index === activeSubtitleIndex ? "showing" : "disabled";
    }
  }, [activeSubtitleIndex, session.id]);

  const apiBaseUrl = getApiBaseUrl();
  const resolvedSessionStreamUrl = resolveRelayApiUrlForClient(session.streamUrl);

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
