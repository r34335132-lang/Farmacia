const CACHE_NAME = "farmacia-bienestar-v2"
const urlsToCache = ["/", "/pos", "/admin/dashboard", "/manifest.json", "/icon-192.jpg", "/icon-512.jpg"]

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache)))
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(cacheNames.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))),
    ),
  )
  self.clients.claim()
})

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url)
  if (url.pathname.startsWith("/api/")) {
    return
  }
  event.respondWith(caches.match(event.request).then((response) => response || fetch(event.request)))
})

self.addEventListener("push", (event) => {
  let title = "Farmacia Bienestar"
  let body = "Nueva alerta"
  let url = "/admin/dashboard"
  let tag = "farmacia-alert"

  try {
    if (event.data) {
      const text = event.data.text()
      try {
        const data = JSON.parse(text)
        title = data.title || title
        body = data.body || body
        url = data.url || url
        tag = data.tag || tag
      } catch {
        body = text
      }
    }
  } catch {
    // ignore
  }

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icon-192.jpg",
      badge: "/icon-192.jpg",
      tag,
      renotify: true,
      data: { url },
      vibrate: [120, 60, 120],
    }),
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || "/admin/dashboard"

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(target)
          return client.focus()
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(target)
      }
    }),
  )
})
