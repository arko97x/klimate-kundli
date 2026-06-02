import { describe, expect, it } from "vitest";

import {
  buildRainfallInsight,
  meanHeavyRainDaysPerYear,
  monthlyPrecipStats,
  monsoonPercentChange,
} from "../src/lib/rain-stats.js";
import type { WeatherDaily } from "../src/resolvers/historical.js";

function day(date: string, precip: number): WeatherDaily {
  return { date, tmax: 30, tmin: 20, precip };
}

describe("monthlyPrecipStats", () => {
  it("averages monthly totals across years", () => {
    const daily: WeatherDaily[] = [
      day("1990-06-01", 10),
      day("1990-06-02", 20),
      day("1991-06-01", 40),
      day("1990-07-01", 5),
    ];
    const stats = monthlyPrecipStats(daily, 1990, 1991);
    expect(stats.monthly[5]).toBe(35);
    expect(stats.monthly[6]).toBe(5);
  });
});

describe("meanHeavyRainDaysPerYear", () => {
  it("counts heavy days per year in window", () => {
    const daily: WeatherDaily[] = [
      day("1990-06-01", 60),
      day("1990-07-01", 10),
      day("1991-06-01", 55),
    ];
    expect(meanHeavyRainDaysPerYear(daily, 1990, 1991)).toBe(1);
  });
});

describe("monsoonPercentChange", () => {
  it("returns % change for Jun–Sep totals", () => {
    const then = new Array<number | null>(12).fill(0);
    const now = new Array<number | null>(12).fill(0);
    then[5] = 100;
    then[6] = 100;
    then[7] = 100;
    then[8] = 100;
    now[5] = 110;
    now[6] = 110;
    now[7] = 110;
    now[8] = 110;
    expect(monsoonPercentChange(then, now)).toBe(10);
  });
});

describe("buildRainfallInsight", () => {
  it("builds full payload when precip exists", () => {
    const daily: WeatherDaily[] = [];
    for (let y = 1990; y <= 1994; y += 1) {
      for (let m = 6; m <= 9; m += 1) {
        daily.push(day(`${y}-${String(m).padStart(2, "0")}-15`, y >= 1993 ? 80 : 20));
      }
    }
    for (let y = 2020; y <= 2024; y += 1) {
      for (let m = 6; m <= 9; m += 1) {
        daily.push(day(`${y}-${String(m).padStart(2, "0")}-15`, 80));
      }
    }

    const insight = buildRainfallInsight(daily, 1990, 1994, 2020, 2024);
    expect(insight).not.toBeNull();
    expect(insight!.deltaDaysPerYear).toBeGreaterThan(0);
    expect(insight!.largestDelta).not.toBeNull();
  });
});
