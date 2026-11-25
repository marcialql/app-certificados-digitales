# Firma de PDF con certificado digital — PWA familiar: Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar este plan tarea por tarea. Los pasos usan sintaxis de casillas (`- [ ]`) para seguimiento.

**Goal:** Construir una PWA que firma PDF con PAdES usando un certificado `.p12` importado una vez en el navegador, con listado de sedes electrónicas y avisos push, instalable en iPhone y Android sin tiendas.

**Architecture:** Frontend estático (Vite + React + TypeScript) con todo el procesado de PDF y certificados en el navegador; el certificado se guarda cifrado con un PIN en IndexedDB. Backend mínimo (Express) en el VPS solo para servir la app, guardar suscripciones push anónimas y enviar avisos.

**Tech Stack:** Vite, React, TypeScript, vite-plugin-pwa, node-forge (PKCS#12 y CMS), pdf-lib (PDF), idb (IndexedDB), Vitest + fake-indexeddb, Playwright, Express, web-push, helmet, Nginx, Let's Encrypt.

**Spec:** `docs/superpowers/specs/2026-11-22-firma-certificados-pwa-design.md`

## Global Constraints

- Sin tiendas: nada de App Store ni Google Play; distribución solo por URL HTTPS.
- Ningún PDF, certificado, contraseña del `.p12` ni PIN sale del navegador hacia el servidor.
- PIN de la app: mínimo 6 dígitos.
- PBKDF2: SHA-256, 600 000 iteraciones, sal de 16 bytes aleatoria; AES-GCM con IV de 12 bytes aleatorio.
- Firma: PAdES (CMS detached, SHA-256, atributo `signing-certificate-v2`).
- Push en iPhone: solo con la app instalada en pantalla de inicio (iOS 16.4 o superior).
- Textos de interfaz en español, sin jerga.
- No se registran en logs ni en analítica la contraseña del `.p12`, el PIN ni el contenido de los PDF.

## Review Focus

1. **PDF que ya tiene firmas previas:** la nueva firma debe añadirse como actualización incremental sin invalidar las anteriores. Test en Tarea 5.
2. **PIN incorrecto repetido:** debe dar un mensaje claro ("PIN incorrecto") tras cada intento, sin revelar la clave ni bloquear la app sin aviso. Test en Tarea 2 y Tarea 6.
3. **Certificado caducado, aún no válido o sin uso de firma digital:** la app debe avisar y negarse a firmar con explicación. Test en Tarea 3.
4. **PDF grande o protegido con contraseña:** error comprensible, no bloqueo de la pestaña. El hueco de firma tiene tamaño fijo; si la cadena de certificados no cabe, error explícito. Test en Tarea 5.
5. **iPhone sin instalar en pantalla de inicio:** no se ofrece activar avisos y se explica cómo instalarla. Test en Tarea 9.

---

## Estructura de archivos

- `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html` — tooling y PWA (Tarea 1).
- `src/crypto/vault.ts` — cifrado del bundle del certificado con PIN (Tarea 2).
- `src/crypto/pkcs12.ts` — lectura del `.p12` y validación del certificado (Tarea 3).
- `src/storage/certStore.ts` — persistencia IndexedDB del registro cifrado (Tarea 4).
- `src/pdf/pades.ts` — firma PAdES de un PDF (Tarea 5).
- `src/ui/ImportCertificate.tsx`, `src/ui/SignPdf.tsx`, `src/App.tsx` — flujos de importación y firma (Tarea 6).
- `data/sedes.json`, `src/sedes/schema.ts`, `src/ui/Sedes.tsx`, `src/sedes/filter.ts` — listado de sedes (Tarea 7).
- `server/index.ts`, `server/subscriptions.ts`, `server/notify.ts` — backend de avisos (Tarea 8).
- `src/push/subscribe.ts`, `src/push/platform.ts`, `public/sw.js` (generado por el plugin) — cliente de avisos (Tarea 9).
- `e2e/privacy.spec.ts` — prueba de que no hay envío de datos sensibles (Tarea 10).
- `deploy/nginx.conf`, `deploy/ionos-app.service`, `deploy/deploy.sh` — despliegue (Tarea 11).

---

### Task 1: Andamiaje del proyecto y PWA mínima

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`
- Test: `src/app.smoke.test.tsx`

**Interfaces:**
- Consumes: nada.
- Produces: `App` (componente por defecto en `src/App.tsx`), sin props, que renderiza el menú principal con botones "Firmar PDF", "Sedes electrónicas" y "Avisos".

- [ ] **Paso 1: Inicializar el repositorio y dependencias**

Run: `git init && npm create vite@latest . -- --template react-ts && npm i vite-plugin-pwa pdf-lib node-forge idb && npm i -D vitest fake-indexeddb @testing-library/react jsdom @playwright/test`
Expected: `package.json` con las dependencias y sin errores.

- [ ] **Paso 2: Escribir la prueba que falla**

```tsx
// src/app.smoke.test.tsx
it('muestra los tres botones principales', () => {
  render(<App />);
  expect(screen.getByRole('button', { name: 'Firmar PDF' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Sedes electrónicas' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Avisos' })).toBeTruthy();
});
```

- [ ] **Paso 3: Ejecutar y ver que falla**

Run: `npx vitest run src/app.smoke.test.tsx`
Expected: FAIL (el App por defecto de Vite no tiene esos botones).

- [ ] **Paso 4: Implementar `App` y configurar `vite-plugin-pwa`**

Reemplazar el `App` por defecto por el menú de tres botones. En `vite.config.ts` añadir `VitePWA` con `registerType: 'autoUpdate'`, nombre "Firma PDF", `display: 'standalone'`, `lang: 'es'` e iconos 192 y 512 px. Configurar Vitest con entorno `jsdom`.

- [ ] **Paso 5: Ejecutar y ver que pasa**

Run: `npx vitest run && npm run build`
Expected: prueba en verde y build que genera `dist/manifest.webmanifest` y `dist/sw.js`.

- [ ] **Paso 6: Commit**

Run: `git add -A && git commit -m "chore: andamiaje de la PWA de firma"`

---

### Task 2: Cifrado del certificado con PIN

**Files:**
- Create: `src/crypto/vault.ts`
- Test: `src/crypto/vault.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `type VaultRecord = { v: 1; salt: Uint8Array; iv: Uint8Array; ciphertext: Uint8Array; iterations: number }`
  - `sealBundle(plain: Uint8Array, pin: string): Promise<VaultRecord>`
  - `openBundle(record: VaultRecord, pin: string): Promise<Uint8Array>` — lanza `WrongPinError` si el PIN no es correcto.
  - `class WrongPinError extends Error`
  - `assertValidPin(pin: string): void` — lanza `Error` con mensaje en español si el PIN tiene menos de 6 dígitos o contiene algo que no sea dígito.

- [ ] **Paso 1: Escribir las pruebas que fallan**

Casos obligatorios:
- `sealBundle` y luego `openBundle` con el mismo PIN devuelve los mismos bytes.
- `openBundle` con PIN distinto lanza `WrongPinError`.
- Dos llamadas a `sealBundle` con el mismo texto producen `ciphertext` distintos (sal e IV aleatorios).
- `assertValidPin('12345')` lanza error; `assertValidPin('123456')` no lanza.
- Un `ciphertext` alterado un byte lanza `WrongPinError` (GCM detecta la manipulación).

- [ ] **Paso 2: Ejecutar y ver que fallan**

Run: `npx vitest run src/crypto/vault.test.ts`
Expected: FAIL con "sealBundle is not defined" o equivalente.

- [ ] **Paso 3: Implementar**

Usar `crypto.subtle`: `importKey` de PIN con PBKDF2, `deriveKey` a AES-GCM 256 bits, `encrypt`/`decrypt`. La captura de error de `decrypt` se convierte en `WrongPinError`.

- [ ] **Paso 4: Ejecutar y ver que pasan**

Run: `npx vitest run src/crypto/vault.test.ts`
Expected: PASS en los cinco casos.

- [ ] **Paso 5: Commit**

Run: `git add src/crypto && git commit -m "feat: cifrado del certificado con PIN"`

---

### Task 3: Lectura del PKCS#12 y validación del certificado

**Files:**
- Create: `src/crypto/pkcs12.ts`
- Test: `src/crypto/pkcs12.test.ts`
- Fixtures: `src/crypto/fixtures/test-ok.p12` (válido), `test-expired.p12` (caducado), `test-no-signing.p12` (sin `digitalSignature` en keyUsage), contraseña `test` en los tres.

**Interfaces:**
- Consumes: nada.
- Produces:
  - `type Signer = { privateKey: forge.pki.PrivateKey; certificate: forge.pki.Certificate; chain: forge.pki.Certificate[] }`
  - `loadSigner(p12: Uint8Array, password: string, now?: Date): Signer` — lanza `Pkcs12Error` con mensaje en español para: contraseña incorrecta ("La contraseña del certificado no es correcta"), certificado caducado ("El certificado ha caducado el DD/MM/AAAA"), aún no válido, y sin uso de firma digital ("Este certificado no sirve para firmar documentos").
  - `class Pkcs12Error extends Error`

- [ ] **Paso 1: Generar los fixtures con OpenSSL**

Run: generar certificados de prueba con `openssl req -x509` y `openssl pkcs12 -export` (uno con `notAfter` en el pasado, otro con `keyUsage` sin firma). Guardarlos en `src/crypto/fixtures/`.
Expected: tres archivos `.p12` creados.

- [ ] **Paso 2: Escribir las pruebas que fallan**

Casos obligatorios:
- `loadSigner(okP12, 'test')` devuelve `privateKey` y `certificate` con el subject esperado.
- Contraseña errónea lanza `Pkcs12Error` con el texto exacto de contraseña.
- Fixture caducado lanza `Pkcs12Error` que contiene "ha caducado".
- Fixture sin `digitalSignature` lanza `Pkcs12Error` con "no sirve para firmar".
- Con `now` anterior a `notBefore` lanza "aún no es válido".

- [ ] **Paso 3: Ejecutar y ver que fallan**

Run: `npx vitest run src/crypto/pkcs12.test.ts`
Expected: FAIL.

- [ ] **Paso 4: Implementar**

`forge.pkcs12.pkcs12FromAsn1` + `forge.pkcs12.getBags` (shroudedKeyBag y certBag). Validar en este orden: contraseña, fechas, keyUsage. Mapear las excepciones de forge a `Pkcs12Error`.

- [ ] **Paso 5: Ejecutar y ver que pasan**

Run: `npx vitest run src/crypto/pkcs12.test.ts`
Expected: PASS en los cinco casos.

- [ ] **Paso 6: Commit**

Run: `git add src/crypto && git commit -m "feat: lectura de PKCS#12 con validación del certificado"`

---

### Task 4: Persistencia del registro cifrado

**Files:**
- Create: `src/storage/certStore.ts`
- Test: `src/storage/certStore.test.ts`

**Interfaces:**
- Consumes: `VaultRecord` de la Tarea 2.
- Produces:
  - `saveVault(record: VaultRecord): Promise<void>`
  - `loadVault(): Promise<VaultRecord | null>`
  - `deleteVault(): Promise<void>`
  - Almacén IndexedDB `firma-pdf`, clave fija `"cert"`. No guarda nada en `localStorage`.

- [ ] **Paso 1: Escribir las pruebas que fallan**

Con `fake-indexeddb/auto`: guardar y leer devuelve el mismo registro; `deleteVault` deja `loadVault` en `null`; un registro nuevo sobrescribe al anterior; `Object.keys(localStorage)` sigue vacío tras guardar.

- [ ] **Paso 2: Ejecutar y ver que fallan**

Run: `npx vitest run src/storage/certStore.test.ts`
Expected: FAIL.

- [ ] **Paso 3: Implementar con `idb`**

- [ ] **Paso 4: Ejecutar y ver que pasan**

Run: `npx vitest run src/storage/certStore.test.ts`
Expected: PASS.

- [ ] **Paso 5: Commit**

Run: `git add src/storage && git commit -m "feat: almacenamiento IndexedDB del certificado cifrado"`

---

### Task 5: Firma PAdES del PDF

**Files:**
- Create: `src/pdf/pades.ts`
- Test: `src/pdf/pades.test.ts`
- Fixtures: `src/pdf/fixtures/blank.pdf`, `two-page.pdf`, `already-signed.pdf`.

**Interfaces:**
- Consumes: `Signer` de la Tarea 3.
- Produces:
  - `signPdf(pdf: Uint8Array, signer: Signer, opts?: { page?: number; rect?: [number, number, number, number]; reason?: string }): Promise<Uint8Array>`
  - Por defecto: última página, rectángulo en esquina inferior derecha de 180×60 pt.
  - `class PdfSignError extends Error` con mensajes en español para: PDF protegido con contraseña, PDF mayor de 30 MB, cadena de certificados que no cabe en el hueco de firma reservado (tamaño fijo de 16 KB para el CMS).

- [ ] **Paso 1: Escribir las pruebas que fallan**

Casos obligatorios:
- `signPdf(blank)` devuelve un PDF que contiene `/Type /Sig`, `/SubFilter /ETSI.CAdES.detached` y `/ByteRange`.
- El hash SHA-256 de los bytes del `ByteRange` coincide con el contenido del CMS firmado (verificado con `forge.pkcs7` en la prueba).
- `signPdf(already-signed)` conserva los bytes originales como prefijo (actualización incremental) y la firma previa sigue presente.
- `signPdf` sobre un PDF cifrado lanza `PdfSignError` con "protegido con contraseña".
- Cadena de certificados sintéticamente demasiado grande lanza `PdfSignError` con "no cabe".

- [ ] **Paso 2: Ejecutar y ver que fallan**

Run: `npx vitest run src/pdf/pades.test.ts`
Expected: FAIL.

- [ ] **Paso 3: Implementar**

Flujo: 1) cargar el PDF con `pdf-lib`, añadir campo de firma y diccionario `/Sig` con `/Contents` a ceros de 16 KB (32 768 caracteres hex) y `/ByteRange` con placeholder de longitud fija; 2) guardar; 3) calcular SHA-256 sobre el rango de bytes excluido el `/Contents`; 4) crear CMS detached con `forge.pkcs7.createSignedData`, atributos `contentType`, `messageDigest`, `signingTime` y `signingCertificateV2`; 5) rellenar `/Contents` en hex y escribir. El atributo `signingCertificateV2` no existe en forge: añadirlo como atributo ASN.1 manual. Este es el punto de mayor riesgo del plan.

