// Offline: keeps a copy of the sandbox (this folder and ../sim/) so a phone that opened it once runs it with no
// connection. Network first: online it always gets the newest files (and refreshes the copy); offline, or when the
// network is too slow, the copy. Registered only on https (the website), not on the home server.
const CACHE = 'tinygod-v4';
const FILES = ['./', 'index.html', 'main.js', 'parts.js', 'missions.js', 'matches.js', 'match.js', 'match-worker.js', 'journal.js', 'mould.js', 'scene.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png',
  ...['params', 'rng', 'dmath', 'materials', 'build', 'physics', 'interact', 'sense', 'light', 'nutrient', 'divide', 'grow', 'death', 'metab', 'world', 'brain', 'shape', 'flow', 'toxin', 'shade', 'entry', 'match', 'start',
    'presets'].map((f) => `../sim/${f}.js`),
  // the match ladder's rivals (matches.js)
  '../designs/noctilla.json', '../designs/plebella.json', '../designs/deepdweller2.json', '../tournament/bobber-blind-opus.json', '../tournament/fixer-blind-opus2.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(FILES.map((f) => c.add(f).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()); });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // online: always ask the server whether there is something newer (not the browser's 10-minute copy)
    const net = fetch(req.url, { cache: 'no-cache' }).then((r) => { if (r.ok) cache.put(req, r.clone()); return r; });
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
