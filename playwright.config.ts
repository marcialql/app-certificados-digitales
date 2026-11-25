import { defineConfig, devices } from '@playwright/test'

// Los perfiles de móvil se emulan sobre Chromium. Por defecto usa el Chromium que
// instala Playwright (`npx playwright install chromium`); CHROMIUM_PATH permite otro binario.
const launchOptions = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}

export default defineConfig({
  testDir: './e2e',
  webServer: {
    command: 'npx vite --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
  },
  use: { baseURL: 'http://localhost:5173', trace: 'off' },
  projects: [
    {
      name: 'iPhone 14',
      use: { ...devices['iPhone 14'], defaultBrowserType: 'chromium', launchOptions },
    },
    {
      name: 'Pixel 7',
      use: { ...devices['Pixel 7'], launchOptions },
    },
  ],
})
