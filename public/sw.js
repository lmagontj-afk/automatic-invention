/* Base PWA: a consulta offline e a política de cache serão implementadas na etapa 7.
   Nenhuma resposta autenticada é armazenada por este worker. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
