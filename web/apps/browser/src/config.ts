import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv();

const configSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4100),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  REDIS_URL: z.string().url().optional(),
  BROWSER_POOL_SIZE: z.coerce.number().int().positive().max(32).default(3),
  EXTRACTION_TIMEOUT_MS: z.coerce.number().int().positive().default(25_000),
  COOKIE_JAR_TTL_SECONDS: z.coerce.number().int().positive().default(6 * 60 * 60),
});

export const appConfig = configSchema.parse(process.env);
