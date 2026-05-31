# IMD implementation plan

## Goal

For **India** lived cities: fan peak °C from **nearest IMD station** when we have data.  
Everywhere else (or when IMD missing): **ERA5 grid** + plain-language note.

Qualification for “record-hot year” stays **ERA5 annual mean** (top 10 per city since 1940) until we have IMD annual means.

## Layers

```text
┌─────────────────────────────────────────────────────────┐
│ 1. Station map (city lat/lon → IMD station id)          │
│    src/data/imd_station_map.json                        │
│    Built by: npm run imd:build-station-map (needs API)  │
└───────────────────────────┬─────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────┐
│ 2. Annual peaks per station+year (cache / CSV ingest)   │
│    SQLite: imd:peak:v1:{stationId}:{year}               │
│    Or bulk files under data/imd/peaks/ (future)         │
└───────────────────────────┬─────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────┐
│ 3. monthly-delta buildHottestYearsInsight               │
│    IN + cached IMD peak → override blade peakTempC      │
│    blade.peakSource = imd_station | era5_grid           │
└───────────────────────────┬─────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────┐
│ 4. HandFanChart + copy + IMD credit when imd_station    │
└─────────────────────────────────────────────────────────┘
```

## Blocker today

Public IMD API auth must work (`npm run imd:diagnose` → HTTP 200).  
Even then, many endpoints are **current/recent** only — long fan history may need **one-time DSP/archive ingest** into `data/imd/peaks/`.

## Commands

| Command | When |
|---------|------|
| `npm run imd:diagnose` | Auth + IP check |
| `npm run imd:build-station-map` | After auth OK — refresh station list |
| `npm run imd:spike` | Probe history depth per endpoint |

## Env (droplet `.env`)

```env
IMD_API_KEY=...
# optional after IMD confirms format:
# IMD_AUTH_MODE=authorization-raw
```
