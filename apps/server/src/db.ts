import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, DB_PATH } from "./config.js";

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(DB_PATH);

// WAL = better concurrency for prefetch + dev server reading at once.
db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");
db.pragma("foreign_keys = ON");

// Schema. All idempotent (IF NOT EXISTS) so loading bundled CSVs / prefetch
// can be re-run safely.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS geocode (
  query        TEXT PRIMARY KEY,           -- lower(city|country) cache key
  display_name TEXT NOT NULL,
  country      TEXT,
  country_code TEXT,                        -- ISO 3166-1 alpha-2
  admin1       TEXT,
  lat          REAL NOT NULL,
  lon          REAL NOT NULL,
  fetched_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ERA5 daily temp + precip. PK collapses cache by rounded coord.
CREATE TABLE IF NOT EXISTS weather_daily (
  lat     REAL NOT NULL,
  lon     REAL NOT NULL,
  date    TEXT NOT NULL,                   -- YYYY-MM-DD
  tmax    REAL,
  tmin    REAL,
  precip  REAL,
  PRIMARY KEY (lat, lon, date)
) WITHOUT ROWID;

-- CMIP6 daily projection from Open-Meteo Climate API.
CREATE TABLE IF NOT EXISTS climate_proj_daily (
  lat     REAL NOT NULL,
  lon     REAL NOT NULL,
  date    TEXT NOT NULL,
  tmax    REAL,
  tmin    REAL,
  PRIMARY KEY (lat, lon, date)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS co2_annual (
  year INTEGER PRIMARY KEY,
  ppm  REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS emissions_annual (
  country     TEXT NOT NULL,
  iso_code    TEXT,
  year        INTEGER NOT NULL,
  co2_mt      REAL,
  co2_per_cap REAL,
  PRIMARY KEY (country, year)
);

CREATE TABLE IF NOT EXISTS sea_level_monthly (
  date     TEXT PRIMARY KEY,               -- YYYY-MM-15 (mid-month convention)
  gmsl_mm  REAL NOT NULL,
  source   TEXT NOT NULL                   -- 'nasa-altimetry' | 'csiro-gauge'
);

CREATE TABLE IF NOT EXISTS prefetch_log (
  city_query TEXT PRIMARY KEY,
  status     TEXT NOT NULL,                -- 'ok' | 'failed'
  error      TEXT,
  rows       INTEGER,
  ran_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

db.exec(SCHEMA);

// Lightweight column migrations for in-place upgrades. better-sqlite3 has no
// IF NOT EXISTS for ALTER TABLE; we probe pragma_table_info instead.
function ensureColumn(table: string, column: string, ddl: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}
ensureColumn("geocode", "country_code", "country_code TEXT");

export function closeDb() {
  db.close();
}

export type WeatherRow = {
  lat: number;
  lon: number;
  date: string;
  tmax: number | null;
  tmin: number | null;
  precip: number | null;
};

export type ClimateRow = {
  lat: number;
  lon: number;
  date: string;
  tmax: number | null;
  tmin: number | null;
};

export function dbPath(): string {
  return path.resolve(DB_PATH);
}
