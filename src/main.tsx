import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './styles.css'

// Actualización de la PWA: al abrir la app o volver a ella se comprueba si hay
// versión nueva. Con autoUpdate, la nueva toma el control y la página se recarga
// una sola vez para mostrarla.
if ('serviceWorker' in navigator) {
  let recargando = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (recargando) return
    recargando = true
    window.location.reload()
  })
  const comprobar = () => {
    navigator.serviceWorker.getRegistration().then((r) => r?.update()).catch(() => {})
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') comprobar()
  })
  window.addEventListener('focus', comprobar)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
