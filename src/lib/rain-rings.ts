import { gridKey } from "./grid.js";
import type { WeatherDaily } from "../resolvers/historical.js";
import type { City } from "../types.js";

export interface RainRingYear {
  year: number;
  precipMm: number;
}

export interface RainRingsCity {
  cityName: string;
  displayName: string;
  startYear: number;
  endYear: number;
  years: RainRingYear[];
  wettestYear: number | null;
  driestYear: number | null;
  wetYearsAboveMedian: number;
}

export interface RainRingsInsight {
  birthYear: number;
  latestCompleteYear: number;
  byCity: RainRingsCity[];
}

interface StintLike {
  city: City;
  startYear: number;
  endYear: number;
}

export function annualPrecipTotals(daily: WeatherDaily[]): Map<number, number> {
  const byYear = new Map<number, number>();

  for (const day of daily) {
    if (day.precip == null) continue;
    const year = Number(day.date.slice(0, 4));
    byYear.set(year, (byYear.get(year) ?? 0) + day.precip);
  }

  return byYear;
}

export function buildRainRingsInsight(
  stints: StintLike[],
  weatherByKey: Map<string, { daily: WeatherDaily[] }>,
  birthYear: number,
  latestCompleteYear: number,
): RainRingsInsight | null {
  const yearsByKey = new Map<string, { city: City; years: Set<number> }>();

  for (const stint of stints) {
    const key = gridKey(stint.city.lat, stint.city.lon);
    let entry = yearsByKey.get(key);
    if (!entry) {
      entry = { city: stint.city, years: new Set() };
      yearsByKey.set(key, entry);
    }

    const start = Math.max(stint.startYear, birthYear);
    const end = Math.min(stint.endYear, latestCompleteYear);
    for (let year = start; year <= end; year += 1) {
      entry.years.add(year);
    }
  }

  const byCity: RainRingsCity[] = [];

  for (const { city, years } of yearsByKey.values()) {
    const weather = weatherByKey.get(gridKey(city.lat, city.lon));
    if (!weather) continue;

    const annual = annualPrecipTotals(weather.daily);
    const points: RainRingYear[] = [...years]
      .sort((a, b) => a - b)
      .map((year) => {
        const precip = annual.get(year);
        return precip != null ? { year, precipMm: roundMm(precip) } : null;
      })
      .filter((row): row is RainRingYear => row != null);

    if (points.length < 2) continue;

    const values = points.map((p) => p.precipMm);
    const median = medianValue(values);
    const wetYearsAboveMedian = points.filter((p) => p.precipMm > median).length;

    let wettestYear: number | null = null;
    let driestYear: number | null = null;
    let maxPrecip = -Infinity;
    let minPrecip = Infinity;
    for (const point of points) {
      if (point.precipMm > maxPrecip) {
        maxPrecip = point.precipMm;
        wettestYear = point.year;
      }
      if (point.precipMm < minPrecip) {
        minPrecip = point.precipMm;
        driestYear = point.year;
      }
    }

    byCity.push({
      cityName: city.name,
      displayName: city.displayName,
      startYear: points[0]!.year,
      endYear: points[points.length - 1]!.year,
      years: points,
      wettestYear,
      driestYear,
      wetYearsAboveMedian,
    });
  }

  byCity.sort((a, b) => a.startYear - b.startYear || a.cityName.localeCompare(b.cityName));

  if (byCity.length === 0) return null;

  return {
    birthYear,
    latestCompleteYear,
    byCity,
  };
}

function medianValue(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid]!;
  }
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function roundMm(value: number): number {
  return Math.round(value);
}
