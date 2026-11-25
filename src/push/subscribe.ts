function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export async function enableNotifications(): Promise<void> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Permiso de avisos no concedido')

  const keyRes = await fetch('/api/vapid-key')
  if (!keyRes.ok) throw new Error('No se pudo obtener la clave de avisos')
  const { publicKey } = (await keyRes.json()) as { publicKey: string }

  const registration = await navigator.serviceWorker.ready
  const sub = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  })

  // Solo se envía la suscripción (dirección y claves), nada más.
  const { endpoint, keys } = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
  try {
    const res = await fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } }),
    })
    if (!res.ok) throw new Error('No se pudo registrar la suscripción')
  } catch (e) {
    // Sin suscripción guardada en el servidor no se deja una local: así se vuelve a ofrecer el botón.
    try { await sub.unsubscribe() } catch { /* se ignora */ }
    throw e
  }
}
