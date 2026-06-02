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

// 通知点击：聚焦已有页面，没有则打开 claude-chat。
// 移动端通知只能经 registration.showNotification() 弹出（new Notification 构造器在手机被禁），
// 故这里承接点击行为。
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || '/tools/claude-chat'
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of wins) {
      if ('focus' in c) return c.focus()
    }
    if (self.clients.openWindow) return self.clients.openWindow(target)
  })())
})
