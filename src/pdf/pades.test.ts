// @vitest-environment node
import { readFileSync } from 'node:fs'
import forge from 'node-forge'
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRef } from 'pdf-lib'
import { beforeAll, describe, expect, it } from 'vitest'
import { loadSigner, type Signer } from '../crypto/pkcs12'
import { PdfSignError, signingCertificateV2Attribute, signPdf } from './pades'

const asn1 = forge.asn1
const fx = (n: string) => new Uint8Array(readFileSync(new URL(`./fixtures/${n}`, import.meta.url)))
const latin1 = (b: Uint8Array) => new TextDecoder('latin1').decode(b)
const toBinary = (b: Uint8Array) => {
  let s = ''
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000))
  return s
}
/** El CMS va relleno con ceros hasta 16 KB: se recorta a la longitud que indica su cabecera DER. */
function cmsFromContents(hex: string): string {
  const bin = forge.util.hexToBytes(hex)
  const first = bin.charCodeAt(1)
  if (first < 0x80) return bin.slice(0, 2 + first)
  const n = first & 0x7f
  let len = 0
  for (let i = 0; i < n; i++) len = len * 256 + bin.charCodeAt(2 + i)
  return bin.slice(0, 2 + n + len)
}
const sha256 = (binary: string) => forge.md.sha256.create().update(binary).digest().bytes()

const OID_SIGNING_CERT_V2 = '1.2.840.113549.1.9.16.2.47'

type ParsedSig = {
  byteRange: [number, number, number, number]
  cmsDer: string
  signedBytes: string
}

/** Extrae todas las firmas (ByteRange + CMS) del PDF, en orden de aparición. */
function parseSignatures(pdf: Uint8Array): ParsedSig[] {
  const text = latin1(pdf)
  const out: ParsedSig[] = []
  const re = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const br = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])] as [number, number, number, number]
    const contents = text.slice(br[1], br[2])
    expect(contents.startsWith('<')).toBe(true)
    expect(contents.endsWith('>')).toBe(true)
    const signedBytes =
      toBinary(pdf.subarray(br[0], br[0] + br[1])) + toBinary(pdf.subarray(br[2], br[2] + br[3]))
    out.push({ byteRange: br, cmsDer: cmsFromContents(contents.slice(1, -1)), signedBytes })
  }
  return out
}

type SignerInfoParts = {
  signedAttrs: forge.asn1.Asn1
  signature: string
  attr: (oid: string) => forge.asn1.Asn1 | undefined
}

function signerInfoOf(cmsDer: string): SignerInfoParts {
  const contentInfo = asn1.fromDer(cmsDer)
  const signedData = (contentInfo.value as forge.asn1.Asn1[])[1].value[0] as forge.asn1.Asn1
  const sdParts = signedData.value as forge.asn1.Asn1[]
  const signerInfos = sdParts[sdParts.length - 1]
  const si = (signerInfos.value as forge.asn1.Asn1[])[0].value as forge.asn1.Asn1[]
  const signedAttrs = si.find((n) => n.tagClass === asn1.Class.CONTEXT_SPECIFIC && n.type === 0)!
  const signature = si[si.length - 1].value as string
  const attr = (oid: string) =>
    (signedAttrs.value as forge.asn1.Asn1[]).find(
      (a) => asn1.derToOid((a.value as forge.asn1.Asn1[])[0].value as string) === oid,
    )
  return { signedAttrs, signature, attr }
}

const attrValue = (a: forge.asn1.Asn1) => ((a.value as forge.asn1.Asn1[])[1].value as forge.asn1.Asn1[])[0]

/** issuer del TBSCertificate, tal cual está en el DER del certificado. */
function rawIssuerDer(certDer: string): string {
  const tbs = (asn1.fromDer(certDer).value as forge.asn1.Asn1[])[0].value as forge.asn1.Asn1[]
  const hasVersion = tbs[0].tagClass === asn1.Class.CONTEXT_SPECIFIC && tbs[0].type === 0
  return asn1.toDer(tbs[hasVersion ? 3 : 2]).getBytes()
}

