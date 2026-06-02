import { Hono } from "hono";
import { z } from "zod";
import { Budget } from "../lib/budget.js";
import { gridKey } from "../lib/grid.js";
import { buildRainRingsInsight } from "../lib/rain-rings.js";
import { buildRainfallInsight } from "../lib/rain-stats.js";
import type { HistoricalWeatherResult, WeatherDaily } from "../resolvers/historical.js";
import type { ImdService } from "../resolvers/imd/resolver.js";
import type { StaticData } from "../resolvers/statics.js";
import type { City } from "../types.js";

const INDIA_EMISSIONS_CODE = "IND";

interface MonthlyDeltaRouteDeps {
  historical: {
    resolve(city: City, startDate: string, endDate: string, budget?: Budget): Promise<HistoricalWeatherResult | null>;
  };
  statics: StaticData;
  imd?: ImdService;
  today?: Date;
}

const citySchema = z.object({
  name: z.string().min(1),
  displayName: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  country: z.string().min(2).max(3),
  admin1: z.string().optional(),
  alternateNames: z.array(z.string()).optional(),
});

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const livedCitySchema = citySchema.extend({
  start: dateSchema,
  end: dateSchema.nullable(),
});

const inputSchema = z.object({
  birthCity: citySchema,
  birthYear: z.number().int().min(1940).max(2099),
  livedCities: z.array(livedCitySchema).min(1).optional(),
});

const BIRTH_WINDOW_HALF = 2;
const RECENT_WINDOW_SIZE = 5;
const RECORD_START_YEAR = 1940;
const HOTTEST_TOP_K = 10;
const PARENTS_GENERATION_OFFSET = 25;

interface Stint {
  city: City;
  startYear: number;
  endYear: number;
}

export function createMonthlyDeltaRoute(deps: MonthlyDeltaRouteDeps): Hono {
  const route = new Hono();

  route.post("/", async (c) => {
    const parsed = inputSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ issues: parsed.error.issues }, 400);
    }

    const today = deps.today ?? new Date();
    const latestCompleteYear = today.getUTCFullYear() - 1;
    const birthYear = parsed.data.birthYear;

    const birthStart = Math.max(RECORD_START_YEAR, birthYear - BIRTH_WINDOW_HALF);
    const birthEnd = Math.min(latestCompleteYear, birthYear + BIRTH_WINDOW_HALF);
    const recentEnd = latestCompleteYear;
    const recentStart = Math.max(birthEnd + 1, recentEnd - RECENT_WINDOW_SIZE + 1);

    if (recentStart > recentEnd) {
      return c.json({ error: "birth_year_too_recent" }, 400);
    }

    const stints = toStints(parsed.data.livedCities, parsed.data.birthCity, birthYear, latestCompleteYear);
    const budget = new Budget(45_000);

    try {
      const weatherByKey = await fetchCityWeatherSequential(
        deps.historical,
        orderCitiesBirthFirst(parsed.data.birthCity, stints),
        latestCompleteYear,
        budget,
      );

      const birthKey = gridKey(parsed.data.birthCity.lat, parsed.data.birthCity.lon);
      const birthWeather = weatherByKey.get(birthKey);

      if (!birthWeather || birthWeather.daily.length === 0) {
        return c.json(
          {
            error: "no_weather_data",
            hint: "Open-Meteo may have rate-limited this request. Wait ~30s and try again.",
          },
          502,
        );
      }

      const birthStats = monthlyStats(birthWeather.daily, birthStart, birthEnd);
      const recentStats = monthlyStats(birthWeather.daily, recentStart, recentEnd);
      const largest = largestDeltaMonth(birthStats.monthly, recentStats.monthly);
      const hottestYears = buildHottestYearsInsight(
        stints,
        weatherByKey,
        birthYear,
        latestCompleteYear,
        deps.imd,
      );
      const indiaEmissions = buildIndiaEmissionsRings(deps.statics, birthYear, latestCompleteYear);
      const parentsBirthYear = birthYear - PARENTS_GENERATION_OFFSET;
      const parentsIndiaEmissions =
        parentsBirthYear >= RECORD_START_YEAR
          ? buildIndiaEmissionsRings(deps.statics, parentsBirthYear, latestCompleteYear)
          : null;
      const parentsBirthWindow = buildParentsBirthWindow(birthWeather.daily, birthYear, latestCompleteYear);
      const globalContext = buildGlobalContext(deps.statics, birthYear, latestCompleteYear);
      const rainfall = buildRainfallInsight(
        birthWeather.daily,
        birthStart,
        birthEnd,
        recentStart,
        recentEnd,
      );
      const rainRings = buildRainRingsInsight(stints, weatherByKey, birthYear, latestCompleteYear);

      return c.json({
        city: parsed.data.birthCity,
        birthYear,
        birthWindow: {
          startYear: birthStart,
          endYear: birthEnd,
          monthly: birthStats.monthly,
          monthlyMin: birthStats.monthlyMin,
          monthlyMax: birthStats.monthlyMax,
        },
        recentWindow: {
          startYear: recentStart,
          endYear: recentEnd,
          monthly: recentStats.monthly,
          monthlyMin: recentStats.monthlyMin,
          monthlyMax: recentStats.monthlyMax,
        },
        largestDelta: largest,
        hottestYears,
        indiaEmissions,
        parentsIndiaEmissions,
        parentsBirthWindow,
        globalContext,
        rainfall,
        rainRings,
        source: birthWeather.source,
        confidence: birthWeather.confidence,
      });
    } catch (error) {
      console.error(
        JSON.stringify({ t: new Date().toISOString(), endpoint: "/monthly-delta", error: String(error) }),
      );
      return c.json({ error: "internal_error" }, 500);
    } finally {
      budget.cancel();
    }
  });

  return route;
}

