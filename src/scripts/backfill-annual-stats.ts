import { join } from "node:path";
import Database from "better-sqlite3";
import { createCache } from "../cache/store.js";
import { writeAnnualStats } from "../lib/annual-stats.js";
import type { WeatherDaily } from "../resolvers/historical.js";

/**
 * Backfills the per-year summary rows (`hist:stats:v1:<grid>:<year>`) for any city that
 * already has a full daily record cached but no summaries to go with it.
 *
 * Why this is needed: prewarm decides whether a city needs work by checking only for the
 * raw daily blob (`isHistoricalCacheWarm`). A blob written before the summary step existed
 * — or written by the live resolver, which never writes summaries — is therefore skipped
 * on every future run and never gains them. `build-analog-index.ts` reads those summaries,
 * so an affected city silently drops out of the "how your climate moved" card.
 *
 * Derives everything from data already in the cache. Never fetches; costs no API quota.
 *
 *   npm run backfill:annual-stats            # report what is missing, change nothing
 *   npm run backfill:annual-stats -- --write # write the missing summaries
 */

const CACHE_PATH = process.env.CACHE_PATH ?? join(process.cwd(), "data", "cache.sqlite");
// A full 1940-2025 record yields 86 yearly rows. Anything far below that is a partial
// write rather than a healthy city, so treat it as missing and rewrite the lot.
const HEALTHY_STATS_ROWS = 80;

interface RawRow {
  key: string;
  value: string;
}

function gridOf(rawKey: string): string | null {
  // hist:raw:v{n}:{lat}:{lon}:{startYear}:{endYear}
  const parts = rawKey.split(":");
  return parts.length === 7 ? `${parts[3]}:${parts[4]}` : null;
}

function main(): void {
  const write = process.argv.includes("--write");
  const db = new Database(CACHE_PATH, { readonly: true, fileMustExist: true });
  const countStats = db.prepare("SELECT COUNT(*) AS c FROM cache WHERE key LIKE ?");
  const rawRows = db.prepare("SELECT key, value FROM cache WHERE key LIKE 'hist:raw:%'").all() as RawRow[];

  const gaps: Array<{ grid: string; key: string; have: number }> = [];
  const seen = new Set<string>();

  for (const row of rawRows) {
    const grid = gridOf(row.key);
    if (!grid || seen.has(grid)) {
      continue;
    }
    seen.add(grid);

    const have = (countStats.get(`hist:stats:v1:${grid}:%`) as { c: number }).c;
    if (have < HEALTHY_STATS_ROWS) {
      gaps.push({ grid, key: row.key, have });
    }
  }

  log({ msg: "scan_complete", rawCities: seen.size, gaps: gaps.length, mode: write ? "write" : "report" });

  for (const gap of gaps) {
    log({ msg: "gap", grid: gap.grid, statsRows: gap.have, source: gap.key });
  }

  if (!write || gaps.length === 0) {
    if (!write && gaps.length > 0) {
      log({ msg: "dry_run", note: "re-run with --write to fill these" });
    }
    db.close();
    return;
  }

  // Reopen writable through the normal cache layer so rows are written exactly as
  // prewarm would write them.
  const readValue = db.prepare("SELECT value FROM cache WHERE key = ?");
  const cache = createCache(CACHE_PATH);
  let filled = 0;

  for (const gap of gaps) {
    const row = readValue.get(gap.key) as { value: string } | undefined;
    if (!row) {
      log({ msg: "backfill_skipped", grid: gap.grid, reason: "raw row vanished" });
      continue;
    }

    let daily: WeatherDaily[];
    try {
      daily = (JSON.parse(row.value) as { daily?: WeatherDaily[] }).daily ?? [];
    } catch {
      log({ msg: "backfill_skipped", grid: gap.grid, reason: "raw value is not parseable JSON" });
      continue;
    }

    if (daily.length === 0) {
      log({ msg: "backfill_skipped", grid: gap.grid, reason: "raw record holds no daily rows" });
      continue;
    }

    const [lat, lon] = gap.grid.split(":").map(Number);
    const years = writeAnnualStats(cache, { lat: lat!, lon: lon! }, daily);
    filled += 1;
    log({ msg: "backfilled", grid: gap.grid, days: daily.length, years });
  }

  log({ msg: "backfill_done", gaps: gaps.length, filled });
  db.close();
}

function log(payload: Record<string, unknown>): void {
  console.log(JSON.stringify({ t: new Date().toISOString(), ...payload }));
}

main();
