import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createCache } from "../cache/store.js";
import { Budget } from "../lib/budget.js";
import { gridKey } from "../lib/grid.js";
import { createHistoricalResolver, historicalCacheKey, type WeatherDaily } from "../resolvers/historical.js";
import type { City } from "../types.js";

const START_YEAR = 1940;
// Keep prewarm cache keys complete. Current-year partial data is fetched on demand.
const END_YEAR = new Date().getUTCFullYear() - 1;
const PREWARM_REQUEST_DELAY_MS = Number(process.env.PREWARM_REQUEST_DELAY_MS ?? 65_000);

async function main(): Promise<void> {
  const cache = createCache();
  const cities = JSON.parse(readFileSync(join(process.cwd(), "src", "data", "prewarm_cities.json"), "utf8")) as City[];
  const resolver = createHistoricalResolver({
    cache,
    prewarmCities: cities,
    openMeteoTimeoutMs: 360_000,
    nasaTimeoutMs: 360_000,
    enableNearestFallback: false,
    onError: (event) =>
      log({
        msg: "prewarm_tier_failed",
        city: event.city.displayName,
        tier: event.tier,
        error: event.error,
      }),
  });
  let skipped = 0;
  let fetched = 0;
  let failed = 0;

  for (const city of cities) {
    const key = historicalCacheKey(city, START_YEAR, END_YEAR);

    if (cache.has(key)) {
      skipped += 1;
      log({ msg: "prewarm_skip", city: city.displayName });
      continue;
    }

    const result = await resolver.resolve(city, `${START_YEAR}-01-01`, `${END_YEAR}-12-31`, new Budget(360_000));
    if (!result) {
      failed += 1;
      log({ msg: "prewarm_failed", city: city.displayName });
      await delay(PREWARM_REQUEST_DELAY_MS);
      continue;
    }

    writeAnnualStats(cache, city, result.daily);
    fetched += 1;
    log({ msg: "prewarm_fetched", city: city.displayName, days: result.daily.length, source: result.source });
    await delay(PREWARM_REQUEST_DELAY_MS);
  }

  log({ msg: "prewarm_done", total: cities.length, fetched, skipped, failed, skipRate: cities.length ? skipped / cities.length : 0 });
}

function writeAnnualStats(cache: ReturnType<typeof createCache>, city: City, daily: WeatherDaily[]): void {
  const grouped = new Map<number, WeatherDaily[]>();

  for (const day of daily) {
    const year = Number(day.date.slice(0, 4));
    grouped.set(year, [...(grouped.get(year) ?? []), day]);
  }

  for (const [year, days] of grouped) {
    cache.set(`hist:stats:v1:${gridKey(city.lat, city.lon)}:${year}`, {
      tmaxMax: max(days.map((day) => day.tmax)),
      tminMin: min(days.map((day) => day.tmin)),
      precipTotal: sum(days.map((day) => day.precip)),
      sourceDays: days.length,
    });
  }
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

function log(payload: Record<string, unknown>): void {
  console.log(JSON.stringify({ t: new Date().toISOString(), ...payload }));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
