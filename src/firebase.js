// firebase.js — Signal Engine v2.0
// Firebase project: signal-engines

import { initializeApp, getApps } from 'firebase/app'
import {
  getAuth,
  setPersistence,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
  onAuthStateChanged
} from 'firebase/auth'
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  onSnapshot,
} from 'firebase/firestore'

// ── Config ────────────────────────────────────────────────
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyAZahY8Ci0yGHHZcf5TLTakNod16Hihbqo",
  authDomain:        "signal-engines.firebaseapp.com",
  projectId:         "signal-engines",
  storageBucket:     "signal-engines.firebasestorage.app",
  messagingSenderId: "998907341980",
  appId:             "1:998907341980:web:84aea5bfe2f6238e049159"
}

// ── Init ──────────────────────────────────────────────────
const app  = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG)
const auth = getAuth(app)
const db   = getFirestore(app)

export const isConfigured = true
export function checkConfigured() { return true }

// ── Auth ──────────────────────────────────────────────────
// Explicitly persist sessions across reloads. Prefer IndexedDB (more reliable
// in modern mobile browsers/WebViews), then fall back to browser storage.
let persistencePromise
async function ensureAuthPersistence() {
  if (!persistencePromise) {
    persistencePromise = (async () => {
      for (const persistence of [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence]) {
        try { await setPersistence(auth, persistence); return true } catch (e) {
          console.warn('[CoinSniper] Auth persistence fallback:', e?.code || e?.message || e)
        }
      }
      return false
    })()
  }
  return persistencePromise
}

// Detect Android WebView / in-app browser wrappers (TWA, Capacitor, Cordova,
// app-converter shells, Instagram/Facebook in-app browser, etc). Google
// blocks signInWithPopup inside these — it silently fails or shows a blank
// screen with "popup closed by user" even on a real tap. Redirect-based
// sign-in works everywhere because it navigates the whole page instead of
// opening a JS popup window.
function isInAppOrWebView() {
  const ua = navigator.userAgent || ''
  // Android WebView signature: "; wv)" in the UA string
  const isAndroidWebView = /Android/.test(ua) && /; wv\)/.test(ua)
  // Common in-app browsers that also block popups
  const isInAppBrowser = /FBAN|FBAV|Instagram|Line\/|MicroMessenger/.test(ua)
  // Capacitor/Cordova native shells
  const isNativeShell = !!(window.Capacitor || window.cordova)
  return isAndroidWebView || isInAppBrowser || isNativeShell
}

export async function loginWithGoogle() {
  await ensureAuthPersistence()
  const provider = new GoogleAuthProvider()
  if (isInAppOrWebView()) {
    // Redirect flow: navigates away to Google, then back to this page.
    // Result is NOT returned here — call getGoogleRedirectResult() on
    // app mount to pick it up after the page reloads.
    await signInWithRedirect(auth, provider)
    return null
  }
  const result = await signInWithPopup(auth, provider)
  return result.user
}

// Call this once on app startup (before/alongside onAuthStateChanged) to
// catch the result of a signInWithRedirect that completed on page reload.
export async function getGoogleRedirectResult() {
  try {
    const result = await getRedirectResult(auth)
    return result?.user || null
  } catch (e) {
    console.warn('[CoinSniper] getRedirectResult failed:', e.message)
    return null
  }
}

export async function loginWithEmail(email, password) {
  await ensureAuthPersistence()
  const result = await signInWithEmailAndPassword(auth, email.trim(), password)
  return result.user
}

export async function signUpWithEmail(email, password, displayName) {
  await ensureAuthPersistence()
  const result = await createUserWithEmailAndPassword(auth, email.trim(), password)
  if (displayName?.trim()) {
    await updateProfile(result.user, { displayName: displayName.trim() })
  }
  return result.user
}

export async function logout() {
  await signOut(auth)
}

export async function onAuthChanged(callback) {
  return onAuthStateChanged(auth, callback)
}

// ── Firestore ─────────────────────────────────────────────
export async function saveSettingsToCloud(uid, settings) {
  if (!uid) return false
  try {
    const ref = doc(db, 'users', uid, 'settings', 'ema-sigma')
    // Full overwrite — no merge. We always save the complete settings object,
    // so merge:true is unnecessary and harmful: Firestore merge:true can fail
    // to overwrite arrays when the new value is [] (empty), causing stale trash
    // to reappear after restore on re-login.
    await setDoc(ref, { ...settings, _savedAt: Date.now() })
    return true
  } catch (e) {
    console.warn('[Signal Engine] saveSettings failed:', e.message)
    return false
  }
}

