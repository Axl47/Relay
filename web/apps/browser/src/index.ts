import { appConfig } from "./config";
import { buildApp } from "./app";
import { BrowserPool } from "./browser/browser-pool";
import { ProviderContextManager } from "./browser/context-manager";
import {
  CompositeCookieJarStore,
  InMemoryCookieJarStore,
  RedisCookieJarStore,
} from "./cookies/cookie-jar";
import { createDefaultExtractorRegistry } from "./extractors/registry";
import { BrowserExtractionService } from "./extraction-service";

async function main() {
  const memoryCookieJar = new InMemoryCookieJarStore(appConfig.COOKIE_JAR_TTL_SECONDS * 1000);
  const redisCookieJar = appConfig.REDIS_URL
    ? new RedisCookieJarStore(appConfig.REDIS_URL, appConfig.COOKIE_JAR_TTL_SECONDS)
    : null;
  const cookieJar = new CompositeCookieJarStore(memoryCookieJar, redisCookieJar);

  const pool = new BrowserPool(appConfig.BROWSER_POOL_SIZE);
  const contexts = new ProviderContextManager(pool, cookieJar);
  const extractors = createDefaultExtractorRegistry();
  const service = new BrowserExtractionService(contexts, extractors, appConfig.EXTRACTION_TIMEOUT_MS);
  const app = buildApp(service);

  const shutdown = async () => {
    await Promise.allSettled([app.close(), contexts.close(), cookieJar.close()]);
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await app.listen({
    host: appConfig.HOST,
    port: appConfig.PORT,
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