- [ ] **Paso 4: Ejecutar y ver que pasan**

Run: `npx vitest run src/pdf/pades.test.ts`
Expected: PASS en los cinco casos.

- [ ] **Paso 5: Verificación externa**

Run: `openssl cms -verify -binary -in <contenido-firmado>.p7 -content <rango-bytes>.bin -CAfile <ca-de-prueba.pem> -noverify`
Expected: "Verification successful". Se hace una vez con el fixture generado y queda documentado en el README.

- [ ] **Paso 6: Commit**

Run: `git add src/pdf && git commit -m "feat: firma PAdES de PDF en el navegador"`

---

### Task 6: Flujos de importación y firma con PIN

**Files:**
- Create: `src/ui/ImportCertificate.tsx`, `src/ui/SignPdf.tsx`, `src/ui/PinDialog.tsx`
- Modify: `src/App.tsx` (enrutar a los flujos)
- Test: `e2e/sign-flow.spec.ts`

**Interfaces:**
- Consumes: `loadSigner` (T3), `sealBundle`/`openBundle`/`assertValidPin` (T2), `saveVault`/`loadVault` (T4), `signPdf` (T5).
- Produces: `ImportCertificate` (props: `onDone(): void`), `SignPdf` (props: `onBack(): void`), `PinDialog` (props: `onSubmit(pin: string): void`, `onCancel(): void`, `error?: string`).

