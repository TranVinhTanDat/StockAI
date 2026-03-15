// StockAI VN — Service Worker (Push Notifications)
// Version: 1.0

const CACHE_NAME = 'stockai-v1'

// ── Install ────────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  self.skipWaiting()
})

// ── Activate ───────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim())
})

// ── Push notification received ─────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return

  let data
  try {
    data = event.data.json()
  } catch {
    data = { title: 'StockAI VN', body: event.data.text() }
  }

  const title = data.title || 'StockAI VN — Cảnh báo giá'
  const options = {
    body: data.body || '',
    icon: '/logo.svg',
    badge: '/logo.svg',
    tag: data.tag || 'stockai-alert',
    data: { url: data.url || '/' },
    requireInteraction: true,
    vibrate: [200, 100, 200, 100, 200],
    actions: [
      { action: 'view', title: 'Xem chi tiết' },
      { action: 'dismiss', title: 'Bỏ qua' },
    ],
  }

  event.waitUntil(
    self.registration.showNotification(title, options)
  )
})

// ── Notification click ─────────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  if (event.action === 'dismiss') return

  const url = event.notification.data?.url || '/'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // If app window is already open, focus it
      for (const client of windowClients) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          return client.focus()
        }
      }
      // Otherwise open new window
      return clients.openWindow(url)
    })
  )
})
