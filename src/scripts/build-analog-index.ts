import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { gridKey } from "../lib/grid.js";
import { haversineKm } from "../lib/haversine.js";
import type { AnalogIndex, AnalogIndexCity } from "../resolvers/analog.js";
import type { City } from "../types.js";

/**
 * Builds `src/data/analog_index.json` — the offline, network-free backbone for the
 * "how your climate moved" card. Reads the prewarmed sqlite cache (`hist:stats:v1`
 * per-year rows, available for every prewarmed city) and emits a compact per-city
 * series of {heatCeiling, coldFloor, wetness}. NEVER hits the network.
 *
 *   npm run build:analog-index                # build the index
 *   tsx src/scripts/build-analog-index.ts --preview Kolkata,Mumbai,New Delhi
 */

interface YearTriple {
  h: number; // heat ceiling  — mean annual hottest-day (tmaxMax)
  c: number; // cold floor    — mean annual coldest-day (tminMin)
  w: number; // wetness       — annual precip total (mm)
}

type IndexCity = AnalogIndexCity;

interface StatsRow {
  tmaxMax: number | null;
  tminMin: number | null;
  precipTotal: number | null;
  sourceDays: number;
}

const DATA_DIR = join(process.cwd(), "src", "data");
const CACHE_PATH = process.env.CACHE_PATH ?? join(process.cwd(), "data", "cache.sqlite");
const OUT_PATH = join(DATA_DIR, "analog_index.json");
// A year needs near-full daily coverage to trust its extremes/precip totals.
const MIN_SOURCE_DAYS = 350;

function loadCities(): City[] {
  const files = ["prewarm_cities.json", "prewarm_cities_global_500.json"];
  const byGrid = new Map<string, City>();

  for (const file of files) {
    const cities = JSON.parse(readFileSync(join(DATA_DIR, file), "utf8")) as City[];
    for (const city of cities) {
      const key = gridKey(city.lat, city.lon);
      // First writer wins; prewarm_cities.json (India-rich) is listed first.
      if (!byGrid.has(key)) {
        byGrid.set(key, city);
      }
    }
  }

  return [...byGrid.values()];
}

function build(): AnalogIndex {
  const db = new Database(CACHE_PATH, { readonly: true, fileMustExist: true });
  const cities = loadCities();
  const stmt = db.prepare("SELECT key, value FROM cache WHERE key LIKE ?");

  const indexCities: IndexCity[] = [];
  let citiesWithData = 0;

  for (const city of cities) {
    const grid = gridKey(city.lat, city.lon);
    const rows = stmt.all(`hist:stats:v1:${grid}:%`) as Array<{ key: string; value: string }>;
    const years: Record<string, [number, number, number]> = {};

    for (const row of rows) {
      const year = row.key.slice(row.key.lastIndexOf(":") + 1);
      if (!/^\d{4}$/.test(year)) continue;

      let stats: StatsRow;
      try {
        stats = JSON.parse(row.value) as StatsRow;
      } catch {
        continue;
      }

      if (
        stats.sourceDays < MIN_SOURCE_DAYS ||
        stats.tmaxMax === null ||
        stats.tminMin === null ||
        stats.precipTotal === null
      ) {
        continue;
      }

      years[year] = [stats.tmaxMax, stats.tminMin, stats.precipTotal];
    }

    if (Object.keys(years).length === 0) continue;
    citiesWithData += 1;

    indexCities.push({
      name: city.name,
      displayName: city.displayName,
      lat: city.lat,
      lon: city.lon,
      country: city.country,
      admin1: city.admin1,
      grid,
      years,
    });
  }

  db.close();
  log({ msg: "index_built", cities: cities.length, withData: citiesWithData });

  return { builtAt: new Date().toISOString(), minSourceDays: MIN_SOURCE_DAYS, cities: indexCities };
}

// ---------------------------------------------------------------------------
// Preview: the same matching math the resolver will use, so we can eyeball
// real analogs before building anything on top of the index.
// ---------------------------------------------------------------------------

function windowMean(city: IndexCity, start: number, end: number): YearTriple | null {
  const acc = { h: 0, c: 0, w: 0, n: 0 };
  for (let y = start; y <= end; y += 1) {
    const t = city.years[String(y)];
    if (!t) continue;
    acc.h += t[0];
    acc.c += t[1];
    acc.w += t[2];
    acc.n += 1;
  }
  if (acc.n === 0) return null;
  return { h: acc.h / acc.n, c: acc.c / acc.n, w: acc.w / acc.n };
}

function latestYear(city: IndexCity): number {
  return Math.max(...Object.keys(city.years).map(Number));
}

interface Normalizer {
  mean: YearTriple;
  sd: YearTriple;
}

