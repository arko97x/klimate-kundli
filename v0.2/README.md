# Klimate Kundli — v0.2

Active build. Aggregate-first climate database. Replaces v0.1's live-cache approach with a precomputed serving layer backed by a real climate ingest pipeline.

## Goals

- Cover all likely-visitor places (Indian cities/towns + global top ~1000) without depending on third-party APIs at event time.
- Maintain high data accuracy through a clear source hierarchy and explicit provenance per datapoint.
- Keep ingest separable from serving so source changes don't disturb the running app.

## Architecture (target)

```
                     +-----------------------+
                     |  Cloudflare R2        |
                     |  raw + processed      |
                     |  Parquet archive      |
                     +-----------+-----------+
                                 ^
                                 |
+-------------+    +-------------+--------------+    +---------------+
| CDS / IMD / | -> |  Python ingest workers     | -> | Aggregate     |
| GHCN / etc. |    |  (xarray, cfgrib, pyarrow) |    | builder       |
+-------------+    +----------------------------+    +-------+-------+
                                                             |
                                                             v
                                                  +-----------------------+
                                                  |   Supabase Postgres   |
                                                  |   serving aggregates  |
                                                  +-----------+-----------+
                                                              ^
                                                              |
                                                  +-----------+-----------+
                                                  |   apps/api (Hono)     |
                                                  +-----------+-----------+
                                                              ^
                                                              |
                                                  +-----------+-----------+
                                                  |   apps/web (Vite +    |
                                                  |   React + Tailwind +  |
                                                  |   shadcn/ui)          |
                                                  +-----------------------+
```

## Folder map

```
v0.2/
  apps/
    web/        Vite + React + TS + Tailwind + shadcn/ui (frontend)
    api/        Hono + TS (serving API on top of Supabase)
  ingest/       Python workers (CDS / IMD / GHCN ingestion + aggregate builder)
  data/         Place gazetteer, manifests, place-to-grid mappings
  infra/        Docker compose, Caddy, env templates, deploy notes
  docs/         v0.2-specific documentation
  package.json  npm workspaces (apps/*)
```

## Status

Phase 1 (this pass) — schema + place loader + ingest scaffolding:

- [`data/places/pilot.csv`](data/places/pilot.csv) — hand-curated pilot list (33 Indian + 34 global cities).
- [`infra/supabase/migrations/`](infra/supabase/migrations/) — places, grid mapping, aggregates, provenance, jobs.
- [`ingest/`](ingest/) — Python CLI with `places-load`, `grid-build`, `plan`, `status`, `worker`, `aggregate`.

CDS ERA5 / ERA5-Land downloads work end-to-end through the worker. R2 upload, the hourly-to-daily transform, and the aggregate builder are the next pass.

## Phase plan

1. **Phase 1 (done):** schema + place loader + ingest scaffolding + CDS connector + job queue.
2. **Phase 2:** R2 upload + hourly-to-daily transform + per-place daily series in Parquet.
3. **Phase 3:** aggregate builder (`annual_extremes`, `annual_rain`, `decade_rain`, `monthly_normals`, `season_prefix`).
4. **Phase 4:** serving API (Hono) reads aggregates + place lookup.
5. **Phase 5:** web UI on shadcn/ui that talks only to the v0.2 API.
6. **Phase 6:** IMD India layer (rainfall grid + station/sub-station).
7. **Phase 7:** GHCN station provenance overlay.
8. **Phase 8:** optional 20CRv3 1926–1939 lower-confidence layer.
9. **Phase 9:** event-readiness snapshot + rehearsal.

## Quickstart (Phase 1)

```bash
cd v0.2/ingest
uv venv && uv pip install -e ".[dev]"
cp ../infra/.env.example .env   # fill in SUPABASE_DB_URL, R2_*, CDSAPI_KEY

# apply Supabase schema
for f in ../infra/supabase/migrations/*.sql; do
  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f "$f"
done

# load pilot gazetteer (~67 places)
klimate-ingest places-load

# build a 0.25° ERA5 grid and map every place to its nearest cell
klimate-ingest grid-build --source era5 --region global
```

See [`ingest/README.md`](ingest/README.md) for the full command map and what's wired vs. pending.
