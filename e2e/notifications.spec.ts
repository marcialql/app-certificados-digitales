import { expect, test, type Page } from '@playwright/test'

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'

// El navegador de pruebas no tiene servicio push real: se simulan las APIs.
async function stubPush(page: Page, opts: { hasPush: boolean; standalone?: boolean; permission?: string }) {
  await page.addInitScript((o) => {
    if (o.standalone) Object.defineProperty(navigator, 'standalone', { value: true, configurable: true })
    let current: unknown = null
    const fakeSub = {
      unsubscribe: async () => { current = null; return true },
      endpoint: 'https://push.example.com/abc',
      toJSON: () => ({ endpoint: 'https://push.example.com/abc', keys: { p256dh: 'p256-clave', auth: 'auth-clave' } }),
    }
    if (o.hasPush) {
      ;(window as any).PushManager = function PushManager() {}
      Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: { ready: Promise.resolve({ pushManager: { subscribe: async () => { current = fakeSub; return fakeSub }, getSubscription: async () => current } }) },
      })
    } else {
      delete (window as any).PushManager
    }
    let perm = o.permission ?? 'default'
    const N: any = function Notification() {}
    Object.defineProperty(N, 'permission', { get: () => perm })
    N.requestPermission = async () => { perm = 'granted'; return perm }
    ;(window as any).Notification = N
  }, opts)
}

async function stubApi(page: Page) {
  const posted: unknown[] = []
  await page.route('**/api/vapid-key', (r) => r.fulfill({ json: { publicKey: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U' } }))
  await page.route('**/api/subscribe', async (r) => {
    posted.push(r.request().postDataJSON())
    await r.fulfill({ status: 201, json: { ok: true } })
  })
  return posted
}

async function openAvisos(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Avisos' }).click()
  await expect(page.getByRole('heading', { name: 'Avisos' })).toBeVisible()
}

test.describe('iPhone sin instalar', () => {
  test.use({ userAgent: IPHONE_UA })
  test('muestra la instrucción de instalación y no ofrece activar', async ({ page }) => {
    await stubPush(page, { hasPush: false })
    await openAvisos(page)
    await expect(page.getByText("Toca el botón Compartir y elige 'Añadir a pantalla de inicio'")).toBeVisible()
    await expect(page.getByRole('button', { name: 'Activar avisos' })).toHaveCount(0)
  })
})

test.describe('Android', () => {
  test.use({ userAgent: ANDROID_UA })

  test('activa los avisos y envía solo la suscripción', async ({ page }) => {
    await stubPush(page, { hasPush: true })
    const posted = await stubApi(page)
    await openAvisos(page)
    await page.getByRole('button', { name: 'Activar avisos' }).click()
    await expect(page.getByText('Los avisos están activados')).toBeVisible()
    expect(posted).toEqual([{ endpoint: 'https://push.example.com/abc', keys: { p256dh: 'p256-clave', auth: 'auth-clave' } }])
  })

  test('sin soporte lo explica', async ({ page }) => {
    await stubPush(page, { hasPush: false })
    await openAvisos(page)
    await expect(page.getByText('Este navegador no permite recibir avisos')).toBeVisible()
  })

  test('permiso denegado lo explica', async ({ page }) => {
    await stubPush(page, { hasPush: true, permission: 'denied' })
    await openAvisos(page)
    await expect(page.getByText(/bloqueado los avisos/)).toBeVisible()
  })

  test('si falla el registro muestra el error y deja reintentar', async ({ page }) => {
    await stubPush(page, { hasPush: true })
    await stubApi(page)
    let status = 500
    await page.route('**/api/subscribe', (r) => r.fulfill({ status, json: { ok: status === 201 } }))
    await openAvisos(page)
    await page.getByRole('button', { name: 'Activar avisos' }).click()
    await expect(page.getByText('No se pudieron activar los avisos. Inténtalo de nuevo.')).toBeVisible()
    await expect(page.getByText('Los avisos están activados')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Activar avisos' })).toBeVisible()
    status = 201
    await page.getByRole('button', { name: 'Activar avisos' }).click()
    await expect(page.getByText('Los avisos están activados')).toBeVisible()
  })
})
