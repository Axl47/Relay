import { z } from "zod";
import { externalIdSchema, providerIdSchema } from "./common";

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

export const historyEntryViewSchema = historyEntrySchema.extend({
  dayKey: z.string().min(1),
  dayLabel: z.string().min(1),
  timeLabel: z.string().min(1),
});

export const historyDayGroupSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  entries: z.array(historyEntryViewSchema).default([]),
});

export const groupedHistoryResponseSchema = z.object({
  groups: z.array(historyDayGroupSchema).default([]),
});

export type HistoryEntry = z.infer<typeof historyEntrySchema>;
export type HistoryEntryView = z.infer<typeof historyEntryViewSchema>;
export type HistoryDayGroup = z.infer<typeof historyDayGroupSchema>;
export type GroupedHistoryResponse = z.infer<typeof groupedHistoryResponseSchema>;
