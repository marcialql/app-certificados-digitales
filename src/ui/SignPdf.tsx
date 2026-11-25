import { useState } from 'react'
import { openBundle, WrongPinError } from '../crypto/vault'
import { loadSigner } from '../crypto/pkcs12'
import { loadVault } from '../storage/certStore'
import { signPdf } from '../pdf/pades'
import { decodeBundle } from './bundle'
import PinDialog from './PinDialog'
import { chooseDelivery } from './deliver'

type Props = { onBack: () => void; onImport: () => void }

function download(signed: File) {
  const url = URL.createObjectURL(signed)
  const a = document.createElement('a')
  a.href = url
  a.download = signed.name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export default function SignPdf({ onBack, onImport }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [asking, setAsking] = useState(false)
  const [pinError, setPinError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [noCert, setNoCert] = useState(false)
  const [toShare, setToShare] = useState<File | null>(null)
  const [modo, setModo] = useState<'ultima' | 'todas'>('ultima')

  async function shareSigned() {
    if (!toShare) return
    try {
      await navigator.share({ files: [toShare], title: toShare.name })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return // el usuario cerró la hoja
      download(toShare)
      setMessage('PDF firmado. Se ha descargado el archivo.')
    }
  }

  async function handlePin(pin: string) {
    if (!file || busy) return
    setBusy(true)
    setPinError('')
    try {
      const vault = await loadVault()
      if (!vault) {
        setAsking(false)
        setMessage('No hay ningún certificado guardado.')
        setNoCert(true)
        return
      }
      const { p12, password } = decodeBundle(await openBundle(vault, pin))
      const signer = loadSigner(p12, password)
      const pdf = new Uint8Array(await file.arrayBuffer())
      const signed = await signPdf(pdf, signer, { modo })
      const name = file.name.replace(/\.pdf$/i, '') + '-firmado.pdf'
      const signedFile = new File([signed as BlobPart], name, { type: 'application/pdf' })
      setAsking(false)
      if (chooseDelivery(navigator, signedFile) === 'share') {
        // La hoja de compartir necesita un toque del usuario: se ofrece un botón.
        setToShare(signedFile)
        setMessage('PDF firmado. Pulsa «Guardar o compartir» para guardarlo.')
      } else {
        download(signedFile)
        setMessage('PDF firmado. Se ha descargado el archivo.')
      }
    } catch (err) {
      if (err instanceof WrongPinError) {
        setPinError('PIN incorrecto')
      } else {
        setAsking(false)
        setMessage(err instanceof Error ? err.message : 'No se pudo firmar el PDF.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <h2>Firmar un documento</h2>
      <label>
        PDF a firmar
        <input
          type="file"
          accept=".pdf,application/pdf"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null)
            setMessage('')
            setNoCert(false)
            setToShare(null)
          }}
        />
      </label>
      <fieldset>
        <legend>Cómo firmar el documento</legend>
        <label>
          <input
            type="radio"
            name="modo"
            value="ultima"
            checked={modo === 'ultima'}
            onChange={() => setModo('ultima')}
          />{' '}
          Solo en la última página, junto al pie de firma
        </label>
        <label>
          <input
            type="radio"
            name="modo"
            value="todas"
            checked={modo === 'todas'}
            onChange={() => setModo('todas')}
          />{' '}
          En todas las hojas (en el lateral) y al final, junto al pie de firma
        </label>
      </fieldset>
      <button
        type="button"
        disabled={!file}
        onClick={() => {
          setMessage('')
          setNoCert(false)
          setToShare(null)
          setPinError('')
          setAsking(true)
        }}
      >
        Firmar
      </button>
      <button type="button" className="boton-secundario" onClick={onBack}>Volver</button>
      {message && <p role="status">{message}</p>}
      {noCert && <button type="button" onClick={onImport}>Importar certificado</button>}
      {toShare && <button type="button" onClick={shareSigned}>Guardar o compartir</button>}
      {asking && (
        <PinDialog
          onSubmit={handlePin}
          onCancel={() => setAsking(false)}
          error={pinError}
        />
      )}
    </section>
  )
}
