// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import request from 'supertest'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const sendNotification = vi.fn()
vi.mock('web-push', () => ({
  setVapidDetails: vi.fn(),
  sendNotification: (...a: unknown[]) => sendNotification(...a),
}))

const dir = mkdtempSync(join(tmpdir(), 'subs-'))
process.env.SUBS_FILE = join(dir, 'subs.json')
process.env.VAPID_PUBLIC = 'test-public-key'
process.env.VAPID_PRIVATE = 'test-private-key'
process.env.VAPID_SUBJECT = 'mailto:test@example.com'
process.env.ADMIN_TOKEN = 'test-admin-token'

const { app, listenHost } = await import('./index.ts')
const { listSubscriptions, addSubscription } = await import('./subscriptions.ts')

const sub = (n: number) => ({
  endpoint: `https://push.example.com/${n}`,
  keys: { p256dh: 'p', auth: 'a' },
})
const auth = { Authorization: 'Bearer test-admin-token' }

beforeEach(() => {
  rmSync(process.env.SUBS_FILE!, { force: true })
  sendNotification.mockReset()
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('servidor de avisos', () => {
  it('/api/notify sin token -> 401', async () => {
    await request(app).post('/api/notify').send({ title: 'a', body: 'b' }).expect(401)
  })
  it('/api/notify con token incorrecto -> 401', async () => {
    await request(app).post('/api/notify').set('Authorization', 'Bearer otro').send({ title: 'a', body: 'b' }).expect(401)
  })
  it('/api/subscribe con endpoint http -> 400', async () => {
    await request(app).post('/api/subscribe').send({ ...sub(1), endpoint: 'http://push.example.com/1' }).expect(400)
  })
  it('/api/subscribe sin claves -> 400', async () => {
    await request(app).post('/api/subscribe').send({ endpoint: 'https://push.example.com/1' }).expect(400)
  })
  it('/api/subscribe válido -> 201 y no guarda otros datos', async () => {
    await request(app).post('/api/subscribe').send({ ...sub(1), name: 'Juan', expirationTime: null }).expect(201)
    expect(listSubscriptions()).toEqual([sub(1)])
  })
  it('aviso de 501 caracteres -> 400', async () => {
    await request(app).post('/api/notify').set(auth).send({ title: 't', body: 'x'.repeat(501) }).expect(400)
  })
  it('título de 121 caracteres -> 400', async () => {
    await request(app).post('/api/notify').set(auth).send({ title: 't'.repeat(121), body: 'b' }).expect(400)
  })
  it('GET /api/vapid-key devuelve la clave pública', async () => {
    const r = await request(app).get('/api/vapid-key').expect(200)
    expect(r.body).toEqual({ publicKey: 'test-public-key' })
  })
  it('incluye cabeceras de seguridad', async () => {
    const r = await request(app).get('/')
    expect(r.headers['strict-transport-security']).toBeTruthy()
    expect(r.headers['x-content-type-options']).toBe('nosniff')
    expect(r.headers['content-security-policy']).toBeTruthy()
  })
  it('envía a todos y elimina las suscripciones 410', async () => {
    addSubscription(sub(1))
    addSubscription(sub(2))
    sendNotification.mockImplementation(async (s: { endpoint: string }) => {
      if (s.endpoint.endsWith('/2')) throw Object.assign(new Error('gone'), { statusCode: 410 })
    })
    const r = await request(app).post('/api/notify').set(auth).send({ title: 'Hola', body: 'Aviso' }).expect(200)
    expect(r.body).toEqual({ sent: 1, removed: 1 })
    expect(listSubscriptions()).toEqual([sub(1)])
  })
  it('un error distinto de 404/410 no borra la suscripción', async () => {
    addSubscription(sub(1))
    sendNotification.mockRejectedValue(Object.assign(new Error('boom'), { statusCode: 500 }))
    const r = await request(app).post('/api/notify').set(auth).send({ title: 'a', body: 'b' }).expect(200)
    expect(r.body).toEqual({ sent: 0, removed: 0 })
    expect(listSubscriptions()).toHaveLength(1)
  })
  it('escucha en 127.0.0.1 por defecto y respeta HOST', () => {
    expect(listenHost({})).toBe('127.0.0.1')
    expect(listenHost({ HOST: '10.0.0.5' })).toBe('10.0.0.5')
  })
})
