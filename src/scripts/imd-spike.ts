/**
 * Phase 0: probe IMD public APIs (mapping, Delhi station, rainfall).
 * Run on the machine whose IP is whitelisted for the API key.
 *
 *   IMD_API_KEY=... npm run imd:spike
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { loadEnvFile } from "../lib/load-env-file.js";
import {
  imdFetchJson,
  imdProbeAuthModes,
  loadImdCredentials,
  type ImdFetchResult,
} from "../resolvers/imd/client.js";

const DELHI_CITY_FORECAST_ID = "42182";
const DELHI_AWS_CALL_SIGN = "NDL";
const DELHI_STATE_SID = "7";

type SpikeEntry = {
  name: string;
  path: string;
  result: ImdFetchResult;
  notes: string[];
};

function analyze(name: string, path: string, result: ImdFetchResult): SpikeEntry {
  const notes: string[] = [];
  const body = result.body;

  if (!result.ok) {
    notes.push(result.error ?? `HTTP ${result.status}`);
    return { name, path, result, notes };
  }

  if (Array.isArray(body)) {
    notes.push(`array length ${body.length}`);
    if (body.length > 0) {
      notes.push(`sample keys: ${Object.keys(body[0] as object).slice(0, 12).join(", ")}`);
    }
  } else if (body && typeof body === "object") {
    const keys = Object.keys(body);
    notes.push(`object keys (${keys.length}): ${keys.slice(0, 15).join(", ")}`);
    for (const k of ["data", "Data", "DATA"]) {
      const nested = (body as Record<string, unknown>)[k];
      if (Array.isArray(nested)) {
        notes.push(`${k}[] length ${nested.length}`);
      }
    }
  }

  const json = JSON.stringify(body);
  const dateMatches = json.match(/\d{4}-\d{2}-\d{2}/g) ?? [];
  const uniqueDates = [...new Set(dateMatches)];
  if (uniqueDates.length > 0) {
    uniqueDates.sort();
    notes.push(
      `dates in payload: ${uniqueDates.length} unique (${uniqueDates[0]} … ${uniqueDates[uniqueDates.length - 1]})`,
    );
  }

  return { name, path, result, notes };
}

async function main(): Promise<void> {
  loadEnvFile();

  const creds = loadImdCredentials();
  if (!creds.apiKey && !creds.jwt) {
    console.error(
      [
        "Set IMD_API_KEY and/or IMD_JWT_TOKEN in .env.",
        "",
        "Portal test console needs JWT Bearer — see docs/IMD_SETUP.md",
      ].join("\n"),
    );
    process.exit(1);
  }

  if (creds.apiKey) {
    console.log(`IMD_API_KEY loaded (${creds.apiKey.length} characters)`);
  }
  if (creds.jwt) {
    console.log(`IMD_JWT_TOKEN loaded (${creds.jwt.length} characters)`);
  } else {
    console.log("WARN: no IMD_JWT_TOKEN — API key-only calls usually return 401");
  }
  try {
    const ipRes = await fetch("https://api.ipify.org?format=json");
    const ipBody = (await ipRes.json()) as { ip?: string };
    if (ipBody.ip) {
      console.log(`This machine's public IP: ${ipBody.ip}  (must match Prod key on IMD portal)`);
    }
  } catch {
    console.log("(Could not detect public IP — run: curl -4 ifconfig.me)");
  }

  console.log("\nAuth probe on cityforecast_mapping (each header style):");
  const authProbe = await imdProbeAuthModes("/api/v1/cityforecast_mapping", creds);
  for (const row of authProbe) {
    console.log(`  ${row.mode}: HTTP ${row.status} — ${row.error ?? "ok"}`);
  }
  console.log("");

  const probes: { name: string; path: string }[] = [
    { name: "cityforecast_mapping", path: "/api/v1/cityforecast_mapping" },
    { name: "aws_data_mapping", path: "/api/v1/aws_data_mapping" },
    { name: "delhi_cityforecast", path: `/api/v1/cityforecast?id=${DELHI_CITY_FORECAST_ID}` },
    { name: "delhi_cityforecastloc", path: `/api/v1/cityforecastloc?id=${DELHI_CITY_FORECAST_ID}` },
    { name: "delhi_aws_ndl", path: `/api/v1/aws_data?id=${DELHI_AWS_CALL_SIGN}` },
    { name: "delhi_aws_state", path: `/api/v1/aws_data?sid=${DELHI_STATE_SID}` },
    { name: "current_wx_delhi", path: `/api/v1/current_wx?id=${DELHI_AWS_CALL_SIGN}` },
    // District id varies; spike uses a sample from API docs — mapping step will refine.
    { name: "districtrainfall_sample", path: "/api/v1/districtrainfall?id=164" },
  ];

  const entries: SpikeEntry[] = [];
  let workingAuth: string | null = null;

  for (const probe of probes) {
    const result = await imdFetchJson(probe.path, creds);
    if (result.ok && !workingAuth) {
      workingAuth = result.authMode;
    }
    entries.push(analyze(probe.name, probe.path, result));
    await delay(400);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    workingAuthMode: workingAuth,
    probes: entries.map((e) => ({
      name: e.name,
      path: e.path,
      ok: e.result.ok,
      status: e.result.status,
      authMode: e.result.authMode,
      notes: e.notes,
      error: e.result.error,
      // Small preview only (avoid huge JSON in report)
      preview:
        e.result.ok && e.result.body != null
          ? JSON.stringify(e.result.body).slice(0, 800)
          : undefined,
    })),
    nextSteps: buildNextSteps(entries, workingAuth),
  };

  const outDir = join(process.cwd(), "data");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "imd-spike-report.json");
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log("\n=== IMD spike summary ===\n");
  if (workingAuth) {
    console.log(`Auth that worked: ${workingAuth}`);
  } else {
    console.log("No probe succeeded. Check IP whitelist + IMD_API_KEY (see docs/IMD_SETUP.md).");
  }
  for (const e of entries) {
    const mark = e.result.ok ? "OK" : "FAIL";
    console.log(`${mark}  ${e.name}  ${e.notes.join("; ") || e.result.error || ""}`);
  }
  console.log(`\nFull report: ${outPath}\n`);
  for (const step of report.nextSteps) {
    console.log(`• ${step}`);
  }
}

function buildNextSteps(entries: SpikeEntry[], workingAuth: string | null): string[] {
  if (!workingAuth) {
    return [
      "Generate Prod API key with droplet public IP on https://api.imd.gov.in",
      "Set IMD_API_KEY on droplet and re-run: npm run imd:spike",
    ];
  }

  const mapping = entries.find((e) => e.name === "cityforecast_mapping" && e.result.ok);
  const aws = entries.find((e) => e.name === "delhi_aws_ndl" && e.result.ok);
  const city = entries.find((e) => e.name === "delhi_cityforecast" && e.result.ok);

  const steps: string[] = [
    "Spike OK — we can wire IMD_API_KEY into the server and build station mapping from cityforecast_mapping + aws_data_mapping.",
  ];

  if (mapping) {
    steps.push("Use mapping endpoints to link user cities → station codes (prewarm on droplet cache).");
  }
  if (city || aws) {
    const dateNote = [...(city?.notes ?? []), ...(aws?.notes ?? [])].find((n) =>
      n.startsWith("dates in payload"),
    );
    if (dateNote?.includes("1 unique") || dateNote?.includes("2 unique")) {
      steps.push(
        "History looks shallow in public API — plan hybrid: bulk historical ingest (DSP) + API for recent years.",
      );
    } else if (dateNote) {
      steps.push(`Delhi probe: ${dateNote} — may be enough for fan peaks + rainfall years.`);
    }
  }

  steps.push("Fan: override peakTempC from IMD for IN stints; ERA5 + disclaimer elsewhere.");
  steps.push("Tree-ring: aggregate rainfall from aws_data / districtrainfall per lived year.");

  return steps;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
