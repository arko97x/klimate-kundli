import { describe, expect, it } from "vitest";

import { gridKey } from "../src/lib/grid.js";
import { annualPrecipTotals, buildRainRingsInsight } from "../src/lib/rain-rings.js";
import type { WeatherDaily } from "../src/resolvers/historical.js";
import type { City } from "../src/types.js";

function day(date: string, precip: number): WeatherDaily {
  return { date, tmax: 30, tmin: 20, precip };
}

const mumbai: City = {
  name: "Mumbai",
  displayName: "Mumbai, Maharashtra, India",
  lat: 19.07,
  lon: 72.87,
  country: "IN",
};

describe("annualPrecipTotals", () => {
  it("sums daily precip per calendar year", () => {
    const totals = annualPrecipTotals([
      day("2010-06-01", 100),
      day("2010-07-01", 50),
      day("2011-06-01", 200),
    ]);
    expect(totals.get(2010)).toBe(150);
    expect(totals.get(2011)).toBe(200);
  });
});

describe("buildRainRingsInsight", () => {
  it("returns per-city rings for lived years only", () => {
    const daily: WeatherDaily[] = [];
    for (let y = 2008; y <= 2020; y += 1) {
      daily.push(day(`${y}-08-15`, y >= 2015 ? 2000 : 800));
    }

    const weatherByKey = new Map([[gridKey(mumbai.lat, mumbai.lon), { daily }]]);
    const insight = buildRainRingsInsight(
      [{ city: mumbai, startYear: 2008, endYear: 2012 }, { city: mumbai, startYear: 2015, endYear: 2020 }],
      weatherByKey,
      1990,
      2020,
    );

    expect(insight?.byCity).toHaveLength(1);
    expect(insight!.byCity[0]!.years).toHaveLength(11);
    expect(insight!.byCity[0]!.years[0]!.year).toBe(2008);
    expect(insight!.byCity[0]!.wettestYear).toBeGreaterThanOrEqual(2015);
  });
});
