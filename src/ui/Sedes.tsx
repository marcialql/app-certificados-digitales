import { useState } from 'react'
import raw from '../../data/sedes.json'
import { validateSedes, buildBuscadorUrl, type Sede } from '../sedes/schema'
import { filterSedes } from '../sedes/filter'

const sedes = validateSedes(raw)

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
      {onBack && <button type="button" className="boton-secundario" onClick={onBack}>Volver</button>}
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
              <li key={s.id}>
                <h3>{s.nombre}</h3>
                <p>{s.descripcion}</p>
                {s.tipo === 'buscador' ? (
                  <Buscador sede={s} />
                ) : (
                  <a href={s.url} target="_blank" rel="noopener noreferrer">Abrir sede</a>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </section>
  )
}
