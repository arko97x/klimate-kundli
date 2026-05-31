/**
 * Safe IMD .env + auth check (never prints secrets).
 * Run on droplet: npm run imd:diagnose
 *
 * Portal test console uses JWT Bearer + API key — not raw key in Authorization.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { loadEnvFile } from "../lib/load-env-file.js";
import {
  imdProbeAuthModes,
  jwtExpiresAtSec,
  loadImdCredentials,
  type ImdCredentials,
} from "../resolvers/imd/client.js";

function parseEnvValue(cwd: string, name: string): { value: string; lineHint: string } | null {
  const path = join(cwd, ".env");
  if (!existsSync(path)) {
    return null;
  }
  const prefix = `${name}=`;
  const lines = readFileSync(path, "utf8").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]!.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    if (!trimmed.startsWith(name)) {
      continue;
    }
    if (new RegExp(`^${name}\\s*=`).test(trimmed)) {
      const raw = trimmed.slice(trimmed.indexOf("=") + 1).trim();
      const value = raw.replace(/^["']|["']$/g, "").replace(/\r$/, "");
      return { value, lineHint: `line ${i + 1}: ${name}=… (${value.length} chars)` };
    }
    return { value: "", lineHint: `line ${i + 1}: malformed ${name}` };
  }
  return null;
}

function printJwtHints(jwt: string): void {
  const parts = jwt.split(".").length;
  if (parts !== 3) {
    console.log("WARN: IMD_JWT_TOKEN should be three dot-separated parts (eyJ...)");
  }
  const exp = jwtExpiresAtSec(jwt);
  if (exp) {
    const expDate = new Date(exp * 1000);
    const ok = expDate.getTime() > Date.now();
    console.log(`JWT exp: ${expDate.toISOString()} ${ok ? "(valid)" : "(EXPIRED — regenerate in portal)"}`);
  }
}

async function main(): Promise<void> {
  const cwd = process.cwd();
  console.log(`Working directory: ${cwd}\n`);

  const apiParsed = parseEnvValue(cwd, "IMD_API_KEY");
  const jwtParsed = parseEnvValue(cwd, "IMD_JWT_TOKEN");

  if (!apiParsed && !jwtParsed) {
    console.log("No IMD_API_KEY= or IMD_JWT_TOKEN= in .env");
    process.exit(1);
  }

  if (apiParsed) {
    console.log(`Found ${apiParsed.lineHint}`);
    if (apiParsed.value.length === 0) {
      console.log("IMD_API_KEY length is 0 — fix .env");
      process.exit(1);
    }
    if (apiParsed.value.split(".").length === 3) {
      console.log("WARN: IMD_API_KEY looks like a JWT — put JWT in IMD_JWT_TOKEN, keep hex key in IMD_API_KEY");
    }
  } else {
    console.log("No IMD_API_KEY= line (optional if JWT works alone)");
  }

  if (jwtParsed) {
    console.log(`Found ${jwtParsed.lineHint}`);
    if (jwtParsed.value.length === 0) {
      console.log("IMD_JWT_TOKEN length is 0 — fix .env");
      process.exit(1);
    }
    printJwtHints(jwtParsed.value);
  } else {
    console.log("\nMISSING IMD_JWT_TOKEN — portal API Test Console needs JWT Bearer.");
    console.log("  1. Log in at https://api.imd.gov.in");
    console.log("  2. Open API Test Console → Generate Sample JWT From Session");
    console.log("  3. Add to .env: IMD_JWT_TOKEN=eyJ...  (one line, no quotes)");
  }

  loadEnvFile();
  const creds = loadImdCredentials();
  console.log(
    `\nprocess.env: apiKey=${creds.apiKey?.length ?? 0} chars, jwt=${creds.jwt?.length ?? 0} chars`,
  );

  try {
    const ipRes = await fetch("https://api.ipify.org?format=json");
    const { ip } = (await ipRes.json()) as { ip?: string };
    if (ip) {
      console.log(`Public IP: ${ip}`);
    }
  } catch {
    // ignore
  }

  console.log("\nAuth probe (cityforecast_mapping):");
  const rows = await imdProbeAuthModes("/api/v1/cityforecast_mapping", creds);
  for (const row of rows) {
    console.log(`  ${row.mode}: HTTP ${row.status} — ${row.error ?? "ok"}`);
  }

  const ok = rows.find((r) => r.status === 200);
  if (ok) {
    console.log(`\nOK — working mode: ${ok.mode}. npm run imd:spike should succeed.`);
    return;
  }

  if (!creds.jwt) {
    console.log("\nAPI key alone failed (expected). Add IMD_JWT_TOKEN from portal test console.");
    return;
  }

  console.log("\nJWT set but still failing:");
  console.log("  • Regenerate JWT in portal (session button) — tokens expire");
  console.log("  • Keep IMD_API_KEY= prod key; Prod IP must match Public IP above");
  console.log("  • Ask IMD for server-side JWT issuance if session tokens cannot run on droplet");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
