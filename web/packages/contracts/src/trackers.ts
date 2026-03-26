import { z } from "zod";

export const trackerIdSchema = z.enum(["anilist", "mal"]);

export const trackerAccountSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  trackerId: trackerIdSchema,
  status: z.string().min(1),
  createdAt: z.string(),
});

export const trackerEntrySchema = z.object({
  id: z.string().uuid(),
  trackerAccountId: z.string().uuid(),
  libraryItemId: z.string().uuid(),
  progress: z.number().int().nonnegative(),
  status: z.string().min(1),
  score: z.number().int().nullable().default(null),
  updatedAt: z.string(),
});

export const trackerEntriesResponseSchema = z.object({
  accounts: z.array(trackerAccountSchema).default([]),
  entries: z.array(trackerEntrySchema).default([]),
  supported: z.array(trackerIdSchema).default([]),
});

export const trackerConnectionResponseSchema = trackerAccountSchema.extend({
  note: z.string().nullable().default(null),
});

export type TrackerId = z.infer<typeof trackerIdSchema>;
export type TrackerAccount = z.infer<typeof trackerAccountSchema>;
export type TrackerEntry = z.infer<typeof trackerEntrySchema>;
export type TrackerEntriesResponse = z.infer<typeof trackerEntriesResponseSchema>;
export type TrackerConnectionResponse = z.infer<typeof trackerConnectionResponseSchema>;
