import { readFileSync } from "node:fs";
import { join } from "node:path";

import { haversineKm } from "../../lib/haversine.js";
import type { City } from "../../types.js";
import type { ImdStationBinding, ImdStationMapFile, ImdStationRecord } from "./types.js";

const DEFAULT_MAX_DISTANCE_KM = 80;

export function loadStationMap(dataDir?: string): ImdStationMapFile {
  const root = dataDir ?? join(process.cwd(), "src", "data");
  const raw = readFileSync(join(root, "imd_station_map.json"), "utf8");
  return JSON.parse(raw) as ImdStationMapFile;
}

/** Nearest IMD station within maxDistanceKm (India homes only). */
export function bindNearestStation(
  city: Pick<City, "lat" | "lon" | "country">,
  map: ImdStationMapFile,
  maxDistanceKm = DEFAULT_MAX_DISTANCE_KM,
): ImdStationBinding | null {
  if (city.country !== "IN") {
    return null;
  }

  let best: { station: ImdStationRecord; distanceKm: number } | null = null;

  for (const station of map.stations) {
    const distanceKm = haversineKm(city, station);
    if (distanceKm > maxDistanceKm) {
      continue;
    }
    if (!best || distanceKm < best.distanceKm) {
      best = { station, distanceKm };
    }
  }

  return best;
}
