/* ================================================================
   ARQUIVO: frontend/src/pwa/sw.js  (MODELO do service worker)

   O build (vite.config.js, plugin "service-worker") copia este arquivo
   para /sw.js trocando __VERSAO__ por um número novo a cada build.
   Como o arquivo muda a cada deploy, o navegador instala o SW novo,
   que apaga o cache antigo e o app recarrega com a versão nova
   (ver src/pwa/registrar.js).

   Estratégia:
     → páginas (navegação): rede primeiro, cache só se estiver offline
     → /assets/* e /icones/* (nomes com hash ou fixos): cache primeiro
     → todo o resto (API, socket.io, avatares): direto na rede
================================================================ */

const VERSAO = '1794135301402';
const CACHE  = `bitchager-${VERSAO}`;

self.addEventListener('install', (e) => {
    self.skipWaiting();
    e.waitUntil(caches.open(CACHE).then(c => c.addAll(['/', '/manifest.json', '/icones/icone-192.png'])).catch(() => {}));
});

self.addEventListener('activate', (e) => {
    e.waitUntil((async () => {
        const nomes = await caches.keys();
        await Promise.all(nomes.filter(n => n !== CACHE).map(n => caches.delete(n)));
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', (e) => {
    const req = e.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;

    if (req.mode === 'navigate') {
        e.respondWith((async () => {
            try {
                const resp = await fetch(req);
                const cache = await caches.open(CACHE);
                cache.put('/', resp.clone());
                return resp;
            } catch {
                return (await caches.match('/')) || Response.error();
            }
        })());
        return;
    }

    if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icones/')) {
        e.respondWith((async () => {
            const cache = await caches.open(CACHE);
            const salvo = await cache.match(req);
            if (salvo) return salvo;
            const resp = await fetch(req);
            if (resp.ok) cache.put(req, resp.clone());
            return resp;
        })());
    }
});
