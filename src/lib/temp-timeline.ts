import { gridKey } from "./grid.js";
import type { WeatherDaily } from "../resolvers/historical.js";
import type { City } from "../types.js";

export interface TempTimelineYear {
  year: number;
  meanTempC: number;
  cityName: string;
  displayName: string;
  peakTempC?: number;
  peakDate?: string;
}

export interface TempTimelineCity {
  cityName: string;
  displayName: string;
}

export interface TempTimelineInsight {
  birthYear: number;
  latestCompleteYear: number;
  years: TempTimelineYear[];
  cities: TempTimelineCity[];
  warmestYear: number | null;
  coolestYear: number | null;
  lifeDeltaC: number | null;
}

interface StintLike {
  city: City;
  startYear: number;
  endYear: number;
}

export function annualMeanTemps(daily: WeatherDaily[]): Map<number, number> {
  const sums = new Map<number, { sum: number; count: number }>();

  for (const day of daily) {
    if (day.tmax == null || day.tmin == null) {
      continue;
    }
    const year = Number(day.date.slice(0, 4));
    const entry = sums.get(year) ?? { sum: 0, count: 0 };
    entry.sum += (day.tmax + day.tmin) / 2;
    entry.count += 1;
    sums.set(year, entry);
  }

  const out = new Map<number, number>();
  for (const [year, entry] of sums) {
    if (entry.count > 0) {
      out.set(year, entry.sum / entry.count);
    }
  }
  return out;
}

export function annualPeaks(daily: WeatherDaily[]): Map<number, { peakTempC: number; peakDate: string }> {
  const out = new Map<number, { peakTempC: number; peakDate: string }>();
  for (const day of daily) {
    if (day.tmax == null) {
      continue;
    }
    const year = Number(day.date.slice(0, 4));
    const existing = out.get(year);
    if (!existing || day.tmax > existing.peakTempC) {
      out.set(year, { peakTempC: day.tmax, peakDate: day.date });
    }
  }
  return out;
}

export function buildTempTimelineInsight(
  stints: StintLike[],
  weatherByKey: Map<string, { daily: WeatherDaily[] }>,
  birthYear: number,
  latestCompleteYear: number,
): TempTimelineInsight | null {
  const byYear = new Map<number, TempTimelineYear>();
  const cityOrder: TempTimelineCity[] = [];
  const seenCityKeys = new Set<string>();

  for (const stint of stints) {
    const key = gridKey(stint.city.lat, stint.city.lon);
    const weather = weatherByKey.get(key);
    if (!weather) {
      continue;
    }

    if (!seenCityKeys.has(key)) {
      seenCityKeys.add(key);
      cityOrder.push({
        cityName: stint.city.name,
        displayName: stint.city.displayName,
      });
    }

    const annual = annualMeanTemps(weather.daily);
    const peaks = annualPeaks(weather.daily);
    const start = Math.max(stint.startYear, birthYear);
    const end = Math.min(stint.endYear, latestCompleteYear);

    for (let year = start; year <= end; year += 1) {
      const meanTemp = annual.get(year);
      if (meanTemp == null) {
        continue;
      }
      const peak = peaks.get(year);
      byYear.set(year, {
        year,
        meanTempC: roundTemp(meanTemp),
        cityName: stint.city.name,
        displayName: stint.city.displayName,
        peakTempC: peak ? roundTemp(peak.peakTempC) : undefined,
        peakDate: peak ? peak.peakDate : undefined,
      });
    }
  }

  const years = [...byYear.values()].sort((a, b) => a.year - b.year);
  if (years.length < 2) {
    return null;
  }

  let warmestYear: number | null = null;
  let coolestYear: number | null = null;
  let maxTemp = -Infinity;
  let minTemp = Infinity;

  for (const point of years) {
    if (point.meanTempC > maxTemp) {
      maxTemp = point.meanTempC;
      warmestYear = point.year;
    }
    if (point.meanTempC < minTemp) {
      minTemp = point.meanTempC;
      coolestYear = point.year;
    }
  }

  const first = years[0]!;
  const last = years[years.length - 1]!;

  return {
    birthYear,
    latestCompleteYear,
    years,
    cities: cityOrder,
    warmestYear,
    coolestYear,
    lifeDeltaC: roundTemp(last.meanTempC - first.meanTempC),
  };
}

function roundTemp(value: number): number {
  return Math.round(value * 10) / 10;
}
