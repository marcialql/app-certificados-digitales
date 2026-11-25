// Lógica pura del service worker (sin APIs de worker) para poder probarla.

export interface PushMessage {
  title: string
  body: string
}

const DEFAULT_TITLE = 'Certificado Digital'

/** Interpreta el JSON {title, body} que envía server/notify.ts. */
export function parsePushPayload(text: string | null | undefined): PushMessage {
  if (!text) return { title: DEFAULT_TITLE, body: '' }
  try {
    const data = JSON.parse(text) as unknown
    if (data && typeof data === 'object') {
      const { title, body } = data as { title?: unknown; body?: unknown }
      return {
        title: typeof title === 'string' && title.trim() ? title : DEFAULT_TITLE,
        body: typeof body === 'string' ? body : '',
      }
    }
  } catch {
    // No es JSON: se muestra el texto tal cual.
  }
  return { title: DEFAULT_TITLE, body: text }
}

export type ClickAction = { kind: 'focus'; index: number } | { kind: 'open'; url: string }

/** Al tocar el aviso: enfoca una ventana abierta de la app o abre '/'. */
export function chooseClickAction(clientUrls: readonly string[], origin: string): ClickAction {
  const index = clientUrls.findIndex((u) => {
    try {
      return new URL(u).origin === origin
    } catch {
      return false
    }
  })
  return index >= 0 ? { kind: 'focus', index } : { kind: 'open', url: '/' }
}
