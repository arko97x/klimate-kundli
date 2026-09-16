import type { Cache } from "../cache/store.js";
import { gridKey } from "./grid.js";
import type { WeatherDaily } from "../resolvers/historical.js";
import type { City } from "../types.js";

export interface AnnualStats {
  tmaxMax: number | null;
  tminMin: number | null;
  precipTotal: number;
  sourceDays: number;
}

export function annualStatsKey(city: Pick<City, "lat" | "lon">, year: number): string {
  return `hist:stats:v1:${gridKey(city.lat, city.lon)}:${year}`;
}

/**
 * Derive one per-year summary from a city's full daily record and write them to the cache.
 * Pure arithmetic over data already held — never fetches. `build-analog-index.ts` reads
 * these keys, so a city missing them drops out of the "how your climate moved" card.
 */
export function writeAnnualStats(cache: Cache, city: Pick<City, "lat" | "lon">, daily: WeatherDaily[]): number {
  const grouped = new Map<number, WeatherDaily[]>();

  for (const day of daily) {
    const year = Number(day.date.slice(0, 4));
    grouped.set(year, [...(grouped.get(year) ?? []), day]);
  }

  for (const [year, days] of grouped) {
    cache.set(annualStatsKey(city, year), {
      tmaxMax: max(days.map((day) => day.tmax)),
      tminMin: min(days.map((day) => day.tmin)),
      precipTotal: sum(days.map((day) => day.precip)),
      sourceDays: days.length,
    } satisfies AnnualStats);
  }

  return grouped.size;
}

function max(values: Array<number | null>): number | null {
  const finite = values.filter((value): value is number => value !== null);
  return finite.length ? Math.max(...finite) : null;
}

function min(values: Array<number | null>): number | null {
  const finite = values.filter((value): value is number => value !== null);
  return finite.length ? Math.min(...finite) : null;
}

function sum(values: Array<number | null>): number {
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}
