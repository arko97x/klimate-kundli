# CLAUDE.md

Klimate Kundli — a museum exhibit that turns a visitor's birth date and lived cities
into 12 "climate cards" (an astrological-style climate horoscope). This repo holds two
apps: a Node/Hono **backend** (repo root) and a React **frontend** (`web/`).

## Tech stack

**Backend** (`src/`, `package.json`)
- Node + TypeScript (ESM, `"type": "module"`), TS config is `NodeNext`.
- [Hono](https://hono.dev) HTTP server via `@hono/node-server`.
- `zod` for request validation.
- `better-sqlite3` as the on-disk response cache (`data/cache.sqlite` + WAL sidecars).
- Optional Supabase Postgres for saved kundlis (falls back to in-memory store).
- `vitest` for tests; `tsx` to run/watch TS directly.
- External data: Open-Meteo archive (historical weather), IMD India API, OWID/NOAA static CSVs.

**Frontend** (`web/`)
- React 19 + Vite 8 + React Router 7.
- Tailwind CSS v4 (`@tailwindcss/vite`), shadcn/ui + `@base-ui/react`, `lucide-react`.
- MDX (`@mdx-js/rollup`) for the documentation page.
- Deployed to Vercel (`web/vercel.json`).

## Folder structure

```
src/                  backend
  index.ts            createApp() — wires cache, resolvers, routes; serve()
  routes/             one Hono route factory per endpoint (createXRoute)
  resolvers/          data sources: geocoding, historical (Open-Meteo), projection, statics, imd/
  aggregations/cards.ts   builds the 12 KundliCard objects
  cache/store.ts      sqlite-backed cache
  storage/            saved-kundli persistence (supabase | in-memory, selected at runtime)
  lib/                pure helpers: budget, csv, grid, haversine, rain-stats, telemetry, slug…
  data/               static CSVs + city/prewarm JSON (shipped, refreshed yearly)
  scripts/            CLI tasks: fetch_static_data, prewarm, imd-* tooling
  types.ts            shared backend types (City, KundliCard, Confidence, Source…)
tests/                vitest suites, one file per area (mirror of src)
web/src/              frontend (App.tsx routes, components/, pages/, expt/, lib/api.ts)
deploy/               droplet systemd unit, Caddy, Cloudflare tunnel, redeploy script
scripts/capture/      puppeteer screenshot/snapshot capture
docs/                 IMD, data sourcing, and Vercel API notes
```

## Run / build / test

**Backend** (from repo root):
```bash
npm install
npm run dev        # tsx watch src/index.ts  (default PORT 8787)
npm test           # vitest run tests
npm run build      # tsc -p tsconfig.build.json -> dist/
npm start          # node dist/index.js
npm run fetch:static   # refresh static CSVs (run yearly)
npm run prewarm        # warm historical weather cache (slow; rate-limited)
```

**Frontend** (from `web/`):
```bash
npm install
npm run dev        # vite
npm run build      # tsc -b && vite build
npm run lint       # eslint
```

Copy `.env.example` to `.env`. Cache defaults to `./data/cache.sqlite`. Saved kundlis,
IMD access, and snapshot capture are all optional (gated by env vars).

## Endpoints

`GET /health` · `GET /geocode?q=` · `POST /kundli` · `GET /kundlis` · `GET /monthly-delta` · `GET /stats`

## Conventions observed

- **ESM with explicit `.js` import extensions** in source (`from "./cache/store.js"`) — required by NodeNext; keep this even though files are `.ts`.
- **Factory pattern**: routes export `createXRoute(deps)`, resolvers export `createXResolver({ cache })`. `createApp(options)` accepts injected deps (cache, geocoder, statics, store) so tests can override them.
- **Dependency injection over globals** — pass `cache`, `telemetry`, `budget`, `today` in rather than importing singletons; this is what makes the suites in `tests/` deterministic.
- TypeScript `strict` mode; `zod` schemas validate all request input (see `routes/kundli.ts`).
- `type`-only imports use `import type`.
- Cards carry `source` + `confidence` metadata; preserve that when adding cards in `aggregations/cards.ts`.
- Frontend uses `@/` path alias and shadcn/ui primitives in `web/src/components/ui/`.

## Key files

- `src/index.ts` — app composition root; start here to trace any request.
- `src/aggregations/cards.ts` — the 12-card business logic.
- `src/routes/kundli.ts` — main endpoint, input schema, card orchestration.
- `src/cache/store.ts` — sqlite cache layer.
- `src/resolvers/imd/` — India Meteorological Dept integration (auth/JWT, stations, client).
- `docs/DATA_SOURCING.md` — Weather and climate data sourcing priorities and fallbacks.
- `web/src/App.tsx` — frontend routes; `web/src/lib/api.ts` — backend client.
- `.cursor/rules/droplet-cache.mdc` — prod droplet SSH host + how to pull the prewarmed cache.
- `deploy/` — production deployment (DigitalOcean droplet, systemd, Cloudflare tunnel).
