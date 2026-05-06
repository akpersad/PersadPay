// PersadPay service worker — install + activate + Web Push handlers.
// Pushes are sent server-side via lib/push-server.ts using web-push.
// Payload shape: { title: string, body: string, url?: string, tag?: string }.

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { title: 'PersadPay', body: event.data ? event.data.text() : '' }
  }

  const title = payload.title || 'PersadPay'
  const options = {
    body: payload.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: payload.tag,                // tag de-dupes successive notifications
    data: { url: payload.url || '/dashboard' },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus an existing tab on the same origin if there is one; otherwise open a new one.
      for (const client of clientList) {
        try {
          const url = new URL(client.url)
          if (url.origin === self.location.origin && 'focus' in client) {
            client.navigate(targetUrl).catch(() => {})
            return client.focus()
          }
        } catch { /* ignore */ }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl)
    })
  )
})