- [ ] **Paso 1: Escribir la prueba E2E que falla**

Con Playwright (emulación de iPhone 14 y Pixel 7): importar `test-ok.p12` con contraseña `test` y PIN `123456`; luego firmar `two-page.pdf`; se espera descarga de un PDF que empieza por `%PDF`. Caso adicional: PIN `000000` tras importar muestra "PIN incorrecto" y no firma.

- [ ] **Paso 2: Ejecutar y ver que falla**

Run: `npx playwright test e2e/sign-flow.spec.ts --trace off`
Expected: FAIL.

- [ ] **Paso 3: Implementar**

Importación: selector de archivo `accept=".p12,.pfx"`, pedir contraseña del `.p12`, pedir PIN nuevo (confirmación), `loadSigner` → `sealBundle` → `saveVault`. Firma: si no hay vault, redirigir a importación; si lo hay, pedir PIN → `openBundle` → `JSON.parse` del bundle → `loadSigner(p12, password)` → `signPdf` → descarga. Mensajes de error en español.

Nota de diseño para el implementador: el bundle que se cifra con `sealBundle` es un JSON con `{ p12: <bytes en base64>, password: <contraseña del .p12> }`. Así el PIN protege todo el material y no hace falta guardar nada en claro. El bundle descifrado y la clave solo viven en memoria durante la firma.

