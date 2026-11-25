import { useState, type FormEvent } from 'react'
import { assertValidPin, sealBundle } from '../crypto/vault'
import { loadSigner } from '../crypto/pkcs12'
import { saveVault } from '../storage/certStore'
import { encodeBundle } from './bundle'

type Props = { onDone: () => void }

export default function ImportCertificate({ onDone }: Props) {
  const [file, setFile] = useState<File | null>(null)
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
      loadSigner(p12, password) // valida contraseña y vigencia
      const record = await sealBundle(encodeBundle(p12, password), pin)
      await saveVault(record)
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
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
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
    </section>
  )
}
