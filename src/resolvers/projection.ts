import type { Cache } from "../cache/store.js";
import { Budget } from "../lib/budget.js";
import { gridKey } from "../lib/grid.js";
import { applyOpenMeteoCredentials } from "../lib/openmeteo.js";
import type { HistoricalWeatherResult } from "./historical.js";
import type { City, Confidence, Source } from "../types.js";

export interface ProjectionResult {
  low: number;
  high: number;
  modelsUsed: string[];
  source: Extract<Source, "cmip6" | "extrapolated">;
  confidence: Confidence;
  reason?: string;
}

interface ProjectionOptions {
  cache: Cache;
  fetchImpl?: typeof fetch;
}

type ClimateDaily = Record<string, Array<number | string | null> | undefined> & { time?: string[] };

interface ClimateResponse {
  daily?: ClimateDaily;
}

const MODELS = ["MPI_ESM1_2_XR", "EC_Earth3P_HR", "CMCC_CM2_VHR4", "FGOALS_f3_H", "HiRAM_SIT_HR"];

export function createProjectionResolver(options: ProjectionOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async resolve(city: City, birthDate: string, historical: HistoricalWeatherResult | null, budget = new Budget(8000)) {
      const targetYear = 2050;
      const key = projectionCacheKey(city, targetYear);
      const cached = options.cache.get<ProjectionResult>(key);

      if (cached) {
        return cached;
      }

      const range = projectionWindow(birthDate, targetYear);
      const cmip6 = await fetchCmip6(city, range.start, range.end, fetchImpl, budget);
      if (cmip6) {
        options.cache.set(key, cmip6);
        return cmip6;
      }

      const extrapolated = historical ? extrapolateProjection(historical, targetYear) : null;
      if (extrapolated) {
        options.cache.set(key, extrapolated);
      }
      return extrapolated;
    },
  };
}

export function projectionCacheKey(city: Pick<City, "lat" | "lon">, targetYear: number): string {
  return `proj:v1:${gridKey(city.lat, city.lon)}:${targetYear}`;
}

export function buildProjectionWindow(birthDate: string, targetYear = 2050): { start: string; end: string } {
  return projectionWindow(birthDate, targetYear);
}

async function fetchCmip6(
  city: City,
  startDate: string,
  endDate: string,
  fetchImpl: typeof fetch,
  budget: Budget,
): Promise<ProjectionResult | null> {
  const url = new URL("https://climate-api.open-meteo.com/v1/climate");
  url.searchParams.set("latitude", String(city.lat));
  url.searchParams.set("longitude", String(city.lon));
  url.searchParams.set("start_date", startDate);
  url.searchParams.set("end_date", endDate);
  url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min");
  url.searchParams.set("models", MODELS.join(","));
  applyOpenMeteoCredentials(url);

  try {
    const body = await fetchJsonWithRetry<ClimateResponse>(url, fetchImpl, budget.signal(3000));
    return mergeCmip6(body.daily);
  } catch {
    return null;
  }
}

function mergeCmip6(daily: ClimateDaily | undefined): ProjectionResult | null {
  const dates = daily?.time ?? [];
  if (!daily || dates.length === 0) {
    return null;
  }

  const modelArrays = MODELS.map((model) => ({
    model,
    tmax: findModelArray(daily, "temperature_2m_max", model),
    tmin: findModelArray(daily, "temperature_2m_min", model),
  }));
  const modelsUsed = new Set<string>();
  const highs: number[] = [];
  const lows: number[] = [];

  for (let index = 0; index < dates.length; index += 1) {
    const high = firstModelValue(modelArrays, "tmax", index, modelsUsed);
    const low = firstModelValue(modelArrays, "tmin", index, modelsUsed);

    if (high !== null) {
      highs.push(high);
    }
    if (low !== null) {
      lows.push(low);
    }
  }

  if (highs.length === 0 || lows.length === 0) {
    return null;
  }

  return {
    low: Math.min(...lows),
    high: Math.max(...highs),
    modelsUsed: [...modelsUsed],
    source: "cmip6",
    confidence: "high",
  };
}

