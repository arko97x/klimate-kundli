import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createCache } from "../cache/store.js";
import { Budget } from "../lib/budget.js";
import { gridKey } from "../lib/grid.js";
import { createHistoricalResolver, historicalCacheKey, type WeatherDaily } from "../resolvers/historical.js";
import type { City } from "../types.js";

const START_YEAR = 1940;
// TODO(2026-12-15): Cache-key churn on Jan 1 invalidates all prewarmed cities annually.
// Pick a fix before next New Year: either freeze END_YEAR as a const and refresh manually,
// or refactor resolver to fetch year-deltas against per-year hist:stats:v1 keys.
const END_YEAR = new Date().getUTCFullYear() - 1;

// At START_YEAR=1940 each request costs ~2200 Open-Meteo calls (86 years ÷ 2-week chunks).
// Hourly limit is 5000 calls → safe ceiling is 2 requests/hour → 30 min between requests.
const PREWARM_REQUEST_DELAY_MS = Number(process.env.PREWARM_REQUEST_DELAY_MS ?? 1_800_000);

// Patterns to classify Open-Meteo's in-band rate-limit errors.
// LOGGING-ONLY: only the daily pattern feeds control flow (via dailyLimitHit).
// Open-Meteo could reword these strings — keep this brittle path out of resolver logic.
const DAILY_LIMIT_PATTERN = /daily.*limit exceeded/i;
const HOURLY_LIMIT_PATTERN = /hourly.*limit exceeded/i;
const MINUTE_LIMIT_PATTERN = /minute.*limit exceeded/i;

async function main(): Promise<void> {
  const cache = createCache();
  const cities = JSON.parse(readFileSync(join(process.cwd(), "src", "data", "prewarm_cities.json"), "utf8")) as City[];

  // Set by onError when Open-Meteo signals daily quota exhaustion.
  // Daily limit doesn't refill until midnight UTC, so halting cleanly is the only sane response.
  let dailyLimitHit = false;

  const resolver = createHistoricalResolver({
    cache,
    prewarmCities: cities,
    openMeteoTimeoutMs: 360_000,
    nasaTimeoutMs: 360_000,
    enableNearestFallback: false,
    onError: (event) => {
      const err = event.error;
      if (DAILY_LIMIT_PATTERN.test(err)) {
        dailyLimitHit = true;
        log({ msg: "rate_limit_daily", city: event.city.displayName, tier: event.tier });
      } else if (HOURLY_LIMIT_PATTERN.test(err)) {
        log({ msg: "rate_limit_hourly", city: event.city.displayName, tier: event.tier });
      } else if (MINUTE_LIMIT_PATTERN.test(err)) {
        log({ msg: "rate_limit_minute", city: event.city.displayName, tier: event.tier });
      } else if (err.startsWith("skipped:")) {
        // Intentional skip (e.g., NASA pre-1981), not a failure. Different log msg so it doesn't read as one.
        log({ msg: "tier_skipped", city: event.city.displayName, tier: event.tier, reason: err });
      } else {
        log({ msg: "prewarm_tier_failed", city: event.city.displayName, tier: event.tier, error: err });
      }
    },
  });

  let skipped = 0;
  let fetched = 0;
  let failed = 0;

  for (const city of cities) {
    if (dailyLimitHit) {
      log({
        msg: "prewarm_halt_daily_limit",
        processed: fetched + skipped + failed,
        remaining: cities.length - (fetched + skipped + failed),
        note: "Daily Open-Meteo quota exhausted. Re-run after midnight UTC to resume.",
      });
      break;
    }

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
      if (!dailyLimitHit) {
        await delay(PREWARM_REQUEST_DELAY_MS);
      }
      continue;
    }

    writeAnnualStats(cache, city, result.daily);
    fetched += 1;
    log({ msg: "prewarm_fetched", city: city.displayName, days: result.daily.length, source: result.source });
    if (!dailyLimitHit) {
      await delay(PREWARM_REQUEST_DELAY_MS);
    }
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