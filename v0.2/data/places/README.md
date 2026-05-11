# Place gazetteer

CSV-backed source of truth for places the v0.2 system supports. Loaded into Supabase by `klimate-ingest places-load`.

## Files

| File | Purpose |
|---|---|
| `pilot.csv` | Hand-curated pilot list. ~33 Indian cities + ~34 global cities. Use this for the first ingest pass before scaling to a full gazetteer. |

## Schema

| Column | Type | Notes |
|---|---|---|
| `slug` | text | Stable identifier. lowercase, hyphenated, suffixed with country code (e.g. `kolkata-in`). Treat as PK. |
| `name` | text | Canonical display name in English. |
| `country_code` | text (ISO 3166-1 alpha-2) | e.g. `IN`, `JP`, `US`. |
| `country` | text | English country name. |
| `admin1` | text | First-level admin (state/province/region). |
| `lat` | float | Decimal degrees, WGS84. |
| `lon` | float | Decimal degrees, WGS84. |
| `population` | integer | Approximate metropolitan population. Best-effort, not authoritative. |
| `tier` | integer | 1 = primary pilot. Higher tiers will follow as the gazetteer expands. |
| `aliases` | text | Comma-separated alternative names. Stored as `place_aliases` rows by the loader. |

## Provenance

The pilot list is curated manually for the first ingest pass. It will be superseded by an automated import from a gazetteer source (likely GeoNames `cities1000` / `cities5000` plus an Indian census/IMD station overlay) once the ingest pipeline is proven end-to-end on this small set.

## Conventions

- Coordinates are city centroids, rounded to 4 decimal places (~11 m).
- `slug` MUST be unique. The loader uses it as the upsert key.
- Aliases should include historical names (`Bombay`, `Madras`, `Calcutta`), short forms (`NYC`, `LA`, `Vizag`), and common transliteration variants. Diacritic-stripped variants (e.g. `Sao Paulo` for `São Paulo`) are loaded automatically.
