# Documentation capture

Regenerates screenshots and screen recordings for `/documentation`.

## v0.3.3 (current)

```bash
# terminal 1 — API
npm run dev

# terminal 2 — web
cd web && npm run dev

# terminal 3 — capture (three result screenshots, distinct birth years + cities)
npm run capture:docs -- --only v0-3-3
```

Captures load each scenario with `?birthYear=` (docs capture only) and puppeteer timeline edits for lived cities.

Outputs: `web/public/documentation/v0-3-3/` — `delhi-1988-mumbai.png`, `mumbai-1995-bengaluru.png`, `chennai-1970-delhi-kolkata.png`

## v0.3.2

```bash
# terminal 1 — API
npm run dev

# terminal 2 — web
cd web && npm run dev

# terminal 3 — capture
npm run capture:docs
```

Outputs: `web/public/documentation/v0-3-2/`

## v0.3.1

Check out the dummy UI from commit `1ce7fd8`, serve on a separate port, set `V031_URL`:

```bash
git show 1ce7fd8:web/src/App.tsx  # reference
V031_URL=http://localhost:5175 npm run capture:docs -- --only v0-3-1
```

## v0.1 & v0.2 (archived)

Requires the full archived stack on `retired-0.1-0.2`:

```bash
git worktree add ../klimate-archive retired-0.1-0.2
cd ../klimate-archive
# follow v0.1/README + Caddyfile — http://localhost:8080
V01_URL=http://localhost:8080/0.1/ V02_URL=http://localhost:8080/ npm run capture:docs
```

Recordings use CDP screencast + ffmpeg per [screen capture pipeline](https://www.arccc.co/words/screen-capture-pipeline/).