function buildParentsBirthWindow(
  daily: WeatherDaily[],
  birthYear: number,
  latestCompleteYear: number,
) {
  const parentsBirthYear = birthYear - PARENTS_GENERATION_OFFSET;
  const start = Math.max(RECORD_START_YEAR, parentsBirthYear - BIRTH_WINDOW_HALF);
  const end = Math.min(latestCompleteYear, parentsBirthYear + BIRTH_WINDOW_HALF);

  if (start > end || parentsBirthYear < RECORD_START_YEAR) {
    return null;
  }

  const stats = monthlyStats(daily, start, end);
  return {
    startYear: start,
    endYear: end,
    monthly: stats.monthly,
    monthlyMin: stats.monthlyMin,
    monthlyMax: stats.monthlyMax,
  };
}

function buildGlobalContext(statics: StaticData, birthYear: number, latestCompleteYear: number) {
  const seaAtBirth = statics.lookupSeaLevel(birthYear);
  const seaAtEnd = statics.lookupSeaLevel(latestCompleteYear);
  const seaLevelRiseMm =
    seaAtBirth.confidence !== "unavailable" && seaAtEnd.confidence !== "unavailable"
      ? Math.round((seaAtEnd.value - seaAtBirth.value) * 10) / 10
      : null;

  const co2AtBirth = statics.lookupCo2Ppm(birthYear);
  const co2AtEnd = statics.lookupCo2Ppm(latestCompleteYear);

  return {
    seaLevelRiseMm,
    co2PpmAtBirth: co2AtBirth.confidence !== "unavailable" ? Math.round(co2AtBirth.value * 10) / 10 : null,
    co2PpmNow: co2AtEnd.confidence !== "unavailable" ? Math.round(co2AtEnd.value * 10) / 10 : null,
  };
}

