// Service worker: aplikace funguje bez internetu. Data (soupisky) se berou přednostně ze sítě.
const CACHE = 'zapis-v22';
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
  'js/archive.js',
  'js/pages.js',
  'js/link.js',
  'js/catalog.js',
  'js/vendor/qrcode.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'img/logo-sscr.png',
  'data/index.json',
  'turnaj/',
  'turnaj/index.html',
  'turnaj/css/turnaj.css',
  'turnaj/js/app.js',
  'turnaj/js/model.js',
  'turnaj/js/dutch.js',
  'turnaj/js/matching.js',
  'turnaj/js/tiebreaks.js',
  'turnaj/js/trf.js',
  'turnaj/js/store.js',
];

self.addEventListener('install', (e) => {
  // cache: 'reload' obejde mezipaměť prohlížeče. GitHub Pages ji drží 10 minut, takže bez toho by se
  // do nové verze uložily staré soubory a nová stránka by běžela se starým skriptem.
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
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

  // data (seznam soutěží a jednotlivé soutěže): síť napřed, při selhání poslední uložená verze;
  // ukládá se bez ?t=…, aby obnovení vynucené z aplikace přepsalo tutéž položku
  const isData = /\/data\/.+\.json$/.test(url.pathname);
  if (isData) {
    const key = new Request(`${url.origin}${url.pathname}`);
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(key, copy));
          }
          return res;
        })
        .catch(() => caches.match(key).then((hit) => hit ?? Response.error())),
    );
    return;
  }
  // zbytek: cache napřed, na pozadí obnovit
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      // obnova na pozadí se vždy ptá serveru, ne mezipaměti prohlížeče
      const net = fetch(req, { cache: 'no-cache' })
        .then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
          return res;
        })
        .catch(() => hit);
      return hit || net;
    }),
  );
});
