import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export interface StoredSubscription {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

const file = () => process.env.SUBS_FILE ?? './data/subs.json'

function read(): StoredSubscription[] {
  try {
    const data: unknown = JSON.parse(readFileSync(file(), 'utf8'))
    return Array.isArray(data) ? (data as StoredSubscription[]) : []
  } catch {
    return []
  }
}

function write(subs: StoredSubscription[]): void {
  const path = file()
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.tmp`
  writeFileSync(tmp, JSON.stringify(subs), { mode: 0o600 })
  renameSync(tmp, path)
}

export function listSubscriptions(): StoredSubscription[] {
  return read()
}

/** Guarda solo endpoint y claves; sustituye una suscripción previa con el mismo endpoint. */
export function addSubscription(s: StoredSubscription): void {
  const clean: StoredSubscription = {
    endpoint: s.endpoint,
    keys: { p256dh: s.keys.p256dh, auth: s.keys.auth },
  }
  write([...read().filter((x) => x.endpoint !== clean.endpoint), clean])
}

export function removeSubscription(endpoint: string): void {
  write(read().filter((x) => x.endpoint !== endpoint))
}
