export type Sede = {
  id: string
  tipo?: 'enlace' | 'buscador'
  nombre: string
  descripcion: string
  categoria: string
  url?: string
  plantilla?: string
}

const MARCA = '{municipio}'

function texto(o: Record<string, unknown>, campo: string, pos: number): string {
  const v = o[campo]
  if (typeof v !== 'string' || v.trim() === '') {
    throw new Error(`Sede ${pos + 1}: falta el campo "${campo}"`)
  }
  return v
}

export function validateSedes(data: unknown): Sede[] {
  if (!Array.isArray(data)) throw new Error('La lista de sedes debe ser un array')
  const ids = new Set<string>()
  return data.map((raw, i) => {
    if (typeof raw !== 'object' || raw === null) throw new Error(`Sede ${i + 1}: formato no válido`)
    const o = raw as Record<string, unknown>
    const id = texto(o, 'id', i)
    const nombre = texto(o, 'nombre', i)
    const descripcion = texto(o, 'descripcion', i)
    const categoria = texto(o, 'categoria', i)
    if (ids.has(id)) throw new Error(`Sede duplicada: el id "${id}" se repite`)
    ids.add(id)
    const tipo = o.tipo === undefined ? 'enlace' : o.tipo
    if (tipo !== 'enlace' && tipo !== 'buscador') {
      throw new Error(`Sede "${id}": tipo no válido`)
    }
    if (tipo === 'buscador') {
      const plantilla = texto(o, 'plantilla', i)
      if (!plantilla.startsWith('https://')) throw new Error(`Sede "${id}": la plantilla debe empezar por https://`)
      if (plantilla.split(MARCA).length !== 2) {
        throw new Error(`Sede "${id}": la plantilla debe contener exactamente ${MARCA}`)
      }
      return { id, tipo, nombre, descripcion, categoria, plantilla }
    }
    const url = texto(o, 'url', i)
    if (!url.startsWith('https://')) throw new Error(`Sede "${id}": la url debe empezar por https://`)
    return { id, tipo, nombre, descripcion, categoria, url }
  })
}

export function buildBuscadorUrl(plantilla: string, municipio: string): string {
  const m = municipio.trim()
  if (m === '') throw new Error('Escribe el nombre de un municipio')
  return plantilla.replace(MARCA, encodeURIComponent(m))
}
