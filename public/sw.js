const CACHE_NAME = "farmacia-bienestar-v3"
const urlsToCache = ["/", "/manifest.json", "/icon-192.jpg", "/icon-512.jpg"]

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
  const request = event.request
  if (request.method !== "GET") return

  const url = new URL(request.url)
  if (url.pathname.startsWith("/api/")) return

  // HTML y JS siempre de red primero (evita pantallas rotas en iPhone por caché vieja)
  const isNavigate = request.mode === "navigate"
  const isAsset =
    url.pathname.startsWith("/_next/") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".html")

  if (isNavigate || isAsset) {
    event.respondWith(
      fetch(request)
        .then((response) => response)
        .catch(async () => {
          const cached = await caches.match(request)
          return cached || caches.match("/")
        }),
    )
    return
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached
      return fetch(request)
    }),
  )
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
