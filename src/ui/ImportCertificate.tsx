import { useState, type FormEvent } from 'react'
import { assertValidPin, sealBundle } from '../crypto/vault'
import { loadSigner } from '../crypto/pkcs12'
import { addCert } from '../storage/certStore'
import { encodeBundle } from './bundle'

type Props = { onDone: () => void; onBack?: () => void }

export default function ImportCertificate({ onDone, onBack }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [nombre, setNombre] = useState('')
  const [password, setPassword] = useState('')
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!file) return setError('Elige el archivo de tu certificado (.p12 o .pfx).')
    try {
      assertValidPin(pin)
    } catch (err) {
      return setError(err instanceof Error ? err.message : 'PIN no válido')
    }
    if (pin !== pin2) return setError('Los dos PIN no coinciden.')
    setBusy(true)
    try {
      const p12 = new Uint8Array(await file.arrayBuffer())
      const signer = loadSigner(p12, password) // valida contraseña y vigencia
      const cn = signer.certificate.subject.getField('CN')?.value
      const record = await sealBundle(encodeBundle(p12, password), pin)
      await addCert(nombre.trim() || cn || file.name.replace(/\.(p12|pfx)$/i, ''), record)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo importar el certificado.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <h2>Importar certificado</h2>
      <form onSubmit={handleSubmit}>
        <label>
          Archivo del certificado
          <input
            type="file"
            accept=".p12,.pfx"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null
              setFile(f)
            }}
          />
        </label>
        <label>
          Nombre para distinguirlo (opcional)
          <input
            type="text"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
        </label>
        <label>
          Contraseña del certificado
          <input
            type="password"
            autoComplete="off"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label>
          PIN nuevo
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
          />
        </label>
        <label>
          Repite el PIN
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={pin2}
            onChange={(e) => setPin2(e.target.value)}
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={busy}>Guardar certificado</button>
      </form>
      {onBack && <button type="button" className="boton-secundario" onClick={onBack}>Salir</button>}
    </section>
  )
}
