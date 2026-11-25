# PDF de prueba para la firma PAdES

Solo datos de test. Ninguno contiene datos reales.

| Fichero | Contenido | Cómo se genera |
|---|---|---|
| `blank.pdf` | 1 página A4, tabla xref clásica, sin `/ID` ni salto de línea tras `%%EOF` | `generate-base.mjs` (pdf-lib, fechas fijas: reproducible byte a byte) |
| `two-page.pdf` | 2 páginas, xref en flujo y flujos de objetos | `generate-base.mjs` |
| `encrypted.pdf` | `blank.pdf` con contraseña de usuario `secreto` (RC4 128) | `encrypt.py` (pypdf) |
| `already-signed.pdf` | `blank.pdf` firmado con `src/pdf/pades.ts` y `test-ok.p12` | `generate-signed.mjs` (lleva la hora actual: no es idéntico entre ejecuciones) |

Regenerar todo: `bash src/pdf/fixtures/generate.sh` (requiere node y python3 con pypdf).

## Verificación externa

`bash src/pdf/fixtures/verify-external.sh [pdf]` extrae de cada firma el CMS de
`/Contents` (recortado a su longitud DER) y los bytes de `/ByteRange`, y ejecuta:

```
openssl cms -verify -binary -inform DER -in sigN.p7 -content sigN.bin -CAfile ca.pem -noverify
```

donde `ca.pem` es el certificado autofirmado de `test-ok.p12`. También ejecuta
`pdfsig` (poppler) si está instalado. Resultado obtenido el 22/11/2026 con OpenSSL 3.0.13
y pdfsig 24.02.0:

- `already-signed.pdf`: `CMS Verification successful`; pdfsig: `Signature is Valid`,
  `Total document signed`.
- `already-signed.pdf` firmado otra vez: las dos firmas dan `CMS Verification successful`;
  pdfsig da `Signature is Valid` en ambas (la primera, `Not total document signed`, como
  corresponde a una actualización incremental).
- `two-page.pdf` (xref en flujo) firmado: `CMS Verification successful`, `Signature is Valid`.

OpenSSL 3 comprueba además el atributo `signingCertificateV2` (hash e `issuerSerial`)
contra el certificado firmante, así que una codificación incorrecta del atributo haría
fallar la verificación. pdfsig indica `Certificate issuer is unknown` porque el
certificado de prueba es autofirmado; no afecta a la validez criptográfica.
