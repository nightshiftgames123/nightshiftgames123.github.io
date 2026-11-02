// Offline cache for Nasma AI. Bump VERSION whenever any cached file changes.
// Strategy: open instantly from the cache, then refresh the cache in the background
// (stale-while-revalidate). A new version therefore appears on the next launch.
const VERSION = 'pedsanesth-v27';
const ASSETS = [
  './', './index.html', './nasma-core.js', './classic.html',
  './manifest.webmanifest', './manifest-public.webmanifest',
  './nasma-icon-180.png', './nasma-icon-192.png', './nasma-icon-512.png', './nasma-icon-maskable-512.png', './studio-logo.jpg',
  './fonts/geist-latin-400-normal.woff2', './fonts/geist-latin-500-normal.woff2', './fonts/geist-latin-600-normal.woff2',
  './fonts/geist-mono-latin-400-normal.woff2', './fonts/geist-mono-latin-500-normal.woff2', './fonts/newsreader-latin-500-normal.woff2'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  // Only same-origin GETs; Gemini requests and other sites go straight to the network.
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    // ignoreSearch so ./?public=1 and ./ share the cached page
    const cached = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
    const network = fetch(req)
      .then((res) => { if (res.ok) cache.put(req, res.clone()); return res; })
      .catch(() => null);
    if (cached) { e.waitUntil(network); return cached; }
    const res = await network;
    return res || (req.mode === 'navigate' ? cache.match('./index.html') : Response.error());
  })());
});
