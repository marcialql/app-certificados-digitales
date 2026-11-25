import { expect, test, type Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

const p12Path = fileURLToPath(new URL('../src/crypto/fixtures/test-ok.p12', import.meta.url))
const pdfPath = fileURLToPath(new URL('../src/pdf/fixtures/two-page.pdf', import.meta.url))

async function importCert(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Firmar un documento' }).click()
  await expect(page.getByRole('heading', { name: 'Importar certificado' })).toBeVisible()
  await page.getByLabel('Archivo del certificado').setInputFiles(p12Path)
  await page.getByLabel('Contraseña del certificado').fill('test')
  await page.getByLabel('PIN nuevo', { exact: true }).fill('123456')
  await page.getByLabel('Repite el PIN').fill('123456')
  await page.getByRole('button', { name: 'Guardar certificado' }).click()
  await expect(page.getByRole('heading', { name: 'Firmar un documento' })).toBeVisible()
}

test('Ajustes borra un certificado tras confirmar y firmar vuelve a pedir importarlo', async ({ page }) => {
  await importCert(page)
  await page.getByRole('button', { name: 'Salir' }).click()

  // Cancelar no borra nada.
  await page.getByRole('button', { name: 'Ajustes' }).click()
  await expect(page.getByRole('heading', { name: 'Ajustes' })).toBeVisible()
  await page.getByRole('button', { name: 'Borrar', exact: true }).click()
  await page.getByRole('button', { name: 'Cancelar' }).click()
  await page.getByRole('button', { name: 'Salir' }).click()
  await page.getByRole('button', { name: 'Firmar un documento' }).click()
  await expect(page.getByRole('heading', { name: 'Firmar un documento' })).toBeVisible()
  await page.getByRole('button', { name: 'Salir' }).click()

  // Confirmar borra y deja la lista vacía.
  await page.getByRole('button', { name: 'Ajustes' }).click()
  await page.getByRole('button', { name: 'Borrar', exact: true }).click()
  await expect(page.getByText('¿Borrar «Titular de Prueba test-ok» de este móvil?')).toBeVisible()
  await page.getByRole('button', { name: 'Sí, borrar' }).click()
  await expect(page.getByText('No hay certificados guardados en este móvil.')).toBeVisible()

  // Desde el inicio, firmar lleva a importar porque ya no hay certificado.
  await page.goto('/')
  await page.getByRole('button', { name: 'Firmar un documento' }).click()
  await expect(page.getByRole('heading', { name: 'Importar certificado' })).toBeVisible()
})

test('sin certificado guardado, la pantalla de firma ofrece importarlo', async ({ page }) => {
  await importCert(page)
  // El certificado desaparece mientras se está en la pantalla de firma.
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('firma-pdf')
        req.onsuccess = () => {
          const tx = req.result.transaction('certs', 'readwrite')
          tx.objectStore('certs').clear()
          tx.oncomplete = () => { req.result.close(); resolve() }
          tx.onerror = () => reject(tx.error)
        }
        req.onerror = () => reject(req.error)
      }),
  )
  await page.getByLabel('PDF a firmar').setInputFiles(pdfPath)
  await page.getByRole('button', { name: 'Firmar', exact: true }).click()
  await page.getByLabel('PIN', { exact: true }).fill('123456')
  await page.getByRole('button', { name: 'Aceptar' }).click()
  await expect(page.getByText('No hay ningún certificado guardado.')).toBeVisible()
  await page.getByRole('button', { name: 'Importar certificado' }).click()
  await expect(page.getByRole('heading', { name: 'Importar certificado' })).toBeVisible()
})

test('la imagen de la firma se sube en Ajustes y aparece en el PDF firmado', async ({ page }) => {
  const pngPath = fileURLToPath(new URL('./fixtures/firma-test.png', import.meta.url))
  const pdfPath2 = fileURLToPath(new URL('../src/pdf/fixtures/two-page.pdf', import.meta.url))
  await importCert(page)
  await page.getByRole('button', { name: 'Salir' }).click()
  await page.getByRole('button', { name: 'Ajustes' }).click()
  await page.locator('input[type="file"][accept="image/png,image/jpeg"]').setInputFiles(pngPath)
  await expect(page.getByRole('img', { name: 'Tu firma' })).toBeVisible()

  // Sigue guardada tras recargar.
  await page.reload()
  await page.getByRole('button', { name: 'Ajustes' }).click()
  await expect(page.getByRole('img', { name: 'Tu firma' })).toBeVisible()
  await page.getByRole('button', { name: 'Salir' }).click()

  await page.getByRole('button', { name: 'Firmar un documento' }).click()
  await page.getByLabel('PDF a firmar').setInputFiles(pdfPath2)
  await page.getByRole('button', { name: 'Firmar', exact: true }).click()
  await page.getByLabel('PIN', { exact: true }).fill('123456')
  await page.getByRole('button', { name: 'Aceptar' }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Guardar en el móvil' }).click()
  const download = await downloadPromise
  const texto = readFileSync(await download.path()).toString('latin1')
  expect(texto).toContain('/Subtype /Image')
  expect(texto).toContain('/Im1 ')
})
