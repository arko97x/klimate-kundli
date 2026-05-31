import type { Cache } from "../../cache/store.js";
import { loadEnvFile } from "../../lib/load-env-file.js";
import type { City } from "../../types.js";
import { imdFetchJson, loadImdCredentials } from "./client.js";
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
  const creds = loadImdCredentials();
  const apiKey = options.apiKey ?? creds.apiKey ?? "";
  const jwt = creds.jwt;
  const map = options.stationMap ?? loadStationMap();
  const cache = options.cache;

  return {
    enabled: (apiKey.length > 0 || (jwt?.length ?? 0) > 0) && map.stations.length > 0,
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
  creds: Parameters<typeof imdFetchJson>[1],
): Promise<ImdStationMapFile["stations"]> {
  const stations: ImdStationMapFile["stations"] = [];
  const seen = new Set<string>();

  const cityMapping = await imdFetchJson("/api/v1/cityforecast_mapping", creds);
  if (cityMapping.ok && Array.isArray(cityMapping.body)) {
    for (const row of cityMapping.body as Record<string, unknown>[]) {
      pushStation(stations, seen, row, "Station_Code", "Station_Name", "Latitude", "Longitude");
    }
  }

  const awsMapping = await imdFetchJson("/api/v1/aws_data_mapping", creds);
  if (awsMapping.ok && Array.isArray(awsMapping.body)) {
    for (const row of awsMapping.body as Record<string, unknown>[]) {
      pushStation(stations, seen, row, "ID", "STATION", "Latitude", "Longitude", "CALL_SIGN");
    }
  }

  return stations;
}

function pushStation(
  out: ImdStationMapFile["stations"],
  seen: Set<string>,
  row: Record<string, unknown>,
  idKey: string,
  nameKey: string,
  latKey: string,
  lonKey: string,
  callSignKey?: string,
): void {
  const id = stringField(row, idKey);
  const lat = numberField(row, latKey);
  const lon = numberField(row, lonKey);
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
    name: stringField(row, nameKey) ?? id,
    lat,
    lon,
    callSign: callSignKey ? stringField(row, callSignKey) ?? undefined : undefined,
    state: stringField(row, "STATE") ?? undefined,
  });
}

function stringField(row: Record<string, unknown>, key: string): string | null {
  const v = row[key];
  if (v == null) {
    return null;
  }
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

function numberField(row: Record<string, unknown>, key: string): number | null {
  const v = row[key];
  if (v == null || v === "") {
    return null;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
