// ============================================================
// LE NID DES PRONOS — SERVICE WORKER V1.8.37
// Cache public V1.8.37 : bilan PDF final temps réel.
// ============================================================

const CACHE_NAME = "le-nid-des-pronos-v1-8-17";

// Les avatars ne sont pas précachés : ils peuvent aller de owl-01.png à owl-90.png et être ajoutés/remplacés librement.
const ASSETS = [
  "./",
  "./index.html",
  "./login.html",
  "./register.html",
  "./app.html",
  "./admin.html",
  "./bilan.html",
  "./css/style.css?v=1.8.37",
  "./css/bilan.css?v=1.8.37",
  "./js/supabaseClient.js?v=1.8.37",
  "./js/auth.js?v=1.8.37",
  "./js/common.js?v=1.8.37",
  "./js/app.js?v=1.8.37",
  "./js/admin.js?v=1.8.37",
  "./js/bilan.js?v=1.8.37",
  "./manifest.json?v=1.8.37",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-maskable-192.png",
  "./assets/icons/icon-maskable-512.png",
  "./assets/icons/apple-touch-icon.png",
  "./assets/icons/owl-icons.svg",
  "./assets/icons/owl-png/accueil.png",
  "./assets/icons/owl-png/matchs.png",
  "./assets/icons/owl-png/mes-pronos.png",
  "./assets/icons/owl-png/classements.png",
  "./assets/icons/owl-png/coupe-du-monde.png",
  "./assets/icons/owl-png/exploits.png",
  "./assets/icons/owl-png/profil.png",
  "./assets/icons/owl-png/admin.png",
  "./assets/icons/owl-png/famille.png",
  "./assets/icons/owl-png/sante.png",
  "./assets/icons/owl-png/journal.png",
  "./assets/icons/owl-png/bilan.png",
  "./assets/icons/owl-png/diplome.png",
  "./assets/reports/bg-cover.png",
  "./assets/reports/bg-stats.png",
  "./assets/reports/bg-badges.png",
  "./assets/reports/bg-records.png",
  "./assets/reports/bg-graphs.png",
  "./assets/reports/bg-diplome.png",
  "./assets/icons/owl-png/lieu.png",
  "./assets/icons/owl-png/horaire.png",
  "./assets/icons/owl-png/tv.png",
  "./assets/icons/owl-png/verrouille.png",
  "./assets/icons/owl-png/en-direct.png",
  "./assets/icons/owl-png/a-venir.png",
  "./assets/icons/owl-png/termine.png",
  "./assets/icons/owl-png/diffusion.png",
  "./assets/icons/owl-png/score-exact.png",
  "./assets/icons/owl-png/bon-resultat.png",
  "./assets/icons/owl-png/bon-ecart.png",
  "./assets/icons/owl-png/bon-qualifie.png",
  "./assets/icons/owl-png/matchs-comptes.png",
  "./assets/icons/owl-png/journee-poule.png",
  "./assets/icons/owl-png/phase-finale.png",
  "./assets/icons/owl-png/badges.png",
  "./assets/icons/bein.png",
  "./assets/icons/m6.png",
  "./assets/icons/w9.png",
  "./assets/icons/flags/mx.png",
  "./assets/icons/flags/us.png",
  "./assets/icons/flags/ca.png",
  "./assets/badges/README.md",
  "./assets/badges/bus-stuck.png",
  "./assets/records/README.md",
  "./assets/icons/owl-png/README.md",
  "./assets/avatars/avatars.json",
  "./assets/reactions/reaction-casserole.png",
  "./assets/reactions/reaction-approuve.png",
  "./assets/reactions/reaction-coeur.png",
  "./assets/reactions/reaction-oups.png",
  "./assets/reactions/reaction-chaud.png",
  "./assets/reactions/reaction-lol.png",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    event.respondWith(
      fetch(request).catch(() => new Response("", { status: 204, statusText: "Offline external request ignored" }))
    );
    return;
  }

  const isNavigation = request.mode === "navigate";

  event.respondWith((async () => {
    try {
      if (isNavigation) {
        try {
          const networkResponse = await fetch(request);
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, networkResponse.clone()).catch(() => {});
          return networkResponse;
        } catch (networkError) {
          const cache = await caches.open(CACHE_NAME);
          return (await cache.match(request))
            || (await cache.match("./app.html"))
            || (await cache.match("./index.html"))
            || new Response("Le Nid est hors ligne pour le moment.", {
              status: 503,
              headers: { "Content-Type": "text/plain; charset=utf-8" }
            });
        }
      }

      const cached = await caches.match(request);
      if (cached) return cached;

      try {
        const networkResponse = await fetch(request);
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, networkResponse.clone()).catch(() => {});
        return networkResponse;
      } catch (networkError) {
        return new Response("", {
          status: 504,
          statusText: "Network unavailable",
          headers: { "Content-Type": "text/plain; charset=utf-8" }
        });
      }
    } catch (error) {
      return new Response("", {
        status: 500,
        statusText: "Service worker fallback",
        headers: { "Content-Type": "text/plain; charset=utf-8" }
      });
    }
  })());
});
