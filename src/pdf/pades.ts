import forge from 'node-forge'
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFObject,
  PDFPage,
  PDFRef,
  PDFString,
  StandardFontEmbedder,
  StandardFonts,
} from 'pdf-lib'
import type { Signer } from '../crypto/pkcs12'

/**
 * Firma PAdES (perfil básico, B-B) de un PDF en el navegador.
 *
 * - CMS detached (ETSI.CAdES.detached), SHA-256, atributos firmados contentType,
 *   messageDigest y signingCertificateV2 (RFC 5035). Sin signing-time: en PAdES
 *   baseline la hora de firma va en la entrada /M del diccionario /Sig.
 * - Actualización incremental hecha a mano: los bytes del PDF de entrada se copian
 *   tal cual como prefijo y se añaden detrás los objetos nuevos o modificados, una
 *   sección xref (tabla clásica o flujo XRef, la misma que use el original) y el
 *   trailer con /Prev. pdf-lib solo se usa para LEER el documento y para serializar
 *   objetos sueltos; su `save()` reescribe el fichero entero e invalidaría las
 *   firmas que ya tuviera.
 */

export const MAX_PDF_BYTES = 30 * 1024 * 1024
/** Hueco fijo para el CMS: 16 KB = 32 768 caracteres hexadecimales. */
export const SIGNATURE_HEX_LENGTH = 32768

const DEFAULT_SIZE: [number, number] = [180, 60]
const DEFAULT_MARGIN = 36
/** Sello lateral (modo 'todas'): tira vertical de 18 × 240 pt, a 8 pt del borde izquierdo. */
const SIDE_SIZE: [number, number] = [18, 240]
const SIDE_MARGIN = 8
const BYTE_RANGE_PLACEHOLDER = '[0 0000000000 0000000000 0000000000]'
const OID_SIGNING_CERTIFICATE_V2 = '1.2.840.113549.1.9.16.2.47'

export class PdfSignError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PdfSignError'
  }
}

export type SignPdfOptions = {
  /** Índice de página empezando en 0. Por defecto, la última. */
  page?: number
  /** Rectángulo visible de la firma en puntos PDF: [x1, y1, x2, y2] (esquina inferior izquierda y superior derecha). */
  rect?: [number, number, number, number]
  /** Motivo de la firma (se guarda en /Reason y se muestra en el sello). */
  reason?: string
  /**
   * 'ultima' (por defecto): sello solo en la última página, junto al pie de firma.
   * 'todas': además, un sello lateral en cada hoja.
   */
  modo?: 'ultima' | 'todas'
}

const asn1 = forge.asn1

// ---------------------------------------------------------------- utilidades de bytes

const latin1Encoder = (s: string): Uint8Array => {
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff
  return out
}

function toBinary(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return s
}

function lastIndexOf(hay: Uint8Array, needle: string, from = hay.length - needle.length): number {
  outer: for (let i = Math.min(from, hay.length - needle.length); i >= 0; i--) {
    for (let j = 0; j < needle.length; j++) {
      if (hay[i + j] !== needle.charCodeAt(j)) continue outer
    }
    return i
  }
  return -1
}

function indexOf(hay: Uint8Array, needle: string, from = 0): number {
  outer: for (let i = from; i <= hay.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (hay[i + j] !== needle.charCodeAt(j)) continue outer
    }
    return i
  }
  return -1
}

const isWhite = (c: number) => c === 0x20 || c === 0x0a || c === 0x0d || c === 0x09 || c === 0x0c || c === 0x00

/** Serializa un objeto de pdf-lib a su texto PDF exacto. */
function serialize(obj: PDFObject): Uint8Array {
  const buf = new Uint8Array(obj.sizeInBytes())
  obj.copyBytesInto(buf, 0)
  return buf
}

// ---------------------------------------------------------------- sección xref previa

type PrevXref = { offset: number; isStream: boolean; size: number }

const readError = () => new PdfSignError('No se ha podido leer el PDF. Comprueba que el archivo no está dañado.')

