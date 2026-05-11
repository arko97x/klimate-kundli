# How Klimate Kundli was built

A working note describing the proof-of-concept implementation: the brief, the decisions, the architecture, the data sources, and the hardening passes that brought the build to its current state.

---

## 1. The brief

Klimate Kundli is an exhibition piece for *Data, Otherwise* (VizChitra 2026). Visitors enter their birth date, birth city, and the cities they have lived in; the system returns a 12-cell "kundli" of climate facts that situate the visitor's life inside the planet's recent climate history. The proof-of-concept (PoC) brief was deliberately narrow: an all-digital, localhost-only web application that collects visitor inputs, fetches data for cells 2–12, and renders the result on the same page. No hardware, no print pipeline, no exhibition station integrations yet.

The non-negotiable data needs were specified at the outset and shaped every architectural decision:

1. Temperature (high/low for the visitor's birth year and latest birthday, in the birth city; cross-city seasonal ranges across cities they have lived in)
2. Rainfall (change in the birth city across the visitor's lifetime)
3. CO₂ atmospheric concentration (ppm, birth year vs today)
4. National CO₂ emissions (change across the visitor's lifetime)
5. Sea-level rise (across the visitor's lifetime)
6. Projected temperature on the visitor's 2050 birthday

Two further constraints framed the build: visitors could be born anywhere in the world (so the system has to be globally capable, not Indian-only), and the exhibition venue's Wi-Fi quality is unknown (so the system needs to lean on local caches and be resilient to network volatility).

## 2. Stack decisions

The stack is npm workspaces on Node 20+ with two apps and a shared `data/` folder.

* **`apps/server`** — TypeScript backend on [Hono](https://hono.dev) running on `localhost:3001`. Hono was chosen over Next.js because the PoC has no SSR or routing complexity worth paying for; it is a thin REST + JSON server in front of a SQLite cache and a few HTTP fetchers. `better-sqlite3` is the persistence layer because it is synchronous, embedded, zero-ops, and very fast for the read-mostly access pattern that dominates exhibition use. Zod handles request validation. `tsx` runs TypeScript in dev without a compile step.
* **`apps/web`** — Vite + React + TypeScript on `localhost:5173`. Vite is configured to proxy `/api/*` to the server, so the frontend treats the backend as same-origin throughout. The form and the kundli renderer live here, plus a custom `CityCombobox` autocomplete component.
* **Shared `data/`** — bundled CSVs (CO₂ ppm, national emissions, sea level), `cities.json` (the prefetch list), and `cache.db` (the SQLite cache, gitignored).

Why not Python for data munging? It is tidier for some of the work but doubles the runtime footprint and the deploy story. The compute is small enough (low tens of thousands of daily rows per visitor) that JavaScript handles it in well under 100 ms, so a single-runtime Node setup is the lower-friction call.

## 3. Architecture

The system is a thin pipeline. The frontend collects structured input, the backend resolves city coordinates, fetches climate data either from cache or from upstream APIs, runs a small set of pure compute functions to produce 12 cells, and returns JSON. There is exactly one persistence layer (SQLite) and exactly one cache strategy (cache-first with coverage-aware fallback to live fetch).

```
Browser (Vite/React)
  └── /api/generate
        └── Hono handler (apps/server/src/index.ts)
              ├── geocode(birth city, lived cities) ──► SQLite.geocode  ──► [miss] Open-Meteo Geocoding
              ├── per-cell builders, parallel where possible
              │     ├── getWeatherDaily(lat, lon, range) ──► SQLite.weather_daily ──► [miss] Open-Meteo Historical (full 1940→today)
              │     ├── getClimateDaily(lat, lon, range) ──► SQLite.climate_proj_daily ──► [miss] Open-Meteo Climate (CMIP6, 2020→2050)
              │     └── bundled lookups (CO₂ ppm, emissions, sea level) ──► SQLite (loaded once from CSV)
              └── return Cell[12]
```

The HTTP entry points are deliberately small: `POST /api/generate` for the kundli, `GET /api/geocode` for a single best-match resolution, `GET /api/geocode/search` for the autocomplete (multi-result), and `GET /api/health` for a quick row-count snapshot of the cache.

## 4. Data sources

Every data point in the 12 cells comes from one of three places, chosen to match the project's invariant data needs.

### Live, cached: Open-Meteo

* [**Open-Meteo Historical Weather API**](https://open-meteo.com/en/docs/historical-weather-api) — daily ERA5 reanalysis from 1940 onwards, global, ~10 km resolution, no auth. One call per visitor city returns `temperature_2m_max`, `temperature_2m_min`, `precipitation_sum` for the entire requested range. Powers cells 2, 3, 4, 5, 6, 7, 9.
* [**Open-Meteo Geocoding API**](https://open-meteo.com/en/docs/geocoding-api) — returns lat/lon, ISO country code, and admin-1 region for a city query. Used for both single-city resolution and the autocomplete.
* [**Open-Meteo Climate API**](https://open-meteo.com/en/docs/climate-api) — daily CMIP6 projection, 1950–2050. Free, no Copernicus account needed. Powers cell 12. We pass several models in priority order and merge per-day, picking the first non-null value (more on this below).

### Bundled CSVs (loaded once into SQLite)

* **NOAA Mauna Loa annual mean CO₂** — single CSV, 1958→present. Powers cell 11.
* **Our World in Data — `owid-co2-data.csv`** — every country/region, 1750→latest, with both name and ISO alpha-3 codes. Powers cell 8.
* **EPA / CSIRO sea-level compilation** — annual CSIRO reconstruction back to 1880 plus NOAA altimetry from 1993, in inches; the loader converts to mm. Powers cell 10.

The bundled files are downloaded by `scripts/download-bundled.sh`. They live in `data/` and are checked into the repo (small enough; refreshed manually on schedule).

### Why these sources

Each was chosen by the same rule: *can a visitor born anywhere in the world get a non-empty answer for this cell?* Open-Meteo's ERA5 backing gives global coverage at a sensible resolution. NOAA Mauna Loa is global by definition. OWID is the most complete national-emissions dataset and it ships with ISO codes. The EPA/CSIRO sea-level series is the most reliable open mirror after the NASA URL stopped serving the data file directly.

## 5. SQLite schema and cache strategy

The schema lives in `apps/server/src/db.ts`. Six tables, all idempotent (`CREATE TABLE IF NOT EXISTS`), plus a small migration helper (`ensureColumn`) that uses `pragma_table_info` to add columns to existing tables — that lets us evolve the schema without forcing a wipe.

```
geocode(query PK, display_name, country, country_code, admin1, lat, lon, fetched_at)
weather_daily(lat, lon, date) PK, tmax, tmin, precip
climate_proj_daily(lat, lon, date) PK, tmax, tmin
co2_annual(year PK, ppm)
emissions_annual(country, year) PK, iso_code, co2_mt, co2_per_cap
sea_level_monthly(date PK, gmsl_mm, source)
prefetch_log(city_query PK, status, error, rows, ran_at)
```

A few details that matter:

* **Lat/lon are rounded to four decimals** (~10 m precision) before they become cache keys. This collapses tiny geocoder variations onto the same key, so re-running a query for "Bombay" vs "Mumbai" with slightly different coordinates lands in the same cache row.
* **Cache reads are coverage-aware.** When the compute layer asks for a date range, the cache helper counts the rows it has and returns the cached slice if it covers ≥ 98 % of the requested days; otherwise it triggers a live fetch. The 2 % slack is for the occasional missing day in the ERA5 stream.
* **A live fetch always pulls the full historical range**, not just the requested slice. The first time we see a city, we fetch 1940→today in one HTTP call (and 2020→2050 for the climate projection in a second call), then write the lot. Every subsequent question for that city — birth-year extremes, latest-birthday extremes, rainfall lifetime — answers from cache. This dropped per-visitor API request counts from five-or-six to one-or-two.
* **Concurrent fetches for the same coordinate dedupe via an in-flight `Promise` map.** Without this, the parallel cell builders would each kick off their own Open-Meteo call on a cache miss and burst into the rate limiter. Now they share a single in-flight promise.

## 6. The 12-cell compute layer

`apps/server/src/compute.ts` is the brain. It has one orchestrator (`generateKundli`) and one builder per cell (or per cell pair, where cells share work). The builders are pure: given coordinates, dates, and the bundled lookups, they return a `Cell` with a stable shape — `{ id, label, value, detail?, data? }`. The orchestrator runs cell builders in parallel where they don't share state, then assembles the final 12-cell array.

A few cells deserve a note:

* **Cells 6/7 (cross-city seasonal range)** average max and min temperatures across the visitor's stays in each lived-in city, separating Apr–Sep ("summer") from Oct–Mar ("winter"). The hot/cold ends of the range are reported alongside the city responsible for each end. This loop is sequential per stay because each stay is a different coordinate and we want to keep the rate-limit profile predictable.
* **Cell 9 (rainfall lifetime)** compares the average annual rainfall in the birth-year decade to the latest decade, both at the birth city. It only uses years for which we have ≥ 300 days of data, to avoid skewing on partial years.
* **Cell 12 (2050 projection)** asks Open-Meteo Climate for a ±7-day window around the visitor's 2050 birthday, then reports the min and max across the window. This window matters: a single day from a single CMIP6 model is statistical noise, but a fortnight is meaningful seasonal context.
* **Cell 8 (national emissions)** prefers an ISO-code lookup against OWID, and only falls back to name matching if the ISO path misses. This is what makes the system robust to the Czechia / Czech Republic / Côte d'Ivoire / North Macedonia / Eswatini / Hong Kong class of country-name mismatches that broke the earlier name-only path.

The compute layer never throws on missing data; cells degrade gracefully to `value: null` with a `detail` explaining what was missing. This keeps the UI honest about partial responses rather than hiding gaps.

## 7. The frontend

`apps/web/src/App.tsx` is a single-page form: birth date (calendar input), birth city (autocomplete), country (auto-filled when the autocomplete picks a result, but still editable), a repeatable list of "cities I lived in" with start/end date inputs, and a single "Generate my Kundli" button. Submission posts JSON to `/api/generate` and renders the returned cells into a 4-column responsive grid.

The autocomplete (`CityCombobox.tsx`) is a small custom component built around a debounced fetch to `/api/geocode/search`. It returns up to eight results with admin-1 and country labels, supports keyboard navigation (↑ ↓ Enter Esc), and on selection writes both the canonical city name and the country into the form. That last part is what makes the ISO path reliable in cell 8: by the time a visitor presses the button, we always have a country code attached to their birth city.

The CSS in `styles.css` is intentionally plain — system font, two CSS variables for light/dark, no design system. The brief was explicit that visual design is not in scope yet, so the styling is utilitarian: clear hierarchy, consistent spacing, and an accent colour. The kundli grid uses CSS grid with a 4-column desktop layout and a 2-column responsive break under 800 px.

## 8. The four hardening passes

After the first end-to-end run worked for a Kolkata test visitor, a deliberate hardening pass closed the four largest gaps that would have surfaced for a global audience.

**Pass 1: multi-model CMIP6 fallback.** Single CMIP6 high-resolution models have spatial holes — `EC_Earth3P_HR` returned all-null at Kolkata, and `MRI_AGCM3_2_S` returned all-null at São Paulo. The fix passes five models in priority order to the Climate API in a single request and merges the per-day series, picking the first non-null value. One HTTP call still, but cell 12 now populates everywhere we have tested.

**Pass 2: ISO alpha-3 path for cell 8.** The OWID emissions table indexes by both country name and ISO alpha-3, while Open-Meteo's geocoder returns ISO alpha-2 country codes. A new `iso.ts` module ships the full ISO 3166-1 alpha-2→alpha-3 map (250+ territories including Hong Kong, Macao, Taiwan, Palestine, the Channel Islands, etc.). The compute layer now prefers the ISO path; if alpha-2 is missing or unmapped, it falls back to name + alias matching. This was verified against six previously-broken country names — Czechia, Hong Kong, Côte d'Ivoire, North Macedonia, DR Congo, Eswatini — all now resolve cleanly.

**Pass 3: tiered prefetch.** `data/cities.json` was restructured into two arrays: `tier1_full` (~190 cities, full data including CMIP6) and `tier2_weather` (~270 cities, ERA5 historical only, since cell 12's projection is the expensive part and most lived-in cities don't need it). The prefetch script learned `--tier1-only` and `--tier2-only` flags so the operator can stage the prefetch across two runs. The legacy single-tier `cities` key still works.

**Pass 4: city autocomplete.** A new `GET /api/geocode/search` endpoint returns up to 15 disambiguated matches, and the frontend's plain text inputs were replaced with the `CityCombobox`. This eliminates a whole class of failure (visitor types "Springfield" or "Cambridge" with no country, the geocoder picks the wrong one, every cell that depends on coordinates is computed for the wrong city). It also guarantees a country code is attached to every visitor input, which the ISO path needs.

## 9. Verification

The PoC is verified end-to-end on these scenarios:

* Kolkata, India, 1995-03-21, no lived-in cities — all 12 cells populate, ~25–36 ms cached, ~3–5 s cold.
* Kolkata + Bengaluru + Mumbai stays — cells 6/7 produce real cross-city ranges (12.4 °C and 14.7 °C spans). ~5 s cold for two new cities, ~25 ms cached.
* Tokyo, Japan — clean global case, all cells populate, OWID's "Japan" matches by name.
* São Paulo, Brazil — proves the multi-model CMIP6 fix; cell 12 went from `null` to `16.9–34.4 °C`.
* The autocomplete returns three correctly disambiguated "Praha" matches across Czechia, Slovakia, and Texas.
* ISO-path lookups resolve six tricky country names directly against OWID's `iso_code` column, which the previous name-only matcher would have missed.

The two operational reminders worth flagging from the verification work:

* Open-Meteo's free tier has both per-minute and per-day rate caps. During development the per-minute cap is easy to hit; during exhibition use, with a warm cache, it shouldn't be. If show-day stability matters more than €29, switch to Open-Meteo Standard tier in `apps/server/src/config.ts` (just a host swap).
* ERA5 has a ~5-day publish lag. If a visitor's latest birthday was less than five days ago, cells 4 and 5 will be empty.

## 10. How to run

```bash
# install once
npm install

# fetch the three bundled CSVs
bash scripts/download-bundled.sh

# load the CSVs into SQLite (instant; no network needed for cells 8/10/11)
npm run prefetch -w @klimate-kundli/server -- --only-bundled

# in two terminals
npm run dev:server   # http://localhost:3001
npm run dev:web      # http://localhost:5173
```

For show-day prefetch (so that nearly every visitor city is a cache hit):

```bash
npm run prefetch -w @klimate-kundli/server -- --tier1-only   # ~15-25 min
npm run prefetch -w @klimate-kundli/server -- --tier2-only   # ~30-60 min
```

`GET http://localhost:3001/api/health` returns row counts for every cache table at any time, which is useful as a smoke check.

## 11. What is deliberately not in this PoC

The PoC stops where the brief stopped. The following are designed for and architecturally compatible with the current code, but not built yet:

* Hardware integration (Arduino over USB serial, knobs, the printed-card pipeline, the TV anomaly view).
* An offline job queue with the "collect in 5 minutes" fallback for uncached visitor cities under venue-Wi-Fi outages.
* A true CMIP6 ensemble mean for cell 12 (we currently use first-non-null across models, which is robust but not statistically averaged).
* A printed-card layout (`puppeteer-core` for HTML→PDF or ESC/POS for thermal printers, depending on the printer choice).
* The mobile sonification page that the printed card's QR will point to.
* Visual design for the on-screen kundli — the curatorial team flagged this as the area most needing development, and it is intentionally untouched here while the data engine is being settled.

These are scoped as separate work packages once the PoC has been reviewed.

## 12. Repository map

```
klimate-kundli/
├── apps/
│   ├── server/
│   │   └── src/
│   │       ├── config.ts            # ports, model lists, date ranges
│   │       ├── db.ts                # SQLite schema + migration helper
│   │       ├── cache.ts             # cache-first read, in-flight dedup, full-range live fetch
│   │       ├── compute.ts           # 12-cell orchestrator + per-cell builders
│   │       ├── iso.ts               # ISO alpha-2 → alpha-3 map
│   │       ├── index.ts             # Hono routes, validation, server bootstrap
│   │       ├── sources/
│   │       │   ├── openMeteo.ts     # geocode, geocodeSearch, fetchHistoricalDaily, fetchClimateProjection
│   │       │   └── bundled.ts       # CSV loaders + SQLite-backed lookups
│   │       └── scripts/
│   │           ├── initDb.ts        # touch schema
│   │           ├── loadBundled.ts   # CSV → SQLite
│   │           └── prefetch.ts      # cities.json → SQLite, with tier flags
│   └── web/
│       └── src/
│           ├── App.tsx              # form + kundli renderer
│           ├── CityCombobox.tsx     # autocomplete component
│           ├── types.ts
│           └── styles.css
├── data/
│   ├── cities.json                  # tier1_full (~190) + tier2_weather (~270)
│   ├── co2_annmean_mlo.csv          # NOAA Mauna Loa annual mean CO₂
│   ├── owid-co2-data.csv            # OWID national emissions (with iso_code)
│   ├── sea_level.csv                # EPA/CSIRO compiled GMSL
│   └── cache.db                     # SQLite, gitignored
├── scripts/
│   └── download-bundled.sh          # pulls the three CSVs above
├── docs/
│   └── HOW-IT-WAS-BUILT.md          # this file
├── README.md                        # quickstart + cell-to-source map + caveats
└── package.json                     # npm workspaces root
```

That is how it has been built so far.