function buildIndiaEmissionsRings(statics: StaticData, birthYear: number, latestCompleteYear: number) {
  const latestDataYear = statics.latestEmissionsYear(INDIA_EMISSIONS_CODE) ?? latestCompleteYear;
  const endYear = Math.min(latestCompleteYear, latestDataYear);
  const years: { year: number; co2Mt: number }[] = [];

  for (let year = birthYear; year <= endYear; year += 1) {
    const lookup = statics.lookupEmissions(INDIA_EMISSIONS_CODE, year);
    if (lookup.confidence === "unavailable") {
      continue;
    }
    years.push({ year, co2Mt: Math.round(lookup.value * 10) / 10 });
  }

  if (years.length === 0) {
    return null;
  }

  const first = years[0]!.co2Mt;
  const last = years[years.length - 1]!.co2Mt;

  return {
    country: "India",
    startYear: years[0]!.year,
    endYear: years[years.length - 1]!.year,
    years,
    firstCo2Mt: first,
    lastCo2Mt: last,
    growthFactor: first > 0 ? Math.round((last / first) * 10) / 10 : null,
  };
}

function toStints(
  livedCities: z.infer<typeof livedCitySchema>[] | undefined,
  birthCity: City,
  birthYear: number,
  latestCompleteYear: number,
): Stint[] {
  if (!livedCities || livedCities.length === 0) {
    return [{ city: birthCity, startYear: birthYear, endYear: latestCompleteYear }];
  }

  return livedCities.map((entry) => ({
    city: entry,
    startYear: Number(entry.start.slice(0, 4)),
    endYear: entry.end ? Number(entry.end.slice(0, 4)) : latestCompleteYear,
  }));
}

function orderCitiesBirthFirst(birthCity: City, stints: Stint[]): City[] {
  const seen = new Set<string>();
  const cities: City[] = [];
  const birthKey = gridKey(birthCity.lat, birthCity.lon);

  const add = (city: City) => {
    const key = gridKey(city.lat, city.lon);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    cities.push(city);
  };

  add(birthCity);
  for (const stint of stints) {
    if (gridKey(stint.city.lat, stint.city.lon) === birthKey) {
      continue;
    }
    add(stint.city);
  }

  return cities;
}

