import { useState, useEffect, useCallback, useRef } from 'react'
import { 
  onAuthChanged, 
  loginWithGoogle, 
  loginWithEmail, 
  signUpWithEmail, 
  logout,
  saveSettingsToCloud,
  loadSettingsFromCloud,
  saveScanSettings,
  subscribeScanSettings
} from './firebase.js'
import { 
  scanForexPairs, 
  getAvailablePairs,
  PATTERN_TYPES 
} from './utils/forexScanner.js'
import { sendTelegramAlert, sendEmailAlert } from './utils/alerts.js'

const TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1D', '1W']

const DEFAULT_SETTINGS = {
  // Scan settings
  timeframe: '1h',
  scanInterval: 60,
  symbolSet: 'major',
  customPairs: [],
  autoScan: false,
  
  // Pattern settings
  patternsEnabled: {
    harmonic: true,
    supportResistance: true,
    divergence: true,
    breakout: true
  },
  
  // Provider settings
  dataProvider: 'oanda',
  
  // Alert settings
  soundEnabled: true,
  telegramEnabled: false,
  telegramBotToken: '',
  telegramChatId: '',
  emailEnabled: false,
  emailAddress: '',
  
  // Appearance
  darkMode: true,
  compactView: false
}

export function useSettings() {
  const [user, setUser] = useState(null)
  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem('forex-scanner-settings')
    return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS
  })
  const [scanning, setScanning] = useState(false)
  const [alerts, setAlerts] = useState(() => {
    const saved = localStorage.getItem('forex-scanner-alerts')
    return saved ? JSON.parse(saved) : []
  })
  const [pairs, setPairs] = useState([])
  
  const scanAbortRef = useRef(null)
  const settingsRef = useRef(settings)
  
  settingsRef.current = settings

  // Auth
  useEffect(() => {
    return onAuthChanged((u) => {
      setUser(u)
      if (u) {
        loadSettingsFromCloud(u.uid).then((cloud) => {
          if (cloud) {
            const merged = { ...settingsRef.current, ...cloud }
            setSettings(merged)
            localStorage.setItem('forex-scanner-settings', JSON.stringify(merged))
          }
        })
      }
    })
  }, [])

  // Real-time scan settings sync
  useEffect(() => {
    if (!user) return
    return subscribeScanSettings(user.uid, (data) => {
      const merged = { ...settingsRef.current, ...data }
      setSettings(merged)
      localStorage.setItem('forex-scanner-settings', JSON.stringify(merged))
    })
  }, [user])

  // Persist alerts
  useEffect(() => {
    localStorage.setItem('forex-scanner-alerts', JSON.stringify(alerts.slice(0, 100)))
  }, [alerts])

  // Load pairs
  useEffect(() => {
    getAvailablePairs(settings.symbolSet).then(setPairs)
  }, [settings.symbolSet])

  const updateSettings = useCallback((updates) => {
    setSettings((prev) => {
      const next = { ...prev, ...updates }
      localStorage.setItem('forex-scanner-settings', JSON.stringify(next))
      if (user) {
        const scanUpdates = {}
        Object.keys(updates).forEach((k) => {
          if (['timeframe', 'scanInterval', 'symbolSet', 'autoScan', 'patternsEnabled'].includes(k)) {
            scanUpdates[k] = updates[k]
          }
        })
        if (Object.keys(scanUpdates).length > 0) {
          saveScanSettings(user.uid, next)
        }
        saveSettingsToCloud(user.uid, next)
      }
      return next
    })
  }, [user])

  const clearAlerts = useCallback(() => setAlerts([]), [])

  const removeAlert = useCallback((id) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id))
  }, [])

  const performScan = useCallback(async () => {
    if (scanning) return
    setScanning(true)
    
    const abortCtrl = new AbortController()
    scanAbortRef.current = abortCtrl
    
    try {
      const scanPairs = settings.symbolSet === 'custom' 
        ? settings.customPairs 
        : pairs
      
      if (scanPairs.length === 0) {
        setScanning(false)
        return
      }

      const results = await scanForexPairs(
        scanPairs,
        settings.timeframe,
        settings.dataProvider,
        {
          patternsEnabled: settings.patternsEnabled,
          signal: abortCtrl.signal
        }
      )

      if (!abortCtrl.signal.aborted && results.length > 0) {
        const newAlerts = results.map((r) => ({
          id: `${r.symbol}-${r.timeframe}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          symbol: r.symbol,
          timeframe: r.timeframe,
          pattern: r.pattern,
          patternType: r.patternType,
          side: r.side,
          price: r.price,
          change: r.change,
          timestamp: Date.now(),
          confidence: r.confidence,
          details: r.details
        }))

        setAlerts((prev) => [...newAlerts, ...prev].slice(0, 100))

        // Send notifications
        if (settings.telegramEnabled && settings.telegramBotToken) {
          newAlerts.forEach((alert) => 
            sendTelegramAlert(alert, settings.telegramBotToken, settings.telegramChatId)
          )
        }

        if (settings.emailEnabled) {
          newAlerts.forEach((alert) => 
            sendEmailAlert(alert, settings.emailAddress)
          )
        }

        // Play sound
        if (settings.soundEnabled) {
          const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaOz09ZU~1')
          audio.play().catch(() => {})
        }
      }
    } catch (e) {
      console.error('Scan error:', e)
    } finally {
      setScanning(false)
      scanAbortRef.current = null
    }
  }, [scanning, settings, pairs])

  const stopScan = useCallback(() => {
    scanAbortRef.current?.abort()
  }, [])

  // Auto-scan
  useEffect(() => {
    if (!settings.autoScan) return
    
    const interval = setInterval(() => {
      performScan()
    }, settings.scanInterval * 1000)
    
    return () => clearInterval(interval)
  }, [settings.autoScan, settings.scanInterval, performScan])

  return {
    user,
    settings,
    scanning,
    alerts,
    pairs,
    TIMEFRAMES,
    PATTERN_TYPES,
    updateSettings,
    performScan,
    stopScan,
    clearAlerts,
    removeAlert,
    loginWithGoogle,
    loginWithEmail,
    signUpWithEmail,
    logout
  }
}
