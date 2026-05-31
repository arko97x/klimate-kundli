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

---

## 4. Run the “spike” (checks what history we can get)

On the **droplet** (so IP matches the Prod key):

```bash
cd /path/to/klimate-kundli
npm run imd:spike
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
| `API key missing` | `IMD_API_KEY` not set in `.env` on the machine running the script |
| `401` / `invalid` | Wrong key, or request not from the **whitelisted IP** |
| Empty data | Tell the agent — we may need a different endpoint or a one-time historical dump from IMD |

---

## What happens after spike works

1. We build a **station map** (your city → nearest IMD station).
2. We **prewarm** IMD data into the same SQLite cache on the droplet (`CACHE_PATH`).
3. The **fan** and future **tree-ring** use IMD for India; other countries keep the grid model + plain-language note.
