import { describe, expect, it } from 'vitest'
import { WrongPinError, assertValidPin, openBundle, sealBundle } from './vault'

const plain = new Uint8Array([1, 2, 3, 4, 5, 250, 251, 252])

describe('vault', () => {
  it('abre con el mismo PIN y devuelve los mismos bytes', async () => {
    const record = await sealBundle(plain, '123456')
    const opened = await openBundle(record, '123456')
    expect(Array.from(opened)).toEqual(Array.from(plain))
  })

  it('usa los parámetros de cifrado acordados', async () => {
    const record = await sealBundle(plain, '123456')
    expect(record.v).toBe(1)
    expect(record.iterations).toBe(600_000)
    expect(record.salt.length).toBe(16)
    expect(record.iv.length).toBe(12)
  })

  it('lanza WrongPinError con un PIN distinto', async () => {
    const record = await sealBundle(plain, '123456')
    await expect(openBundle(record, '654321')).rejects.toBeInstanceOf(WrongPinError)
    await expect(openBundle(record, '654321')).rejects.toThrow('PIN incorrecto')
  })

  it('produce ciphertext distinto en cada cifrado del mismo texto', async () => {
    const a = await sealBundle(plain, '123456')
    const b = await sealBundle(plain, '123456')
    expect(Array.from(a.ciphertext)).not.toEqual(Array.from(b.ciphertext))
    expect(Array.from(a.salt)).not.toEqual(Array.from(b.salt))
    expect(Array.from(a.iv)).not.toEqual(Array.from(b.iv))
  })

  it('detecta un ciphertext alterado', async () => {
    const record = await sealBundle(plain, '123456')
    const tampered = new Uint8Array(record.ciphertext)
    tampered[0] ^= 0xff
    await expect(
      openBundle({ ...record, ciphertext: tampered }, '123456'),
    ).rejects.toBeInstanceOf(WrongPinError)
  })

  it('valida el PIN', () => {
    expect(() => assertValidPin('12345')).toThrow('El PIN debe tener al menos 6 dígitos')
    expect(() => assertValidPin('12345a')).toThrow('El PIN solo puede contener dígitos')
    expect(() => assertValidPin('123456')).not.toThrow()
  })

  it('sealBundle rechaza un PIN inválido', async () => {
    await expect(sealBundle(plain, '123')).rejects.toThrow('al menos 6 dígitos')
  })
})
