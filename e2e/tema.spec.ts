import { test, expect } from '@playwright/test'

// La app es siempre clara: aunque el sistema pida modo oscuro, fondo blanco y letras negras.
test.use({ colorScheme: 'dark' })

test('con el sistema en oscuro la app sigue en modo claro', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Firmar un documento' })).toBeVisible()
  const estilo = await page.evaluate(() => {
    const cs = getComputedStyle(document.body)
    return { fondo: cs.backgroundColor, texto: cs.color, esquema: getComputedStyle(document.documentElement).colorScheme }
  })
  expect(estilo.fondo).toBe('rgb(255, 255, 255)')
  expect(estilo.texto).toBe('rgb(0, 0, 0)')
  expect(estilo.esquema).toBe('light')
})
