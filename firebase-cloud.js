// Forja de Linhagens — Autenticação e Save na Nuvem (Firebase Modular SDK via CDN)
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-analytics.js";
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  linkWithPopup,
  linkWithRedirect,
  signInWithCredential,
  signOut
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyC2OfLgSoS1VV2Pbj_HrckNWMHWemW0kVI",
  authDomain: "forja-de-linhagens.firebaseapp.com",
  projectId: "forja-de-linhagens",
  storageBucket: "forja-de-linhagens.firebasestorage.app",
  messagingSenderId: "608111862352",
  appId: "1:608111862352:web:23ef70ea95e42a9c24a755",
  measurementId: "G-J2ZFZNXEGX"
};

const app = initializeApp(firebaseConfig);
try { getAnalytics(app); } catch (e) {}

const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

function sanitizeUser(u) {
  if (!u) return null;
  // Nunca expor ou armazenar email no save; usar apenas uid e displayName
  return {
    uid: u.uid,
    isAnonymous: !!u.isAnonymous,
    displayName: u.displayName || (u.isAnonymous ? "Convidado" : "Jogador"),
    photoURL: u.photoURL || ""
  };
}

function shouldFallbackRedirect(err) {
  const code = err && err.code ? String(err.code) : "";
  return (
    code === "auth/popup-blocked" ||
    code === "auth/operation-not-supported-in-this-environment" ||
    code === "auth/web-storage-unsupported"
  );
}

const listeners = new Set();
let currentUser = null;
let authResolved = false;
let redirectEvent = null;

let resolveReady;
const readyPromise = new Promise(res => { resolveReady = res; });

// Processa eventual retorno de signInWithRedirect / linkWithRedirect (mobile)
const redirectPromise = getRedirectResult(auth)
  .then(res => {
    if (res && res.user) {
      redirectEvent = { type: "redirect-ok", user: sanitizeUser(res.user) };
    }
  })
  .catch(async err => {
    if (err && err.code === "auth/credential-already-in-use") {
      const cred = GoogleAuthProvider.credentialFromError(err);
      if (cred) {
        try {
          const res2 = await signInWithCredential(auth, cred);
          redirectEvent = { type: "credential-in-use", user: sanitizeUser(res2.user) };
        } catch (e2) {
          redirectEvent = { type: "error", error: e2 };
        }
      }
    } else if (err) {
      redirectEvent = { type: "error", error: err };
    }
  });

onAuthStateChanged(auth, async user => {
  await redirectPromise;
  currentUser = sanitizeUser(user);
  if (!authResolved) {
    authResolved = true;
    resolveReady({ user: currentUser, redirectEvent });
  }
  for (const fn of listeners) {
    try { fn(currentUser); } catch (e) {}
  }
});

const CLOUD = {
  available: true,
  ready: readyPromise,
  getUser() {
    return currentUser;
  },
  consumeRedirectEvent() {
    const ev = redirectEvent;
    redirectEvent = null;
    return ev;
  },
  onAuth(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  async signInGuest() {
    const res = await signInAnonymously(auth);
    currentUser = sanitizeUser(res.user);
    return currentUser;
  },
  async signInGoogle() {
    try {
      const res = await signInWithPopup(auth, googleProvider);
      currentUser = sanitizeUser(res.user);
      return { user: currentUser, redirected: false };
    } catch (err) {
      if (shouldFallbackRedirect(err)) {
        await signInWithRedirect(auth, googleProvider);
        return { user: null, redirected: true };
      }
      throw err;
    }
  },
  async linkGoogle() {
    if (!auth.currentUser) {
      return this.signInGoogle();
    }
    try {
      const res = await linkWithPopup(auth.currentUser, googleProvider);
      currentUser = sanitizeUser(res.user);
      return { user: currentUser, linked: true, alreadyInUse: false, redirected: false };
    } catch (err) {
      if (err && err.code === "auth/credential-already-in-use") {
        const cred = GoogleAuthProvider.credentialFromError(err);
        if (cred) {
          const res2 = await signInWithCredential(auth, cred);
          currentUser = sanitizeUser(res2.user);
          return { user: currentUser, linked: false, alreadyInUse: true, redirected: false };
        }
      }
      if (shouldFallbackRedirect(err)) {
        await linkWithRedirect(auth.currentUser, googleProvider);
        return { user: null, linked: false, alreadyInUse: false, redirected: true };
      }
      throw err;
    }
  },
  async logout() {
    await signOut(auth);
    currentUser = null;
  },
  async loadSave(uid) {
    const id = uid || (auth.currentUser && auth.currentUser.uid);
    if (!id) return { exists: false, data: null, updatedAtMs: 0 };
    const ref = doc(db, "saves", id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return { exists: false, data: null, updatedAtMs: 0 };
    const raw = snap.data() || {};
    let tsMs = Number(raw.updatedAtMs) || 0;
    if (raw.updatedAt && typeof raw.updatedAt.toMillis === "function") {
      tsMs = Math.max(tsMs, raw.updatedAt.toMillis());
    }
    return {
      exists: true,
      v: Number(raw.v) || 2,
      uid: raw.uid || id,
      displayName: raw.displayName || "Jogador",
      updatedAtMs: tsMs,
      data: raw.data || null
    };
  },
  async saveCloud(uid, saveObj, updatedAtMs) {
    const id = uid || (auth.currentUser && auth.currentUser.uid);
    if (!id) return false;
    const u = currentUser || sanitizeUser(auth.currentUser);
    const ref = doc(db, "saves", id);
    const cleanData = JSON.parse(JSON.stringify(saveObj));
    await setDoc(ref, {
      v: Number(cleanData.v) || 3,
      uid: id,
      displayName: (u && u.displayName) || "Convidado",
      updatedAt: serverTimestamp(),
      updatedAtMs: Number(updatedAtMs) || Date.now(),
      data: cleanData
    }, { merge: true });
    return true;
  }
};

window.CLOUD = CLOUD;
window.dispatchEvent(new CustomEvent("forja-cloud-ready", { detail: CLOUD }));
