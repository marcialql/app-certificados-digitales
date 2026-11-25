/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { chooseClickAction, parsePushPayload } from './push/swHandlers'

declare const self: ServiceWorkerGlobalScope

// Precaché de la app generada en el build (igual que antes con generateSW).
cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// registerType 'autoUpdate': la versión nueva toma el control sin esperar.
self.skipWaiting()
clientsClaim()

self.addEventListener('push', (event) => {
  const { title, body } = parsePushPayload(event.data?.text())
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const action = chooseClickAction(
        windows.map((w) => w.url),
        self.location.origin,
      )
      if (action.kind === 'focus') {
        await windows[action.index].focus()
      } else {
        await self.clients.openWindow(action.url)
      }
    })(),
  )
})
