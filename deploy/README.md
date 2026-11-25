# Despliegue en el VPS de IONOS (guía del administrador)

Destino: https://certificados.marcialql.es, VPS IONOS con IP 217.154.80.225.
Esta carpeta solo contiene configuración; no hay secretos en el repositorio.

Decisión de arquitectura: Nginx hace proxy de todo (`/` y `/api/`) hacia el
proceso Node en 127.0.0.1:3000, que sirve `dist/` y la API (`server/index.ts`).

## 1. DNS
Crear un registro A: `certificados.marcialql.es` -> `217.154.80.225`.

## 2. Requisitos en el VPS
```
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx rsync curl openssl
```
`nginx.conf` usa `http2 on;`, que exige nginx 1.25.1 o superior. Comprueba la
versión con `nginx -v`.

Instalar Node.js (versión LTS compatible con el proyecto) y comprobar `node -v`
y `npm -v`. Abrir en el cortafuegos solo los puertos 22, 80 y 443; el 3000 no
debe quedar expuesto (ver nota de seguridad).

## 3. Crear los secretos (los crea el administrador, nunca se suben a git)
```
sudo install -d -m 750 /etc/ionos-app
npx web-push generate-vapid-keys      # anota Public Key y Private Key
openssl rand -hex 32                  # valor para ADMIN_TOKEN
sudo nano /etc/ionos-app/env
```
Contenido de `/etc/ionos-app/env` (sustituir por los valores generados):
```
VAPID_PUBLIC=
VAPID_PRIVATE=
VAPID_SUBJECT=mailto:tu-correo@ejemplo.es
ADMIN_TOKEN=
SUBS_FILE=/var/lib/ionos-app/subs.json
```
El script ajusta permisos (root:ionos-app, 640).

## 4. Desplegar
Con el repositorio clonado en el VPS:
```
sudo ./deploy/deploy.sh
```
El script es idempotente: se puede repetir para actualizar.

## 5. HTTPS con Let's Encrypt
Con el DNS ya apuntando al VPS. Orden de arranque: el bloque 443 de
`nginx.conf` referencia el certificado, así que hay que obtenerlo antes de
activarlo. Camino principal (primer certificado):
```
sudo certbot certonly --webroot -w /var/www/html -d certificados.marcialql.es
# alternativa sin Nginx en marcha: sudo certbot certonly --standalone -d certificados.marcialql.es
sudo ./deploy/deploy.sh      # instala la config y recarga Nginx con el certificado
```
Alternativa: `sudo certbot --nginx -d certificados.marcialql.es`, válida
cuando ya existe una configuración de Nginx que carga correctamente.
La renovación es automática (temporizador de certbot).

## 6. Verificación
```
curl -sI https://certificados.marcialql.es/ | grep -i strict-transport-security
curl -s https://certificados.marcialql.es/api/vapid-key
systemctl status ionos-app
journalctl -u ionos-app -n 50
```
Esperado: cabecera HSTS presente y JSON con `publicKey`.

Enviar una notificación (sustituir `$ADMIN_TOKEN` por tu valor, sin guardarlo en el historial):
```
curl -X POST https://certificados.marcialql.es/api/notify \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"title":"Aviso","body":"Texto"}'
```

## Nota de seguridad
El servidor (`server/index.ts`) escucha solo en loopback (127.0.0.1) por
defecto; la variable `HOST` permite cambiarlo. Aun así, mantén el puerto 3000
cerrado en el cortafuegos (`ufw allow 22,80,443/tcp`) como defensa en
profundidad.
