import { useEffect, useState } from 'react'
import { openBundle, WrongPinError } from '../crypto/vault'
import { loadSigner } from '../crypto/pkcs12'
import { listCerts, renameCert, type CertEntry } from '../storage/certStore'
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
  const [firmado, setFirmado] = useState<File | null>(null)
  const [modo, setModo] = useState<'ultima' | 'todas'>('ultima')
  const [certs, setCerts] = useState<CertEntry[]>([])
  const [certId, setCertId] = useState('')

  useEffect(() => {
    listCerts()
      .then((lista) => {
        setCerts(lista)
        setCertId((actual) => (lista.some((c) => c.id === actual) ? actual : lista[0]?.id ?? ''))
        setNoCert(lista.length === 0)
      })
      .catch(() => setNoCert(true))
  }, [])

  async function shareSigned() {
    if (!firmado) return
    try {
      await navigator.share({ files: [firmado], title: firmado.name })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return // el usuario cerró el menú
      download(firmado)
      setMessage('No se pudo enviar. El PDF se ha guardado en el móvil.')
    }
  }

  async function handlePin(pin: string) {
    if (!file || busy) return
    setBusy(true)
    setPinError('')
    try {
      const lista = await listCerts()
      setCerts(lista)
      const elegido = lista.find((c) => c.id === certId)
      if (!elegido) {
        setAsking(false)
        setMessage(lista.length === 0
          ? 'No hay ningún certificado guardado.'
          : 'El certificado elegido ya no está guardado. Elige otro.')
        setNoCert(lista.length === 0)
        return
      }
      const { p12, password } = decodeBundle(await openBundle(elegido.vault, pin))
      const signer = loadSigner(p12, password)
      if (!elegido.nombre) {
        // Certificados guardados antes de tener nombre: se toma el del propio certificado.
        const cn = signer.certificate.subject.getField('CN')?.value
        if (cn) {
          await renameCert(elegido.id, cn)
          setCerts((actual) => actual.map((c) => (c.id === elegido.id ? { ...c, nombre: cn } : c)))
        }
      }
      const pdf = new Uint8Array(await file.arrayBuffer())
      const signed = await signPdf(pdf, signer, { modo })
      const name = file.name.replace(/\.pdf$/i, '') + '-firmado.pdf'
      setAsking(false)
      setFirmado(new File([signed as BlobPart], name, { type: 'application/pdf' }))
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

  const puedeEnviar = firmado !== null && chooseDelivery(navigator, firmado) === 'share'

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
            setFirmado(null)
          }}
        />
      </label>
      {certs.length > 1 && (
        <fieldset>
          <legend>Certificado para firmar</legend>
          {certs.map((c) => (
            <label key={c.id}>
              <input
                type="radio"
                name="certificado"
                value={c.id}
                checked={certId === c.id}
                onChange={() => setCertId(c.id)}
              />{' '}
              {c.nombre || 'Certificado sin nombre'}
            </label>
          ))}
        </fieldset>
      )}
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
          setFirmado(null)
          setPinError('')
          setAsking(true)
        }}
      >
        Firmar
      </button>
      <button type="button" className="boton-secundario" onClick={onBack}>Salir</button>
      {message && <p role="status">{message}</p>}
      {noCert && <button type="button" onClick={onImport}>Importar certificado</button>}
      {firmado && (
        <div className="entrega" role="group" aria-label="Qué hacer con el PDF firmado">
          <p role="status">PDF firmado. ¿Qué quieres hacer?</p>
          <button type="button" className="boton-grande" onClick={() => download(firmado)}>
            Guardar en el móvil
          </button>
          {puedeEnviar && (
            <button type="button" className="boton-grande" onClick={shareSigned}>
              Enviar por WhatsApp o correo
            </button>
          )}
          {puedeEnviar && (
            <p className="ayuda">Se abrirá el menú del móvil: elige WhatsApp o Correo.</p>
          )}
        </div>
      )}
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
