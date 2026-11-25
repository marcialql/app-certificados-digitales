# API de avisos en el VPS (puerto 8443)

El VPS comparte IP con vales de riego (Caddy en 80/443). Esta
configuración no usa esos puertos ni toca su stack.

Piezas:
- `ionos-app` (systemd): Node en 127.0.0.1:3000, código de `server/`.
- `ionos-caddy` (Docker, `--network host`): Caddy con el módulo DNS de IONOS,
  escucha en 8443 con certificado de Let's Encrypt por desafío DNS.

Pasos:
1. DNS (IONOS): registro A `api.marcialql.es` -> IP del VPS.
2. Token de API de IONOS DNS en `/etc/ionos-caddy/env` (`IONOS_API_TOKEN=...`, modo 600).
3. `ufw allow 8443/tcp` (no afecta a 80/443).
4. Construir y arrancar:
   `docker build -f deploy/api/Dockerfile.caddy -t ionos-caddy .`
   `docker run -d --name ionos-caddy --restart unless-stopped --network host --env-file /etc/ionos-caddy/env -v /opt/ionos-app/deploy/api/Caddyfile:/etc/caddy/Caddyfile:ro -v ionos_caddy_data:/data ionos-caddy`
5. Variables de `ionos-app` en `/etc/ionos-app/env`: añadir `ALLOWED_ORIGINS=https://certificados.marcialql.es`.

Comprobación: `curl -s https://api.marcialql.es:8443/api/vapid-key`.
