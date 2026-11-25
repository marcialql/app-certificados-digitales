import forge from 'node-forge'

export type Signer = {
  privateKey: forge.pki.PrivateKey
  certificate: forge.pki.Certificate
  chain: forge.pki.Certificate[]
}

export class Pkcs12Error extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'Pkcs12Error'
  }
}

const fmtDate = (d: Date) =>
  `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`

function toBinary(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return s
}

export function loadSigner(p12: Uint8Array, password: string, now: Date = new Date()): Signer {
  let p12Asn1: forge.asn1.Asn1
  try {
    p12Asn1 = forge.asn1.fromDer(toBinary(p12))
  } catch {
    throw new Pkcs12Error('El archivo no es un certificado válido (.p12 o .pfx)')
  }

  let parsed: forge.pkcs12.Pkcs12Pfx
  try {
    parsed = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password)
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (/password|MAC/i.test(msg)) {
      throw new Pkcs12Error('La contraseña del certificado no es correcta')
    }
    throw new Pkcs12Error('No se ha podido leer el certificado')
  }

  const keyBags =
    parsed.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? []
  const plainKeyBags = parsed.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ?? []
  const privateKey = [...keyBags, ...plainKeyBags].find((b) => b.key)?.key
  const certs = (parsed.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [])
    .map((b) => b.cert)
    .filter((c): c is forge.pki.Certificate => !!c)

  if (!privateKey || certs.length === 0) {
    throw new Pkcs12Error('El archivo no contiene una clave privada y un certificado')
  }

  // El certificado del firmante es el que corresponde a la clave privada
  const pub = privateKey as forge.pki.rsa.PrivateKey
  const certificate =
    certs.find((c) => {
      const k = c.publicKey as forge.pki.rsa.PublicKey
      return k.n && pub.n && k.n.compareTo(pub.n) === 0
    }) ?? certs[0]
  const chain = [certificate, ...certs.filter((c) => c !== certificate)]

  const { notBefore, notAfter } = certificate.validity
  if (now > notAfter) {
    throw new Pkcs12Error(`El certificado ha caducado el ${fmtDate(notAfter)}`)
  }
  if (now < notBefore) {
    throw new Pkcs12Error(`El certificado aún no es válido (válido desde el ${fmtDate(notBefore)})`)
  }

  const ku = certificate.getExtension('keyUsage') as { digitalSignature?: boolean } | null
  if (ku && !ku.digitalSignature) {
    throw new Pkcs12Error('Este certificado no sirve para firmar documentos')
  }

  return { privateKey, certificate, chain }
}
