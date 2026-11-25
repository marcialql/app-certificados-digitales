import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import type { VaultRecord } from '../crypto/vault'
import { addCert, deleteCert, listCerts } from './certStore'

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
function plain(r: VaultRecord) {
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
  it('devuelve una lista vacía si no hay nada guardado', async () => {
    expect(await listCerts()).toEqual([])
  })

  it('guarda varios certificados con su nombre y los lista', async () => {
    const id1 = await addCert('Personal', record(1))
    const id2 = await addCert('Empresa', record(2))
    const lista = await listCerts()
    expect(lista.map((c) => c.id)).toEqual([id1, id2])
    expect(lista.map((c) => c.nombre)).toEqual(['Personal', 'Empresa'])
    expect(plain(lista[0].vault)).toEqual(plain(record(1)))
    expect(plain(lista[1].vault)).toEqual(plain(record(2)))
  })

  it('deleteCert borra solo el certificado indicado', async () => {
    const id1 = await addCert('Personal', record(1))
    await addCert('Empresa', record(2))
    await deleteCert(id1)
    const lista = await listCerts()
    expect(lista.map((c) => c.nombre)).toEqual(['Empresa'])
  })

  it('migra el certificado único de la versión 1 a la lista', async () => {
    // Base de datos tal como la dejaba la versión anterior: store "cert" con clave "cert".
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open('firma-pdf', 1)
      req.onupgradeneeded = () => req.result.createObjectStore('cert')
      req.onsuccess = () => {
        const tx = req.result.transaction('cert', 'readwrite')
        tx.objectStore('cert').put(record(7), 'cert')
        tx.oncomplete = () => { req.result.close(); resolve() }
        tx.onerror = () => reject(tx.error)
      }
      req.onerror = () => reject(req.error)
    })
    const lista = await listCerts()
    expect(lista.map((c) => c.nombre)).toEqual([''])
    expect(plain(lista[0].vault)).toEqual(plain(record(7)))
    // Tras la migración, el store antiguo ya no existe.
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('firma-pdf')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    expect(Array.from(db.objectStoreNames).sort()).toEqual(['ajustes', 'certs'])
    db.close()
  })

  it('no guarda nada en localStorage', async () => {
    await addCert('Personal', record(1))
    expect(Object.keys(localStorage)).toEqual([])
  })
})
