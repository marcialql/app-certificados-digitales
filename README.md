# Firma PDF con certificado digital (PWA)

PWA para firmar PDF con firma PAdES usando un certificado `.p12`/`.pfx`. Todo el
procesado de PDF y certificados ocurre en el navegador; el servidor solo sirve la app.
Los avisos se retiraron: quien quiera notificaciones electrónicas debe darse de alta
en el Punto de Acceso General (DEHú). Diseño y plan completos en `docs/superpowers/`.

Proyecto movido desde `~/Downloads/firma-pdf-codigo` el 2026-11-25.

## Comandos

```bash
npm ci                  # instalar dependencias
npm run dev             # desarrollo (Vite)
npx vitest run          # pruebas unitarias y de servidor (46)
npm run build           # build de producción + service worker
npm run lint            # oxlint
npx playwright install chromium   # una vez, si no está instalado
npx playwright test --trace off   # E2E en perfiles iPhone 14 y Pixel 7 (16)
```

Para usar otro binario de Chromium en Playwright: `CHROMIUM_PATH=/ruta/al/binario npx playwright test`.

## Estado (2026-11-25)

| Tarea del plan | Estado |
|---|---|
| 1–10 (andamiaje, cifrado con PIN, PKCS#12, IndexedDB, firma PAdES, flujos, sedes, backend, privacidad) | Implementadas; 46 pruebas unitarias y 16 E2E en verde. Avisos (tarea 9) retirados el 2026-11-25 |
| 5 verificación externa con OpenSSL / pdfsig | Documentada en `src/pdf/fixtures/README.md` |
| 11 despliegue en VPS | **Pendiente**: el dominio `certificados.marcialql.es` está previsto; falta el registro DNS, el acceso SSH al VPS y ejecutar `deploy/deploy.sh` |
| 12 aceptación en iPhone y Android reales | **Pendiente**: prueba manual. Los E2E cubren los perfiles iPhone 14 y Pixel 7 en emulación, no dispositivos reales |

Sedes: las URL de `data/sedes.json` respondieron HTTP 200 el 2026-11-25. El
buscador de ayuntamientos (DuckDuckGo) no se ha verificado.

Dependencias: `npm audit` sin vulnerabilidades. `glob` y `minimatch` van fijados
con `overrides` en `package.json`, porque el arreglo que sugería npm era bajar
`vite-plugin-pwa` a 1.1.0 (cambio mayor). Son dependencias de build, no del
código que se ejecuta en el navegador.

Git: repositorio inicializado. Rama de trabajo `centrar-creditos`; `main` en `origin`.

## Pendiente de decisión

- Acceso al VPS (IP y clave SSH, o confirmar que el administrador ejecuta el despliegue) y registro DNS A de `certificados.marcialql.es`.
- Revisar a mano la entrada de ayuntamientos en `data/sedes.json`.
- Aceptación en dispositivos reales.
