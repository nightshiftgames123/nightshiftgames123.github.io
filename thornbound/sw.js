// Offline cache for Thornbound. Bump VERSION whenever any cached file changes.
const VERSION = 'thornbound-v2';
const ASSETS = ['./', './index.html', './game.js', './manifest.webmanifest', './icon-180.png', './icon-192.png', './icon-512.png',
  './assets/goblin@0.25.png', './assets/goblin@0.5.png', './assets/ghost@0.25.png', './assets/ghost@0.5.png',
  './assets/crystal16.png', './assets/crystal32.png', './assets/crystal96.png', './assets/floor.jpg', './assets/levelup.jpg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('thornbound-') && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // Network first so updates land promptly, cache as the offline fallback (also caches the web font).
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
  );
});
