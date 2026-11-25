#!/usr/bin/env bash
# Genera los PKCS#12 de PRUEBA (autofirmados, contraseña "test"). Solo datos de test.
# Uso: bash src/crypto/fixtures/generate.sh
# Se exporta con -legacy (3DES/SHA1) porque node-forge no lee PKCS#12 cifrado con AES.
set -euo pipefail
cd "$(dirname "$0")"
W=$(mktemp -d); trap 'rm -rf "$W"' EXIT

gen() { # nombre  keyUsage  startdate  enddate
  local name=$1 ku=$2 start=$3 end=$4
  cat > "$W/$name.cnf" <<CNF
[ca]
default_ca = CA_default
[CA_default]
database = $W/$name.db
new_certs_dir = $W
serial = $W/$name.srl
default_md = sha256
policy = pol
unique_subject = no
copy_extensions = none
[pol]
commonName = supplied
[req]
distinguished_name = dn
prompt = no
[dn]
CN = Titular de Prueba $name
[ext]
basicConstraints = CA:FALSE
keyUsage = $ku
CNF
  : > "$W/$name.db"; echo 01 > "$W/$name.srl"
  openssl req -new -newkey rsa:2048 -nodes -keyout "$W/$name.key" -out "$W/$name.csr" -config "$W/$name.cnf" 2>/dev/null
  openssl ca -batch -selfsign -config "$W/$name.cnf" -extensions ext -keyfile "$W/$name.key" \
    -in "$W/$name.csr" -out "$W/$name.crt" -startdate "$start" -enddate "$end" -notext 2>/dev/null
  openssl pkcs12 -export -legacy -inkey "$W/$name.key" -in "$W/$name.crt" -out "$name.p12" -passout pass:test
}

gen test-ok "critical,digitalSignature,nonRepudiation" 20200101000000Z 20490101000000Z
gen test-expired "critical,digitalSignature,nonRepudiation" 20200101000000Z 20210101000000Z
gen test-no-signing "critical,keyEncipherment" 20200101000000Z 20490101000000Z
