// Service worker: aplikacja działa offline.
// Po każdej zmianie w plikach podbij VERSION (i APP_VERSION w js/app.js),
// wtedy telefon pobierze nową wersję przy następnym uruchomieniu.
const VERSION = '1.0.0';
const APP_CACHE = 'wydatki-app-' + VERSION;
const CDN_CACHE = 'wydatki-cdn-v1';

const APP_FILES = [
  './',
  'index.html',
  'css/styles.css',
  'js/parse.js',
  'js/ocr.js',
  'js/app.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE).then((c) => c.addAll(APP_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('wydatki-app-') && k !== APP_CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Moduł OCR z CDN (wersja przypięta w adresie) — raz pobrany, zostaje w pamięci.
  if (url.hostname === 'cdn.jsdelivr.net') {
    event.respondWith(
      caches.open(CDN_CACHE).then((c) =>
        c.match(req).then((hit) => hit || fetch(req).then((res) => {
          if (res.ok) c.put(req, res.clone());
          return res;
        }))
      )
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Pliki aplikacji: najpierw pamięć podręczna, więc start jest natychmiastowy i działa bez sieci.
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req))
  );
});
