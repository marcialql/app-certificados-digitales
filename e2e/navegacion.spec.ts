import { test, expect } from '@playwright/test'

test('Salir en la pantalla de importar vuelve al inicio', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Firmar un documento' }).click()
  await expect(page.getByRole('heading', { name: 'Importar certificado' })).toBeVisible()
  await page.getByRole('button', { name: 'Salir' }).click()
  await expect(page.getByRole('button', { name: 'Firmar un documento' })).toBeVisible()
})
