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

This is the skeleton commit. Each subsystem has a placeholder; real implementation lands in subsequent passes per the middle-path plan.

## Next steps

See repo-root [`docs/`](../docs/) working document and the middle-path plan for ordered build steps.
