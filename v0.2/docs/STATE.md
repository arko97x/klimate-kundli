# v0.2 — current state

A single source of truth for the project's data layer so any new chat (or teammate) can resume without losing context. Update at the end of every significant session.

## Project at a glance

Klimate Kundli is an exhibition piece. Visitors enter birth date, birth city, and lived-in cities; the system returns a 12-cell climate "kundli". v0.1 was a localhost PoC backed by live Open-Meteo + NASA POWER API calls. v0.2 replaces that with a precomputed aggregate database so the event app never talks to upstream APIs.

- Repo root has `v0.1/` (frozen, tagged `v0.1.0`) and `v0.2/` (active).
- Routing: `/` → v0.2 (latest), `/0.2/*` → 301 → `/`, `/0.1/*` → frozen v0.1.

## Architecture target

```
CDS / IMD / GHCN  →  Python ingest workers  →  Cloudflare R2 (raw + Parquet)
                                            →  Supabase Postgres (places, mapping, aggregates, jobs)
                                            ↑
                                        Hono API
                                            ↑
                                        Vite + React + Tailwind + shadcn/ui (web)
```

## Phases

| # | Phase | Status |
|---|---|---|
| 1 | Schema + place loader + CDS connector + queue + worker download | done |
| 2 | R2 upload + hourly→daily transform + write daily_weather + stamp source_provenance | done, verified end-to-end on 2020 India temp + Jan precip |
| 3 | Aggregate builder (annual_extremes, annual_rain, decade_rain, monthly_normals, season_prefix) | done, verified on India 2020 |
| 4 | Hono serving API on top of aggregates | done (10 endpoints + bundled `/api/kundli`) |
| 4.5 | Global indices ingest (emissions, sea level, CO2 ppm, 2050 projection) | pending — fills cells 8/10/11/12 |
| 5 | Web app on shadcn/ui that talks only to v0.2 API | pending |
| 6 | IMD India layer (rainfall grid + station/sub-station) | pending — IMD approval received |
| 7 | NOAA GHCN-Daily station overlay | pending |
| 8 | Optional 20CRv3 1926–1939 lower-confidence layer | pending |
| 9 | Event-readiness snapshot + rehearsal | pending |

## What's done in this repo right now

- `v0.2/data/places/pilot.csv` — 69 pilot cities (33 IN + 34 global, plus a few extras). Aliases load automatically with diacritic-stripped variants.
- `v0.2/infra/supabase/migrations/` — 5 migrations applied on the user's Supabase project. PostGIS + citext enabled. 12 project tables + PostGIS system tables.
- `v0.2/ingest/` — Python CLI with subcommands:
  - `places-load` — CSV → Supabase. Uses upsert on `slug`.
  - `grid-build --source era5|era5land [--window 1]` — place-aware sparse grid; populates `grid_cells` and `place_grid_map`.
  - `plan --source --region --year-start --year-end --variables` — enqueues monthly jobs into `ingest_jobs`.
  - `status --source` — counts by status.
  - `r2-init` — verifies R2 creds and creates the archive bucket if missing.
  - `worker --source --max-jobs --scratch --idle-sleep [--no-upload]` — claims jobs, fetches from CDS, uploads raw NetCDF + daily Parquet to R2, upserts `daily_weather`, stamps `source_provenance`, marks job done.
  - `transform --source --cds-variable --year --month --file <nc>` — phase-2 backfill for a local NetCDF. Looks up `area_bbox` from the matching `ingest_jobs` row.
  - `requeue --id <id> | --status done|failed|running [--source ...]` — resets jobs to pending so the worker can re-run them.
  - `aggregate --source <s> --what all|annual_extremes|annual_rain|decade_rain|monthly_normals|season_prefix [--baseline-start --baseline-end]` — set-based SQL upserts into the five serving tables. `monthly_normals` auto-detects a baseline window when daily_weather doesn't cover 1991–2020; `decade_rain` requires ≥3 years per decade and silently produces 0 rows on a single-year build.

## Current data state

Phases 2–3 verified on India 2020; phase 4 first slice live.

