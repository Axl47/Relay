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
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
});

export const appConfig = configSchema.parse(process.env);
