// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { allowedOriginsFrom, corsHeaders } from './cors.ts'

describe('CORS', () => {
  it('devuelve cabeceras solo para un origen permitido', () => {
    const h = corsHeaders('https://certificados.marcialql.es', ['https://certificados.marcialql.es'])
    expect(h?.['Access-Control-Allow-Origin']).toBe('https://certificados.marcialql.es')
    expect(h?.Vary).toBe('Origin')
  })
  it('no devuelve cabeceras para un origen ajeno o ausente', () => {
    expect(corsHeaders('https://evil.example', ['https://certificados.marcialql.es'])).toBeNull()
    expect(corsHeaders(undefined, ['https://certificados.marcialql.es'])).toBeNull()
  })
  it('lee ALLOWED_ORIGINS separado por comas', () => {
    expect(allowedOriginsFrom({ ALLOWED_ORIGINS: 'https://a.es, https://b.es ,' })).toEqual(['https://a.es', 'https://b.es'])
    expect(allowedOriginsFrom({})).toEqual([])
  })
})
