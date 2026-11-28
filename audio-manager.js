// Forja de Linhagens — AudioManager com barramentos (master, music, sfx, ui),
// compressor leve no master, crossfade de transições e loop contínuo com duas instâncias.
(function () {
  "use strict";

  // Configuração editável de volumes e pontos de loop por faixa (segundos).
  // loopStart: pula silêncio inicial de encoding AAC (~0.08 s).
  // loopEnd: null = automático (duration - 0.12 s para ignorar silêncio final AAC).
  // xfade: segundos de crossfade entre o fim e o início do loop.
  const MUSIC_CFG = {
    m_titulo:   { url: "music/m_titulo.m4a",   vol: 0.90, loopStart: 0.08, loopEnd: null, xfade: 2.0 },
    m_menu:     { url: "music/m_menu.m4a",     vol: 0.85, loopStart: 0.08, loopEnd: null, xfade: 2.0 },
    m_floresta: { url: "music/m_floresta.m4a", vol: 0.85, loopStart: 0.08, loopEnd: null, xfade: 2.0 },
    m_pantano:  { url: "music/m_pantano.m4a",  vol: 0.85, loopStart: 0.08, loopEnd: null, xfade: 2.0 },
    m_deserto:  { url: "music/m_deserto.m4a",  vol: 0.85, loopStart: 0.08, loopEnd: null, xfade: 2.0 },
    m_neve:     { url: "music/m_neve.m4a",     vol: 0.85, loopStart: 0.08, loopEnd: null, xfade: 2.0 },
    m_vulcao:   { url: "music/m_vulcao.m4a",   vol: 0.85, loopStart: 0.08, loopEnd: null, xfade: 2.0 },
    m_abismo:   { url: "music/m_abismo.m4a",   vol: 0.85, loopStart: 0.08, loopEnd: null, xfade: 2.0 },
    m_chefe:    { url: "music/m_chefe.m4a",    vol: 0.95, loopStart: 0.08, loopEnd: null, xfade: 2.0 },
    j_vitoria:  { url: "music/j_vitoria.m4a",  vol: 1.00, jingle: true },
    j_derrota:  { url: "music/j_derrota.m4a",  vol: 1.00, jingle: true }
  };

  const REALM_MUSIC = {
    forest: "m_floresta",
    swamp:  "m_pantano",
    sand:   "m_deserto",
    snow:   "m_neve",
    lava:   "m_vulcao",
    abyss:  "m_abismo"
  };

  let ctx = null;
  let bus = null; // { master, music, musicDuck, sfx, ui, compressor }
  let unlocked = false;
  let muted = false;
  let musicVol = 0.8;
  let sfxVol = 1.0;
  let duckFactor = 1.0;
  let duckTimer = 0;

  let canPlayM4A = true;
  try {
    const probe = document.createElement("audio");
    canPlayM4A = !!(probe.canPlayType && (probe.canPlayType("audio/mp4") || probe.canPlayType("audio/aac") || probe.canPlayType("audio/x-m4a")));
  } catch (e) {
    canPlayM4A = false;
  }

  // Em file://, createMediaElementSource pode silenciar áudio por restrição CORS do navegador;
  // nesse caso controlamos o volume direto no HTMLAudioElement com rampa suave.
  const useMediaElementBus = location.protocol === "http:" || location.protocol === "https:";

  function ensureContext() {
    if (ctx) return ctx;
    try {
      const K = window.AudioContext || window.webkitAudioContext;
      if (!K) return null;
      ctx = new K();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 18;
      comp.ratio.value = 3;
      comp.attack.value = 0.006;
      comp.release.value = 0.18;
      comp.connect(ctx.destination);

      const master = ctx.createGain();
      master.gain.value = muted ? 0 : 1;
      master.connect(comp);

      const musicDuck = ctx.createGain();
      musicDuck.gain.value = duckFactor;
      musicDuck.connect(master);

      const music = ctx.createGain();
      music.gain.value = musicVol;
      music.connect(musicDuck);

      const sfx = ctx.createGain();
      sfx.gain.value = 0.3 * sfxVol;
      sfx.connect(master);

      const ui = ctx.createGain();
      ui.gain.value = 0.3 * sfxVol;
      ui.connect(master);

      bus = { master, music, musicDuck, sfx, ui, compressor: comp };
    } catch (e) {
      ctx = null;
      bus = null;
    }
    return ctx;
  }

  function applyVolumes() {
    const t = ctx ? ctx.currentTime : 0;
    if (bus && ctx) {
      try {
        bus.master.gain.setTargetAtTime(muted ? 0 : 1, t, 0.04);
        bus.music.gain.setTargetAtTime(musicVol, t, 0.06);
        bus.musicDuck.gain.setTargetAtTime(duckFactor, t, 0.08);
        bus.sfx.gain.setTargetAtTime(0.3 * sfxVol, t, 0.04);
        bus.ui.gain.setTargetAtTime(0.3 * sfxVol, t, 0.04);
      } catch (e) {
        bus.master.gain.value = muted ? 0 : 1;
        bus.music.gain.value = musicVol;
        bus.musicDuck.gain.value = duckFactor;
        bus.sfx.gain.value = 0.3 * sfxVol;
        bus.ui.gain.value = 0.3 * sfxVol;
      }
    }
    // Atualiza também instâncias HTMLAudio que não passam pelo bus Web Audio
    for (const v of voices) {
      syncVoiceGain(v);
    }
    if (activeJingle) syncVoiceGain(activeJingle);
  }

  // ===================== Motor de Música (2 instâncias + crossfade) =====================
  const voices = new Set(); // vozes ativas de música (loop atual + fade-outs)
  let currentTrackId = null;
  let primaryVoice = null;
  let activeJingle = null;
  let pendingTrack = null;
  let hiddenPaused = false;
  let jingleResumeTimer = 0;

  function syncVoiceGain(v) {
    if (!v || !v.audio) return;
    const g = Math.max(0, Math.min(1, v.fade * v.trackVol));
    if (v.gainNode && ctx) {
      try {
        v.gainNode.gain.setTargetAtTime(g, ctx.currentTime, 0.03);
      } catch (e) {
        v.gainNode.gain.value = g;
      }
    } else {
      const eff = muted ? 0 : g * musicVol * duckFactor;
      v.audio.muted = !!muted;
      v.audio.volume = Math.max(0, Math.min(1, eff));
    }
  }

  function destroyVoice(v) {
    if (!v) return;
    voices.delete(v);
    if (primaryVoice === v) primaryVoice = null;
    if (activeJingle === v) activeJingle = null;
    try {
      v.audio.onended = null;
      v.audio.onerror = null;
      v.audio.pause();
      v.audio.removeAttribute("src");
      v.audio.load();
    } catch (e) {}
    try {
      if (v.srcNode) v.srcNode.disconnect();
      if (v.gainNode) v.gainNode.disconnect();
    } catch (e) {}
  }

  function createVoice(trackId, cfg) {
    const a = new Audio();
    a.preload = "auto";
    a.playsInline = true;
    a.loop = false; // loop gerenciado com 2 instâncias + crossfade
    a.crossOrigin = "anonymous";
    a.src = cfg.url;

    let srcNode = null;
    let gainNode = null;
    if (useMediaElementBus && ctx && bus) {
      try {
        srcNode = ctx.createMediaElementSource(a);
        gainNode = ctx.createGain();
        gainNode.gain.value = 0;
        srcNode.connect(gainNode);
        gainNode.connect(bus.music);
      } catch (e) {
        srcNode = null;
        gainNode = null;
      }
    }

    const v = {
      trackId,
      cfg,
      audio: a,
      srcNode,
      gainNode,
      trackVol: cfg.vol != null ? cfg.vol : 0.85,
      fade: 0,
      fadeFrom: 0,
      fadeTo: 1,
      fadeStart: performance.now(),
      fadeDur: 1200,
      fadingOut: false,
      loopTriggered: false,
      failed: false
    };

    a.onerror = () => {
      v.failed = true;
      destroyVoice(v);
    };

    syncVoiceGain(v);
    return v;
  }

  function startFade(v, to, durSec, fadeOut) {
    v.fadeFrom = v.fade;
    v.fadeTo = to;
    v.fadeStart = performance.now();
    v.fadeDur = Math.max(40, (durSec || 1.2) * 1000);
    v.fadingOut = !!fadeOut;
  }

  function startVoicePlayback(v, startAt) {
    const a = v.audio;
    const seekAndPlay = () => {
      try {
        if (startAt > 0 && isFinite(a.duration) && startAt < a.duration - 0.5) {
          a.currentTime = startAt;
        }
      } catch (e) {}
      if (hiddenPaused) return;
      const pr = a.play();
      if (pr && typeof pr.catch === "function") {
        pr.catch(() => {
          // Autoplay bloqueado ou arquivo ausente: falha silenciosa
          if (!unlocked) pendingTrack = v.trackId;
          destroyVoice(v);
        });
      }
    };
    if (a.readyState >= 1) seekAndPlay();
    else {
      a.addEventListener("loadedmetadata", seekAndPlay, { once: true });
      // Também dispara play direto para iniciar streaming no mobile
      if (!hiddenPaused) {
        const pr = a.play();
        if (pr && typeof pr.catch === "function") pr.catch(() => {});
      }
    }
  }

  function playMusic(trackId, fadeSec) {
    const dur = fadeSec != null ? fadeSec : 1.2;
    if (!trackId || !MUSIC_CFG[trackId]) return;
    if (!canPlayM4A) return;
    clearTimeout(jingleResumeTimer);
    if (!unlocked) {
      pendingTrack = trackId;
      return;
    }
    if (currentTrackId === trackId && primaryVoice && !primaryVoice.failed && !primaryVoice.fadingOut) {
      return;
    }
    // Se havia jingle tocando, faz fade-out nele também
    if (activeJingle) {
      startFade(activeJingle, 0, Math.min(0.4, dur), true);
    }
    // Faz fade-out em todas as vozes anteriores (nunca corta seco)
    for (const old of voices) {
      startFade(old, 0, dur, true);
    }

    ensureContext();
    const cfg = MUSIC_CFG[trackId];
    const v = createVoice(trackId, cfg);
    voices.add(v);
    currentTrackId = trackId;
    primaryVoice = v;
    startFade(v, 1, dur, false);
    startVoicePlayback(v, cfg.loopStart || 0);
  }

  function stopMusic(fadeSec) {
    const dur = fadeSec != null ? fadeSec : 1.0;
    currentTrackId = null;
    primaryVoice = null;
    for (const v of voices) {
      startFade(v, 0, dur, true);
    }
  }

  function playJingle(trackId, resumeTrackId) {
    if (!trackId || !MUSIC_CFG[trackId] || !canPlayM4A || !unlocked) return;
    clearTimeout(jingleResumeTimer);
    // Baixa suavemente a música atual
    currentTrackId = null;
    primaryVoice = null;
    for (const v of voices) {
      startFade(v, 0, 0.35, true);
    }
    if (activeJingle) destroyVoice(activeJingle);

    ensureContext();
    const cfg = MUSIC_CFG[trackId];
    const j = createVoice(trackId, cfg);
    j.fade = 1;
    j.fadeFrom = 1;
    j.fadeTo = 1;
    j.fadeDur = 50;
    activeJingle = j;
    syncVoiceGain(j);

    const onFinish = () => {
      if (activeJingle === j) activeJingle = null;
      destroyVoice(j);
      if (resumeTrackId && !currentTrackId) {
        playMusic(resumeTrackId, 1.2);
      }
    };
    j.audio.onended = onFinish;
    j.audio.onerror = onFinish;
    startVoicePlayback(j, 0.02);
  }

  // Loop de atualização de crossfades e loop contínuo (a cada 80 ms — levíssimo)
  setInterval(() => {
    if (hiddenPaused) return;
    const now = performance.now();

    for (const v of [...voices]) {
      const elapsed = now - v.fadeStart;
      const p = Math.min(1, elapsed / v.fadeDur);
      v.fade = v.fadeFrom + (v.fadeTo - v.fadeFrom) * p;
      syncVoiceGain(v);

      if (v.fadingOut && p >= 1) {
        destroyVoice(v);
        continue;
      }

      // Loop sem corte: quando se aproxima do loopEnd, cria 2ª instância com crossfade
      if (v === primaryVoice && !v.fadingOut && !v.loopTriggered && !v.cfg.jingle) {
        const d = v.audio.duration;
        if (isFinite(d) && d > 3) {
          const lStart = v.cfg.loopStart || 0;
          const lEnd = v.cfg.loopEnd != null ? Math.min(d - 0.05, v.cfg.loopEnd) : Math.max(lStart + 3, d - 0.12);
          const xf = Math.min(v.cfg.xfade || 2.0, Math.max(0.5, (lEnd - lStart) * 0.25));
          if (v.audio.currentTime >= lEnd - xf) {
            v.loopTriggered = true;
            startFade(v, 0, xf, true);
            const nextV = createVoice(v.trackId, v.cfg);
            voices.add(nextV);
            primaryVoice = nextV;
            startFade(nextV, 1, xf, false);
            startVoicePlayback(nextV, lStart);
          }
        }
      }
    }

    if (activeJingle && activeJingle.fadingOut) {
      const p = Math.min(1, (now - activeJingle.fadeStart) / activeJingle.fadeDur);
      activeJingle.fade = activeJingle.fadeFrom + (activeJingle.fadeTo - activeJingle.fadeFrom) * p;
      syncVoiceGain(activeJingle);
      if (p >= 1) destroyVoice(activeJingle);
    }
  }, 80);

  // Pausar quando o app vai para segundo plano e retomar ao voltar
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      hiddenPaused = true;
      for (const v of voices) { try { v.audio.pause(); } catch (e) {} }
      if (activeJingle) { try { activeJingle.audio.pause(); } catch (e) {} }
      if (ctx && ctx.state === "running") ctx.suspend().catch(() => {});
    } else {
      hiddenPaused = false;
      if (!muted && unlocked) {
        if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
        for (const v of voices) { try { v.audio.play().catch(() => {}); } catch (e) {} }
        if (activeJingle) { try { activeJingle.audio.play().catch(() => {}); } catch (e) {} }
      }
    }
  });

  window.MUSIC_CFG = MUSIC_CFG;
  window.AUDIO = {
    MUSIC_CFG,
    REALM_MUSIC,
    unlock() {
      unlocked = true;
      const c = ensureContext();
      if (c && c.state === "suspended" && !muted) c.resume().catch(() => {});
      applyVolumes();
      if (pendingTrack) {
        const pt = pendingTrack;
        pendingTrack = null;
        playMusic(pt, 1.0);
      }
      return c;
    },
    getContext() { return ctx; },
    getBus(name) { return bus ? (bus[name] || bus.master) : null; },
    setMuted(m) {
      muted = !!m;
      if (muted && ctx && ctx.state === "running") ctx.suspend().catch(() => {});
      else if (!muted && unlocked && ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
      applyVolumes();
    },
    isMuted() { return muted; },
    setMusicVol(v) {
      musicVol = Math.max(0, Math.min(1, Number(v) || 0));
      applyVolumes();
    },
    setSfxVol(v) {
      sfxVol = Math.max(0, Math.min(1, Number(v) || 0));
      applyVolumes();
    },
    duck(on, level) {
      clearTimeout(duckTimer);
      duckFactor = on ? (level != null ? level : 0.18) : 1.0;
      applyVolumes();
    },
    duckPulse(ms, level) {
      clearTimeout(duckTimer);
      duckFactor = level != null ? level : 0.25;
      applyVolumes();
      duckTimer = setTimeout(() => {
        duckFactor = 1.0;
        applyVolumes();
      }, ms || 900);
    },
    musicForTheme(th) { return REALM_MUSIC[th] || "m_floresta"; },
    playMusic,
    stopMusic,
    playJingle,
    currentTrack() { return currentTrackId; }
  };
})();
