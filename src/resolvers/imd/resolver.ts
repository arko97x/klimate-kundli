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
    enabled: hasImdAuthConfigured() && map.stations.length > 0,
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
  if (cityMapping.ok) {
    for (const row of imdDataRows(cityMapping.body)) {
      pushStation(stations, seen, row, "Station_Code", "Station_Name", "Latitude", "Longitude");
    }
  }

  const awsMapping = await imdFetchJson("/api/v1/aws_data_mapping", auth);
  if (awsMapping.ok) {
    for (const row of imdDataRows(awsMapping.body)) {
      pushStation(stations, seen, row, "ID", "STATION", "Latitude", "Longitude", "CALL_SIGN");
    }
  }

  return stations;
}

/** IMD wraps lists in `{ status, data: [...] }`. */
function imdDataRows(body: unknown): Record<string, unknown>[] {
  if (Array.isArray(body)) {
    return body as Record<string, unknown>[];
  }
  if (body && typeof body === "object") {
    const data = (body as { data?: unknown }).data;
    if (Array.isArray(data)) {
      return data as Record<string, unknown>[];
    }
  }
  return [];
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
