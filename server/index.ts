import { createHash, timingSafeEqual } from 'node:crypto'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import express from 'express'
import helmet from 'helmet'
import { setVapidDetails } from 'web-push'
import { notifyAll } from './notify.ts'
import { addSubscription } from './subscriptions.ts'

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) {
    throw new Error(`Falta la variable de entorno ${name}. El servidor no arranca sin configuración segura.`)
  }
  return v
}

const vapidPublic = requireEnv('VAPID_PUBLIC')
const vapidPrivate = requireEnv('VAPID_PRIVATE')
const vapidSubject = requireEnv('VAPID_SUBJECT')
const adminToken = requireEnv('ADMIN_TOKEN')
setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)

const sha = (s: string) => createHash('sha256').update(s).digest()
function tokenOk(given: string): boolean {
  // Se comparan hashes para que la longitud no afecte a timingSafeEqual.
  return timingSafeEqual(sha(given), sha(adminToken))
}

export const app = express()
app.disable('x-powered-by')
app.use(
  helmet({
    hsts: { maxAge: 31536000, includeSubDomains: true },
  }),
)
app.use(express.json({ limit: '10kb' }))

app.get('/api/vapid-key', (_req, res) => {
  res.json({ publicKey: vapidPublic })
})

const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0

app.post('/api/subscribe', (req, res) => {
  const b = (req.body ?? {}) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }
  let https = false
  try {
    https = isStr(b.endpoint) && new URL(b.endpoint).protocol === 'https:'
  } catch {
    https = false
  }
  if (!https || !isStr(b.keys?.p256dh) || !isStr(b.keys?.auth)) {
    res.status(400).json({ error: 'Suscripción no válida' })
    return
  }
  addSubscription({
    endpoint: b.endpoint as string,
    keys: { p256dh: b.keys.p256dh, auth: b.keys.auth },
  })
  res.status(201).json({ ok: true })
})

app.post('/api/notify', async (req, res) => {
  const header = req.get('authorization') ?? ''
  const m = /^Bearer (.+)$/.exec(header)
  if (!m || !tokenOk(m[1])) {
    res.status(401).json({ error: 'No autorizado' })
    return
  }
  const { title, body } = (req.body ?? {}) as { title?: unknown; body?: unknown }
  if (!isStr(title) || !isStr(body) || title.length > 120 || body.length > 500) {
    res.status(400).json({ error: 'Título (máx. 120) y texto (máx. 500) obligatorios' })
    return
  }
  res.json(await notifyAll(title, body))
})

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
