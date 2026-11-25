import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import express from 'express'
import helmet from 'helmet'

// Servidor mínimo: sirve la PWA compilada (dist/). Todo el procesado de PDF y
// certificados ocurre en el navegador; no hay API.
export const app = express()
app.disable('x-powered-by')
app.use(
  helmet({
    hsts: { maxAge: 31536000, includeSubDomains: true },
  }),
)

const here = dirname(fileURLToPath(import.meta.url))
const dist = resolve(here, '..', 'dist')
if (existsSync(dist)) {
  app.use(express.static(dist))
}

export function listenHost(env: NodeJS.ProcessEnv = process.env): string {
  return env.HOST || '127.0.0.1'
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 3000)
  const host = listenHost()
  app.listen(port, host, () => console.log(`Servidor escuchando en ${host}:${port}`))
}
