import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Cache } from "../cache/store.js";
import { Budget } from "../lib/budget.js";
import { gridKey } from "../lib/grid.js";
import { haversineKm } from "../lib/haversine.js";
import type { City, Confidence, Source } from "../types.js";

export interface WeatherDaily {
  date: string;
  tmax: number | null;
  tmin: number | null;
  precip: number | null;
}

export interface HistoricalWeatherResult {
  daily: WeatherDaily[];
  source: Extract<Source, "era5" | "nasa_power" | "nearest_city">;
  confidence: Confidence;
  reason?: string;
  nearestCity?: string;
}

interface HistoricalOptions {
  cache: Cache;
  fetchImpl?: typeof fetch;
  prewarmCities?: City[];
  dataDir?: string;
  openMeteoTimeoutMs?: number;
  nasaTimeoutMs?: number;
  enableNearestFallback?: boolean;
  onError?: (event: { city: City; tier: "open-meteo" | "nasa-power"; error: string }) => void;
}

interface OpenMeteoArchiveResponse {
  daily?: {
    time?: string[];
    temperature_2m_max?: Array<number | null>;
    temperature_2m_min?: Array<number | null>;
    precipitation_sum?: Array<number | null>;
  };
}

interface NasaPowerResponse {
  properties?: {
    parameter?: {
      T2M_MAX?: Record<string, number>;
      T2M_MIN?: Record<string, number>;
      PRECTOTCORR?: Record<string, number>;
    };
  };
}

const NASA_START = "1981-01-01";

export function createHistoricalResolver(options: HistoricalOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const dataDir = options.dataDir ?? join(process.cwd(), "src", "data");
  const prewarmCities = options.prewarmCities ?? loadJson<City[]>(join(dataDir, "prewarm_cities.json"));
  const openMeteoTimeoutMs = options.openMeteoTimeoutMs ?? 4000;
  const nasaTimeoutMs = options.nasaTimeoutMs ?? 4000;
  const enableNearestFallback = options.enableNearestFallback ?? true;

  return {
    async resolve(city: City, startDate: string, endDate: string, budget = new Budget(8000)) {
      const range = fullYearRange(startDate, endDate);
      const key = historicalCacheKey(city, range.startYear, range.endYear);
      const cached = options.cache.get<HistoricalWeatherResult>(key);

      if (cached) {
        return cached;
      }

      const era5 = await fetchOpenMeteo(city, range.start, range.end, fetchImpl, budget, openMeteoTimeoutMs, options.onError);
      if (era5) {
        options.cache.set(key, era5);
        return era5;
      }

      if (range.start >= NASA_START) {
        const nasa = await fetchNasaPower(city, range.start, range.end, fetchImpl, budget, nasaTimeoutMs, options.onError);
        if (nasa) {
          options.cache.set(key, nasa);
          return nasa;
        }
      }

      return enableNearestFallback ? nearestPrewarmed(city, range.startYear, range.endYear, prewarmCities, options.cache) : null;
    },
  };
}

export function historicalCacheKey(city: Pick<City, "lat" | "lon">, startYear: number, endYear: number): string {
  return `hist:raw:v1:${gridKey(city.lat, city.lon)}:${startYear}:${endYear}`;
}

