/**
 * Safe IMD .env + auth check (never prints secrets).
 * Run on droplet: npm run imd:diagnose
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { loadEnvFile } from "../lib/load-env-file.js";
import {
  hasImdAuthConfigured,
  hasImdOAuthEnv,
  resolveImdCredentials,
} from "../resolvers/imd/auth.js";
import {
  imdProbeAuthModes,
  jwtExpiresAtSec,
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
    console.log("Note: JWT is not classic 3-part — OK if jwt-bearer+x-api-key returns 200");
  }
  const exp = jwtExpiresAtSec(jwt);
  if (exp) {
    const expDate = new Date(exp * 1000);
    const ok = expDate.getTime() > Date.now();
    console.log(`JWT exp: ${expDate.toISOString()} ${ok ? "(valid)" : "(EXPIRED)"}`);
  }
}

async function main(): Promise<void> {
  const cwd = process.cwd();
  console.log(`Working directory: ${cwd}\n`);

  loadEnvFile();

  const apiParsed = parseEnvValue(cwd, "IMD_API_KEY");
  const jwtParsed = parseEnvValue(cwd, "IMD_JWT_TOKEN");
  const emailParsed = parseEnvValue(cwd, "IMD_EMAIL");
  const passwordParsed = parseEnvValue(cwd, "IMD_PASSWORD");

  if (!apiParsed) {
    console.log("MISSING IMD_API_KEY= in .env (required)");
    process.exit(1);
  }

  console.log(`Found ${apiParsed.lineHint}`);
  if (apiParsed.value.length === 0) {
    console.log("IMD_API_KEY length is 0 — fix .env");
    process.exit(1);
  }
  if (apiParsed.value.split(".").length === 3) {
    console.log("WARN: IMD_API_KEY looks like a JWT — keep hex key in IMD_API_KEY only");
  }

  if (hasImdOAuthEnv()) {
    console.log(`Found ${emailParsed?.lineHint ?? "IMD_EMAIL=…"}`);
    console.log(`Found ${passwordParsed?.lineHint ?? "IMD_PASSWORD=…"}`);
    console.log("Auth mode: oauth/token.php (auto-refresh, 1h TTL)");
  } else if (jwtParsed) {
    console.log(`Found ${jwtParsed.lineHint}`);
    if (jwtParsed.value.length === 0) {
      console.log("IMD_JWT_TOKEN length is 0 — fix .env");
      process.exit(1);
    }
    printJwtHints(jwtParsed.value);
    console.log("Auth mode: static IMD_JWT_TOKEN (manual refresh when expired)");
  } else {
    console.log("\nMISSING JWT source — set IMD_EMAIL + IMD_PASSWORD (recommended) or IMD_JWT_TOKEN.");
    console.log("  OAuth: POST https://api.imd.gov.in/api/oauth/token.php");
    process.exit(1);
  }

  if (!hasImdAuthConfigured()) {
    console.log("\nIncomplete IMD auth config.");
    process.exit(1);
  }

  let creds;
  try {
    creds = await resolveImdCredentials();
  } catch (err) {
    console.error(`\nJWT resolve failed: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  console.log(
    `\nResolved: apiKey=${creds.apiKey?.length ?? 0} chars, jwt=${creds.jwt?.length ?? 0} chars`,
  );
  if (creds.jwt) {
    printJwtHints(creds.jwt);
  }

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

  console.log("\nAuth failed:");
  console.log("  • Check IMD_EMAIL/PASSWORD (portal login) or refresh IMD_JWT_TOKEN");
  console.log("  • Prod IMD_API_KEY IP must match Public IP above");
  console.log("  • Headers: X-API-KEY + Authorization: Bearer <JWT>");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
