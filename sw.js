/* Mates service worker — versioned precache, cache-first with
 * network fallback. Bump VERSION on every release: old caches are
 * deleted on activate so the app always picks up new assets. */

const VERSION = 'mates-v1';
const ASSETS = [
  './',
  'index.html',
  'manifest.json',
  'css/styles.css',
  'js/i18n/en.js',
  'js/i18n/es.js',
  'js/i18n.js',
  'js/avatar.js',
  'js/storage.js',
  'js/badges.js',
  'js/questions.js',
  'js/round.js',
  'js/modes/level.js',
  'js/modes/adaptive.js',
  'js/modes/timed.js',
  'js/app.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-192.png',
  'icons/maskable-512.png',
  'icons/apple-touch-icon.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(VERSION).then(function (cache) {
      return cache.addAll(ASSETS);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) {
        return k.indexOf('mates-') === 0 && k !== VERSION;
      }).map(function (k) { return caches.delete(k); }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (event) {
  const req = event.request;
  if (req.method !== 'GET') return;

  event.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        // Only cache successful same-origin responses.
        if (res.ok && req.url.indexOf(self.location.origin) === 0) {
          const copy = res.clone();
          caches.open(VERSION).then(function (cache) {
            cache.put(req, copy);
          });
        }
        return res;
      }).catch(function () {
        // Offline navigation: fall back to the cached app shell.
        if (req.mode === 'navigate') return caches.match('index.html');
        return Response.error();
      });
    })
  );
});
