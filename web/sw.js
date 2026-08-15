// Service Worker: cacheia o "app shell" (HTML/CSS/JS do próprio site) e a
// biblioteca PDF.js (CDN) para que o leitor funcione sem internet depois da
// primeira visita. Os PDFs importados já ficam no IndexedDB (não aqui).

const CACHE_VERSAO = 'leitor-pdf-cache-v2';

const ARQUIVOS_APP_SHELL = [
  './',
  './index.html',
  './leitor.html',
  './leitor-pdf-android.html',
  './css/biblioteca.css',
  './css/leitor.css',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './js/db.js',
  './js/tema.js',
  './js/biblioteca.js',
  './js/leitor.js',
  './js/flip.js',
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE_VERSAO).then((cache) =>
      // Cada arquivo é cacheado individualmente: se algum falhar (ex.: sem
      // rede na primeira instalação), os demais ainda são salvos.
      Promise.allSettled(
        ARQUIVOS_APP_SHELL.map((url) => cache.add(url).catch(() => null))
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys().then((chaves) =>
      Promise.all(
        chaves
          .filter((chave) => chave !== CACHE_VERSAO)
          .map((chave) => caches.delete(chave))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (evento) => {
  if (evento.request.method !== 'GET') return;

  evento.respondWith(
    caches.match(evento.request).then((respostaCache) => {
      if (respostaCache) return respostaCache;

      return fetch(evento.request)
        .then((respostaRede) => {
          // Guarda uma cópia no cache para a próxima vez que estiver offline.
          const copia = respostaRede.clone();
          caches.open(CACHE_VERSAO).then((cache) => {
            cache.put(evento.request, copia).catch(() => {});
          });
          return respostaRede;
        })
        .catch(() => respostaCache);
    })
  );
});
