import {
  CLIMATE_API,
  CLIMATE_MODELS,
  COORD_PRECISION,
  GEOCODE_API,
  HISTORICAL_API,
} from "../config.js";

export type Geocoded = {
  query: string;
  displayName: string;
  country: string | null;
  countryCode: string | null;  // ISO 3166-1 alpha-2, e.g. "IN"
  admin1: string | null;
  lat: number;
  lon: number;
  population?: number | null;
  featureCode?: string | null;
};

export function roundCoord(n: number): number {
  const f = 10 ** COORD_PRECISION;
  return Math.round(n * f) / f;
}

// ----- throttled upstream client -----
//
// Open-Meteo free tier enforces a *minutely* request cap that is much lower
// than the documented daily cap. Concurrent fetches across cell builders +
// background prefetch will burst past it. We funnel every upstream call
// through one queue with min spacing, single-flight, and exponential 429
// retry. Prefetch and live visitor traffic share the queue, so visitor reqs
// naturally interleave with the slower bulk job.

const MIN_GAP_MS = Number(process.env.OPENMETEO_MIN_GAP_MS ?? 1200);
const COOLDOWN_MS = Number(process.env.OPENMETEO_COOLDOWN_MS ?? 65_000);
const MAX_429_RETRIES = 6;

let chain: Promise<unknown> = Promise.resolve();
let lastSent = 0;
let cooldownUntil = 0;

function noteRateLimit(retryAfterSec: number | null): void {
  // Pause the entire queue. Open-Meteo enforces a per-minute cap; once tripped
  // every request 429s until the minute rolls over. Stopping globally avoids
  // burning retries.
  const wait = retryAfterSec && retryAfterSec > 0
    ? retryAfterSec * 1000 + 2_000
    : COOLDOWN_MS;
  cooldownUntil = Math.max(cooldownUntil, Date.now() + wait);
}

async function gate<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    while (true) {
      const cool = cooldownUntil - Date.now();
      if (cool <= 0) break;
      await new Promise((r) => setTimeout(r, cool));
    }
    const wait = Math.max(0, lastSent + MIN_GAP_MS - Date.now());
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastSent = Date.now();
    return fn();
  });
  chain = run.catch(() => undefined);
  return run;
}

// Once the daily cap is tripped, no amount of waiting helps until UTC rollover.
// We latch a flag so subsequent callers fail fast instead of camping behind a
// retry loop. Reset on a successful response, or by restarting the process.
let dailyCapTrippedAt = 0;
const DAILY_CAP_RESET_MS = 6 * 60 * 60 * 1000; // safety: reset after 6h

function isDailyCap(body: string): boolean {
  return /Daily.*limit/i.test(body);
}

async function throttledFetch(url: string, label: string): Promise<Response> {
  if (dailyCapTrippedAt > 0 && Date.now() - dailyCapTrippedAt < DAILY_CAP_RESET_MS) {
    throw new Error(`open-meteo ${label} skipped: daily cap reached, will retry next session`);
  }
  for (let attempt = 0; attempt <= MAX_429_RETRIES; attempt++) {
    const res = await gate(() => fetch(url));
    if (res.status !== 429) {
      dailyCapTrippedAt = 0;
      return res;
    }
    // Peek body to distinguish daily vs minutely cap.
    const body = await res.clone().text().catch(() => "");
    if (isDailyCap(body)) {
      dailyCapTrippedAt = Date.now();
      throw new Error(`open-meteo ${label} hit daily cap; aborting`);
    }
    const retryAfter = Number(res.headers.get("retry-after"));
    noteRateLimit(Number.isFinite(retryAfter) ? retryAfter : null);
    const remaining = Math.max(0, cooldownUntil - Date.now());
    console.warn(
      `[open-meteo] 429 on ${label} (attempt ${attempt + 1}/${MAX_429_RETRIES + 1}); pausing all upstream traffic ${remaining}ms`,
    );
  }
  throw new Error(`open-meteo ${label} failed: rate-limited after ${MAX_429_RETRIES + 1} attempts`);
}