/** Localiza el último `startxref`, el tipo de su sección xref y el /Size del trailer. */
function readPrevXref(pdf: Uint8Array): PrevXref {
  const sx = lastIndexOf(pdf, 'startxref')
  if (sx < 0) throw readError()
  const m = /^startxref\s+(\d+)/.exec(toBinary(pdf.subarray(sx, sx + 40)))
  if (!m) throw readError()
  const offset = Number(m[1])
  if (!(offset > 0 && offset < pdf.length)) throw readError()

  let p = offset
  while (p < pdf.length && isWhite(pdf[p])) p++
  const isStream = !(pdf[p] === 0x78 /* x */ && toBinary(pdf.subarray(p, p + 4)) === 'xref')

  // El /Size está en el diccionario trailer (tabla clásica) o en el del flujo XRef,
  // que en ambos casos está antes de los datos binarios.
  const dictStart = isStream ? p : indexOf(pdf, 'trailer', p)
  const end = dictStart < 0 ? -1 : isStream ? indexOf(pdf, 'stream', p) : indexOf(pdf, '>>', dictStart)
  if (end < 0) throw readError()
  const sizeMatch = /\/Size\s+(\d+)/.exec(toBinary(pdf.subarray(dictStart, end)))
  if (!sizeMatch) throw readError()
  return { offset, isStream, size: Number(sizeMatch[1]) }
}

// ---------------------------------------------------------------- CMS

/**
 * Atributo ESS signing-certificate-v2 (RFC 5035):
 *
 *   SigningCertificateV2 ::= SEQUENCE { certs SEQUENCE OF ESSCertIDv2 }
 *   ESSCertIDv2 ::= SEQUENCE {
 *     hashAlgorithm AlgorithmIdentifier DEFAULT {id-sha256},  -- omitido: es SHA-256 (DER)
 *     certHash      OCTET STRING,                             -- SHA-256 del DER del certificado
 *     issuerSerial  IssuerSerial }
 *   IssuerSerial ::= SEQUENCE { issuer GeneralNames, serialNumber INTEGER }
 *   GeneralNames ::= SEQUENCE OF GeneralName   -- directoryName [4] EXPLICIT Name
 */
/**
 * Copia exacta del nodo issuer del TBSCertificate tal como viene en el certificado.
 * No se usa distinguishedNameToAsn1 porque reparte los RDN multivaluados en varios
 * RDN y el issuer resultante ya no coincidiría byte a byte con el del certificado.
 */
function issuerAsn1(cert: forge.pki.Certificate): forge.asn1.Asn1 {
  const tbs =
    (cert as forge.pki.Certificate & { tbsCertificate?: forge.asn1.Asn1 }).tbsCertificate ??
    // getTBSCertificate existe en node-forge pero no está en @types/node-forge
    (forge.pki as unknown as { getTBSCertificate(c: forge.pki.Certificate): forge.asn1.Asn1 }).getTBSCertificate(cert)
  const parts = tbs.value as forge.asn1.Asn1[]
  // TBSCertificate ::= SEQUENCE { [0] version OPTIONAL, serialNumber, signature, issuer, ... }
  const hasVersion = parts[0].tagClass === asn1.Class.CONTEXT_SPECIFIC && parts[0].type === 0
  const issuer = parts[hasVersion ? 3 : 2]
  return asn1.fromDer(asn1.toDer(issuer).getBytes())
}

export function signingCertificateV2Attribute(cert: forge.pki.Certificate): forge.asn1.Asn1 {
  const certDer = asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes()
  const certHash = forge.md.sha256.create().update(certDer).digest().bytes()
  const essCertIdV2 = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OCTETSTRING, false, certHash),
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
        asn1.create(asn1.Class.CONTEXT_SPECIFIC, 4, true, [issuerAsn1(cert)]),
      ]),
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.INTEGER, false, forge.util.hexToBytes(cert.serialNumber)),
    ]),
  ])
  const value = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [essCertIdV2]),
  ])
  return asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer(OID_SIGNING_CERTIFICATE_V2).getBytes()),
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SET, true, [value]),
  ])
}

