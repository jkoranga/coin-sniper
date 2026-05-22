// ─── Delta Exchange India Scanner ─────────────────────────────────────────────
// Dedicated scanner for Delta India perpetuals.
// Supports: Scan / Auto / Loop modes, scan-mode pills, dedup, sort, vol filter.

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { fetchDeltaSymbols, fetchDeltaCandles, DELTA_FALLBACK_SYMBOLS as DELTA_FALLBACK_SYMBOLS_IMPORT } from '../utils/deltaScanner.js'
import { compilePattern } from './PatternBuilder.jsx'
import { intervalToMs, sendTelegram, buildTelegramMsg, fmt, timeSince } from '../utils/scanner.js'

const DC  = '#ff6b00'
const DD  = 'rgba(255,107,0,0.12)'
const DB  = 'rgba(255,107,0,0.4)'
const CY  = '#00d4ff'
const CYD = 'rgba(0,212,255,0.12)'
const CYB = 'rgba(0,212,255,0.45)'
const PU  = '#b388ff'
const PUD = 'rgba(179,136,255,0.1)'
const GR  = 'var(--green)'
const GR2 = 'var(--green2)'
const RD  = 'var(--red)'
const RD2 = 'var(--red2)'
const AM  = 'var(--amber)'

const SCAN_MODES = [
  {id:'single', icon:'⚡', label:'Single', col:'var(--amber)',  bd:'var(--amber)',  bg:'rgba(255,180,0,.1)'},
  {id:'all',    icon:'⬡',  label:'All',    col:CY,             bd:CY,              bg:CYD},
  {id:'bull',   icon:'🟢', label:'Bull',   col:GR,             bd:GR2,             bg:'var(--green-dim)'},
  {id:'bear',   icon:'🔴', label:'Bear',   col:RD,             bd:RD2,             bg:'var(--red-dim)'},
  {id:'custom', icon:'⊞',  label:'Custom', col:PU,             bd:'rgba(179,136,255,.5)', bg:PUD},
]

const VOLUME_FILTERS = [
  {id:'all',  label:'All Vol', min:0},
  {id:'500k', label:'>500K',   min:500_000},
  {id:'1m',   label:'>1M',     min:1_000_000},
  {id:'5m',   label:'>5M',     min:5_000_000},
  {id:'10m',  label:'>10M',    min:10_000_000},
]

const DEDUP_OPT = ['1m','3m','5m','15m','30m','1h','4h','1d']

function tvUrl(symbol, tf = '15m') {
  const m = {'1m':'1','3m':'3','5m':'5','15m':'15','30m':'30','1h':'60','4h':'240','1d':'D'}
  const base = symbol.replace('USDT','')
  return `https://www.tradingview.com/chart/?symbol=BYBIT:${base}USDT.P&interval=${m[tf]||'15'}`
}

function TvIcon({ symbol, timeframe, sz = 26 }) {
  return (
    <a href={tvUrl(symbol, timeframe)} target="_blank" rel="noopener noreferrer"
      onClick={e => e.stopPropagation()} title={`Open ${timeframe} on TradingView`}
      style={{
        display:'inline-flex', alignItems:'center', justifyContent:'center',
        width:sz, height:sz, borderRadius:6, flexShrink:0,
        background:'rgba(33,150,243,0.12)', border:'1.5px solid rgba(33,150,243,0.35)',
        color:'#2196f3', textDecoration:'none',
      }}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
      </svg>
    </a>
  )
}

// ── Countdown timer ───────────────────────────────────────────────────────────
function Countdown({ nextAt }) {
  const [sec, setSec] = useState(0)
  useEffect(() => {
    if (!nextAt) return
    const t = setInterval(() => setSec(Math.max(0, Math.ceil((nextAt - Date.now()) / 1000))), 1000)
    return () => clearInterval(t)
  }, [nextAt])
  if (!nextAt || sec <= 0) return null
  const m = Math.floor(sec / 60), s = sec % 60
  return <span style={{fontFamily:'var(--mono)',fontSize:12,color:AM,fontWeight:700}}>⏱ {m>0?`${m}m `:''}{ s}s</span>
}

// ── Alert list row ─────────────────────────────────────────────────────────────
function AlertRow({ a, onDismiss, onTap, resultFilter }) {
  const isBull = a.side === 'bull'
  if (resultFilter === 'bull' && !isBull) return null
  if (resultFilter === 'bear' && isBull) return null
  const col = isBull ? GR : RD, bd = isBull ? 'rgba(0,200,100,0.35)' : 'rgba(255,60,80,0.35)', bg = isBull ? 'rgba(0,230,118,0.05)' : 'rgba(255,60,80,0.05)'
  const base = a.symbol.replace('USDT', '')
  return (
    <div onClick={() => onTap(a)} style={{
      display:'flex', alignItems:'center', gap:9, padding:'10px 11px',
      borderRadius:11, cursor:'pointer', border:`1.5px solid ${bd}`, background:bg,
    }}>
      <span style={{fontSize:17, flexShrink:0}}>{a.scannerIcon}</span>
      <div style={{flex:1, minWidth:0}}>
        <div style={{display:'flex', alignItems:'center', gap:5, flexWrap:'wrap', marginBottom:2}}>
          <span style={{fontWeight:900, color:col, fontSize:13, fontFamily:'var(--mono)'}}>{base}<span style={{fontSize:9,fontWeight:400,color:'var(--text3)'}}>/USDT</span></span>
          <span style={{fontSize:8, fontFamily:'var(--mono)', fontWeight:700, padding:'1px 5px', borderRadius:4, background:DD, color:DC, border:`1px solid ${DB}`}}>DELTA</span>
          <span style={{fontSize:8, fontFamily:'var(--mono)', fontWeight:700, padding:'1px 5px', borderRadius:4, background:`${col}15`, color:col, border:`1px solid ${col}40`}}>{a.timeframe}</span>
          <span style={{fontSize:8, fontFamily:'var(--mono)', fontWeight:800, padding:'2px 6px', borderRadius:4, background:`${col}20`, color:col, border:`1px solid ${col}50`}}>{a.scannerName}</span>
        </div>
        <div style={{fontSize:10, fontFamily:'var(--mono)', color:'var(--text3)'}}>
          {timeSince(a.time)}
          {a.details?.close && <> · <span style={{color:'var(--text2)'}}>${fmt(a.details.close)}</span></>}
          {a.details?.rsi14 != null && <> · <span style={{color:'#ffa726'}}>RSI {a.details.rsi14.toFixed(1)}</span></>}
        </div>
      </div>
      <TvIcon symbol={a.symbol} timeframe={a.timeframe} sz={24}/>
      <button onClick={e=>{e.stopPropagation();onDismiss()}} style={{
        width:22, height:22, borderRadius:5, background:'var(--bg3)', border:'1px solid var(--border)',
        color:'var(--text3)', fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', flexShrink:0,
      }}>×</button>
    </div>
  )
}

