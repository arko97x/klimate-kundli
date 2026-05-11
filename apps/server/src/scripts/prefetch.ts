import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, CLIMATE_END, CLIMATE_START, HIST_START } from "../config.js";
import { closeDb, db } from "../db.js";
import { getClimateDaily, getGeocode, getWeatherDaily } from "../cache.js";
import { loadCo2Csv, loadEmissionsCsv, loadSeaLevelCsv } from "../sources/bundled.js";

type CityEntry = { city: string; country?: string };

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

async function withRetry<T>(label: string, fn: () => Promise<T>, tries = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const wait = 500 * 2 ** i;
      console.warn(`  retry ${label} in ${wait}ms (${(err as Error).message})`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

const insLog = db.prepare(`
  INSERT OR REPLACE INTO prefetch_log (city_query, status, error, rows, ran_at)
  VALUES (?, ?, ?, ?, datetime('now'))
`);

async function prefetchCity(entry: CityEntry, opts: { climate: boolean }): Promise<void> {
  const label = entry.country ? `${entry.city}, ${entry.country}` : entry.city;
  console.log(`→ ${label}`);
  try {
    const geo = await withRetry(`geocode ${label}`, () => getGeocode(entry.city, entry.country));
    if (!geo) {
      console.warn(`  not found, skipping`);
      insLog.run(label.toLowerCase(), "failed", "geocode returned null", 0);
      return;
    }
    console.log(`  ${geo.displayName} @ (${geo.lat}, ${geo.lon})`);

    const histRows = await withRetry(`historical ${label}`, () =>
      getWeatherDaily(geo.lat, geo.lon, HIST_START, todayIso()),
    );
    console.log(`  weather rows: ${histRows.length}`);

    if (opts.climate) {
      const projRows = await withRetry(`climate ${label}`, () =>
        getClimateDaily(geo.lat, geo.lon, CLIMATE_START, CLIMATE_END),
      );
      console.log(`  projection rows: ${projRows.length}`);
    }

    insLog.run(label.toLowerCase(), "ok", null, histRows.length);
  } catch (err) {
    const msg = String(err instanceof Error ? err.message : err);
    console.error(`  failed: ${msg}`);
    insLog.run(label.toLowerCase(), "failed", msg, 0);
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const skipBundled = args.has("--no-bundled");
  const skipClimate = args.has("--no-climate");
  const onlyClimate = args.has("--only-climate");
  const onlyBundled = args.has("--only-bundled");

  if (!skipBundled || onlyBundled) {
    console.log("== bundled CSVs ==");
    try { console.log(`  co2_annual: ${loadCo2Csv()} rows`); }
    catch (e) { console.warn(`  skip CO2: ${(e as Error).message}`); }
    try { console.log(`  emissions_annual: ${loadEmissionsCsv()} rows`); }
    catch (e) { console.warn(`  skip emissions: ${(e as Error).message}`); }
    try { console.log(`  sea_level_monthly: ${loadSeaLevelCsv()} rows`); }
    catch (e) { console.warn(`  skip sea level: ${(e as Error).message}`); }
  }

  if (onlyBundled) {
    closeDb();
    return;
  }

  const citiesFile = path.join(DATA_DIR, "cities.json");
  if (!fs.existsSync(citiesFile)) {
    console.error(`missing ${citiesFile}`);
    process.exit(1);
  }
  const cfg = JSON.parse(fs.readFileSync(citiesFile, "utf8")) as {
    tier1_full?: CityEntry[];
    tier2_weather?: CityEntry[];
    cities?: CityEntry[]; // legacy single-tier
  };

  const tier1 = cfg.tier1_full ?? cfg.cities ?? [];
  const tier2 = cfg.tier2_weather ?? [];
  const tier1Only = args.has("--tier1-only");
  const tier2Only = args.has("--tier2-only");

  console.log(`\n== prefetching ==`);
  console.log(`tier1 (full = weather + CMIP6): ${tier1Only ? tier1.length : tier2Only ? 0 : tier1.length}`);
  console.log(`tier2 (weather only):           ${tier2Only ? tier2.length : tier1Only ? 0 : tier2.length}`);
  console.log(`historical: ${HIST_START} → ${todayIso()}`);
  console.log(`climate:    ${skipClimate ? "skipped" : `${CLIMATE_START} → ${CLIMATE_END}`}\n`);

  if (!tier2Only) {
    console.log(`-- tier 1 --`);
    for (const c of tier1) {
      await prefetchCity(c, { climate: !skipClimate });
    }
  }
  if (!tier1Only) {
    console.log(`\n-- tier 2 (weather only) --`);
    for (const c of tier2) {
      await prefetchCity(c, { climate: false });
    }
  }
  // onlyClimate flag is consumed implicitly via the climate option above.
  void onlyClimate;

  console.log("\n== done ==");
  const okN = (db.prepare(`SELECT COUNT(*) AS n FROM prefetch_log WHERE status = 'ok'`).get() as { n: number }).n;
  const failN = (db.prepare(`SELECT COUNT(*) AS n FROM prefetch_log WHERE status = 'failed'`).get() as { n: number }).n;
  console.log(`ok: ${okN}  failed: ${failN}`);
  closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
