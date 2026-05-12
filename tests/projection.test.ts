import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildProjectedBirthdayCard } from "../src/aggregations/cards.js";
import { SqliteCache } from "../src/cache/store.js";
import { Budget } from "../src/lib/budget.js";
import { buildProjectionWindow, createProjectionResolver } from "../src/resolvers/projection.js";
import type { HistoricalWeatherResult } from "../src/resolvers/historical.js";
import type { City } from "../src/types.js";

const tempDirs: string[] = [];

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
  const dir = mkdtempSync(join(tmpdir(), "klimate-proj-"));
  tempDirs.push(dir);
  return new SqliteCache(join(dir, "cache.sqlite"));
}

describe("projection resolver", () => {
  it("builds +/-7 day windows around the 2050 birthday", () => {
    expect(buildProjectionWindow("1993-12-10")).toEqual({ start: "2050-12-03", end: "2050-12-17" });
  });

  it("merges CMIP6 model arrays using first non-null daily values", async () => {
    const cache = tempCache();
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          daily: {
            time: ["2050-12-03", "2050-12-04"],
            temperature_2m_max_MPI_ESM1_2_XR: [null, 34],
            temperature_2m_min_MPI_ESM1_2_XR: [20, null],
            temperature_2m_max_EC_Earth3P_HR: [33, 35],
            temperature_2m_min_EC_Earth3P_HR: [21, 19],
          },
        }),
      );
    const resolver = createProjectionResolver({ cache, fetchImpl });

    const projection = await resolver.resolve(mumbai, "1993-12-10", null, new Budget(8000));

    expect(projection).toMatchObject({
      low: 19,
      high: 34,
      source: "cmip6",
      confidence: "high",
      modelsUsed: ["EC_Earth3P_HR", "MPI_ESM1_2_XR"],
    });
    expect(buildProjectedBirthdayCard(projection)).toMatchObject({
      id: 12,
      data: { low: 19, high: 34 },
    });

    cache.close();
  });

  it("falls back to local historical extrapolation", async () => {
    const cache = tempCache();
    const fetchImpl: typeof fetch = async () => new Response("{}", { status: 500 });
    const historical: HistoricalWeatherResult = {
      source: "era5",
      confidence: "high",
      daily: [
        { date: "2020-01-01", tmax: 30, tmin: 20, precip: 0 },
        { date: "2050-01-01", tmax: 33, tmin: 23, precip: 0 },
      ],
    };
    const resolver = createProjectionResolver({ cache, fetchImpl });

    const projection = await resolver.resolve(mumbai, "1993-12-10", historical, new Budget(8000));

    expect(projection).toMatchObject({
      low: 23,
      high: 33,
      source: "extrapolated",
      confidence: "low",
      reason: "extrapolated",
    });

    cache.close();
  });
});
