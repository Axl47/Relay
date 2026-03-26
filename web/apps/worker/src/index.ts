import { config as loadEnv } from "dotenv";
import { QueueEvents, Worker } from "bullmq";
import {
  relayImportsQueueName,
  relayPlaybackResolutionQueueName,
  relayProviderRefreshQueueName,
} from "@relay/contracts";
import { handleImportsJob } from "./jobs/imports";
import { handlePlaybackResolutionJob } from "./jobs/playback-resolution";
import { handleProviderRefreshJob } from "./jobs/provider-refresh";

loadEnv();

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6380";
const redisConnection = new URL(redisUrl);
const connection = {
  host: redisConnection.hostname,
  port: Number(redisConnection.port || "6380"),
  username: redisConnection.username || undefined,
  password: redisConnection.password || undefined,
  maxRetriesPerRequest: null,
};

async function main() {
  const importWorker = new Worker(relayImportsQueueName, handleImportsJob, { connection });
  const refreshWorker = new Worker(relayProviderRefreshQueueName, handleProviderRefreshJob, {
    connection,
  });
  const playbackWorker = new Worker(
    relayPlaybackResolutionQueueName,
    handlePlaybackResolutionJob,
    { connection },
  );

  const queueEvents = new QueueEvents(relayImportsQueueName, { connection });
  queueEvents.on("completed", ({ jobId }) => {
    console.log(`[worker] import job completed ${jobId}`);
  });

  const shutdown = async () => {
    await Promise.all([
      importWorker.close(),
      refreshWorker.close(),
      playbackWorker.close(),
      queueEvents.close(),
    ]);
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
