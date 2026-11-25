// Genera already-signed.pdf firmando blank.pdf con src/pdf/pades.ts y el certificado
// de PRUEBA src/crypto/fixtures/test-ok.p12 (contraseña "test").
// El módulo TypeScript se carga con el servidor de Vite en modo SSR.
// Nota: no es idéntico byte a byte entre ejecuciones (signingTime y /M llevan la hora actual).
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const server = await createServer({ root, configFile: false, logLevel: 'error', server: { middlewareMode: true } })
try {
  const { loadSigner } = await server.ssrLoadModule('/src/crypto/pkcs12.ts')
  const { signPdf } = await server.ssrLoadModule('/src/pdf/pades.ts')
  const fx = (p) => new Uint8Array(readFileSync(new URL(p, import.meta.url)))
  const signer = loadSigner(fx('../../crypto/fixtures/test-ok.p12'), 'test')
  const out = await signPdf(fx('./blank.pdf'), signer, { reason: 'Fixture de prueba' })
  writeFileSync(new URL('./already-signed.pdf', import.meta.url), out)
} finally {
  await server.close()
}