export async function geocode(city: string, country?: string): Promise<Geocoded | null> {
  const params = new URLSearchParams({
    name: city,
    count: "5",
    language: "en",
    format: "json",
  });
  const url = `${GEOCODE_API}?${params}`;
  // Geocoding API has separate (much more generous) quota than archive/climate;
  // bypass the throttle gate so a daily-cap on data fetches doesn't kill the
  // city autocomplete UX.
  const res = await fetch(url);
  if (!res.ok) throw new Error(`geocode failed: ${res.status} ${res.statusText}`);
  const json = (await res.json()) as { results?: Array<{
    name: string;
    country?: string;
    country_code?: string;
    admin1?: string;
    latitude: number;
    longitude: number;
  }> };

  const results = json.results ?? [];
  if (results.length === 0) return null;

  // If caller passed country, prefer matching one. Otherwise first.
  const pick = country
    ? results.find(
        (r) =>
          r.country?.toLowerCase() === country.toLowerCase() ||
          r.country_code?.toLowerCase() === country.toLowerCase(),
      ) ?? results[0]
    : results[0];

  if (!pick) return null;

  const queryKey = country
    ? `${city.toLowerCase()}|${country.toLowerCase()}`
    : city.toLowerCase();

  return {
    query: queryKey,
    displayName: [pick.name, pick.admin1, pick.country].filter(Boolean).join(", "),
    country: pick.country ?? null,
    countryCode: pick.country_code ? pick.country_code.toUpperCase() : null,
    admin1: pick.admin1 ?? null,
    lat: roundCoord(pick.latitude),
    lon: roundCoord(pick.longitude),
  };
}

type RawGeoHit = {
  name: string;
  country?: string;
  country_code?: string;
  admin1?: string;
  latitude: number;
  longitude: number;
  population?: number;
  feature_code?: string;
};

// Open-Meteo feature codes:
//   PPLC = capital city
//   PPLA, PPLA2..5 = admin-1..5 seat
//   PPL = populated place
//   PPLX = section of populated place
//   STLMT = settlement (often tiny)
// Anything not starting with PPL (parks, mountains, lakes, roads, sports
// venues, post offices) is rejected.
function isPopulatedPlace(code: string | undefined | null): boolean {
  if (!code) return true; // be permissive when feature_code is missing
  return code.startsWith("PPL");
}

function rawToGeo(r: RawGeoHit): Geocoded {
  return {
    query: `${r.name.toLowerCase()}|${(r.country ?? "").toLowerCase()}`,
    displayName: [r.name, r.admin1, r.country].filter(Boolean).join(", "),
    country: r.country ?? null,
    countryCode: r.country_code ? r.country_code.toUpperCase() : null,
    admin1: r.admin1 ?? null,
    lat: roundCoord(r.latitude),
    lon: roundCoord(r.longitude),
    population: typeof r.population === "number" ? r.population : null,
    featureCode: r.feature_code ?? null,
  };
}

