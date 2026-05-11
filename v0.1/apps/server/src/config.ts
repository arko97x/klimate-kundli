import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
export const DATA_DIR = path.join(REPO_ROOT, "data");
export const DB_PATH = path.join(DATA_DIR, "cache.db");

export const SERVER_PORT = Number(process.env.PORT ?? 3001);
export const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://localhost:5173";

export const HISTORICAL_API = "https://archive-api.open-meteo.com/v1/archive";
export const CLIMATE_API = "https://climate-api.open-meteo.com/v1/climate";
export const GEOCODE_API = "https://geocoding-api.open-meteo.com/v1/search";

// CMIP6 models for Open-Meteo Climate API. Different hi-res models have
// different spatial coverage holes (e.g. EC_Earth3P_HR was null at Kolkata,
// MRI_AGCM3_2_S was null at São Paulo). We pass several and merge per-day:
// for each date, take the first non-null value across the model list.
//
// Order = priority (best resolution first; fallbacks broaden coverage).
export const CLIMATE_MODELS: string[] = [
  "MRI_AGCM3_2_S",
  "EC_Earth3P_HR",
  "CMCC_CM2_VHR4",
  "FGOALS_f3_H",
  "MPI_ESM1_2_XR",
];

// Lat/lon rounded to 4 decimals (~11m) so cache keys collapse for the same city
// even if geocoder returns slight variations.
export const COORD_PRECISION = 4;

// Historical range to prefetch. ERA5 starts 1940; some pre-1950 gaps.
export const HIST_START = "1940-01-01";

// Climate API range — Open-Meteo Climate covers 1950-2050.
export const CLIMATE_START = "2020-01-01";
export const CLIMATE_END = "2050-12-31";
