import { z } from "zod";

export const providerIdSchema = z.string().min(1);
export const externalIdSchema = z.string().min(1);
export const isoDateSchema = z.string().datetime().or(z.string().min(1));

export const providerAnimeRefSchema = z.object({
  providerId: providerIdSchema,
  externalAnimeId: externalIdSchema,
});

export const providerEpisodeRefSchema = z.object({
  providerId: providerIdSchema,
  externalAnimeId: externalIdSchema,
  externalEpisodeId: externalIdSchema,
});

export const searchInputSchema = z.object({
  query: z.string().trim().min(1),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(50).default(20),
});

export const searchResultSchema = z.object({
  providerId: providerIdSchema,
  externalAnimeId: externalIdSchema,
  title: z.string().min(1),
  synopsis: z.string().nullable().default(null),
  coverImage: z.string().url().nullable().default(null),
  year: z.number().int().nullable().default(null),
  kind: z.enum(["tv", "movie", "ova", "special", "unknown"]).default("unknown"),
  language: z.string().min(1).default("en"),
});

export const searchPageSchema = z.object({
  providerId: providerIdSchema,
  query: z.string().min(1),
  page: z.number().int().min(1),
  hasNextPage: z.boolean().default(false),
  items: z.array(searchResultSchema),
});

export const episodeSummarySchema = z.object({
  providerId: providerIdSchema,
  externalAnimeId: externalIdSchema,
  externalEpisodeId: externalIdSchema,
  number: z.number().nonnegative(),
  title: z.string().min(1),
  synopsis: z.string().nullable().default(null),
  thumbnail: z.string().url().nullable().default(null),
  durationSeconds: z.number().int().positive().nullable().default(null),
  releasedAt: z.string().nullable().default(null),
});

export const episodeListSchema = z.object({
  providerId: providerIdSchema,
  externalAnimeId: externalIdSchema,
  episodes: z.array(episodeSummarySchema),
});

export const animeDetailsSchema = z.object({
  providerId: providerIdSchema,
  externalAnimeId: externalIdSchema,
  title: z.string().min(1),
  synopsis: z.string().nullable().default(null),
  coverImage: z.string().url().nullable().default(null),
  bannerImage: z.string().url().nullable().default(null),
  status: z.enum(["ongoing", "completed", "hiatus", "unknown"]).default("unknown"),
  year: z.number().int().nullable().default(null),
  tags: z.array(z.string()).default([]),
  language: z.string().min(1).default("en"),
  totalEpisodes: z.number().int().nullable().default(null),
});

export const resolvedSubtitleTrackSchema = z.object({
  label: z.string().min(1),
  language: z.string().min(1).default("und"),
  url: z.string().url(),
  format: z.enum(["vtt", "srt", "ass"]).default("vtt"),
  isDefault: z.boolean().default(false),
});

export const resolvedStreamSchema = z.object({
  id: z.string().min(1),
  url: z.string().url(),
  quality: z.string().min(1),
  mimeType: z.enum([
    "application/vnd.apple.mpegurl",
    "video/mp4",
    "application/dash+xml",
  ]),
  headers: z.record(z.string()).default({}),
  isDefault: z.boolean().default(false),
});

export const playbackResolutionSchema = z.object({
  providerId: providerIdSchema,
  externalAnimeId: externalIdSchema,
  externalEpisodeId: externalIdSchema,
  streams: z.array(resolvedStreamSchema).min(1),
  subtitles: z.array(resolvedSubtitleTrackSchema).default([]),
  cookies: z.record(z.string()).default({}),
  expiresAt: z.string().min(1),
});

export const providerSummarySchema = z.object({
  id: providerIdSchema,
  displayName: z.string().min(1),
  enabled: z.boolean(),
  priority: z.number().int().min(0),
  supportsSearch: z.boolean(),
  health: z.enum(["healthy", "degraded", "offline"]).default("healthy"),
  lastCheckedAt: z.string().nullable().default(null),
});

export const libraryDisplayModeSchema = z.enum(["grid", "list", "compact"]);
export const librarySortModeSchema = z.enum([
  "title",
  "dateAdded",
  "lastWatched",
  "updatedAt",
]);

export const userPreferencesSchema = z.object({
  libraryLayoutMode: libraryDisplayModeSchema.default("grid"),
  librarySortMode: librarySortModeSchema.default("lastWatched"),
  categoryTabsVisible: z.boolean().default(true),
  autoplayNextEpisode: z.boolean().default(true),
  preferredQuality: z.string().default("1080p"),
  preferredSubtitleLanguage: z.string().default("en"),
  watchedThresholdPercent: z.number().int().min(1).max(100).default(90),
  updatesRefreshIntervalMinutes: z.number().int().min(15).default(180),
});

export const categorySchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  name: z.string().min(1),
  position: z.number().int().min(0),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const libraryItemSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  providerId: providerIdSchema,
  externalAnimeId: externalIdSchema,
  title: z.string().min(1),
  coverImage: z.string().url().nullable().default(null),
  status: z.enum(["planned", "watching", "completed", "paused"]).default("watching"),
  addedAt: z.string(),
  updatedAt: z.string(),
  lastEpisodeNumber: z.number().nullable().default(null),
  lastWatchedAt: z.string().nullable().default(null),
});

export const libraryItemWithCategoriesSchema = libraryItemSchema.extend({
  categories: z.array(categorySchema.pick({ id: true, name: true, position: true })),
});

