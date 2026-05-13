// ============================================================
// LE NID DES PRONOS — SERVICE WORKER V0.24.2
// Cache corrigé : config.js non caché + format lieux pays-ville-stade.
// ============================================================

const CACHE_NAME = "le-nid-des-pronos-v0-24-2";

// Les avatars ne sont pas précachés : ils peuvent aller de owl-01.png à owl-90.png et être ajoutés/remplacés librement.
const ASSETS = [
  "./",
  "./index.html",
  "./login.html",
  "./register.html",
  "./app.html",
  "./admin.html",
  "./css/style.css?v=0.24.2",
  "./js/supabaseClient.js?v=0.24.2",
  "./js/auth.js?v=0.24.2",
  "./js/common.js?v=0.24.2",
  "./js/app.js?v=0.24.2",
  "./js/admin.js?v=0.24.2",
  "./manifest.json?v=0.24.2",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/owl-icons.svg",
  "./assets/icons/owl-png/accueil.png",
  "./assets/icons/owl-png/matchs.png",
  "./assets/icons/owl-png/mes-pronos.png",
  "./assets/icons/owl-png/classements.png",
  "./assets/icons/owl-png/coupe-du-monde.png",
  "./assets/icons/owl-png/exploits.png",
  "./assets/icons/owl-png/profil.png",
  "./assets/icons/owl-png/admin.png",
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
  "./assets/avatars/avatars.json"
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
  const url = new URL(event.request.url);

  // Ne jamais cacher la config, Supabase ni les Edge Functions.
  if (
    url.pathname.endsWith("/js/config.js") ||
    url.hostname.includes("supabase.co") ||
    url.pathname.includes("/functions/v1/")
  ) {
    event.respondWith(fetch(event.request, { cache: "no-store" }));
    return;
  }

  // HTML : network first, fallback cache.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match("./index.html")))
    );
    return;
  }

  // Assets : cache first.
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
