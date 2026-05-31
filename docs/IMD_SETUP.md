# IMD data — what you need to do

Klimate Kundli can use your **approved IMD API** for Indian cities (hotter peaks on the fan, rainfall for tree-rings). This guide is only the steps **you** do; the repo has scripts for the rest.

---

## 1. Create an API key (one time)

1. Open **https://api.imd.gov.in** and log in (same account as your VizChitra project).
2. Go to **Generate API Key**.
3. Fill in:
   - **Environment:** `Prod` (for the live DigitalOcean server) and/or `Dev` (for your laptop).
   - **Server IP:** your **droplet’s public IPv4** (see step 2 below).
   - **Server name / OS:** anything accurate (e.g. `klimate-kundli`, `Linux`).
4. Click **Generate API Key** and **copy the key once** (you may not see it again).

Repeat with **Dev** + your home IP if you want to test from your Mac.

---

## 2. Find your droplet’s public IP

On the server (SSH) or in the DigitalOcean dashboard:

```bash
curl -4 ifconfig.me
```

Use that IPv4 in the IMD key form.

---

## 3. Put the key on the server (not in chat)

SSH into the droplet, edit the app env file (same place as `CACHE_PATH` / Open-Meteo settings):

```bash
cd /path/to/klimate-kundli   # your deploy folder
nano .env                      # or however you manage env
```

Add:

```env
IMD_API_KEY=paste_your_prod_key_here
```

Save, restart the API process if it’s already running.

**Do not** paste the key in Slack/email to the agent — only on the machine that will call IMD.

**Important:** the `.env` file must live in the **same folder** where you run `npm run imd:spike` (usually the repo root). If you use systemd, that is often `/opt/klimate-kundli/.env` — not a different path unless you run the command from there.

Check the key is visible (shows your key length, not the secret):

```bash
grep IMD_API_KEY .env
```

---

## 4. Run the “spike” (checks what history we can get)

On the **droplet** (so IP matches the Prod key):

```bash
cd /path/to/klimate-kundli   # must contain .env from step 3
npm run imd:spike
```

The spike script reads `.env` from that folder. If it still says “not set”, run once with:

```bash
export $(grep -v '^#' .env | xargs) && npm run imd:spike
```

This writes `data/imd-spike-report.json` and prints a short summary.

**Send the agent:** the printed summary, or the file `data/imd-spike-report.json` (no secrets inside — key is not logged).

---

## 5. Optional: run spike on your Mac (Dev key)

If you created a **Dev** key with your home IP:

```bash
export IMD_API_KEY=your_dev_key
npm run imd:spike
```

---

## Credit line (required by your IMD approval)

When we show IMD-based numbers in the UI, we will include:

> Weather data source: India Meteorological Department, Ministry of Earth Sciences, Government of India. Data processed and visualized by the project creators.

---

## If spike fails

| Message | What to do |
|--------|------------|
| `API key missing` | `IMD_API_KEY` not set, or script not run from the folder that contains `.env` |
| `Authorization header missing or invalid` | Key **is** in `.env` but IMD rejected it. Usually: **(1)** Prod key not registered with **this** server’s public IP, **(2)** Dev key used on droplet (or the reverse), **(3)** wrong header — check the PDF under “API Documentation” on the IMD portal after login |
| `401` / `invalid` | Same as above |

**IP check on droplet:**

```bash
curl -4 ifconfig.me
grep IMD_API_KEY .env
```

The IP from `ifconfig.me` must be exactly what you entered when you generated the **Prod** key. If you edited `.env` in `~/klimate-kundli` but the key was created for a different IP, regenerate the key.

**Quick manual test** (IMD wants the key in `Authorization` **without** `Bearer`):

```bash
cd ~/klimate-kundli   # folder that contains .env
npm run imd:diagnose
```

Or manually:

```bash
KEY=$(grep '^IMD_API_KEY=' .env | cut -d= -f2- | tr -d '"'"'"'')
echo "Key length: ${#KEY}"    # must be > 0 — if 0, fix .env format (see below)
curl -sS -H "Authorization: $KEY" \
  "https://api.imd.gov.in/api/v1/cityforecast?id=42182" | head -c 300
```

**`.env` must look exactly like this** (no spaces around `=`, no `export`):

```env
IMD_API_KEY=paste_your_key_here
```

Wrong: `IMD_API_KEY = xxx` or `export IMD_API_KEY=xxx` — `grep '^IMD_API_KEY='` then leaves `KEY` empty → `API key missing`.

`Authorization: Bearer …` also returns `API key missing` — use raw `Authorization: $KEY` only.

Still failing → email **sankar.nath@imd.gov.in** (template below).

| Empty data | Tell the agent — we may need a different endpoint or a one-time historical dump from IMD |

---

## Current debug status (your droplet)

| Check | Your result |
|-------|-------------|
| `IMD_API_KEY` in `.env` | OK (64 characters) |
| Public IP | `168.144.83.192` — must match **Prod** key on portal |
| `Authorization: <key>` (no Bearer) | Still `API key missing` on all probes |

So the problem is **not** missing `.env` or Bearer format alone. Next: portal key validity, IP on key record, or IMD’s exact header rules (see PDF on portal after login).

### Portal checklist

1. **Your API Keys** table — key **Active**, Environment **Prod**, Server IP = `168.144.83.192`.
2. If unsure — **delete and regenerate** Prod key; paste fresh into `.env` (one line, no quotes).
3. After login, open **API Documentation (PDF)** on [mausam IMD APIs](https://mausam.imd.gov.in/responsive/apis.php) — find the exact auth header example.
4. Optional: **Issue ticket** on IMD API portal with template below.

### Email template (copy/edit)

```
To: sankar.nath@imd.gov.in
Subject: VizChitra 2026 — API key returns "API key missing"

Project: VizChitra 2026 (approved, All Public APIs, non-commercial).
Prod API key (64 chars) + server IP 168.144.83.192.

Request from droplet:
  curl -H "Authorization: <our_api_key>" \
    "https://api.imd.gov.in/api/v1/cityforecast?id=42182"
Response: {"error":"API key missing"}

Please confirm:
1. Exact HTTP header name/format for the generated API key
2. Whether Prod keys require IP 168.144.83.192 on file (confirmed?)
3. Any activation step after key generation

Thank you.
```

### After IMD auth works

```bash
npm run imd:spike    # what history the public APIs expose
npm run imd:diagnose # quick re-check
```

Then we wire peaks + rainfall into the fan / tree-ring (code ready on our side).

---

## What happens after spike works

1. We build a **station map** (your city → nearest IMD station).
2. We **prewarm** IMD data into the same SQLite cache on the droplet (`CACHE_PATH`).
3. The **fan** and future **tree-ring** use IMD for India; other countries keep the grid model + plain-language note.
