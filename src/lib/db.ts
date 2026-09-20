import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

/**
 * SERVER ONLY. Import this from server functions (`*.server.ts`) — never from a
 * component or hook. It holds the database credential and a connection pool.
 *
 * Uses the WebSocket (`Pool`) mode of @neondatabase/serverless rather than the
 * HTTP (`neon`) mode: HTTP cannot do interactive transactions, and `createVisit`
 * needs one to keep the patient upsert, the visit insert, and the audit rows
 * atomic. WebSockets are native on Cloudflare Workers and on Node 22, so the
 * same client works in `vite dev` and in production off one connection string.
 */

if (!neonConfig.webSocketConstructor && typeof globalThis.WebSocket !== "undefined") {
  neonConfig.webSocketConstructor = globalThis.WebSocket;
}

function readDatabaseUrl(): string {
  let url = process.env.DATABASE_URL;

  // Vite does not push non-VITE_ vars into process.env, so in local dev read the
  // .env file directly. On Cloudflare the value arrives as a secret binding.
  if (!url && typeof process.loadEnvFile === "function") {
    try {
      process.loadEnvFile();
      url = process.env.DATABASE_URL;
    } catch {
      // no .env on disk — fall through to the error below
    }
  }

  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and fill in your Neon connection string.",
    );
  }
  return url;
}

let cached: { pool: Pool; db: NeonDatabase<typeof schema> } | null = null;

/** Lazy singleton so merely importing this module never requires DATABASE_URL. */
export function getDb(): NeonDatabase<typeof schema> {
  if (!cached) {
    const pool = new Pool({ connectionString: readDatabaseUrl() });
    cached = { pool, db: drizzle(pool, { schema }) };
  }
  return cached.db;
}

export { schema };
