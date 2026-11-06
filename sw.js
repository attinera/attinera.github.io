// Offline cache for the app shell. Network-first for our own files (always fresh online, cached offline).
// Weather and Supabase data are never cached here; the app keeps its own copies in IndexedDB.
const CACHE = 'attinera-v4';
const SHELL = [
  './', 'index.html', 'privacy.html', 'terms.html', 'manifest.webmanifest', 'css/styles.css', 'products.js',
  'js/app.js', 'js/ui.js', 'js/db.js', 'js/model.js', 'js/ai.js', 'js/ai-worker.js', 'js/cutout-worker.js', 'js/icons.js', 'js/photo.js',
  'js/onboarding.js', 'js/closet.js', 'js/laundry.js', 'js/today.js', 'js/weather.js', 'js/shop.js', 'js/settings.js', 'js/sync.js', 'js/config.js',
  'assets/attinera-logo-v2.svg', 'assets/attinera-logo-v2-lockup.svg', 'assets/icon-32.png', 'assets/icon-180.png', 'assets/icon-192.png', 'assets/icon-512.png',
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
    // AI + Supabase libraries (pinned versions): cache-first so they work offline after first use.
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return r;
    })));
  }
  // Everything else (Open-Meteo, Supabase, product images, model files) goes straight to the network.
});