// ── Alert card (expanded) ──────────────────────────────────────────────────────
function AlertCard({ a, onDismiss, onTap, resultFilter }) {
  const isBull = a.side === 'bull'
  if (resultFilter === 'bull' && !isBull) return null
  if (resultFilter === 'bear' && isBull) return null
  const col = isBull ? GR : RD, bd = isBull ? 'rgba(0,200,100,0.4)' : 'rgba(255,60,80,0.4)', bg = isBull ? 'rgba(0,230,118,0.07)' : 'rgba(255,60,80,0.07)'
  const base = a.symbol.replace('USDT','')
  return (
    <div onClick={() => onTap(a)} style={{
      borderRadius:13, border:`2px solid ${bd}`, background:bg, padding:'13px',
      cursor:'pointer', position:'relative',
    }}>
      <button onClick={e=>{e.stopPropagation();onDismiss()}} style={{
        position:'absolute', top:8, right:8, width:22, height:22, borderRadius:5,
        background:'rgba(0,0,0,0.3)', border:'1px solid var(--border2)',
        color:'var(--text3)', fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer',
      }}>×</button>
      <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:10}}>
        <span style={{fontSize:22}}>{a.scannerIcon}</span>
        <div>
          <span style={{fontSize:11, fontWeight:800, padding:'2px 9px', borderRadius:16,
            background:`${col}22`, color:col, border:`1.5px solid ${bd}`, fontFamily:'var(--mono)'}}>{a.scannerName}</span>
          <span style={{marginLeft:6, fontSize:9, padding:'2px 6px', borderRadius:5,
            background:isBull?'rgba(0,230,118,0.12)':'rgba(255,60,80,0.12)', color:col, fontWeight:800,
            fontFamily:'var(--mono)'}}>{isBull?'BULL':'BEAR'}</span>
        </div>
      </div>
      <div style={{fontWeight:900, fontSize:20, color:col, fontFamily:'var(--mono)', marginBottom:4, letterSpacing:'-.02em'}}>
        {base}<span style={{fontSize:12, fontWeight:400, color:'var(--text3)'}}>/USDT</span>
        <span style={{fontSize:10, fontWeight:400, color:'var(--text3)', marginLeft:8}}>{a.timeframe} · {timeSince(a.time)}</span>
      </div>
      <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:6, marginBottom:8}}>
        {[
          ['Close', a.details?.close ? `$${fmt(a.details.close)}` : '—'],
          ['EMA 9', a.details?.ema9  ? fmt(a.details.ema9)  : '—'],
          ['EMA 20',a.details?.ema20 ? fmt(a.details.ema20) : '—'],
        ].map(([l,v])=>(
          <div key={l} style={{borderRadius:8, padding:'6px 8px', background:'rgba(0,0,0,0.2)', border:`1px solid ${bd}`}}>
            <div style={{fontSize:9, fontFamily:'var(--mono)', color:'var(--text3)', marginBottom:2, letterSpacing:'.05em'}}>{l}</div>
            <div style={{fontWeight:800, fontSize:13, color:'var(--text)', fontFamily:'var(--mono)'}}>{v}</div>
          </div>
        ))}
      </div>
      {a.details?.rsi14 != null && (
        <div style={{display:'inline-flex', alignItems:'center', gap:5, padding:'4px 9px', borderRadius:6,
          background:'rgba(255,167,38,0.08)', border:'1px solid rgba(255,167,38,0.25)', marginBottom:6}}>
          <span style={{fontSize:9, color:'var(--amber)', fontWeight:700, fontFamily:'var(--mono)'}}>RSI-14</span>
          <span style={{fontSize:11, fontWeight:700, fontFamily:'var(--mono)',
            color:a.details.rsi14 < 30 ? GR : a.details.rsi14 > 70 ? RD : 'var(--text)'}}>
            {a.details.rsi14.toFixed(1)}
          </span>
        </div>
      )}
      <div style={{display:'flex', gap:8, marginTop:6}}>
        <a href={tvUrl(a.symbol, a.timeframe)} target="_blank" rel="noopener noreferrer"
          onClick={e=>e.stopPropagation()} style={{
          display:'inline-flex', alignItems:'center', gap:5,
          padding:'6px 12px', borderRadius:7, fontSize:10, fontFamily:'var(--mono)', fontWeight:700,
          border:'1px solid rgba(33,150,243,0.4)', background:'rgba(33,150,243,0.1)', color:'#2196f3', textDecoration:'none',
        }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
          </svg>
          TradingView
        </a>
      </div>
      <div style={{fontSize:9, color:'var(--text3)', opacity:.5, marginTop:6}}>Tap for details →</div>
    </div>
  )
}