function extrapolateProjection(historical: HistoricalWeatherResult, targetYear: number): ProjectionResult | null {
  const annual = annualMeans(historical.daily);
  const years = [...annual.keys()].sort((a, b) => a - b).slice(-30);

  if (years.length < 2) {
    return null;
  }

  const firstYear = years[0];
  const lastYear = years[years.length - 1];
  const first = annual.get(firstYear);
  const last = annual.get(lastYear);

  if (!first || !last) {
    return null;
  }

  return {
    low: extrapolate(first.tmin, last.tmin, firstYear, lastYear, targetYear),
    high: extrapolate(first.tmax, last.tmax, firstYear, lastYear, targetYear),
    modelsUsed: [],
    source: "extrapolated",
    confidence: "low",
    reason: "extrapolated",
  };
}

function annualMeans(daily: HistoricalWeatherResult["daily"]): Map<number, { tmax: number; tmin: number }> {
  const grouped = new Map<number, { tmax: number[]; tmin: number[] }>();

  for (const day of daily) {
    const year = Number(day.date.slice(0, 4));
    const entry = grouped.get(year) ?? { tmax: [], tmin: [] };
    if (day.tmax !== null) {
      entry.tmax.push(day.tmax);
    }
    if (day.tmin !== null) {
      entry.tmin.push(day.tmin);
    }
    grouped.set(year, entry);
  }

  const out = new Map<number, { tmax: number; tmin: number }>();
  for (const [year, values] of grouped) {
    if (values.tmax.length > 0 && values.tmin.length > 0) {
      out.set(year, { tmax: mean(values.tmax), tmin: mean(values.tmin) });
    }
  }
  return out;
}

function projectionWindow(birthDate: string, targetYear: number): { start: string; end: string } {
  const month = Number(birthDate.slice(5, 7));
  const day = Number(birthDate.slice(8, 10));
  const center = Date.UTC(targetYear, month - 1, day);
  return {
    start: isoDate(new Date(center - 7 * 24 * 60 * 60 * 1000)),
    end: isoDate(new Date(center + 7 * 24 * 60 * 60 * 1000)),
  };
}

function findModelArray(daily: ClimateDaily, prefix: string, model: string): Array<number | string | null> {
  const target = `${prefix}_${model}`.toLowerCase();
  const key = Object.keys(daily).find((candidate) => candidate.toLowerCase() === target);
  return key ? daily[key] ?? [] : [];
}

function firstModelValue(
  modelArrays: Array<{ model: string; tmax: Array<number | string | null>; tmin: Array<number | string | null> }>,
  field: "tmax" | "tmin",
  index: number,
  modelsUsed: Set<string>,
): number | null {
  for (const entry of modelArrays) {
    const raw = entry[field][index];
    if (raw === null || raw === undefined || raw === "") {
      continue;
    }
    const value = Number(raw);
    if (Number.isFinite(value)) {
      modelsUsed.add(entry.model);
      return value;
    }
  }
  return null;
}

async function fetchJsonWithRetry<T>(url: URL, fetchImpl: typeof fetch, signal: AbortSignal): Promise<T> {
  try {
    return await fetchJson<T>(url, fetchImpl, signal);
  } catch (error) {
    if (signal.aborted) {
      throw error;
    }
    await delay(200, signal);
    return fetchJson<T>(url, fetchImpl, signal);
  }
}

async function fetchJson<T>(url: URL, fetchImpl: typeof fetch, signal: AbortSignal): Promise<T> {
  const res = await fetchImpl(url, { signal });

  if (!res.ok) {
    throw new Error(`projection fetch failed: ${res.status}`);
  }

  return (await res.json()) as T;
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }

    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

function extrapolate(first: number, last: number, firstYear: number, lastYear: number, targetYear: number): number {
  return last + ((last - first) / (lastYear - firstYear)) * (targetYear - lastYear);
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