async function fetchCityWeatherSequential(
  historical: MonthlyDeltaRouteDeps["historical"],
  cities: City[],
  latestCompleteYear: number,
  budget: Budget,
): Promise<Map<string, HistoricalWeatherResult>> {
  const weatherByKey = new Map<string, HistoricalWeatherResult>();

  for (let i = 0; i < cities.length; i += 1) {
    const city = cities[i]!;
    const key = gridKey(city.lat, city.lon);
    if (weatherByKey.has(key)) {
      continue;
    }

    const result = await historical.resolve(
      city,
      `${RECORD_START_YEAR}-01-01`,
      `${latestCompleteYear}-12-31`,
      budget,
    );

    if (result) {
      weatherByKey.set(key, result);
    }

    // Parallel full-history calls trip Open-Meteo's per-minute cap on a cold cache.
    if (i < cities.length - 1) {
      await delay(600);
    }
  }

  return weatherByKey;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type HottestYearBladeRow = {
  year: number;
  cityName: string;
  displayName: string;
  peakTempC: number;
  peakDate: string;
  rankInCity: number;
  peakSource: "imd_station" | "era5_grid";
  isIndiaHome: boolean;
  imdStationName?: string;
  imdDistanceKm?: number;
};

function buildHottestYearsInsight(
  stints: Stint[],
  weatherByKey: Map<string, HistoricalWeatherResult>,
  birthYear: number,
  latestCompleteYear: number,
  imd?: ImdService,
) {
  const topHotByCityKey = new Map<string, Set<number>>();
  const annualByCityKey = new Map<string, Map<number, number>>();
  const annualPeakByCityKey = new Map<string, Map<number, { peakTempC: number; peakDate: string }>>();

  for (const [key, weather] of weatherByKey) {
    const annual = annualMeanTemps(weather.daily);
    annualByCityKey.set(key, annual);
    annualPeakByCityKey.set(key, annualPeakTmax(weather.daily));
    topHotByCityKey.set(key, topHotYears(annual, HOTTEST_TOP_K));
  }

  const matchingYears = new Set<number>();
  const bladeByYear = new Map<number, HottestYearBladeRow>();
  const byCity: {
    cityName: string;
    displayName: string;
    hotYearsLived: number;
    yearsLived: number;
    matchingYears: number[];
  }[] = [];

  for (const stint of stints) {
    const key = gridKey(stint.city.lat, stint.city.lon);
    const topHot = topHotByCityKey.get(key);
    const annual = annualByCityKey.get(key);
    const annualPeak = annualPeakByCityKey.get(key);
    if (!topHot || !annual || !annualPeak) {
      continue;
    }

    const stintMatches: number[] = [];
    let yearsLived = 0;

    for (let year = stint.startYear; year <= stint.endYear; year += 1) {
      if (year < birthYear || year > latestCompleteYear) {
        continue;
      }
      yearsLived += 1;
      if (!topHot.has(year)) {
        continue;
      }
      stintMatches.push(year);
      matchingYears.add(year);

      if (!bladeByYear.has(year)) {
        const peak = annualPeak.get(year);
        const rankInCity = hotYearRank(annual, year);
        if (peak != null && rankInCity != null) {
          const blade: HottestYearBladeRow = {
            year,
            cityName: stint.city.name,
            displayName: stint.city.displayName,
            peakTempC: roundTemp(peak.peakTempC),
            peakDate: peak.peakDate,
            rankInCity,
            peakSource: "era5_grid",
            isIndiaHome: stint.city.country === "IN",
          };
          applyImdPeak(blade, stint.city, imd);
          bladeByYear.set(year, blade);
        }
      }
    }

    if (yearsLived > 0) {
      byCity.push({
        cityName: stint.city.name,
        displayName: stint.city.displayName,
        hotYearsLived: stintMatches.length,
        yearsLived,
        matchingYears: stintMatches.sort((a, b) => a - b),
      });
    }
  }

  // Merge rows for the same city (multiple stints).
  const mergedByCity = mergeCityBreakdown(byCity);
  const blades = [...bladeByYear.values()].sort((a, b) => a.year - b.year);

  return {
    count: matchingYears.size,
    topK: HOTTEST_TOP_K,
    recordStartYear: RECORD_START_YEAR,
    latestCompleteYear,
    years: [...matchingYears].sort((a, b) => a - b),
    byCity: mergedByCity,
    blades,
  };
}

function mergeCityBreakdown(
  rows: {
    cityName: string;
    displayName: string;
    hotYearsLived: number;
    yearsLived: number;
    matchingYears: number[];
  }[],
) {
  const merged = new Map<
    string,
    {
      cityName: string;
      displayName: string;
      hotYearsLived: number;
      yearsLived: number;
      matchingYears: Set<number>;
    }
  >();

  for (const row of rows) {
    const existing = merged.get(row.cityName);
    if (!existing) {
      merged.set(row.cityName, {
        cityName: row.cityName,
        displayName: row.displayName,
        hotYearsLived: row.hotYearsLived,
        yearsLived: row.yearsLived,
        matchingYears: new Set(row.matchingYears),
      });
      continue;
    }

    existing.yearsLived += row.yearsLived;
    for (const year of row.matchingYears) {
      existing.matchingYears.add(year);
    }
    existing.hotYearsLived = existing.matchingYears.size;
  }

  return [...merged.values()]
    .map((row) => ({
      cityName: row.cityName,
      displayName: row.displayName,
      hotYearsLived: row.hotYearsLived,
      yearsLived: row.yearsLived,
      matchingYears: [...row.matchingYears].sort((a, b) => a - b),
    }))
    .sort((a, b) => b.hotYearsLived - a.hotYearsLived);
}

function annualPeakTmax(daily: WeatherDaily[]): Map<number, { peakTempC: number; peakDate: string }> {
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

function annualMeanTemps(daily: WeatherDaily[]): Map<number, number> {
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

function topHotYears(annual: Map<number, number>, k: number): Set<number> {
  const ranked = [...annual.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([year]) => year);
  return new Set(ranked);
}

function hotYearRank(annual: Map<number, number>, year: number): number | null {
  const ranked = [...annual.entries()].sort((a, b) => b[1] - a[1]);
  const index = ranked.findIndex(([y]) => y === year);
  return index >= 0 ? index + 1 : null;
}

function applyImdPeak(blade: HottestYearBladeRow, city: City, imd?: ImdService): void {
  if (!imd?.enabled || city.country !== "IN") {
    return;
  }

  const binding = imd.bindStation(city);
  if (!binding) {
    return;
  }

  const peak = imd.getAnnualPeak(binding.station.id, blade.year);
  if (!peak) {
    return;
  }

  blade.peakTempC = roundTemp(peak.peakTempC);
  blade.peakDate = peak.peakDate;
  blade.peakSource = "imd_station";
  blade.imdStationName = binding.station.name;
  blade.imdDistanceKm = Math.round(binding.distanceKm);
}

function roundTemp(value: number): number {
  return Math.round(value * 10) / 10;
}

interface MonthlyStats {
  monthly: (number | null)[];
  monthlyMin: (number | null)[];
  monthlyMax: (number | null)[];
}

function monthlyStats(daily: WeatherDaily[], startYear: number, endYear: number): MonthlyStats {
  const sums = new Array(12).fill(0);
  const counts = new Array(12).fill(0);
  const yearMonthSums = new Map<string, { sum: number; count: number }>();

  for (const day of daily) {
    const year = Number(day.date.slice(0, 4));
    if (year < startYear || year > endYear) continue;
    if (day.tmax == null || day.tmin == null) continue;

    const monthIndex = Number(day.date.slice(5, 7)) - 1;
    const dayMean = (day.tmax + day.tmin) / 2;

    sums[monthIndex] += dayMean;
    counts[monthIndex] += 1;

    const key = `${year}-${monthIndex}`;
    const bucket = yearMonthSums.get(key) ?? { sum: 0, count: 0 };
    bucket.sum += dayMean;
    bucket.count += 1;
    yearMonthSums.set(key, bucket);
  }

  const monthly = sums.map((sum, i) => (counts[i] > 0 ? sum / counts[i] : null));
  const monthlyMin = new Array<number | null>(12).fill(null);
  const monthlyMax = new Array<number | null>(12).fill(null);

  for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
    const yearlyValues: number[] = [];

    for (let year = startYear; year <= endYear; year += 1) {
      const bucket = yearMonthSums.get(`${year}-${monthIndex}`);
      if (bucket && bucket.count > 0) {
        yearlyValues.push(bucket.sum / bucket.count);
      }
    }

    if (yearlyValues.length > 0) {
      monthlyMin[monthIndex] = Math.min(...yearlyValues);
      monthlyMax[monthIndex] = Math.max(...yearlyValues);
    }
  }

  return { monthly, monthlyMin, monthlyMax };
}

function largestDeltaMonth(
  a: (number | null)[],
  b: (number | null)[],
): { month: number; delta: number } | null {
  let bestMonth = -1;
  let bestAbs = -Infinity;
  let bestSigned = 0;

  for (let m = 0; m < 12; m += 1) {
    if (a[m] == null || b[m] == null) continue;
    const delta = (b[m] as number) - (a[m] as number);
    const abs = Math.abs(delta);
    if (abs > bestAbs) {
      bestAbs = abs;
      bestSigned = delta;
      bestMonth = m;
    }
  }

  return bestMonth >= 0 ? { month: bestMonth, delta: bestSigned } : null;
}
