import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SqliteCache } from "../src/cache/store.js";
import { Budget } from "../src/lib/budget.js";
import {
  createHistoricalResolver,
  historicalCacheKey,
  historicalCacheKeyV1,
  historicalCacheKeyV2,
  type HistoricalWeatherResult,
} from "../src/resolvers/historical.js";
import type { City } from "../src/types.js";

const tempDirs: string[] = [];

const delhi: City = {
  name: "New Delhi",
  displayName: "New Delhi, Delhi, India",
  lat: 28.6139,
  lon: 77.209,
  country: "IN",
};

const mumbai: City = {
  name: "Mumbai",
  displayName: "Mumbai (Bombay), Maharashtra, India",
  lat: 19.076,
  lon: 72.8777,
  country: "IN",
};

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tempCache(): SqliteCache {
  const dir = mkdtempSync(join(tmpdir(), "klimate-hist-"));
  tempDirs.push(dir);
  return new SqliteCache(join(dir, "cache.sqlite"));
}

describe("historical resolver", () => {
  it("fetches Open-Meteo era5_seamless with full-year cache ranges", async () => {
    const cache = tempCache();
    let requestedStart = "";
    let requestedModels = "";
    const fetchImpl: typeof fetch = async (input) => {
      const url = new URL(String(input));
      requestedStart = url.searchParams.get("start_date") ?? "";
      requestedModels = url.searchParams.get("models") ?? "";
      return new Response(
        JSON.stringify({
          daily: {
            time: ["1993-06-11"],
            temperature_2m_max: [47.9],
            temperature_2m_min: [31.2],
            precipitation_sum: [0],
          },
        }),
      );
    };

    const resolver = createHistoricalResolver({ cache, fetchImpl, prewarmCities: [] });
    const result = await resolver.resolve(delhi, "1993-12-10", "1993-12-10", new Budget(8000));

    expect(requestedStart).toBe("1993-01-01");
    expect(requestedModels).toBe("era5_seamless");
    expect(result).toMatchObject({
      source: "era5_seamless",
      confidence: "high",
      daily: [{ date: "1993-06-11", tmax: 47.9, tmin: 31.2, precip: 0 }],
    });
    expect(cache.has(historicalCacheKeyV2(delhi, 1993, 1993))).toBe(true);
    expect(cache.has(historicalCacheKeyV1(delhi, 1993, 1993))).toBe(false);

    cache.close();
  });

  it("serves legacy v1 prewarm cache without refetching Open-Meteo", async () => {
    const cache = tempCache();
    const legacy: HistoricalWeatherResult = {
      source: "era5",
      confidence: "high",
      daily: [{ date: "2000-07-01", tmax: 38, tmin: 28, precip: 12 }],
    };
    cache.set(historicalCacheKeyV1(delhi, 2000, 2000), legacy);

    const fetchImpl: typeof fetch = async () => {
      throw new Error("should not fetch");
    };

    const resolver = createHistoricalResolver({ cache, fetchImpl, prewarmCities: [] });
    const result = await resolver.resolve(delhi, "2000-06-01", "2000-08-01", new Budget(8000));

    expect(result).toMatchObject({
      source: "era5",
      daily: [{ date: "2000-07-01", tmax: 38 }],
    });

    cache.close();
  });

  it("caps future end dates to the archive API allowed range", async () => {
    const cache = tempCache();
    let requestedEnd = "";
    const fetchImpl: typeof fetch = async (input) => {
      const url = new URL(String(input));
      requestedEnd = url.searchParams.get("end_date") ?? "";
      return new Response(
        JSON.stringify({
          daily: {
            time: [requestedEnd],
            temperature_2m_max: [30],
            temperature_2m_min: [20],
            precipitation_sum: [0],
          },
        }),
      );
    };

    const resolver = createHistoricalResolver({ cache, fetchImpl, prewarmCities: [] });
    await resolver.resolve(delhi, "2026-01-01", "2099-01-01", new Budget(8000));

    expect(requestedEnd <= new Date().toISOString().slice(0, 10)).toBe(true);

    cache.close();
  });

  it("skips NASA for pre-1981 ranges and uses cached nearest city", async () => {
    const cache = tempCache();
    const cachedMumbai: HistoricalWeatherResult = {
      source: "era5",
      confidence: "high",
      daily: [{ date: "1970-01-01", tmax: 31, tmin: 20, precip: 0 }],
    };
    cache.set(historicalCacheKeyV1(mumbai, 1970, 1970), cachedMumbai);

    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      calls.push(String(input));
      return new Response("{}", { status: 500 });
    };
    const nearbyMumbai = { ...mumbai, lat: 19.5, lon: 73.1 };
    const resolver = createHistoricalResolver({ cache, fetchImpl, prewarmCities: [mumbai] });

    const result = await resolver.resolve(nearbyMumbai, "1970-05-01", "1970-05-01", new Budget(8000));

    expect(calls.every((url) => url.includes("archive-api.open-meteo.com"))).toBe(true);
    expect(result).toMatchObject({
      source: "nearest_city",
      confidence: "medium",
      nearestCity: "Mumbai (Bombay), Maharashtra, India",
    });

    cache.close();
  });

  it("uses NASA POWER after Open-Meteo failure and normalizes missing sentinels", async () => {
    const cache = tempCache();
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("archive-api.open-meteo.com")) {
        return new Response("{}", { status: 500 });
      }

      return new Response(
        JSON.stringify({
          properties: {
            parameter: {
              T2M_MAX: { "19930611": 45.1 },
              T2M_MIN: { "19930611": -999 },
              PRECTOTCORR: { "19930611": 2.4 },
            },
          },
        }),
      );
    };

    const resolver = createHistoricalResolver({ cache, fetchImpl, prewarmCities: [] });
    const result = await resolver.resolve(delhi, "1993-01-01", "1993-12-31", new Budget(8000));

    expect(result).toMatchObject({
      source: "nasa_power",
      confidence: "high",
      daily: [{ date: "1993-06-11", tmax: 45.1, tmin: null, precip: 2.4 }],
    });

    cache.close();
  });
});
