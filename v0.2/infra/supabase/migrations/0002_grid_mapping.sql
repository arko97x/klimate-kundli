-- v0.2 / 0002 — grid_cells + place_grid_map.
--
-- A grid cell is the indivisible spatial unit at which we store reanalysis
-- data (e.g. ERA5 0.25°, ERA5-Land 0.1°). Many places resolve to the same
-- cell, so we store cell rows once and link each place to its nearest cell
-- per source. This avoids duplicating daily weather rows per town.

CREATE TABLE IF NOT EXISTS grid_cells (
  id              BIGSERIAL PRIMARY KEY,
  source          TEXT        NOT NULL,         -- 'era5' | 'era5land' | 'imd_rain' | etc.
  resolution_deg  REAL        NOT NULL,         -- 0.25 for ERA5, 0.1 for ERA5-Land, etc.
  lat             DOUBLE PRECISION NOT NULL,    -- cell-centre latitude
  lon             DOUBLE PRECISION NOT NULL,    -- cell-centre longitude
  geom            GEOGRAPHY(POINT, 4326)
                  GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography) STORED,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source, lat, lon)
);

CREATE INDEX IF NOT EXISTS grid_cells_source_idx ON grid_cells (source);
CREATE INDEX IF NOT EXISTS grid_cells_geom_idx   ON grid_cells USING GIST (geom);

-- Map a place to its nearest grid cell per source. Distance is in metres
-- (haversine via PostGIS geography). source_priority lets us pick the
-- preferred source per place (e.g. IMD over ERA5-Land for India rain).
CREATE TABLE IF NOT EXISTS place_grid_map (
  id              BIGSERIAL PRIMARY KEY,
  place_id        BIGINT NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  grid_cell_id    BIGINT NOT NULL REFERENCES grid_cells(id) ON DELETE CASCADE,
  distance_m      DOUBLE PRECISION NOT NULL,
  source          TEXT NOT NULL,                -- denormalised from grid_cells.source for fast filtering
  source_priority INTEGER NOT NULL DEFAULT 100, -- lower number = higher priority
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (place_id, source)
);

CREATE INDEX IF NOT EXISTS place_grid_map_place_idx ON place_grid_map (place_id);
CREATE INDEX IF NOT EXISTS place_grid_map_source_idx ON place_grid_map (source);
