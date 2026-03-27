import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { importJobs } from "../db/schema";

export class ImportRepository {
  createJob(userId: string) {
    return db
      .insert(importJobs)
      .values({
        userId,
        status: "pending",
        source: "android-backup",
        summary: {
          status: "scaffolded",
          message: "Worker-side Android backup parsing is not implemented yet.",
        },
      })
      .returning()
      .then((rows) => rows[0]);
  }

  getJob(userId: string, jobId: string) {
    return db
      .select()
      .from(importJobs)
      .where(and(eq(importJobs.id, jobId), eq(importJobs.userId, userId)))
      .limit(1)
      .then((rows) => rows[0] ?? null);
  }
}