// ── Detail bottom sheet ────────────────────────────────────────────────────────
function DetailSheet({ alert: a, onClose }) {
  useEffect(() => {
    if (!a) return
    const fn = e => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [a, onClose])
  if (!a) return null
  const isBull = a.side === 'bull'
  const col = isBull ? GR : RD, bd = isBull ? 'rgba(0,200,100,0.4)' : 'rgba(255,60,80,0.4)'
  return (
    <>
      <div onClick={onClose} style={{position:'fixed', inset:0, zIndex:499, background:'rgba(0,0,0,0.7)', backdropFilter:'blur(4px)'}}/>
      <div style={{
        position:'fixed', bottom:0, left:0, right:0, zIndex:500,
        background:'var(--bg1)', borderRadius:'20px 20px 0 0',
        border:'1px solid var(--border2)', maxHeight:'82vh', overflow:'auto', paddingBottom:40,
      }}>
        <div style={{width:36, height:4, borderRadius:2, background:'var(--border2)', margin:'12px auto 0'}}/>
        <div style={{padding:'16px'}}>
          <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:14}}>
            <span style={{fontSize:24}}>{a.scannerIcon}</span>
            <div style={{flex:1}}>
              <div style={{fontWeight:800, fontSize:16, color:col}}>{a.scannerName}</div>
              <div style={{fontSize:11, fontFamily:'var(--mono)', color:'var(--text3)', marginTop:2}}>
                {a.symbol} · {a.timeframe} · {timeSince(a.time)}
              </div>
            </div>
            <TvIcon symbol={a.symbol} timeframe={a.timeframe}/>
            <span style={{padding:'3px 8px', borderRadius:6, fontSize:10, fontWeight:800,
              background:isBull?'rgba(0,230,118,0.1)':'rgba(255,60,80,0.1)', color:col,
              border:`1px solid ${col}50`, fontFamily:'var(--mono)'}}>{isBull?'BULL':'BEAR'}</span>
          </div>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:12}}>
            {Object.entries(a.details || {})
              .filter(([k]) => !['time'].includes(k))
              .slice(0, 8)
              .map(([k, v]) => (
              <div key={k} style={{background:'var(--bg2)', borderRadius:9, padding:'10px 12px', border:'1px solid var(--border)'}}>
                <div style={{fontSize:9, fontFamily:'var(--mono)', color:'var(--text3)', marginBottom:3, letterSpacing:'.05em'}}>{k.toUpperCase()}</div>
                <div style={{fontFamily:'var(--mono)', fontWeight:700, fontSize:14, color:'var(--text)'}}>
                  {typeof v === 'number' ? fmt(v) : String(v)}
                </div>
              </div>
            ))}
          </div>
          <button onClick={onClose} style={{
            width:'100%', padding:'12px', borderRadius:10, cursor:'pointer',
            border:'1px solid var(--border2)', background:'var(--bg2)', color:'var(--text3)',
            fontFamily:'var(--mono)', fontWeight:700, fontSize:12,
          }}>Close</button>
        </div>
      </div>
    </>
  )
}

