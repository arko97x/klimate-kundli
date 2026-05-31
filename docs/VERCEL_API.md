# Vercel UI + droplet API

The site on **klimate-kundli.vercel.app** is only the frontend. City search and the fan call your API on the droplet via **Cloudflare tunnel**.

## If search says "Search unavailable" or console shows 404 / CORS

Usually the **tunnel URL in Vercel is wrong or stale**, not broken app code.

### On the droplet

```bash
cd /root/klimate-kundli   # or your WorkingDirectory from systemctl

sudo systemctl status klimate-kundli cloudflared-quick

curl -sS http://127.0.0.1:8787/health
curl -sS "http://127.0.0.1:8787/geocode?q=bangalore" | head -c 200

bash deploy/show-tunnel-url.sh
# copy the https://….trycloudflare.com URL

curl -sS "$(bash deploy/show-tunnel-url.sh | head -1)/health"
curl -sS "$(bash deploy/show-tunnel-url.sh | head -1)/geocode?q=bangalore" | head -c 200
```

If **localhost works** but **tunnel fails**:

```bash
sudo systemctl restart klimate-kundli
sudo systemctl restart cloudflared-quick
sleep 5
bash deploy/show-tunnel-url.sh
```

Tunnel URL **changes** when `cloudflared-quick` restarts — you must update Vercel every time (or switch to a named tunnel with a fixed hostname).

### On Vercel

1. Project → **Settings** → **Environment Variables**
2. `VITE_API_URL` = tunnel root only, e.g. `https://movies-allowed-textbook-districts.trycloudflare.com`
   - No trailing `/`
   - Do **not** include `/geocode`
3. **Deployments** → **Redeploy** production (env vars are baked in at build time)
4. Hard refresh the site

### In the browser Network tab

A working search looks like:

`GET https://YOUR-TUNNEL.trycloudflare.com/geocode?q=bangalore` → **200** with JSON `results`.

404 → API not running behind tunnel, or wrong `VITE_API_URL`.  
CORS → tunnel dead / HTML error page (fix tunnel + URL first).
