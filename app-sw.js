// Service worker dos apps instaláveis (Área do Cliente em /clientes/ e Painel em /admin/).
// O mesmo arquivo é registrado com os dois escopos. Páginas vêm sempre da rede
// (sem risco de versão velha depois de publicar); sem internet, mostra a última
// cópia da página ou /offline.html. Arquivos estáticos do próprio site usam a
// cópia guardada e se atualizam em segundo plano. A API, o Cloudinary e o Asaas
// (outras origens) nunca passam por aqui.
const VERSION = "2026-11-20-1";
const SCOPE = new URL(self.registration.scope).pathname;
const PREFIX = `mc-app${SCOPE.replace(/[^a-z]+/gi, "-")}`;
const CACHE = `${PREFIX}${VERSION}`;
const OFFLINE_URL = "/offline.html";
const STATIC = /\.(?:css|js|png|jpe?g|webp|svg|ico|woff2?|webmanifest)$/i;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL, "/images/app-icon-192.png"]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith(PREFIX) && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok && response.type === "basic") cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request, { ignoreSearch: true })) || (await cache.match(OFFLINE_URL)) || Response.error();
  }
}

async function staleWhileRevalidate(event) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(event.request);
  const refresh = fetch(event.request).then((response) => {
    if (response.ok && response.type === "basic") cache.put(event.request, response.clone());
    return response;
  });
  if (cached) {
    event.waitUntil(refresh.catch(() => {}));
    return cached;
  }
  return refresh;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }
  if (STATIC.test(url.pathname)) event.respondWith(staleWhileRevalidate(event));
});