export const watchProgressSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  libraryItemId: z.string().uuid(),
  providerId: providerIdSchema,
  externalAnimeId: externalIdSchema,
  externalEpisodeId: externalIdSchema,
  positionSeconds: z.number().nonnegative(),
  durationSeconds: z.number().positive().nullable().default(null),
  percentComplete: z.number().min(0).max(100).default(0),
  completed: z.boolean().default(false),
  updatedAt: z.string(),
});

export const historyEntrySchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  libraryItemId: z.string().uuid().nullable().default(null),
  providerId: providerIdSchema,
  externalAnimeId: externalIdSchema,
  externalEpisodeId: externalIdSchema,
  animeTitle: z.string().min(1),
  episodeTitle: z.string().min(1),
  coverImage: z.string().url().nullable().default(null),
  watchedAt: z.string(),
  positionSeconds: z.number().nonnegative(),
  durationSeconds: z.number().positive().nullable().default(null),
  completed: z.boolean().default(false),
});

export const playbackSessionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  providerId: providerIdSchema,
  externalAnimeId: externalIdSchema,
  externalEpisodeId: externalIdSchema,
  streamUrl: z.string().url(),
  mimeType: z.string().min(1),
  subtitles: z.array(resolvedSubtitleTrackSchema).default([]),
  headers: z.record(z.string()).default({}),
  expiresAt: z.string(),
  positionSeconds: z.number().nonnegative().default(0),
});

export const authBootstrapInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(10),
  displayName: z.string().min(1),
});

export const authLoginInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const authResponseSchema = z.object({
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    displayName: z.string().min(1),
    isAdmin: z.boolean(),
  }),
  sessionId: z.string().uuid(),
});

export const upsertLibraryItemInputSchema = z.object({
  providerId: providerIdSchema,
  externalAnimeId: externalIdSchema,
  title: z.string().min(1),
  coverImage: z.string().url().nullable().default(null),
  status: z.enum(["planned", "watching", "completed", "paused"]).default("watching"),
});

export const updateLibraryItemInputSchema = z.object({
  status: z.enum(["planned", "watching", "completed", "paused"]).optional(),
  title: z.string().min(1).optional(),
  coverImage: z.string().url().nullable().optional(),
});

export const createCategoryInputSchema = z.object({
  name: z.string().trim().min(1),
});

export const updateCategoryInputSchema = z.object({
  name: z.string().trim().min(1).optional(),
  position: z.number().int().min(0).optional(),
});

export const assignCategoriesInputSchema = z.object({
  categoryIds: z.array(z.string().uuid()),
});

export const createPlaybackSessionInputSchema = providerEpisodeRefSchema.extend({
  libraryItemId: z.string().uuid().nullable().default(null),
});

export const updatePlaybackProgressInputSchema = z.object({
  positionSeconds: z.number().nonnegative(),
  durationSeconds: z.number().positive().nullable().default(null),
});

export const updateProviderConfigInputSchema = z.object({
  enabled: z.boolean().optional(),
  priority: z.number().int().min(0).optional(),
});

export const importJobSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  status: z.enum(["pending", "running", "completed", "failed"]),
  source: z.enum(["android-backup"]),
  summary: z.record(z.unknown()).nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ProviderAnimeRef = z.infer<typeof providerAnimeRefSchema>;
export type ProviderEpisodeRef = z.infer<typeof providerEpisodeRefSchema>;
export type SearchInput = z.infer<typeof searchInputSchema>;
export type SearchResult = z.infer<typeof searchResultSchema>;
export type SearchPage = z.infer<typeof searchPageSchema>;
export type EpisodeSummary = z.infer<typeof episodeSummarySchema>;
export type EpisodeList = z.infer<typeof episodeListSchema>;
export type AnimeDetails = z.infer<typeof animeDetailsSchema>;
export type ResolvedSubtitleTrack = z.infer<typeof resolvedSubtitleTrackSchema>;
export type ResolvedStream = z.infer<typeof resolvedStreamSchema>;
export type PlaybackResolution = z.infer<typeof playbackResolutionSchema>;
export type ProviderSummary = z.infer<typeof providerSummarySchema>;
export type UserPreferences = z.infer<typeof userPreferencesSchema>;
export type Category = z.infer<typeof categorySchema>;
export type LibraryItem = z.infer<typeof libraryItemSchema>;
export type LibraryItemWithCategories = z.infer<typeof libraryItemWithCategoriesSchema>;
export type WatchProgress = z.infer<typeof watchProgressSchema>;
export type HistoryEntry = z.infer<typeof historyEntrySchema>;
export type PlaybackSession = z.infer<typeof playbackSessionSchema>;
export type AuthBootstrapInput = z.infer<typeof authBootstrapInputSchema>;
export type AuthLoginInput = z.infer<typeof authLoginInputSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;
export type UpsertLibraryItemInput = z.infer<typeof upsertLibraryItemInputSchema>;
export type UpdateLibraryItemInput = z.infer<typeof updateLibraryItemInputSchema>;
export type CreateCategoryInput = z.infer<typeof createCategoryInputSchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategoryInputSchema>;
export type AssignCategoriesInput = z.infer<typeof assignCategoriesInputSchema>;
export type CreatePlaybackSessionInput = z.infer<typeof createPlaybackSessionInputSchema>;
export type UpdatePlaybackProgressInput = z.infer<typeof updatePlaybackProgressInputSchema>;
export type UpdateProviderConfigInput = z.infer<typeof updateProviderConfigInputSchema>;
export type ImportJob = z.infer<typeof importJobSchema>;
