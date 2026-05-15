// Service Worker - cache-first for static assets, network-first for HTML pages.
// The CACHE_NAME constant is rewritten at build time by scripts/bump-sw.mjs
// so every production deploy ships a different sw.js and the browser auto-
// installs the new version on next page load.
const CACHE_NAME = 'biz-manager-v1';
const STATIC_ASSETS = [
  '/',                              // app shell — needed for offline fallback
  '/manifest.json',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-512-maskable.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // addAll fails atomically if any asset 404s; do them individually so
      // a single missing icon doesn't break the whole install.
      Promise.all(STATIC_ASSETS.map((url) => cache.add(url).catch(() => null))),
    ),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never cache API, Supabase, or anything that needs to be fresh
  if (url.pathname.startsWith('/api/') || url.hostname.includes('supabase.co')) {
    return;
  }

  // HTML navigations → network-first so a UI deploy is visible on next nav.
  // (We still fall back to cache if the network is unreachable so the PWA
  // remains usable offline.)
  const isNavigation =
    request.mode === 'navigate' ||
    (request.headers.get('accept') || '').includes('text/html');

  if (isNavigation) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return res;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('/'))),
    );
    return;
  }

  // Static asset → cache-first with background refresh
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res.ok && res.type === 'basic') {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
