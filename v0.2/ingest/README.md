# Klimate Kundli — v0.2 ingest

Python ingest workers. Pulls climate data from CDS (ERA5 / ERA5-Land), IMD, and NOAA GHCN-Daily, transforms it into daily place-level series, and writes:

- raw/processed Parquet → Cloudflare R2 (planned)
- aggregate serving rows → Supabase Postgres

## Status

Phase 1 — scaffolding + place loader + CDS connector + job queue land here. Phase 2 will wire in R2 upload, the hourly→daily transform, and the aggregate builder.

## Quickstart

```bash
cd v0.2/ingest

# 1. install (uv recommended)
uv venv
uv pip install -e ".[dev]"

# 2. configure secrets
cp ../infra/.env.example .env
# fill in: SUPABASE_DB_URL, R2_*, CDSAPI_KEY

# 3. apply Supabase migrations (one-time)
for f in ../infra/supabase/migrations/*.sql; do
  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f "$f"
done

# 4. load the pilot place gazetteer
klimate-ingest places-load

# 5. build a grid for a source and map every place to it
klimate-ingest grid-build --source era5 --region global

# 6. enqueue jobs for the pilot coverage window (default 1990-2024)
klimate-ingest plan --source era5 --region global

# 7. check queue status
klimate-ingest status --source era5

# 8. run a worker (loops; Ctrl-C to stop)
klimate-ingest worker --source era5
```

## What's wired right now

| Command | Reads / writes | Implemented |
|---|---|---|
| `places-load` | reads CSV → upserts `places`, `place_aliases` | yes |
| `grid-build`  | populates `grid_cells`, fills `place_grid_map` for one source | yes |
| `plan`        | enqueues `ingest_jobs` per (source, variable, year, month) | yes |
| `status`      | aggregates `ingest_jobs` counts by status | yes |
| `worker`      | claims jobs, downloads ERA5 NetCDF, marks done | partial (download works; R2 upload + daily transform = phase 2) |
| `aggregate`   | builds annual / decade / season-prefix tables | skeleton |

## Layout

```
ingest/
  pyproject.toml
  src/klimate_ingest/
    cli.py                # click entrypoints (places-load, grid-build, plan, status, worker, aggregate)
    config.py             # env loading, source priorities, pilot ranges
    logging.py            # structlog setup
    db.py                 # Supabase psycopg connection
    places.py             # CSV reader + upsert (places + aliases)
    queue/
      jobs.py             # ingest_jobs CRUD: enqueue, claim, mark_done/failed, status
    sources/
      base.py             # Source protocol
      cds_era5.py         # ERA5 / ERA5-Land via cdsapi
    transform/
      place_map.py        # populate grid_cells, map_places_to_grid via PostGIS
```
