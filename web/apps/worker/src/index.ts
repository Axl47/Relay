import { config as loadEnv } from "dotenv";
import { QueueEvents, Worker } from "bullmq";

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
  const importWorker = new Worker(
    "relay-imports",
    async (job) => {
      console.log(`[worker] import job ${job.id}`, job.data);
      return {
        status: "completed",
        imported: 0,
        skipped: ["android_backup_parser_not_implemented"],
      };
    },
    { connection },
  );

  const refreshWorker = new Worker(
    "relay-provider-refresh",
    async (job) => {
      console.log(`[worker] refresh job ${job.id}`, job.data);
      return {
        refreshedAt: new Date().toISOString(),
      };
    },
    { connection },
  );

  const playbackWorker = new Worker(
    "relay-playback-resolution",
    async (job) => {
      console.log(`[worker] playback resolution job ${job.id}`, job.data);
      return {
        resolvedAt: new Date().toISOString(),
      };
    },
    { connection },
  );

  const queueEvents = new QueueEvents("relay-imports", { connection });
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
