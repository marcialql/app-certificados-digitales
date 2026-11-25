// El paquete cifrado con el PIN: certificado .p12 y su contraseña, en JSON.
export function bytesToBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(s)
}

export function base64ToBytes(b64: string): Uint8Array {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

export function encodeBundle(p12: Uint8Array, password: string): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({ p12: bytesToBase64(p12), password }))
}

export function decodeBundle(plain: Uint8Array): { p12: Uint8Array; password: string } {
  const { p12, password } = JSON.parse(new TextDecoder().decode(plain)) as {
    p12: string
    password: string
  }
  return { p12: base64ToBytes(p12), password }
}
