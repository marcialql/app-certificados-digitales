import { useState } from 'react'
import { listCerts } from './storage/certStore'
import ImportCertificate from './ui/ImportCertificate'
import SignPdf from './ui/SignPdf'
import Sedes from './ui/Sedes'
import Ajustes from './ui/Ajustes'

type View = 'home' | 'import' | 'sign' | 'sedes' | 'ajustes'

export default function App() {
  const [view, setView] = useState<View>('home')

  async function startSigning() {
    let hasCert = false
    try {
      hasCert = (await listCerts()).length > 0
    } catch {
      hasCert = false
    }
    setView(hasCert ? 'sign' : 'import')
  }

  if (view === 'import') return <main><ImportCertificate onDone={() => setView('sign')} onBack={() => setView('home')} /></main>
  if (view === 'sign') {
    return <main><SignPdf onBack={() => setView('home')} onImport={() => setView('import')} /></main>
  }

  if (view === 'sedes') return <main><Sedes onBack={() => setView('home')} /></main>

  if (view === 'ajustes') {
    return <main><Ajustes onBack={() => setView('home')} onImport={() => setView('import')} /></main>
  }

  return (
    <main>
      <h1 className="titulo-inicio">Certificado Digital</h1>
      <nav className="menu-principal">
        <button type="button" className="menu-boton" onClick={startSigning}>Firmar un documento</button>
        <button type="button" className="menu-boton" onClick={() => setView('sedes')}>Qué puedo hacer?</button>
        <button type="button" className="menu-boton" onClick={() => setView('ajustes')}>Ajustes</button>
      </nav>
      <img className="ilustracion-inicio" src="/ilustracion-certificado.svg" alt="" />
      <p className="creditos-pie">Creado por Marcial Quesada López - Noviembre 2026</p>
    </main>
  )
}
