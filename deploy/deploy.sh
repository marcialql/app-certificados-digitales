#!/usr/bin/env bash
# Despliegue idempotente en el VPS. Ejecutar como root desde una copia del repo:
#   sudo ./deploy/deploy.sh
set -euo pipefail

DOMAIN="certificados.marcialql.es"
APP_DIR="/opt/ionos-app"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

[ "$(id -u)" -eq 0 ] || { echo "Ejecuta como root (sudo)." >&2; exit 1; }

# 1. Usuario de servicio
id ionos-app >/dev/null 2>&1 || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin ionos-app

# 2. Código (sin node_modules; data/sedes.json sí se copia)
install -d -o ionos-app -g ionos-app "$APP_DIR"
if [ "$SRC" != "$APP_DIR" ]; then
  rsync -a --delete --exclude node_modules --exclude .git --exclude test-results "$SRC"/ "$APP_DIR"/
fi
chown -R ionos-app:ionos-app "$APP_DIR"

# 3. Dependencias y compilación de la PWA (dist/)
cd "$APP_DIR"
sudo -u ionos-app npm ci
sudo -u ionos-app npm run build

# 5. systemd
install -m 644 deploy/ionos-app.service /etc/systemd/system/ionos-app.service
systemctl daemon-reload
systemctl enable ionos-app >/dev/null
systemctl restart ionos-app

# 6. Nginx (el bloque 443 necesita el certificado: ver README, paso certbot)
install -m 644 deploy/nginx.conf /etc/nginx/sites-available/ionos-app
ln -sf /etc/nginx/sites-available/ionos-app /etc/nginx/sites-enabled/ionos-app
if [ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
  nginx -t
  systemctl reload nginx
else
  echo "Aún no hay certificado para $DOMAIN: ejecuta certbot (ver README) y vuelve a lanzar este script."
fi
echo "Despliegue terminado."
