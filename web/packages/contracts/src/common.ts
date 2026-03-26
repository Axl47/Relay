import { z } from "zod";

export const providerIdSchema = z.string().min(1);
export const externalIdSchema = z.string().min(1);
export const isoDateSchema = z.string().datetime().or(z.string().min(1));

export const providerContentClassSchema = z.enum(["anime", "hentai", "jav"]);
export const providerExecutionModeSchema = z.enum(["http", "browser"]);
export const playbackProxyModeSchema = z.enum(["proxy", "redirect"]);
export const playbackSessionStatusSchema = z.enum([
  "resolving",
  "ready",
  "failed",
  "expired",
]);
export const providerHealthStatusSchema = z.enum(["healthy", "degraded", "offline"]);
export const providerHealthReasonSchema = z.enum([
  "ok",
  "challenge_failed",
  "parse_failed",
  "rate_limited",
  "upstream_error",
]);
export const episodeWatchStateSchema = z.enum(["unwatched", "in_progress", "watched"]);
export const audioNormalizationSchema = z.enum(["off", "light", "strong"]);
export const themePreferenceSchema = z.enum(["relay-dark"]);
export const catalogProviderSearchStatusSchema = z.enum([
  "success",
  "timeout",
  "error",
  "skipped",
]);

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
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const providerMetadataSchema = z.object({
  id: providerIdSchema,
  displayName: z.string().min(1),
  baseUrl: z.string().url(),
  contentClass: providerContentClassSchema,
  executionMode: providerExecutionModeSchema,
  requiresAdultGate: z.boolean().default(false),
  supportsSearch: z.boolean().default(true),
  supportsTrackerSync: z.boolean().default(false),
  defaultEnabled: z.boolean().default(true),
});

export const providerHealthSchema = z.object({
  providerId: providerIdSchema,
  status: providerHealthStatusSchema.default("healthy"),
  reason: providerHealthReasonSchema.default("ok"),
  checkedAt: z.string(),
});

export type ProviderContentClass = z.infer<typeof providerContentClassSchema>;
export type ProviderExecutionMode = z.infer<typeof providerExecutionModeSchema>;
export type PlaybackProxyMode = z.infer<typeof playbackProxyModeSchema>;
export type PlaybackSessionStatus = z.infer<typeof playbackSessionStatusSchema>;
export type ProviderHealthStatus = z.infer<typeof providerHealthStatusSchema>;
export type ProviderHealthReason = z.infer<typeof providerHealthReasonSchema>;
export type EpisodeWatchState = z.infer<typeof episodeWatchStateSchema>;
export type AudioNormalization = z.infer<typeof audioNormalizationSchema>;
export type ThemePreference = z.infer<typeof themePreferenceSchema>;
export type CatalogProviderSearchStatus = z.infer<typeof catalogProviderSearchStatusSchema>;
export type ProviderAnimeRef = z.infer<typeof providerAnimeRefSchema>;
export type ProviderEpisodeRef = z.infer<typeof providerEpisodeRefSchema>;
export type SearchInput = z.infer<typeof searchInputSchema>;
export type ProviderMetadata = z.infer<typeof providerMetadataSchema>;
export type ProviderHealth = z.infer<typeof providerHealthSchema>;
