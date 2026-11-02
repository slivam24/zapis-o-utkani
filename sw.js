// Service worker: aplikace funguje bez internetu. Data (soupisky) se berou přednostně ze sítě.
const CACHE = 'zapis-v6';
const SHELL = [
  './',
  'index.html',
  'css/style.css',
  'js/app.js',
  'js/logic.js',
  'js/render.js',
  'js/pdf.js',
  'js/store.js',
  'js/data.js',
  'js/parse.js',
  'js/sources.js',
  'js/xlsx.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'data/competitions.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  const isData = url.pathname.endsWith('/data/competitions.json');
  if (isData) {
    // síť napřed, při selhání poslední uložená verze
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('data/competitions.json', copy));
          return res;
        })
        .catch(() => caches.match('data/competitions.json')),
    );
    return;
  }
  // zbytek: cache napřed, na pozadí obnovit
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      const net = fetch(req)
        .then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
          return res;
        })
        .catch(() => hit);
      return hit || net;
    }),
  );
});