function presentFingerprints(cities: IndexCity[], presentSpan = 10): Map<string, YearTriple> {
  const out = new Map<string, YearTriple>();
  for (const city of cities) {
    const end = latestYear(city);
    const fp = windowMean(city, end - presentSpan + 1, end);
    if (fp) out.set(city.grid, fp);
  }
  return out;
}

function normalizer(fps: Iterable<YearTriple>): Normalizer {
  const arr = [...fps];
  const m = { h: 0, c: 0, w: 0 };
  for (const f of arr) {
    m.h += f.h;
    m.c += f.c;
    m.w += f.w;
  }
  m.h /= arr.length;
  m.c /= arr.length;
  m.w /= arr.length;

  const v = { h: 0, c: 0, w: 0 };
  for (const f of arr) {
    v.h += (f.h - m.h) ** 2;
    v.c += (f.c - m.c) ** 2;
    v.w += (f.w - m.w) ** 2;
  }
  return {
    mean: m,
    sd: {
      h: Math.sqrt(v.h / arr.length) || 1,
      c: Math.sqrt(v.c / arr.length) || 1,
      w: Math.sqrt(v.w / arr.length) || 1,
    },
  };
}

function zDist(a: YearTriple, b: YearTriple, n: Normalizer): number {
  const dh = (a.h - b.h) / n.sd.h;
  const dc = (a.c - b.c) / n.sd.c;
  const dw = (a.w - b.w) / n.sd.w;
  return Math.sqrt(dh * dh + dc * dc + dw * dw);
}

function bearing(from: IndexCity, to: IndexCity): string {
  const dLat = to.lat - from.lat;
  const dLon = to.lon - from.lon;
  const ns = dLat >= 0 ? "N" : "S";
  const ew = dLon >= 0 ? "E" : "W";
  // Dominant axis first for a readable "south / southeast" style label.
  if (Math.abs(dLat) >= Math.abs(dLon) * 2) return dLat >= 0 ? "north" : "south";
  if (Math.abs(dLon) >= Math.abs(dLat) * 2) return dLon >= 0 ? "east" : "west";
  return `${ns.toLowerCase() === "n" ? "north" : "south"}${ew.toLowerCase() === "e" ? "east" : "west"}`;
}

function preview(index: AnalogIndex, queries: string[]): void {
  const present = presentFingerprints(index.cities);
  const norm = normalizer(present.values());
  // A visitor born ~1990 → childhood window 1990–2005 (age 0–15).
  const childStart = 1990;
  const childEnd = 2005;

  for (const q of queries) {
    const home = index.cities.find(
      (c) => c.name.toLowerCase() === q.toLowerCase() || c.displayName.toLowerCase().includes(q.toLowerCase()),
    );
    if (!home) {
      log({ msg: "preview_not_found", query: q });
      continue;
    }

    const childFp = windowMean(home, childStart, childEnd);
    if (!childFp) {
      log({ msg: "preview_no_childhood_window", city: home.name });
      continue;
    }

    let best: { city: IndexCity; d: number } | null = null;
    for (const cand of index.cities) {
      if (cand.grid === home.grid) continue;
      const fp = present.get(cand.grid);
      if (!fp) continue;
      const d = zDist(childFp, fp, norm);
      // Skip trivial neighbours — we want a place that MOVED, not the next town over.
      if (haversineKm(home, cand) < 50) continue;
      if (!best || d < best.d) best = { city: cand, d };
    }

    const homeNow = present.get(home.grid);
    if (!best) {
      log({ msg: "preview_no_analog", city: home.name });
      continue;
    }

    const km = Math.round(haversineKm(home, best.city));
    console.log(
      `\n${home.displayName}`,
      `\n  childhood(${childStart}-${childEnd}): heat=${childFp.h.toFixed(1)}°C cold=${childFp.c.toFixed(1)}°C rain=${Math.round(childFp.w)}mm`,
      homeNow ? `\n  today:                heat=${homeNow.h.toFixed(1)}°C cold=${homeNow.c.toFixed(1)}°C rain=${Math.round(homeNow.w)}mm` : "",
      `\n  → that childhood climate now lives in: ${best.city.displayName}`,
      `\n    ${km} km ${bearing(home, best.city)}  (z-dist ${best.d.toFixed(2)})`,
    );
  }
}

function log(payload: Record<string, unknown>): void {
  console.log(JSON.stringify({ t: new Date().toISOString(), ...payload }));
}

function main(): void {
  const args = process.argv.slice(2);
  const previewIdx = args.indexOf("--preview");

  const index = build();

  if (previewIdx === -1) {
    writeFileSync(OUT_PATH, JSON.stringify(index));
    log({ msg: "index_written", path: OUT_PATH, cities: index.cities.length });
  } else {
    const queries = (args[previewIdx + 1] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    preview(index, queries.length ? queries : ["Kolkata", "Mumbai", "New Delhi"]);
  }
}

main();
