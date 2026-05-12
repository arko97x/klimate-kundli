# Klimate Kundli — Data Pipeline Backend

Build the data pipeline for an exhibit installation called Klimate Kundli. Attendees enter when and where they were born, plus cities they've lived in. The system returns 12 climate data points about their life ("kundli"). This prompt covers only the backend pipeline — UI is built separately later.

## What you're building

A standalone proxy server that:

- Takes attendee inputs (birth date, birth city, lived-in cities with date ranges)
- Returns a structured JSON response with all 12 cards computed
- Orchestrates free public APIs (Open-Meteo, NASA POWER, OpenStreetMap Nominatim) with tiered fallback chains
- Caches aggressively to a local SQLite database (survives server restart)
- Pre-warms cache from a curated city list before exhibit
- Degrades gracefully — never throws, always returns *something* with confidence labels

## Non-goals

- No UI
- No hosted database, no R2/S3, no Supabase (local SQLite for cache is fine and required)
- No auth, no user accounts
- No persistence beyond local SQLite cache + bundled CSVs
- No paid APIs (free tiers only, all keyless)

## Stack

- Node.js 20+ with TypeScript (strict mode)
- Hono framework (lightweight, fast)
- Zod for input validation
- Native `fetch` for HTTP
- `better-sqlite3` for the cache (disk-backed, survives restart)
- Deploy target: any (Railway / Fly / Vercel / local laptop during exhibit)

If you prefer a different runtime/framework, justify the swap in a comment at the top of `src/index.ts`. Otherwise stick to the above.

## Project structure

```
klimate-kundli-backend/
├── src/
│   ├── index.ts                 # Hono app entry, CORS, route mounting
│   ├── routes/
│   │   ├── kundli.ts            # POST /kundli (main)
│   │   ├── geocode.ts           # GET /geocode?q=... (for typeahead)
│   │   ├── stats.ts             # GET /stats (telemetry summary)
│   │   └── health.ts            # GET /health
│   ├── resolvers/
│   │   ├── geocoding.ts         # tiered geocoding chain
│   │   ├── historical.ts        # tiered historical weather chain
│   │   ├── projection.ts        # tiered climate projection chain
│   │   └── statics.ts           # CSV-backed lookups
│   ├── aggregations/
│   │   └── cards.ts             # compute cards 1-12 from raw data
│   ├── cache/
│   │   └── store.ts             # SQLite-backed KV with TTL + stats
│   ├── data/
│   │   ├── co2_ppm.csv
│   │   ├── sea_level.csv
│   │   ├── emissions.csv
│   │   ├── city_aliases.json
│   │   └── prewarm_cities.json
│   ├── scripts/
│   │   ├── prewarm.ts           # populate cache for top cities
│   │   └── fetch_static_data.ts # one-shot downloader for CSVs
│   ├── lib/
│   │   ├── budget.ts            # global deadline / AbortController helper
│   │   ├── grid.ts              # lat/lon rounding for cache keys
│   │   ├── haversine.ts         # nearest-city math
│   │   └── telemetry.ts         # JSON-line logger
│   └── types.ts
├── tests/
│   └── *.test.ts                # vitest
├── package.json
├── tsconfig.json
└── README.md
```

## API contract

### `POST /kundli`

Request body (validate with Zod):

```json
{
  "birthDate": "1993-12-10",
  "birthCity": {
    "name": "New Delhi",
    "displayName": "New Delhi, Delhi, India",
    "lat": 28.6,
    "lon": 77.2,
    "country": "IN"
  },
  "livedCities": [
    {
      "name": "New Delhi",
      "displayName": "New Delhi, Delhi, India",
      "lat": 28.6,
      "lon": 77.2,
      "country": "IN",
      "start": "1993-12-10",
      "end": "2000-06-01"
    },
    {
      "name": "Bengaluru",
      "displayName": "Bengaluru (Bangalore), Karnataka, India",
      "lat": 12.97,
      "lon": 77.59,
      "country": "IN",
      "start": "2000-06-01",
      "end": null
    }
  ]
}
```

`end: null` means "current city." Exactly one city should have `end: null`. There is no cap on lived city count.

Response:

