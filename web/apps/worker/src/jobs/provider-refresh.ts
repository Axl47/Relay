import type { Job } from "bullmq";
import { relayProviderRefreshJobResultSchema } from "@relay/contracts";

export async function handleProviderRefreshJob(job: Job) {
  console.log(`[worker] refresh job ${job.id}`, job.data);
  return relayProviderRefreshJobResultSchema.parse({
    refreshedAt: new Date().toISOString(),
  });
}
