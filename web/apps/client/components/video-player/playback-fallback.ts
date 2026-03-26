import type { PlaybackSession } from "@relay/contracts";

export type SourceMode = "primary" | "compatibility-mp4";

export type PlaybackFallbackState = {
  sessionId: string;
  primaryToCompatApplied: boolean;
  compatToPrimaryApplied: boolean;
};

export function createPlaybackFallbackState(sessionId: string): PlaybackFallbackState {
  return {
    sessionId,
    primaryToCompatApplied: false,
    compatToPrimaryApplied: false,
  };
}

export function isFirefoxUserAgent(
  userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent,
) {
  return userAgent.toLowerCase().includes("firefox");
}

export function shouldStartPlaybackInCompatibilityMode(
  session: Pick<PlaybackSession, "mimeType" | "providerId">,
  userAgent?: string,
) {
  if (session.mimeType !== "application/vnd.apple.mpegurl") {
    return false;
  }

  if (!isFirefoxUserAgent(userAgent)) {
    return false;
  }

  return session.providerId === "animepahe";
}

export function supportsCompatibilityPlaybackFallback(
  session: Pick<PlaybackSession, "mimeType">,
  userAgent?: string,
) {
  return session.mimeType === "application/vnd.apple.mpegurl" && isFirefoxUserAgent(userAgent);
}

export function applyPrimaryToCompatibilityFallback(
  state: PlaybackFallbackState,
  sourceMode: SourceMode,
) {
  if (sourceMode === "compatibility-mp4" || state.primaryToCompatApplied) {
    return {
      nextState: state,
      nextMode: null,
    };
  }

  return {
    nextState: {
      ...state,
      primaryToCompatApplied: true,
    },
    nextMode: "compatibility-mp4" as const,
  };
}

export function applyCompatibilityToPrimaryFallback(
  state: PlaybackFallbackState,
  sourceMode: SourceMode,
) {
  if (sourceMode !== "compatibility-mp4" || state.compatToPrimaryApplied) {
    return {
      nextState: state,
      nextMode: null,
    };
  }

  return {
    nextState: {
      ...state,
      compatToPrimaryApplied: true,
    },
    nextMode: "primary" as const,
  };
}
