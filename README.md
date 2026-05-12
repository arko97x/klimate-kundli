# Klimate Kundli Backend

Thin Node/Hono data pipeline for the Klimate Kundli exhibit. Visitors submit birth date, birth city, and lived cities; the API returns 12 climate cards with source and confidence metadata.

## Run

```bash
npm install
npm run dev
```

Routes:

- `GET /health`
- `GET /geocode?q=mumbai`
- `POST /kundli`
- `GET /stats`

## Data

Static CSVs live in `src/data/`:

- `emissions.csv`: OWID country CO2, cleaned to `country,year,co2_mt`
- `sea_level.csv`: NOAA/NESDIS STAR global mean sea level, seasonal signal removed, rebased to 1993
- `co2_ppm.csv`: NOAA Mauna Loa annual CO2 ppm
- `prewarm_cities.json`: starter city list, currently 35 cities; expand before exhibit
- `city_aliases.json`: old/new city names

Refresh static CSVs yearly:

```bash
npm run fetch:static
```

Warm historical weather cache from 1940 through the latest complete year:

```bash
npm run prewarm
```

Prewarm intentionally waits between large Open-Meteo archive pulls to avoid `429` rate limits. Override only for small smoke tests:

```bash
PREWARM_REQUEST_DELAY_MS=5000 npm run prewarm
```

SQLite cache lives at `data/cache.sqlite`. Reset cache by stopping server and deleting `data/cache.sqlite*`.

## Examples

```bash
curl http://localhost:8787/health
curl "http://localhost:8787/geocode?q=Bombay"
```

```bash
curl -X POST http://localhost:8787/kundli \
  -H "content-type: application/json" \
  -d '{
    "birthDate": "1993-12-10",
    "birthCity": {
      "name": "New Delhi",
      "displayName": "New Delhi, Delhi, India",
      "lat": 28.6139,
      "lon": 77.209,
      "country": "IND"
    },
    "livedCities": [
      {
        "name": "New Delhi",
        "displayName": "New Delhi, Delhi, India",
        "lat": 28.6139,
        "lon": 77.209,
        "country": "IND",
        "start": "1993-12-10",
        "end": null
      }
    ]
  }'
```

## Quality

```bash
npm run build
npm test
```

Current implementation covers cache, static data, geocoding, historical weather fallback, projection fallback, all 12 card aggregations, `/kundli`, `/stats`, and prewarm scaffolding.
