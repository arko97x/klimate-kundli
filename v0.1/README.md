# Klimate Kundli — PoC

All-digital PoC. Localhost only. Web form collects visitor inputs → backend computes the 12-cell climate kundli (cells 2–12 from the concept) → renders to the page.

Stack: **npm workspaces** + **Vite + React + TS** (`apps/web`) + **Hono + better-sqlite3 + TS** (`apps/server`). Aggressive pre-cache so generation hits SQLite first; live Open-Meteo only on cache miss.

## What's where

```
apps/
  server/   Hono API, SQLite cache, prefetch + bundled-CSV scripts
  web/      Vite + React form and kundli renderer
data/       Bundled CSVs + cities.json + cache.db (gitignored)
scripts/    download-bundled.sh — pulls the 3 static CSVs
```

## One-time setup

```bash
npm install
bash scripts/download-bundled.sh     # NOAA CO2, OWID emissions, NASA GMSL → data/
npm run prefetch -w @klimate-kundli/server   # geocode + Open-Meteo historical + CMIP6 for top ~110 cities
```

The prefetch run takes 10–20 minutes on a decent connection. Edit `data/cities.json` to add/remove cities. Re-running is idempotent — uncached date ranges are filled in, existing rows are upserted.

Useful prefetch flags:

- `--only-bundled` — only load the 3 CSVs into SQLite, no network
- `--no-bundled` — only fetch weather, skip CSV ingest
- `--no-climate` — skip CMIP6 (cell 12), faster
- `--tier1-only` — full prefetch (weather + CMIP6) for the ~190 tier-1 cities only
- `--tier2-only` — weather-only prefetch for the ~270 tier-2 cities only

Example: full first-run on a fast connection:

```bash
npm run prefetch -w @klimate-kundli/server                  # everything
# or split across runs:
npm run prefetch -w @klimate-kundli/server -- --tier1-only  # ~15-25 min
npm run prefetch -w @klimate-kundli/server -- --tier2-only  # ~30-60 min
```

## Run

Two terminals:

```bash
npm run dev:server     # http://localhost:3001
npm run dev:web        # http://localhost:5173
```

Open <http://localhost:5173>. Vite proxies `/api/*` to the server.

Health check: <http://localhost:3001/api/health> shows row counts per table.

## How the cells map to data

| # | Cell | Source |
|---|------|--------|
| 1 | "You" header | form input |
| 2 | Highest temp in birth year | Open-Meteo Historical (ERA5) |
| 3 | Lowest temp in birth year | Open-Meteo Historical |
| 4 | Highest temp on latest birthday | Open-Meteo Historical |
| 5 | Lowest temp on latest birthday | Open-Meteo Historical |
| 6 | Summer temp range across cities | Open-Meteo Historical, all stays |
| 7 | Winter temp range across cities | Open-Meteo Historical, all stays |
| 8 | Δ national CO₂ emissions (lifetime) | OWID `owid-co2-data.csv` |
| 9 | Δ rainfall in birth city (lifetime) | Open-Meteo Historical (precip) |
| 10 | Sea-level rise (lifetime) | NASA GMSL altimetry CSV |
| 11 | CO₂ ppm: birth year vs today | NOAA Mauna Loa CSV |
| 12 | Projected temp on 2050 birthday | Open-Meteo Climate API (CMIP6) |

## Cache architecture

SQLite, single file at `data/cache.db`. Tables:

- `geocode` — PK `query` (lower(city|country))
- `weather_daily` — PK `(lat, lon, date)`. Lat/lon rounded to 4 decimals so different geocoder results for the same city collapse onto the same key.
- `climate_proj_daily` — same shape, holds CMIP6 projection.
- `co2_annual`, `emissions_annual`, `sea_level_monthly` — bundled.

Cache-first fetch: `cache.ts` checks coverage of the requested date range; if ≥98% covered → return cached, otherwise fetch from Open-Meteo and upsert.

## Live-fetch fallback

If a visitor enters a city that wasn't in `data/cities.json`, the first request lives ~2–4s while Open-Meteo fills the cache. Every subsequent request for that city is sub-100ms.

If offline + uncached: the request will fail. The full system spec calls for a "collect in 5 min" job queue — out of scope for this PoC.

## API

```
POST /api/generate
  body: {
    "birthDate": "1995-03-21",
    "birthCity": "Kolkata",
    "birthCountry": "India",
    "citiesLivedIn": [
      { "city": "Mumbai", "country": "India", "start": "2017-08-01", "end": "2022-06-30" }
    ]
  }
  → 200 { visitor, cells: Cell[12], generatedAt, elapsedMs }

GET /api/health   row counts per cache table
GET /api/geocode?city=...&country=...   debugging
```

## Caveats / known limits

- ERA5 has ~5-day publish lag. Latest-birthday cells may be empty if today's birthday is <5 days ago.
- Open-Meteo rainfall is biased low vs IMD over the Indian monsoon. Adequate for PoC.
- CMIP6 cell uses up to 5 models (`MRI_AGCM3_2_S`, `EC_Earth3P_HR`, `CMCC_CM2_VHR4`, `FGOALS_f3_H`, `MPI_ESM1_2_XR`) and picks the first non-null per day. This routes around individual-model spatial gaps (we hit nulls with EC_Earth3P_HR at Kolkata and MRI alone at São Paulo). Switch to a true ensemble mean for the show if needed.
- Cell 8 (national emissions) uses ISO alpha-3 lookup against OWID. Bypasses country-name aliasing. Falls back to name match only if ISO is missing.
- Sea-level CSV is the EPA/CSIRO compilation: CSIRO reconstruction 1880-1992 + NOAA altimetry 1993+. Inches → mm conversion in the loader.
- Open-Meteo free tier has ~600 req/min and ~10k req/day caps. Plenty for normal exhibition use after prefetch, but during dev/prefetch you can hit it. For show day, consider Open-Meteo Standard API (€29/mo) for headroom.
