import { initializeApp, getApps } from 'firebase/app'
import {
  getAuth,
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

const FIREBASE_CONFIG = {
  apiKey:            import.meta.env.VITE_FB_API_KEY,
  authDomain:        import.meta.env.VITE_FB_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FB_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FB_STORAGE,
  messagingSenderId: import.meta.env.VITE_FB_MSG_ID,
  appId:             import.meta.env.VITE_FB_APP_ID
}

const app  = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG)
const auth = getAuth(app)
const db   = getFirestore(app)

export const isConfigured = !!FIREBASE_CONFIG.apiKey
export function checkConfigured() { return isConfigured }

function isInAppOrWebView() {
  const ua = navigator.userAgent || ''
  const isAndroidWebView = /Android/.test(ua) && /; wv\)/.test(ua)
  const isInAppBrowser = /FBAN|FBAV|Instagram|Line\/|MicroMessenger/.test(ua)
  const isNativeShell = !!(window.Capacitor || window.cordova)
  return isAndroidWebView || isInAppBrowser || isNativeShell
}

export async function loginWithGoogle() {
  const provider = new GoogleAuthProvider()
  if (isInAppOrWebView()) {
    await signInWithRedirect(auth, provider)
    return null
  }
  const result = await signInWithPopup(auth, provider)
  return result.user
}

export async function getGoogleRedirectResult() {
  try {
    const result = await getRedirectResult(auth)
    return result?.user || null
  } catch (e) {
    console.warn('[ForexScanner] getRedirectResult failed:', e.message)
    return null
  }
}

export async function loginWithEmail(email, password) {
  const result = await signInWithEmailAndPassword(auth, email, password)
  return result.user
}

export async function signUpWithEmail(email, password, displayName) {
  const result = await createUserWithEmailAndPassword(auth, email, password)
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

export async function saveSettingsToCloud(uid, settings) {
  if (!uid) return false
  try {
    const ref = doc(db, 'users', uid, 'settings', 'forex-scanner')
    await setDoc(ref, { ...settings, _savedAt: Date.now() })
    return true
  } catch (e) {
    console.warn('[ForexScanner] saveSettings failed:', e.message)
    return false
  }
}

export async function loadSettingsFromCloud(uid) {
  if (!uid) return null
  try {
    const ref = doc(db, 'users', uid, 'settings', 'forex-scanner')
    const snap = await getDoc(ref)
    return snap.exists() ? snap.data() : null
  } catch (e) {
    console.warn('[ForexScanner] loadSettings failed:', e.message)
    return null
  }
}

const SCAN_FIELDS = [
  'timeframe','scanInterval','symbolSet','customPairs',
  'scanMode','dedupInterval','volumeFilter','resultFilter',
  'patternsMode','autoScan','viewMode','scannerEnabled',
]

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
    console.warn('[ForexScanner] saveScanSettings failed:', e.message)
    return false
  }
}

export function subscribeScanSettings(uid, onChange) {
  if (!uid) return () => {}
  const ref = doc(db, 'users', uid, 'settings', 'scan-config')
  return onSnapshot(ref, snap => {
    if (snap.exists()) onChange(snap.data())
  }, err => console.warn('[ForexScanner] scan-settings snapshot error:', err.message))
}
