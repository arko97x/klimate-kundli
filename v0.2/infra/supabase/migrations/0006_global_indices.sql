-- v0.2 / 0006 — global indices + per-country tables for kundli cells 8, 10, 11, 12.
--
-- These four cells are *not* per-place daily aggregates. They are small,
-- low-churn static-ish datasets that we ship as curated CSVs in
-- `v0.2/data/global/` and load via `klimate-ingest load-global`.
--
--   cell 8  country_emissions  per-country annual + cumulative CO2
--   cell 10 global_indices     indicator='gmsl_mm'   (global mean sea level)
--   cell 11 global_indices     indicator='co2_ppm'   (Mauna Loa annual mean)
--   cell 12 country_projections per-country 2050 deltas (SSP scenarios)
--
-- All three tables follow the same provenance shape as the per-place
-- aggregates: (source, source_version, quality, created_at). Country codes
-- are ISO 3166-1 alpha-2 to match `places.country_code` so the kundli
-- builder can resolve them in one join.

CREATE TABLE IF NOT EXISTS global_indices (
  indicator       TEXT NOT NULL,                  -- 'gmsl_mm' | 'co2_ppm' | ...
  year            INTEGER NOT NULL,
  value           DOUBLE PRECISION,               -- mm for GMSL, ppm for CO2
  source          TEXT NOT NULL,                  -- 'noaa_gml' | 'csiro_nasa' | etc.
  source_version  TEXT,                           -- e.g. release date or vN
  quality         SMALLINT NOT NULL DEFAULT 4,    -- single global series; default high
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (indicator, year)
);

CREATE INDEX IF NOT EXISTS global_indices_year_idx ON global_indices (indicator, year);

CREATE TABLE IF NOT EXISTS country_emissions (
  country_code    TEXT NOT NULL,                  -- ISO 3166-1 alpha-2
  year            INTEGER NOT NULL,
  co2_mt          DOUBLE PRECISION,               -- annual CO2 in Mt
  co2_per_capita  DOUBLE PRECISION,               -- t CO2 / person / year
  source          TEXT NOT NULL,
  source_version  TEXT,
  quality         SMALLINT NOT NULL DEFAULT 3,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (country_code, year)
);

CREATE INDEX IF NOT EXISTS country_emissions_year_idx
  ON country_emissions (country_code, year);

CREATE TABLE IF NOT EXISTS country_projections (
  country_code    TEXT NOT NULL,                  -- ISO 3166-1 alpha-2
  scenario        TEXT NOT NULL,                  -- 'ssp245' | 'ssp585' | ...
  horizon         INTEGER NOT NULL,               -- 2050, 2100, ...
  baseline_start  INTEGER NOT NULL,               -- e.g. 1995
  baseline_end    INTEGER NOT NULL,               -- e.g. 2014
  dt_c            DOUBLE PRECISION,               -- mean temp delta in °C
  dprecip_pct     DOUBLE PRECISION,               -- mean precip change in %
  source          TEXT NOT NULL,                  -- 'ipcc_ar6_atlas' | ...
  source_version  TEXT,
  quality         SMALLINT NOT NULL DEFAULT 3,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (country_code, scenario, horizon)
);