```json
{
  "kundli": {
    "cards": [
      {
        "id": 1,
        "type": "you",
        "data": { "city": "New Delhi", "born": "1993-12-10" },
        "source": "input",
        "confidence": "exact"
      },
      {
        "id": 2,
        "type": "birth_year_high",
        "data": { "value": 47.9, "unit": "°C", "date": "1993-06-11", "city": "New Delhi" },
        "source": "era5",
        "confidence": "high"
      }
    ]
  },
  "telemetry": {
    "totalMs": 1247,
    "fallbacksFired": [],
    "cacheHits": 8,
    "cacheMisses": 2,
    "partial": false
  }
}
```

Every card carries:
- `source`: which tier provided the value (`era5`, `nasa_power`, `imd`, `nearest_city`, `extrapolated`, `input`, `static_csv`)
- `confidence`: `exact` | `high` | `medium` | `low` | `unavailable`
- `reason` (optional string): present when `confidence` is `low` or `unavailable`, explains why. Examples: `"timeout"`, `"pre-satellite-era"`, `"geocoder-no-match"`, `"all-tiers-failed"`, `"nearest-city-180km"`

This is the *only* permitted set of confidence values. Anywhere downgraded behavior happens (timeout, fallback, interpolation), it surfaces as `confidence: unavailable | low` with a `reason` — never as a custom value like `confidence: "timeout"`.

### `GET /geocode?q={query}`

Response:
```json
{
  "results": [
    {
      "name": "Mumbai",
      "displayName": "Mumbai (Bombay), Maharashtra, India",
      "lat": 19.0760,
      "lon": 72.8777,
      "country": "IN",
      "admin1": "Maharashtra",
      "alternateNames": ["Bombay"],
      "source": "open-meteo"
    }
  ]
}
```

Always return canonical name + a `displayName` formatted as `{canonical} ({alternate if exists}), {admin1}, {country}`. The frontend uses this string directly.

### `GET /stats`

```json
{
  "uptime": 3600,
  "totalRequests": 142,
  "cacheHitRate": 0.87,
  "cacheSize": 12483,
  "fallbacksByTier": {
    "geocoding": { "tier1": 80, "tier2": 12, "tier3": 50, "tier4": 0 },
    "historical": { "tier1": 100, "tier2": 40, "tier3": 2, "tier4": 0 },
    "projection": { "tier1": 30, "tier2": 12, "tier3": 0 }
  },
  "avgResponseMs": 1400
}
```

### `GET /health`

Returns 200 with `{ "ok": true, "cacheReady": true }` once pre-warm is loaded.

## Data sources & fallback chains

### Geocoding chain

| Tier | Method | Notes |
|---|---|---|
| 1 | Lookup in `prewarm_cities.json` (case-insensitive, alias-aware) | Instant; covers ~150 cities |
| 2 | Lookup in `city_aliases.json` then retry tier 1 | Handles Bombay→Mumbai etc. |
| 3 | Open-Meteo Geocoding API | Free, no key |
| 4 | Nominatim (OpenStreetMap) | Must send `User-Agent: KlimateKundli/1.0 (your-email@example.com)` |
| 5 | Return empty | UI handles map-pin fallback |

URLs:
- Open-Meteo: `https://geocoding-api.open-meteo.com/v1/search?name={q}&count=5&language=en&format=json`
- Nominatim: `https://nominatim.openstreetmap.org/search?q={q}&format=json&limit=5&accept-language=en`

Cache key: `geocode:v1:{normalized_lowercase_query}`. TTL: 30 days.

Result transformation: standardize all responses to the `geocode` shape above. For Open-Meteo, populate `alternateNames` from the `alternate_names` array if present. For Nominatim, parse from `display_name`.

### Historical weather chain (per city, per date range)

| Tier | Method | Notes |
|---|---|---|
| 1 | Local cache | Keyed by `(lat_1dp, lon_1dp, startYear, endYear)` |
| 2 | Open-Meteo Historical (ERA5) | Primary; covers 1940→today globally |
| 3 | NASA POWER (MERRA-2) | Backup; **valid only for dates ≥ 1981-01-01** — resolver MUST skip this tier for earlier date ranges and jump straight to tier 4 |
| 4a | Nearest pre-warmed city, distance ≤100km | `source: nearest_city`, `confidence: medium`, include `nearest_city` field in card data |
| 4b | Nearest pre-warmed city, distance 100–300km | `source: nearest_city`, `confidence: low`, include `reason: "nearest-city-{N}km"` |
| 4c | Nearest pre-warmed city, distance >300km | Do not use; fall through to tier 5 |
| 5 | Return null | Card renders `confidence: unavailable`, `reason: "all-tiers-failed"` |

