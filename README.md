# Certificado Digital (PWA)

PWA para firmar PDF con firma PAdES usando un certificado `.p12`/`.pfx`. Todo el
procesado de PDF y certificados ocurre en el navegador; el servidor solo sirve la app
y envía avisos push. Diseño y plan completos en `docs/superpowers/`.

Proyecto movido desde `~/Downloads/firma-pdf-codigo` el 2026-11-25.

## Comandos

```bash
npm ci                  # instalar dependencias
npm run dev             # desarrollo (Vite)
npx vitest run          # pruebas unitarias y de servidor (68)
npm run build           # build de producción + service worker
npm run lint            # oxlint
npx playwright install chromium   # una vez, si no está instalado
npx playwright test --trace off   # E2E en perfiles iPhone 14 y Pixel 7 (22)
```

Para usar otro binario de Chromium en Playwright: `CHROMIUM_PATH=/ruta/al/binario npx playwright test`.

## Estado (2026-11-25)

| Tarea del plan | Estado |
|---|---|
| 1–10 (andamiaje, cifrado con PIN, PKCS#12, IndexedDB, firma PAdES, flujos, sedes, backend, avisos, privacidad) | Implementadas; pruebas unitarias y E2E en verde |
| 5 verificación externa con OpenSSL / pdfsig | Documentada en `src/pdf/fixtures/README.md` |
| 11 despliegue en VPS | **Pendiente**: falta dominio y acceso SSH |
| 12 aceptación en iPhone y Android reales | **Pendiente**: prueba manual |

## Pendiente de decisión

- Dominio o subdominio del VPS (Tarea 11).
- Lista definitiva de sedes en `data/sedes.json`: la actual es de ejemplo y las URL deben verificarse antes de publicar. La entrada de ayuntamientos usa un buscador de DuckDuckGo, a revisar.
- Repositorio git: el plan preveía `git init` y commits por tarea; aún no está inicializado.
- Vulnerabilidades moderadas reportadas por `npm audit` (4), sin revisar.
