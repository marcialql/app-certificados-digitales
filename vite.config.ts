/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Service worker propio (src/sw.ts) para mostrar los avisos push.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      manifest: {
        name: 'Certificado Digital',
        short_name: 'Certificado Digital',
        description: 'Firma tus PDF con tu certificado digital',
        lang: 'es',
        display: 'standalone',
        start_url: '/',
        theme_color: '#1f4e79',
        background_color: '#ffffff',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    exclude: ['e2e/**', 'node_modules/**'],
  },
})
