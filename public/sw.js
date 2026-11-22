// JK Curryhouse POS service worker — caches the app shell so the order screen keeps
// working through short connectivity drops, per requirement 1.6.
const CACHE_NAME = "jk-curryhouse-pos-shell-v3";
const SHELL_URLS = ["/", "/order", "/kds", "/payments", "/till", "/reports", "/admin"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first, falling back to cache when offline. Only handles same-origin
// navigation/document requests — API/data calls stay untouched and are queued
// client-side (see src/lib/store.tsx) rather than intercepted here.
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  // Never cache or fake API responses: they carry live order/customer data, and the
  // store's offline outbox already handles connectivity drops for data.
  if (url.pathname.startsWith("/api/")) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() =>
        caches
          .match(request)
          .then((cached) => cached || (request.mode === "navigate" ? caches.match("/") : Response.error()))
      )
  );
});
