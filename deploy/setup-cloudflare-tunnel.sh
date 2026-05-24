#!/usr/bin/env bash
# Cloudflare Tunnel for the Klimate Kundli API (no open inbound ports needed).
#
# Quick mode (no Cloudflare account, URL changes on restart):
#   sudo bash deploy/setup-cloudflare-tunnel.sh --quick
#
# Token mode (stable URL — set Public Hostname in Zero Trust dashboard first):
#   sudo bash deploy/setup-cloudflare-tunnel.sh --token 'eyJhIjoi...'
#
# After quick mode, get the public URL:
#   bash deploy/show-tunnel-url.sh

set -euo pipefail

MODE=""
TOKEN=""

while [[ $# -gt 0 ]]; do
	case "$1" in
	--quick)
		MODE="quick"
		shift
		;;
	--token)
		MODE="token"
		TOKEN="$2"
		shift 2
		;;
	*)
		echo "Unknown argument: $1" >&2
		exit 1
		;;
	esac
done

if [[ -z "$MODE" ]]; then
	echo "Pass --quick or --token '...'" >&2
	exit 1
fi

if [[ "$MODE" == "token" && -z "$TOKEN" ]]; then
	echo "Missing token value after --token" >&2
	exit 1
fi

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"

install_cloudflared() {
	if command -v cloudflared >/dev/null 2>&1; then
		return
	fi
	echo "==> Installing cloudflared"
	ARCH="$(uname -m)"
	case "$ARCH" in
	x86_64) PKG=cloudflared-linux-amd64.deb ;;
	aarch64 | arm64) PKG=cloudflared-linux-arm64.deb ;;
	*)
		echo "Unsupported arch: $ARCH" >&2
		exit 1
		;;
	esac
	curl -fsSL "https://github.com/cloudflare/cloudflared/releases/latest/download/$PKG" -o "/tmp/$PKG"
	dpkg -i "/tmp/$PKG"
}

ensure_api() {
	if ! curl -sf http://127.0.0.1:8787/health >/dev/null 2>&1; then
		echo "API not responding on :8787. Start klimate-kundli first:" >&2
		echo "  systemctl start klimate-kundli" >&2
		exit 1
	fi
}

stop_caddy() {
	# sslip.io / Caddy path not needed with Cloudflare Tunnel.
	if systemctl is-active --quiet caddy 2>/dev/null; then
		echo "==> Stopping Caddy (tunnel replaces it)"
		systemctl disable --now caddy
	fi
}

install_cloudflared
ensure_api
stop_caddy

if [[ "$MODE" == "quick" ]]; then
	echo "==> Installing quick tunnel (trycloudflare.com)"
	cp "$APP_DIR/deploy/cloudflared-quick.service" /etc/systemd/system/cloudflared-quick.service
	systemctl daemon-reload
	systemctl enable cloudflared-quick
	systemctl restart cloudflared-quick

	echo "==> Waiting for tunnel URL..."
	for _ in $(seq 1 30); do
		URL="$(journalctl -u cloudflared-quick -n 80 --no-pager 2>/dev/null | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -1 || true)"
		if [[ -n "$URL" ]]; then
			echo ""
			echo "Tunnel URL: $URL"
			echo "Test:       curl $URL/health"
			echo ""
			echo "Vercel env: VITE_API_URL=$URL"
			echo ""
			echo "NOTE: URL changes if cloudflared-quick restarts. Re-run:"
			echo "  bash deploy/show-tunnel-url.sh"
			exit 0
		fi
		sleep 2
	done

	echo "Tunnel started but URL not in logs yet. Run:" >&2
	echo "  bash deploy/show-tunnel-url.sh" >&2
	exit 1
fi

echo "==> Installing named tunnel from token"
cloudflared service install "$TOKEN"
systemctl enable cloudflared
systemctl restart cloudflared

echo ""
echo "Named tunnel running. Public hostname must be set in Cloudflare Zero Trust dashboard."
echo "Test the hostname you configured, e.g.:"
echo "  curl https://api.yourdomain.com/health"
echo ""
echo "Vercel env: VITE_API_URL=https://<your-public-hostname>"