- [ ] **Paso 4: Ejecutar y ver que pasa**

Run: `npx playwright test e2e/sign-flow.spec.ts --trace off`
Expected: PASS en ambos perfiles.

- [ ] **Paso 5: Commit**

Run: `git add src/ui e2e/sign-flow.spec.ts && git commit -m "feat: flujos de importación y firma con PIN"`

---

### Task 7: Listado de sedes electrónicas

**Files:**
- Create: `data/sedes.json`, `src/sedes/schema.ts`, `src/sedes/filter.ts`, `src/ui/Sedes.tsx`
- Test: `src/sedes/sedes.test.ts`

**Interfaces:**
- Consumes: `App` (T1) para enrutar.
- Produces:
  - `type Sede = { id: string; tipo?: 'enlace' | 'buscador'; nombre: string; descripcion: string; categoria: string; url?: string; plantilla?: string }`. Si `tipo` falta, se trata como `'enlace'`.
  - `type Buscador` = sede con `tipo: 'buscador'` y `plantilla` que debe contener exactamente `{municipio}`.
  - `validateSedes(data: unknown): Sede[]` — lanza error si falta un campo, si un `id` se repite, si una `url` o `plantilla` no empieza por `https://`, o si un `buscador` no tiene `{municipio}` en la `plantilla`.
  - `buildBuscadorUrl(plantilla: string, municipio: string): string` — sustituye `{municipio}` por el texto codificado con `encodeURIComponent`; rechaza municipios vacíos.
  - `filterSedes(list: Sede[], query: string): Sede[]` — búsqueda sin distinguir mayúsculas ni tildes en nombre, descripción y categoría.
  - `Sedes` (sin props): lista agrupada por categoría con campo de búsqueda; cada sede abre su URL en pestaña nueva con `rel="noopener noreferrer"`.