/** Estado interno de forge.pkcs7 que necesitamos tocar (no está en los tipos públicos). */
type ForgeSignedDataInternals = {
  signers: { authenticatedAttributesAsn1: forge.asn1.Asn1 }[]
  signerInfos: forge.asn1.Asn1[]
}

/** Crea el CMS detached (DER binario) sobre los bytes del ByteRange. */
function createCms(signedBytes: string, signer: Signer): string {
  const p7 = forge.pkcs7.createSignedData()
  p7.content = forge.util.createBuffer(signedBytes)

  const seen = new Set<string>()
  for (const cert of [signer.certificate, ...signer.chain]) {
    const der = asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes()
    if (seen.has(der)) continue
    seen.add(der)
    p7.addCertificate(cert)
  }

  p7.addSigner({
    key: signer.privateKey as forge.pki.rsa.PrivateKey,
    certificate: signer.certificate,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
    ],
  })
  p7.sign({ detached: true })

  // forge no sabe codificar signingCertificateV2: se añade a mano a los atributos
  // firmados y se vuelve a firmar. El SET OF se ordena por su codificación DER
  // (X.690 §11.6), porque los verificadores (OpenSSL incluido) lo recodifican
  // en DER antes de comprobar la firma.
  const internals = p7 as unknown as ForgeSignedDataInternals
  const signedAttrs = internals.signers[0].authenticatedAttributesAsn1
  const attrs = signedAttrs.value as forge.asn1.Asn1[]
  attrs.push(signingCertificateV2Attribute(signer.certificate))
  const der = (a: forge.asn1.Asn1) => asn1.toDer(a).getBytes()
  attrs.sort((a, b) => {
    const da = der(a)
    const db = der(b)
    return da < db ? -1 : da > db ? 1 : 0
  })

  const toSign = asn1.toDer(asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SET, true, attrs)).getBytes()
  const md = forge.md.sha256.create().update(toSign)
  const signature = (signer.privateKey as forge.pki.rsa.PrivateKey).sign(md)

  // SignerInfo = SEQUENCE { version, sid, digestAlg, [0] signedAttrs, sigAlg, signature }
  const signerInfo = internals.signerInfos[0].value as forge.asn1.Asn1[]
  const sigNode = signerInfo[signerInfo.length - 1]
  if (signerInfo[3] !== signedAttrs || sigNode.type !== asn1.Type.OCTETSTRING) {
    throw new Error('Estructura inesperada de SignerInfo en node-forge')
  }
  sigNode.value = signature

  return asn1.toDer(p7.toAsn1()).getBytes()
}

// ---------------------------------------------------------------- apariencia

