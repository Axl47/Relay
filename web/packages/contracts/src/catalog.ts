import { z } from "zod";
import {
  catalogProviderSearchStatusSchema,
  externalIdSchema,
  providerAnimeRefSchema,
  providerContentClassSchema,
  providerIdSchema,
} from "./common";

export const searchResultKindSchema = z.enum(["tv", "movie", "ova", "special", "unknown"]);

export const searchResultSchema = z.object({
  providerId: providerIdSchema,
  providerDisplayName: z.string().min(1),
  externalAnimeId: externalIdSchema,
  title: z.string().min(1),
  synopsis: z.string().nullable().default(null),
  coverImage: z.string().url().nullable().default(null),
  year: z.number().int().nullable().default(null),
  kind: searchResultKindSchema.default("unknown"),
  language: z.string().min(1).default("en"),
  contentClass: providerContentClassSchema.default("anime"),
  requiresAdultGate: z.boolean().default(false),
});

export const searchPageSchema = z.object({
  providerId: providerIdSchema,
  query: z.string().min(1),
  page: z.number().int().min(1),
  hasNextPage: z.boolean().default(false),
  items: z.array(searchResultSchema),
});

export const catalogSearchProviderResultSchema = z.object({
  providerId: providerIdSchema,
  displayName: z.string().min(1),
  contentClass: providerContentClassSchema,
  status: catalogProviderSearchStatusSchema.default("success"),
  latencyMs: z.number().int().nonnegative().nullable().default(null),
  error: z.string().nullable().default(null),
  items: z.array(searchResultSchema).default([]),
});

export const catalogSearchResponseSchema = z.object({
  query: z.string().min(1),
  page: z.number().int().min(1),
  limit: z.number().int().min(1),
  partial: z.boolean().default(false),
  providers: z.array(catalogSearchProviderResultSchema).default([]),
  items: z.array(searchResultSchema).default([]),
});

export const catalogSearchLastResponseSchema = z.object({
  result: catalogSearchResponseSchema.nullable().default(null),
  cachedAt: z.string().nullable().default(null),
  expiresAt: z.string().nullable().default(null),
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

export const animeStatusSchema = z.enum(["ongoing", "completed", "hiatus", "unknown"]);

export const animeDetailsSchema = z.object({
  providerId: providerIdSchema,
  providerDisplayName: z.string().min(1),
  externalAnimeId: externalIdSchema,
  title: z.string().min(1),
  synopsis: z.string().nullable().default(null),
  coverImage: z.string().url().nullable().default(null),
  bannerImage: z.string().url().nullable().default(null),
  status: animeStatusSchema.default("unknown"),
  year: z.number().int().nullable().default(null),
  tags: z.array(z.string()).default([]),
  language: z.string().min(1).default("en"),
  totalEpisodes: z.number().int().nullable().default(null),
  contentClass: providerContentClassSchema.default("anime"),
  requiresAdultGate: z.boolean().default(false),
});

export const episodeProgressSchema = z.object({
  positionSeconds: z.number().nonnegative(),
  durationSeconds: z.number().positive().nullable().default(null),
  percentComplete: z.number().min(0).max(100).default(0),
  completed: z.boolean().default(false),
  updatedAt: z.string(),
});

export const episodeListItemViewSchema = episodeSummarySchema.extend({
  state: z.enum(["unwatched", "in_progress", "watched"]).default("unwatched"),
  progress: episodeProgressSchema.nullable().default(null),
  isCurrent: z.boolean().default(false),
  isNowPlaying: z.boolean().default(false),
});

export const catalogAnimeQuerySchema = providerAnimeRefSchema;
export const catalogAnimeViewQuerySchema = providerAnimeRefSchema;
export const catalogEpisodesQuerySchema = providerAnimeRefSchema;

export const mediaProxyQuerySchema = z.object({
  url: z.string().url(),
});

export const catalogSearchStreamProgressProviderSchema = z.object({
  providerId: providerIdSchema,
  status: catalogProviderSearchStatusSchema,
  itemCount: z.number().int().nonnegative(),
  latencyMs: z.number().int().nonnegative().nullable().default(null),
});

export const catalogSearchStreamStartEventSchema = z.object({
  type: z.literal("start"),
  completedProviders: z.number().int().nonnegative(),
  totalProviders: z.number().int().nonnegative(),
});

export const catalogSearchStreamProgressEventSchema = z.object({
  type: z.literal("progress"),
  completedProviders: z.number().int().nonnegative(),
  totalProviders: z.number().int().nonnegative(),
  provider: catalogSearchStreamProgressProviderSchema,
});

export const catalogSearchStreamDoneEventSchema = z.object({
  type: z.literal("done"),
  response: catalogSearchResponseSchema,
});

export const catalogSearchStreamErrorEventSchema = z.object({
  type: z.literal("error"),
  message: z.string().min(1),
});

export const catalogSearchStreamEventSchema = z.discriminatedUnion("type", [
  catalogSearchStreamStartEventSchema,
  catalogSearchStreamProgressEventSchema,
  catalogSearchStreamDoneEventSchema,
  catalogSearchStreamErrorEventSchema,
]);

export type SearchResult = z.infer<typeof searchResultSchema>;
export type SearchPage = z.infer<typeof searchPageSchema>;
export type CatalogSearchProviderResult = z.infer<typeof catalogSearchProviderResultSchema>;
export type CatalogSearchResponse = z.infer<typeof catalogSearchResponseSchema>;
export type CatalogSearchLastResponse = z.infer<typeof catalogSearchLastResponseSchema>;
export type EpisodeSummary = z.infer<typeof episodeSummarySchema>;
export type EpisodeList = z.infer<typeof episodeListSchema>;
export type AnimeDetails = z.infer<typeof animeDetailsSchema>;
export type EpisodeProgress = z.infer<typeof episodeProgressSchema>;
export type EpisodeListItemView = z.infer<typeof episodeListItemViewSchema>;
export type CatalogSearchStreamProgressProvider = z.infer<
  typeof catalogSearchStreamProgressProviderSchema
>;
export type CatalogSearchStreamStartEvent = z.infer<
  typeof catalogSearchStreamStartEventSchema
>;
export type CatalogSearchStreamProgressEvent = z.infer<
  typeof catalogSearchStreamProgressEventSchema
>;
export type CatalogSearchStreamDoneEvent = z.infer<
  typeof catalogSearchStreamDoneEventSchema
>;
export type CatalogSearchStreamErrorEvent = z.infer<
  typeof catalogSearchStreamErrorEventSchema
>;
export type CatalogSearchStreamEvent = z.infer<typeof catalogSearchStreamEventSchema>;
