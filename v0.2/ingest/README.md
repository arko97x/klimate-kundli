# Klimate Kundli — v0.2 ingest

Python ingest workers. Pulls climate data from CDS (ERA5 / ERA5-Land), IMD, and NOAA GHCN-Daily, transforms it into daily place-level series, and writes:

- raw/processed Parquet → Cloudflare R2
- aggregate serving rows → Supabase Postgres

## Quickstart (planned)

```bash
cd v0.2/ingest
uv venv
uv pip install -e ".[dev]"

# configure secrets first; see ../infra/.env.example
klimate-ingest plan
klimate-ingest worker --source era5
klimate-ingest aggregate --target supabase
```

## Status

Skeleton. Real CLI, source connectors, and aggregate builder land in subsequent passes per the middle-path plan.

## Layout (target)

```
ingest/
  pyproject.toml
  src/klimate_ingest/
    cli.py            # click entrypoints: plan, worker, aggregate, verify
    config.py         # env loading + source priorities
    sources/
      cds_era5.py     # ERA5 / ERA5-Land via cdsapi
      imd.py          # IMD gridded + station ingest
      ghcn.py         # NOAA GHCN-Daily bulk
    transform/
      to_daily.py     # hourly → daily tmax/tmin/precip
      place_map.py    # place → grid cell + nearest station
    aggregate/
      annual.py       # annual extremes + rainfall
      decade.py       # decade comparisons
      prefix.py       # season prefix sums for arbitrary date ranges
    storage/
      r2.py           # Parquet I/O on R2
      supabase.py     # Postgres serving DB writes
    queue/
      jobs.py         # persistent job queue (status, retry, checksum)
```
