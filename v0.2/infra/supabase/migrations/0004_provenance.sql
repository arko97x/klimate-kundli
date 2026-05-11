-- v0.2 / 0004 — provenance ledger.
--
-- Aggregate rows already carry (source, source_version, quality). This
-- table records the actual fetch event so a row can always be traced back
-- to a job, a checksum, and a license.

CREATE TABLE IF NOT EXISTS source_provenance (
  id              BIGSERIAL PRIMARY KEY,
  source          TEXT NOT NULL,                  -- 'era5' | 'era5land' | 'imd_rain' | 'ghcn' | etc.
  source_version  TEXT,                           -- dataset version string from upstream
  variable        TEXT NOT NULL,                  -- '2m_temperature' | 'total_precipitation' | etc.
  date_start      DATE NOT NULL,
  date_end        DATE NOT NULL,
  area_bbox       JSONB,                          -- { n, s, e, w } in degrees
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  license         TEXT,                           -- short license tag
  citation        TEXT,                           -- recommended citation string
  storage_uri     TEXT,                           -- e.g. 's3://klimate-archive/era5/2m_temperature/2024/...'
  bytes           BIGINT,
  checksum        TEXT,                           -- e.g. sha256 of the source file
  notes           TEXT
);

CREATE INDEX IF NOT EXISTS source_provenance_source_idx ON source_provenance (source, variable, date_start);
