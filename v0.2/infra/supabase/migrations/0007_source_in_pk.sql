-- v0.2 / 0007 — source in PK on daily_weather + every aggregate table.
--
-- Phase 6 introduces a second source per place: IMD Pune gridded rainfall
-- and IMD gridded temperature for Indian places, on top of the existing
-- global ERA5 layer. Both should coexist so the kundli can prefer IMD for
-- India while keeping ERA5 elsewhere, and so we keep an audit trail of
-- where any single number came from.
--
-- Old PKs (`place_id, date` / `place_id, year` / etc.) silently overwrote
-- one source with another. Relax them by appending `source` to the PK.
--
-- Existing ERA5 rows are untouched because `source` is already populated
-- and NOT NULL on every aggregate table.

-- ---------------------------------------------------------------------------
-- daily_weather
-- ---------------------------------------------------------------------------

ALTER TABLE daily_weather DROP CONSTRAINT IF EXISTS daily_weather_pkey;
ALTER TABLE daily_weather
  ADD CONSTRAINT daily_weather_pkey PRIMARY KEY (place_id, date, source);

-- ---------------------------------------------------------------------------
-- annual_extremes / annual_rain
-- ---------------------------------------------------------------------------

ALTER TABLE annual_extremes DROP CONSTRAINT IF EXISTS annual_extremes_pkey;
ALTER TABLE annual_extremes
  ADD CONSTRAINT annual_extremes_pkey PRIMARY KEY (place_id, year, source);

ALTER TABLE annual_rain DROP CONSTRAINT IF EXISTS annual_rain_pkey;
ALTER TABLE annual_rain
  ADD CONSTRAINT annual_rain_pkey PRIMARY KEY (place_id, year, source);

-- ---------------------------------------------------------------------------
-- decade_rain
-- ---------------------------------------------------------------------------

ALTER TABLE decade_rain DROP CONSTRAINT IF EXISTS decade_rain_pkey;
ALTER TABLE decade_rain
  ADD CONSTRAINT decade_rain_pkey PRIMARY KEY (place_id, decade_start, source);

-- ---------------------------------------------------------------------------
-- monthly_normals
-- ---------------------------------------------------------------------------

ALTER TABLE monthly_normals DROP CONSTRAINT IF EXISTS monthly_normals_pkey;
ALTER TABLE monthly_normals
  ADD CONSTRAINT monthly_normals_pkey
    PRIMARY KEY (place_id, month, baseline_start, baseline_end, source);

-- ---------------------------------------------------------------------------
-- season_prefix — already includes (place_id, date, season); add source too.
-- ---------------------------------------------------------------------------

ALTER TABLE season_prefix DROP CONSTRAINT IF EXISTS season_prefix_pkey;
ALTER TABLE season_prefix
  ADD CONSTRAINT season_prefix_pkey PRIMARY KEY (place_id, date, season, source);
