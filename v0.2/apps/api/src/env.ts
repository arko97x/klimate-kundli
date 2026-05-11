// Env loader. The ingest worker shares the same Supabase session-pooler URL
// in v0.2/ingest/.env. We walk upward from this file so `npm run dev:api`
// works regardless of cwd.

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function findEnvFile(): string | null {
  // Walk: apps/api/src → apps/api → apps → v0.2 → repo root.
  // Stop at the first .env found. ingest's .env wins because it has the live
  // Supabase URL and R2 creds; the API only needs SUPABASE_DB_URL + API_PORT.
  const candidates = [
    resolve(__dirname, "../../../ingest/.env"),     // v0.2/ingest/.env (shared)
    resolve(__dirname, "../.env"),                  // apps/api/.env
    resolve(__dirname, "../../../.env"),            // v0.2/.env
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}

const envPath = findEnvFile();
if (envPath) loadDotenv({ path: envPath });

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `[api] env: ${name} is not set. Looked for it in ${envPath ?? "(no .env found)"}.`,
    );
  }
  return v;
}

export const env = {
  SUPABASE_DB_URL: required("SUPABASE_DB_URL"),
  API_PORT: Number(process.env.API_PORT ?? process.env.PORT ?? 3002),
  // CORS allowlist. Vite dev defaults to 5173/5174; tighten in prod.
  WEB_ORIGIN: process.env.WEB_ORIGIN ?? "http://localhost:5174",
  envFileUsed: envPath,
} as const;
