// Offline cache for the app shell. Network-first for our own files (always fresh online, cached offline).
// Weather is never cached here; the app keeps its own 1-hour copy in IndexedDB.
const CACHE = 'attinera-v1';
const SHELL = [
  './', 'index.html', 'privacy.html', 'terms.html', 'manifest.webmanifest', 'css/styles.css', 'products.js',
  'js/app.js', 'js/ui.js', 'js/db.js', 'js/model.js', 'js/ai.js', 'js/ai-worker.js', 'js/closet.js', 'js/laundry.js',
  'js/today.js', 'js/weather.js', 'js/shop.js', 'js/settings.js',
  'assets/attinera-logo-a.svg', 'assets/attinera-logo-c.svg', 'assets/attinera-logo-lockup.svg', 'assets/icon-192.png', 'assets/icon-512.png', 'assets/icon-180.png',
];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (url.origin === location.origin) {
    e.respondWith(fetch(req).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return r;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
  } else if (url.hostname === 'cdn.jsdelivr.net') {
    // AI library: cache-first so photo tagging works offline after first use.
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return r;
    })));
  }
  // Everything else (Open-Meteo, favicons, product images, model files) goes straight to the network.
});