async function rawGeocode(name: string, count: number): Promise<RawGeoHit[]> {
  const params = new URLSearchParams({
    name,
    count: String(count),
    language: "en",
    format: "json",
  });
  const url = `${GEOCODE_API}?${params}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`geocode failed: ${res.status} ${res.statusText}`);
  const json = (await res.json()) as { results?: RawGeoHit[] };
  return json.results ?? [];
}

// Variant that returns multiple matches for the autocomplete UI. Cheap,
// uncached (geocoding is fast and the typing UX needs <250ms responses).
//
// Improvements over a raw passthrough:
//   1. Skips non-populated features (parks, mountains, post offices) so
//      "Bombay" returns settlements, not "Bombay Hook National Wildlife Refuge".
//   2. Sorts by population descending so the famous metro lands at the top
//      when its name collides with smaller towns (Calcutta, Ohio etc.).
//   3. Optional second query for an aliased canonical name. Typing "bombay"
//      also queries "Mumbai" and merges, because Open-Meteo indexes the city
//      under its current official name.
export async function geocodeSearch(
  query: string,
  limit = 8,
  extraQueries: string[] = [],
): Promise<Geocoded[]> {
  const fetchCount = Math.max(limit * 2, 12); // overfetch so filtering still leaves enough
  const seenQueries = new Set<string>([query.toLowerCase()]);
  const tasks: Promise<RawGeoHit[]>[] = [rawGeocode(query, fetchCount)];
  for (const extra of extraQueries) {
    const k = extra.toLowerCase();
    if (seenQueries.has(k)) continue;
    seenQueries.add(k);
    tasks.push(rawGeocode(extra, fetchCount).catch(() => []));
  }
  const batches = await Promise.all(tasks);

  // Merge + dedupe by rounded coord (city-level).
  const seen = new Map<string, RawGeoHit>();
  for (const batch of batches) {
    for (const r of batch) {
      if (!isPopulatedPlace(r.feature_code)) continue;
      const k = `${roundCoord(r.latitude)},${roundCoord(r.longitude)}`;
      const prev = seen.get(k);
      if (!prev || (r.population ?? 0) > (prev.population ?? 0)) {
        seen.set(k, r);
      }
    }
  }

  const merged = [...seen.values()].sort((a, b) => (b.population ?? 0) - (a.population ?? 0));
  return merged.slice(0, limit).map(rawToGeo);
}

export type DailyWeather = {
  dates: string[];
  tmax: (number | null)[];
  tmin: (number | null)[];
  precip: (number | null)[];
};

export async function fetchHistoricalDaily(
  lat: number,
  lon: number,
  startDate: string,
  endDate: string,
): Promise<DailyWeather> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    start_date: startDate,
    end_date: endDate,
    daily: "temperature_2m_max,temperature_2m_min,precipitation_sum",
    timezone: "auto",
  });
  const url = `${HISTORICAL_API}?${params}`;
  const res = await throttledFetch(url, `historical ${lat},${lon}`);
  if (!res.ok) {
    throw new Error(
      `open-meteo historical failed (${res.status}): ${await res.text()}`,
    );
  }
  const json = (await res.json()) as {
    daily?: {
      time: string[];
      temperature_2m_max: (number | null)[];
      temperature_2m_min: (number | null)[];
      precipitation_sum: (number | null)[];
    };
  };
  if (!json.daily) throw new Error("open-meteo historical: missing daily payload");
  return {
    dates: json.daily.time,
    tmax: json.daily.temperature_2m_max,
    tmin: json.daily.temperature_2m_min,
    precip: json.daily.precipitation_sum,
  };
}

export type DailyClimate = {
  dates: string[];
  tmax: (number | null)[];
  tmin: (number | null)[];
};

function firstNonNull(seriesList: Array<(number | null)[]>, length: number): (number | null)[] {
  const out: (number | null)[] = new Array(length).fill(null);
  for (let i = 0; i < length; i++) {
    for (const series of seriesList) {
      const v = series?.[i];
      if (v !== null && v !== undefined && Number.isFinite(v)) {
        out[i] = v as number;
        break;
      }
    }
  }
  return out;
}

export async function fetchClimateProjection(
  lat: number,
  lon: number,
  startDate: string,
  endDate: string,
): Promise<DailyClimate> {
  // Pass all models in one request; merge per-day across models, picking the
  // first non-null. Keeps it to one HTTP call regardless of model count.
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    start_date: startDate,
    end_date: endDate,
    models: CLIMATE_MODELS.join(","),
    daily: "temperature_2m_max,temperature_2m_min",
    timezone: "auto",
  });
  const url = `${CLIMATE_API}?${params}`;
  const res = await throttledFetch(url, `climate ${lat},${lon}`);
  if (!res.ok) {
    throw new Error(
      `open-meteo climate failed (${res.status}): ${await res.text()}`,
    );
  }
  const json = (await res.json()) as {
    daily?: {
      time: string[];
      [k: string]: unknown;
    };
  };
  if (!json.daily) throw new Error("open-meteo climate: missing daily payload");

  // When multiple models are requested, Open-Meteo returns per-model keys like
  // `temperature_2m_max_<MODEL>`. When only one is in scope, the unsuffixed key
  // can also appear. Collect every variant in priority order.
  const dates = json.daily.time;
  const len = dates.length;
  const collect = (base: "temperature_2m_max" | "temperature_2m_min") => {
    const seriesList: Array<(number | null)[]> = [];
    for (const m of CLIMATE_MODELS) {
      const arr = json.daily?.[`${base}_${m}`] as (number | null)[] | undefined;
      if (arr) seriesList.push(arr);
    }
    const fallback = json.daily?.[base] as (number | null)[] | undefined;
    if (fallback) seriesList.push(fallback);
    return firstNonNull(seriesList, len);
  };

  return {
    dates,
    tmax: collect("temperature_2m_max"),
    tmin: collect("temperature_2m_min"),
  };
}
