import { useState, useEffect, useCallback, useRef } from 'react'
import { saveSettingsToCloud, loadSettingsFromCloud, saveScanSettings, subscribeScanSettings, isScanField } from '../firebase.js'

const STORAGE_KEY = 'cfa_settings_v4'

const DEFAULT_30_PAIRS = [
  'BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','XRPUSDT',
  'ADAUSDT','DOGEUSDT','AVAXUSDT','MATICUSDT','DOTUSDT',
  'LINKUSDT','UNIUSDT','LTCUSDT','ATOMUSDT','NEARUSDT',
  'APTUSDT','ARBUSDT','OPUSDT','INJUSDT','SUIUSDT',
  'SHIBUSDT','TRXUSDT','TONUSDT','FETUSDT','RNDRUSDT',
  'WIFUSDT','PEPEUSDT','FLOKIUSDT','TIAUSDT','JUPUSDT',
]

export const DEFAULTS = {
  timeframe:    '15m',
  scanInterval: '30s',
  darkMode:     true,
  symbolSet:    'all',
  customPairs:  DEFAULT_30_PAIRS,
  scanMode:       'all',
  autoScan:       false,
  viewMode:       'list',
  dedupInterval:  '1m',
  scannerEnabled: {},
  volumeFilter:  '500k',
  resultFilter:  'all',
  patternsMode:  'all',
  patternTfs:    {},
  soundEnabled: true,
  tgOn:         false,
  tgToken:      '',
  tgChatId:     '',
  wickEnabled:   true,
  wickTouchPct:  1.5,
  scoreFilterEnabled: false,
  scoreMin:           5,
  defaultSort:    'volume',
  defaultSortDir: 'desc',
  // Pattern lists — always present so Firestore full-overwrites never miss them
  customPatterns:  [],
  deletedPatterns: [],
  // Timestamps: track when critical fields were last saved locally
  _customPatternsAt:  0,
  _deletedPatternsAt: 0,
  _scanSettingsAt:    0,
}

// Fields that must be saved to cloud immediately (no debounce)
const CRITICAL_KEYS = new Set([
  // Pattern data
  'customPatterns', 'deletedPatterns',
  '_customPatternsAt', '_deletedPatternsAt',
  // Scanner toggles & TF assignments
  'scannerEnabled', 'patternTfs',
  // Scan settings (Settings tab)
  'symbolSet', 'scanInterval', 'dedupInterval', 'volumeFilter',
  'resultFilter', 'scanMode', 'patternsMode',
  'defaultSort', 'defaultSortDir',
  // Alert / notification settings
  'soundEnabled', 'tgOn', 'tgToken', 'tgChatId',
  // Appearance
  'darkMode',
  // Signal strength
  'wickEnabled', 'wickTouchPct', 'scoreFilterEnabled', 'scoreMin',
])

function hasCriticalKey(patch) {
  if (typeof patch !== 'object' || patch === null) return false
  return Object.keys(patch).some(k =>
    CRITICAL_KEYS.has(k) ||
    k.startsWith('scannerEnabled_') ||
    k.startsWith('patternTfs_') ||
    k.startsWith('scanMode_') ||
    k.startsWith('dedupInterval_') ||
    k.startsWith('resultFilter_') ||
    k.startsWith('volumeFilter_')
  )
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }

// Stamp missing condition ids onto patterns loaded from storage
function normalizeLoadedPatterns(patterns) {
  if (!Array.isArray(patterns)) return []
  return patterns.map(p => ({
    ...p,
    conditions: (p.conditions || []).map(c => ({
      htfTf: null,
      rangeCheck: false,
      rangeMode: 'all',
      ...c,
      id: c.id || uid(),
    })),
  }))
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { settings: DEFAULTS, isFirstVisit: true }
    const parsed = JSON.parse(raw)
    if (parsed.customPatterns) parsed.customPatterns = normalizeLoadedPatterns(parsed.customPatterns)
    const merged = { ...DEFAULTS, ...parsed }
    // Stamp _scanSettingsAt = now so this browser's local scan settings
    // are always treated as "current session" — prevents onSnapshot from
    // overwriting them with stale cloud data on page refresh.
    merged._scanSettingsAt = Date.now()
    // NOTE: deliberately do NOT stamp _deletedPatternsAt / _customPatternsAt here.
    // Doing so would make a fresh/empty local trash array look "newer" than real
    // cloud data, causing mergeCloud to wrongly prefer the empty local array and
    // wipe out the user's actual trash/patterns on login. Leave these at whatever
    // value localStorage had (0 if this device has never saved anything) so cloud
    // (with a real, non-zero timestamp) correctly wins when this device is fresh.
    return { settings: merged, isFirstVisit: false }
  } catch { return { settings: DEFAULTS, isFirstVisit: true } }
}

