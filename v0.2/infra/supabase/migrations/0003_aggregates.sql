-- v0.2 / 0003 — kundli-needed aggregates.
--
-- These are the actual rows the serving API reads at request time. They are
-- computed once per ingest pass from raw daily Parquet in R2 and upserted
-- here. Keep them small enough that the entire serving DB can fit in
-- Supabase's free tier for the pilot.
--
-- Every aggregate carries (source, source_version, quality, valid_days) so
-- the UI can label uncertainty and the operator can audit data lineage.

-- Optional daily slice. We only populate this for the dates each cell
-- actually needs (e.g. exact birthdays, latest birthday). Avoids storing
-- a daily row for every place × date for the full historical window.
CREATE TABLE IF NOT EXISTS daily_weather (
  place_id        BIGINT NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  date            DATE   NOT NULL,
  tmax_c          REAL,
  tmin_c          REAL,
  precip_mm       REAL,
  source          TEXT   NOT NULL,
  source_version  TEXT,
  quality         SMALLINT NOT NULL DEFAULT 3,   -- 1 (worst) .. 5 (best)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (place_id, date)
);

CREATE INDEX IF NOT EXISTS daily_weather_date_idx ON daily_weather (date);

-- Annual extremes — powers cells 2 and 3 (birth-year hi/lo).
CREATE TABLE IF NOT EXISTS annual_extremes (
  place_id        BIGINT NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  year            INTEGER NOT NULL,
  max_temp_c      REAL,
  max_temp_date   DATE,
  min_temp_c      REAL,
  min_temp_date   DATE,
  valid_days      INTEGER NOT NULL,              -- number of days with non-null tmax+tmin
  source          TEXT NOT NULL,
  source_version  TEXT,
  quality         SMALLINT NOT NULL DEFAULT 3,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (place_id, year)
);

-- Annual rainfall — powers cell 9 (lifetime rainfall change).
CREATE TABLE IF NOT EXISTS annual_rain (
  place_id        BIGINT NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  year            INTEGER NOT NULL,
  rain_mm         REAL,
  valid_days      INTEGER NOT NULL,
  source          TEXT NOT NULL,
  source_version  TEXT,
  quality         SMALLINT NOT NULL DEFAULT 3,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (place_id, year)
);

-- Decade rainfall summaries. Pre-rolled so the UI doesn't have to. We keep
-- both birth-decade and latest-decade ready.
CREATE TABLE IF NOT EXISTS decade_rain (
  place_id            BIGINT NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  decade_start        INTEGER NOT NULL,           -- e.g. 1990 covers 1990-1999
  avg_annual_rain_mm  REAL,
  years_used          INTEGER NOT NULL,           -- years contributing (after valid-day filter)
  source              TEXT NOT NULL,
  source_version      TEXT,
  quality             SMALLINT NOT NULL DEFAULT 3,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (place_id, decade_start)
);

-- Monthly normals, used for fallback latest-birthday cells when exact-day
-- data isn't yet published (ERA5 lag).
CREATE TABLE IF NOT EXISTS monthly_normals (
  place_id        BIGINT NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  month           SMALLINT NOT NULL,             -- 1..12
  tmax_avg_c      REAL,
  tmin_avg_c      REAL,
  rain_avg_mm     REAL,
  baseline_start  INTEGER NOT NULL,              -- e.g. 1991
  baseline_end    INTEGER NOT NULL,              -- e.g. 2020 (WMO 30-yr normal)
  source          TEXT NOT NULL,
  source_version  TEXT,
  quality         SMALLINT NOT NULL DEFAULT 3,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (place_id, month, baseline_start, baseline_end)
);

-- Per-place per-date prefix sums. Powers cells 6/7 (cross-city seasonal
-- ranges) over arbitrary lived-in stay windows in O(1) lookups.
--   range_avg = (cumulative_at_end - cumulative_at_start_minus_one) / count_diff
-- Season tag: 'summer' (Apr–Sep) and 'winter' (Oct–Mar) for the PoC's
-- Indian-context definition; refine per hemisphere later.
CREATE TABLE IF NOT EXISTS season_prefix (
  place_id        BIGINT NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  date            DATE   NOT NULL,
  season          TEXT   NOT NULL CHECK (season IN ('summer','winter')),
  tmax_cum        DOUBLE PRECISION NOT NULL,
  tmin_cum        DOUBLE PRECISION NOT NULL,
  count_cum       INTEGER NOT NULL,
  source          TEXT NOT NULL,
  PRIMARY KEY (place_id, date, season)
);

CREATE INDEX IF NOT EXISTS season_prefix_lookup_idx
  ON season_prefix (place_id, season, date);
