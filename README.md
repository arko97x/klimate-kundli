# Klimate Kundli

Exhibition piece for *Data, Otherwise* (VizChitra 2026). Visitors enter their birth date, birth city, and cities they have lived in; the system returns a 12-cell climate "kundli" situating their life inside the planet's recent climate history.

This repository is versioned. **v0.1 and v0.2 are retired** (archived in-repo, not under active development). Rationale: [`docs/RETIREMENT-v0.1-v0.2.md`](docs/RETIREMENT-v0.1-v0.2.md).

## Versions

| Version | Status | Folder | Notes |
|---|---|---|---|
| 0.1 | Retired | [`v0.1/`](v0.1/) | Localhost-only PoC. Open-Meteo + SQLite cache; bundled CSVs. Tagged `v0.1.0`. |
| 0.2 | Retired | [`v0.2/`](v0.2/) | Precomputed DB path: Supabase + R2 + Python ingest. See retirement note. |

Machine-readable copy: [`versions.json`](versions.json) (`latest` is `null` until a new track ships).

## Routing

`Caddyfile` at the repo root routes both versions (unchanged; useful only if you still run the archived stacks locally):

- `/` → v0.2 (last routed “default”)
- `/0.2/` and `/0.2/...` → 301 → `/` (canonical at root)
- `/0.1/` and `/0.1/...` → frozen v0.1 web
- `/api/...` → v0.2 API
- `/0.1/api/...` → v0.1 API (proxied through Vite under the `/0.1/` base)

The same Caddyfile is used for local dev (port `8080`) and production (drop-in friendly). Production tweaks live in [`v0.2/infra/`](v0.2/infra/).

## Local dev

You'll need [Caddy](https://caddyserver.com/docs/install) on your path.

In four terminals:

```bash
# v0.1 (retired archive)
cd v0.1 && npm install
npm run dev:server   # http://localhost:3001
npm run dev:web      # http://localhost:5173 (served under /0.1/ base)

# v0.2 (retired archive)
cd v0.2 && npm install
npm run dev:api      # http://localhost:3002
npm run dev:web      # http://localhost:5174

# Caddy fronting both
caddy run --config Caddyfile
# open http://localhost:8080
```

You don't need to run v0.1 unless you want `/0.1/` to work. v0.2 alone is enough to exercise the v0.2 stack locally.

## Reference materials

These live at the repo root and are version-agnostic:

- `prelim-proposal/` — original concept ideation.
- `revised_clarified-concept-note.pdf` — current concept note.
- `feedback-from-curatorial-team.png` — feedback from curatorial team.
- `guide/` — supporting reference imagery.
- `docs/` — cross-version working documents (includes [`RETIREMENT-v0.1-v0.2.md`](docs/RETIREMENT-v0.1-v0.2.md)).

## Contributing

- **v0.1** — frozen at `v0.1.0`; treat as read-only archive unless you are fixing typos or doc links.
- **v0.2** — retired; no expectation of new feature work in this folder. [`v0.2/README.md`](v0.2/README.md) and [`v0.2/docs/STATE.md`](v0.2/docs/STATE.md) describe what was built.
- **Next direction** — not defined in this repo; a future version would replace `versions.json` `latest` when it exists.