export async function loadSettingsFromCloud(uid) {
  if (!uid) return null
  try {
    const ref = doc(db, 'users', uid, 'settings', 'ema-sigma')
    const snap = await getDoc(ref)
    return snap.exists() ? snap.data() : null
  } catch (e) {
    console.warn('[Signal Engine] loadSettings failed:', e.message)
    return null
  }
}

// Trash Bin is stored independently so unrelated settings saves or stale
// full-document writes can never erase patterns waiting for permanent deletion.
export async function savePatternBinToCloud(uid, patterns) {
  if (!uid) return false
  try {
    await setDoc(doc(db, 'users', uid, 'data', 'pattern-bin'), {
      deletedPatterns: Array.isArray(patterns) ? patterns : [],
      updatedAt: Date.now(),
    })
    return true
  } catch (e) {
    console.warn('[Signal Engine] pattern bin save failed:', e.message)
    return false
  }
}

export async function loadPatternBinFromCloud(uid) {
  if (!uid) return null
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'data', 'pattern-bin'))
    return snap.exists() ? snap.data() : null
  } catch (e) {
    console.warn('[Signal Engine] pattern bin load failed:', e.message)
    return null
  }
}

// Per-account notification cooldowns survive browser changes and device switches.
export async function saveNotificationCooldownsToCloud(uid, cooldowns) {
  if (!uid) return false
  try {
    await setDoc(doc(db, 'users', uid, 'data', 'notification-cooldowns'), {
      cooldowns: cooldowns || {},
      updatedAt: Date.now(),
    })
    return true
  } catch (e) {
    console.warn('[CoinSniper] notification cooldown save failed:', e.message)
    return false
  }
}

export async function loadNotificationCooldownsFromCloud(uid) {
  if (!uid) return null
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'data', 'notification-cooldowns'))
    return snap.exists() ? snap.data().cooldowns || {} : null
  } catch (e) {
    console.warn('[CoinSniper] notification cooldown load failed:', e.message)
    return null
  }
}

// ── Scan Settings (separate doc — real-time sync) ────────────────────────────
const SCAN_FIELDS = [
  'timeframe','scanInterval','symbolSet','customPairs','assetGroups','selectedAssetGroupIds',
  'scanMode','dedupInterval','volumeFilter','resultFilter',
  'patternsMode','autoScan','viewMode','scannerEnabled',
  'scanOnLoad','loopScan','allAssetScope','concurrency','cacheTtl','defaultSort','defaultSortDir','defaultViewMode','defaultResultFilter','namedCustomLists','activeCustomListName','customCryptoLimit','customSelectionType',
]
// Also includes TF-scoped keys: scanMode_15m, dedupInterval_1h, etc.

export function isScanField(key) {
  return SCAN_FIELDS.includes(key) ||
    key.startsWith('scanMode_') || key.startsWith('dedupInterval_') ||
    key.startsWith('resultFilter_') || key.startsWith('volumeFilter_') ||
    key.startsWith('scannerEnabled_')
}

export async function saveScanSettings(uid, allSettings) {
  if (!uid) return false
  try {
    const ref  = doc(db, 'users', uid, 'settings', 'scan-config')
    const data = { _savedAt: Date.now() }
    Object.keys(allSettings).forEach(k => { if (isScanField(k)) data[k] = allSettings[k] })
    await setDoc(ref, data)
    return true
  } catch (e) {
    console.warn('[CoinSniper] saveScanSettings failed:', e.message)
    return false
  }
}

export async function loadScanSettingsFromCloud(uid) {
  if (!uid) return null
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'settings', 'scan-config'))
    return snap.exists() ? snap.data() : null
  } catch (e) {
    console.warn('[CoinSniper] loadScanSettings failed:', e.message)
    return null
  }
}

export function subscribeScanSettings(uid, onChange) {
  if (!uid) return () => {}
  const ref = doc(db, 'users', uid, 'settings', 'scan-config')
  return onSnapshot(ref, snap => {
    if (snap.exists()) onChange(snap.data())
  }, err => console.warn('[CoinSniper] scan-settings snapshot error:', err.message))
}