- Supabase has 69 places, 23 aliases, 619 ERA5 grid cells, 69 place→cell mappings.
- 24 ERA5 jobs done for India 2020 (12 × `2m_temperature` + 12 × `total_precipitation`).
- `daily_weather` 13,542 rows = 37 India places × 366 days, every row carrying tmax/tmin + precip.
- `annual_extremes` 37, `annual_rain` 37, `monthly_normals` 444 (baseline = (2020, 2020)), `season_prefix` 13,542, `decade_rain` 0 (will fill once ≥3 years are loaded).
- 24 rows in `source_provenance` mapping each chunk back to its R2 URI + checksum.
- R2 bucket `klimate-archive` has matching `raw/era5/.../...nc` and `daily/era5/.../...parquet` objects.
- Hono API live on `http://localhost:3002`. Endpoints:
  - `GET /api/health`
  - `GET /api/places?q=&limit=`
  - `GET /api/places/:slug`
  - `GET /api/places/:slug/annual?year=&source=`
  - `GET /api/places/:slug/monthly?baseline_start=&baseline_end=&source=`
  - `GET /api/places/:slug/daily?date=&source=`
  - `GET /api/places/:slug/decade?start=&source=`
  - `GET /api/places/:slug/seasonal-range?season=&start=&end=&source=`
  - `GET /api/kundli?birth_slug=&birth_date=&lived=slug:start:end,...` (and POST with a JSON body)
- `/api/kundli` returns a fixed 12-cell array. Cells 1, 2, 3, 4, 5, 6, 7, 9 are answered from Supabase; cells 8 (country emissions), 10 (sea level), 11 (CO₂ ppm), 12 (2050 projection) return `status: "pending_dataset"` until phase 4.5 lands. Cell 4/5 (latest birthday extremes) falls back to `monthly_normals` when the exact day isn't in `daily_weather`.

**Next session, first action:** scaffold phase 5 web app — Vite + React + TS + Tailwind + shadcn/ui, single form (birth date, birth place autocomplete via `/api/places`, lived-in stay rows), POST to `/api/kundli`, render 12-cell grid with skeleton states for `pending_dataset`. After that, phase 4.5 (global indices ingest) to fill the four pending cells.

## Where things live

| Concern | File |
|---|---|
| Pilot place list | `v0.2/data/places/pilot.csv` |
| Schema | `v0.2/infra/supabase/migrations/*.sql` |
| Env template | `v0.2/infra/.env.example` |
| User env (gitignored) | `v0.2/ingest/.env` |
| Source priority + pilot range | `v0.2/ingest/src/klimate_ingest/config.py` |
| Postgres helper | `v0.2/ingest/src/klimate_ingest/db.py` |
| Place loader | `v0.2/ingest/src/klimate_ingest/places.py` |
| Job queue | `v0.2/ingest/src/klimate_ingest/queue/jobs.py` |
| CDS source | `v0.2/ingest/src/klimate_ingest/sources/cds_era5.py` |
| Grid mapping | `v0.2/ingest/src/klimate_ingest/transform/place_map.py` |
| R2 client | `v0.2/ingest/src/klimate_ingest/storage/r2.py` |
| Hourly→daily transform | `v0.2/ingest/src/klimate_ingest/transform/daily.py` |
| daily_weather + provenance upsert | `v0.2/ingest/src/klimate_ingest/transform/upsert.py` |
| Phase-2 chunk pipeline | `v0.2/ingest/src/klimate_ingest/pipeline.py` |
| Phase-3 aggregate builders | `v0.2/ingest/src/klimate_ingest/aggregate/builder.py` |
| CLI | `v0.2/ingest/src/klimate_ingest/cli.py` |
| API entrypoint | `v0.2/apps/api/src/index.ts` |
| API env loader (walks to ingest/.env) | `v0.2/apps/api/src/env.ts` |
| API DB client (postgres-js, session pooler) | `v0.2/apps/api/src/db.ts` |
| API places routes (search + resolve) | `v0.2/apps/api/src/routes/places.ts` |
| API annual route | `v0.2/apps/api/src/routes/annual.ts` |
| API timeseries routes (monthly, daily, decade, seasonal-range) | `v0.2/apps/api/src/routes/timeseries.ts` |
| API /api/kundli route (GET + POST) | `v0.2/apps/api/src/routes/kundli.ts` |
| Kundli 12-cell builder | `v0.2/apps/api/src/kundli/build.ts` |
| Kundli wire types | `v0.2/apps/api/src/kundli/types.ts` |

## Accounts and secrets

