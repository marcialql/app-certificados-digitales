export type VaultRecord = {
  v: 1
  salt: Uint8Array
  iv: Uint8Array
  ciphertext: Uint8Array
  iterations: number
}

const ITERATIONS = 600_000
const SALT_BYTES = 16
const IV_BYTES = 12
const MIN_PIN_LENGTH = 6

export class WrongPinError extends Error {
  constructor() {
    super('PIN incorrecto')
    this.name = 'WrongPinError'
  }
}

export function assertValidPin(pin: string): void {
  if (!/^\d*$/.test(pin)) throw new Error('El PIN solo puede contener dígitos')
  if (pin.length < MIN_PIN_LENGTH) {
    throw new Error('El PIN debe tener al menos 6 dígitos')
  }
}

async function deriveKey(
  pin: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function sealBundle(
  plain: Uint8Array,
  pin: string,
): Promise<VaultRecord> {
  assertValidPin(pin)
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const key = await deriveKey(pin, salt, ITERATIONS)
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plain as BufferSource,
  )
  return {
    v: 1,
    salt,
    iv,
    ciphertext: new Uint8Array(encrypted),
    iterations: ITERATIONS,
  }
}

export async function openBundle(
  record: VaultRecord,
  pin: string,
): Promise<Uint8Array> {
  const key = await deriveKey(pin, record.salt, record.iterations)
  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: record.iv as BufferSource },
      key,
      record.ciphertext as BufferSource,
    )
    return new Uint8Array(decrypted)
  } catch {
    throw new WrongPinError()
  }
}
