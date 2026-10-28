/* N8Books service worker — offline-first app shell */
const CACHE = 'n8books-v22';
const OCR_CACHE = 'n8books-ocr-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-64.png'
];
/* OCR (receipt scan) assets live on the jsDelivr CDN. They are far too large
   and too numerous (engine + wasm core + English traineddata) to precache
   reliably at install, so they are runtime-cached on first scan instead:
   the first scan needs internet, later scans reuse the cached copies. */
const OCR_HOSTS = ['cdn.jsdelivr.net', 'unpkg.com', 'cdn.jsdelivr.com'];
const isOCR = url => OCR_HOSTS.includes(url.hostname) && /tesseract|tessdata/.test(url.pathname + url.search);
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS))
      /* best-effort warm of just the small OCR loader script; never fail install */
      .then(() => caches.open(OCR_CACHE).then(c => c.add('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js')).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== OCR_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (isOCR(url)) {
    /* cache-first for OCR assets so receipt scanning works offline after first use */
    e.respondWith(
      caches.open(OCR_CACHE).then(c =>
        c.match(e.request).then(hit => {
          if (hit) return hit;
          return fetch(e.request).then(res => {
            if (res && (res.ok || res.type === 'opaque')) c.put(e.request, res.clone());
            return res;
          });
        })
      )
    );
    return;
  }
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(hit => {
      const net = fetch(e.request).then(res => {
        if (res && res.ok && new URL(e.request.url).origin === location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
