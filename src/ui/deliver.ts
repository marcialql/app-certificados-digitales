// Decide cómo entregar el PDF firmado: hoja nativa de compartir si el navegador
// admite compartir archivos (iPhone/Android), si no, descarga con enlace.

export type Delivery = 'share' | 'download'

export interface ShareCapable {
  canShare?: (data?: ShareData) => boolean
  share?: (data?: ShareData) => Promise<void>
}

export function chooseDelivery(nav: ShareCapable | undefined, file: File): Delivery {
  if (!nav || typeof nav.canShare !== 'function' || typeof nav.share !== 'function') return 'download'
  try {
    return nav.canShare({ files: [file] }) ? 'share' : 'download'
  } catch {
    return 'download'
  }
}