// ── Main DeltaScannerTab ───────────────────────────────────────────────────────
export default function DeltaScannerTab({
  settings, update, saveNowWithPatch, isActive,
  onGoToPatterns, onAlertCount, timeframe: tfProp,
}) {
  // Per-tab settings keys
  const tfKey       = k => `delta_${k}_${tfProp}`
  const scanMode    = settings[tfKey('scanMode')]     ?? 'all'
  const dedupInt    = settings[tfKey('dedupInt')]     ?? '15m'
  const resultFilter= settings[tfKey('resultFilter')] ?? 'all'
  const volumeFilter= settings[tfKey('volumeFilter')] ?? '1m'
  const sortBy      = settings[tfKey('sortBy')]       ?? 'time'
  const sortDir     = settings[tfKey('sortDir')]      ?? 'desc'
  const viewMode    = settings[tfKey('viewMode')]     ?? 'list'
  const setTfSetting = (k, v) => update({ [tfKey(k)]: v })

  // Ephemeral state
  const [timeframe,   setTimeframe]   = useState(tfProp || '15m')
  const [symbols,     setSymbols]     = useState([])
  const [loadingSyms, setLoadingSyms] = useState(false)
  const [symFailed,   setSymFailed]   = useState(false)
  const [symFallback, setSymFallback] = useState(false)
  const [scanning,    setScanning]    = useState(false)
  const [progress,    setProgress]    = useState(0)
  const [progressSym, setProgressSym] = useState('')
  const [alerts,      setAlerts]      = useState([])
  const [errors,      setErrors]      = useState([])
  const [lastScan,    setLastScan]    = useState(null)
  const [autoEnabled, setAutoEnabled] = useState(false)
  const [loopMode,    setLoopMode]    = useState(false)
  const [loopCount,   setLoopCount]   = useState(0)
  const [nextScanAt,  setNextScanAt]  = useState(null)
  const [singleSym,   setSingleSym]   = useState('')
  const [selected,    setSelected]    = useState(null)
  const [noPatWarn,   setNoPatWarn]   = useState(false)

  const abortRef    = useRef(null)
  const loopRef     = useRef(false)
  const scanningRef = useRef(false)
  const seenRef     = useRef({})
  const cacheRef    = useRef({})
  const idRef       = useRef(0)
  const timerRef    = useRef(null)
  const settingsRef = useRef(settings)
  useEffect(() => { settingsRef.current = settings }, [settings])

  // ── Load Delta symbols ───────────────────────────────────────────────────────
  const loadSymbols = useCallback(async () => {
    setLoadingSyms(true); setSymFailed(false); setSymFallback(false)
    try {
      const { symbols: syms, fallback, error } = await fetchDeltaSymbols()
      setSymbols(syms)
      setSymFallback(fallback || false)
      setSymFailed(syms.length === 0)
    } catch {
      setSymFailed(true)
      setSymbols(DELTA_FALLBACK_SYMBOLS_IMPORT)
    } finally {
      setLoadingSyms(false)
    }
  }, [])

  useEffect(() => { loadSymbols() }, [loadSymbols])

  // ── Active patterns ──────────────────────────────────────────────────────────
  const activePatterns = useMemo(() => {
    const modeFilter = scanMode === 'bull' || scanMode === 'bear' ? scanMode : null
    return (settings.customPatterns || [])
      .filter(p =>
        p.enabled && !p.locked &&
        Array.isArray(p.tfs) && p.tfs.includes(timeframe) &&
        p.conditions.some(c => c.enabled) &&
        (!modeFilter || p.side === modeFilter)
      )
      .map(p => ({ id:p.id, name:p.name, side:p.side, icon:p.icon||(p.side==='bull'?'🟢':'🔴'), logic:compilePattern(p) }))
      .filter(p => p.logic !== null)
  }, [settings.customPatterns, timeframe, scanMode])

  // ── Candle cache (60s TTL) ───────────────────────────────────────────────────
  async function fetchCached(symbol, tf, limit) {
    const key = `${symbol}__${tf}__${limit}`
    const now = Date.now()
    const hit = cacheRef.current[key]
    if (hit && now < hit.expiresAt) return hit.candles
    const candles = await fetchDeltaCandles(symbol, tf, limit)
    if (candles) cacheRef.current[key] = { candles, expiresAt: now + 60_000 }
    return candles
  }

  // ── Dedup ────────────────────────────────────────────────────────────────────
  function isDupe(symbol, scannerId) {
    const key = `delta__${symbol}__${scannerId}__${timeframe}`
    const now = Date.now()
    const exp = seenRef.current[key]
    if (exp && now < exp) return true
    seenRef.current[key] = now + intervalToMs(dedupInt)
    return false
  }

  // ── Core scan ────────────────────────────────────────────────────────────────
  const runScan = useCallback(async (symOverride) => {
    if (scanningRef.current) return
    if (activePatterns.length === 0) { setNoPatWarn(true); return }

    const cfg = settingsRef.current
    const currentScanMode = cfg[`delta_scanMode_${timeframe}`] ?? 'all'
    const customPairs = cfg.customPairs || []

    let symList
    if (symOverride) {
      symList = symOverride
    } else if (currentScanMode === 'custom') {
      symList = [...new Set(customPairs)].map(s => ({symbol:s}))
    } else {
      symList = symbols
    }
    if (!symList || symList.length === 0) return

    abortRef.current = new AbortController()
    scanningRef.current = true
    setScanning(true); setProgress(0); setErrors([])

    const CONCURRENCY = 20
    const newAlerts = [], newErrors = []
    let i = 0, done = 0

    async function worker() {
      while (true) {
        if (abortRef.current.signal.aborted) return
        const idx = i++
        if (idx >= symList.length) return
        const sym = (symList[idx]?.symbol || symList[idx])
        setProgressSym(sym)
        try {
          const candles = await fetchCached(sym, timeframe, 60)
          if (!candles || candles.length < 10) { done++; setProgress(Math.round(done/symList.length*100)); continue }
          for (const sc of activePatterns) {
            if (abortRef.current.signal.aborted) continue
            if (isDupe(sym, sc.id)) continue
            const result = sc.logic(candles)
            if (result) {
              const a = {
                id: ++idRef.current, exchange:'delta', symbol:sym, timeframe,
                time: Date.now(), scannerId:sc.id, scannerName:sc.name,
                scannerIcon:sc.icon, side:sc.side, details:result,
              }
              newAlerts.push(a)
              setAlerts(prev => [a, ...prev].slice(0, 300))
            }
          }
        } catch { newErrors.push(sym) }
        done++
        setProgress(Math.round(done / symList.length * 100))
        await new Promise(r => setTimeout(r, 5))
      }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))

    setLastScan(Date.now())
    setProgress(-1); setProgressSym('')
    scanningRef.current = false; setScanning(false)
    if (newErrors.length) setErrors(newErrors)
    onAlertCount?.(newAlerts.length)

    // Telegram
    if (newAlerts.length > 0 && cfg.tgOn && cfg.tgToken && cfg.tgChatId) {
      for (const a of newAlerts.slice(0, 5)) {
        sendTelegram(cfg.tgToken, cfg.tgChatId,
          `🔶 Delta India\n${a.scannerIcon} ${a.scannerName}\n${a.symbol} · ${a.timeframe}`
        ).catch(() => {})
      }
    }

    // Loop continue
    if (loopRef.current) { setLoopCount(c => c + 1); setTimeout(() => runScan(symOverride), 300) }
  }, [activePatterns, symbols, timeframe, dedupInt]) // eslint-disable-line

  // ── Auto scan interval ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!autoEnabled || loopMode) { clearInterval(timerRef.current); setNextScanAt(null); return }
    const ms = intervalToMs(settings.scanInterval || '1m')
    setNextScanAt(Date.now() + ms)
    timerRef.current = setInterval(() => { runScan(); setNextScanAt(Date.now() + ms) }, ms)
    return () => { clearInterval(timerRef.current); setNextScanAt(null) }
  }, [autoEnabled, loopMode, settings.scanInterval]) // eslint-disable-line

  // ── Stop on tab deactivate ───────────────────────────────────────────────────
  useEffect(() => {
    if (!isActive) {
      abortRef.current?.abort(); loopRef.current = false
      scanningRef.current = false; setScanning(false)
    }
  }, [isActive])

  function stopScan() {
    loopRef.current = false; abortRef.current?.abort()
    scanningRef.current = false; setScanning(false)
    setAutoEnabled(false); setLoopMode(false)
    setNextScanAt(null); clearInterval(timerRef.current)
  }

  function toggleLoop(on) {
    setLoopMode(on)
    if (on) { loopRef.current = true; setAutoEnabled(false); setLoopCount(0); runScan() }
    else { loopRef.current = false; abortRef.current?.abort(); scanningRef.current = false; setScanning(false) }
  }

  function toggleAuto() {
    if (autoEnabled) { stopScan() }
    else { setAutoEnabled(true); runScan() }
  }

  function toggleSort(col) {
    if (sortBy === col) setTfSetting('sortDir', sortDir === 'asc' ? 'desc' : 'asc')
    else { setTfSetting('sortBy', col); setTfSetting('sortDir', 'desc') }
  }

  const volMin = VOLUME_FILTERS.find(f => f.id === volumeFilter)?.min ?? 0

  const filteredAlerts = useMemo(() => [...alerts]
    .filter(a => (a.details?.volume ?? 0) >= volMin || volMin === 0)
    .sort((x, y) => {
      let c = 0
      if (sortBy === 'time')   c = x.time - y.time
      if (sortBy === 'symbol') c = x.symbol.localeCompare(y.symbol)
      if (sortBy === 'gain')   c = (parseFloat(x.details?.gainPct) || 0) - (parseFloat(y.details?.gainPct) || 0)
      return sortDir === 'desc' ? -c : c
    })
  , [alerts, sortBy, sortDir, volMin])

  const bull = filteredAlerts.filter(a => a.side === 'bull').length
  const bear = filteredAlerts.filter(a => a.side === 'bear').length
  const displayed = filteredAlerts.filter(a => resultFilter === 'all' ? true : a.side === resultFilter).length

  const tabColor = DC // Delta orange for all TF tabs

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ paddingBottom: 4 }}>
      {/* ── Sticky progress bar ── */}
      {scanning && (
        <div style={{
          position:'sticky', top:0, zIndex:10,
          height:4, background:'var(--bg3)',
          marginLeft:-12, marginRight:-12, marginBottom:8,
        }}>
          <div style={{
            height:'100%',
            width:`${Math.max(2, progress)}%`,
            background: `linear-gradient(90deg, ${DC}, #ffaa44)`,
            boxShadow:`0 0 10px ${DC}cc`,
            transition:'width .25s linear',
            borderRadius:'0 2px 2px 0',
          }}/>
        </div>
      )}

      <DetailSheet alert={selected} onClose={() => setSelected(null)}/>

      {/* No-pattern modal */}
      {noPatWarn && (
        <>
          <div onClick={() => setNoPatWarn(false)} style={{
            position:'fixed', inset:0, zIndex:299, background:'rgba(0,0,0,.65)', backdropFilter:'blur(4px)',
          }}/>
          <div style={{
            position:'fixed', left:'50%', top:'50%', transform:'translate(-50%,-50%)',
            zIndex:300, width:'min(310px,90vw)', borderRadius:18, padding:'24px 20px',
            background:'var(--bg1)', border:`1.5px solid ${DB}`,
            boxShadow:'0 20px 60px rgba(0,0,0,.7)', textAlign:'center',
          }}>
            <div style={{fontSize:38, marginBottom:10}}>🔶</div>
            <div style={{fontWeight:900, fontSize:15, color:DC, marginBottom:6}}>No Patterns for {timeframe}</div>
            <div style={{fontSize:11, fontFamily:'var(--mono)', color:'var(--text3)', lineHeight:1.7, marginBottom:18}}>
              No active patterns set for <b style={{color:DC}}>{timeframe}</b> on Delta India.<br/>
              Build a pattern and enable this TF.
            </div>
            <button onClick={() => { setNoPatWarn(false); onGoToPatterns?.() }} style={{
              width:'100%', padding:'12px', borderRadius:10, cursor:'pointer', marginBottom:8,
              fontFamily:'var(--mono)', fontWeight:800, fontSize:12,
              border:`1.5px solid ${DB}`, background:DD, color:DC,
            }}>🔬 Open Patterns</button>
            <button onClick={() => setNoPatWarn(false)} style={{
              width:'100%', padding:'10px', borderRadius:10, cursor:'pointer',
              fontFamily:'var(--mono)', fontWeight:700, fontSize:11,
              border:'1px solid var(--border)', background:'var(--bg2)', color:'var(--text3)',
            }}>Dismiss</button>
          </div>
        </>
      )}

      {/* ── TF Header ── */}
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14, gap:8}}>
        <div>
          <div style={{display:'flex', alignItems:'center', gap:7}}>
            <div style={{width:8, height:8, borderRadius:'50%', background:DC, boxShadow:`0 0 7px ${DC}`}}/>
            <span style={{fontSize:14, fontWeight:800, letterSpacing:'.04em', color:DC, fontFamily:'var(--mono)'}}>{timeframe.toUpperCase()}</span>
          </div>
          <div style={{fontSize:11, color:'var(--text3)', fontFamily:'var(--mono)', marginTop:3, display:'flex', alignItems:'center', gap:6}}>
            {loadingSyms
              ? <span style={{color:AM}}>⟳ Loading Delta symbols…</span>
              : symFailed
                ? <><span style={{color:RD}}>⚠ Proxy failed · using {symbols.length} fallback syms</span>
                    <button onClick={loadSymbols} style={{fontSize:10, padding:'1px 6px', borderRadius:4,
                      border:`1px solid ${RD2}`, background:'var(--red-dim)', color:RD, cursor:'pointer', fontFamily:'var(--mono)'}}>Retry</button>
                  </>
                : symFallback
                  ? <><span style={{color:AM}}>⚠ {symbols.length} fallback syms (API down)</span>
                      <button onClick={loadSymbols} style={{fontSize:10, padding:'1px 6px', borderRadius:4,
                        border:'1px solid rgba(255,167,38,.5)', background:'rgba(255,167,38,.1)', color:AM, cursor:'pointer', fontFamily:'var(--mono)'}}>Retry</button>
                    </>
                  : <span>{symbols.length} symbols · {activePatterns.length} pattern{activePatterns.length!==1?'s':''}</span>
            }
          </div>
        </div>

        {/* Controls */}
        <div style={{display:'flex', gap:5, alignItems:'center', flexShrink:0, flexWrap:'wrap', justifyContent:'flex-end'}}>
          <Countdown nextAt={nextScanAt}/>

          {scanMode !== 'single' && (
            <button onClick={toggleAuto} disabled={scanning && !autoEnabled && !loopMode} style={{
              display:'flex', alignItems:'center', gap:5,
              padding:'7px 14px', borderRadius:8, cursor:'pointer',
              fontSize:12, fontFamily:'var(--mono)', fontWeight:700,
              border:`2px solid ${autoEnabled&&!loopMode?'var(--green)':scanning?DC+'cc':DC}`,
              background:autoEnabled&&!loopMode?'var(--green-dim)':`${DC}15`,
              color:autoEnabled&&!loopMode?'var(--green)':DC,
              boxShadow:autoEnabled&&!loopMode?'0 0 8px rgba(0,230,118,.3)':scanning?`0 0 10px ${DC}55`:`0 0 6px ${DC}33`,
              minWidth:74, justifyContent:'center',
            }}>
              {scanning
                ? <><span style={{animation:'spin .7s linear infinite', display:'inline-block'}}>⟳</span> {progress}%</>
                : autoEnabled ? <>⏱ Auto</> : <>▶ Scan</>}
            </button>
          )}

          {/* Loop */}
          {scanMode !== 'single' && (
            <button onClick={() => toggleLoop(!loopMode)} style={{
              display:'flex', alignItems:'center', gap:5,
              padding:'7px 14px', borderRadius:8, cursor:'pointer',
              fontSize:12, fontFamily:'var(--mono)', fontWeight:700,
              border:`2px solid ${loopMode?CY:CYB}`,
              background:loopMode?CYD:'rgba(0,212,255,.05)',
              color:loopMode?CY:'rgba(0,212,255,.7)',
              boxShadow:loopMode?`0 0 10px ${CY}55`:'none',
              minWidth:loopMode?68:56, justifyContent:'center',
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                style={{flexShrink:0, animation:loopMode?'spin 1.4s linear infinite':'none'}}>
                <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
              </svg>
              {loopMode ? `#${loopCount}` : 'Loop'}
            </button>
          )}

          {/* Stop */}
          {(scanning || loopMode || autoEnabled) && (
            <button onClick={stopScan} style={{
              padding:'7px 11px', borderRadius:8, fontSize:13, fontWeight:800, cursor:'pointer',
              border:'1.5px solid var(--red2)', background:'var(--red-dim)', color:RD,
              display:'flex', alignItems:'center', justifyContent:'center',
            }}>■</button>
          )}

          {/* Clear */}
          {alerts.length > 0 && (
            <button onClick={() => setAlerts([])} style={{
              fontSize:10, fontFamily:'var(--mono)', color:'var(--text3)',
              padding:'5px 9px', border:'1px solid var(--border)', borderRadius:8,
              cursor:'pointer', background:'var(--bg2)',
            }}>✕ {alerts.length}</button>
          )}
        </div>
      </div>

      {/* ── Scan mode pills ── */}
      <div style={{
        display:'flex', gap:4, flexWrap:'nowrap', marginBottom:10,
        overflowX:'auto', WebkitOverflowScrolling:'touch', scrollbarWidth:'none',
        marginLeft:-12, marginRight:-12, paddingLeft:12, paddingRight:12, paddingBottom:2,
      }}>
        {SCAN_MODES.map(m => (
          <button key={m.id} onClick={() => setTfSetting('scanMode', m.id)} style={{
            display:'flex', alignItems:'center', gap:4, padding:'5px 11px', borderRadius:20, cursor:'pointer',
            border:`1.5px solid ${scanMode===m.id?m.bd:'var(--border)'}`,
            background:scanMode===m.id?m.bg:'var(--bg2)',
            color:scanMode===m.id?m.col:'var(--text3)',
            fontWeight:scanMode===m.id?700:400, fontSize:11, fontFamily:'var(--mono)',
            flexShrink:0, whiteSpace:'nowrap', transition:'all .15s',
          }}>
            <span style={{fontSize:12}}>{m.icon}</span> {m.label}
          </button>
        ))}
      </div>

      {/* Single sym input */}
      {scanMode === 'single' && (
        <div style={{display:'flex', gap:8, marginBottom:10}}>
          <input
            className="text-input"
            placeholder="e.g. BTCUSDT…"
            value={singleSym}
            onChange={e => setSingleSym(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && singleSym.trim() && runScan([{symbol:singleSym.trim()}])}
            style={{flex:1, fontFamily:'var(--mono)', fontWeight:700}}
          />
          <button
            onClick={() => runScan([{symbol:singleSym.trim()}])}
            disabled={!singleSym.trim() || scanning}
            style={{
              flexShrink:0, padding:'0 16px', borderRadius:8, cursor:'pointer',
              border:`1.5px solid ${DB}`, background:DD, color:DC,
              fontFamily:'var(--mono)', fontWeight:800, fontSize:13,
            }}
          >{scanning ? '⟳' : '▶'}</button>
        </div>
      )}

      {/* ── Dedup row ── */}
      <div style={{
        display:'flex', alignItems:'center', gap:5, marginBottom:10,
        overflowX:'auto', paddingBottom:2, scrollbarWidth:'none',
      }}>
        <span style={{fontSize:9, color:'var(--text3)', fontFamily:'var(--mono)', flexShrink:0, whiteSpace:'nowrap'}}>Dedup:</span>
        {DEDUP_OPT.map(d => (
          <button key={d} onClick={() => { seenRef.current = {}; setTfSetting('dedupInt', d) }} style={{
            padding:'3px 9px', borderRadius:6, cursor:'pointer', fontSize:9, fontWeight:700,
            fontFamily:'var(--mono)', flexShrink:0, whiteSpace:'nowrap',
            border:`1px solid ${dedupInt===d?DB:'var(--border)'}`,
            background:dedupInt===d?DD:'var(--bg2)',
            color:dedupInt===d?DC:'var(--text3)',
          }}>{d}</button>
        ))}
      </div>

      {errors.length > 0 && (
        <div style={{
          marginBottom:8, padding:'6px 10px', borderRadius:8, fontSize:10,
          fontFamily:'var(--mono)', color:RD, background:'var(--red-dim)',
          border:'1px solid var(--red2)', display:'flex', justifyContent:'space-between',
        }}>
          <span>⚠ {errors.slice(0,4).join(', ')}{errors.length>4?` +${errors.length-4} more`:''}</span>
          <span onClick={() => setErrors([])} style={{cursor:'pointer', textDecoration:'underline', flexShrink:0, marginLeft:8}}>dismiss</span>
        </div>
      )}

      {/* ── Results header — only render after first scan ── */}
      {(alerts.length > 0 || lastScan) && (
      <div style={{background:'var(--bg1)', border:`1.5px solid ${DC}33`, borderRadius:12, padding:'12px 14px', marginBottom:8}}>
        {/* Count + view toggle */}
        <div style={{display:'flex', alignItems:'center', gap:5, marginBottom:8, flexWrap:'wrap'}}>
          {scanning && (
            <span style={{display:'flex', alignItems:'center', gap:4, fontFamily:'var(--mono)', fontSize:11,
              color:AM, background:'rgba(255,167,38,.1)', border:`1px solid ${AM}`,
              borderRadius:8, padding:'3px 10px', flexShrink:0}}>
              <span style={{display:'inline-block', animation:'spin 1s linear infinite'}}>⟳</span> {progress}%
            </span>
          )}
          {displayed > 0 && <>
            <span style={{fontFamily:'var(--mono)', fontSize:17, fontWeight:800, color:'var(--text)', flexShrink:0}}>{displayed}</span>
            <span style={{fontFamily:'var(--mono)', fontSize:12, color:'var(--text3)', flexShrink:0}}>results</span>
            {bull > 0 && <span style={{padding:'3px 9px', borderRadius:8, fontSize:11, fontWeight:700,
              background:'var(--green-dim)', color:GR, border:`1px solid ${GR2}`, fontFamily:'var(--mono)', flexShrink:0}}>🟢 {bull}</span>}
            {bear > 0 && <span style={{padding:'3px 9px', borderRadius:8, fontSize:11, fontWeight:700,
              background:'var(--red-dim)', color:RD, border:`1px solid ${RD2}`, fontFamily:'var(--mono)', flexShrink:0}}>🔴 {bear}</span>}
          </>}
          {lastScan && !scanning && displayed === 0 && (
            <span style={{fontFamily:'var(--mono)', fontSize:11, color:'var(--text3)'}}>No signals · {activePatterns.length} patterns scanned</span>
          )}
          <div style={{display:'flex', gap:3, marginLeft:'auto', flexShrink:0}}>
            {['list','cards'].map(v => (
              <button key={v} onClick={() => setTfSetting('viewMode', v)} style={{
                padding:'5px 9px', borderRadius:7, cursor:'pointer', fontSize:13,
                border:`1px solid ${viewMode===v?DC:'var(--border)'}`,
                background:viewMode===v?DD:'var(--bg2)',
                color:viewMode===v?DC:'var(--text3)',
              }}>{v === 'list' ? '≡' : '⊞'}</button>
            ))}
          </div>
        </div>

        {/* Filter + sort row */}
        <div style={{
          display:'flex', alignItems:'center', gap:4, overflowX:'auto', flexWrap:'nowrap',
          paddingBottom:2, WebkitOverflowScrolling:'touch', scrollbarWidth:'none',
        }}>
          {[['all','Signal',CY,'rgba(0,212,255,.1)'],['bull','🟢 Bull',GR,'var(--green-dim)'],['bear','🔴 Bear',RD,'var(--red-dim)']].map(([id,lbl,col,bg])=>(
            <button key={id} onClick={() => setTfSetting('resultFilter', id)} style={{
              padding:'4px 10px', borderRadius:7, cursor:'pointer', fontSize:10,
              fontFamily:'var(--mono)', flexShrink:0, whiteSpace:'nowrap',
              fontWeight:resultFilter===id?700:400,
              border:`1px solid ${resultFilter===id?col:'var(--border)'}`,
              background:resultFilter===id?bg:'var(--bg2)',
              color:resultFilter===id?col:'var(--text3)',
            }}>{lbl}</button>
          ))}

          <div style={{width:1, height:16, background:'var(--border)', flexShrink:0, margin:'0 2px'}}/>

          {VOLUME_FILTERS.map(f => (
            <button key={f.id} onClick={() => setTfSetting('volumeFilter', f.id)} style={{
              padding:'4px 9px', borderRadius:7, cursor:'pointer', fontSize:10,
              fontFamily:'var(--mono)', flexShrink:0, whiteSpace:'nowrap',
              fontWeight:volumeFilter===f.id?700:400,
              border:`1px solid ${volumeFilter===f.id?PU:'var(--border)'}`,
              background:volumeFilter===f.id?PUD:'var(--bg2)',
              color:volumeFilter===f.id?PU:'var(--text3)',
            }}>{f.label}</button>
          ))}

          <div style={{width:1, height:16, background:'var(--border)', flexShrink:0, margin:'0 2px'}}/>

          <span style={{fontSize:10, color:'var(--text3)', flexShrink:0, fontFamily:'var(--mono)'}}>↕</span>
          {[['time','Time'],['symbol','Sym'],['gain','Gain']].map(([col,lbl])=>(
            <button key={col} onClick={() => toggleSort(col)} style={{
              padding:'4px 9px', borderRadius:7, cursor:'pointer', fontSize:10,
              fontFamily:'var(--mono)', flexShrink:0, whiteSpace:'nowrap',
              fontWeight:sortBy===col?700:400,
              border:`1px solid ${sortBy===col?DC:'var(--border)'}`,
              background:sortBy===col?DD:'var(--bg2)',
              color:sortBy===col?DC:'var(--text3)',
            }}>{lbl}{sortBy===col?(sortDir==='desc'?' ↓':' ↑'):''}</button>
          ))}
        </div>
      </div>
      )} {/* end (alerts.length > 0 || lastScan) */}

      {/* ── Empty state — only before first scan or after scan with no results ── */}
      {!scanning && displayed === 0 && (
        <div style={{textAlign:'center', padding:'40px 16px'}}>
          <div style={{fontSize:36, marginBottom:10, color:DC}}>
            {scanMode==='single'?'⚡':loopMode?'🔁':autoEnabled?'⏳':'🔶'}
          </div>
          <div style={{fontSize:12, fontFamily:'var(--mono)', color:'var(--text3)', lineHeight:1.7}}>
            {scanMode==='single'?'Enter a symbol and tap Scan'
              :loopMode?`Loop #${loopCount} — scanning continuously`
              :autoEnabled?'Auto-scan armed · waiting for next cycle…'
              :lastScan?'Scan complete — no signals matched'
              :`Tap ▶ Scan to run patterns on ${symbols.length} symbols`}
          </div>
          <div style={{fontSize:10, color:'var(--text3)', marginTop:6, fontFamily:'var(--mono)'}}>
            {activePatterns.length} pattern{activePatterns.length!==1?'s':''} · {symbols.length} symbols · {timeframe}
          </div>
        </div>
      )}

      {/* ── Scanning indicator (shown while scan runs, no results yet) ── */}
      {scanning && displayed === 0 && (
        <div style={{textAlign:'center', padding:'32px 16px'}}>
          <div style={{fontSize:32, marginBottom:8, color:DC, animation:'spin 1.5s linear infinite', display:'inline-block'}}>⟳</div>
          <div style={{fontSize:12, fontFamily:'var(--mono)', color:AM, marginBottom:4}}>
            Scanning {progressSym}… {progress}%
          </div>
          <div style={{fontSize:10, color:'var(--text3)', fontFamily:'var(--mono)'}}>
            {activePatterns.length} pattern{activePatterns.length!==1?'s':''} · {symbols.length} symbols · {timeframe}
          </div>
        </div>
      )}

      {/* ── Alert list ── */}
      {lastScan && displayed === 0 && alerts.length > 0 && (
        <div style={{textAlign:'center', padding:'8px', fontSize:10, fontFamily:'var(--mono)', color:'var(--text3)'}}>
          All results filtered out — try relaxing the filter
        </div>
      )}

      <div style={{display:'flex', flexDirection:'column', gap:viewMode==='cards'?10:5}}>
        {viewMode === 'list'
          ? filteredAlerts.map(a => <AlertRow key={a.id} a={a} resultFilter={resultFilter}
              onDismiss={() => setAlerts(p => p.filter(x => x.id !== a.id))} onTap={setSelected}/>)
          : filteredAlerts.map(a => <AlertCard key={a.id} a={a} resultFilter={resultFilter}
              onDismiss={() => setAlerts(p => p.filter(x => x.id !== a.id))} onTap={setSelected}/>)
        }
      </div>
    </div>
  )
}
