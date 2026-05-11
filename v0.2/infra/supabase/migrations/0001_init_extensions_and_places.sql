-- v0.2 / 0001 — extensions + places + place_aliases.
--
-- Idempotent: safe to re-run. Sets up the gazetteer that everything else
-- (grid mapping, aggregates, jobs) hangs off.

-- PostGIS gives us a spatial index for nearest-cell / nearest-station joins.
CREATE EXTENSION IF NOT EXISTS postgis;
-- citext lets aliases match case-insensitively without bespoke lower() indexes.
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS places (
  id            BIGSERIAL PRIMARY KEY,
  slug          TEXT        NOT NULL UNIQUE,
  name          TEXT        NOT NULL,
  country_code  TEXT        NOT NULL,         -- ISO 3166-1 alpha-2
  country       TEXT        NOT NULL,
  admin1        TEXT,
  lat           DOUBLE PRECISION NOT NULL,
  lon           DOUBLE PRECISION NOT NULL,
  population    BIGINT,
  tier          INTEGER     NOT NULL DEFAULT 1,
  geom          GEOGRAPHY(POINT, 4326)
                GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography) STORED,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS places_country_code_idx ON places (country_code);
CREATE INDEX IF NOT EXISTS places_tier_idx         ON places (tier);
CREATE INDEX IF NOT EXISTS places_geom_idx         ON places USING GIST (geom);

-- One row per (place, alias) pair. citext makes lookups case-insensitive.
CREATE TABLE IF NOT EXISTS place_aliases (
  id        BIGSERIAL PRIMARY KEY,
  place_id  BIGINT NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  alias     CITEXT NOT NULL,
  source    TEXT,                              -- 'manual' | 'geonames' | 'imd' | etc.
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (place_id, alias)
);

CREATE INDEX IF NOT EXISTS place_aliases_alias_idx ON place_aliases (alias);
