import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const p12Path = fileURLToPath(new URL('../src/crypto/fixtures/test-ok.p12', import.meta.url))
const pdfPath = fileURLToPath(new URL('../src/pdf/fixtures/two-page.pdf', import.meta.url))

async function importCert(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Firmar un documento' }).click()
  // Sin certificado guardado: se redirige a la importación.
  await expect(page.getByRole('heading', { name: 'Importar certificado' })).toBeVisible()
  await page.getByLabel('Archivo del certificado').setInputFiles(p12Path)
  await page.getByLabel('Contraseña del certificado').fill('test')
  await page.getByLabel('PIN nuevo', { exact: true }).fill('123456')
  await page.getByLabel('Repite el PIN').fill('123456')
  await page.getByRole('button', { name: 'Guardar certificado' }).click()
  await expect(page.getByRole('heading', { name: 'Firmar un documento' })).toBeVisible()
}

test('con varios certificados, se elige cuál firma y cada uno tiene su PIN', async ({ page }) => {
  await importCert(page)
  // Segundo certificado con otro nombre y otro PIN.
  await page.getByRole('button', { name: 'Salir' }).click()
  await page.getByRole('button', { name: 'Ajustes' }).click()
  await page.getByRole('button', { name: 'Importar otro certificado' }).click()
  await expect(page.getByRole('heading', { name: 'Importar certificado' })).toBeVisible()
  await page.getByLabel('Archivo del certificado').setInputFiles(p12Path)
  await page.getByLabel('Nombre para distinguirlo').fill('Empresa')
  await page.getByLabel('Contraseña del certificado').fill('test')
  await page.getByLabel('PIN nuevo', { exact: true }).fill('654321')
  await page.getByLabel('Repite el PIN').fill('654321')
  await page.getByRole('button', { name: 'Guardar certificado' }).click()
  await expect(page.getByRole('heading', { name: 'Firmar un documento' })).toBeVisible()

  await page.getByLabel('PDF a firmar').setInputFiles(pdfPath)
  await expect(page.getByRole('radio', { name: 'Empresa' })).toBeVisible()
  await page.getByRole('radio', { name: 'Empresa' }).check()
  await page.getByRole('button', { name: 'Firmar', exact: true }).click()
  // El PIN del primero no sirve para el segundo.
  await page.getByLabel('PIN', { exact: true }).fill('123456')
  await page.getByRole('button', { name: 'Aceptar' }).click()
  await expect(page.getByText('PIN incorrecto')).toBeVisible()
  await page.getByLabel('PIN', { exact: true }).fill('654321')
  await page.getByRole('button', { name: 'Aceptar' }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Guardar en el móvil' }).click()
  const download = await downloadPromise
  expect(readFileSync(await download.path()).subarray(0, 4).toString('latin1')).toBe('%PDF')
})

test('importa el certificado y firma un PDF con el PIN', async ({ page }) => {
  await importCert(page)
  await page.getByLabel('PDF a firmar').setInputFiles(pdfPath)
  await page.getByRole('button', { name: 'Firmar', exact: true }).click()
  await page.getByLabel('PIN', { exact: true }).fill('123456')
  await page.getByRole('button', { name: 'Aceptar' }).click()
  await expect(page.getByText('PDF firmado. ¿Qué quieres hacer?')).toBeVisible()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Guardar en el móvil' }).click()
  const download = await downloadPromise
  const bytes = readFileSync(await download.path())
  expect(bytes.subarray(0, 4).toString('latin1')).toBe('%PDF')
  expect(bytes.length).toBeGreaterThan(readFileSync(pdfPath).length)
})

test('un PIN incorrecto muestra el error y no firma', async ({ page }) => {
  await importCert(page)
  await page.getByLabel('PDF a firmar').setInputFiles(pdfPath)
  await page.getByRole('button', { name: 'Firmar', exact: true }).click()
  await page.getByLabel('PIN', { exact: true }).fill('000000')
  let downloaded = false
  page.on('download', () => { downloaded = true })
  await page.getByRole('button', { name: 'Aceptar' }).click()
  await expect(page.getByText('PIN incorrecto')).toBeVisible()
  expect(downloaded).toBe(false)
})

test('si el móvil puede compartir archivos, ofrece la hoja nativa en vez de descargar', async ({ page }) => {
  // Chromium de pruebas no tiene hoja de compartir: se simula y se anota lo compartido.
  await page.addInitScript(() => {
    const w = window as unknown as { __shared: { name: string; type: string; size: number; title?: string }[] }
    w.__shared = []
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: (d?: ShareData) => !!d?.files?.length,
    })
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (d?: ShareData) => {
        for (const f of d?.files ?? []) w.__shared.push({ name: f.name, type: f.type, size: f.size, title: d?.title })
      },
    })
  })
  await importCert(page)
  await page.getByLabel('PDF a firmar').setInputFiles(pdfPath)
  await page.getByRole('button', { name: 'Firmar', exact: true }).click()
  await page.getByLabel('PIN', { exact: true }).fill('123456')
  let downloaded = false
  page.on('download', () => { downloaded = true })
  await page.getByRole('button', { name: 'Aceptar' }).click()
  await page.getByRole('button', { name: 'Enviar por WhatsApp o correo' }).click()
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __shared: unknown[] }).__shared.length))
    .toBe(1)
  const [shared] = await page.evaluate(
    () => (window as unknown as { __shared: { name: string; type: string; size: number; title?: string }[] }).__shared,
  )
  expect(shared.name).toBe('two-page-firmado.pdf')
  expect(shared.type).toBe('application/pdf')
  expect(shared.title).toBe('two-page-firmado.pdf')
  expect(shared.size).toBeGreaterThan(readFileSync(pdfPath).length)
  expect(downloaded).toBe(false)
})
