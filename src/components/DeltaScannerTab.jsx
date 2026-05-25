// ─── Delta Exchange India Scanner ─────────────────────────────────────────────
// Dedicated scanner for Delta India perpetuals.
// Supports: Scan / Auto / Loop modes, scan-mode pills, dedup, sort, vol filter.

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { fetchDeltaSymbols, fetchDeltaCandles, DELTA_FALLBACK_SYMBOLS as DELTA_FALLBACK_SYMBOLS_IMPORT } from '../utils/deltaScanner.js'
import { compilePattern } from './PatternBuilder.jsx'
import { intervalToMs, sendTelegram, buildTelegramMsg, fmt, timeSince, fmtVol } from '../utils/scanner.js'

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

// ── Mini candle chart ─────────────────────────────────────────────────────────
function MiniCandleChart({ candles }) {
  if (!candles || candles.length < 2) return null
  const W = 320, H = 90, PAD = 6
  const minP = Math.min(...candles.map(c => c.low))
  const maxP = Math.max(...candles.map(c => c.high))
  const rng  = maxP - minP || 1
  const toY  = p => PAD + (1 - (p - minP) / rng) * (H - PAD * 2)
  const cw   = Math.floor((W - PAD * 2) / candles.length)
  const bw   = Math.max(2, cw - 3)
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display:'block', borderRadius:8, background:'rgba(0,0,0,0.25)' }}>
      {candles.map((c, i) => {
        const bull = c.close >= c.open
        const col  = bull ? '#00e676' : '#ff4757'
        const x    = PAD + i * cw + (cw - bw) / 2
        const bTop = toY(Math.max(c.open, c.close))
        const bBot = toY(Math.min(c.open, c.close))
        const bH   = Math.max(1, bBot - bTop)
        const cx   = x + bw / 2
        return (
          <g key={i}>
            <line x1={cx} y1={toY(c.high)} x2={cx} y2={toY(c.low)} stroke={col} strokeWidth={1} opacity={0.65}/>
            <rect x={x} y={bTop} width={bw} height={bH} fill={col} rx={1}/>
          </g>
        )
      })}
      {candles[0]?.ema20 && (
        <polyline
          points={candles.map((c,i) => `${PAD+i*cw+cw/2},${toY(c.ema20)}`).join(' ')}
          fill="none" stroke="#ff6b00" strokeWidth={1.5} opacity={0.85} strokeLinejoin="round"
        />
      )}
    </svg>
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
  const col = isBull ? GR : RD
  const bd  = isBull ? 'rgba(0,200,100,0.4)' : 'rgba(255,60,80,0.4)'
  const d   = a.details || {}
  const entry  = d.lowestOpen  ?? d.entry ?? null
  const close  = d.highestClose ?? d.close ?? null
  const gainPct = parseFloat(d.gainPct)
  const gainStr = d.gainPct != null ? `${gainPct >= 0 ? '+' : ''}${d.gainPct}%` : null

  const StatBox = ({ label, value, valColor }) => (
    <div style={{ background:'var(--bg2)', borderRadius:10, padding:'10px 14px', border:'1px solid var(--border)' }}>
      <div style={{ fontSize:9, fontFamily:'var(--mono)', color:'var(--text3)', marginBottom:4, letterSpacing:'.08em' }}>{label}</div>
      <div style={{ fontFamily:'var(--mono)', fontWeight:800, fontSize:17, color: valColor || 'var(--text)', letterSpacing:'-.01em' }}>
        {value ?? '—'}
      </div>
    </div>
  )

  return (
    <>
      <div onClick={onClose} style={{position:'fixed', inset:0, zIndex:499, background:'rgba(0,0,0,0.72)', backdropFilter:'blur(5px)'}}/>
      <div style={{
        position:'fixed', bottom:0, left:0, right:0, zIndex:500,
        background:'var(--bg1)', borderRadius:'22px 22px 0 0',
        border:`1px solid ${bd}`, maxHeight:'88vh', overflow:'auto', paddingBottom:44,
      }}>
        <div style={{width:38, height:4, borderRadius:2, background:'var(--border2)', margin:'12px auto 0'}}/>
        <div style={{padding:'14px 16px 0'}}>

          {/* Header */}
          <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:14}}>
            <span style={{fontSize:26, flexShrink:0}}>{a.scannerIcon}</span>
            <div style={{flex:1, minWidth:0}}>
              <div style={{fontWeight:900, fontSize:17, color:col, lineHeight:1.15}}>{a.scannerName}</div>
              <div style={{fontSize:11, fontFamily:'var(--mono)', color:'var(--text3)', marginTop:3}}>
                {a.symbol} · {a.timeframe} · {timeSince(a.time)}
              </div>
            </div>
            <TvIcon symbol={a.symbol} timeframe={a.timeframe} sz={32}/>
            <span style={{
              padding:'4px 10px', borderRadius:7, fontSize:11, fontWeight:800,
              background:isBull?'rgba(0,230,118,0.12)':'rgba(255,60,80,0.12)',
              color:col, border:`1.5px solid ${col}55`, fontFamily:'var(--mono)',
            }}>{isBull?'BULL':'BEAR'}</span>
          </div>

          {/* Candle chart */}
          {d.run && d.run.length >= 2 && (
            <div style={{marginBottom:12}}>
              <div style={{fontSize:9, fontFamily:'var(--mono)', color:'var(--text3)', letterSpacing:'.1em', marginBottom:6}}>CANDLE CHART</div>
              <MiniCandleChart candles={d.run}/>
            </div>
          )}

          {/* Stat grid */}
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:12}}>
            <StatBox label="CANDLES" value={d.candleCount ?? '—'}/>
            <StatBox label="GAIN" value={gainStr} valColor={gainPct >= 0 ? GR : RD}/>
            {entry != null && <StatBox label="ENTRY" value={fmt(entry)}/>}
            {close != null && <StatBox label="CLOSE" value={fmt(close)}/>}
            {a.volume > 0 && <StatBox label="24H VOL" value={fmtVol(a.volume)}/>}
            {d.accuracy && (
              <StatBox
                label="ACCURACY"
                value={`${d.accuracy.pct}%  (${d.accuracy.wins}/${d.accuracy.signals})`}
                valColor={d.accuracy.pct >= 60 ? GR : d.accuracy.pct >= 40 ? AM : RD}
              />
            )}
          </div>

          {/* Matched conditions */}
          {Array.isArray(d.conds) && d.conds.length > 0 && (
            <div style={{marginBottom:12}}>
              <div style={{fontSize:9, fontFamily:'var(--mono)', color:'var(--text3)', letterSpacing:'.1em', marginBottom:8}}>CONDITIONS</div>
              <div style={{background:'var(--bg2)', borderRadius:10, border:'1px solid var(--border)', overflow:'hidden'}}>
                {d.conds.map((c, i) => (
                  <div key={i} style={{
                    display:'flex', alignItems:'flex-start', gap:8, padding:'9px 12px',
                    borderBottom: i < d.conds.length-1 ? '1px solid var(--border)' : 'none',
                  }}>
                    <span style={{color:GR, fontWeight:800, fontSize:14, flexShrink:0, marginTop:1}}>✓</span>
                    <span style={{fontSize:12, fontFamily:'var(--mono)', color:'var(--text2)', lineHeight:1.5}}>
                      {String(c).replace(/^✓\s*/,'')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button onClick={onClose} style={{
            width:'100%', padding:'14px', borderRadius:12, cursor:'pointer',
            border:`1px solid ${bd}`, background:`${col}10`,
            color:col, fontFamily:'var(--mono)', fontWeight:800, fontSize:14,
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
  triggerAutoScan,
}) {
  // Per-tab settings keys
  const tfKey       = k => `delta_${k}_${tfProp}`
  const scanMode    = settings[tfKey('scanMode')]     ?? 'all'
  const dedupInt    = settings[tfKey('dedupInt')]     ?? '3m'
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
        const symObj = symList[idx]
        const sym = symObj?.symbol || symObj
        const symVol = parseFloat(symObj?.volume ?? symObj?.turnover24h ?? 0)
        setProgressSym(sym)
        try {
          const candles = await fetchCached(sym, timeframe, 60)
          if (!candles || candles.length < 10) { done++; setProgress(Math.round(done/symList.length*100)); continue }
          for (const sc of activePatterns) {
            if (abortRef.current.signal.aborted) continue
            if (isDupe(sym, sc.id)) continue
            // ── Major TF Filter gate ──────────────────────────────────────────
            const rawPat = (cfg.patterns || []).find(p => p.id === sc.id)
            if (rawPat?.htfEnabled) {
              try {
                const htfCandles = await fetchCached(sym, rawPat.htfTf || '1h', 120)
                if (!htfCandles || htfCandles.length < 5) continue
                const htfLast = htfCandles[htfCandles.length - 1]
                const e1 = htfLast[rawPat.htfEma1 || 'ema5']
                const e2 = htfLast[rawPat.htfEma2 || 'ema10']
                if (e1 == null || e2 == null) continue
                const op = rawPat.htfOp || '>'
                const pass = op === '>' ? e1 > e2 : op === '>=' ? e1 >= e2 : op === '<' ? e1 < e2 : e1 <= e2
                if (!pass) continue
              } catch { continue }
            }
            const result = sc.logic(candles)
            if (result) {
              const a = {
                id: ++idRef.current, exchange:'delta', symbol:sym, timeframe,
                time: Date.now(), scannerId:sc.id, scannerName:sc.name,
                scannerIcon:sc.icon, side:sc.side, details:result,
                volume: symVol,
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
          `🔶 ${a.scannerIcon} ${a.scannerName}\n${a.symbol} · ${a.timeframe}`
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

  // ── Auto-start when tab first tapped (triggerAutoScan flips true) ────────────
  const prevTriggerRef = useRef(false)
  useEffect(() => {
    if (triggerAutoScan && !prevTriggerRef.current && !scanningRef.current) {
      // Small delay so symbols have time to load first
      const t = setTimeout(() => {
        if (!scanningRef.current) {
          setAutoEnabled(true)
          runScan()
        }
      }, 300)
      return () => clearTimeout(t)
    }
    prevTriggerRef.current = triggerAutoScan
  }, [triggerAutoScan]) // eslint-disable-line

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
    .filter(a => volMin === 0 || (a.volume ?? 0) >= volMin)
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
              No active patterns set for <b style={{color:DC}}>{timeframe}</b>.<br/>
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
      <div style={{
        display:'flex', alignItems:'center', justifyContent:'space-between', gap:8,
        marginBottom:14, paddingBottom:10, position:'relative',
        borderBottom: scanning
          ? 'none'
          : '1px solid var(--border)',
      }}>
        {/* Progress bar as bottom border */}
        {scanning && (
          <div style={{
            position:'absolute', bottom:0, left:0, right:0,
            height:3, background:'var(--bg3)', borderRadius:2, overflow:'hidden',
          }}>
            <div style={{
              position:'absolute', top:0, left:0, height:'100%',
              width:`${Math.max(2, progress)}%`,
              background:`linear-gradient(90deg, ${DC}, #ffaa44)`,
              boxShadow:`0 0 8px ${DC}bb`,
              transition:'width .25s linear',
              borderRadius:2,
            }}/>
          </div>
        )}
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
                  : scanMode === 'custom'
                    ? <span><span style={{color:PU, fontWeight:700}}>{(settings.customPairs||[]).length} symbols</span> · {activePatterns.length} pattern{activePatterns.length!==1?'s':''} · {timeframe.toUpperCase()}</span>
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

        </div>
      </div>

      {/* ── Scan mode pills ── */}
      <div style={{
        display:'flex', gap:4, flexWrap:'nowrap', marginBottom:10,
        overflowX:'auto', WebkitOverflowScrolling:'touch', scrollbarWidth:'none',
        marginLeft:-12, marginRight:-12, paddingLeft:12, paddingRight:12, paddingBottom:2,
      }}>
        {SCAN_MODES.map(m => {
          const isCustom = m.id === 'custom'
          const customCount = isCustom ? (settings.customPairs || []).length : 0
          return (
            <button key={m.id} onClick={() => {
              setTfSetting('scanMode', m.id)
              // If switching to custom mode, immediately load those pairs
              if (isCustom) {
                const pairs = (settingsRef.current.customPairs || [])
                if (pairs.length === 0) {
                  // Will show warning inline below
                } // scan runs via ▶ Scan button as normal
              }
            }} style={{
              display:'flex', alignItems:'center', gap:4, padding:'5px 11px', borderRadius:20, cursor:'pointer',
              border:`1.5px solid ${scanMode===m.id?m.bd:'var(--border)'}`,
              background:scanMode===m.id?m.bg:'var(--bg2)',
              color:scanMode===m.id?m.col:'var(--text3)',
              fontWeight:scanMode===m.id?700:400, fontSize:11, fontFamily:'var(--mono)',
              flexShrink:0, whiteSpace:'nowrap', transition:'all .15s',
            }}>
              <span style={{fontSize:12}}>{m.icon}</span> {m.label}
              {isCustom && customCount > 0 && (
                <span style={{
                  fontSize:9, fontWeight:800, padding:'1px 5px', borderRadius:8,
                  background: scanMode==='custom' ? 'rgba(179,136,255,0.25)' : 'var(--bg3)',
                  color: scanMode==='custom' ? PU : 'var(--text3)',
                  border:`1px solid ${scanMode==='custom'?'rgba(179,136,255,0.5)':'var(--border)'}`,
                  marginLeft:1,
                }}>{customCount}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Custom mode — compact info bar, no symbol chips */}
      {scanMode === 'custom' && (() => {
        const pairs = settings.customPairs || []
        if (pairs.length === 0) return (
          <div style={{
            marginBottom:10, padding:'10px 14px', borderRadius:10,
            background:'rgba(179,136,255,0.07)', border:'1.5px solid rgba(179,136,255,0.4)',
            display:'flex', alignItems:'center', gap:10,
          }}>
            <span style={{fontSize:18, flexShrink:0}}>⊞</span>
            <div style={{flex:1}}>
              <div style={{fontSize:12, fontWeight:700, color:PU, marginBottom:2}}>No Custom Pairs</div>
              <div style={{fontSize:10, fontFamily:'var(--mono)', color:'var(--text3)', lineHeight:1.5}}>
                Go to Settings → Custom Pairs to add up to 30 symbols.
              </div>
            </div>
          </div>
        )
        return (
          <div style={{
            marginBottom:10, padding:'8px 12px', borderRadius:10,
            background:'rgba(179,136,255,0.07)', border:'1.5px solid rgba(179,136,255,0.35)',
            display:'flex', alignItems:'center', gap:10,
          }}>
            <span style={{fontSize:16, flexShrink:0}}>⊞</span>
            <div style={{flex:1, fontFamily:'var(--mono)', fontSize:11, color:'var(--text3)', lineHeight:1.6}}>
              <span style={{color:PU, fontWeight:800}}>{pairs.length} symbols</span>
              {' · '}<span style={{color:DC, fontWeight:700}}>{activePatterns.length} pattern{activePatterns.length!==1?'s':''}</span>
              {' · '}<span style={{color:'var(--text2)', fontWeight:700}}>{timeframe.toUpperCase()}</span>
              <span style={{fontSize:10, color:'var(--text3)', marginLeft:6}}>· custom scan only</span>
            </div>
          </div>
        )
      })()}

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

      {/* ── Dedup (hidden inline — default 3m, accessible via settings) ── */}

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

      {/* ── Sort / Filter bar — always visible above results ── */}
      <div style={{
        display:'flex', alignItems:'center', gap:4, overflowX:'auto', flexWrap:'nowrap',
        marginBottom:8, paddingBottom:2,
        WebkitOverflowScrolling:'touch', scrollbarWidth:'none',
        marginLeft:-12, marginRight:-12, paddingLeft:12, paddingRight:12,
      }}>
        {/* Result filter */}
        {[['all','All',CY,'rgba(0,212,255,.1)'],['bull','🟢',GR,'var(--green-dim)'],['bear','🔴',RD,'var(--red-dim)']].map(([id,lbl,col,bg])=>(
          <button key={id} onClick={() => setTfSetting('resultFilter', id)} style={{
            padding:'5px 10px', borderRadius:7, cursor:'pointer', fontSize:10,
            fontFamily:'var(--mono)', flexShrink:0, whiteSpace:'nowrap',
            fontWeight:resultFilter===id?800:400,
            border:`1px solid ${resultFilter===id?col:'var(--border)'}`,
            background:resultFilter===id?bg:'var(--bg2)',
            color:resultFilter===id?col:'var(--text3)',
          }}>{lbl}</button>
        ))}

        <div style={{width:1, height:16, background:'var(--border)', flexShrink:0, margin:'0 2px'}}/>

        {/* Volume filter */}
        {VOLUME_FILTERS.map(f => (
          <button key={f.id} onClick={() => setTfSetting('volumeFilter', f.id)} style={{
            padding:'5px 9px', borderRadius:7, cursor:'pointer', fontSize:10,
            fontFamily:'var(--mono)', flexShrink:0, whiteSpace:'nowrap',
            fontWeight:volumeFilter===f.id?800:400,
            border:`1px solid ${volumeFilter===f.id?PU:'var(--border)'}`,
            background:volumeFilter===f.id?PUD:'var(--bg2)',
            color:volumeFilter===f.id?PU:'var(--text3)',
          }}>{f.label}</button>
        ))}

        <div style={{width:1, height:16, background:'var(--border)', flexShrink:0, margin:'0 2px'}}/>

        {/* Sort */}
        <span style={{fontSize:10, color:'var(--text3)', flexShrink:0, fontFamily:'var(--mono)'}}>↕</span>
        {[['time','Time'],['symbol','Sym'],['gain','Gain']].map(([col,lbl])=>(
          <button key={col} onClick={() => toggleSort(col)} style={{
            padding:'5px 9px', borderRadius:7, cursor:'pointer', fontSize:10,
            fontFamily:'var(--mono)', flexShrink:0, whiteSpace:'nowrap',
            fontWeight:sortBy===col?800:400,
            border:`1px solid ${sortBy===col?DC:'var(--border)'}`,
            background:sortBy===col?DD:'var(--bg2)',
            color:sortBy===col?DC:'var(--text3)',
          }}>{lbl}{sortBy===col?(sortDir==='desc'?' ↓':' ↑'):''}</button>
        ))}

        {/* View mode */}
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

      {/* ── Results header — only render after first scan ── */}
      {(alerts.length > 0 || lastScan) && (
      <div style={{background:'var(--bg1)', border:`1.5px solid ${DC}33`, borderRadius:12, padding:'10px 14px', marginBottom:8}}>
        <div style={{display:'flex', alignItems:'center', gap:5, flexWrap:'wrap'}}>
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
          {alerts.length > 0 && (
            <button onClick={() => setAlerts([])} style={{
              marginLeft:'auto', fontSize:10, fontFamily:'var(--mono)', color:'var(--text3)',
              padding:'3px 8px', border:'1px solid var(--border)', borderRadius:6,
              cursor:'pointer', background:'var(--bg2)', flexShrink:0,
            }}>✕ Clear</button>
          )}
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
