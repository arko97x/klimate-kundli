#!/usr/bin/env bash
# Run on the DigitalOcean droplet as root (or with sudo).
#
# Usage (custom domain):
#   sudo bash deploy/setup-droplet.sh \
#     --domain api.yourdomain.com \
#     --user deploy \
#     --app-dir /opt/klimate-kundli
#
# Usage (no domain — sslip.io hostname from droplet IP 157.245.1.2):
#   sudo bash deploy/setup-droplet.sh \
#     --domain 157-245-1-2.sslip.io \
#     --user deploy \
#     --app-dir /opt/klimate-kundli
#
# Prerequisites:
#   - Repo cloned to APP_DIR (git pull before re-running)
#   - Node.js 20+ and npm installed
#   - DOMAIN resolves to this droplet (DNS A record, or sslip.io auto)

set -euo pipefail

DOMAIN=""
APP_USER="deploy"
APP_DIR="/opt/klimate-kundli"

while [[ $# -gt 0 ]]; do
	case "$1" in
	--domain)
		DOMAIN="$2"
		shift 2
		;;
	--user)
		APP_USER="$2"
		shift 2
		;;
	--app-dir)
		APP_DIR="$2"
		shift 2
		;;
	*)
		echo "Unknown argument: $1" >&2
		exit 1
		;;
	esac
done

if [[ -z "$DOMAIN" ]]; then
	echo "Missing --domain (e.g. api.yourdomain.com)" >&2
	exit 1
fi

if [[ ! -d "$APP_DIR" ]]; then
	echo "App directory not found: $APP_DIR" >&2
	exit 1
fi

if ! command -v node >/dev/null 2>&1; then
	echo "Node.js not found. Install Node 20+ first." >&2
	exit 1
fi

echo "==> Building backend in $APP_DIR"
cd "$APP_DIR"
# Skip postinstall scripts (puppeteer browser download is dev-only doc capture).
sudo -u "$APP_USER" npm ci --ignore-scripts
sudo -u "$APP_USER" npm rebuild better-sqlite3
sudo -u "$APP_USER" npm run build

if [[ ! -f "$APP_DIR/.env" ]]; then
	echo "==> Creating $APP_DIR/.env from .env.example"
	cp "$APP_DIR/.env.example" "$APP_DIR/.env"
	chown "$APP_USER:$APP_USER" "$APP_DIR/.env"
fi

mkdir -p "$APP_DIR/data"
chown -R "$APP_USER:$APP_USER" "$APP_DIR/data"

echo "==> Installing systemd unit"
sed \
	-e "s|User=deploy|User=$APP_USER|g" \
	-e "s|Group=deploy|Group=$APP_USER|g" \
	-e "s|WorkingDirectory=/opt/klimate-kundli|WorkingDirectory=$APP_DIR|g" \
	-e "s|EnvironmentFile=-/opt/klimate-kundli/.env|EnvironmentFile=-$APP_DIR/.env|g" \
	"$APP_DIR/deploy/klimate-kundli.service" >/etc/systemd/system/klimate-kundli.service

systemctl daemon-reload
systemctl enable klimate-kundli
systemctl restart klimate-kundli

echo "==> Installing Caddy"
if ! command -v caddy >/dev/null 2>&1; then
	apt-get update
	apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
	curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
	curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
	apt-get update
	apt-get install -y caddy
fi

echo "==> Writing /etc/caddy/Caddyfile"
cat >"/etc/caddy/Caddyfile" <<EOF
$DOMAIN {
	reverse_proxy 127.0.0.1:8787
}
EOF

systemctl enable caddy
systemctl reload caddy

echo "==> Firewall (443/80 public; 8787 localhost only)"
if command -v ufw >/dev/null 2>&1; then
	ufw allow OpenSSH
	ufw allow 80/tcp
	ufw allow 443/tcp
	ufw --force enable
fi

echo "==> Smoke test (local)"
sleep 1
curl -sf "http://127.0.0.1:8787/health" >/dev/null
echo "Local health OK"

echo ""
echo "Done. Next:"
echo "  curl https://$DOMAIN/health"
echo "  Vercel env: VITE_API_URL=https://$DOMAIN"
echo "  After git pull: bash deploy/redeploy-api.sh  (or: npm run redeploy)"
echo "  journalctl -u klimate-kundli -f"
