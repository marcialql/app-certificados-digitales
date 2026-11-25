import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import type { VaultRecord } from '../crypto/vault'
import { deleteVault, loadVault, saveVault } from './certStore'

function record(seed: number): VaultRecord {
  return {
    v: 1,
    salt: new Uint8Array([seed, 1, 2, 3]),
    iv: new Uint8Array([seed, 4, 5, 6]),
    ciphertext: new Uint8Array([seed, 7, 8, 9, 10]),
    iterations: 600_000,
  }
}

// fake-indexeddb clona con el realm de Node; en jsdom el Uint8Array resultante
// no es del mismo realm, así que se compara por contenido.
function plain(r: VaultRecord | null) {
  if (!r) return r
  return {
    v: r.v,
    iterations: r.iterations,
    salt: Array.from(r.salt),
    iv: Array.from(r.iv),
    ciphertext: Array.from(r.ciphertext),
  }
}

afterEach(async () => {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase('firma-pdf')
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
    req.onblocked = () => resolve()
  })
})

describe('certStore', () => {
  it('devuelve null si no hay nada guardado', async () => {
    expect(await loadVault()).toBeNull()
  })

  it('guardar y leer devuelve el mismo registro', async () => {
    const r = record(1)
    await saveVault(r)
    expect(plain(await loadVault())).toEqual(plain(r))
  })

  it('deleteVault deja loadVault en null', async () => {
    await saveVault(record(1))
    await deleteVault()
    expect(await loadVault()).toBeNull()
  })

  it('un registro nuevo sobrescribe al anterior', async () => {
    await saveVault(record(1))
    const r2 = record(2)
    await saveVault(r2)
    expect(plain(await loadVault())).toEqual(plain(r2))
  })

  it('no guarda nada en localStorage', async () => {
    await saveVault(record(1))
    expect(Object.keys(localStorage)).toEqual([])
  })
})
