import { useEffect, useState } from 'react'
import { getPushState, readPushEnv, type PushState } from '../push/platform'
import { enableNotifications } from '../push/subscribe'

export default function Avisos({ onBack }: { onBack?: () => void }) {
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let vivo = true
    readPushEnv().then((env) => { if (vivo) setState(getPushState(env)) })
    return () => { vivo = false }
  }, [])

  async function activar() {
    setBusy(true)
    setError('')
    try {
      await enableNotifications()
    } catch {
      setError('No se pudieron activar los avisos. Inténtalo de nuevo.')
    } finally {
      setBusy(false)
      setState(getPushState(await readPushEnv()))
    }
  }

  return (
    <section>
      <h1>Avisos</h1>
      {state === 'requiere-instalar' && (
        <p>
          Para recibir avisos en el iPhone, primero instala la app en tu pantalla de inicio.
          Toca el botón Compartir y elige 'Añadir a pantalla de inicio'
        </p>
      )}
      {state === 'no-soportado' && <p>Este navegador no permite recibir avisos.</p>}
      {state === 'denegado' && (
        <p>Has bloqueado los avisos. Para activarlos, cambia el permiso en los ajustes del navegador.</p>
      )}
      {state === 'activo' && <p>Los avisos están activados.</p>}
      {state === 'pendiente' && (
        <button type="button" onClick={activar} disabled={busy}>Activar avisos</button>
      )}
      {error && <p role="alert">{error}</p>}
      {onBack && <button type="button" className="boton-secundario" onClick={onBack}>Volver</button>}
    </section>
  )
}
