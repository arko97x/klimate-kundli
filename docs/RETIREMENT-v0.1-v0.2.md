# Retiring v0.1 and v0.2 — archive note

**Klimate Kundli** is an exhibition piece: visitors enter birth date, birth city, and cities lived in; the system returns a twelve-cell climate “kundli.” The two implementations below explored different ways to serve that idea. **Both are retired as active product paths** — kept in-repo as history and reference, not as the basis for further build-out.

---

## v0.1 — what it tried to do

A **localhost-only proof of concept** (frozen at `v0.1.0`): Vite + React in front of a small **Hono + SQLite** server. Weather cells (2–7, 9, 12) came from **Open-Meteo** (historical ERA5, geocoding, CMIP6 climate API); global context cells (8, 10, 11) from **bundled CSVs** (OWID emissions, NASA/CSIRO sea level, Mauna Loa CO₂) loaded into the same SQLite file. A long **prefetch** could warm the cache for hundreds of cities; otherwise the server **cache-first** fetched live Open-Meteo on miss.

Goal: validate the twelve-cell mapping, global coverage, and a fast read path after prefetch — without operating a database service.

---

## v0.2 — what it tried to do

A **precomputed “climate database”** path: Python ingest (Copernicus CDS / ERA5, IMD gridded, global indices, etc.) → **Cloudflare R2** for raw and derived artifacts → **Supabase Postgres** for places, grid mapping, `daily_weather`, rollups, and provenance → **Hono API** + **Vite/React/shadcn** web app talking only to that API, so the exhibit UI never called upstream APIs directly.

Goal: exhibition stability, reproducible numbers, India-faithful layers (IMD over ERA5 where loaded), and a clear separation between batch ingest and read-time API.

Much of that pipeline **did ship** (schema, ingest CLI, aggregates, API bundle, web UI, pilot places, IMD gridded layer, global indices). **Planned depth was not finished** (e.g. IMD station layer, GHCN overlay, event snapshot), and operating cost (Supabase, R2, Copernicus/ingest time, tooling) overshot what a **short, non-commercial, low-QPS exhibit** actually needed.

---

## Why both are retired

- **v0.1** was intentionally **not** a deployable, venue-ready system: localhost-only, prefetch-heavy, and still dependent on live upstream behavior for uncached cities — fine as a PoC, wrong as the final technical bet for the show.

- **v0.2** traded that for **ownership of the data plane**. In hindsight, for this use case that duplicated work **free, purpose-built APIs already solve** (especially Open-Meteo for city-scale historical and projection queries). The extra moving parts bought limited marginal value for a two-day installation while consuming **budget, time, and cognitive load** — i.e. a **costly experiment**, **partially incomplete**, and **unnecessary in retrospect** relative to a thin orchestration layer with **aggressive caching** in front of upstream services.

Neither stack is the chosen direction going forward; the folders remain as **documented experiments** and **source of truth for what was tried**, not as marching orders for the next version.
