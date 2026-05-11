import { CLIMATE_END, CLIMATE_START, HIST_START } from "./config.js";
import { db, type ClimateRow, type WeatherRow } from "./db.js";
import {
  fetchClimateProjection,
  fetchHistoricalDaily,
  geocode as geocodeLive,
  roundCoord,
  type Geocoded,
} from "./sources/openMeteo.js";
import { fetchPowerDaily, POWER_MIN_DATE } from "./sources/nasaPower.js";

// Primary historical source. NASA POWER is rate-limit-free in practice;
// Open-Meteo archive has tight daily/minutely caps on the free tier. We
// default to NASA POWER and fall back to Open-Meteo only if NASA fails.
//
// Set HIST_SOURCE=openmeteo to flip the order (e.g. when NASA is down).
const HIST_SOURCE = (process.env.HIST_SOURCE ?? "nasa").toLowerCase();

// Dedupe concurrent live fetches for the same coord. Avoids Open-Meteo 429s
// when generateKundli fires multiple cell-builders in parallel.
const inflightWeather = new Map<string, Promise<void>>();
const inflightClimate = new Map<string, Promise<void>>();
const coordKey = (lat: number, lon: number) => `${lat},${lon}`;
const todayIso = () => new Date().toISOString().slice(0, 10);

// ----- Geocode cache -----

const selGeo = db.prepare<[string], Geocoded & { fetched_at: string }>(`
  SELECT query, display_name AS displayName, country, country_code AS countryCode,
         admin1, lat, lon, fetched_at
  FROM geocode WHERE query = ?
`);

