// Forja de Linhagens — Gerenciador de Pacotes de Recursos e Cache Offline
(function () {
  "use strict";

  const PACK_CACHE_ESS = "forja-pack-essential";
  const PACK_CACHE_CMP = "forja-pack-complete";
  const LS_HASHES = "forja-asset-hashes-v1";
  const LS_ALLOW_MOBILE = "forja-allow-mobile-v1";
  const LS_SUGGEST_SEEN = "forja-dl-suggest-v1";
  const CONCURRENCY = 4;
  const MAX_RETRIES = 3;

  let manifest = null;
  let savedHashes = {};
  try {
    savedHashes = JSON.parse(localStorage.getItem(LS_HASHES) || "{}") || {};
  } catch (e) {
    savedHashes = {};
  }

  let activeJob = null;

  function saveHashes() {
    try {
      localStorage.setItem(LS_HASHES, JSON.stringify(savedHashes));
    } catch (e) {}
  }

  function getAllowMobile() {
    try {
      return localStorage.getItem(LS_ALLOW_MOBILE) === "1";
    } catch (e) {
      return false;
    }
  }

  function setAllowMobile(val) {
    try {
      localStorage.setItem(LS_ALLOW_MOBILE, val ? "1" : "0");
    } catch (e) {}
  }

  function isOnMobileData() {
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!conn) return false;
    if (conn.type === "cellular") return true;
    if (conn.saveData) return true;
    return false;
  }

  function canDownloadNow() {
    if (!navigator.onLine) return { ok: false, reason: "offline" };
    if (isOnMobileData() && !getAllowMobile()) {
      return { ok: false, reason: "cellular" };
    }
    return { ok: true, reason: "" };
  }

  function fmtMB(bytes) {
    const mb = (Number(bytes) || 0) / (1024 * 1024);
    return (mb < 10 ? mb.toFixed(1) : mb.toFixed(1)).replace(".", ",") + " MB";
  }

  function cacheNameFor(pack) {
    return pack === "essential" ? PACK_CACHE_ESS : PACK_CACHE_CMP;
  }

  async function requestPersistence() {
    try {
      if (navigator.storage && navigator.storage.persist) {
        return await navigator.storage.persist();
      }
    } catch (e) {}
    return false;
  }

  async function getStorageInfo() {
    let usage = 0, quota = 0, persisted = false;
    try {
      if (navigator.storage && navigator.storage.estimate) {
        const est = await navigator.storage.estimate();
        usage = est.usage || 0;
        quota = est.quota || 0;
      }
      if (navigator.storage && navigator.storage.persisted) {
        persisted = await navigator.storage.persisted();
      }
    } catch (e) {}
    return { usage, quota, persisted };
  }

  async function loadManifest(forceNet) {
    if (manifest && !forceNet) return manifest;
    try {
      const res = await fetch("./asset-manifest.json?t=" + Date.now(), { cache: "no-store" });
      if (res && res.ok) {
        manifest = await res.json();
        try {
          const c = await caches.open(PACK_CACHE_ESS);
          await c.put("./asset-manifest.json", new Response(JSON.stringify(manifest), { headers: { "Content-Type": "application/json" } }));
        } catch (e) {}
        return manifest;
      }
    } catch (e) {}
    // Fallback offline do cache
    try {
      const hit = await caches.match("./asset-manifest.json", { ignoreSearch: true });
      if (hit) {
        manifest = await hit.json();
        return manifest;
      }
    } catch (e) {}
    return manifest;
  }

  function filterPackFiles(pack, currentRealmTheme) {
    if (!manifest || !Array.isArray(manifest.files)) return [];
    if (pack === "all") return manifest.files;
    if (pack === "essential") {
      return manifest.files.filter(f => f.pack === "essential" || (currentRealmTheme && f.realm === currentRealmTheme));
    }
    return manifest.files.filter(f => f.pack === pack);
  }

  async function inspectStatus(currentRealmTheme) {
    const mf = await loadManifest(false);
    if (!mf) {
      return {
        ready: false,
        version: "—",
        essTotal: 0, essDone: 0, essMissing: [],
        cmpTotal: 0, cmpDone: 0, cmpMissing: [],
        allTotal: 0, allDone: 0, allMissing: []
      };
    }
    const cEss = "caches" in window ? await caches.open(PACK_CACHE_ESS) : null;
    const cCmp = "caches" in window ? await caches.open(PACK_CACHE_CMP) : null;
    const essKeys = new Set();
    const cmpKeys = new Set();
    if (cEss) {
      for (const req of await cEss.keys()) {
        try { essKeys.add(new URL(req.url).pathname); } catch (e) {}
      }
    }
    if (cCmp) {
      for (const req of await cCmp.keys()) {
        try { cmpKeys.add(new URL(req.url).pathname); } catch (e) {}
      }
    }
    const basePath = new URL("./", location.href).pathname;
    const hasFile = f => {
      if (savedHashes[f.path] !== f.hash) return false;
      const fullP = basePath + f.path;
      return essKeys.has(fullP) || cmpKeys.has(fullP);
    };

    const essList = filterPackFiles("essential", currentRealmTheme);
    const allList = mf.files;
    let essTotal = 0, essDone = 0, allTotal = 0, allDone = 0;
    const essMissing = [], allMissing = [];

    for (const f of essList) {
      essTotal += f.size;
      if (hasFile(f)) essDone += f.size;
      else essMissing.push(f);
    }
    for (const f of allList) {
      allTotal += f.size;
      if (hasFile(f)) allDone += f.size;
      else allMissing.push(f);
    }

    return {
      ready: true,
      version: mf.version,
      essTotal, essDone, essMissing,
      cmpTotal: Math.max(0, allTotal - essTotal),
      cmpDone: Math.max(0, allDone - essDone),
      allTotal, allDone, allMissing
    };
  }

  async function pruneRemovedFiles() {
    if (!manifest || !("caches" in window)) return;
    const basePath = new URL("./", location.href).pathname;
    const valid = new Set(manifest.files.map(f => basePath + f.path));
    valid.add(basePath + "asset-manifest.json");
    for (const cname of [PACK_CACHE_ESS, PACK_CACHE_CMP]) {
      try {
        const c = await caches.open(cname);
        const keys = await c.keys();
        for (const req of keys) {
          const p = new URL(req.url).pathname;
          if (!valid.has(p)) await c.delete(req);
        }
      } catch (e) {}
    }
    const validRel = new Set(manifest.files.map(f => f.path));
    let changed = false;
    for (const k of Object.keys(savedHashes)) {
      if (!validRel.has(k)) { delete savedHashes[k]; changed = true; }
    }
    if (changed) saveHashes();
  }

  async function fetchWithRetry(file, signal) {
    let lastErr = null;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      if (signal && signal.aborted) throw new DOMException("Aborted", "AbortError");
      try {
        const res = await fetch("./" + file.path + "?v=" + file.hash, {
          cache: "no-store",
          signal
        });
        if (!res || !res.ok) throw new Error("HTTP " + (res ? res.status : 0));
        return res;
      } catch (err) {
        if (err && err.name === "AbortError") throw err;
        lastErr = err;
        if (attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, attempt * 600));
        }
      }
    }
    throw lastErr || new Error("Falha ao baixar " + file.path);
  }

  async function downloadPack(pack, opts) {
    opts = opts || {};
    const onProgress = typeof opts.onProgress === "function" ? opts.onProgress : () => {};
    const check = canDownloadNow();
    if (!opts.ignoreWifi && !check.ok) {
      return { ok: false, reason: check.reason };
    }
    const mf = await loadManifest(!!opts.forceManifest);
    if (!mf) return { ok: false, reason: "no-manifest" };

    await requestPersistence();

    const st = await inspectStatus(opts.currentRealmTheme);
    const list = pack === "essential" ? st.essMissing : st.allMissing;
    const totalAllBytes = pack === "essential" ? st.essTotal : st.allTotal;
    const alreadyBytes = pack === "essential" ? st.essDone : st.allDone;

    if (!list.length) {
      await pruneRemovedFiles();
      onProgress({ doneBytes: totalAllBytes, totalBytes: totalAllBytes, doneFiles: 0, totalFiles: 0, pct: 100, status: "done" });
      return { ok: true, downloaded: 0, failed: 0 };
    }

    if (activeJob) activeJob.cancel();

    let paused = false;
    let cancelled = false;
    let pauseResolvers = [];
    const ctrl = new AbortController();

    const job = {
      pack,
      isPaused: () => paused,
      pause() { paused = true; },
      resume() {
        paused = false;
        const arr = pauseResolvers;
        pauseResolvers = [];
        for (const fn of arr) fn();
      },
      cancel() {
        cancelled = true;
        paused = false;
        const arr = pauseResolvers;
        pauseResolvers = [];
        for (const fn of arr) fn();
        try { ctrl.abort(); } catch (e) {}
      }
    };
    activeJob = job;

    const cEss = await caches.open(PACK_CACHE_ESS);
    const cCmp = await caches.open(PACK_CACHE_CMP);

    let idx = 0;
    let doneBytes = alreadyBytes;
    let doneFiles = 0;
    let failed = 0;
    const totalFiles = list.length;

    const emit = (status, curFile) => {
      const pct = totalAllBytes > 0 ? Math.min(100, Math.round((doneBytes / totalAllBytes) * 100)) : 100;
      onProgress({ doneBytes, totalBytes: totalAllBytes, doneFiles, totalFiles, pct, status, currentFile: curFile || "" });
    };

    emit("running", "");

    async function waitIfPaused() {
      while (paused && !cancelled) {
        emit("paused", "");
        await new Promise(r => pauseResolvers.push(r));
      }
    }

    async function worker() {
      while (!cancelled) {
        await waitIfPaused();
        if (cancelled) break;
        const myIdx = idx++;
        if (myIdx >= list.length) break;
        const f = list[myIdx];
        try {
          const res = await fetchWithRetry(f, ctrl.signal);
          if (cancelled) break;
          const targetCache = f.pack === "essential" ? cEss : cCmp;
          await targetCache.put(new Request("./" + f.path), res);
          savedHashes[f.path] = f.hash;
          doneBytes += f.size;
          doneFiles++;
          if (doneFiles % 4 === 0 || doneFiles === totalFiles) saveHashes();
          emit("running", f.path);
        } catch (err) {
          if (cancelled || (err && err.name === "AbortError")) break;
          failed++;
          emit("running", f.path);
        }
      }
    }

    const workers = [];
    for (let w = 0; w < Math.min(CONCURRENCY, list.length); w++) {
      workers.push(worker());
    }
    await Promise.all(workers);
    saveHashes();

    if (activeJob === job) activeJob = null;

    if (cancelled) {
      emit("cancelled", "");
      return { ok: false, reason: "cancelled", downloaded: doneFiles, failed };
    }

    await pruneRemovedFiles();
    emit("done", "");
    return { ok: failed === 0, reason: failed ? "partial" : "", downloaded: doneFiles, failed };
  }

  async function clearDownloadedAssets() {
    if (activeJob) activeJob.cancel();
    if ("caches" in window) {
      for (const cname of [PACK_CACHE_ESS, PACK_CACHE_CMP, "forja-de-linhagens-videos-v1"]) {
        try { await caches.delete(cname); } catch (e) {}
      }
    }
    savedHashes = {};
    saveHashes();
    return true;
  }

  window.ASSETS = {
    PACK_CACHE_ESS,
    PACK_CACHE_CMP,
    LS_SUGGEST_SEEN,
    fmtMB,
    getAllowMobile,
    setAllowMobile,
    isOnMobileData,
    canDownloadNow,
    loadManifest,
    inspectStatus,
    downloadPack,
    clearDownloadedAssets,
    getStorageInfo,
    requestPersistence,
    getActiveJob: () => activeJob
  };
})();
