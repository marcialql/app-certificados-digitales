import { useState } from 'react'
import { deleteVault } from '../storage/certStore'

type Props = { onBack: () => void; onDeleted: () => void }

export default function Ajustes({ onBack, onDeleted }: Props) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleDelete() {
    setBusy(true)
    setError('')
    try {
      await deleteVault()
      onDeleted()
    } catch {
      setError('No se pudo borrar el certificado. Inténtalo de nuevo.')
      setBusy(false)
    }
  }

  return (
    <section>
      <h2>Ajustes</h2>
      {!confirming ? (
        <button type="button" className="boton-peligro" onClick={() => setConfirming(true)}>
          Borrar certificado / importar otro
        </button>
      ) : (
        <div role="alertdialog" aria-label="Confirmar borrado">
          <p>¿Borrar el certificado de este móvil? Tendrás que importarlo otra vez para firmar.</p>
          <button type="button" className="boton-peligro" disabled={busy} onClick={handleDelete}>Sí, borrar</button>
          <button type="button" className="boton-secundario" disabled={busy} onClick={() => setConfirming(false)}>Cancelar</button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      <button type="button" className="boton-secundario" onClick={onBack}>Salir</button>
    </section>
  )
}
