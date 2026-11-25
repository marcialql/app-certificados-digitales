# Despliegue en el VPS de IONOS (guía del administrador)

Destino: https://certificados.marcialql.es, VPS IONOS (IP en la configuración privada del administrador).
Esta carpeta solo contiene configuración; no hay secretos en el repositorio.

Decisión de arquitectura: Nginx hace proxy de todo (`/`) hacia el proceso Node
en 127.0.0.1:3000, que sirve `dist/` (`server/index.ts`). No hay API: la app
funciona sin servidor de datos, todo ocurre en el navegador.

## 1. DNS
Crear un registro A: `certificados.marcialql.es` -> la IP del VPS.

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

## 3. Configuración
El servidor no necesita secretos ni variables de entorno: sirve archivos
estáticos. No hace falta crear `/etc/ionos-app/env`.

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
systemctl status ionos-app
journalctl -u ionos-app -n 50
```
Esperado: cabecera HSTS presente y la app cargando en el navegador.

## Nota de seguridad
El servidor (`server/index.ts`) escucha solo en loopback (127.0.0.1) por
defecto; la variable `HOST` permite cambiarlo. Aun así, mantén el puerto 3000
cerrado en el cortafuegos (`ufw allow 22,80,443/tcp`) como defensa en
profundidad.
