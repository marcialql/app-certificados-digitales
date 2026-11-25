import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { app, listenHost } from './index.ts'

describe('servidor', () => {
  it('no tiene API de avisos', async () => {
    await request(app).post('/api/notify').send({ title: 'a', body: 'b' }).expect(404)
    await request(app).get('/api/vapid-key').expect(404)
  })
  it('escucha solo en loopback por defecto', () => {
    expect(listenHost({})).toBe('127.0.0.1')
    expect(listenHost({ HOST: '0.0.0.0' })).toBe('0.0.0.0')
  })
})
