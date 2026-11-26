const CACHE = "forja-linhagens-bg-v1";
const BG_ASSETS = [
  "img/menu_bg.webp",
  "img/fundos/bg_forest.jpg",
  "img/fundos/bg_swamp.jpg",
  "img/fundos/bg_sand.jpg",
  "img/fundos/bg_snow.jpg",
  "img/fundos/bg_lava.jpg",
  "img/fundos/bg_abyss.jpg",
  "img/fundos/map_forest.jpg",
  "img/fundos/map_swamp.jpg",
  "img/fundos/map_sand.jpg",
  "img/fundos/map_snow.jpg",
  "img/fundos/map_lava.jpg",
  "img/fundos/map_abyss.jpg",
  "img/fundos/menu_forja.jpg",
  "img/fundos/menu_herois.jpg",
  "img/fundos/menu_loja.jpg",
  "img/fundos/menu_missoes.jpg",
  "img/fundos/menu_desafios.jpg"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(BG_ASSETS.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Cache-first para imagens de fundo e sprites
  if (url.pathname.includes("/img/")) {
    e.respondWith(
      caches.open(CACHE).then(c =>
        c.match(req).then(hit => hit || fetch(req).then(res => {
          if (res && res.ok) c.put(req, res.clone());
          return res;
        }))
      )
    );
  }
});
