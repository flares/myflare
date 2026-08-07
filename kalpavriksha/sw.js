/* sw.js — offline shell.
 *
 * The app shell is precached. The chant audio is *not* precached, because the
 * file may not exist yet; it is cached opportunistically the first time it is
 * fetched successfully.
 */
var CACHE = 'kalpavriksha-v2';

var SHELL = [
  './',
  './index.html',
  /* The site-wide auth gate. Outside this worker's registration scope, but
   * scope only limits which *pages* the worker controls — requests those pages
   * make are still ours to serve, so these can be precached like anything else.
   * Without them a cold offline launch would sit behind a blank page. */
  '../auth/guard.js',
  '../auth/core.js',
  '../auth/firebase-config.js',
  './styles.css',
  './store.js',
  './audio.js',
  './tree.js',
  './render.js',
  './app.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(SHELL); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (k) {
          return k === CACHE ? null : caches.delete(k);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && res.ok && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () {
        // Only a page load deserves the shell — handing index.html back for a
        // failed script request would break it on a MIME/parse error instead.
        if (req.mode === 'navigate') return caches.match('./index.html');
        throw new Error('offline and uncached: ' + req.url);
      });
    })
  );
});