/** issuer dentro de issuerSerial de un atributo signingCertificateV2. */
function issuerFromAttribute(attr: forge.asn1.Asn1): string {
  const ess = ((attrValue(attr).value as forge.asn1.Asn1[])[0].value as forge.asn1.Asn1[])[0].value as forge.asn1.Asn1[]
  const generalName = ((ess[1].value as forge.asn1.Asn1[])[0].value as forge.asn1.Asn1[])[0]
  return asn1.toDer((generalName.value as forge.asn1.Asn1[])[0]).getBytes()
}

type XrefEntry = { offset: number; gen: number }

/** Lee las entradas de la ÚLTIMA sección xref (tabla clásica o flujo XRef sin filtro). */
function lastXrefEntries(pdf: Uint8Array): Map<number, XrefEntry> {
  const text = latin1(pdf)
  const startxref = Number(/startxref\s+(\d+)\s+%%EOF\s*$/.exec(text)![1])
  const entries = new Map<number, XrefEntry>()
  if (text.startsWith('xref', startxref)) {
    const end = text.indexOf('trailer', startxref)
    const lines = text.slice(startxref + 4, end).trim().split(/\r?\n/)
    let num = 0
    for (const line of lines) {
      const sub = /^(\d+) (\d+)$/.exec(line.trim())
      if (sub) {
        num = Number(sub[1])
        continue
      }
      const e = /^(\d{10}) (\d{5}) ([nf])/.exec(line)!
      if (e[3] === 'n') entries.set(num, { offset: Number(e[1]), gen: Number(e[2]) })
      num++
    }
    return entries
  }
  const dictEnd = text.indexOf('stream', startxref)
  const dict = text.slice(startxref, dictEnd)
  expect(dict).toContain('/Type /XRef')
  expect(dict).not.toContain('/Filter')
  const w = /\/W \[(\d+) (\d+) (\d+)\]/.exec(dict)!.slice(1).map(Number)
  const index = /\/Index \[([\d ]+)\]/.exec(dict)![1].trim().split(/\s+/).map(Number)
  let p = dictEnd + 'stream\n'.length
  const read = (n: number) => {
    let v = 0
    for (let i = 0; i < n; i++) v = v * 256 + pdf[p++]
    return v
  }
  for (let i = 0; i < index.length; i += 2) {
    for (let k = 0; k < index[i + 1]; k++) {
      const type = read(w[0])
      const offset = read(w[1])
      const gen = read(w[2])
      if (type === 1) entries.set(index[i] + k, { offset, gen })
    }
  }
  return entries
}

/**
 * PDF sintético mínimo cuyo objeto página es `3 1 obj` (generación 1), con tabla
 * xref clásica o con flujo XRef sin comprimir.
 */
