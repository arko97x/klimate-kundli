# Klimate Kundli

Exhibition piece for *Data, Otherwise* (VizChitra 2026). Visitors enter their birth date, birth city, and cities they have lived in; the system returns a 12-cell climate "kundli" situating their life inside the planet's recent climate history.

This repository is versioned. The current latest active build is **v0.2**. The original PoC is preserved as **v0.1** for reference and curatorial walkthroughs.

## Versions

| Version | Status | Folder | Notes |
|---|---|---|---|
| 0.1 | Frozen | [`v0.1/`](v0.1/) | Localhost-only PoC. Open-Meteo + NASA POWER live cache. Tagged `v0.1.0`. |
| 0.2 | Active (alpha) | [`v0.2/`](v0.2/) | Aggregate-first DB. Supabase serving + R2 archive + Python ingest workers. |

Source of truth for "what is latest": [`versions.json`](versions.json).

## Routing

`Caddyfile` at the repo root routes both versions:

- `/` → v0.2 (latest)
- `/0.2/` and `/0.2/...` → 301 → `/` (canonical at root)
- `/0.1/` and `/0.1/...` → frozen v0.1 web
- `/api/...` → v0.2 API
- `/0.1/api/...` → v0.1 API (proxied through Vite under the `/0.1/` base)

The same Caddyfile is used for local dev (port `8080`) and production (drop-in friendly). Production tweaks live in [`v0.2/infra/`](v0.2/infra/).

## Local dev

You'll need [Caddy](https://caddyserver.com/docs/install) on your path.

In four terminals:

```bash
# v0.1 (frozen)
cd v0.1 && npm install
npm run dev:server   # http://localhost:3001
npm run dev:web      # http://localhost:5173 (served under /0.1/ base)

# v0.2 (active)
cd v0.2 && npm install
npm run dev:api      # http://localhost:3002
npm run dev:web      # http://localhost:5174

# Caddy fronting both
caddy run --config Caddyfile
# open http://localhost:8080
```

You don't need to run v0.1 unless you want `/0.1/` to work. v0.2 alone is enough for active development.

## Reference materials

These live at the repo root and are version-agnostic:

- `prelim-proposal/` — original concept ideation.
- `revised_clarified-concept-note.pdf` — current concept note.
- `feedback-from-curatorial-team.png` — feedback from curatorial team.
- `guide/` — supporting reference imagery.
- `docs/` — cross-version working documents.

## Contributing

For the time being:

- Don't modify `v0.1/`. It's frozen at `v0.1.0`.
- All new work goes under `v0.2/`.
- See [`v0.2/README.md`](v0.2/README.md) for the active build's architecture and roadmap.
