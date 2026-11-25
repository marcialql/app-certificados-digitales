import { expect, test, type Page, type Request } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const p12Path = fileURLToPath(new URL('../src/crypto/fixtures/test-ok.p12', import.meta.url))
const pdfPath = fileURLToPath(new URL('../src/pdf/fixtures/two-page.pdf', import.meta.url))

const PASSWORD = 'test'
const PIN = '123456'
const pdfBytes = readFileSync(pdfPath)
const p12Bytes = readFileSync(p12Path)

const secrets: Record<string, string> = {
  'contraseña del .p12': PASSWORD,
  PIN,
  'inicio del PDF (base64)': pdfBytes.subarray(0, 32).toString('base64'),
  'inicio del .p12 (base64)': p12Bytes.subarray(0, 32).toString('base64'),
}
// Los bytes crudos también cuentan (cuerpo binario sin codificar).
const rawBinary: Record<string, Buffer> = {
  'inicio del PDF (bytes)': pdfBytes.subarray(0, 32),
  'inicio del .p12 (bytes)': p12Bytes.subarray(0, 32),
}

/** Devuelve las coincidencias de secretos en una petición (cuerpo y query). */
function findLeaks(req: { url: string; body: Buffer | null }): string[] {
  const leaks: string[] = []
  if (req.body) {
    const text = req.body.toString('latin1')
    for (const [name, value] of Object.entries(secrets)) {
      if (text.includes(value)) leaks.push(`${name} en el cuerpo`)
    }
    for (const [name, value] of Object.entries(rawBinary)) {
      if (req.body.includes(value)) leaks.push(`${name} en el cuerpo`)
    }
  }
  const query = decodeURIComponent(new URL(req.url).search)
  for (const [name, value] of Object.entries(secrets)) {
    if (query.includes(value)) leaks.push(`${name} en la URL`)
  }
  return leaks
}

async function importCert(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Firmar un documento' }).click()
  await expect(page.getByRole('heading', { name: 'Importar certificado' })).toBeVisible()
  await page.getByLabel('Archivo del certificado').setInputFiles(p12Path)
  await page.getByLabel('Contraseña del certificado').fill(PASSWORD)
  await page.getByLabel('PIN nuevo', { exact: true }).fill(PIN)
  await page.getByLabel('Repite el PIN').fill(PIN)
  await page.getByRole('button', { name: 'Guardar certificado' }).click()
  await expect(page.getByRole('heading', { name: 'Firmar un documento' })).toBeVisible()
}

test('ninguna petición contiene el PDF, el .p12, su contraseña ni el PIN', async ({ page, context }) => {
  const seen: { method: string; url: string; body: Buffer | null }[] = []
  context.on('request', (req: Request) => {
    seen.push({ method: req.method(), url: req.url(), body: req.postDataBuffer() })
  })

  await importCert(page)
  await page.getByLabel('PDF a firmar').setInputFiles(pdfPath)
  await page.getByRole('button', { name: 'Firmar', exact: true }).click()
  await page.getByLabel('PIN', { exact: true }).fill(PIN)
  await page.getByRole('button', { name: 'Aceptar' }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Guardar en el móvil' }).click()
  await downloadPromise

  expect(seen.length).toBeGreaterThan(0)
  const leaks = seen.flatMap((r) => findLeaks(r).map((l) => `${r.method} ${r.url}: ${l}`))
  expect(leaks).toEqual([])
})
