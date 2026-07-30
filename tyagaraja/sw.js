/* Kṛti Kōśam service worker.
 *
 * The app shell and the dataset are both static files that only change when a
 * new version is deployed, so: cache-first for the shell (instant launch,
 * works offline on the bus), network-first with a cache fallback for the JSON
 * so a freshly published dataset shows up without waiting for a cache bust.
 *
 * Bump CACHE when shipping — the activate handler drops every other cache. */

const CACHE = 'kriti-kosam-v1';

const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

const DATA = [
  './data/dataset.json',
  './data/kritis.json',
  './data/ragas.json',
  './data/talas.json',
  './data/groups.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Don't let one 404 sink the whole install.
    await Promise.allSettled([...SHELL, ...DATA].map((url) => cache.add(url)));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const isData = url.pathname.includes('/data/') && url.pathname.endsWith('.json');

  if (isData) {
    // Fresh data when online, last known data when not.
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        if (fresh && fresh.ok) {
          const cache = await caches.open(CACHE);
          cache.put(request, fresh.clone());
        }
        return fresh;
      } catch (e) {
        const cached = await caches.match(request);
        if (cached) return cached;
        throw e;
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const fresh = await fetch(request);
      if (fresh && fresh.ok && url.pathname.startsWith('/tyagaraja/')) {
        const cache = await caches.open(CACHE);
        cache.put(request, fresh.clone());
      }
      return fresh;
    } catch (e) {
      // A navigation that missed the cache still deserves the app shell.
      if (request.mode === 'navigate') {
        const shell = await caches.match('./index.html');
        if (shell) return shell;
      }
      throw e;
    }
  })());
});
