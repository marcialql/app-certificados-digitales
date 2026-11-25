# Firma PDF con certificado digital (PWA)

PWA para firmar PDF con firma PAdES usando un certificado `.p12`/`.pfx`. Todo el
procesado de PDF y certificados ocurre en el navegador; no hay servidor ni API.
Los avisos se retiraron: quien quiera notificaciones electrónicas debe darse de alta
en el Punto de Acceso General (DEHú). Diseño y plan completos en `docs/superpowers/`.

Publicación: GitHub Pages en https://certificados.marcialql.es, desde `main`
(workflow `.github/workflows/pages.yml`).

## Comandos

```bash
npm ci                  # instalar dependencias
npm run dev             # desarrollo (Vite)
npx vitest run          # pruebas unitarias (44)
npm run build           # build de producción + service worker
npm run lint            # oxlint
npx playwright install chromium   # una vez, si no está instalado
npx playwright test --trace off   # E2E en perfiles iPhone 14 y Pixel 7 (20)
```

Para usar otro binario de Chromium en Playwright: `CHROMIUM_PATH=/ruta/al/binario npx playwright test`.

## Estado (2026-11-25)

| Tarea del plan | Estado |
|---|---|
| 1–10 (andamiaje, cifrado con PIN, PKCS#12, IndexedDB, firma PAdES, flujos, sedes, privacidad) | Implementadas; 44 pruebas unitarias y 20 E2E en verde |
| 5 verificación externa con OpenSSL / pdfsig | Documentada en `src/pdf/fixtures/README.md` |
| 11 despliegue | Hecho: GitHub Pages. La guía de VPS y el servidor propio se han eliminado |
| 12 aceptación en iPhone y Android reales | **Pendiente**: prueba manual. Los E2E cubren los perfiles iPhone 14 y Pixel 7 en emulación, no dispositivos reales |

Varios certificados: se pueden guardar varios, cada uno con su nombre y su PIN; al firmar se elige cuál usar. El certificado único de versiones anteriores se migra automáticamente.

Modo claro fijo: fondo blanco y letras negras, ignorando el modo oscuro del sistema.

Sedes: las URL de `data/sedes.json` respondieron HTTP 200 el 2026-11-25.

Dependencias: `npm audit` sin vulnerabilidades. `glob` y `minimatch` van fijados
con `overrides` en `package.json`, porque el arreglo que sugería npm era bajar
`vite-plugin-pwa` a 1.1.0 (cambio mayor). Son dependencias de build, no del
código que se ejecuta en el navegador.

## Pendiente

- Aceptación en dispositivos reales (iPhone y Android).
- La entrada de ayuntamientos de `data/sedes.json` usa un buscador de DuckDuckGo y no se ha verificado.
