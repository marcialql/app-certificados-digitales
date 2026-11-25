/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'

declare const self: ServiceWorkerGlobalScope

// Precaché de la app generada en el build (igual que antes con generateSW).
cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// registerType 'autoUpdate': la versión nueva toma el control sin esperar.
self.skipWaiting()
clientsClaim()
