# Firma de PDF con certificado digital — PWA familiar

Fecha: 2026-11-22
Estado: propuesta aprobada en su enfoque ("vale"); pendiente de revisión de este documento.

## 1. Intención y porqué

Una app muy sencilla para que familia y conocidos firmen PDF con su certificado digital
desde el móvil (iPhone y Android), sin depender de tiendas de aplicaciones ni de suscripciones.
La app también ofrece un listado curado de sedes electrónicas de interés y un canal de avisos
(notificador) enviados por el administrador (tú).

Éxito: alguien instala la app desde un enlace, importa su certificado una vez, y firma un PDF en
menos de un minuto sin ayuda.

## 2. Objetivos

- Funcionar en iOS (Safari) y Android (Chrome) desde un único código.
- Instalación sin tienda: enlace + "Añadir a pantalla de inicio".
- Importar un certificado `.p12`/`.pfx` una sola vez; la clave privada nunca sale del móvil.
- Firmar PDF con firma PAdES (formato que los visores y sedes reconocen).
- Listado de sedes electrónicas, editable por el administrador.
- Notificaciones push enviadas por el administrador.
- Interfaz para personas no técnicas: pocas pantallas, textos en español, botones grandes.

## 3. No objetivos (v1)

- Publicación en App Store o Google Play.
- Firma en el servidor.
- DNIe por NFC.
- Cuentas de usuario, sincronización en la nube o almacenamiento de documentos.
- Verificación de firmas recibidas (solo firmar).

## 4. Antiobjetivos (fallos aunque "funcione")

- Que un PDF, una clave privada o una contraseña llegue al VPS.
- Que la contraseña del certificado o del PIN se registre en logs, caché o analítica.
- Que la app dependa de un servicio de pago para usarse.

## 5. Restricciones

- Sin cuenta de Apple Developer ni de Google Play: no hay instalación nativa en iPhone.
- iPhone: notificaciones push solo con la PWA instalada en pantalla de inicio (iOS 16.4 o superior).
- Hosting: VPS de IONOS propio, con HTTPS (Let's Encrypt, gratis).
- Los certificados de familia son cualificados (p. ej., FNMT) o similares; la firma debe ser
  válida ante sedes. El formato de firma será PAdES.

## 6. Enfoques considerados

| Enfoque | Pros | Contras | Decisión |
|---|---|---|---|
| App nativa iOS + Android | Llavero/Keystore del sistema, máxima seguridad | iOS sin cuenta de pago caduca cada 7 días; dos códigos | Descartado |
| App Android (APK) + iOS aparte | Android sin coste | Dos códigos; iOS sigue sin solución gratuita | Descartado |
| **PWA única en VPS** | Un código, gratis, sin tiendas, push en iOS 16.4+ | Clave guardada cifrada en el navegador (menos segura que el llavero); firma en JavaScript | **Elegido** |
| DNIe por NFC | Sin archivo de certificado | Solo DNIe 3.0, complejo, requiere app nativa para NFC en iOS | Posterior (v2) |

## 7. Diseño

### 7.1 Stack (decisión propia)

- Frontend: Vite + TypeScript + React, con `vite-plugin-pwa` (service worker, manifiesto).
- Parseo de PKCS#12 y firma CMS: `node-forge`.
- Preparación del PDF: `pdf-lib` (añade campo de firma con placeholder y ByteRange).
- Almacenamiento local: IndexedDB.
- Backend: Node.js mínimo (Express) en el VPS, detrás de Nginx con HTTPS.
- Push: `web-push` (VAPID) en el backend.
- Tests: Vitest (crypto y PDF), Playwright con emulación de iPhone y Android.

### 7.2 Flujo de importación del certificado

1. El usuario abre el `.p12`/`.pfx` (desde correo o Archivos) con el selector de la app.
2. Introduce la contraseña del certificado. La app la usa solo para abrir el PKCS#12.
3. El usuario elige un PIN de la app (6+ dígitos).
4. La app vuelve a cifrar el certificado con AES-GCM. Clave derivada del PIN con PBKDF2
   (≥ 600 000 iteraciones, SHA-256, sal aleatoria). Se guarda solo el cifrado en IndexedDB.
5. Al firmar, se pide el PIN, se descifra en memoria y se borra al terminar.

### 7.3 Flujo de firma

1. Seleccionar PDF (selector de archivos o "Compartir con la app").
2. Elegir posición visual de la firma (opcional, por defecto última página, esquina inferior).
3. Pedir PIN. Calcular firma PAdES (CMS detached, SHA-256) y ensamblar el PDF firmado.
4. Descargar el PDF firmado (o compartir en iOS/Android con la hoja nativa).

### 7.4 Sedes electrónicas

- Lista estática en JSON dentro de la app (`/data/sedes.json`), con nombre, descripción,
  categoría y URL oficial. Editable por el administrador y publicada con cada despliegue.
- Solo enlaces oficiales verificados por el administrador.

### 7.5 Notificador

- Al instalar y aceptar avisos, el navegador registra una suscripción push en el backend.
- El administrador envía mensajes desde un panel protegido o un script local en el VPS.
- Contenido de los avisos: texto genérico, nunca datos de documentos.
- Solo se guardan suscripciones anónimas (endpoint y claves), no nombres.

### 7.6 Seguridad y privacidad

- Todo el procesado de PDF y certificados ocurre en el navegador.
- El backend no recibe documentos, certificados ni PIN.
- Cabeceras de seguridad (CSP, HSTS), HTTPS obligatorio.
- El panel de avisos tiene autenticación (token largo o contraseña + 2FA si se añade).
- Aviso al usuario: la app no sustituye el asesoramiento legal; la validez de la firma depende
  del certificado usado.

### 7.7 Pantallas

1. Inicio: botones grandes "Firmar PDF", "Sedes electrónicas", "Avisos".
2. Importar certificado (solo la primera vez o al cambiarlo).
3. Firmar: elegir PDF → confirmar → PIN → listo.
4. Sedes: lista por categoría con búsqueda.
5. Avisos: historial de mensajes recibidos.
6. Ajustes: cambiar PIN, borrar certificado, activar avisos.

## 8. Lo que queda al constructor (criterio propio)

- Diseño visual concreto y textos finales (en español, tono cercano).
- Algoritmo exacto de posición de la firma visible.
- Formato de la lista de sedes inicial (la curará el administrador).
- Configuración de Nginx, dominio y renovación de HTTPS.

## 9. Pendiente de confirmar por el administrador

- Dominio o subdominio para la app en el VPS.
- Primera lista de sedes electrónicas a incluir.
- Si los avisos son para todos o por grupos.

## 10. Criterios de aceptación

- Se instala en iPhone (Safari, pantalla de inicio) y Android (Chrome) desde un enlace.
- Un certificado de prueba se importa, se cifra y se usa para firmar un PDF.
- La firma PAdES se valida con una herramienta de verificación de PDF.
- Ninguna petición al backend contiene PDF, certificado ni PIN (comprobado con pruebas).
- Un aviso enviado desde el panel llega a un iPhone con la PWA instalada.
