// ============================================================
// LE NID DES PRONOS — SERVICE WORKER V1.9.15
// Cache public V1.9.15 : installation robuste + mise à jour fiable.
// ============================================================

const CACHE_NAME = "le-nid-des-pronos-v1-9-15";

// Le cœur de l’application doit impérativement être disponible hors ligne.
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./login.html",
  "./register.html",
  "./app.html",
  "./admin.html",
  "./bilan.html",
  "./css/style.css?v=1.9.15",
  "./css/bilan.css?v=1.9.15",
  "./js/config.js?v=1.9.15",
  "./js/supabaseClient.js?v=1.9.15",
  "./js/auth.js?v=1.9.15",
  "./js/common.js?v=1.9.15",
  "./js/app.js?v=1.9.15",
  "./js/admin.js?v=1.9.15",
  "./js/bilan.js?v=1.9.15",
  "./manifest.json?v=1.9.15",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-maskable-192.png",
  "./assets/icons/icon-maskable-512.png",
  "./assets/icons/apple-touch-icon.png",
  "./assets/icons/owl-icons.svg"
];

// Ces ressources améliorent l’expérience, mais une image absente ne doit plus
// faire échouer toute l’installation du service worker.
const OPTIONAL_ASSETS = [
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
  "./assets/avatars/avatars.json",
  "./assets/reactions/reaction-casserole.png",
  "./assets/reactions/reaction-approuve.png",
  "./assets/reactions/reaction-coeur.png",
  "./assets/reactions/reaction-oups.png",
  "./assets/reactions/reaction-chaud.png",
  "./assets/reactions/reaction-lol.png"
];

async function cacheIfUsable(cache, request, response) {
  if (!response || !response.ok) return response;
  if (!["basic", "cors"].includes(response.type)) return response;
  await cache.put(request, response.clone()).catch(() => {});
  return response;
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(CORE_ASSETS);
    await Promise.allSettled(OPTIONAL_ASSETS.map((asset) => cache.add(asset)));
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Supabase, CDN et autres domaines restent gérés directement par le navigateur.
  if (url.origin !== self.location.origin) return;

  const isNavigation = request.mode === "navigate";

  if (isNavigation) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const networkResponse = await fetch(request);
        await cacheIfUsable(cache, request, networkResponse);
        return networkResponse;
      } catch (error) {
        return (await cache.match(request))
          || (await cache.match("./app.html"))
          || (await cache.match("./index.html"))
          || new Response("Le Nid est hors ligne pour le moment.", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" }
          });
      }
    })());
    return;
  }

  // Cache d’abord pour l’affichage immédiat, mise à jour réseau en parallèle.
  const cachePromise = caches.open(CACHE_NAME);
  const networkPromise = (async () => {
    const cache = await cachePromise;
    try {
      const response = await fetch(request);
      return cacheIfUsable(cache, request, response);
    } catch (error) {
      return null;
    }
  })();

  // Déclaré immédiatement pour que le navigateur laisse finir la mise à jour du cache.
  event.waitUntil(networkPromise.then(() => undefined));
  event.respondWith((async () => {
    const cache = await cachePromise;
    const cached = await cache.match(request);
    if (cached) return cached;

    const networkResponse = await networkPromise;
    return networkResponse || new Response("", {
      status: 504,
      statusText: "Network unavailable",
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
  })());
});
