const CACHE_NAME = 'epicea-v18';
const ASSETS = ['/styles.css', '/servers-panel.css?v=1', '/table-modal.css?v=4', '/theme.css?v=4', '/app.js?v=21', '/manifest.webmanifest', '/front-office/client.js?v=2'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => event.waitUntil(Promise.all([
  self.clients.claim(),
  caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('epicea-') && key !== CACHE_NAME).map((key) => caches.delete(key)))),
])));

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request, { cache: 'no-cache' }).catch(() => caches.match(event.request)));
    return;
  }
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});

