import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SqliteCache } from "../src/cache/store.js";
import { Telemetry } from "../src/lib/telemetry.js";
import type { AnalogResolution } from "../src/resolvers/analog.js";
import type { HistoricalWeatherResult } from "../src/resolvers/historical.js";
import { loadStaticData } from "../src/resolvers/statics.js";
import { createKundliRoute } from "../src/routes/kundli.js";
import type { City } from "../src/types.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function fixtureStatics() {
  const dir = tempDir("klimate-kundli-statics-");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "emissions.csv"), "country,year,co2_mt\nIND,1993,677\nIND,2024,3193\n");
  writeFileSync(join(dir, "sea_level.csv"), "year,mm\n1993,0\n2023,99\n");
  writeFileSync(join(dir, "co2_ppm.csv"), "year,ppm\n1993,357.2\n2025,427.4\n");
  writeFileSync(join(dir, "arctic_ice.csv"), "year,extent_mkm2\n1993,6.2\n2025,4.3\n");
  return loadStaticData(dir);
}

function tempCache(): SqliteCache {
  return new SqliteCache(join(tempDir("klimate-kundli-cache-"), "cache.sqlite"));
}

const delhi: City = {
  name: "New Delhi",
  displayName: "New Delhi, Delhi, India",
  lat: 28.6139,
  lon: 77.209,
  country: "IND",
};

const london = {
  name: "London",
  displayName: "London, England, United Kingdom",
  lat: 51.5072,
  lon: -0.1276,
  country: "GBR",
  start: "2010-01-01",
  end: "2015-01-01",
};

function fixtureAnalog(): AnalogResolution {
  return {
    childhoodWindow: [1993, 2008],
    migrations: [
      {
        home: { name: delhi.name, displayName: delhi.displayName, lat: delhi.lat, lon: delhi.lon },
        analog: { name: "Jaipur", displayName: "Jaipur, Rajasthan, India", lat: 26.9, lon: 75.8, country: "IND" },
        distanceKm: 235,
        bearingDeg: 225,
        direction: "southwest",
        childhood: { startYear: 1993, endYear: 2008, heatCeiling: 44.7, coldFloor: 4, wetness: 676, yearsUsed: 16 },
        homeNow: { heatCeiling: 44, coldFloor: 4.2, wetness: 752 },
        matchZ: 0.08,
        confidence: "high",
      },
    ],
  };
}

function birthWeather(): HistoricalWeatherResult {
  return {
    source: "era5",
    confidence: "high",
    daily: [
      { date: "1993-01-21", tmax: 20, tmin: 2.2, precip: 0 },
      { date: "1993-06-11", tmax: 47.9, tmin: 31, precip: 0 },
      ...Array.from({ length: 10 }, (_, index) => ({
        date: `${1993 + index}-01-01`,
        tmax: null,
        tmin: null,
        precip: 701,
      })),
      ...Array.from({ length: 10 }, (_, index) => ({
        date: `${2016 + index}-01-01`,
        tmax: null,
        tmin: null,
        precip: 795,
      })),
    ],
  };
}

describe("POST /kundli", () => {
  it("returns all 13 cards with telemetry", async () => {
    const cache = tempCache();
    const route = createKundliRoute({
      cache,
      statics: fixtureStatics(),
      telemetry: new Telemetry(),
      today: new Date("2026-05-12T00:00:00Z"),
      historical: {
        resolve: async (city, startDate) => {
          if (city.displayName === delhi.displayName && startDate === "1993-01-01") {
            return birthWeather();
          }
          if (startDate === "2025-12-10") {
            return {
              source: "era5",
              confidence: "high",
              daily: [{ date: "2025-12-10", tmax: 24.3, tmin: 7.1, precip: 0 }],
            };
          }
          if (city.displayName === london.displayName) {
            return {
              source: "era5",
              confidence: "high",
              daily: [
                { date: "2020-06-01", tmax: 9.7, tmin: 4, precip: 0 },
                { date: "2020-01-01", tmax: 8, tmin: 27.9, precip: 0 },
              ],
            };
          }
          return {
            source: "era5",
            confidence: "high",
            daily: [
              { date: "2020-06-01", tmax: 38.2, tmin: 28, precip: 0 },
              { date: "2020-01-01", tmax: 20, tmin: 3.7, precip: 0 },
            ],
          };
        },
      },
      projection: {
        resolve: async () => ({
          low: 8.3,
          high: 24.4,
          modelsUsed: ["MPI_ESM1_2_XR"],
          source: "cmip6",
          confidence: "high",
        }),
      },
      analog: { resolve: () => fixtureAnalog() },
    });

    const res = await route.request("/", {
      method: "POST",
      body: JSON.stringify({
        birthDate: "1993-12-10",
        birthCity: delhi,
        livedCities: [
          { ...delhi, start: "1993-12-10", end: null },
          london,
        ],
      }),
      headers: { "content-type": "application/json" },
    });

    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.kundli.cards).toHaveLength(13);
    expect(body.kundli.cards.map((card: { id: number }) => card.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    expect(body.telemetry.partial).toBe(false);

    cache.close();
  });

  it("returns 400 for invalid lived-city current marker", async () => {
    const cache = tempCache();
    const route = createKundliRoute({
      cache,
      statics: fixtureStatics(),
      telemetry: new Telemetry(),
      historical: { resolve: async () => null },
      projection: { resolve: async () => null },
      analog: { resolve: () => ({ childhoodWindow: [0, 0], migrations: [] }) },
    });

    const res = await route.request("/", {
      method: "POST",
      body: JSON.stringify({ birthDate: "1993-12-10", birthCity: delhi, livedCities: [{ ...delhi, start: "1993-12-10", end: "2000-01-01" }] }),
      headers: { "content-type": "application/json" },
    });

    expect(res.status).toBe(400);
    cache.close();
  });
});
