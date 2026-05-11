// NASA POWER daily point API.
//
// Used as the primary historical weather source for the PoC. Free, no auth,
// generous rate limits (a single user can fetch decades of data per call
// without throttling). Backed by MERRA-2 reanalysis.
//
// Limitations vs Open-Meteo ERA5:
//   * starts 1981-01-01 (ERA5 starts 1940)
//   * ~50km native grid (ERA5 is ~10km) — fine for city-level extremes
//   * latency: ~5-7 days (similar to ERA5)
//
// API ref: https://power.larc.nasa.gov/docs/services/api/temporal/daily/
//
// We keep the same DailyWeather output shape as openMeteo.fetchHistoricalDaily
// so cache.ts can drop it in without changes.

import type { DailyWeather } from "./openMeteo.js";

export const POWER_DAILY_API =
  "https://power.larc.nasa.gov/api/temporal/daily/point";

// NASA POWER's effective lower bound for daily MERRA-2 data.
export const POWER_MIN_DATE = "1981-01-01";

function toPowerDate(iso: string): string {
  return iso.replace(/-/g, "");
}

function fromPowerDate(p: string): string {
  return `${p.slice(0, 4)}-${p.slice(4, 6)}-${p.slice(6, 8)}`;
}

function clampStart(iso: string): string {
  return iso < POWER_MIN_DATE ? POWER_MIN_DATE : iso;
}

export async function fetchPowerDaily(
  lat: number,
  lon: number,
  startDate: string,
  endDate: string,
): Promise<DailyWeather> {
  const start = clampStart(startDate);
  const params = new URLSearchParams({
    parameters: "T2M_MAX,T2M_MIN,PRECTOTCORR",
    community: "AG",
    latitude: String(lat),
    longitude: String(lon),
    start: toPowerDate(start),
    end: toPowerDate(endDate),
    format: "JSON",
    "time-standard": "LST",
  });
  const url = `${POWER_DAILY_API}?${params}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `NASA POWER failed (${res.status}): ${await res.text().catch(() => "")}`,
    );
  }
  const json = (await res.json()) as {
    properties?: {
      parameter?: {
        T2M_MAX?: Record<string, number>;
        T2M_MIN?: Record<string, number>;
        PRECTOTCORR?: Record<string, number>;
      };
    };
    header?: { fill_value?: number };
  };
  const param = json.properties?.parameter;
  if (!param) throw new Error("NASA POWER: missing properties.parameter");

  const fill = json.header?.fill_value ?? -999;
  const tmaxMap = param.T2M_MAX ?? {};
  const tminMap = param.T2M_MIN ?? {};
  const precMap = param.PRECTOTCORR ?? {};

  const sortedKeys = Object.keys(tmaxMap).sort();
  const dates: string[] = [];
  const tmax: (number | null)[] = [];
  const tmin: (number | null)[] = [];
  const precip: (number | null)[] = [];

  const sentinel = (v: unknown): number | null => {
    if (typeof v !== "number" || !Number.isFinite(v)) return null;
    if (v === fill) return null;
    return v;
  };

  for (const k of sortedKeys) {
    dates.push(fromPowerDate(k));
    tmax.push(sentinel(tmaxMap[k]));
    tmin.push(sentinel(tminMap[k]));
    precip.push(sentinel(precMap[k]));
  }

  return { dates, tmax, tmin, precip };
}
