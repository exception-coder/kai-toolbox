// Minimal service worker — required by Chrome for the install prompt.
// Intentionally cache-less: defer to the network so dev/prod assets stay fresh.
self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  // No-op fetch handler. Presence is what Chrome's installability check needs.
})
