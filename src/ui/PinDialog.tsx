import { useState, type FormEvent } from 'react'

type Props = {
  onSubmit: (pin: string) => void
  onCancel: () => void
  error?: string
}

export default function PinDialog({ onSubmit, onCancel, error }: Props) {
  const [pin, setPin] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    onSubmit(pin)
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="pin-title">
      <form onSubmit={handleSubmit}>
        <h2 id="pin-title">Introduce tu PIN</h2>
        <label>
          PIN
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            value={pin}
            onChange={(e) => setPin(e.target.value)}
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <button type="submit">Aceptar</button>
        <button type="button" onClick={onCancel}>Cancelar</button>
      </form>
    </div>
  )
}
