import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { VaultRecord } from '../crypto/vault'

const DB_NAME = 'firma-pdf'
const DB_VERSION = 2
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
      // Migra el certificado único de la versión 1 a la lista de certificados.
      if (oldVersion < 2 && db.objectStoreNames.contains(LEGACY_STORE)) {
        const vault = await tx.objectStore(LEGACY_STORE).get(LEGACY_KEY)
        if (vault) {
          await tx.objectStore(STORE).put({
            id: newId(),
            nombre: 'Certificado 1',
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

export function deleteCert(id: string): Promise<void> {
  return withDb((db) => db.delete(STORE, id))
}
