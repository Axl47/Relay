import type { WatchHrefInput } from "./routes";

export const queryKeys = {
  me: () => ["me"] as const,
  providers: () => ["providers"] as const,
  trackerEntries: () => ["tracker-entries"] as const,
  imports: () => ["imports"] as const,
  libraryIndex: () => ["library-index"] as const,
  libraryDashboard: () => ["library-dashboard"] as const,
  groupedHistory: () => ["grouped-history"] as const,
  catalogSearch: (query: string) => ["catalog-search", query] as const,
  catalogSearchLast: () => ["catalog-search-last"] as const,
  animeView: (providerId: string, externalAnimeId: string) =>
    ["anime-view", providerId, externalAnimeId] as const,
  watchContext: (payload: WatchHrefInput | null) => ["watch-context", payload] as const,
  playbackSessionCreate: (payload: WatchHrefInput | null) =>
    ["playback-session-create", payload] as const,
  playbackSessionPoll: (sessionId?: string | null) =>
    ["playback-session-poll", sessionId ?? null] as const,
};
