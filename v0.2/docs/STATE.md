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
| 4.5 | Global indices ingest (emissions, sea level, CO2 ppm, 2050 projection) | done — cells 8/10/11/12 are `ok` for all pilot countries |
| 5 | Web app on shadcn/ui that talks only to v0.2 API | done — Vite + React + Tailwind + shadcn, parchment-ink almanac theme, 3×4 grid with skeletons on pending cells |
| 6a | IMD India gridded layer (rainfall 0.25° 1901–2024, temp 1° 1951–2024) | done — IMD now wins over ERA5 for Indian places; all 12 cells `ok` for canonical Delhi-1990 |
| 6b | IMD station / sub-station observations | pending — blocked on IMD API key (user to provide); design notes in `imd_grid.py` |
| 7 | NOAA GHCN-Daily station overlay | pending |
| 8 | Optional 20CRv3 1926–1939 lower-confidence layer | pending |
| 9 | Event-readiness snapshot + rehearsal | pending |

## What's done in this repo right now

- `v0.2/data/places/pilot.csv` — 69 pilot cities (33 IN + 34 global, plus a few extras). Aliases load automatically with diacritic-stripped variants.
- `v0.2/infra/supabase/migrations/` — 7 migrations applied on the user's Supabase project. PostGIS + citext enabled. 15 project tables + PostGIS system tables. **Migration 0007** widens the PK of `daily_weather` + every aggregate (`annual_extremes`, `annual_rain`, `decade_rain`, `monthly_normals`, `season_prefix`) to include `source`, so IMD and ERA5 rows coexist for the same (place, date/year/decade).
- `v0.2/ingest/` — Python CLI with subcommands:
  - `places-load` — CSV → Supabase. Uses upsert on `slug`.
  - `grid-build --source era5|era5land [--window 1]` — place-aware sparse grid; populates `grid_cells` and `place_grid_map`.
  - `grid-build-imd --source imd_rain|imd_temp|both` — enumerates IMD's native grid (rain 0.25° 129×135, temp 1° 31×31) and maps every Indian place to its nearest IMD cell via PostGIS. Country-filtered so non-Indian places don't snap to IMD edge cells.
  - `plan --source --region --year-start --year-end --variables` — enqueues monthly jobs into `ingest_jobs`.
  - `status --source` — counts by status.
  - `r2-init` — verifies R2 creds and creates the archive bucket if missing.
  - `worker --source --max-jobs --scratch --idle-sleep [--no-upload]` — claims jobs, fetches from CDS, uploads raw NetCDF + daily Parquet to R2, upserts `daily_weather`, stamps `source_provenance`, marks job done.
  - `transform --source --cds-variable --year --month --file <nc>` — phase-2 backfill for a local NetCDF. Looks up `area_bbox` from the matching `ingest_jobs` row.
  - `imd-ingest --variable rain|tmax|tmin|all --year-start --year-end [--cache-dir] [--no-upload]` — phase 6a. Pulls IMD `.grd` archives via `imdlib`, transforms each year's xarray cube into a tidy daily DataFrame, upserts into `daily_weather` (rain → `source='imd_rain'`, tmax/tmin → `source='imd_temp'`), optionally archives raw `.grd` + daily Parquet to R2. Persistent cache lets re-runs skip downloads.
  - `requeue --id <id> | --status done|failed|running [--source ...]` — resets jobs to pending so the worker can re-run them.
  - `aggregate --source <s> --what all|annual_extremes|annual_rain|decade_rain|monthly_normals|season_prefix [--baseline-start --baseline-end]` — set-based SQL upserts into the five serving tables. `monthly_normals` auto-detects a baseline window when daily_weather doesn't cover 1991–2020; `decade_rain` requires ≥3 years per decade and silently produces 0 rows on a single-year build.
  - `load-global [--data-dir <dir>] [--refresh-owid] [--min-year 1900]` — phase 4.5. Loads four curated/fetched datasets into `global_indices`, `country_emissions`, `country_projections` and stamps one `source_provenance` row per dataset. Reads `co2_annmean_mlo.csv`, `gmsl_annual.csv`, `country_projection_2050.csv` from `v0.2/data/global/` and fetches the OWID CO₂ master CSV (cached under `.cache/`) for `country_emissions`. Idempotent.

