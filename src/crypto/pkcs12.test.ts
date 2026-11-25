// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { loadSigner, Pkcs12Error } from './pkcs12'

const fx = (n: string) => new Uint8Array(readFileSync(new URL(`./fixtures/${n}`, import.meta.url)))

describe('loadSigner', () => {
  it('devuelve clave privada y certificado', () => {
    const s = loadSigner(fx('test-ok.p12'), 'test')
    expect(s.privateKey).toBeTruthy()
    expect(s.certificate.subject.getField('CN').value).toBe('Titular de Prueba test-ok')
    expect(s.chain.length).toBeGreaterThanOrEqual(1)
  })

  it('contraseña errónea', () => {
    expect(() => loadSigner(fx('test-ok.p12'), 'mala')).toThrow(Pkcs12Error)
    expect(() => loadSigner(fx('test-ok.p12'), 'mala')).toThrow('La contraseña del certificado no es correcta')
  })

  it('certificado caducado', () => {
    const f = () => loadSigner(fx('test-expired.p12'), 'test', new Date('2026-11-22T00:00:00Z'))
    expect(f).toThrow(Pkcs12Error)
    expect(f).toThrow('El certificado ha caducado el 01/01/2021')
  })

  it('sin digitalSignature', () => {
    const f = () => loadSigner(fx('test-no-signing.p12'), 'test')
    expect(f).toThrow(Pkcs12Error)
    expect(f).toThrow('Este certificado no sirve para firmar documentos')
  })

  it('aún no válido', () => {
    const f = () => loadSigner(fx('test-ok.p12'), 'test', new Date('2019-01-01T00:00:00Z'))
    expect(f).toThrow(Pkcs12Error)
    expect(f).toThrow('aún no es válido')
  })
})
