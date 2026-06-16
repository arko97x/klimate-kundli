import { describe, expect, it } from "vitest";

import { gridKey } from "../src/lib/grid.js";
import { annualMeanTemps, buildTempTimelineInsight } from "../src/lib/temp-timeline.js";
import type { WeatherDaily } from "../src/resolvers/historical.js";
import type { City } from "../src/types.js";

function day(date: string, tmax: number, tmin: number): WeatherDaily {
  return { date, tmax, tmin, precip: 0 };
}

const delhi: City = {
  name: "Delhi",
  displayName: "New Delhi, Delhi, India",
  lat: 28.61,
  lon: 77.21,
  country: "IN",
};

const mumbai: City = {
  name: "Mumbai",
  displayName: "Mumbai, Maharashtra, India",
  lat: 19.07,
  lon: 72.87,
  country: "IN",
};

describe("annualMeanTemps", () => {
  it("averages daily mean tmax/tmin per calendar year", () => {
    const totals = annualMeanTemps([
      day("2010-06-01", 40, 30),
      day("2010-07-01", 38, 28),
      day("2011-06-01", 42, 32),
    ]);
    expect(totals.get(2010)).toBe(34);
    expect(totals.get(2011)).toBe(37);
  });
});

describe("buildTempTimelineInsight", () => {
  it("returns chronological yearly temps for lived years only", () => {
    const delhiDaily: WeatherDaily[] = [];
    for (let y = 1997; y <= 2005; y += 1) {
      delhiDaily.push(day(`${y}-06-15`, 30 + (y - 1997) * 0.5, 20 + (y - 1997) * 0.5));
    }

    const mumbaiDaily: WeatherDaily[] = [];
    for (let y = 2006; y <= 2010; y += 1) {
      mumbaiDaily.push(day(`${y}-06-15`, 32, 26));
    }

    const weatherByKey = new Map([
      [gridKey(delhi.lat, delhi.lon), { daily: delhiDaily }],
      [gridKey(mumbai.lat, mumbai.lon), { daily: mumbaiDaily }],
    ]);

    const insight = buildTempTimelineInsight(
      [
        { city: delhi, startYear: 1997, endYear: 2005 },
        { city: mumbai, startYear: 2006, endYear: 2010 },
      ],
      weatherByKey,
      1997,
      2024,
    );

    expect(insight?.years).toHaveLength(14);
    expect(insight!.years[0]!.year).toBe(1997);
    expect(insight!.years[8]!.cityName).toBe("Delhi");
    expect(insight!.years[9]!.cityName).toBe("Mumbai");
    expect(insight!.cities).toHaveLength(2);
    expect(insight!.lifeDeltaC).toBeGreaterThan(0);
  });
});
