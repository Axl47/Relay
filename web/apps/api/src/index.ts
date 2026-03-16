import { appConfig } from "./config";
import { buildApi } from "./app";

function isTsxChildProcess() {
  return process.execArgv.some((value) => value.includes("tsx/dist/"));
}

const app = await buildApi();
const initialParentPid = process.ppid;
let shuttingDown = false;

const shutdown = async () => {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  await app.close().catch(() => undefined);
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("SIGHUP", shutdown);

if (isTsxChildProcess() && initialParentPid !== 1) {
  setInterval(() => {
    if (process.ppid === 1 || process.ppid !== initialParentPid) {
      void shutdown();
    }
  }, 1_000).unref();
}

await app.listen({
  port: appConfig.PORT,
  host: appConfig.HOST,
});
