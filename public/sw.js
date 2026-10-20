/* Cache contains only this public, static read-only viewer, never API/auth data. */
const CACHE = "quadro-shell-v3";
const ASSETS = ["/offline.html", "/offline.js", "/icons/icon-192.png"];
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("quadro-shell-") && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin)
    return;
  if (ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches
        .open(CACHE)
        .then(
          async (cache) =>
            (await cache.match(url.pathname)) ?? fetch(event.request),
        ),
    );
    return;
  }
  if (event.request.mode === "navigate" && url.pathname === "/") {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const cached = await caches.match("/offline.html");
        return (
          cached ??
          new Response("Reconecte para abrir o aplicativo.", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          })
        );
      }),
    );
  }
});

// A page controlled by an old worker must not claim readiness merely because
// navigator.serviceWorker.controller exists. Verify every public viewer asset.
self.addEventListener("message", (event) => {
  if (event.data?.type !== "OFFLINE_READY" || !event.ports[0]) return;
  const port = event.ports[0];
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      for (const asset of ASSETS) {
        if (!(await cache.match(asset))) await cache.add(asset);
      }
      port.postMessage({ type: "OFFLINE_READY", version: 3, ready: true });
    })().catch(() =>
      port.postMessage({ type: "OFFLINE_READY", version: 3, ready: false }),
    ),
  );
});
