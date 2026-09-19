// Service worker minimale: cache "app shell" per funzionamento offline
// dopo il primo caricamento. I dati AIFA veri sono in IndexedDB (gestiti
// da js/sync.js), non qui: qui mettiamo in cache solo i file dell'app.

const CACHE_NOME = 'indice-terapeutico-v1';
const FILE_DA_CACHARE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './js/app.js',
  './js/search.js',
  './js/sync.js',
  './js/papaparse.min.js',
  './data/malattie-atc.json',
  './data/principi-attivi-info.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NOME).then((cache) => cache.addAll(FILE_DA_CACHARE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((nomi) =>
      Promise.all(nomi.filter((n) => n !== CACHE_NOME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

// Strategia: rete prima (per avere sempre l'ultima versione se online),
// cache come fallback (per funzionare offline). I domini esterni AIFA
// (i CSV) non vengono mai messi in cache qui: li gestisce IndexedDB.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return; // non intercettare le chiamate ad AIFA

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copia = res.clone();
        caches.open(CACHE_NOME).then((cache) => cache.put(event.request, copia));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
