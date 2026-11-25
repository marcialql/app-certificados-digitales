// Convierte la imagen de la firma subida por el usuario en un JPEG pequeño con
// fondo blanco. Todo ocurre en el navegador; el archivo no sale del móvil.

const MAX_ENTRADA = 5 * 1024 * 1024
const LADO_MAX = 600

export class FirmaImagenError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FirmaImagenError'
  }
}

export async function imagenAFirmaJpg(file: File): Promise<Uint8Array> {
  if (!/^image\/(png|jpeg)$/.test(file.type)) {
    throw new FirmaImagenError('Elige una imagen en formato PNG o JPG.')
  }
  if (file.size > MAX_ENTRADA) {
    throw new FirmaImagenError('La imagen es demasiado grande (máximo 5 MB).')
  }
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new FirmaImagenError('No se pudo leer la imagen.')
  }
  const escala = Math.min(1, LADO_MAX / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * escala))
  canvas.height = Math.max(1, Math.round(bitmap.height * escala))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new FirmaImagenError('Este navegador no puede procesar la imagen.')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9))
  if (!blob) throw new FirmaImagenError('No se pudo convertir la imagen.')
  return new Uint8Array(await blob.arrayBuffer())
}
