import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { VaultRecord } from '../crypto/vault'

const DB_NAME = 'firma-pdf'
const STORE = 'cert'
const KEY = 'cert'

interface FirmaDB extends DBSchema {
  cert: { key: string; value: VaultRecord }
}

function open(): Promise<IDBPDatabase<FirmaDB>> {
  return openDB<FirmaDB>(DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore(STORE)
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

export function saveVault(record: VaultRecord): Promise<void> {
  return withDb(async (db) => {
    await db.put(STORE, record, KEY)
  })
}

export function loadVault(): Promise<VaultRecord | null> {
  return withDb(async (db) => (await db.get(STORE, KEY)) ?? null)
}

export function deleteVault(): Promise<void> {
  return withDb((db) => db.delete(STORE, KEY))
}
