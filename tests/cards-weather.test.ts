import { describe, expect, it } from "vitest";
import {
  buildBirthYearHighCard,
  buildBirthYearLowCard,
  buildLatestBirthdayHighCard,
  buildLatestBirthdayLowCard,
  buildRainfallChangeCard,
  buildSummerSpanCard,
  buildWinterSpanCard,
  buildYouCard,
} from "../src/aggregations/cards.js";
import type { HistoricalWeatherResult } from "../src/resolvers/historical.js";
import type { City, LivedCity } from "../src/types.js";

const delhi: City = {
  name: "New Delhi",
  displayName: "New Delhi, Delhi, India",
  lat: 28.6139,
  lon: 77.209,
  country: "IN",
};

const london: LivedCity = {
  name: "London",
  displayName: "London, England, United Kingdom",
  lat: 51.5072,
  lon: -0.1276,
  country: "GB",
  start: "2010-01-01",
  end: "2015-01-01",
};

const livedDelhi: LivedCity = {
  ...delhi,
  start: "1993-12-10",
  end: null,
};

describe("weather-backed cards", () => {
  it("builds cards 1-5 from input and daily weather", () => {
    const weather: HistoricalWeatherResult = {
      source: "era5",
      confidence: "high",
      daily: [
        { date: "1993-01-21", tmax: 20, tmin: 2.2, precip: 0 },
        { date: "1993-06-11", tmax: 47.9, tmin: 31, precip: 0 },
        { date: "2025-12-10", tmax: 24.3, tmin: 7.1, precip: 0 },
      ],
    };

    expect(buildYouCard(delhi, "1993-12-10")).toMatchObject({
      id: 1,
      data: { city: "New Delhi", born: "1993-12-10" },
      confidence: "exact",
    });
    expect(buildBirthYearHighCard(delhi, 1993, weather)).toMatchObject({
      id: 2,
      data: { value: 47.9, date: "1993-06-11" },
    });
    expect(buildBirthYearLowCard(delhi, 1993, weather)).toMatchObject({
      id: 3,
      data: { value: 2.2, date: "1993-01-21" },
    });
    expect(buildLatestBirthdayHighCard(delhi, "1993-12-10", weather, new Date("2026-05-12T00:00:00Z"))).toMatchObject({
      id: 4,
      data: { value: 24.3, date: "2025-12-10" },
    });
    expect(buildLatestBirthdayLowCard(delhi, "1993-12-10", weather, new Date("2026-05-12T00:00:00Z"))).toMatchObject({
      id: 5,
      data: { value: 7.1, date: "2025-12-10" },
    });
  });

  it("marks pre-1940 birth-year weather as low confidence", () => {
    const weather: HistoricalWeatherResult = {
      source: "era5",
      confidence: "high",
      daily: [{ date: "1940-06-01", tmax: 40, tmin: 20, precip: 0 }],
    };

    expect(buildBirthYearHighCard(delhi, 1935, weather)).toMatchObject({
      confidence: "low",
      reason: "pre-satellite-era",
      data: { value: 40, date: "1940-06-01" },
    });
  });

  it("builds summer and winter range cards across lived cities", () => {
    const weatherByCity = new Map<string, HistoricalWeatherResult | null>([
      [
        livedDelhi.displayName,
        {
          source: "era5",
          confidence: "high",
          daily: [
            { date: "2020-06-01", tmax: 38.2, tmin: 28, precip: 0 },
            { date: "2020-01-01", tmax: 20, tmin: 3.7, precip: 0 },
          ],
        },
      ],
      [
        london.displayName,
        {
          source: "era5",
          confidence: "high",
          daily: [
            { date: "2020-06-01", tmax: 9.7, tmin: 4, precip: 0 },
            { date: "2020-01-01", tmax: 8, tmin: 27.9, precip: 0 },
          ],
        },
      ],
    ]);

    expect(buildSummerSpanCard([livedDelhi, london], weatherByCity)).toMatchObject({
      id: 6,
      data: { spanCelsius: 28.5 },
    });
    expect(buildWinterSpanCard([livedDelhi, london], weatherByCity)).toMatchObject({
      id: 7,
      data: { spanCelsius: 24.2 },
    });
  });

  it("builds rainfall change from birth and latest 10-year windows", () => {
    const daily = [
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
    ];
    const weather: HistoricalWeatherResult = { source: "era5", confidence: "high", daily };
    const card = buildRainfallChangeCard(delhi, 1993, weather);

    expect(card).toMatchObject({
      id: 9,
      data: { fromMmPerYear: 701, toMmPerYear: 795, birthWindowStart: 1993, latestWindowStart: 2016 },
    });
    expect(card.data.percentChange).toBeCloseTo(13.41);
  });
});
