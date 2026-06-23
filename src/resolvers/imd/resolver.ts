import type { Cache } from "../../cache/store.js";
import { loadEnvFile } from "../../lib/load-env-file.js";
import type { City } from "../../types.js";
import { hasImdAuthConfigured, resolveImdCredentials } from "./auth.js";
import { imdFetchJson } from "./client.js";
import { bindNearestStation, loadStationMap } from "./stations.js";
import type { ImdAnnualPeak, ImdStationBinding, ImdStationMapFile } from "./types.js";

export type ImdService = {
  enabled: boolean;
  bindStation(city: Pick<City, "lat" | "lon" | "country">): ImdStationBinding | null;
  getAnnualPeak(stationId: string, year: number): ImdAnnualPeak | null;
};

type CreateImdServiceOptions = {
  cache?: Cache;
  apiKey?: string;
  stationMap?: ImdStationMapFile;
};

export function createImdService(options: CreateImdServiceOptions = {}): ImdService {
  loadEnvFile();
  const map = options.stationMap ?? loadStationMap();
  const cache = options.cache;

  return {
    enabled: map.stations.length > 0,
    bindStation(city) {
      return bindNearestStation(city, map);
    },
    getAnnualPeak(stationId, year) {
      if (cache) {
        const cached = cache.get<ImdAnnualPeak>(peakCacheKey(stationId, year));
        if (cached) {
          return cached;
        }
      }
      return null;
    },
  };
}

export function peakCacheKey(stationId: string, year: number): string {
  return `imd:peak:v1:${stationId}:${year}`;
}

/** Persist a peak after ingest or API backfill. */
export function cacheAnnualPeak(
  cache: Cache,
  stationId: string,
  year: number,
  peak: ImdAnnualPeak,
): void {
  cache.set(peakCacheKey(stationId, year), peak);
}

/** Fetch cityforecast_mapping + aws_data_mapping when API key works. */
export async function fetchStationCatalog(
  creds?: Parameters<typeof imdFetchJson>[1],
): Promise<ImdStationMapFile["stations"]> {
  const auth = creds ?? (await resolveImdCredentials());
  const stations: ImdStationMapFile["stations"] = [];
  const seen = new Set<string>();

  const cityMapping = await imdFetchJson("/api/v1/cityforecast_mapping", auth);
  const cityRows = cityMapping.ok ? imdDataRows(cityMapping.body) : [];
  for (const row of cityRows) {
    pushCityStation(stations, seen, row);
  }

  const awsMapping = await imdFetchJson("/api/v1/aws_data_mapping", auth);
  const awsRows = awsMapping.ok ? imdDataRows(awsMapping.body) : [];
  for (const row of awsRows) {
    pushAwsStation(stations, seen, row);
  }

  if (stations.length === 0) {
    throw new Error(formatCatalogFailure(cityMapping, awsMapping, cityRows, awsRows));
  }

  return stations;
}

/** IMD wraps lists in `{ status, data: [...] }` (casing varies). */
export function imdDataRows(body: unknown): Record<string, unknown>[] {
  if (Array.isArray(body)) {
    return body as Record<string, unknown>[];
  }
  if (body && typeof body === "object") {
    const obj = body as Record<string, unknown>;
    for (const key of ["data", "Data", "DATA", "records", "Records"]) {
      const nested = obj[key];
      if (Array.isArray(nested)) {
        return nested as Record<string, unknown>[];
      }
      if (typeof nested === "string") {
        try {
          const parsed = JSON.parse(nested) as unknown;
          if (Array.isArray(parsed)) {
            return parsed as Record<string, unknown>[];
          }
        } catch {
          // ignore non-JSON string
        }
      }
    }
  }
  return [];
}

