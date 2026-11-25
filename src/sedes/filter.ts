import type { Sede } from './schema'

function norm(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

export function filterSedes(list: Sede[], query: string): Sede[] {
  const q = norm(query).trim()
  if (q === '') return list
  return list.filter((s) => norm(`${s.nombre} ${s.descripcion} ${s.categoria}`).includes(q))
}