URLs:
- Open-Meteo: `https://archive-api.open-meteo.com/v1/archive?latitude={lat}&longitude={lon}&start_date={YYYY-MM-DD}&end_date={YYYY-MM-DD}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto`
- NASA POWER: `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,T2M_MIN,PRECTOTCORR&community=AG&longitude={lon}&latitude={lat}&start={YYYYMMDD}&end={YYYYMMDD}&format=JSON`

Note: NASA POWER uses `YYYYMMDD` (no hyphens) and uses `-999` as missing-value sentinel. Normalize on the way in. Also: NASA POWER's MERRA-2 record begins 1981-01-01 — pre-1981 requests will return mostly nulls or errors, so guard at the resolver level.

Distance thresholds (100km / 300km) are tuned for India where pre-warm density is high. For remote regions (Pacific, Arctic) the 300km ceiling may still produce silently degraded data — the `reason: "nearest-city-{N}km"` field surfaces this in the response for the UI to handle.

Cache TTL: forever (historical data doesn't change).

For each city, the resolver fetches the *minimum* date range that satisfies all cards that need that city. Example: for birth city, fetch from birth year through today (covers cards 2, 3, 9). For other lived cities, fetch only the duration the attendee lived there (covers cards 4–7).

### Climate projection chain (card 12)

| Tier | Method | Notes |
|---|---|---|
| 1 | Local cache | Keyed by `(lat_1dp, lon_1dp, target_year)` |
| 2 | Open-Meteo Climate API (CMIP6 ensemble, 5 models) | Primary |
| 3 | Linear extrapolation from local warming rate | Last 30y historical → projected slope; `confidence: low`, `reason: "extrapolated"` |
| 4 | Return null | `confidence: unavailable`, `reason: "all-tiers-failed"` |

URL: `https://climate-api.open-meteo.com/v1/climate?latitude={lat}&longitude={lon}&start_date={startISO}&end_date={endISO}&daily=temperature_2m_max,temperature_2m_min&models=MPI_ESM1_2_XR,EC_Earth3P_HR,CMCC_CM2_VHR4,FGOALS_f3_H,HiRAM_SIT_HR`

Date range for card 12: ±7 days around `2050-{birth_month}-{birth_day}`.

**Model merge strategy (important):** the Climate API returns per-model daily arrays which often contain nulls for specific date/location combinations (some models don't cover certain grid cells). For each day in the response window, take the **first non-null value across the 5 models** as the canonical value for that day. Then aggregate min/max across the resulting daily array.

Report which models contributed in `models_used` (array of model names that produced at least one non-null value for either tmax or tmin in this request). If all 5 models return null for the full window, treat as tier 2 failure and fall through to tier 3.

Cache TTL: forever.

### Static data (cards 8, 10, 11)

Pre-download once, commit to `src/data/`. The `scripts/fetch_static_data.ts` script automates this; the agent runs it once during setup.

| Card | Dataset | Source URL |
|---|---|---|
| 8 | National CO₂ emissions (country × year, Mt) | `https://raw.githubusercontent.com/owid/co2-data/master/owid-co2-data.csv` — use `iso_code`, `year`, `co2` columns |
| 10 | Global mean sea level (annual, mm above 1993 baseline) | NOAA / NASA — search NOAA Climate.gov "global mean sea level" annual CSV |
| 11 | Mauna Loa annual CO₂ ppm | `https://gml.noaa.gov/webdata/ccgg/trends/co2/co2_annmean_mlo.csv` |

Clean each into a minimal CSV with only the columns needed. Load all into memory at server boot.

Lookup: O(1) by year (or `country:year` for emissions). If a year is missing, linearly interpolate between bracketing values; if no bracket (year before data starts), use earliest available value and mark `confidence: low` with `reason: "interpolated"` or `reason: "before-data-start"`.

**Refresh policy** (bake into `scripts/fetch_static_data.ts`):
- Run once during initial setup
- Re-run once a year — NOAA publishes new Mauna Loa annual means in January, OWID refreshes CO₂ data mid-year
- On server boot, check the file's mtime; log a `WARN` if any CSV is older than 12 months (no blocking, just visibility)
- The script should be safely re-runnable: download to a temp path, validate row count and required columns, then atomically replace the existing CSV

## Caching

Cache is **disk-backed** to survive server restarts — critical for exhibit reliability. Use `better-sqlite3` with a single table:

```sql
CREATE TABLE IF NOT EXISTS cache (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,          -- JSON-serialized
  expires_at  INTEGER,                -- Unix epoch seconds, NULL = never expires
  written_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_expires ON cache(expires_at);
```

Module interface in `src/cache/store.ts`:

```ts
interface Cache {
  get<T>(key: string): T | null;
  set<T>(key: string, value: T, ttlSec?: number): void;
  has(key: string): boolean;
  size(): number;
  stats(): { hits: number; misses: number; hitRate: number };
  prune(): void;
}
```

Implementation notes:
- File location: `./data/cache.sqlite` (add to `.gitignore`)
- Open the connection with WAL mode for concurrent reads (`PRAGMA journal_mode = WAL`)
- `set()` is an UPSERT (`INSERT OR REPLACE`)
- Hit/miss counters live in memory and reset on restart — they're for live telemetry, not durability
- `prune()` deletes rows where `expires_at < now`; call once per hour via `setInterval`
- On boot: open the connection, run schema migration (idempotent), log cache size

The on-disk file survives restart. Pre-warm runs accumulate into it. Delete the file to invalidate everything; bump the cache key version (`v1` → `v2`) to invalidate without deleting.

Cache key conventions:
- `geocode:v1:{normalized_query}`
- `hist:raw:v1:{lat_1dp}:{lon_1dp}:{startYear}:{endYear}`
- `hist:stats:v1:{lat_1dp}:{lon_1dp}:{year}`
- `proj:v1:{lat_1dp}:{lon_1dp}:{targetYear}`

## Aggregation logic (cards 1–12)

Given resolved inputs and fetched per-city daily arrays:

| Card | Type | Computation |
|---|---|---|
| 1 | `you` | Passthrough from input — birth city display name + birth date |
| 2 | `birth_year_high` | From birth city daily array, filter to `birth_year`, return `max(tmax)` with its date |
| 3 | `birth_year_low` | Same, but `min(tmin)` |
| 4 | `latest_birthday_high` | From current city daily array, find date `{latest_passed_birthday}`, return that day's `tmax` |
| 5 | `latest_birthday_low` | Same, `tmin` |
| 6 | `summer_span` | For each lived city, compute mean `tmax` over hottest 3-month window (Jun–Aug if `lat >= 0`, Dec–Feb if `lat < 0`). Return `{min: {city, value}, max: {city, value}, span_celsius}` |
| 7 | `winter_span` | Same as card 6 with `tmin` and coldest window |
| 8 | `emissions_change` | `emissions[birth_country][birth_year]` → `emissions[current_country][latest_year]`. Return absolute values + % change |
| 9 | `birth_city_rainfall_change` | From birth city daily precip, mean annual total for birth decade vs latest complete decade. Return both + % change |
| 10 | `sea_level_rise` | `sea_level[birth_year]` → `sea_level[latest_year]`. Return delta in mm |
| 11 | `co2_ppm_change` | `co2[birth_year]` → `co2[latest_year]`. Return delta |
| 12 | `projected_2050_birthday` | From CMIP6 ensemble: min/max across models AND ±7 days around `2050-{birth_month}-{birth_day}`. Return `{low, high, models_used}` |

Helper: a date in the birth year requires the birth city to have data for that year. If birth year < 1940 (ERA5 floor), use 1940 as the proxy year and flag `confidence: low` with `reason: "pre-satellite-era"`.

## Budgets and timeouts

Global request deadline: **8 seconds**.

Per-tier default timeouts (passed as AbortController signals):
- Geocoding: 1500ms
- Historical weather: 4000ms
- Climate projection: 3000ms
- Static lookups: synchronous, no timeout

Implement as a `Budget` class in `src/lib/budget.ts`:

```ts
const budget = new Budget(8000);
const signal = budget.signal(1500); // child AbortSignal with min(remaining, 1500)
```

If global deadline approaches with cards still pending, return what's resolved with `partial: true` in telemetry. Missing cards get `confidence: "unavailable"` and `reason: "timeout"`.

## Pre-warming

`npm run prewarm`:

1. Loads `prewarm_cities.json` (~150 cities: top 100 Indian by population + top 50 global cities with significant Indian diaspora)
2. For each city, fetches Open-Meteo Historical from 1940-01-01 to today, all three daily variables, in one call
3. Computes per-year stats and writes them to the SQLite cache under both `hist:raw:...` and `hist:stats:...` keys
4. Logs progress as JSON lines
5. Cache persists in `./data/cache.sqlite` automatically — no separate serialization step needed

The script should be idempotent and resumable — on start, query the cache for each city's expected keys and skip cities already fully cached. Surface skip rate in the final log line.

`prewarm_cities.json` format:
```json
[
  { "name": "Mumbai", "displayName": "Mumbai (Bombay), Maharashtra, India", "alternateNames": ["Bombay"], "lat": 19.0760, "lon": 72.8777, "country": "IN" }
]
```

The agent should generate this file with at least 30 starter cities (top Indian metros + a few global). Note to me where I should expand it.

## City alias map

`city_aliases.json`:

```json
{
  "bombay": "Mumbai",
  "madras": "Chennai",
  "calcutta": "Kolkata",
  "bangalore": "Bengaluru",
  "trivandrum": "Thiruvananthapuram",
  "mysore": "Mysuru",
  "mangalore": "Mangaluru",
  "cochin": "Kochi",
  "pondicherry": "Puducherry",
  "calicut": "Kozhikode",
  "poona": "Pune",
  "baroda": "Vadodara",
  "cawnpore": "Kanpur",
  "benares": "Varanasi",
  "saigon": "Ho Chi Minh City",
  "peking": "Beijing"
}
```

Keys are lowercase. Lookup is case-insensitive on the normalized query.

## Telemetry

JSON-line logger to stdout. Every `/kundli` request emits one summary line:

```json
{ "t": "2026-05-12T10:23:11.421Z", "endpoint": "/kundli", "ms": 1247, "fallbacks": [], "cacheHits": 8, "cacheMisses": 2, "partial": false }
```

Every fallback fire emits a line:
```json
{ "t": "...", "resolver": "historical", "city": "Mumbai", "tier_used": 2, "tier_failed": 1, "reason": "cache miss" }
```

Aggregate counters live in memory and surface via `/stats`.

## Error handling rules

- Never throw out of a request handler. Always return 200 with whatever resolved, plus `partial: true` if any card degraded.
- Validate all inputs with Zod; on validation failure return 400 with the issue list.
- For external API errors, retry once with 200ms backoff before falling to the next tier.
- All `fetch` calls must pass an AbortSignal sourced from the global budget.
- Log every caught error with full context (URL, params, response status if any).

## CORS

Enable for all origins during development. Before exhibit, lock to the kiosk origin. Use Hono's CORS middleware.

## Build order

Do these in sequence; each is independently testable:

1. Project skeleton: `package.json`, `tsconfig.json`, Hono app with `/health` route
2. SQLite-backed cache module + vitest tests (interface contract, TTL behavior, prune, restart-persistence verification)
3. Static CSV loaders + `fetch_static_data.ts` script + lookups (cards 8, 10, 11 work end-to-end after this)
4. Budget / AbortController helper
5. Geocoding chain (tiers 1–3; Nominatim later)
6. `GET /geocode` endpoint
7. Historical weather chain (tier 1 + 2 first, then NASA POWER as tier 3 with pre-1981 guard, then nearest-city tier 4)
8. Aggregation functions for cards 2–7, 9 (unit-test each in isolation)
9. Climate projection chain with CMIP6 merge strategy + card 12 aggregation
10. `POST /kundli` orchestration with parallel resolution and budget
11. Telemetry module + `GET /stats`
12. Pre-warm script
13. Hardening: timeouts, retries, partial response paths, Nominatim tier
14. README with setup, prewarm instructions, curl examples, and how to reset cache

## Acceptance criteria

- `POST /kundli` for a Delhi-born person returns all 12 cards in <3s warm, <8s cold
- `POST /kundli` for a tiny Indian village (e.g., Mudunuru) returns at least cards 1, 4, 5, 8, 10, 11 with `confidence: high`; cards 2, 3, 6, 7, 9 either resolve via ERA5 or fall back gracefully
- Cache hit rate >80% after 20 typical requests
- **Cache survives restart**: kill the server, restart, hit `/kundli` for a pre-warmed city → response served from cache (zero upstream calls). Verifiable via `/stats` showing 0 upstream fetches.
- With Open-Meteo blocked (test via env var or mock): NASA POWER tier serves weather cards with <500ms additional latency
- With pre-1981 birth year + Open-Meteo blocked: NASA POWER tier is correctly skipped, tier 4 (nearest pre-warmed city) serves data with `confidence: medium` or `low` and a `reason` field
- With pre-1940 birth year: cards 2, 3 return with `confidence: low` and `reason: "pre-satellite-era"`
- With both Open-Meteo APIs blocked AND no pre-warmed neighbor within 300km: response returns with `confidence: unavailable` + `reason` on affected cards, never a 500
- All `confidence` values in any response are members of the enum `{exact, high, medium, low, unavailable}` — no custom strings
- Pre-warm completes for 150 cities × 85 years in <10 minutes
- Cold server start to `/health` ready: <2s (including SQLite open + static CSV load)
- Server survives 50 concurrent `/kundli` requests without crashing (load test with `autocannon` or similar)
- CMIP6 card 12 returns valid data for Mumbai, São Paulo, and Kolkata (cities where some models historically have gaps)

## Optional enhancement — DO LAST, only after all acceptance criteria pass

### IMD parquet tier for Indian places

The Indian Meteorological Department publishes 0.25° gridded daily data for India (1901–present) that is meaningfully more accurate than ERA5 for monsoon-period rainfall and slightly better for temperature extremes in Indian cities. Adding it as a thin tier improves the scientific defensibility of Indian numbers — especially card 9 (rainfall change) for monsoon-belt cities — without reviving the v0.2-style ingestion nightmare, because all the Python work happens once, offline, and produces a single static file.

**Strict rule: do not begin this until every item under Acceptance Criteria above is passing.** This is purely additive; the system works without it.

Steps when you get to it:

1. **One-time Python preprocessing (outside the runtime).** Download IMD daily rainfall + temperature gridded NetCDF files from IMD Pune for the past ~50 years (1975–present is fine; longer if convenient). Process them into a single parquet file keyed by `(lat_grid, lon_grid, date)` with columns `tmax`, `tmin`, `precip`. Commit as `src/data/imd.parquet`. Expected size: 50–200MB depending on year range. Document the preprocessing script in `scripts/build_imd_parquet.py` but DO NOT call it at runtime.

2. **Runtime read.** At server boot, load `imd.parquet` using `hyparquet` (pure JS, no WASM, no native deps — ideal for this use case since we're building plain JS objects downstream, not consuming Arrow buffers). Add `hyparquet-compressors` for full codec support. Build an in-memory index keyed by `(lat_grid, lon_grid)` → array of daily records, sorted by date. Log the load time and row count on boot. Expect <2s parse time on a 200MB file.

3. **Insert into historical chain as tier 1.5** — between cache and Open-Meteo, *gated* on two conditions: `city.country === "IN"` AND the requested date range intersects IMD coverage:

   | Tier | Method | Notes |
   |---|---|---|
   | 1 | Local SQLite cache | Existing |
   | 1.5 | IMD parquet lookup (Indian cities only, dates within IMD range) | New; `source: "imd"`, `confidence: high` |
   | 2 | Open-Meteo Historical (ERA5) | Existing |
   | 3 | NASA POWER | Existing |
   | 4 | Nearest pre-warmed city | Existing |
   | 5 | Return null | Existing |

4. **Card data attribution.** When IMD serves a card, set `source: "imd"` so the frontend can render appropriate micro-copy ("via Indian Meteorological Department"). The exhibit narrative benefits from showing this.

5. **Acceptance criteria addition** (only after IMD is in):
   - `POST /kundli` for Mumbai or Delhi serves cards 2, 3, 9 from IMD when within IMD coverage
   - Non-Indian cities continue to use ERA5 as before (no regression)
   - Server cold start with IMD parquet loaded: <4s

**Skip entirely if exhibit is less than a week out.** The accuracy delta is small for temperature cards (cards 2–7); it matters most for card 9 (rainfall change), and only for Indian monsoon-belt cities. Building this is a half-day to a full day of Python + a small amount of Node integration — not catastrophic but not free.

## What to ask me before starting

1. Confirm Node + Hono + TS is acceptable, or propose a swap
2. Confirm the static data sources (sea level especially — propose a final URL if NOAA/NASA option isn't obvious)
3. Confirm the prewarm city list expansion strategy: I can paste a CSV of top Indian cities if helpful

After my answers, build in the order above and check in after each numbered step is working.
