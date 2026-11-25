#!/usr/bin/env bash
# Regenera los PDF de PRUEBA de src/pdf/fixtures. Solo datos de test.
# Uso (desde la raíz del repositorio): bash src/pdf/fixtures/generate.sh
# Requisitos: node (con las dependencias instaladas) y python3 con pypdf (solo para encrypted.pdf).
set -euo pipefail
cd "$(dirname "$0")"
node generate-base.mjs                       # blank.pdf (xref clásica), two-page.pdf (xref en flujo)
python3 -I encrypt.py blank.pdf encrypted.pdf  # PDF protegido con contraseña
node generate-signed.mjs                     # already-signed.pdf = blank.pdf firmado con pades.ts
# Certificado autofirmado (solo el .pem, sin clave) cuyo emisor tiene un RDN multivaluado
# (CN+serialNumber en el mismo SET), para comprobar que issuerSerial copia el issuer byte a byte.
W=$(mktemp -d); trap 'rm -rf "$W"' EXIT
openssl req -x509 -newkey rsa:2048 -nodes -keyout "$W/k.pem" -out multi-rdn-issuer.pem -days 3650 \
  -multivalue-rdn -subj "/C=ES/O=Entidad de Prueba/CN=Emisor de Prueba+serialNumber=IDCES-00000000T" 2>/dev/null
