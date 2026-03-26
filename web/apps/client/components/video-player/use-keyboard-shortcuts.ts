"use client";

import { useEffect } from "react";

type UseKeyboardShortcutsInput = {
  enabled: boolean;
  onNextEpisode?: () => void;
  onPreviousEpisode?: () => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
};

function isInteractiveTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    target.isContentEditable
  );
}

export function useKeyboardShortcuts({
  enabled,
  onNextEpisode,
  onPreviousEpisode,
  videoRef,
}: UseKeyboardShortcutsInput) {
  useEffect(() => {
    if (!enabled) {
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
        video.currentTime = Math.min(
          video.duration || video.currentTime + 10,
          video.currentTime + (event.shiftKey ? 30 : 10),
        );
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
  }, [enabled, onNextEpisode, onPreviousEpisode, videoRef]);
}
