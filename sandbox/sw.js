// Offline: keeps a copy of the sandbox (this folder and ../sim/) so a phone that opened it once runs it with no
// connection. Network first: online it always gets the newest files (and refreshes the copy); offline, or when the
// network is too slow, the copy. Registered only on https (the website), not on the home server.
const CACHE = 'tinygod-v1';
const FILES = ['./', 'index.html', 'main.js', 'parts.js', 'journal.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png',
  ...['params', 'rng', 'dmath', 'materials', 'build', 'physics', 'interact', 'sense', 'light', 'nutrient', 'metab', 'world',
    'presets'].map((f) => `../sim/${f}.js`)];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(FILES.map((f) => c.add(f).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()); });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const net = fetch(req).then((r) => { if (r.ok) cache.put(req, r.clone()); return r; });
    const slow = new Promise((ok) => setTimeout(ok, 4000));
    try {
      const r = await Promise.race([net, slow.then(() => cache.match(req, { ignoreSearch: true }).then((c) => c || net))]);
      return r || net;
    } catch (err) {
      const c = await cache.match(req, { ignoreSearch: true });
      if (c) return c;
      throw err;
    }
  })());
});
