import { useEffect, useRef, useState } from 'react'
import * as pdfjs from 'pdfjs-dist'

// Worker de pdf.js empaquetado con la app: nada se descarga de otro sitio.
pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

/** Página (índice desde 0) y rectángulo de la firma en puntos PDF [x1, y1, x2, y2]. */
export type Colocacion = { page: number; rect: [number, number, number, number] }

// Mismas medidas que src/pdf/pades.ts
const FIRMA_W = 180
const FIRMA_H = 60
const MARGEN = 36
const LATERAL_W = 18
const LATERAL_H = 240
const LATERAL_MARGEN = 8
const ANCHO_MAX = 560

type Props = {
  file: File
  modo: 'ultima' | 'todas'
  onChange: (c: Colocacion | null) => void
}

type Vista = { x0: number; y0: number; w: number; h: number }

function rectPorDefecto(v: Vista): [number, number, number, number] {
  const x2 = v.x0 + v.w - MARGEN
  const y1 = v.y0 + MARGEN
  return [x2 - FIRMA_W, y1, x2, y1 + FIRMA_H]
}

function rectLateral(v: Vista): [number, number, number, number] {
  const x1 = v.x0 + LATERAL_MARGEN
  const y1 = v.y0 + (v.h - LATERAL_H) / 2
  return [x1, y1, x1 + LATERAL_W, y1 + LATERAL_H]
}

export default function VistaPrevia({ file, modo, onChange }: Props) {
  const [doc, setDoc] = useState<pdfjs.PDFDocumentProxy | null>(null)
  const [numPaginas, setNumPaginas] = useState(0)
  const [pagina, setPagina] = useState(0)
  const [vista, setVista] = useState<Vista | null>(null)
  const [escala, setEscala] = useState(1)
  const [elegidas, setElegidas] = useState<Record<number, [number, number, number, number]>>({})
  const [error, setError] = useState('')
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Carga el PDF y empieza por la última página (donde va la firma por defecto).
  useEffect(() => {
    let cancelado = false
    let tarea: pdfjs.PDFDocumentLoadingTask | null = null
    setError('')
    setElegidas({})
    file
      .arrayBuffer()
      .then((buf) => {
        if (cancelado) return
        tarea = pdfjs.getDocument({ data: new Uint8Array(buf) })
        return tarea.promise.then((d) => {
          if (cancelado) return
          setDoc(d)
          setNumPaginas(d.numPages)
          setPagina(d.numPages - 1)
        })
      })
      .catch(() => {
        if (!cancelado) setError('No se puede mostrar la vista previa de este PDF.')
      })
    return () => {
      cancelado = true
      if (tarea) void tarea.destroy()
    }
  }, [file])

  // Dibuja la página actual y calcula sus medidas.
  useEffect(() => {
    if (!doc || !canvasRef.current) return
    let cancelado = false
    let tarea: { cancel: () => void } | null = null
    doc.getPage(pagina + 1).then((page) => {
      if (cancelado || !canvasRef.current) return
      const [x0, y0, x1, y1] = page.view
      const v: Vista = { x0, y0, w: x1 - x0, h: y1 - y0 }
      setVista(v)
      // Ancho disponible en pantalla (el contenedor puede estar oculto mientras carga).
      const ancho = Math.min(ANCHO_MAX, Math.max(200, window.innerWidth - 48))
      const e = ancho / v.w
      setEscala(e)
      const dpr = window.devicePixelRatio || 1
      const vp = page.getViewport({ scale: e * dpr })
      const canvas = canvasRef.current
      canvas.width = Math.floor(vp.width)
      canvas.height = Math.floor(vp.height)
      canvas.style.width = `${v.w * e}px`
      canvas.style.height = `${v.h * e}px`
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const render = page.render({ canvas, canvasContext: ctx, viewport: vp })
      tarea = render
      render.promise.catch(() => {})
    })
    return () => {
      cancelado = true
      if (tarea) tarea.cancel()
    }
  }, [doc, pagina])

  // Lo que se elige se comunica a la pantalla de firma: página y rectángulo visibles.
  const rectActual = vista ? (elegidas[pagina] ?? rectPorDefecto(vista)) : null
  useEffect(() => {
    if (!rectActual) return
    onChange({ page: pagina, rect: rectActual })
    // onChange cambia en cada render del padre; solo importan página y rectángulo.
  }, [pagina, rectActual?.join(',')])

  function tocar(e: React.MouseEvent<HTMLDivElement>) {
    if (!vista || !canvasRef.current) return
    const bb = canvasRef.current.getBoundingClientRect()
    const px = e.clientX - bb.left
    const py = e.clientY - bb.top
    const x = vista.x0 + px / escala
    const y = vista.y0 + vista.h - py / escala
    const x1 = Math.min(Math.max(x - FIRMA_W / 2, vista.x0), vista.x0 + vista.w - FIRMA_W)
    const y1 = Math.min(Math.max(y - FIRMA_H / 2, vista.y0), vista.y0 + vista.h - FIRMA_H)
    setElegidas((antes) => ({ ...antes, [pagina]: [x1, y1, x1 + FIRMA_W, y1 + FIRMA_H] }))
  }

  if (error) return <p role="alert">{error}</p>

  const listo = doc !== null && vista !== null && rectActual !== null
  const caja = (r: [number, number, number, number]) =>
    vista
      ? {
          left: (r[0] - vista.x0) * escala,
          top: (vista.h - (r[3] - vista.y0)) * escala,
          width: (r[2] - r[0]) * escala,
          height: (r[3] - r[1]) * escala,
        }
      : undefined
  const lateral = vista ? caja(rectLateral(vista)) : undefined
  const firma = rectActual ? caja(rectActual) : undefined
  const personalizada = elegidas[pagina] !== undefined

  // Un único árbol: el canvas no se desmonta al cargar, o se perdería el dibujo.
  return (
    <div className="vista-previa">
      <p role="status">
        {listo
          ? `La firma irá en la página ${pagina + 1} de ${numPaginas}. Toca en el PDF el sitio donde quieres la firma.`
          : 'Cargando vista previa…'}
      </p>
      <div className="vista-lienzo" onClick={tocar} hidden={!listo}>
        <canvas ref={canvasRef} aria-label={`Vista previa de la página ${pagina + 1}`} />
        {listo && modo === 'todas' && lateral && (
          <div className="vista-lateral" style={lateral} aria-hidden="true" />
        )}
        {listo && firma && (
          <div className="vista-firma" style={firma} aria-hidden="true">Firma</div>
        )}
      </div>
      {listo && (
        <div className="vista-nav">
          <button type="button" className="boton-secundario" disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>
            Anterior
          </button>
          <button type="button" className="boton-secundario" disabled={pagina >= numPaginas - 1} onClick={() => setPagina((p) => p + 1)}>
            Siguiente
          </button>
          {personalizada && (
            <button
              type="button"
              className="boton-secundario"
              onClick={() =>
                setElegidas((antes) => {
                  const copia = { ...antes }
                  delete copia[pagina]
                  return copia
                })
              }
            >
              Poner en la posición automática
            </button>
          )}
        </div>
      )}
      {listo && modo === 'todas' && (
        <p className="ayuda">En cada hoja aparecerá también un sello en el lateral izquierdo (zona naranja).</p>
      )}
    </div>
  )
}
