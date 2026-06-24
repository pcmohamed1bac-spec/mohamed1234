// ═══════════════════════════════════════════════
//  sw.js — Service Worker pour Organisateur de Cours
//  Stratégie : Cache First pour les assets locaux
//              Network First pour les CDN externes
// ═══════════════════════════════════════════════

const CACHE_NAME = 'organisateur-cours-v1';

// Fichiers locaux à mettre en cache lors de l'installation
const LOCAL_ASSETS = [
  './organisateur-cours.html',
  './manifest.json',
  './favicon.ico',
  './icon-192.png',
  './icon-512.png'
];

// ─── Installation : mise en cache des assets locaux ─────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Mise en cache des assets locaux');
      // On utilise addAll avec gestion d'erreur individuelle
      return Promise.allSettled(
        LOCAL_ASSETS.map(url =>
          cache.add(url).catch(err =>
            console.warn('[SW] Impossible de mettre en cache :', url, err)
          )
        )
      );
    })
  );
  // Activation immédiate sans attendre la fermeture des anciens onglets
  self.skipWaiting();
});

// ─── Activation : nettoyage des anciens caches ──────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Suppression ancien cache :', key);
            return caches.delete(key);
          })
      )
    )
  );
  // Prendre le contrôle de tous les onglets ouverts immédiatement
  self.clients.claim();
});

// ─── Fetch : stratégie hybride ───────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Ignorer les requêtes non-GET et les extensions navigateur
  if (event.request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  // CDN externes (Tailwind, fonts, lucide) → Network First
  const isExternal = !url.origin.includes(self.location.origin) ||
                     url.hostname !== self.location.hostname;

  if (isExternal) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Mettre en cache la réponse CDN pour usage hors-ligne
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Assets locaux → Cache First, puis réseau en fallback
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      });
    })
  );
});
