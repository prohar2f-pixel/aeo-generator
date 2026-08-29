#!/bin/sh
set -eu

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root: sudo deploy/install-vps.sh" >&2
  exit 1
fi

SOURCE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
ENV_DIR=/etc/aeo-analyzer
ENV_FILE=$ENV_DIR/environment
INSTALL_DIR=/opt/aeo-analyzer
RELEASE_ID=$(date -u +%Y%m%dT%H%M%SZ)
RELEASE_DIR=$INSTALL_DIR/releases/$RELEASE_ID

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20 or newer is required." >&2
  exit 1
fi

NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Node.js 20 or newer is required; found $(node --version)." >&2
  exit 1
fi

install -d -m 0755 "$ENV_DIR"
if [ ! -f "$ENV_FILE" ]; then
  echo "Missing protected $ENV_FILE with OPENROUTER_API_KEY. Create it as root with mode 600, then rerun." >&2
  exit 1
fi
if ! grep -q '^OPENROUTER_API_KEY=..*' "$ENV_FILE"; then
  echo "$ENV_FILE does not define a non-empty OPENROUTER_API_KEY." >&2
  exit 1
fi
chown root:root "$ENV_FILE"
chmod 0600 "$ENV_FILE"

if ! getent group aeo-analyzer >/dev/null 2>&1; then
  groupadd --system aeo-analyzer
fi
if ! id aeo-analyzer >/dev/null 2>&1; then
  useradd --system --gid aeo-analyzer --home-dir "$INSTALL_DIR" --shell /usr/sbin/nologin aeo-analyzer
fi

install -d -m 0755 "$INSTALL_DIR/releases" "$RELEASE_DIR"
cp -a "$SOURCE_DIR/server" "$SOURCE_DIR/worker" "$SOURCE_DIR/package.json" "$SOURCE_DIR/package-lock.json" "$RELEASE_DIR/"
(cd "$RELEASE_DIR" && npm ci --omit=dev --ignore-scripts)
chown -R root:root "$RELEASE_DIR"
find "$RELEASE_DIR" -type d -exec chmod 0755 {} \;
find "$RELEASE_DIR" -type f -exec chmod 0644 {} \;
ln -sfn "$RELEASE_DIR" "$INSTALL_DIR/current.new"
mv -Tf "$INSTALL_DIR/current.new" "$INSTALL_DIR/current"

install -m 0644 "$SOURCE_DIR/deploy/aeo-analyzer.service" /etc/systemd/system/aeo-analyzer.service
install -m 0644 "$SOURCE_DIR/deploy/nginx-aeo-analyzer-http.conf" /etc/nginx/conf.d/aeo-analyzer.conf
install -m 0644 "$SOURCE_DIR/deploy/nginx-aeo-analyzer-location.conf" /etc/nginx/snippets/aeo-analyzer-location.conf

systemctl daemon-reload
systemctl enable aeo-analyzer.service
systemctl restart aeo-analyzer.service
systemctl is-active --quiet aeo-analyzer.service

nginx -t
if grep -Rqs 'snippets/aeo-analyzer-location.conf' /etc/nginx/sites-enabled; then
  systemctl reload nginx
else
  echo "Backend installed. Add this line inside the HTTPS api.aiprohar.ru server block after backing it up:" >&2
  echo "    include /etc/nginx/snippets/aeo-analyzer-location.conf;" >&2
fi

echo "Installed release $RELEASE_ID."
