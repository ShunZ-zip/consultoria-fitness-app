// Service worker: abre telas e dados já visitados sem conexão (rede primeiro, cache como reserva).
// Só GET do próprio domínio. Escritas offline são tratadas pela fila de sincronização da página.
// O cache é apagado ao entrar e ao sair da conta, para não vazar dados entre usuários no mesmo aparelho.
const CACHE = "cf-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/auth/")) return; // nunca cacheia autenticação

  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(async () => {
        const hit = await caches.match(req);
        if (hit) return hit;
        if (req.mode === "navigate") { const shell = await caches.match("/"); if (shell) return shell; }
        return Response.error();
      }),
  );
});

self.addEventListener("message", (e) => { if (e.data === "clear") e.waitUntil(caches.delete(CACHE)); });
