-- v0.2 / 0005 — ingest_jobs queue.
--
-- Persistent job state for the ingest workers. Workers claim a pending row,
-- mark it 'running', and update on completion/failure. Resumable by design:
-- a crashed worker leaves rows in 'running' past their lease timeout and the
-- next worker can re-claim them.

CREATE TABLE IF NOT EXISTS ingest_jobs (
  id              BIGSERIAL PRIMARY KEY,
  source          TEXT NOT NULL,                  -- 'era5' | 'era5land' | 'imd_rain' | etc.
  variable        TEXT NOT NULL,                  -- e.g. '2m_temperature'
  year            INTEGER NOT NULL,               -- one job per source/variable/year/area for cleanly chunked retries
  month           SMALLINT,                       -- nullable; some sources are pulled per year
  area_bbox       JSONB NOT NULL,                 -- { n, s, e, w }
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','running','done','failed','skipped')),
  attempts        INTEGER NOT NULL DEFAULT 0,
  max_attempts    INTEGER NOT NULL DEFAULT 5,
  retry_at        TIMESTAMPTZ,
  lease_until     TIMESTAMPTZ,                    -- a 'running' row past lease_until is reclaimable
  worker_id       TEXT,
  rows_written    BIGINT,
  bytes           BIGINT,
  checksum        TEXT,
  storage_uri     TEXT,
  error           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source, variable, year, month)
);

CREATE INDEX IF NOT EXISTS ingest_jobs_status_idx     ON ingest_jobs (status);
CREATE INDEX IF NOT EXISTS ingest_jobs_retry_idx      ON ingest_jobs (status, retry_at);
CREATE INDEX IF NOT EXISTS ingest_jobs_source_idx     ON ingest_jobs (source, status);

-- Trigger to keep updated_at fresh on every UPDATE.
CREATE OR REPLACE FUNCTION ingest_jobs_touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ingest_jobs_touch ON ingest_jobs;
CREATE TRIGGER ingest_jobs_touch
  BEFORE UPDATE ON ingest_jobs
  FOR EACH ROW EXECUTE FUNCTION ingest_jobs_touch_updated_at();
