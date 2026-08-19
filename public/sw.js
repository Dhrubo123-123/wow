// ASCEND service worker (Phase 19) — hand-written, no Workbox/next-pwa
// dependency. Deliberately minimal: cache the offline fallback shell and
// a handful of static assets, network-first for everything else so
// authenticated/dynamic pages never serve stale data. This is NOT a
// full offline-first app (quests/AI evaluation need the network
// regardless) — it exists so navigating while offline shows a
// deliberate "you're offline" screen instead of the browser's own error.

const CACHE_NAME = "ascend-shell-v1";
const OFFLINE_URL = "/offline";
const PRECACHE_URLS = [OFFLINE_URL, "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  // Navigations: try the network first (this app is dynamic/
  // authenticated, never serve a cached page as if it were live), fall
  // back to the offline shell only when the network is truly
  // unreachable.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL).then((res) => res || Response.error())),
    );
    return;
  }

  // Static assets: cache-first, since these are content-hashed by Next.
  if (request.url.includes("/icons/") || request.url.includes("/_next/static/")) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request)),
    );
  }
});

// Roadmap item 6 — opt-in Web Push. Payload is plain JSON
// ({ title, body, url }) written by lib/push/send.ts server-side.
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || "EMBER", {
      body: payload.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: payload.url || "/dashboard" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/dashboard";
  event.waitUntil(self.clients.openWindow(url));
});
