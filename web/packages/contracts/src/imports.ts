import { z } from "zod";

export const importJobStatusSchema = z.enum(["pending", "running", "completed", "failed"]);
export const importSourceSchema = z.enum(["android-backup"]);

export const importJobSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  status: importJobStatusSchema,
  source: importSourceSchema,
  summary: z.record(z.unknown()).nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const importJobsResponseSchema = z.object({
  jobs: z.array(importJobSchema).default([]),
});

export type ImportJobStatus = z.infer<typeof importJobStatusSchema>;
export type ImportSource = z.infer<typeof importSourceSchema>;
export type ImportJob = z.infer<typeof importJobSchema>;
export type ImportJobsResponse = z.infer<typeof importJobsResponseSchema>;
