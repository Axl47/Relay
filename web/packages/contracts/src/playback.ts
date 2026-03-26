import { z } from "zod";
import {
  playbackProxyModeSchema,
  playbackSessionStatusSchema,
  providerEpisodeRefSchema,
  providerIdSchema,
  externalIdSchema,
} from "./common";
import { animeDetailsSchema, episodeListItemViewSchema } from "./catalog";
import { libraryItemWithCategoriesSchema } from "./library";

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
    "text/html",
  ]),
  headers: z.record(z.string()).default({}),
  cookies: z.record(z.string()).default({}),
  proxyMode: playbackProxyModeSchema.default("proxy"),
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

export const playbackSessionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  providerId: providerIdSchema,
  externalAnimeId: externalIdSchema,
  externalEpisodeId: externalIdSchema,
  status: playbackSessionStatusSchema.default("resolving"),
  proxyMode: playbackProxyModeSchema.default("proxy"),
  streamUrl: z.string().url().nullable().default(null),
  mimeType: z.string().min(1).nullable().default(null),
  subtitles: z.array(resolvedSubtitleTrackSchema).default([]),
  headers: z.record(z.string()).default({}),
  expiresAt: z.string(),
  positionSeconds: z.number().nonnegative().default(0),
  error: z.string().nullable().default(null),
});

export const watchPageContextSchema = z.object({
  anime: animeDetailsSchema,
  libraryItem: libraryItemWithCategoriesSchema.nullable().default(null),
  currentEpisode: episodeListItemViewSchema,
  nextEpisode: episodeListItemViewSchema.nullable().default(null),
  episodes: z.array(episodeListItemViewSchema).default([]),
});

export const createPlaybackSessionInputSchema = providerEpisodeRefSchema.extend({
  libraryItemId: z.string().uuid().nullable().default(null),
});

export const updatePlaybackProgressInputSchema = z.object({
  positionSeconds: z.number().nonnegative(),
  durationSeconds: z.number().positive().nullable().default(null),
});

export const watchContextQuerySchema = providerEpisodeRefSchema.extend({
  libraryItemId: z.string().uuid().optional(),
});

export type ResolvedSubtitleTrack = z.infer<typeof resolvedSubtitleTrackSchema>;
export type ResolvedStream = z.infer<typeof resolvedStreamSchema>;
export type PlaybackResolution = z.infer<typeof playbackResolutionSchema>;
export type PlaybackSession = z.infer<typeof playbackSessionSchema>;
export type WatchPageContext = z.infer<typeof watchPageContextSchema>;
export type CreatePlaybackSessionInput = z.infer<typeof createPlaybackSessionInputSchema>;
export type UpdatePlaybackProgressInput = z.infer<typeof updatePlaybackProgressInputSchema>;
