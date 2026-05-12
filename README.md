# Klimate Kundli

Exhibition piece for *Data, Otherwise* (VizChitra 2026). Visitors enter their birth date, birth city, and cities they have lived in; the system returns a twelve-cell climate “kundli” situating their life inside the planet’s recent climate history.

## This branch (`main`)

`main` is intentionally **README-only** while **v0.3** is bootstrapped (fresh backend direction: thin orchestration, disk-backed cache, tiered fallbacks — not checked in here yet).

## Archive: v0.1 and v0.2 (retired)

The complete tree — `v0.1/`, `v0.2/`, `docs/`, reference PDFs/images, `Caddyfile`, `versions.json`, etc. — is preserved on:

| Ref | Purpose |
|-----|---------|
| **Branch `retired-0.1-0.2`** | Day-to-day checkout of the retired codebase and assets. |
| **Tag `archive/v0.1-v0.2-final`** | Immutable pointer to the exact snapshot before `main` was cleared (same commit as the branch tip at archive time). |

Release **v0.1.0** remains reachable on that history for the frozen PoC.

### What they were

- **v0.1** — Localhost-only proof of concept: Vite + React + **Hono + SQLite**; weather cells from **Open-Meteo** (ERA5, geocoding, CMIP6 climate API); global context cells from **bundled CSVs** (OWID emissions, sea level, Mauna Loa CO₂). Prefetch warmed the cache; otherwise cache-first live fetch on miss. Goal: validate the twelve-cell mapping and global coverage without operating a database service.

- **v0.2** — Precomputed “climate database”: Python ingest (e.g. Copernicus ERA5, IMD gridded, global indices) → **Cloudflare R2** + **Supabase Postgres** → **Hono API** + **Vite/React/shadcn** web app so the UI did not call upstream APIs at read time. Goal: stability, reproducible numbers, India-faithful layers where ingested. Much of the pipeline shipped; planned depth was not finished; operating cost and tooling overshot what a short, non-commercial, low-QPS exhibit needed.

### Why both are retired

- **v0.1** was not a deployable, venue-ready system: localhost-only, prefetch-heavy, still dependent on live upstreams for uncached cities — fine as a PoC, wrong as the final technical bet for the show.

- **v0.2** traded that for **ownership of the data plane**. For this use case that duplicated work **free, purpose-built APIs already solve** (especially Open-Meteo for city-scale historical and projections). The extra moving parts bought limited marginal value for a two-day installation while consuming budget, time, and cognitive load — a costly experiment, partially incomplete, and unnecessary in retrospect relative to a thin orchestration layer with **aggressive caching** (and explicit fallbacks) in front of upstream services.

Neither stack is the chosen direction going forward; the **`retired-0.1-0.2`** branch is the **documented experiment** and source of truth for what was tried.

### Check out the archive

```bash
git fetch origin
git checkout retired-0.1-0.2
# or, pinned to the snapshot commit:
git checkout archive/v0.1-v0.2-final
```

There is **no** requirement to serve v0.1/v0.2 over HTTP from this repo anymore; the old root **`Caddyfile`** lived only on the archive branch.
