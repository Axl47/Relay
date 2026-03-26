import type { Job } from "bullmq";
import { relayImportsJobResultSchema } from "@relay/contracts";

export async function handleImportsJob(job: Job) {
  console.log(`[worker] import job ${job.id}`, job.data);
  return relayImportsJobResultSchema.parse({
    status: "completed",
    imported: 0,
    skipped: ["android_backup_parser_not_implemented"],
  });
}
