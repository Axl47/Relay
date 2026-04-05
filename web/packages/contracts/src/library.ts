import { z } from "zod";
import {
  audioNormalizationSchema,
  externalIdSchema,
  providerContentClassSchema,
  providerIdSchema,
  themePreferenceSchema,
} from "./common";
import {
  animeDetailsSchema,
  episodeListItemViewSchema,
  episodeProgressSchema,
  searchResultKindSchema,
} from "./catalog";

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
  autoplayCountdownSeconds: z.number().int().min(0).default(15),
  preferredQuality: z.string().default("1080p"),
  preferredSubtitleLanguage: z.string().default("en"),
  audioNormalization: audioNormalizationSchema.default("off"),
  progressSaveIntervalSeconds: z.number().int().min(10).default(15),
  watchedThresholdPercent: z.number().int().min(1).max(100).default(90),
  updatesRefreshIntervalMinutes: z.number().int().min(15).default(180),
  theme: themePreferenceSchema.default("relay-dark"),
  coverBasedTheming: z.boolean().default(true),
  adultContentVisible: z.boolean().default(false),
  allowedContentClasses: z.array(providerContentClassSchema).default(["anime", "general"]),
});

export const updateUserPreferencesInputSchema = userPreferencesSchema.partial();

export const categorySchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  name: z.string().min(1),
  position: z.number().int().min(0),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const libraryItemStatusSchema = z.enum(["planned", "watching", "completed", "paused"]);

export const libraryItemSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  providerId: providerIdSchema,
  externalAnimeId: externalIdSchema,
  title: z.string().min(1),
  coverImage: z.string().url().nullable().default(null),
  kind: searchResultKindSchema.default("unknown"),
  status: libraryItemStatusSchema.default("watching"),
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
  libraryItemId: z.string().uuid().nullable().default(null),
  providerId: providerIdSchema,
  externalAnimeId: externalIdSchema,
  externalEpisodeId: externalIdSchema,
  positionSeconds: z.number().nonnegative(),
  durationSeconds: z.number().positive().nullable().default(null),
  percentComplete: z.number().min(0).max(100).default(0),
  completed: z.boolean().default(false),
  updatedAt: z.string(),
});

export const animeDetailViewSchema = z.object({
  anime: animeDetailsSchema,
  libraryItem: libraryItemWithCategoriesSchema.nullable().default(null),
  inLibrary: z.boolean().default(false),
  resumeEpisodeId: externalIdSchema.nullable().default(null),
  resumeEpisodeNumber: z.number().nullable().default(null),
  resumeEpisodeTitle: z.string().nullable().default(null),
  currentEpisodeId: externalIdSchema.nullable().default(null),
  currentEpisodeNumber: z.number().nullable().default(null),
  currentEpisodeTitle: z.string().nullable().default(null),
  episodes: z.array(episodeListItemViewSchema).default([]),
});

export const libraryDashboardItemSchema = libraryItemWithCategoriesSchema.extend({
  totalEpisodes: z.number().int().nullable().default(null),
  progress: episodeProgressSchema.nullable().default(null),
  currentEpisodeId: externalIdSchema.nullable().default(null),
  currentEpisodeNumber: z.number().nullable().default(null),
  currentEpisodeTitle: z.string().nullable().default(null),
  isComplete: z.boolean().default(false),
});

export const libraryDashboardResponseSchema = z.object({
  continueWatching: z.array(libraryDashboardItemSchema).default([]),
  recentlyAdded: z.array(libraryDashboardItemSchema).default([]),
  allItems: z.array(libraryDashboardItemSchema).default([]),
  categories: z.array(categorySchema).default([]),
});

export const upsertLibraryItemInputSchema = z.object({
  providerId: providerIdSchema,
  externalAnimeId: externalIdSchema,
  title: z.string().min(1),
  coverImage: z.string().url().nullable().default(null),
  kind: searchResultKindSchema.default("unknown"),
  status: libraryItemStatusSchema.default("watching"),
});

export const updateLibraryItemInputSchema = z.object({
  status: libraryItemStatusSchema.optional(),
  title: z.string().min(1).optional(),
  coverImage: z.string().url().nullable().optional(),
  kind: searchResultKindSchema.optional(),
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

export type UserPreferences = z.infer<typeof userPreferencesSchema>;
export type UpdateUserPreferencesInput = z.infer<typeof updateUserPreferencesInputSchema>;
export type Category = z.infer<typeof categorySchema>;
export type LibraryItemStatus = z.infer<typeof libraryItemStatusSchema>;
export type LibraryItem = z.infer<typeof libraryItemSchema>;
export type LibraryItemWithCategories = z.infer<typeof libraryItemWithCategoriesSchema>;
export type WatchProgress = z.infer<typeof watchProgressSchema>;
export type AnimeDetailView = z.infer<typeof animeDetailViewSchema>;
export type LibraryDashboardItem = z.infer<typeof libraryDashboardItemSchema>;
export type LibraryDashboardResponse = z.infer<typeof libraryDashboardResponseSchema>;
export type UpsertLibraryItemInput = z.infer<typeof upsertLibraryItemInputSchema>;
export type UpdateLibraryItemInput = z.infer<typeof updateLibraryItemInputSchema>;
export type CreateCategoryInput = z.infer<typeof createCategoryInputSchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategoryInputSchema>;
export type AssignCategoriesInput = z.infer<typeof assignCategoriesInputSchema>;
