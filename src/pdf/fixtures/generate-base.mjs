// Genera blank.pdf (tabla xref clásica) y two-page.pdf (xref en flujo + flujos de objetos).
// Fechas y metadatos fijos para que el resultado sea byte a byte reproducible.
import { writeFileSync } from 'node:fs'
import { PDFDocument, StandardFonts } from 'pdf-lib'

const FECHA = new Date('2026-01-01T00:00:00Z')

async function crear(paginas) {
  const doc = await PDFDocument.create({ updateMetadata: false })
  doc.setTitle('Documento de prueba')
  doc.setProducer('firma-pdf fixtures')
  doc.setCreationDate(FECHA)
  doc.setModificationDate(FECHA)
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 1; i <= paginas; i++) {
    const page = doc.addPage([595.28, 841.89]) // A4
    page.drawText(`Documento de prueba. Página ${i} de ${paginas}.`, { x: 72, y: 760, size: 14, font })
  }
  return doc
}

const blank = await crear(1)
writeFileSync(new URL('./blank.pdf', import.meta.url), await blank.save({ useObjectStreams: false }))

const two = await crear(2)
writeFileSync(new URL('./two-page.pdf', import.meta.url), await two.save({ useObjectStreams: true }))
