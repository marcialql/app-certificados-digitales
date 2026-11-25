#!/usr/bin/env bash
# Verificación externa de las firmas de un PDF firmado con src/pdf/pades.ts.
# Extrae de cada firma el CMS (/Contents) y los bytes cubiertos por /ByteRange y los
# comprueba con `openssl cms -verify`. Si está instalado, también ejecuta `pdfsig` (poppler).
# Uso (desde la raíz del repositorio): bash src/pdf/fixtures/verify-external.sh [pdf]
# Por defecto verifica src/pdf/fixtures/already-signed.pdf con el certificado de prueba test-ok.p12.
set -euo pipefail
FX="$(cd "$(dirname "$0")" && pwd)"
PDF="$(realpath "${1:-$FX/already-signed.pdf}")"
W=$(mktemp -d); trap 'rm -rf "$W"' EXIT

openssl pkcs12 -legacy -in "$FX/../../crypto/fixtures/test-ok.p12" -passin pass:test -nokeys -out "$W/ca.pem" 2>/dev/null

python3 -I - "$PDF" "$W" <<'PY'
import re, sys
pdf = open(sys.argv[1], 'rb').read()
for n, m in enumerate(re.finditer(rb'/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]', pdf)):
    a, b, c, d = map(int, m.groups())
    der = bytes.fromhex(pdf[a + b + 1:c - 1].decode())
    # Recorta el relleno de ceros según la longitud de la cabecera DER
    l = der[1]
    end = 2 + l if l < 0x80 else 2 + (l & 0x7f) + int.from_bytes(der[2:2 + (l & 0x7f)], 'big')
    open(f'{sys.argv[2]}/sig{n}.p7', 'wb').write(der[:end])
    open(f'{sys.argv[2]}/sig{n}.bin', 'wb').write(pdf[a:a + b] + pdf[c:c + d])
    print(f'Firma {n + 1}: ByteRange [{a} {b} {c} {d}], CMS de {end} bytes')
PY

for p7 in "$W"/sig*.p7; do
  openssl cms -verify -binary -inform DER -in "$p7" -content "${p7%.p7}.bin" -CAfile "$W/ca.pem" -noverify -out /dev/null
done
if command -v pdfsig >/dev/null; then pdfsig "$PDF"; fi
