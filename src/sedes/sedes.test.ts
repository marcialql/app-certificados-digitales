import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { validateSedes, buildBuscadorUrl } from './schema'
import { filterSedes } from './filter'

const real = JSON.parse(readFileSync('data/sedes.json', 'utf8'))
const base = { id: 'a', nombre: 'A', descripcion: 'd', categoria: 'c', url: 'https://a.es/' }

describe('validateSedes', () => {
  it('acepta el data/sedes.json real', () => {
    const list = validateSedes(real)
    expect(list.length).toBeGreaterThan(0)
    expect(list.some((s) => s.tipo === 'buscador')).toBe(true)
  })
  it('rechaza id duplicado', () => {
    expect(() => validateSedes([base, { ...base }])).toThrow(/duplicad/i)
  })
  it('rechaza http://', () => {
    expect(() => validateSedes([{ ...base, url: 'http://a.es/' }])).toThrow(/https/)
  })
  it('rechaza buscador sin {municipio}', () => {
    const b = { id: 'b', tipo: 'buscador', nombre: 'B', descripcion: 'd', categoria: 'c', plantilla: 'https://x.es/?q=' }
    expect(() => validateSedes([b])).toThrow(/municipio/)
  })
  it('rechaza campo faltante y no-array', () => {
    expect(() => validateSedes([{ ...base, nombre: undefined }])).toThrow()
    expect(() => validateSedes({})).toThrow()
  })
})

describe('filterSedes', () => {
  const list = validateSedes(real)
  it('ignora tildes y mayúsculas', () => {
    expect(filterSedes(list, 'seguridad social').map((s) => s.id)).toContain('seg-social')
    expect(filterSedes(list, 'TRAFICO').map((s) => s.id)).toContain('dgt')
  })
  it('consulta vacía devuelve todo', () => {
    expect(filterSedes(list, '  ')).toHaveLength(list.length)
  })
})

describe('buildBuscadorUrl', () => {
  it('codifica el municipio', () => {
    expect(buildBuscadorUrl('https://x.es/?q={municipio}', 'Sant Cugat & Co/ñ'))
      .toBe('https://x.es/?q=Sant%20Cugat%20%26%20Co%2F%C3%B1')
  })
  it('rechaza vacío', () => {
    expect(() => buildBuscadorUrl('https://x.es/?q={municipio}', '   ')).toThrow(/municipio/i)
  })
})