const pdfDate = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0')
  return `D:${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
}

const humanDate = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** Texto codificable en WinAnsi (Helvetica estándar); lo que no cabe se cambia por '?'. */
function winAnsiSafe(font: StandardFontEmbedder, text: string): string {
  return Array.from(text)
    .map((ch) => {
      try {
        font.encodeText(ch)
        return ch
      } catch {
        return '?'
      }
    })
    .join('')
}

function fitText(font: StandardFontEmbedder, text: string, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text
  let t = text
  while (t.length > 1 && font.widthOfTextAtSize(`${t}...`, size) > maxWidth) t = t.slice(0, -1)
  return `${t}...`
}

function appearanceContent(font: StandardFontEmbedder, w: number, h: number, lines: string[]): string {
  const size = Math.max(5, Math.min(8, (h - 8) / (lines.length * 1.25)))
  const leading = size * 1.25
  const ops = [
    'q 0.12 0.31 0.47 RG 0.8 w',
    `0.4 0.4 ${(w - 0.8).toFixed(2)} ${(h - 0.8).toFixed(2)} re S Q`,
    'BT 0.1 0.1 0.1 rg',
    `/F1 ${size.toFixed(2)} Tf ${leading.toFixed(2)} TL`,
    `5 ${(h - 4 - size).toFixed(2)} Td`,
  ]
  lines.forEach((line, i) => {
    const safe = fitText(font, winAnsiSafe(font, line), size, w - 10)
    ops.push(`${i === 0 ? '' : 'T* '}${font.encodeText(safe).toString()} Tj`)
  })
  ops.push('ET')
  return ops.join('\n')
}

/** Texto del sello lateral: una sola línea, girada 90° para leerla de abajo arriba. */
function sideAppearanceContent(font: StandardFontEmbedder, w: number, h: number, text: string): string {
  const size = 7
  const line = fitText(font, winAnsiSafe(font, text), size, h - 12)
  return [
    'q 0.12 0.31 0.47 RG 0.8 w',
    `0.4 0.4 ${(w - 0.8).toFixed(2)} ${(h - 0.8).toFixed(2)} re S Q`,
    'BT 0.1 0.1 0.1 rg',
    `/F1 ${size.toFixed(2)} Tf`,
    `0 1 -1 0 ${(w - 5).toFixed(2)} 6 Tm`,
    `${font.encodeText(line).toString()} Tj`,
    'ET',
  ].join('\n')
}

// ---------------------------------------------------------------- firma

export async function signPdf(pdf: Uint8Array, signer: Signer, opts: SignPdfOptions = {}): Promise<Uint8Array> {
  if (pdf.length > MAX_PDF_BYTES) {
    throw new PdfSignError('El PDF es demasiado grande. El tamaño máximo para firmar es 30 MB.')
  }

  let doc: PDFDocument
  try {
    doc = await PDFDocument.load(pdf, { ignoreEncryption: true, updateMetadata: false })
  } catch {
    throw readError()
  }
  if (doc.isEncrypted) {
    throw new PdfSignError('El PDF está protegido con contraseña. Quita la protección y vuelve a intentarlo.')
  }

  const prev = readPrevXref(pdf)
  const ctx = doc.context
  const rootRef = ctx.trailerInfo.Root
  if (!(rootRef instanceof PDFRef)) throw readError()
  const now = new Date()

  // --- página y rectángulo
  const pageCount = doc.getPageCount()
  const pageIndex = opts.page ?? pageCount - 1
  if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= pageCount) {
    throw new PdfSignError('La página indicada para la firma no existe en el documento.')
  }
  const page = doc.getPage(pageIndex)
  const box = page.getMediaBox()
  const rect: [number, number, number, number] = opts.rect ?? [
    box.x + box.width - DEFAULT_MARGIN - DEFAULT_SIZE[0],
    box.y + DEFAULT_MARGIN,
    box.x + box.width - DEFAULT_MARGIN,
    box.y + DEFAULT_MARGIN + DEFAULT_SIZE[1],
  ]
  const w = Math.abs(rect[2] - rect[0])
  const h = Math.abs(rect[3] - rect[1])

  // --- números de objeto nuevos: por encima de todo lo existente (incluido /Size previo)
  ctx.largestObjectNumber = Math.max(ctx.largestObjectNumber, prev.size - 1)
  const sigRef = ctx.nextRef()
  const widgetRef = ctx.nextRef()
  const apRef = ctx.nextRef()
  const fontRef = ctx.nextRef()

  // Objetos a escribir en la actualización: ref -> bytes (el /Sig se escribe aparte)
  const updates = new Map<PDFRef, PDFObject>()

  // --- nombre de campo único
  const catalog = doc.catalog
  const acroRaw = catalog.get(PDFName.of('AcroForm'))
  let acroForm: PDFDict
  if (acroRaw instanceof PDFRef) {
    acroForm = ctx.lookup(acroRaw, PDFDict)
    updates.set(acroRaw, acroForm)
  } else if (acroRaw instanceof PDFDict) {
    acroForm = acroRaw
    updates.set(rootRef, catalog)
  } else {
    acroForm = ctx.obj({})
    const acroRef = ctx.nextRef()
    ctx.assign(acroRef, acroForm)
    catalog.set(PDFName.of('AcroForm'), acroRef)
    updates.set(acroRef, acroForm)
    updates.set(rootRef, catalog)
  }
  const fieldsRaw = acroForm.get(PDFName.of('Fields'))
  let fields: PDFArray
  if (fieldsRaw instanceof PDFRef) {
    fields = ctx.lookup(fieldsRaw, PDFArray)
    updates.set(fieldsRaw, fields)
  } else if (fieldsRaw instanceof PDFArray) {
    fields = fieldsRaw
  } else {
    fields = ctx.obj([])
    acroForm.set(PDFName.of('Fields'), fields)
  }
  const usedNames = new Set(
    fields.asArray().map((f) => {
      const t = ctx.lookup(f)
      const name = t instanceof PDFDict ? t.lookup(PDFName.of('T')) : undefined
      return name instanceof PDFString || name instanceof PDFHexString ? name.decodeText() : ''
    }),
  )
  let n = 1
  while (usedNames.has(`Firma${n}`)) n++
  const fieldName = `Firma${n}`
  fields.push(widgetRef)
  acroForm.set(PDFName.of('SigFlags'), PDFNumber.of(3)) // SignaturesExist | AppendOnly

  // --- apariencia visible
  // StandardFonts y FontNames son el mismo enum de cadenas en dos paquetes distintos
  const font = StandardFontEmbedder.for(StandardFonts.Helvetica as unknown as Parameters<typeof StandardFontEmbedder.for>[0])
  font.embedIntoContext(ctx, fontRef)
  const cn = signer.certificate.subject.getField('CN')?.value ?? ''
  const lines = ['Firmado digitalmente por', cn, `Fecha: ${humanDate(now)}`]
  if (opts.reason) lines.push(`Motivo: ${opts.reason}`)
  const ap = ctx.stream(appearanceContent(font, w, h, lines), {
    Type: 'XObject',
    Subtype: 'Form',
    BBox: [0, 0, w, h],
    Resources: { Font: { F1: fontRef } },
  })
  ctx.assign(apRef, ap)

  // --- campo de firma (widget fusionado con el campo)
  const widget = ctx.obj({
    Type: 'Annot',
    Subtype: 'Widget',
    FT: 'Sig',
    T: PDFString.of(fieldName),
    V: sigRef,
    F: 132, // Print | Locked
    P: page.ref,
    Rect: rect,
    AP: { N: apRef },
  })
  ctx.assign(widgetRef, widget)

  // --- /Annots de la página
  const annotsRaw = page.node.get(PDFName.of('Annots'))
  if (annotsRaw instanceof PDFRef) {
    ctx.lookup(annotsRaw, PDFArray).push(widgetRef)
    updates.set(annotsRaw, ctx.lookup(annotsRaw, PDFArray))
  } else if (annotsRaw instanceof PDFArray) {
    annotsRaw.push(widgetRef)
    updates.set(page.ref, page.node)
  } else {
    page.node.set(PDFName.of('Annots'), ctx.obj([widgetRef]))
    updates.set(page.ref, page.node)
  }
  updates.set(widgetRef, widget)
  updates.set(apRef, ap)
  updates.set(fontRef, ctx.lookup(fontRef) as PDFObject)

  // --- sellos laterales en cada hoja (modo 'todas'): anotaciones de sello, no campos de firma
  const addAnnot = (p: PDFPage, ref: PDFRef) => {
    const raw = p.node.get(PDFName.of('Annots'))
    if (raw instanceof PDFRef) {
      const arr = ctx.lookup(raw, PDFArray)
      arr.push(ref)
      updates.set(raw, arr)
    } else if (raw instanceof PDFArray) {
      raw.push(ref)
      updates.set(p.ref, p.node)
    } else {
      p.node.set(PDFName.of('Annots'), ctx.obj([ref]))
      updates.set(p.ref, p.node)
    }
  }
  if (opts.modo === 'todas') {
    const sideAp = ctx.stream(
      sideAppearanceContent(font, SIDE_SIZE[0], SIDE_SIZE[1], `Firmado digitalmente por ${cn}. Fecha: ${humanDate(now)}`),
      {
        Type: 'XObject',
        Subtype: 'Form',
        BBox: [0, 0, SIDE_SIZE[0], SIDE_SIZE[1]],
        Resources: { Font: { F1: fontRef } },
      },
    )
    const sideApRef = ctx.nextRef()
    ctx.assign(sideApRef, sideAp)
    updates.set(sideApRef, sideAp)
    for (let i = 0; i < pageCount; i++) {
      const p = doc.getPage(i)
      const b = p.getMediaBox()
      const y0 = b.y + (b.height - SIDE_SIZE[1]) / 2
      const stampRef = ctx.nextRef()
      const stamp = ctx.obj({
        Type: 'Annot',
        Subtype: 'Stamp',
        F: 4, // Print
        P: p.ref,
        Rect: [b.x + SIDE_MARGIN, y0, b.x + SIDE_MARGIN + SIDE_SIZE[0], y0 + SIDE_SIZE[1]],
        AP: { N: sideApRef },
      })
      ctx.assign(stampRef, stamp)
      updates.set(stampRef, stamp)
      addAnnot(p, stampRef)
    }
  }

  // --- diccionario /Sig (texto propio para conocer las posiciones exactas)
  const sigDictText =
    `<< /Type /Sig /Filter /Adobe.PPKLite /SubFilter /ETSI.CAdES.detached` +
    ` /ByteRange ${BYTE_RANGE_PLACEHOLDER}` +
    ` /Contents <${'0'.repeat(SIGNATURE_HEX_LENGTH)}>` +
    ` /M ${PDFString.of(pdfDate(now)).toString()}` +
    ` /Name ${PDFHexString.fromText(cn).toString()}` +
    (opts.reason ? ` /Reason ${PDFHexString.fromText(opts.reason).toString()}` : '') +
    ` >>`

  // --- ensamblado de la actualización incremental
  const chunks: Uint8Array[] = [pdf]
  let length = pdf.length
  const push = (b: Uint8Array | string) => {
    const bytes = typeof b === 'string' ? latin1Encoder(b) : b
    chunks.push(bytes)
    length += bytes.length
  }
  const last = pdf[pdf.length - 1]
  if (last !== 0x0a && last !== 0x0d) push('\n')

  // número de objeto -> posición y número de generación de la entrada xref
  const offsets = new Map<number, { offset: number; gen: number }>()
  const writeObject = (ref: PDFRef, body: Uint8Array | string) => {
    offsets.set(ref.objectNumber, { offset: length, gen: ref.generationNumber })
    push(`${ref.objectNumber} ${ref.generationNumber} obj\n`)
    push(body)
    push('\nendobj\n')
  }

  offsets.set(sigRef.objectNumber, { offset: length, gen: sigRef.generationNumber })
  const sigHeader = `${sigRef.objectNumber} ${sigRef.generationNumber} obj\n`
  const sigStart = length + sigHeader.length
  push(`${sigHeader}${sigDictText}\nendobj\n`)
  const byteRangePos = sigStart + sigDictText.indexOf(BYTE_RANGE_PLACEHOLDER)
  const contentsStart = sigStart + sigDictText.indexOf('/Contents <') + '/Contents '.length // posición de '<'
  const contentsEnd = contentsStart + SIGNATURE_HEX_LENGTH + 2 // posición tras '>'

  for (const [ref, obj] of [...updates].sort((a, b) => a[0].objectNumber - b[0].objectNumber)) {
    writeObject(ref, serialize(obj))
  }

  const trailerEntries = (size: number) => {
    const t = ctx.trailerInfo
    const id =
      t.ID instanceof PDFArray
        ? t.ID.toString()
        : (() => {
            const hex = forge.md.sha256.create().update(toBinary(pdf.subarray(0, 4096))).digest().toHex().slice(0, 32)
            return `[<${hex}> <${hex}>]`
          })()
    return (
      `/Size ${size} /Root ${rootRef.toString()}` +
      (t.Info ? ` /Info ${t.Info.toString()}` : '') +
      ` /ID ${id} /Prev ${prev.offset}`
    )
  }

  const xrefOffset = length
  if (prev.isStream) {
    const xrefRef = ctx.nextRef()
    offsets.set(xrefRef.objectNumber, { offset: xrefOffset, gen: xrefRef.generationNumber })
    const nums = [...offsets.keys()].sort((a, b) => a - b)
    const size = Math.max(prev.size, nums[nums.length - 1] + 1)
    const index: number[] = []
    const rows: number[] = []
    for (const num of nums) {
      if (index.length && index[index.length - 2] + index[index.length - 1] === num) index[index.length - 1]++
      else index.push(num, 1)
      const { offset: off, gen } = offsets.get(num)!
      rows.push(1, (off >>> 24) & 0xff, (off >>> 16) & 0xff, (off >>> 8) & 0xff, off & 0xff, (gen >>> 8) & 0xff, gen & 0xff)
    }
    const data = new Uint8Array(rows)
    push(
      `${xrefRef.objectNumber} ${xrefRef.generationNumber} obj\n<< /Type /XRef ${trailerEntries(size)} /Index [${index.join(' ')}] /W [1 4 2] /Length ${data.length} >>\nstream\n`,
    )
    push(data)
    push('\nendstream\nendobj\n')
  } else {
    const nums = [...offsets.keys()].sort((a, b) => a - b)
    const size = Math.max(prev.size, nums[nums.length - 1] + 1)
    // Se repite la entrada 0 (cabeza de la lista de libres), como en el ejemplo de
    // actualización incremental de ISO 32000-1 §7.5.6; algunos lectores estrictos
    // esperan que cada tabla empiece por el objeto 0.
    let table = 'xref\n0 1\n0000000000 65535 f\r\n'
    for (let i = 0; i < nums.length; ) {
      let j = i
      while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++
      table += `${nums[i]} ${j - i + 1}\n`
      for (let k = i; k <= j; k++) {
        const { offset, gen } = offsets.get(nums[k])!
        table += `${String(offset).padStart(10, '0')} ${String(gen).padStart(5, '0')} n\r\n`
      }
      i = j + 1
    }
    push(`${table}trailer\n<< ${trailerEntries(size)} >>\n`)
  }
  push(`startxref\n${xrefOffset}\n%%EOF\n`)

  const out = new Uint8Array(length)
  let pos = 0
  for (const c of chunks) {
    out.set(c, pos)
    pos += c.length
  }

  // --- ByteRange definitivo (misma longitud que el placeholder)
  const byteRange = [0, contentsStart, contentsEnd, length - contentsEnd]
  let brText = `[${byteRange.join(' ')}`
  brText = `${brText}${' '.repeat(BYTE_RANGE_PLACEHOLDER.length - brText.length - 1)}]`
  if (brText.length !== BYTE_RANGE_PLACEHOLDER.length) throw readError()
  out.set(latin1Encoder(brText), byteRangePos)

  // --- CMS sobre los dos tramos
  const signedBytes = toBinary(out.subarray(0, contentsStart)) + toBinary(out.subarray(contentsEnd))
  const cmsHex = forge.util.bytesToHex(createCms(signedBytes, signer))
  if (cmsHex.length > SIGNATURE_HEX_LENGTH) {
    throw new PdfSignError(
      'La cadena de certificados no cabe en el espacio reservado para la firma (16 KB). Usa un certificado con una cadena más corta.',
    )
  }
  out.set(latin1Encoder(cmsHex.padEnd(SIGNATURE_HEX_LENGTH, '0')), contentsStart + 1)
  return out
}