function pushCityStation(
  out: ImdStationMapFile["stations"],
  seen: Set<string>,
  row: Record<string, unknown>,
): void {
  pushStation(out, seen, row, {
    idKeys: ["Station_Code", "station_code", "STATION_CODE", "id", "ID"],
    nameKeys: ["Station_Name", "station_name", "STATION_NAME", "name", "Name"],
    latKeys: ["Latitude", "latitude", "Lat", "lat", "LAT"],
    lonKeys: ["Longitude", "longitude", "Lon", "lon", "LON"],
  });
}

function pushAwsStation(
  out: ImdStationMapFile["stations"],
  seen: Set<string>,
  row: Record<string, unknown>,
): void {
  pushStation(out, seen, row, {
    idKeys: ["ID", "id", "Station_Code", "station_code"],
    nameKeys: ["STATION", "Station", "station", "Station_Name", "station_name"],
    latKeys: ["Latitude", "latitude", "Lat", "lat", "LAT"],
    lonKeys: ["Longitude", "longitude", "Lon", "lon", "LON"],
    callSignKeys: ["CALL_SIGN", "call_sign", "Call_Sign"],
    stateKeys: ["STATE", "State", "state"],
  });
}

function pushStation(
  out: ImdStationMapFile["stations"],
  seen: Set<string>,
  row: Record<string, unknown>,
  keys: {
    idKeys: string[];
    nameKeys: string[];
    latKeys: string[];
    lonKeys: string[];
    callSignKeys?: string[];
    stateKeys?: string[];
  },
): void {
  const id = pickString(row, keys.idKeys);
  const lat = pickNumber(row, keys.latKeys);
  const lon = pickNumber(row, keys.lonKeys);
  if (!id || lat == null || lon == null) {
    return;
  }
  const dedupe = `${id}:${lat}:${lon}`;
  if (seen.has(dedupe)) {
    return;
  }
  seen.add(dedupe);
  out.push({
    id,
    name: pickString(row, keys.nameKeys) ?? id,
    lat,
    lon,
    callSign: keys.callSignKeys ? pickString(row, keys.callSignKeys) ?? undefined : undefined,
    state: keys.stateKeys ? pickString(row, keys.stateKeys) ?? undefined : undefined,
  });
}

function pickString(row: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const v = row[key];
    if (v == null) {
      continue;
    }
    const s = String(v).trim();
    if (s.length > 0) {
      return s;
    }
  }
  return null;
}

function pickNumber(row: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const v = row[key];
    if (v == null || v === "") {
      continue;
    }
    const n = Number(v);
    if (Number.isFinite(n)) {
      return n;
    }
  }
  return null;
}

function formatCatalogFailure(
  cityMapping: Awaited<ReturnType<typeof imdFetchJson>>,
  awsMapping: Awaited<ReturnType<typeof imdFetchJson>>,
  cityRows: Record<string, unknown>[],
  awsRows: Record<string, unknown>[],
): string {
  return [
    "No stations parsed from IMD mapping APIs (auth may still be OK).",
    `cityforecast_mapping: HTTP ${cityMapping.status}, rawRows=${cityRows.length}, bodyKeys=${sampleBodyKeys(cityMapping.body).join(",") || "—"}`,
    `  rowKeys=${sampleRowKeys(cityRows).join(",") || "—"}`,
    `aws_data_mapping: HTTP ${awsMapping.status}, rawRows=${awsRows.length}, bodyKeys=${sampleBodyKeys(awsMapping.body).join(",") || "—"}`,
    `  rowKeys=${sampleRowKeys(awsRows).join(",") || "—"}`,
    cityMapping.error ? `city error: ${cityMapping.error}` : "",
    awsMapping.error ? `aws error: ${awsMapping.error}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function sampleBodyKeys(body: unknown): string[] {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return Object.keys(body as object).slice(0, 12);
  }
  return [];
}

function sampleRowKeys(rows: Record<string, unknown>[]): string[] {
  if (rows.length === 0) {
    return [];
  }
  return Object.keys(rows[0]!).slice(0, 12);
}
