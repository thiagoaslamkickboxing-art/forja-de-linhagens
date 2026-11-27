// Aumente o numero da versao ao publicar uma nova atualizacao do jogo
const CACHE_VERSION = "forja-de-linhagens-v2";

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest"
];

const IMG_ASSETS = [
  "./img/abismo.png",
  "./img/abismo_C.png",
  "./img/abismo_E.png",
  "./img/abismo_L.png",
  "./img/abismo_R.png",
  "./img/alquimista.png",
  "./img/altacleriga.png",
  "./img/altacleriga_C.png",
  "./img/altacleriga_E.png",
  "./img/altacleriga_L.png",
  "./img/altacleriga_R.png",
  "./img/anao.png",
  "./img/anciao.png",
  "./img/anciao_C.png",
  "./img/anciao_E.png",
  "./img/anciao_L.png",
  "./img/anciao_R.png",
  "./img/arcanjo.png",
  "./img/arquimago.png",
  "./img/arquimago_C.png",
  "./img/arquimago_E.png",
  "./img/arquimago_L.png",
  "./img/arquimago_R.png",
  "./img/atirador.png",
  "./img/atirador_C.png",
  "./img/atirador_E.png",
  "./img/atirador_L.png",
  "./img/atirador_R.png",
  "./img/avatar.png",
  "./img/avatar_C.png",
  "./img/avatar_E.png",
  "./img/avatar_L.png",
  "./img/avatar_R.png",
  "./img/b_abyss.png",
  "./img/b_forest.png",
  "./img/b_lava.png",
  "./img/b_sand.png",
  "./img/b_snow.png",
  "./img/b_swamp.png",
  "./img/bardo.png",
  "./img/boreal.png",
  "./img/boreal_C.png",
  "./img/boreal_E.png",
  "./img/boreal_L.png",
  "./img/boreal_R.png",
  "./img/bosque.png",
  "./img/bosque_C.png",
  "./img/bosque_E.png",
  "./img/bosque_L.png",
  "./img/bosque_R.png",
  "./img/brasa.png",
  "./img/cacadora.png",
  "./img/ceifador.png",
  "./img/ceifador_C.png",
  "./img/ceifador_E.png",
  "./img/ceifador_L.png",
  "./img/ceifador_R.png",
  "./img/cinzas.png",
  "./img/cinzas_C.png",
  "./img/cinzas_E.png",
  "./img/cinzas_L.png",
  "./img/cinzas_R.png",
  "./img/cleriga.png",
  "./img/cogumelos.png",
  "./img/colosso.png",
  "./img/colosso_C.png",
  "./img/colosso_E.png",
  "./img/colosso_L.png",
  "./img/colosso_R.png",
  "./img/corvos.png",
  "./img/crio.png",
  "./img/domadora.png",
  "./img/dragao.png",
  "./img/dragao_C.png",
  "./img/dragao_E.png",
  "./img/dragao_L.png",
  "./img/dragao_R.png",
  "./img/dragonesa.png",
  "./img/druida.png",
  "./img/e_a.png",
  "./img/e_b.png",
  "./img/e_f.png",
  "./img/e_g.png",
  "./img/e_h.png",
  "./img/e_l.png",
  "./img/e_r.png",
  "./img/e_s.png",
  "./img/eclipse.png",
  "./img/eclipse_C.png",
  "./img/eclipse_E.png",
  "./img/eclipse_L.png",
  "./img/eclipse_R.png",
  "./img/elfa.png",
  "./img/ent.png",
  "./img/espectro.png",
  "./img/espectro_C.png",
  "./img/espectro_E.png",
  "./img/espectro_L.png",
  "./img/espectro_R.png",
  "./img/fantasma.png",
  "./img/fantasma_C.png",
  "./img/fantasma_E.png",
  "./img/fantasma_L.png",
  "./img/fantasma_R.png",
  "./img/fenix.png",
  "./img/fenix_C.png",
  "./img/fenix_E.png",
  "./img/fenix_L.png",
  "./img/fenix_R.png",
  "./img/feras.png",
  "./img/feras_C.png",
  "./img/feras_E.png",
  "./img/feras_L.png",
  "./img/feras_R.png",
  "./img/forja.png",
  "./img/forja_C.png",
  "./img/forja_E.png",
  "./img/forja_L.png",
  "./img/forja_R.png",
  "./img/fundos/bg_abyss.jpg",
  "./img/fundos/bg_forest.jpg",
  "./img/fundos/bg_lava.jpg",
  "./img/fundos/bg_sand.jpg",
  "./img/fundos/bg_snow.jpg",
  "./img/fundos/bg_swamp.jpg",
  "./img/fundos/map_abyss.jpg",
  "./img/fundos/map_forest.jpg",
  "./img/fundos/map_lava.jpg",
  "./img/fundos/map_sand.jpg",
  "./img/fundos/map_snow.jpg",
  "./img/fundos/map_swamp.jpg",
  "./img/fundos/menu_desafios.jpg",
  "./img/fundos/menu_forja.jpg",
  "./img/fundos/menu_herois.jpg",
  "./img/fundos/menu_loja.jpg",
  "./img/fundos/menu_missoes.jpg",
  "./img/furacao.png",
  "./img/furacao_C.png",
  "./img/furacao_E.png",
  "./img/furacao_L.png",
  "./img/furacao_R.png",
  "./img/glacial.png",
  "./img/glacial_C.png",
  "./img/glacial_E.png",
  "./img/glacial_L.png",
  "./img/glacial_R.png",
  "./img/gnoma.png",
  "./img/grifo.png",
  "./img/hierofante.png",
  "./img/hierofante_C.png",
  "./img/hierofante_E.png",
  "./img/hierofante_L.png",
  "./img/hierofante_R.png",
  "./img/icon-192.png",
  "./img/icon-512.png",
  "./img/icon-512-maskable.png",
  "./img/inquisidor.png",
  "./img/inquisidor_C.png",
  "./img/inquisidor_E.png",
  "./img/inquisidor_L.png",
  "./img/inquisidor_R.png",
  "./img/juiz.png",
  "./img/juiz_C.png",
  "./img/juiz_E.png",
  "./img/juiz_L.png",
  "./img/juiz_R.png",
  "./img/ladino.png",
  "./img/lamina.png",
  "./img/lamina_C.png",
  "./img/lamina_E.png",
  "./img/lamina_L.png",
  "./img/lamina_R.png",
  "./img/lanceira.png",
  "./img/lanceiroT.png",
  "./img/lanceiroT_C.png",
  "./img/lanceiroT_E.png",
  "./img/lanceiroT_L.png",
  "./img/lanceiroT_R.png",
  "./img/lanterna.png",
  "./img/lich.png",
  "./img/lich_C.png",
  "./img/lich_E.png",
  "./img/lich_L.png",
  "./img/lich_R.png",
  "./img/magma.png",
  "./img/magma_C.png",
  "./img/magma_E.png",
  "./img/magma_L.png",
  "./img/magma_R.png",
  "./img/menu_bg.webp",
  "./img/mercador.png",
  "./img/monge.png",
  "./img/mongeT.png",
  "./img/mongeT_C.png",
  "./img/mongeT_E.png",
  "./img/mongeT_L.png",
  "./img/mongeT_R.png",
  "./img/necro.png",
  "./img/nevasca.png",
  "./img/nevasca_C.png",
  "./img/nevasca_E.png",
  "./img/nevasca_L.png",
  "./img/nevasca_R.png",
  "./img/novica.png",
  "./img/oraculo.png",
  "./img/oraculo_C.png",
  "./img/oraculo_E.png",
  "./img/oraculo_L.png",
  "./img/oraculo_R.png",
  "./img/paladino.png",
  "./img/piro.png",
  "./img/plasma.png",
  "./img/plasma_C.png",
  "./img/plasma_E.png",
  "./img/plasma_L.png",
  "./img/plasma_R.png",
  "./img/podre.png",
  "./img/podre_C.png",
  "./img/podre_E.png",
  "./img/podre_L.png",
  "./img/podre_R.png",
  "./img/rainha.png",
  "./img/rainhaE.png",
  "./img/rainhaE_C.png",
  "./img/rainhaE_E.png",
  "./img/rainhaE_L.png",
  "./img/rainhaE_R.png",
  "./img/runas.png",
  "./img/sentinela.png",
  "./img/solar.png",
  "./img/solar_C.png",
  "./img/solar_E.png",
  "./img/solar_L.png",
  "./img/solar_R.png",
  "./img/sombra.png",
  "./img/tempestade.png",
  "./img/tita.png",
  "./img/tita_C.png",
  "./img/tita_E.png",
  "./img/tita_L.png",
  "./img/tita_R.png",
  "./img/trovao.png",
  "./img/trovao_C.png",
  "./img/trovao_E.png",
  "./img/trovao_L.png",
  "./img/trovao_R.png",
  "./img/valquiria.png",
  "./img/valquiria_C.png",
  "./img/valquiria_E.png",
  "./img/valquiria_L.png",
  "./img/valquiria_R.png",
  "./img/vapor.png",
  "./img/vapor_C.png",
  "./img/vapor_E.png",
  "./img/vapor_L.png",
  "./img/vapor_R.png",
  "./img/vida.png",
  "./img/vida_C.png",
  "./img/vida_E.png",
  "./img/vida_L.png",
  "./img/vida_R.png",
  "./img/xama.png",
  "./img/yeti.png"
];

const ALL_ASSETS = [...CORE_ASSETS, ...IMG_ASSETS];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(async cache => {
      await cache.addAll(CORE_ASSETS);
      // Pre-carrega todas as imagens de img/ em lotes para instalacao offline confiavel
      const batch = 20;
      for (let i = 0; i < IMG_ASSETS.length; i += batch) {
        await Promise.allSettled(IMG_ASSETS.slice(i, i + batch).map(url => cache.add(url)));
      }
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navegacao / index.html / manifest: rede primeiro (atualiza cache), fallback para cache offline
  if (req.mode === "navigate" || url.pathname.endsWith("/") || url.pathname.endsWith("/index.html") || url.pathname.endsWith("/manifest.webmanifest")) {
    event.respondWith(
      fetch(req)
        .then(res => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then(c => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then(hit => hit || caches.match("./index.html")))
    );
    return;
  }

  // Imagens e demais recursos locais: cache primeiro, com gravacao automatica em cache
  event.respondWith(
    caches.open(CACHE_VERSION).then(cache =>
      cache.match(req).then(hit => hit || fetch(req).then(res => {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      }))
    )
  );
});