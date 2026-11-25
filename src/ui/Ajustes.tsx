import { useEffect, useState } from 'react'
import { deleteCert, listCerts, type CertEntry } from '../storage/certStore'

type Props = { onBack: () => void; onImport: () => void }

export default function Ajustes({ onBack, onImport }: Props) {
  const [certs, setCerts] = useState<CertEntry[] | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function recargar() {
    return listCerts()
      .then(setCerts)
      .catch(() => {
        setCerts([])
        setError('No se pudieron leer los certificados guardados.')
      })
  }

  useEffect(() => {
    recargar()
  }, [])

  async function handleDelete(id: string) {
    setBusy(true)
    setError('')
    try {
      await deleteCert(id)
      setConfirmId(null)
      await recargar()
    } catch {
      setError('No se pudo borrar el certificado. Inténtalo de nuevo.')
    } finally {
      setBusy(false)
    }
  }

  const aBorrar = certs?.find((c) => c.id === confirmId)

  return (
    <section>
      <h2>Ajustes</h2>
      <h3>Certificados guardados</h3>
      {certs && certs.length === 0 && <p>No hay certificados guardados en este móvil.</p>}
      {certs && certs.length > 0 && (
        <ul className="lista-certificados">
          {certs.map((c) => (
            <li key={c.id}>
              <span>{c.nombre || 'Certificado sin nombre'}</span>{' '}
              <button
                type="button"
                className="boton-peligro"
                disabled={busy}
                onClick={() => setConfirmId(c.id)}
              >
                Borrar
              </button>
            </li>
          ))}
        </ul>
      )}
      {aBorrar && (
        <div role="alertdialog" aria-label="Confirmar borrado">
          <p>¿Borrar «{aBorrar.nombre || 'este certificado'}» de este móvil? Tendrás que importarlo otra vez para firmar con él.</p>
          <button type="button" className="boton-peligro" disabled={busy} onClick={() => handleDelete(aBorrar.id)}>Sí, borrar</button>
          <button type="button" className="boton-secundario" disabled={busy} onClick={() => setConfirmId(null)}>Cancelar</button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      <button type="button" onClick={onImport}>Importar otro certificado</button>
      <button type="button" className="boton-secundario" onClick={onBack}>Salir</button>
    </section>
  )
}
