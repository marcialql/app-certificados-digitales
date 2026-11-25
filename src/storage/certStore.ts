import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { VaultRecord } from '../crypto/vault'

const DB_NAME = 'firma-pdf'
const DB_VERSION = 3
const AJUSTES = 'ajustes'
const FIRMA_KEY = 'firma'
const STORE = 'certs'
const LEGACY_STORE = 'cert'
const LEGACY_KEY = 'cert'

export type CertEntry = {
  id: string
  nombre: string
  creado: string // ISO 8601
  vault: VaultRecord
}

interface FirmaDB extends DBSchema {
  certs: { key: string; value: CertEntry }
  cert: { key: string; value: VaultRecord }
  ajustes: { key: string; value: Uint8Array }
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function open(): Promise<IDBPDatabase<FirmaDB>> {
  return openDB<FirmaDB>(DB_NAME, DB_VERSION, {
    async upgrade(db, oldVersion, _newVersion, tx) {
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(AJUSTES)) {
        db.createObjectStore(AJUSTES)
      }
      // Migra el certificado único de la versión 1 a la lista de certificados.
      if (oldVersion < 2 && db.objectStoreNames.contains(LEGACY_STORE)) {
        const vault = await tx.objectStore(LEGACY_STORE).get(LEGACY_KEY)
        if (vault) {
          await tx.objectStore(STORE).put({
            id: newId(),
            nombre: '', // se completa con el nombre del certificado al desbloquearlo
            creado: new Date().toISOString(),
            vault,
          })
        }
        db.deleteObjectStore(LEGACY_STORE)
      }
    },
  })
}

async function withDb<T>(fn: (db: IDBPDatabase<FirmaDB>) => Promise<T>): Promise<T> {
  const db = await open()
  try {
    return await fn(db)
  } finally {
    db.close()
  }
}

/** Lista los certificados guardados, del más antiguo al más reciente. */
export function listCerts(): Promise<CertEntry[]> {
  return withDb(async (db) => {
    const all = await db.getAll(STORE)
    return all.sort((a, b) => a.creado.localeCompare(b.creado))
  })
}

/** Guarda un certificado nuevo y devuelve su identificador. */
export function addCert(nombre: string, vault: VaultRecord): Promise<string> {
  const id = newId()
  return withDb(async (db) => {
    await db.put(STORE, { id, nombre, creado: new Date().toISOString(), vault })
    return id
  })
}

export function renameCert(id: string, nombre: string): Promise<void> {
  return withDb(async (db) => {
    const entry = await db.get(STORE, id)
    if (entry) await db.put(STORE, { ...entry, nombre })
  })
}

export function deleteCert(id: string): Promise<void> {
  return withDb((db) => db.delete(STORE, id))
}

/** Imagen JPEG de la firma manuscrita, guardada solo en este móvil. */
export function loadFirmaImagen(): Promise<Uint8Array | null> {
  return withDb(async (db) => (await db.get(AJUSTES, FIRMA_KEY)) ?? null)
}

export function saveFirmaImagen(jpg: Uint8Array): Promise<void> {
  return withDb(async (db) => {
    await db.put(AJUSTES, jpg, FIRMA_KEY)
  })
}

export function deleteFirmaImagen(): Promise<void> {
  return withDb((db) => db.delete(AJUSTES, FIRMA_KEY))
}
