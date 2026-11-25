import { useEffect, useState, type ChangeEvent } from 'react'
import { deleteCert, deleteFirmaImagen, listCerts, loadFirmaImagen, saveFirmaImagen, type CertEntry } from '../storage/certStore'
import { imagenAFirmaJpg } from '../pdf/firmaImagen'

type Props = { onBack: () => void; onImport: () => void }

function urlDeFirma(bytes: Uint8Array): string {
  return URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'image/jpeg' }))
}

export default function Ajustes({ onBack, onImport }: Props) {
  const [certs, setCerts] = useState<CertEntry[] | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [firmaUrl, setFirmaUrl] = useState<string | null>(null)
  const [firmaError, setFirmaError] = useState('')

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
    loadFirmaImagen()
      .then((bytes) => {
        if (bytes) setFirmaUrl(urlDeFirma(bytes))
      })
      .catch(() => {})
  }, [])

  // Libera la URL de la imagen al desmontar.
  useEffect(() => () => {
    if (firmaUrl) URL.revokeObjectURL(firmaUrl)
  }, [firmaUrl])

  async function subirFirma(e: ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0]
    e.target.value = ''
    if (!archivo) return
    setFirmaError('')
    try {
      const jpg = await imagenAFirmaJpg(archivo)
      await saveFirmaImagen(jpg)
      setFirmaUrl((antes) => {
        if (antes) URL.revokeObjectURL(antes)
        return urlDeFirma(jpg)
      })
    } catch (err) {
      setFirmaError(err instanceof Error ? err.message : 'No se pudo guardar la imagen de la firma.')
    }
  }

  async function quitarFirma() {
    setFirmaError('')
    try {
      await deleteFirmaImagen()
      setFirmaUrl((antes) => {
        if (antes) URL.revokeObjectURL(antes)
        return null
      })
    } catch {
      setFirmaError('No se pudo quitar la imagen. Inténtalo de nuevo.')
    }
  }

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
      <h3>Imagen de mi firma</h3>
      <p>Se coloca a la izquierda del detalle de la firma digital. Se guarda solo en este móvil.</p>
      {firmaUrl && <img src={firmaUrl} alt="Tu firma" className="firma-preview" />}
      <label>
        {firmaUrl ? 'Cambiar imagen de mi firma' : 'Subir imagen de mi firma (PNG o JPG)'}
        <input type="file" accept="image/png,image/jpeg" onChange={subirFirma} />
      </label>
      {firmaUrl && (
        <button type="button" className="boton-peligro" onClick={quitarFirma}>Quitar imagen de mi firma</button>
      )}
      {firmaError && <p role="alert">{firmaError}</p>}
      <button type="button" onClick={onImport}>Importar otro certificado</button>
      <button type="button" className="boton-secundario" onClick={onBack}>Salir</button>
    </section>
  )
}