- [ ] **Paso 1: Escribir las pruebas que fallan**

Casos: `validateSedes` acepta el JSON inicial; rechaza `id` duplicado; rechaza `url` con `http://`; `filterSedes(list, 'seguridad social')` encuentra la sede correspondiente aunque se escriba sin tildes.

- [ ] **Paso 2: Ejecutar y ver que fallan**

Run: `npx vitest run src/sedes/sedes.test.ts`
Expected: FAIL.

- [ ] **Paso 3: Implementar y poblar `data/sedes.json` con una lista inicial de ejemplo**

La lista final la cura el administrador (pendiente en el diseño). Cada URL debe ser oficial y verificada antes de incluirse.

- [ ] **Paso 4: Ejecutar y ver que pasan**

Run: `npx vitest run src/sedes/sedes.test.ts`
Expected: PASS.

- [ ] **Paso 5: Commit**

Run: `git add data src/sedes src/ui/Sedes.tsx && git commit -m "feat: listado de sedes electrónicas"`

---

### Task 8: Backend de avisos y servicio estático

**Files:**
- Create: `server/index.ts`, `server/subscriptions.ts`, `server/notify.ts`
- Test: `server/server.test.ts`

**Interfaces:**
- Consumes: nada del cliente.
- Produces:
  - `GET /api/vapid-key` → `{ publicKey: string }`
  - `POST /api/subscribe` body `PushSubscriptionJSON` → 201. Valida que tenga `endpoint` https y `keys.p256dh` / `keys.auth`. No guarda nombres ni otros datos.
  - `POST /api/notify` header `Authorization: Bearer <ADMIN_TOKEN>`, body `{ title: string; body: string }` (máx. 120 y 500 caracteres) → `{ sent: number; removed: number }`. Compara el token con `crypto.timingSafeEqual`.
  - Elimina suscripciones que devuelvan 404 o 410 del servicio push.
  - Cabeceras con `helmet`: CSP, HSTS, `X-Content-Type-Options`.
  - Sirve `dist/` como estático.
  - `subscriptions.ts`: `addSubscription(s)`, `listSubscriptions()`, `removeSubscription(endpoint)` sobre un archivo JSON en `data/subs.json` (ruta por variable de entorno `SUBS_FILE`).

- [ ] **Paso 1: Escribir las pruebas que fallan (supertest)**

