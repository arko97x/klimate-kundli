// Single shared postgres client. Uses the session pooler URL — same one the
// ingest worker uses — so behaviour matches the data layer exactly.
//
// We expose the `postgres` template-tag instance directly so route handlers
// can write SQL with proper parameter binding:
//
//     const rows = await sql`SELECT * FROM places WHERE slug = ${slug}`;

import postgres from "postgres";
import { env } from "./env.js";

export const sql = postgres(env.SUPABASE_DB_URL, {
  // Supabase pooler accepts a small number of long-lived clients per
  // connection. The serving API is read-only and bursty, so a tiny pool
  // is fine. Bump if we end up running multiple workers behind a load
  // balancer.
  max: 4,
  idle_timeout: 30,
  // Supabase requires TLS but the connection string already encodes it;
  // disabling node's cert check is what `postgres-js` does by default
  // for the pooler URL anyway.
  ssl: "require",
  // Aggregates are immutable from the API's point of view — we never write.
  // The library's prepared-statement cache is per-connection; leaving it on
  // is fine for our hot queries.
  prepare: true,
});

export async function closeDb(): Promise<void> {
  await sql.end({ timeout: 5 });
}
