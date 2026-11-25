import { expect, test, type Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'

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

test('Ajustes borra el certificado tras confirmar y firmar vuelve a pedir importarlo', async ({ page }) => {
  await importCert(page)
  await page.getByRole('button', { name: 'Salir' }).click()

  // Cancelar no borra nada.
  await page.getByRole('button', { name: 'Ajustes' }).click()
  await expect(page.getByRole('heading', { name: 'Ajustes' })).toBeVisible()
  await page.getByRole('button', { name: 'Borrar certificado / importar otro' }).click()
  await page.getByRole('button', { name: 'Cancelar' }).click()
  await page.getByRole('button', { name: 'Salir' }).click()
  await page.getByRole('button', { name: 'Firmar un documento' }).click()
  await expect(page.getByRole('heading', { name: 'Firmar un documento' })).toBeVisible()
  await page.getByRole('button', { name: 'Salir' }).click()

  // Confirmar borra y lleva a importar.
  await page.getByRole('button', { name: 'Ajustes' }).click()
  await page.getByRole('button', { name: 'Borrar certificado / importar otro' }).click()
  await expect(page.getByText('¿Borrar el certificado de este móvil?')).toBeVisible()
  await page.getByRole('button', { name: 'Sí, borrar' }).click()
  await expect(page.getByRole('heading', { name: 'Importar certificado' })).toBeVisible()

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
          const tx = req.result.transaction('cert', 'readwrite')
          tx.objectStore('cert').delete('cert')
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