const insGeo = db.prepare(`
  INSERT OR REPLACE INTO geocode (query, display_name, country, country_code, admin1, lat, lon)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

export async function getGeocode(city: string, country?: string): Promise<Geocoded | null> {
  const key = country ? `${city.toLowerCase()}|${country.toLowerCase()}` : city.toLowerCase();
  const cached = selGeo.get(key);
  if (cached) return cached;
  const live = await geocodeLive(city, country);
  if (!live) return null;
  insGeo.run(
    live.query, live.displayName, live.country, live.countryCode,
    live.admin1, live.lat, live.lon,
  );
  return live;
}

// ----- Weather cache (ERA5 historical) -----

const selWeatherRange = db.prepare<[number, number, string, string], WeatherRow>(`
  SELECT lat, lon, date, tmax, tmin, precip
  FROM weather_daily
  WHERE lat = ? AND lon = ? AND date BETWEEN ? AND ?
  ORDER BY date
`);

const selWeatherCoverage = db.prepare<
  [number, number, string, string],
  { covered: number }
>(`
  SELECT COUNT(*) AS covered
  FROM weather_daily
  WHERE lat = ? AND lon = ? AND date BETWEEN ? AND ?
`);

const selWeatherAny = db.prepare<[number, number], { n: number }>(`
  SELECT COUNT(*) AS n FROM weather_daily WHERE lat = ? AND lon = ?
`);

const insWeather = db.prepare(`
  INSERT OR REPLACE INTO weather_daily (lat, lon, date, tmax, tmin, precip)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const insWeatherMany = db.transaction((rows: WeatherRow[]) => {
  for (const r of rows) insWeather.run(r.lat, r.lon, r.date, r.tmax, r.tmin, r.precip);
});

function daysBetween(start: string, end: string): number {
  const s = new Date(start + "T00:00:00Z").getTime();
  const e = new Date(end + "T00:00:00Z").getTime();
  return Math.floor((e - s) / 86400000) + 1;
}

export type WeatherFetchOpts = {
  /** When true, allow live API fallback. Default true. Set false to force cache-only. */
  allowLive?: boolean;
};

async function fetchFromNasa(lat: number, lon: number): Promise<WeatherRow[]> {
  // NASA POWER starts 1981; clamp upstream but still emit rows for that range.
  const live = await fetchPowerDaily(lat, lon, POWER_MIN_DATE, todayIso());
  return live.dates.map((date, i) => ({
    lat,
    lon,
    date,
    tmax: live.tmax[i] ?? null,
    tmin: live.tmin[i] ?? null,
    precip: live.precip[i] ?? null,
  }));
}

async function fetchFromOpenMeteo(lat: number, lon: number): Promise<WeatherRow[]> {
  const live = await fetchHistoricalDaily(lat, lon, HIST_START, todayIso());
  return live.dates.map((date, i) => ({
    lat,
    lon,
    date,
    tmax: live.tmax[i] ?? null,
    tmin: live.tmin[i] ?? null,
    precip: live.precip[i] ?? null,
  }));
}

// In-memory record of coords we've already attempted to gap-fill from
// Open-Meteo for pre-1981 years. Prevents hammering Open-Meteo on every
// visitor request when the daily cap is tripped or there's a genuine miss.
// Resets on process restart, which is fine — a fresh server retries once.
const openMeteoFilledForCoord = new Set<string>();

async function fillPre1981Gap(lat: number, lon: number): Promise<void> {
  // Only NASA-primary configs need this: NASA POWER starts 1981, so a
  // visitor born in (say) 1964 lands rows for 1981+ only and the birth-year
  // extremes / rainfall-decade cells go blank. Open-Meteo ERA5 covers 1940+,
  // so we backfill the missing window from there and merge into the cache.
  const key = coordKey(lat, lon);
  if (openMeteoFilledForCoord.has(key)) return;
  try {
    const om = await fetchFromOpenMeteo(lat, lon);
    const older = om.filter((r) => r.date < POWER_MIN_DATE);
    if (older.length) insWeatherMany(older);
  } catch (err) {
    console.warn(`[hist] open-meteo gap-fill failed for (${lat},${lon}): ${(err as Error).message}`);
  } finally {
    // Mark attempted regardless of success so we don't loop on every request
    // when Open-Meteo is daily-capped. Process restart clears this.
    openMeteoFilledForCoord.add(key);
  }
}

async function fetchFullHistorical(
  lat: number,
  lon: number,
  needPre1981: boolean,
): Promise<void> {
  const key = coordKey(lat, lon);
  const existing = inflightWeather.get(key);
  if (existing) return existing;
  const p = (async () => {
    const order = HIST_SOURCE === "openmeteo"
      ? [fetchFromOpenMeteo, fetchFromNasa] as const
      : [fetchFromNasa, fetchFromOpenMeteo] as const;
    let lastErr: unknown;
    let rows: WeatherRow[] | null = null;
    let usedFn: typeof order[number] | null = null;
    for (const fn of order) {
      try {
        rows = await fn(lat, lon);
        usedFn = fn;
        break;
      } catch (err) {
        lastErr = err;
        console.warn(`[hist] ${fn.name} failed for (${lat},${lon}): ${(err as Error).message}`);
      }
    }
    if (!rows) {
      throw new Error(`historical fetch failed for (${lat},${lon}): ${(lastErr as Error)?.message ?? "unknown"}`);
    }
    insWeatherMany(rows);
    // If primary was NASA (no pre-1981 data) and the request needs older
    // years, backfill from Open-Meteo. If primary was Open-Meteo it already
    // covers 1940+, so no gap exists.
    if (needPre1981 && usedFn === fetchFromNasa) {
      await fillPre1981Gap(lat, lon);
    } else if (usedFn === fetchFromOpenMeteo) {
      openMeteoFilledForCoord.add(key);
    }
  })();
  inflightWeather.set(key, p);
  try {
    await p;
  } finally {
    inflightWeather.delete(key);
  }
}

export async function getWeatherDaily(
  lat: number,
  lon: number,
  startDate: string,
  endDate: string,
  opts: WeatherFetchOpts = {},
): Promise<WeatherRow[]> {
  const allowLive = opts.allowLive ?? true;
  lat = roundCoord(lat);
  lon = roundCoord(lon);

  const expected = daysBetween(startDate, endDate);
  const coverageRow = selWeatherCoverage.get(lat, lon, startDate, endDate);
  const covered = coverageRow?.covered ?? 0;

  // Allow ~2% missing days (ERA5 sometimes drops a day) before treating as gap.
  if (covered >= expected * 0.98) {
    return selWeatherRange.all(lat, lon, startDate, endDate);
  }

  if (!allowLive) return selWeatherRange.all(lat, lon, startDate, endDate);

  const needPre1981 = startDate < POWER_MIN_DATE;

  // Short-circuit: if we already attempted Open-Meteo gap-fill for this coord
  // (success or failure) and we have rows cached, don't re-fetch on every
  // request. Without this, a daily-capped Open-Meteo would re-throw on every
  // visitor with a pre-1981 birth year.
  const any = selWeatherAny.get(lat, lon)?.n ?? 0;
  if (any > 0 && needPre1981 && openMeteoFilledForCoord.has(coordKey(lat, lon))) {
    return selWeatherRange.all(lat, lon, startDate, endDate);
  }

  // Miss / partial → fetch full historical range once. Concurrent callers for
  // the same coord share a single in-flight promise. Subsequent cell-builders
  // hit the cache.
  await fetchFullHistorical(lat, lon, needPre1981);
  return selWeatherRange.all(lat, lon, startDate, endDate);
}

// ----- Climate cache (CMIP6 projection) -----

const selClimateRange = db.prepare<[number, number, string, string], ClimateRow>(`
  SELECT lat, lon, date, tmax, tmin
  FROM climate_proj_daily
  WHERE lat = ? AND lon = ? AND date BETWEEN ? AND ?
  ORDER BY date
`);

const selClimateCoverage = db.prepare<
  [number, number, string, string],
  { covered: number }
>(`
  SELECT COUNT(*) AS covered
  FROM climate_proj_daily
  WHERE lat = ? AND lon = ? AND date BETWEEN ? AND ?
`);

const insClimate = db.prepare(`
  INSERT OR REPLACE INTO climate_proj_daily (lat, lon, date, tmax, tmin)
  VALUES (?, ?, ?, ?, ?)
`);

const insClimateMany = db.transaction((rows: ClimateRow[]) => {
  for (const r of rows) insClimate.run(r.lat, r.lon, r.date, r.tmax, r.tmin);
});

async function fetchFullClimate(lat: number, lon: number): Promise<void> {
  const key = coordKey(lat, lon);
  const existing = inflightClimate.get(key);
  if (existing) return existing;
  const p = (async () => {
    const live = await fetchClimateProjection(lat, lon, CLIMATE_START, CLIMATE_END);
    const rows: ClimateRow[] = live.dates.map((date, i) => ({
      lat,
      lon,
      date,
      tmax: live.tmax[i] ?? null,
      tmin: live.tmin[i] ?? null,
    }));
    insClimateMany(rows);
  })();
  inflightClimate.set(key, p);
  try {
    await p;
  } finally {
    inflightClimate.delete(key);
  }
}

export async function getClimateDaily(
  lat: number,
  lon: number,
  startDate: string,
  endDate: string,
  opts: WeatherFetchOpts = {},
): Promise<ClimateRow[]> {
  const allowLive = opts.allowLive ?? true;
  lat = roundCoord(lat);
  lon = roundCoord(lon);

  const expected = daysBetween(startDate, endDate);
  const coverageRow = selClimateCoverage.get(lat, lon, startDate, endDate);
  const covered = coverageRow?.covered ?? 0;

  if (covered >= expected * 0.98) {
    return selClimateRange.all(lat, lon, startDate, endDate);
  }
  if (!allowLive) return selClimateRange.all(lat, lon, startDate, endDate);

  await fetchFullClimate(lat, lon);
  return selClimateRange.all(lat, lon, startDate, endDate);
}