function pdfWithGeneration1(xrefStream: boolean): Uint8Array {
  const objs: [number, number, string][] = [
    [1, 0, '<< /Type /Catalog /Pages 2 0 R >>'],
    [2, 0, '<< /Type /Pages /Kids [3 1 R] /Count 1 >>'],
    [3, 1, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >>'],
  ]
  let body = '%PDF-1.7\n'
  const offsets: number[] = []
  for (const [num, gen, dict] of objs) {
    offsets[num] = body.length
    body += `${num} ${gen} obj\n${dict}\nendobj\n`
  }
  const head = new TextEncoder().encode(body)
  if (!xrefStream) {
    let xref = 'xref\n0 4\n0000000000 65535 f\r\n'
    for (const [num, gen] of objs) xref += `${String(offsets[num]).padStart(10, '0')} ${String(gen).padStart(5, '0')} n\r\n`
    const tail = `${xref}trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${head.length}\n%%EOF\n`
    return new Uint8Array([...head, ...new TextEncoder().encode(tail)])
  }
  const xrefOffset = head.length
  const row = (t: number, off: number, gen: number) => [t, (off >>> 24) & 255, (off >>> 16) & 255, (off >>> 8) & 255, off & 255, gen >> 8, gen & 255]
  const data = [...row(0, 0, 65535), ...objs.flatMap(([num, gen]) => row(1, offsets[num], gen)), ...row(1, xrefOffset, 0)]
  const pre = new TextEncoder().encode(
    `4 0 obj\n<< /Type /XRef /Size 5 /Root 1 0 R /W [1 4 2] /Index [0 5] /Length ${data.length} >>\nstream\n`,
  )
  const post = new TextEncoder().encode(`\nendstream\nendobj\nstartxref\n${xrefOffset}\n%%EOF\n`)
  return new Uint8Array([...head, ...pre, ...data, ...post])
}

let signer: Signer
beforeAll(() => {
  signer = loadSigner(
    new Uint8Array(readFileSync(new URL('../crypto/fixtures/test-ok.p12', import.meta.url))),
    'test',
  )
})

describe('signPdf', () => {
  it('añade un diccionario /Sig PAdES con /ByteRange', async () => {
    const out = await signPdf(fx('blank.pdf'), signer)
    const text = latin1(out)
    expect(text).toContain('/Type /Sig')
    expect(text).toContain('/SubFilter /ETSI.CAdES.detached')
    expect(text).toContain('/ByteRange')

    // El resultado sigue siendo un PDF legible con el campo de firma en la última página
    const doc = await PDFDocument.load(out)
    const acro = doc.catalog.lookup(PDFName.of('AcroForm'), PDFDict)
    expect(acro.lookup(PDFName.of('SigFlags'), PDFNumber).asNumber()).toBe(3)
    const annots = doc.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray)
    expect(annots.size()).toBe(1)
  })

  it('el SHA-256 del ByteRange coincide con el messageDigest del CMS y la firma RSA es válida', async () => {
    const out = await signPdf(fx('blank.pdf'), signer)
    const [sig] = parseSignatures(out)
    const [b0, l0, b1, l1] = sig.byteRange
    expect(b0).toBe(0)
    expect(b1 + l1).toBe(out.length)
    expect(b1 - l0).toBe(32768 + 2) // < + 16 KB en hex + >

    // forge.pkcs7 reconoce el CMS: SignedData con el certificado del firmante
    const p7 = forge.pkcs7.messageFromAsn1(asn1.fromDer(sig.cmsDer)) as forge.pkcs7.PkcsSignedData
    expect(p7.certificates[0].serialNumber).toBe(signer.certificate.serialNumber)

    const si = signerInfoOf(sig.cmsDer)
    const md = attrValue(si.attr(forge.pki.oids.messageDigest)!).value as string
    expect(forge.util.bytesToHex(md)).toBe(forge.util.bytesToHex(sha256(sig.signedBytes)))
    expect(si.attr(forge.pki.oids.contentType)).toBeTruthy()
    // PAdES baseline: sin atributo signing-time (la hora va en /M)
    expect(si.attr(forge.pki.oids.signingTime)).toBeUndefined()
    expect(latin1(out)).toMatch(/\/M \(D:\d{14}Z\)/)

    // La firma cubre los atributos firmados codificados como SET OF (RFC 5652 §5.4)
    const set = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SET, true, si.signedAttrs.value as forge.asn1.Asn1[])
    const digest = forge.md.sha256.create().update(asn1.toDer(set).getBytes())
    const pub = signer.certificate.publicKey as forge.pki.rsa.PublicKey
    expect(pub.verify(digest.digest().bytes(), si.signature)).toBe(true)
  })

  it('incluye signingCertificateV2 con el hash SHA-256 del certificado y issuerSerial', async () => {
    const out = await signPdf(fx('blank.pdf'), signer)
    const si = signerInfoOf(parseSignatures(out)[0].cmsDer)
    const attr = si.attr(OID_SIGNING_CERT_V2)
    expect(attr).toBeTruthy()

    // Ida y vuelta: se vuelve a parsear el DER del atributo
    const reparsed = asn1.fromDer(asn1.toDer(attrValue(attr!)).getBytes())
    const certs = (reparsed.value as forge.asn1.Asn1[])[0].value as forge.asn1.Asn1[]
    expect(certs).toHaveLength(1)
    const essCertIdV2 = certs[0].value as forge.asn1.Asn1[]
    // hashAlgorithm es SHA-256 por DEFAULT, así que en DER se omite: el primer campo es el certHash
    expect(essCertIdV2[0].type).toBe(asn1.Type.OCTETSTRING)
    const certDer = asn1.toDer(forge.pki.certificateToAsn1(signer.certificate)).getBytes()
    expect(forge.util.bytesToHex(essCertIdV2[0].value as string)).toBe(forge.util.bytesToHex(sha256(certDer)))

    const issuerSerial = essCertIdV2[1].value as forge.asn1.Asn1[]
    const generalName = (issuerSerial[0].value as forge.asn1.Asn1[])[0]
    expect(generalName.tagClass).toBe(asn1.Class.CONTEXT_SPECIFIC)
    expect(generalName.type).toBe(4) // directoryName
    const issuerDer = asn1.toDer((generalName.value as forge.asn1.Asn1[])[0]).getBytes()
    const expectedIssuer = rawIssuerDer(asn1.toDer(forge.pki.certificateToAsn1(signer.certificate)).getBytes())
    expect(forge.util.bytesToHex(issuerDer)).toBe(forge.util.bytesToHex(expectedIssuer))
    expect(forge.util.bytesToHex(issuerSerial[1].value as string)).toBe(signer.certificate.serialNumber)
  })

  it('por defecto firma en la última página, esquina inferior derecha, 180×60 pt', async () => {
    const out = await signPdf(fx('two-page.pdf'), signer)
    const doc = await PDFDocument.load(out)
    const firstAnnots = doc.getPage(0).node.lookupMaybe(PDFName.of('Annots'), PDFArray)
    expect(firstAnnots?.size() ?? 0).toBe(0)
    const last = doc.getPage(1)
    const annots = last.node.lookup(PDFName.of('Annots'), PDFArray)
    const widget = annots.lookup(0, PDFDict)
    expect(widget.get(PDFName.of('FT'))).toBe(PDFName.of('Sig'))
    expect(widget.get(PDFName.of('P'))).toBe(last.ref)
    const rect = widget.lookup(PDFName.of('Rect'), PDFArray)
    const [x1, y1, x2, y2] = [0, 1, 2, 3].map((i) => rect.lookup(i, PDFNumber).asNumber())
    const { width } = last.getSize()
    expect(x2 - x1).toBeCloseTo(180)
    expect(y2 - y1).toBeCloseTo(60)
    expect(x2).toBeLessThanOrEqual(width)
    expect(x1).toBeGreaterThan(width / 2)
    expect(y1).toBeLessThan(100)
    // El PDF original con xref en flujo también conserva sus bytes como prefijo
    const original = fx('two-page.pdf')
    expect(Buffer.from(out.subarray(0, original.length)).equals(Buffer.from(original))).toBe(true)
  })

  it('actualización incremental: conserva los bytes originales y la firma previa sigue siendo válida', async () => {
    const original = fx('already-signed.pdf')
    const out = await signPdf(original, signer)
    expect(out.length).toBeGreaterThan(original.length)
    expect(Buffer.from(out.subarray(0, original.length)).equals(Buffer.from(original))).toBe(true)

    const sigs = parseSignatures(out)
    expect(sigs).toHaveLength(2)
    // La primera firma sigue cubriendo exactamente el documento original y su digest coincide
    const [first, second] = sigs
    expect(first.byteRange[2] + first.byteRange[3]).toBe(original.length)
    const md1 = attrValue(signerInfoOf(first.cmsDer).attr(forge.pki.oids.messageDigest)!).value as string
    expect(forge.util.bytesToHex(md1)).toBe(forge.util.bytesToHex(sha256(first.signedBytes)))
    // La segunda cubre todo el documento nuevo
    expect(second.byteRange[2] + second.byteRange[3]).toBe(out.length)

    const doc = await PDFDocument.load(out)
    const fields = doc.catalog.lookup(PDFName.of('AcroForm'), PDFDict).lookup(PDFName.of('Fields'), PDFArray)
    expect(fields.size()).toBe(2)
    const names = fields.asArray().map((r) => (doc.context.lookup(r as PDFRef, PDFDict).get(PDFName.of('T')) ?? '').toString())
    expect(new Set(names).size).toBe(2)
  })

  it('issuerSerial copia el issuer byte a byte, también con RDN multivaluados', () => {
    const pem = readFileSync(new URL('./fixtures/multi-rdn-issuer.pem', import.meta.url), 'utf8')
    const cert = forge.pki.certificateFromPem(pem)
    const rawDer = forge.pem.decode(pem)[0].body
    const expected = rawIssuerDer(rawDer)
    // Control: distinguishedNameToAsn1 reparte el RDN multivaluado y NO coincide
    expect(asn1.toDer(forge.pki.distinguishedNameToAsn1(cert.issuer)).getBytes()).not.toBe(expected)
    const got = issuerFromAttribute(signingCertificateV2Attribute(cert))
    expect(forge.util.bytesToHex(got)).toBe(forge.util.bytesToHex(expected))
  })

  for (const xrefStream of [false, true]) {
    it(`xref ${xrefStream ? 'en flujo' : 'clásica'}: cada entrada lleva la generación real del objeto (página 3 1 obj)`, async () => {
      const original = pdfWithGeneration1(xrefStream)
      // El PDF sintético es válido: sus propias entradas apuntan a las cabeceras correctas
      const before = lastXrefEntries(original)
      expect(before.get(3)).toEqual({ offset: expect.any(Number), gen: 1 })

      const out = await signPdf(original, signer)
      const text = latin1(out)
      const entries = lastXrefEntries(out)
      // La página (generación 1) se reescribe en la actualización con la misma generación
      expect(entries.get(3)?.gen).toBe(1)
      for (const [num, { offset, gen }] of entries) {
        expect(text.startsWith(`${num} ${gen} obj`, offset)).toBe(true)
      }
      const doc = await PDFDocument.load(out)
      expect(doc.getPage(0).ref.generationNumber).toBe(1)
      expect(doc.getPage(0).node.lookup(PDFName.of('Annots'), PDFArray).size()).toBe(1)
    })
  }

  it('PDF cifrado: PdfSignError "protegido con contraseña"', async () => {
    const p = signPdf(fx('encrypted.pdf'), signer)
    await expect(p).rejects.toBeInstanceOf(PdfSignError)
    await expect(signPdf(fx('encrypted.pdf'), signer)).rejects.toThrow('protegido con contraseña')
  })

  it('PDF de más de 30 MB: PdfSignError', async () => {
    const big = new Uint8Array(30 * 1024 * 1024 + 1)
    await expect(signPdf(big, signer)).rejects.toBeInstanceOf(PdfSignError)
    await expect(signPdf(big, signer)).rejects.toThrow('30 MB')
  })

  it('cadena de certificados demasiado grande: PdfSignError "no cabe"', async () => {
    // Cadena sintética: 24 certificados distintos (misma clave, números de serie diferentes)
    const extra: forge.pki.Certificate[] = []
    for (let i = 0; i < 24; i++) {
      const c = forge.pki.createCertificate()
      c.publicKey = signer.certificate.publicKey
      c.serialNumber = (0x1000 + i).toString(16)
      c.validity.notBefore = new Date('2020-01-01T00:00:00Z')
      c.validity.notAfter = new Date('2049-01-01T00:00:00Z')
      const name = [{ name: 'commonName', value: `Intermedia sintética ${i} ${'x'.repeat(200)}` }]
      c.setSubject(name)
      c.setIssuer(name)
      c.sign(signer.privateKey as forge.pki.rsa.PrivateKey, forge.md.sha256.create())
      extra.push(c)
    }
    const big: Signer = { ...signer, chain: [signer.certificate, ...extra] }
    await expect(signPdf(fx('blank.pdf'), big)).rejects.toBeInstanceOf(PdfSignError)
    await expect(signPdf(fx('blank.pdf'), big)).rejects.toThrow('no cabe')
  })
})
