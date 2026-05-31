/**
 * Safe IMD .env + auth check (never prints the key).
 * Run on droplet: npm run imd:diagnose
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { loadEnvFile } from "../lib/load-env-file.js";
import { imdProbeAuthModes } from "../resolvers/imd/client.js";

function parseImdKeyFromEnvFile(cwd: string): { key: string; lineHint: string } | null {
  const path = join(cwd, ".env");
  if (!existsSync(path)) {
    return null;
  }
  const lines = readFileSync(path, "utf8").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    if (!trimmed.startsWith("IMD_API_KEY")) {
      continue;
    }
    if (/^IMD_API_KEY\s*=/.test(trimmed)) {
      const raw = trimmed.slice(trimmed.indexOf("=") + 1).trim();
      const key = raw.replace(/^["']|["']$/g, "").replace(/\r$/, "");
      return { key, lineHint: `line ${i + 1}: IMD_API_KEY=… (${key.length} chars)` };
    }
    return { key: "", lineHint: `line ${i + 1}: malformed (use IMD_API_KEY=value, no spaces around =)` };
  }
  return null;
}

async function main(): Promise<void> {
  const cwd = process.cwd();
  console.log(`Working directory: ${cwd}\n`);

  const parsed = parseImdKeyFromEnvFile(cwd);
  if (!parsed) {
    console.log("No IMD_API_KEY= line in .env");
    process.exit(1);
  }
  console.log(`Found ${parsed.lineHint}`);

  if (parsed.key.length === 0) {
    console.log("\nKey length is 0 — fix .env (exactly: IMD_API_KEY=your_key_with_no_spaces_around_equals)");
    process.exit(1);
  }

  loadEnvFile();
  const fromProcess = process.env.IMD_API_KEY?.trim() ?? "";
  console.log(`process.env after loadEnvFile: ${fromProcess.length} chars`);

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
  const rows = await imdProbeAuthModes("/api/v1/cityforecast_mapping", parsed.key);
  for (const row of rows) {
    console.log(`  ${row.mode}: HTTP ${row.status} — ${row.error ?? "ok"}`);
  }

  const raw = rows.find((r) => r.mode === "authorization-raw");
  if (raw?.status === 200) {
    console.log("\nOK — use Authorization: <key> (no Bearer). npm run imd:spike should work after git pull.");
    return;
  }

  console.log("\nStill failing:");
  console.log("  • Regenerate Prod key on https://api.imd.gov.in (match Public IP above)");
  console.log("  • Paste into .env as one line: IMD_API_KEY=paste_here");
  console.log("  • Email sankar.nath@imd.gov.in if length > 0 but all probes fail");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