## Current data state

Phases 2–3 verified on India 2020; phase 4 first slice live; phase 4.5 fully loaded; phase 6a (IMD India grids) fully loaded end-to-end.

- Supabase has 69 places, 23 aliases. `grid_cells`: 619 ERA5 + 17,415 imd_rain + 961 imd_temp = 18,995. `place_grid_map`: 69 ERA5 + 33 imd_rain + 33 imd_temp = 135 (Indian places mapped to both IMD grids).
- 24 ERA5 jobs done for India 2020 (12 × `2m_temperature` + 12 × `total_precipitation`).
- `daily_weather` = 2,354,811 rows total: 13,542 ERA5 + 891,957 imd_temp (74 yrs × 33 places × 365.6 days, tmax+tmin merged via COALESCE upsert) + 1,449,312 imd_rain (124 yrs × 32 places × 365.6 days — Chennai's nearest IMD cell is over ocean so the upsert drops its rows; the read-side falls back to era5 for that place and reports `no_data` until a non-coastal mapping or station obs is added).
- Aggregates per source: `annual_extremes` 37 era5 + 2,442 imd_temp; `annual_rain` 37 era5 + 3,968 imd_rain; `decade_rain` 416 imd_rain (13 decades × 32 places); `monthly_normals` 444 era5 + 396 imd_temp + 384 imd_rain (WMO 1991–2020 baseline); `season_prefix` 13,542 era5 + 891,957 imd_temp.
- Provenance: ERA5 + phase-4.5 + IMD per-year stamps; one row per (source, variable, year) chunk.
- Phase 4.5 tables: `global_indices` 211 rows (`co2_ppm` 1959–2024 × 66 + `gmsl_mm` 1880–2024 × 145), `country_emissions` 3,653 rows across 33 pilot countries (OWID/Global Carbon Budget, 1900–2024), `country_projections` 66 rows = 33 countries × 2 scenarios (`ssp245`, `ssp585`) at horizon 2050 vs 1995–2014 baseline.
- R2 bucket `klimate-archive` has matching `raw/era5/.../...nc` and `daily/era5/.../...parquet` objects. (Phase-6a ran with `--no-upload`; `.grd` archives stay in `v0.2/ingest/scratch/imd/{rain,tmax,tmin}/<year>.grd`. Re-run with R2 creds to backfill the archive layer.)
- Vite + React web app live on `http://localhost:5174`, proxying `/api/*` → `:3002`. Parchment-and-ink almanac theme (CSS variables driven, dark "planetarium" variant deferred), Fraunces + Switzer + JetBrains Mono. Single form: birthplace combobox (debounced `/api/places`), birth date, repeatable lived-in stay rows with a "still living here" checkbox that sends literal `"today"` to the API. On submit POSTs `/api/kundli`, then renders a 3×4 grid of 12 cells in `Cell.tsx` — Roman-numeral house number per cell, hot/cold/wet/dry tinted icon, `Skeleton` shimmer on `status: "pending_dataset"`, `ProvenancePill` (source · fallback · quality% · partial-days) on cells that ship one. Prod bundle 91 kB gzipped JS / 6 kB CSS.
- Phase 4.5 source files: `v0.2/data/global/{co2_annmean_mlo.csv, gmsl_annual.csv, country_projection_2050.csv}` (ship-in-repo curated) + `country_co2.csv` slimmed slice cached by the loader after fetching OWID master at `https://raw.githubusercontent.com/owid/co2-data/master/owid-co2-data.csv` (≈14 MB upstream → 3.6k slim rows). See `v0.2/data/global/README.md` for source notes.
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
- `/api/kundli` returns a fixed 12-cell array. **Source preference is per-variable**: temperature cells (2–7) try `imd_temp` then fall back to `era5`; rain cell (9) tries `imd_rain` then `era5`. Each cell's `provenance.source` reports which one actually answered. The SQL `WHERE source = ANY(...) ORDER BY array_position(...)` pattern keeps the read in a single round-trip. Cells 4/5 still fall back to `monthly_normals` when the exact day isn't in `daily_weather`; cells 10/11 fall back to the earliest available year when the visitor's birth year predates the record (e.g. born 1950, Mauna Loa starts 1959 — the cell stamps the actual `from_year` it used).
- **Canonical input verified end-to-end** (Delhi 1990-06-15, Mumbai 2014–2020, Bengaluru 2020→): all 12 cells `ok`. Cells 2/3 = 43.9°C / 3.7°C (imd_temp, 1990), cell 9 = -7.4% (imd_rain, 1990s 713 mm/yr → 2020s 660 mm/yr), cells 6/7 mix three Indian cities into 6,331 summer days + 6,289 winter days. Edge cases tested: Chennai (coastal — imd_rain has no cell, falls back to era5 = no_data; imd_temp covers it); Bengaluru-1947 (imd_temp starts 1951, so cells 2/3 = no_data while cell 9 = +43.8% over 1940s→2020s is `ok`).

**Next session, first action:** **phase 6b — IMD station / sub-station observations.** Blocked on user delivering IMD access details (asked: paste IMDDS user/pass or an API key into `v0.2/ingest/.env`; the next session will design the station table + nearest-station resolver and add an `imd_station` source). Until then, the gridded layer is the India anchor.

**Open phase-4.5 polish (non-blocking):** the per-cell quality field in `Provenance` is stored as a DB integer 1–5 but the web's `ProvenancePill` renders it as `Math.round(q*100)%` (assuming 0–1 fraction). Phase 4.5/6a cells now omit `quality`; existing cells 2–7 still surface raw ints which the UI mis-renders as "300%/400%". Fix when next touching `Cell.tsx` / `Provenance` types — convert at API edge or add a `qualityPct` field.

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
| Phase 4.5 ingest loader | `v0.2/ingest/src/klimate_ingest/global_indices.py` |
| Phase 4.5 curated CSVs + slim cache | `v0.2/data/global/{*.csv, .cache/}` |
| Phase 4.5 migration | `v0.2/infra/supabase/migrations/0006_global_indices.sql` |
| Phase 6a IMD source connector (imdlib wrapper) | `v0.2/ingest/src/klimate_ingest/sources/imd_grid.py` |
| Phase 6a IMD .grd → daily DataFrame | `v0.2/ingest/src/klimate_ingest/transform/imd_daily.py` |
| Phase 6a IMD per-year pipeline | `v0.2/ingest/src/klimate_ingest/pipeline_imd.py` |
| Phase 6a IMD grid populator + country-filtered place mapper | `v0.2/ingest/src/klimate_ingest/transform/place_map.py` (`populate_imd_grid`, `map_places_to_grid(country_filter=…)`) |
| Phase 6a migration (source in PK on all aggregates) | `v0.2/infra/supabase/migrations/0007_source_in_pk.sql` |
| Phase 6a IMD `.grd` cache (gitignored) | `v0.2/ingest/scratch/imd/{rain,tmax,tmin}/<year>.grd` |
| Web entry / Vite config / Tailwind config | `v0.2/apps/web/{vite.config.ts,tailwind.config.ts,components.json}` |
| Web theme (parchment-ink) + fonts | `v0.2/apps/web/src/styles.css` |
| Web wire types (mirror of API kundli types) | `v0.2/apps/web/src/lib/types.ts` |
| Web fetch helpers (places search, kundli POST) | `v0.2/apps/web/src/lib/api.ts` |
| Place autocomplete (cmdk + Radix popover) | `v0.2/apps/web/src/components/PlaceCombobox.tsx` |
| Form (birth + repeatable stays + still-here checkbox) | `v0.2/apps/web/src/components/{KundliForm,StayRow}.tsx` |
| 3×4 grid + per-cell render + provenance pill | `v0.2/apps/web/src/components/{KundliGrid,Cell,ProvenancePill}.tsx` |
| shadcn primitives | `v0.2/apps/web/src/components/ui/*` |
| App shell, intro placard, view-state machine | `v0.2/apps/web/src/App.tsx` |

## Accounts and secrets

- Copernicus CDS: free account; ERA5 licences accepted; `~/.cdsapirc` configured.
- Supabase: project provisioned; **Session Pooler** URL in `.env` (Direct connection is IPv6-only and fails on the user's network).
- Cloudflare R2: account credentials live in `v0.2/ingest/.env`. Bucket `klimate-archive` is created via `klimate-ingest r2-init` on first run. If payment/billing isn't yet enabled on the account, `r2-init` will fail with a clear ClientError — enable R2 in the Cloudflare dashboard, then re-run.
- IMD Pune gridded: no auth needed — `imdlib` fetches directly from the public CMPG portal. Phase 6a uses this.
- IMD station / sub-station (phase 6b): **pending — user to add IMDDS credentials or API key to `v0.2/ingest/.env`** (`IMDDS_USER`/`IMDDS_PASS` or `IMD_API_KEY`).

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

> Continuing the Klimate Kundli v0.2 build. Read `v0.2/docs/STATE.md` first for context. Phases 1–5, 4.5, and 6a are done end-to-end: ingest (ERA5 + IMD Pune gridded rainfall 1901–2024 + IMD temp 1951–2024) → Supabase aggregates per-source + global indices → Hono API (10 endpoints + bundled `/api/kundli`, all 12 cells implemented, per-variable source preference imd_temp/imd_rain → era5 fallback) → Vite/React/Tailwind/shadcn web on parchment-ink almanac theme at `:5174`. Canonical input (Delhi 1990, Mumbai 2014–2020, Bengaluru 2020→) yields all 12 cells `ok` with real IMD numbers. Next: phase 6b (IMD station / sub-station observations) — blocked on the user providing IMD API key / IMDDS credentials in `v0.2/ingest/.env`.

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

# phase 4.5: global indices
cd v0.2/ingest && set -a && source .env && set +a && \
  psql "$SUPABASE_DB_URL" -f ../infra/supabase/migrations/0006_global_indices.sql
./.venv/bin/klimate-ingest load-global                    # loads all 4 datasets

# phase 6a: IMD India grids (no auth needed)
cd v0.2 && set -a && source ingest/.env && set +a && \
  psql "$SUPABASE_DB_URL" -f infra/supabase/migrations/0007_source_in_pk.sql
cd ingest && ./.venv/bin/klimate-ingest grid-build-imd --source both
./.venv/bin/klimate-ingest imd-ingest --variable rain --year-start 1901 --year-end 2024 --no-upload
./.venv/bin/klimate-ingest imd-ingest --variable tmax --year-start 1951 --year-end 2024 --no-upload
./.venv/bin/klimate-ingest imd-ingest --variable tmin --year-start 1951 --year-end 2024 --no-upload
./.venv/bin/klimate-ingest aggregate --source imd_rain --quality 4
./.venv/bin/klimate-ingest aggregate --source imd_temp --quality 4

# phase 5: web
cd v0.2 && npm --workspace apps/web run dev               # http://localhost:5174
# Vite proxies /api/* to :3002, so the same canonical POST also works through the dev server:
curl -X POST 'http://localhost:5174/api/kundli' \
  -H 'Content-Type: application/json' \
  -d '{"birth_slug":"delhi-in","birth_date":"1990-06-15","lived":[{"slug":"mumbai-in","start":"2014-06-01","end":"2020-05-31"},{"slug":"bengaluru-in","start":"2020-06-01","end":"today"}]}'
# Production build smoke (writes apps/web/dist):
npm --workspace apps/web run build
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