async function fetchOpenMeteo(
  city: City,
  startDate: string,
  endDate: string,
  fetchImpl: typeof fetch,
  budget: Budget,
  timeoutMs: number,
  onError: HistoricalOptions["onError"],
): Promise<HistoricalWeatherResult | null> {
  const url = new URL("https://archive-api.open-meteo.com/v1/archive");
  url.searchParams.set("latitude", String(city.lat));
  url.searchParams.set("longitude", String(city.lon));
  url.searchParams.set("start_date", startDate);
  url.searchParams.set("end_date", endDate);
  url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,precipitation_sum");
  url.searchParams.set("timezone", "auto");

  try {
    const body = await fetchJsonWithRetry<OpenMeteoArchiveResponse>(url, fetchImpl, budget.signal(timeoutMs));
    const daily = toDaily(
      body.daily?.time ?? [],
      body.daily?.temperature_2m_max ?? [],
      body.daily?.temperature_2m_min ?? [],
      body.daily?.precipitation_sum ?? [],
    );

    return daily.length > 0 ? { daily, source: "era5", confidence: "high" } : null;
  } catch (error) {
    onError?.({ city, tier: "open-meteo", error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

async function fetchNasaPower(
  city: City,
  startDate: string,
  endDate: string,
  fetchImpl: typeof fetch,
  budget: Budget,
  timeoutMs: number,
  onError: HistoricalOptions["onError"],
): Promise<HistoricalWeatherResult | null> {
  const url = new URL("https://power.larc.nasa.gov/api/temporal/daily/point");
  url.searchParams.set("parameters", "T2M_MAX,T2M_MIN,PRECTOTCORR");
  url.searchParams.set("community", "AG");
  url.searchParams.set("longitude", String(city.lon));
  url.searchParams.set("latitude", String(city.lat));
  url.searchParams.set("start", compactDate(startDate));
  url.searchParams.set("end", compactDate(endDate));
  url.searchParams.set("format", "JSON");

  try {
    const body = await fetchJsonWithRetry<NasaPowerResponse>(url, fetchImpl, budget.signal(timeoutMs));
    const params = body.properties?.parameter;
    if (!params?.T2M_MAX || !params.T2M_MIN || !params.PRECTOTCORR) {
      return null;
    }

    const dates = Object.keys(params.T2M_MAX).sort();
    const daily = dates.map((dateKey) => ({
      date: isoDate(dateKey),
      tmax: normalizeNasaValue(params.T2M_MAX?.[dateKey]),
      tmin: normalizeNasaValue(params.T2M_MIN?.[dateKey]),
      precip: normalizeNasaValue(params.PRECTOTCORR?.[dateKey]),
    }));

    return daily.length > 0 ? { daily, source: "nasa_power", confidence: "high" } : null;
  } catch (error) {
    onError?.({ city, tier: "nasa-power", error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

function nearestPrewarmed(
  city: City,
  startYear: number,
  endYear: number,
  prewarmCities: City[],
  cache: Cache,
): HistoricalWeatherResult | null {
  const nearest = prewarmCities
    .map((candidate) => ({ candidate, distanceKm: haversineKm(city, candidate) }))
    .sort((a, b) => a.distanceKm - b.distanceKm)[0];

  if (!nearest || nearest.distanceKm > 300) {
    return null;
  }

  const cached = cache.get<HistoricalWeatherResult>(historicalCacheKey(nearest.candidate, startYear, endYear));
  if (!cached) {
    return null;
  }

  const roundedKm = Math.round(nearest.distanceKm);
  const confidence: Confidence = roundedKm <= 100 ? "medium" : "low";

  return {
    daily: cached.daily,
    source: "nearest_city",
    confidence,
    nearestCity: nearest.candidate.displayName,
    reason: confidence === "low" ? `nearest-city-${roundedKm}km` : undefined,
  };
}

function toDaily(
  dates: string[],
  tmax: Array<number | null>,
  tmin: Array<number | null>,
  precip: Array<number | null>,
): WeatherDaily[] {
  return dates.map((date, index) => ({
    date,
    tmax: finiteOrNull(tmax[index]),
    tmin: finiteOrNull(tmin[index]),
    precip: finiteOrNull(precip[index]),
  }));
}

function fullYearRange(startDate: string, endDate: string) {
  const startYear = Number(startDate.slice(0, 4));
  const endYear = Number(endDate.slice(0, 4));
  const requestedEnd = `${endYear}-12-31`;
  const archiveMax = new Date().toISOString().slice(0, 10);

  return {
    startYear,
    endYear,
    start: `${startYear}-01-01`,
    end: requestedEnd > archiveMax ? archiveMax : requestedEnd,
  };
}

async function fetchJsonWithRetry<T>(url: URL, fetchImpl: typeof fetch, signal: AbortSignal): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await fetchJson<T>(url, fetchImpl, signal);
    } catch (error) {
      lastError = error;
      if (signal.aborted || attempt === 3) {
        throw error;
      }

      await delay(retryDelayMs(error, attempt), signal);
    }
  }

  throw lastError;
}

async function fetchJson<T>(url: URL, fetchImpl: typeof fetch, signal: AbortSignal): Promise<T> {
  const res = await fetchImpl(url, { signal });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new HttpError(res.status, body, Number(res.headers.get("retry-after")));
  }

  return (await res.json()) as T;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    readonly retryAfterSec: number,
  ) {
    super(`historical fetch failed: ${status}${body ? ` ${body}` : ""}`);
  }
}

function retryDelayMs(error: unknown, attempt: number): number {
  if (error instanceof HttpError && error.status === 429) {
    return Number.isFinite(error.retryAfterSec) ? error.retryAfterSec * 1000 : 65_000;
  }

  return 200 * attempt;
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

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeNasaValue(value: number | undefined): number | null {
  return value === undefined || value === -999 ? null : finiteOrNull(value);
}

function compactDate(date: string): string {
  return date.replaceAll("-", "");
}

function isoDate(date: string): string {
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
}

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}
