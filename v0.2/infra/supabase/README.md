# Supabase schema

Plain SQL migrations for the v0.2 serving database. Apply in order against your Supabase Postgres instance.

## Layout

```
supabase/
  migrations/
    0001_init_extensions_and_places.sql   places + place_aliases + extensions
    0002_grid_mapping.sql                 grid_cells + place_grid_map
    0003_aggregates.sql                   annual_extremes + annual_rain + decade_rain + monthly_normals
    0004_provenance.sql                   source_provenance + per-row source columns
    0005_jobs.sql                         ingest_jobs queue
```

## How to apply

Pick whichever you prefer. They're all idempotent (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`).

### Option A — psql

```bash
export PGURL="postgresql://postgres:PASSWORD@db.YOUR-PROJECT.supabase.co:5432/postgres"
for f in v0.2/infra/supabase/migrations/*.sql; do
  echo "applying $f"
  psql "$PGURL" -v ON_ERROR_STOP=1 -f "$f"
done
```

### Option B — Supabase Studio SQL editor

Paste each file in order and run.

### Option C — Supabase CLI

If you set up the official Supabase CLI (`supabase link` against your project), copy these files into `supabase/migrations/` at the project root and run `supabase db push`.

## Conventions

- Schema is `public`. No custom schemas yet.
- All tables have `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`.
- All "wide" data tables (`annual_extremes`, `annual_rain`, etc.) carry a `source` column for provenance and a `quality` column for a 1–5 quality flag.
- PostGIS is enabled. Place coordinates are stored both as `lat REAL`, `lon REAL` and as a generated `geom GEOGRAPHY(Point, 4326)` for spatial joins.

## Order of operations

Migrations should run in numeric order. Later migrations may reference earlier tables.