- Copernicus CDS: free account; ERA5 licences accepted; `~/.cdsapirc` configured.
- Supabase: project provisioned; **Session Pooler** URL in `.env` (Direct connection is IPv6-only and fails on the user's network).
- Cloudflare R2: account credentials live in `v0.2/ingest/.env`. Bucket `klimate-archive` is created via `klimate-ingest r2-init` on first run. If payment/billing isn't yet enabled on the account, `r2-init` will fail with a clear ClientError — enable R2 in the Cloudflare dashboard, then re-run.
- IMD: account pending verification — phase 6.

## Known issues / TODOs

- Worker's Ctrl-C path now marks the in-flight job failed with `retry_in_seconds=0` so it's immediately re-claimable. Lease-expiry fallback still applies if the worker dies hard.
- `grid-build` always reads from a fresh transaction; for large place lists, switch to a single fetchall and batched insert.
- ERA5-Land licence not yet accepted on CDS — accept when we move to phase 6 land-resolution upgrade.
- Precip daily totals are summed over UTC hours 00..23, which is offset one hour vs. midnight-to-midnight (ERA5 hourly TP is accumulated in the (t−1, t] window). Acceptable for the kundli's daily aggregates; document at the API edge.
- `daily_weather.source_version` is currently NULL for ERA5; ECMWF doesn't publish a stable version string per chunk. Revisit when adding NOAA GHCN / IMD where versions matter.
- `aggregate` subcommand is a skeleton.
- No tests yet. Add a smoke test for `places.read_csv`, a roundtrip test for the queue, and a fixture-based test for `transform.daily.netcdf_to_daily` once we have a sandbox DB.

## How to resume in a new chat

Paste this into the new chat as the first message:

> Continuing the Klimate Kundli v0.2 build. Read `v0.2/docs/STATE.md` first for context. Phases 1–4 are done. The serving API exposes 10 endpoints including `GET/POST /api/kundli`, which bundles all 12 cells (8 backed by real data, 4 returning `status: "pending_dataset"`). Run with `npm --workspace apps/api run dev`. Next: scaffold phase 5 web app (Vite + React + Tailwind + shadcn/ui, single form, 12-cell grid). After that, phase 4.5 (global indices: emissions, sea level, CO₂ ppm, 2050 projection) to clear the four pending cells.

That's enough for any new assistant session to read the doc, scan the code, and continue without backtracking.

## Quick verify commands

```bash
# in v0.2/ingest, with venv active
klimate-ingest status --source era5
klimate-ingest r2-init                                   # phase 2 prereq
klimate-ingest requeue --id <stale_done_job_id>          # if needed
klimate-ingest worker --source era5 --max-jobs 1         # process one chunk end-to-end
klimate-ingest aggregate --source era5 --what all        # phase 3 rollups

# phase 4: API
cd v0.2 && npm --workspace apps/api run dev               # http://localhost:3002
curl http://localhost:3002/api/health
curl 'http://localhost:3002/api/places?q=mumbai'
curl http://localhost:3002/api/places/mumbai-in
curl 'http://localhost:3002/api/places/delhi-in/annual?year=2020'
curl 'http://localhost:3002/api/places/mumbai-in/monthly'
curl 'http://localhost:3002/api/places/delhi-in/daily?date=2020-05-26'
curl 'http://localhost:3002/api/places/mumbai-in/seasonal-range?season=summer&start=2020-04-01&end=2020-09-30'
curl 'http://localhost:3002/api/kundli?birth_slug=delhi-in&birth_date=1990-06-15&lived=mumbai-in:2014-06-01:2020-05-31,bengaluru-in:2020-06-01:today'
```

```sql
-- in Supabase SQL editor
SELECT count(*) FROM places;
SELECT count(*) FROM place_aliases;
SELECT count(*) FROM grid_cells     WHERE source='era5';
SELECT count(*) FROM place_grid_map WHERE source='era5';
SELECT status, count(*) FROM ingest_jobs GROUP BY status;

-- phase 2 sanity:
SELECT count(*), min(date), max(date) FROM daily_weather;
SELECT count(*) FROM daily_weather WHERE tmax_c IS NOT NULL;
SELECT count(*) FROM daily_weather WHERE precip_mm IS NOT NULL;
SELECT id, source, variable, date_start, date_end, storage_uri, bytes
  FROM source_provenance ORDER BY id DESC LIMIT 5;

-- phase 3 sanity (after `aggregate --what all`):
SELECT count(*) FROM annual_extremes;          -- 37 (India places with full 2020)
SELECT count(*) FROM annual_rain;              -- 37 (assuming full-year precip)
SELECT count(*) FROM decade_rain;              -- 0 until 3+ years are loaded
SELECT count(*) FROM monthly_normals;          -- 37 * 12 = 444 (degenerate baseline = (2020, 2020))
SELECT count(*) FROM season_prefix;            -- ~13.5k (one row per place per day)

SELECT p.slug, ae.max_temp_c, ae.max_temp_date, ae.min_temp_c, ae.min_temp_date, ae.valid_days
  FROM annual_extremes ae JOIN places p ON p.id=ae.place_id
 WHERE ae.year = 2020
 ORDER BY ae.max_temp_c DESC LIMIT 10;

SELECT p.slug, ar.rain_mm, ar.valid_days
  FROM annual_rain ar JOIN places p ON p.id=ar.place_id
 WHERE ar.year = 2020
 ORDER BY ar.rain_mm DESC LIMIT 10;
```
