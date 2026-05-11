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
| 2 | R2 upload + hourly→daily transform + write daily_weather + stamp source_provenance | next |
| 3 | Aggregate builder (annual_extremes, annual_rain, decade_rain, monthly_normals, season_prefix) | pending |
| 4 | Hono serving API on top of aggregates | pending |
| 5 | Web app on shadcn/ui that talks only to v0.2 API | pending |
| 6 | IMD India layer (rainfall grid + station/sub-station) | pending (account in verification) |
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
  - `worker --source --max-jobs --scratch --idle-sleep` — claims jobs, downloads from CDS, writes checksum + bytes to job row.
  - `aggregate` — skeleton only.

## Current data state

User has run end-to-end through phase 1 successfully:

- Supabase has 69 places, 23 aliases, 619 ERA5 grid cells, 69 place→cell mappings.
- 1 CDS job done: ERA5 `2m_temperature`, India bbox, 2020-01 — 21 MB NetCDF in local scratch, SHA-256 stamped.
- 11 jobs still pending for the remaining months of 2020 (India bbox, `2m_temperature`).

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
| CLI | `v0.2/ingest/src/klimate_ingest/cli.py` |

## Accounts and secrets

- Copernicus CDS: free account; ERA5 licences accepted; `~/.cdsapirc` configured.
- Supabase: project provisioned; **Session Pooler** URL in `.env` (Direct connection is IPv6-only and fails on the user's network).
- Cloudflare R2: account ready, payment not set up yet, no bucket created — needed for phase 2.
- IMD: account pending verification — phase 6.

## Known issues / TODOs

- Worker's Ctrl-C path doesn't mark the running job back to pending; the job stays `running` until lease expires (30 min) or we manually reset. Could catch `KeyboardInterrupt` and release the lease.
- `grid-build` always reads from a fresh transaction; for large place lists, switch to a single fetchall and batched insert.
- ERA5-Land licence not yet accepted on CDS — accept when we move to phase 6 land-resolution upgrade.
- `aggregate` subcommand is a skeleton.
- No tests yet. Add a smoke test for `places.read_csv` and a roundtrip test for the queue once we have a sandbox DB.

## How to resume in a new chat

Paste this into the new chat as the first message:

> Continuing the Klimate Kundli v0.2 build. Read `v0.2/docs/STATE.md` first for context. Latest commits are on `main`; phase 1 is done (schema + CDS ingest verified end-to-end with one job); next is phase 2 (R2 upload + hourly→daily transform). Please pick up from there.

That's enough for any new assistant session to read the doc, scan the code, and continue without backtracking.

## Quick verify commands

```bash
# in v0.2/ingest, with venv active
klimate-ingest status --source era5

# in Supabase SQL editor
SELECT count(*) FROM places;
SELECT count(*) FROM place_aliases;
SELECT count(*) FROM grid_cells WHERE source='era5';
SELECT count(*) FROM place_grid_map WHERE source='era5';
SELECT status, count(*) FROM ingest_jobs GROUP BY status;
```
