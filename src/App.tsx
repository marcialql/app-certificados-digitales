import { useState } from 'react'
import { loadVault } from './storage/certStore'
import ImportCertificate from './ui/ImportCertificate'
import SignPdf from './ui/SignPdf'
import Sedes from './ui/Sedes'
import Avisos from './ui/Avisos'
import Ajustes from './ui/Ajustes'

type View = 'home' | 'import' | 'sign' | 'sedes' | 'avisos' | 'ajustes'

export default function App() {
  const [view, setView] = useState<View>('home')

  async function startSigning() {
    let hasVault = false
    try {
      hasVault = (await loadVault()) !== null
    } catch {
      hasVault = false
    }
    setView(hasVault ? 'sign' : 'import')
  }

  if (view === 'import') return <main><ImportCertificate onDone={() => setView('sign')} onBack={() => setView('home')} /></main>
  if (view === 'sign') {
    return <main><SignPdf onBack={() => setView('home')} onImport={() => setView('import')} /></main>
  }

  if (view === 'sedes') return <main><Sedes onBack={() => setView('home')} /></main>

  if (view === 'avisos') return <main><Avisos onBack={() => setView('home')} /></main>

  if (view === 'ajustes') {
    return <main><Ajustes onBack={() => setView('home')} onDeleted={() => setView('import')} /></main>
  }

  return (
    <main>
      <h1 className="titulo-inicio">Certificado Digital</h1>
      <nav className="menu-principal">
        <button type="button" className="menu-boton" onClick={startSigning}>Firmar un documento</button>
        <button type="button" className="menu-boton" onClick={() => setView('sedes')}>Qué puedo hacer?</button>
        <button type="button" className="menu-boton" onClick={() => setView('avisos')}>Avisos</button>
        <button type="button" className="menu-boton" onClick={() => setView('ajustes')}>Ajustes</button>
      </nav>
      <img className="ilustracion-inicio" src="/ilustracion-certificado.svg" alt="" />
      <p className="creditos-pie">Ilustración e iconos originales</p>
    </main>
  )
}
