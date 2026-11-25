import { describe, expect, it } from 'vitest'
import { getPushState } from './platform'

const IPHONE_IOS17 =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'

describe('getPushState', () => {
  it('iPhone sin standalone pide instalar la app', () => {
    expect(getPushState({ userAgent: IPHONE_IOS17, standalone: false, hasPush: true, permission: 'default', hasSubscription: false })).toBe('requiere-instalar')
  })
  it('iPhone en standalone con permiso default queda pendiente', () => {
    expect(getPushState({ userAgent: IPHONE_IOS17, standalone: true, hasPush: true, permission: 'default', hasSubscription: false })).toBe('pendiente')
  })
  it('Android en navegador con permiso concedido está activo', () => {
    expect(getPushState({ userAgent: ANDROID, standalone: false, hasPush: true, permission: 'granted', hasSubscription: true })).toBe('activo')
  })
  it('navegador sin PushManager no es soportado', () => {
    expect(getPushState({ userAgent: ANDROID, standalone: false, hasPush: false, permission: 'default', hasSubscription: false })).toBe('no-soportado')
  })
  it('permiso denegado', () => {
    expect(getPushState({ userAgent: ANDROID, standalone: false, hasPush: true, permission: 'denied', hasSubscription: false })).toBe('denegado')
  })
  it('permiso concedido sin suscripción guardada queda pendiente', () => {
    expect(getPushState({ userAgent: ANDROID, standalone: false, hasPush: true, permission: 'granted', hasSubscription: false })).toBe('pendiente')
  })
  it('permiso concedido con suscripción está activo', () => {
    expect(getPushState({ userAgent: ANDROID, standalone: false, hasPush: true, permission: 'granted', hasSubscription: true })).toBe('activo')
  })
})
