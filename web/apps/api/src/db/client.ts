import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { appConfig } from "../config";

export const pgPool = new Pool({
  connectionString: appConfig.DATABASE_URL,
});

export const db = drizzle(pgPool);