Casos: `/api/notify` sin token → 401; token incorrecto → 401; `/api/subscribe` con endpoint `http://` → 400; cuerpo de aviso de 501 caracteres → 400; respuesta de `/` incluye cabecera `strict-transport-security`; `web-push` simulado devuelve 410 → la suscripción se borra y `removed: 1`.

- [ ] **Paso 2: Ejecutar y ver que fallan**

Run: `npx vitest run server/server.test.ts`
Expected: FAIL.

- [ ] **Paso 3: Implementar**

Claves VAPID desde variables de entorno `VAPID_PUBLIC`, `VAPID_PRIVATE`, `VAPID_SUBJECT`, `ADMIN_TOKEN`. Ningún valor en el código ni en el repositorio.

- [ ] **Paso 4: Ejecutar y ver que pasan**

Run: `npx vitest run server/server.test.ts`
Expected: PASS.

- [ ] **Paso 5: Commit**

Run: `git add server && git commit -m "feat: backend de avisos push y servicio estático"`

---

### Task 9: Cliente de avisos y detección de iOS

**Files:**
- Create: `src/push/platform.ts`, `src/push/subscribe.ts`, `src/ui/Avisos.tsx`
- Test: `src/push/platform.test.ts`, `e2e/notifications.spec.ts`

**Interfaces:**
- Consumes: `/api/vapid-key` y `/api/subscribe` (T8).
- Produces:
  - `type PushState = 'no-soportado' | 'requiere-instalar' | 'pendiente' | 'activo' | 'denegado'`
  - `getPushState(env: { userAgent: string; standalone: boolean; hasPush: boolean; permission: NotificationPermission }): PushState` — en iPhone sin `standalone` devuelve `requiere-instalar`.
  - `enableNotifications(): Promise<void>` — pide permiso, registra en `pushManager.subscribe` con la clave VAPID y envía a `/api/subscribe`.
  - `Avisos` (sin props): muestra el estado y el botón o la instrucción de instalación.

- [ ] **Paso 1: Escribir las pruebas que fallan**

Casos: iPhone (userAgent de iOS 17) sin standalone → `requiere-instalar`; iPhone en standalone con permiso `default` → `pendiente`; Android en navegador con permiso `granted` → `activo`; navegador sin `PushManager` → `no-soportado`.

- [ ] **Paso 2: Ejecutar y ver que fallan**

Run: `npx vitest run src/push/platform.test.ts`
Expected: FAIL.

- [ ] **Paso 3: Implementar**

Texto de instalación en español: "Toca el botón Compartir y elige 'Añadir a pantalla de inicio'".

- [ ] **Paso 4: Ejecutar y ver que pasan**

Run: `npx vitest run src/push/platform.test.ts && npx playwright test e2e/notifications.spec.ts --trace off`
Expected: PASS.

- [ ] **Paso 5: Commit**

Run: `git add src/push src/ui/Avisos.tsx e2e/notifications.spec.ts && git commit -m "feat: cliente de avisos con detección de iPhone"`

---

### Task 10: Prueba de privacidad

**Files:**
- Create: `e2e/privacy.spec.ts`

**Interfaces:**
- Consumes: flujos de T6 y servidor de T8.
- Produces: prueba que falla si cualquier petición saliente durante importación y firma contiene el PDF, el `.p12`, la contraseña o el PIN.

- [ ] **Paso 1: Escribir la prueba**

Playwright intercepta `page.on('request')`; durante el flujo completo recoge `postData()` y busca las cadenas: contraseña del `.p12`, PIN, y los primeros 32 bytes del PDF en base64. Expected de la búsqueda: cero coincidencias.

- [ ] **Paso 2: Ejecutar**

Run: `npx playwright test e2e/privacy.spec.ts --trace off`
Expected: PASS. Si falla, corregir la Tarea 6 antes de continuar.

- [ ] **Paso 3: Commit**

Run: `git add e2e/privacy.spec.ts && git commit -m "test: ninguna petición contiene documentos ni secretos"`

---

### Task 11: Despliegue en el VPS de IONOS

**Files:**
- Create: `deploy/nginx.conf`, `deploy/ionos-app.service`, `deploy/deploy.sh`

**Interfaces:**
- Consumes: `dist/` (T1) y `server/index.ts` (T8).
- Produces: sitio HTTPS en el dominio del administrador; servicio `ionos-app` en systemd escuchando en 127.0.0.1:3000; Nginx como proxy.

- [ ] **Paso 1: Preparar configuración sin secretos**

