import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseCsv } from "../lib/csv.js";
import type { Confidence } from "../types.js";

export interface StaticLookup {
  value: number;
  confidence: Confidence;
  reason?: string;
}

export interface StaticData {
  emissions: Map<string, Map<number, number>>;
  seaLevel: Map<number, number>;
  co2Ppm: Map<number, number>;
  latestEmissionsYear(country: string): number | null;
  latestSeaLevelYear(): number | null;
  latestCo2Year(): number | null;
  lookupEmissions(country: string, year: number): StaticLookup;
  lookupSeaLevel(year: number): StaticLookup;
  lookupCo2Ppm(year: number): StaticLookup;
}

export function loadStaticData(dataDir = join(process.cwd(), "src", "data")): StaticData {
  warnIfStale(join(dataDir, "emissions.csv"));
  warnIfStale(join(dataDir, "sea_level.csv"));
  warnIfStale(join(dataDir, "co2_ppm.csv"));

  const emissions = loadEmissions(join(dataDir, "emissions.csv"));
  const seaLevel = loadSeries(join(dataDir, "sea_level.csv"), "mm");
  const co2Ppm = loadSeries(join(dataDir, "co2_ppm.csv"), "ppm");

  return {
    emissions,
    seaLevel,
    co2Ppm,
    latestEmissionsYear(country) {
      return latestYear(emissions.get(country.toUpperCase()) ?? null);
    },
    latestSeaLevelYear() {
      return latestYear(seaLevel);
    },
    latestCo2Year() {
      return latestYear(co2Ppm);
    },
    lookupEmissions(country, year) {
      const series = emissions.get(country.toUpperCase());
      return series ? lookupSeries(series, year) : unavailable("country-not-found");
    },
    lookupSeaLevel(year) {
      return lookupSeries(seaLevel, year);
    },
    lookupCo2Ppm(year) {
      return lookupSeries(co2Ppm, year);
    },
  };
}

export function lookupSeries(series: Map<number, number>, year: number): StaticLookup {
  const exact = series.get(year);
  if (exact !== undefined) {
    return { value: exact, confidence: "high" };
  }

  const years = [...series.keys()].sort((a, b) => a - b);
  if (years.length === 0) {
    return unavailable("no-data");
  }

  const first = years[0];
  const last = years[years.length - 1];

  if (year < first) {
    return { value: mustGet(series, first), confidence: "low", reason: "before-data-start" };
  }

  if (year > last) {
    return { value: mustGet(series, last), confidence: "low", reason: "after-data-end" };
  }

  const upper = years.find((candidate) => candidate > year);
  const lower = [...years].reverse().find((candidate) => candidate < year);

  if (lower === undefined || upper === undefined) {
    return unavailable("no-bracketing-years");
  }

  const lowerValue = mustGet(series, lower);
  const upperValue = mustGet(series, upper);
  const ratio = (year - lower) / (upper - lower);

  return {
    value: lowerValue + (upperValue - lowerValue) * ratio,
    confidence: "low",
    reason: "interpolated",
  };
}

function loadEmissions(path: string): Map<string, Map<number, number>> {
  const rows = parseCsv(readFileSync(path, "utf8"));
  const byCountry = new Map<string, Map<number, number>>();

  for (const row of rows) {
    const country = row.country?.toUpperCase();
    const year = Number(row.year);
    const co2 = Number(row.co2_mt);

    if (!country || !Number.isFinite(year) || !Number.isFinite(co2)) {
      continue;
    }

    const series = byCountry.get(country) ?? new Map<number, number>();
    series.set(year, co2);
    byCountry.set(country, series);
  }

  return byCountry;
}

function loadSeries(path: string, valueColumn: string): Map<number, number> {
  const rows = parseCsv(readFileSync(path, "utf8"));
  const series = new Map<number, number>();

  for (const row of rows) {
    const year = Number(row.year);
    const value = Number(row[valueColumn]);

    if (Number.isFinite(year) && Number.isFinite(value)) {
      series.set(year, value);
    }
  }

  return series;
}

function latestYear(series: Map<number, number> | null): number | null {
  if (!series || series.size === 0) {
    return null;
  }

  return Math.max(...series.keys());
}

function mustGet(series: Map<number, number>, year: number): number {
  const value = series.get(year);
  if (value === undefined) {
    throw new Error(`missing static value for ${year}`);
  }
  return value;
}

function unavailable(reason: string): StaticLookup {
  return { value: Number.NaN, confidence: "unavailable", reason };
}

function warnIfStale(path: string): void {
  const ageMs = Date.now() - statSync(path).mtimeMs;
  const oneYearMs = 366 * 24 * 60 * 60 * 1000;

  if (ageMs > oneYearMs) {
    console.warn(JSON.stringify({ t: new Date().toISOString(), level: "WARN", msg: "static_csv_stale", path }));
  }
}
