#!/usr/bin/env bash
# Print the current trycloudflare.com URL from cloudflared-quick logs.

URL="$(journalctl -u cloudflared-quick -n 200 --no-pager 2>/dev/null | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -1 || true)"

if [[ -z "$URL" ]]; then
	echo "No trycloudflare.com URL found. Is cloudflared-quick running?" >&2
	echo "  systemctl status cloudflared-quick" >&2
	exit 1
fi

echo "$URL"
echo ""
echo "Test:       curl $URL/health"
echo "Vercel env: VITE_API_URL=$URL"