`ionos-app.service` lee `EnvironmentFile=/etc/ionos-app/env` (fuera del repositorio) con `VAPID_*`, `ADMIN_TOKEN`, `SUBS_FILE`. Nginx: `server_name <DOMINIO>`, redirección a HTTPS, cabecera HSTS.

- [ ] **Paso 2: Bloqueo conocido**

Requiere del administrador: dominio o subdominio y acceso SSH al VPS. Hasta entonces, esta tarea queda pendiente; no se inventa ningún dominio.

- [ ] **Paso 3: Verificación cuando haya dominio**

Run: `curl -sI https://<DOMINIO>/ | grep -i strict-transport-security` y `curl -s https://<DOMINIO>/api/vapid-key`
Expected: cabecera HSTS presente y `publicKey` en JSON.

- [ ] **Paso 4: Commit**

Run: `git add deploy && git commit -m "chore: configuración de despliegue sin secretos"`

---

### Task 12: Aceptación en dispositivos reales

**Files:** ninguno (lista de verificación manual).

**Interfaces:** Consumes todas las tareas anteriores.

- [ ] **Paso 1: iPhone (Safari, iOS 16.4 o superior)**

Abrir el enlace, Compartir → Añadir a pantalla de inicio, abrir desde el icono, importar un `.p12` de prueba, firmar un PDF, descargarlo, activar avisos y recibir un aviso enviado desde `/api/notify`.
Expected: cada paso sin errores; la firma se valida con un visor de PDF.

- [ ] **Paso 2: Android (Chrome)**

Mismos pasos; instalación desde el aviso o el menú de Chrome.
Expected: igual que en iPhone.

- [ ] **Paso 3: Validación de la firma**

Abrir el PDF firmado en Adobe Acrobat Reader y comprobar que aparece la firma válida con el certificado de prueba (o "firma de certificado no confiable" si la CA es de prueba, lo cual es esperado).

---

## Self-Review

**1. Cobertura del diseño:** importación con PIN (T2, T4, T6), validación de certificado (T3), firma PAdES (T5), sedes (T7), avisos push y iOS (T8, T9), privacidad (T10), despliegue (T11), criterios de aceptación (T12). Cubierto.

**2. Pasos:** cada paso es una acción comprobable. Las partes con decisiones abiertas (posición visual de la firma, lista inicial de sedes, dominio) están marcadas como pendientes en lugar de rellenadas.

**3. Consistencia de tipos:** `Signer` (T3) se usa en T5 y T6; `VaultRecord` (T2) se usa en T4 y T6; `PushState` (T9) con los cuatro valores del diseño. Nombres revisados.

**4. Review Focus:** los cinco puntos tienen test en la tarea que los posee (T5 para firmas previas y tamaño, T2/T6 para PIN, T3 para certificado, T9 para iPhone sin instalar).

**5. Proporción:** plan en tareas con interfaces y pruebas nombradas, sin cuerpos de código completos salvo los casos de prueba.

**Riesgos conocidos a vigilar:**
- `signingCertificateV2` en forge no existe de forma nativa: requiere ASN.1 manual (T5). Si resulta inviable, la alternativa es usar una librería PAdES en el navegador o un backend de validación; decidir al llegar a T5.
- Tamaño de la clave `.p12` guardado dentro del PIN-vault: aceptable para certificados habituales.
- iOS puede borrar datos del navegador en sitios que no están en pantalla de inicio; por eso la app se instala ahí.

---

Plan completo guardado en `/home/user/docs/superpowers/plans/2026-11-22-firma-certificados-pwa.md`. Revísalo, por favor.

Hay dos formas de ejecutarlo:

- **Subagentes:** un agente nuevo implementa cada tarea y otro la revisa antes de pasar a la siguiente. Es lo más riguroso, pero consume más.
- **Nativo:** lo implemento yo en esta sesión y al final un revisor independiente revisa todo el conjunto. Es más barato y rápido, pero la revisión independiente llega solo al final.

**Recomiendo subagentes**, porque las tareas dependen de interfaces entre sí (crypto, PDF, UI) y un error de firma en la Tarea 5 sería caro de descubrir tarde. Antes de empezar, tengo que resolver dos cosas que el plan deja pendientes: el dominio para el VPS (Tarea 11) y si la lista inicial de sedes la preparas tú o empiezo con una de ejemplo. ¿Qué método prefieres y me das esos datos?

