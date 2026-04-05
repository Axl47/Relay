import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv();

const configSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z
    .string()
    .default("postgres://relay:relay@localhost:5432/relay_web"),
  SESSION_COOKIE_NAME: z.string().default("relay_session"),
  CORS_ORIGIN: z.string().default("http://localhost:3000,http://localhost:3001"),
  PUBLIC_API_URL: z.string().url().default("http://localhost:4000"),
  BROWSER_SERVICE_URL: z.string().url().default("http://localhost:4100"),
  TMDB_API_KEY: z.string().min(1).optional(),
});

const parsedConfig = configSchema.parse(process.env);

export const appConfig = {
  ...parsedConfig,
  corsOrigins: parsedConfig.CORS_ORIGIN.split(",")
    .map((value) => value.trim())
    .filter(Boolean),
};
