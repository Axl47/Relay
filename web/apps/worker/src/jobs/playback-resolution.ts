import type { Job } from "bullmq";
import { relayPlaybackResolutionJobResultSchema } from "@relay/contracts";

export async function handlePlaybackResolutionJob(job: Job) {
  console.log(`[worker] playback resolution job ${job.id}`, job.data);
  return relayPlaybackResolutionJobResultSchema.parse({
    resolvedAt: new Date().toISOString(),
  });
}