export function useSettings(firebaseUser) {
  const loaded = load()
  const [settings, setSettings] = useState(loaded.settings)
  const isFirstVisit = useRef(loaded.isFirstVisit)
  const [cloudSynced, setCloudSynced] = useState(false)
  const [cloudSaving, setCloudSaving] = useState(false)
  const saveTimeoutRef = useRef(null)
  const prevUidRef = useRef(null)
  // Always holds the latest settings — readable synchronously in callbacks
  const settingsRef = useRef(loaded.settings)

  // Keep settingsRef in sync AND persist to localStorage on every state change
  useEffect(() => {
    settingsRef.current = settings
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)) } catch {}
  }, [settings])

  // ── Direct cloud save (no debounce) ───────────────────────
  const saveNow = useCallback(async (overrideSettings) => {
    const uid = firebaseUser?.uid
    if (!uid) return false
    clearTimeout(saveTimeoutRef.current)
    const toSave = overrideSettings ?? settingsRef.current
    setCloudSaving(true)
    const ok = await saveSettingsToCloud(uid, toSave)
    if (ok) setCloudSynced(true)
    setCloudSaving(false)
    return ok
  }, [firebaseUser])

  // ── Shared helper: merge cloud snapshot into local state ──────────────────
  // Returns the merged object (does NOT call setSettings — caller does that).
  // Rule: cloud wins unless local timestamp is STRICTLY newer.
  // We do NOT push the merged result back to Firestore here; callers decide
  // whether to do that (login does, tab-focus does not — to avoid a write
  // storm when many tabs are open).
  const mergeCloud = useCallback((prev, cloud) => {
    const { _savedAt: cloudSavedAt, ...clean } = cloud
    const localSavedAt = prev._savedAt || 0

    // If local was saved more recently than cloud, keep local values for
    // all non-pattern settings (scanInterval, volumeFilter, symbolSet, etc.)
    // This prevents cloud overwriting a change the user just made before
    // Firebase had time to sync it.
    const base = localSavedAt > (cloudSavedAt || 0) ? { ...clean, ...prev } : { ...prev, ...clean }
    const merged = { ...base }

    // Per-field protection: if local scan settings are newer, keep them
    const localScanAt = prev._scanSettingsAt || 0
    const cloudScanAt = clean._scanSettingsAt || 0
    if (localScanAt > cloudScanAt) {
      const SF = ['timeframe','scanInterval','symbolSet','customPairs','scanMode','dedupInterval','volumeFilter','resultFilter','patternsMode','autoScan','viewMode','scannerEnabled']
      SF.forEach(k => { merged[k] = prev[k] })
      Object.keys(prev).forEach(k => {
        if (k.startsWith('scanMode_') || k.startsWith('dedupInterval_') ||
            k.startsWith('resultFilter_') || k.startsWith('volumeFilter_') ||
            k.startsWith('scannerEnabled_')) { merged[k] = prev[k] }
      })
      merged._scanSettingsAt = localScanAt
    }

    // customPatterns: keep local only when it is strictly newer — same
    // empty-array defensive guard as trash above.
    const localAt = prev._customPatternsAt  || 0
    const cloudAt = clean._customPatternsAt || 0
    const localPatEmpty = !prev.customPatterns || prev.customPatterns.length === 0
    const cloudHasPat   = Array.isArray(clean.customPatterns) && clean.customPatterns.length > 0
    if (localAt > cloudAt && !(localPatEmpty && cloudHasPat)) {
      merged.customPatterns    = prev.customPatterns
      merged._customPatternsAt = localAt
    } else {
      merged.customPatterns    = clean.customPatterns ?? prev.customPatterns
      merged._customPatternsAt = cloudAt || localAt
    }

    // Normalize patterns from either source — stamp missing condition ids
    merged.customPatterns = normalizeLoadedPatterns(merged.customPatterns)

    // Same for trash — additionally: never let an empty local array beat
    // cloud data just because of a timestamp edge case (defensive guard).
    const localTrAt = prev._deletedPatternsAt  || 0
    const cloudTrAt = clean._deletedPatternsAt || 0
    const localTrashEmpty = !prev.deletedPatterns || prev.deletedPatterns.length === 0
    const cloudHasTrash   = Array.isArray(clean.deletedPatterns) && clean.deletedPatterns.length > 0
    if (localTrAt > cloudTrAt && !(localTrashEmpty && cloudHasTrash)) {
      merged.deletedPatterns    = prev.deletedPatterns
      merged._deletedPatternsAt = localTrAt
    } else {
      merged.deletedPatterns    = clean.deletedPatterns ?? prev.deletedPatterns
      merged._deletedPatternsAt = cloudTrAt || localTrAt
    }

    return merged
  }, [])

  // ── Cloud load on login ────────────────────────────────────
  useEffect(() => {
    const uid = firebaseUser?.uid
    if (!uid || uid === prevUidRef.current) return
    prevUidRef.current = uid
    setCloudSynced(false)

    loadSettingsFromCloud(uid).then(cloud => {
      if (!cloud) {
        // First time user — push whatever is in local storage up to cloud
        saveNow()
        return
      }
      // IMPORTANT: compute merged OUTSIDE setSettings so we can pass it
      // directly to saveSettingsToCloud below. setSettings(fn) is async —
      // reading settingsRef.current after calling setSettings but before
      // React processes the updater returns the stale PRE-merge value,
      // which would immediately overwrite Firestore with the old (empty)
      // trash and wipe out patterns that were correctly loaded from cloud.
      const currentLocal = settingsRef.current
      const merged = mergeCloud(currentLocal, cloud)
      settingsRef.current = merged   // sync ref immediately
      setSettings(merged)            // trigger re-render + localStorage persist

      // Push merged state back to Firestore using the local `merged` reference
      // (NOT settingsRef.current — React may not have processed the setState yet).
      saveSettingsToCloud(uid, merged).then(() => setCloudSynced(true))
      saveScanSettings(uid, merged)
    })
  }, [firebaseUser, saveNow, mergeCloud])

  // ── Re-sync from cloud when tab becomes visible ────────────
  // This is the key fix for cross-browser sync: when Chrome regains focus
  // after changes were made in Brave (or any other browser/tab), we silently
  // pull the latest cloud state. If cloud is newer, it wins automatically
  // via mergeCloud's timestamp logic. We do NOT push back to Firestore here
  // (no write storm), and we do NOT show a loading spinner — it's invisible.
  useEffect(() => {
    const uid = firebaseUser?.uid
    if (!uid) return

    function handleVisibilityChange() {
      if (document.visibilityState !== 'visible') return
      loadSettingsFromCloud(uid).then(cloud => {
        if (!cloud) return
        // Compute merged outside setSettings to avoid reading stale settingsRef
        const visLocal = settingsRef.current
        const visMerged = mergeCloud(visLocal, cloud)
        const visChanged = Object.keys(visMerged).some(k => visMerged[k] !== visLocal[k])
        if (visChanged) {
          settingsRef.current = visMerged
          setSettings(visMerged)
        }
      })
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [firebaseUser, mergeCloud])

  // ── Real-time scan settings listener ──────────────────────────────────────
  // subscribeScanSettings uses onSnapshot so any change in another browser/tab
  // arrives here instantly without polling. Cloud always wins for scan settings
  // (highest _savedAt wins) because they have no local pending work like patterns do.
  useEffect(() => {
    const uid = firebaseUser?.uid
    if (!uid) return
    // Record when we started the subscription so we can ignore the
    // immediate "echo" snapshot that Firestore fires on subscription open.
    const subStartAt = Date.now()

    const unsub = subscribeScanSettings(uid, (cloudScan) => {
      const cloudAt = cloudScan._savedAt || 0
      // Ignore the initial snapshot echo fired right after subscribe —
      // it always contains the old cloud state and would overwrite
      // settings the user already has loaded locally on this page.
      const elapsed = Date.now() - subStartAt
      if (elapsed < 3000) return // skip first echo (fires within ~200ms)
      setSettings(prev => {
        const localAt = prev._scanSettingsAt || 0
        // Only apply if cloud snapshot is strictly newer than local
        if (cloudAt <= localAt) return prev
        const next = { ...prev }
        Object.keys(cloudScan).forEach(k => {
          if (k !== '_savedAt' && isScanField(k)) next[k] = cloudScan[k]
        })
        next._scanSettingsAt = cloudAt
        settingsRef.current = next
        return next
      })
    })
    return unsub
  }, [firebaseUser])

  useEffect(() => {
    if (!firebaseUser) { prevUidRef.current = null; setCloudSynced(false) }
  }, [firebaseUser])

  // ── update(): the single entry point for all setting changes ──
  // For critical keys (patterns, scanners, etc.) — saves to Firebase immediately.
  // For non-critical — debounces 2 seconds.

  function hasScanKey(p) {
    if (typeof p !== 'object' || p === null) return false
    return Object.keys(p).some(k => isScanField(k))
  }
  const update = useCallback((patch) => {
    // Compute next state — stamp _savedAt so mergeCloud can compare recency
    const now = Date.now()
    const base = typeof patch === 'function'
      ? { ...patch(settingsRef.current), _savedAt: now }
      : { ...settingsRef.current, ...patch, _savedAt: now }
    const isScanPatch = typeof patch !== 'function' && hasScanKey(patch)
    const next = isScanPatch ? { ...base, _scanSettingsAt: now } : base

    // Update ref immediately so subsequent calls in the same tick see latest state
    settingsRef.current = next

    // Update React state (triggers re-render + localStorage persist via useEffect)
    setSettings(next)

    // Cloud save
    const uid = firebaseUser?.uid
    if (!uid) return

    const isCritical = typeof patch === 'function'
      ? true  // function patches always treated as critical (e.g. complex updates)
      : hasCriticalKey(patch)

    if (isScanPatch) {
      // Scan settings → save to dedicated doc immediately for real-time cross-browser sync
      saveScanSettings(uid, next)
    }
    if (isCritical) {
      clearTimeout(saveTimeoutRef.current)
      setCloudSaving(true)
      saveSettingsToCloud(uid, next).then(ok => {
        if (ok) setCloudSynced(true)
        setCloudSaving(false)
      })
    } else {
      clearTimeout(saveTimeoutRef.current)
      setCloudSaving(true)
      saveTimeoutRef.current = setTimeout(() => {
        saveSettingsToCloud(uid, settingsRef.current).then(ok => {
          if (ok) setCloudSynced(true)
          setCloudSaving(false)
        })
      }, 2000)
    }
  }, [firebaseUser])

  // saveNowWithPatch — kept for API compatibility, merges patch and saves immediately
  const saveNowWithPatch = useCallback(async (patch) => {
    const uid = firebaseUser?.uid
    if (!uid) return false
    clearTimeout(saveTimeoutRef.current)
    const merged = { ...settingsRef.current, ...patch }
    settingsRef.current = merged
    setCloudSaving(true)
    const ok = await saveSettingsToCloud(uid, merged)
    if (ok) setCloudSynced(true)
    setCloudSaving(false)
    return ok
  }, [firebaseUser])

  const updateNested = useCallback((key, patch) => {
    update(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }))
  }, [update])

  const reset = useCallback(() => {
    // Preserve user patterns — reset must never delete them
    const current = settingsRef.current
    const preserved = {
      customPatterns:      current.customPatterns      ?? [],
      deletedPatterns:     current.deletedPatterns     ?? [],
      _customPatternsAt:   current._customPatternsAt   ?? 0,
      _deletedPatternsAt:  current._deletedPatternsAt  ?? 0,
    }
    const next = { ...DEFAULTS, ...preserved }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    settingsRef.current = next
    setSettings(next)
  }, [])

  // Clear all per-timeframe sort overrides (sortBy_15m, sortDir_15m, etc.)
  // so defaultSort/defaultSortDir from Settings take effect again everywhere.
  const clearSortOverrides = useCallback(() => {
    update(prev => {
      const next = { ...prev }
      Object.keys(next).forEach(k => {
        if (k.startsWith('sortBy_') || k.startsWith('sortDir_')) delete next[k]
      })
      return next
    })
  }, [update])

  return { settings, update, updateNested, reset, clearSortOverrides, cloudSynced, cloudSaving, saveNow, saveNowWithPatch, isFirstVisit: isFirstVisit.current }
}
