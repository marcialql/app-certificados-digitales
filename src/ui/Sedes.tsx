import { useState } from 'react'
import raw from '../../data/sedes.json'
import { validateSedes, buildBuscadorUrl, type Sede } from '../sedes/schema'
import { filterSedes } from '../sedes/filter'

const sedes = validateSedes(raw)

/** Icono sencillo por tipo de trámite (trazo, sin logos de organismos). */
const TRAZOS: Record<string, string> = {
  aeat: '<path d="M17 6.5a6 6 0 1 0 0 11"/><path d="M4.5 10h8M4.5 14h8"/>', // impuestos
  'seg-social': '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5"/>', // personas
  sepe: '<rect x="3" y="7" width="18" height="12" rx="2"/><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3 12h18"/>', // empleo
  dgt: '<path d="M3 16v-4l2.5-5h13L21 12v4z"/><circle cx="7" cy="16.5" r="2"/><circle cx="17" cy="16.5" r="2"/>', // vehículos
  catastro: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>', // inmuebles
  fnmt: '<circle cx="8" cy="12" r="4"/><path d="M12 12h9M18 12v3M21 12v2"/>', // certificados
  ayuntamientos: '<path d="M3 21V9l9-5 9 5v12"/><path d="M9 21v-6h6v6"/>', // ayuntamiento
}
const TRAZO_GENERAL = '<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/>'

function Icono({ id }: { id: string }) {
  return (
    <span className="sede-icono" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
        dangerouslySetInnerHTML={{ __html: TRAZOS[id] ?? TRAZO_GENERAL }} />
    </span>
  )
}

function Buscador({ sede }: { sede: Sede }) {
  const [municipio, setMunicipio] = useState('')
  const [error, setError] = useState('')

  function abrir(e: React.FormEvent) {
    e.preventDefault()
    try {
      const url = buildBuscadorUrl(sede.plantilla!, municipio)
      setError('')
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch {
      setError('Escribe el nombre de tu municipio.')
    }
  }

  return (
    <form onSubmit={abrir}>
      <label>
        Municipio
        <input value={municipio} onChange={(e) => setMunicipio(e.target.value)} />
      </label>
      <button type="submit">Buscar sede</button>
      {error && <p role="alert">{error}</p>}
    </form>
  )
}

export default function Sedes({ onBack }: { onBack?: () => void }) {
  const [query, setQuery] = useState('')
  const visibles = filterSedes(sedes, query)
  const grupos = new Map<string, Sede[]>()
  for (const s of visibles) {
    const g = grupos.get(s.categoria) ?? []
    g.push(s)
    grupos.set(s.categoria, g)
  }

  return (
    <section>
      <h1>Sedes electrónicas</h1>
      {onBack && <button type="button" className="boton-secundario" onClick={onBack}>Salir</button>}
      <label>
        Buscar sede
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      {visibles.length === 0 && <p>No hay sedes que coincidan con la búsqueda.</p>}
      {[...grupos].map(([categoria, items]) => (
        <section key={categoria}>
          <h2>{categoria}</h2>
          <ul>
            {items.map((s) => (
              <li key={s.id} className={s.tipo === 'buscador' ? undefined : 'sede-item'}>
                {s.tipo === 'buscador' ? (
                  <>
                    <h3>{s.nombre}</h3>
                    <p>{s.descripcion}</p>
                    <Buscador sede={s} />
                  </>
                ) : (
                  <a className="sede-boton" href={s.url} target="_blank" rel="noopener noreferrer">
                    <Icono id={s.id} />
                    <span className="sede-texto">
                      <strong>{s.nombre}</strong>
                      <small>{s.descripcion}</small>
                    </span>
                    <span className="sede-flecha" aria-hidden="true">›</span>
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </section>
  )
}
