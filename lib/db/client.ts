import { neon, Pool } from "@neondatabase/serverless";
import { drizzle as drizzleHttp } from "drizzle-orm/neon-http";
import { drizzle as drizzlePool } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

/** Default connection: one-shot HTTP, edge-compatible. Use for almost everything. */
export const db = drizzleHttp(neon(connectionString), { schema });

/** Pooled connection with real sessions. Use only for multi-statement transactions. */
export const dbPool = drizzlePool(new Pool({ connectionString }), { schema });
