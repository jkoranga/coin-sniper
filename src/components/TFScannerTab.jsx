import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { CandleChart } from './UI.jsx'
import { ADVANCED_SCANNERS, ALL_SCANNERS } from '../utils/scanners.js'
import { getPatternTfs } from './SettingsTab.jsx'
import {
  fetchCandles, fetchAllUSDTSymbolsWithRetry, fetch24hTickers,
  TOP_SYMBOLS, intervalToMs, playBeep,
  sendTelegram, buildTelegramMsg, fmt, timeSince, fmtVol,
} from '../utils/scanner.js'
import { compilePattern } from './PatternBuilder.jsx'
import { historyAddAlerts } from '../App.jsx'

// ── TradingView link ──────────────────────────────────────
const TF_MAP = {'1m':'1','3m':'3','5m':'5','15m':'15','30m':'30','1h':'60','4h':'240','1d':'D','1D':'D'}
function tvUrl(symbol, tf='15m') {
  return `https://www.tradingview.com/chart/?symbol=BINANCE:${symbol.replace('USDT','')}USDT&interval=${TF_MAP[tf]||'15'}`
}
function TvIcon({ symbol, timeframe, sz=26 }) {
  return (
    <a href={tvUrl(symbol,timeframe)} target="_blank" rel="noopener noreferrer"
      onClick={e=>e.stopPropagation()} title={`Open ${timeframe} on TradingView`}
      style={{ display:'inline-flex',alignItems:'center',justifyContent:'center',
        width:sz,height:sz,borderRadius:6,flexShrink:0,
        background:'rgba(33,150,243,0.12)',border:'1.5px solid rgba(33,150,243,0.35)',
        color:'#2196f3',textDecoration:'none',transition:'all .15s' }}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
      </svg>
    </a>
  )
}

// ── Pattern colors ─────────────────────────────────────────
const PC = {
  ema_base_rev_bull_v2:      {bg:'rgba(0,230,118,0.11)',   bd:'rgba(0,210,80,0.65)',     tx:'#00e676'},
  ema_base_rev_bear_v2:      {bg:'rgba(255,50,80,0.10)',   bd:'rgba(255,50,80,0.60)',    tx:'#ff3250'},
  ema20_reversal_bull:       {bg:'rgba(0,230,118,0.10)',   bd:'rgba(0,200,100,0.60)',    tx:'#00e676'},
  ema20_reversal_bear:       {bg:'rgba(255,80,100,0.10)',  bd:'rgba(255,60,80,0.58)',    tx:'#ff5060'},
  bullish_trend_reversal:    {bg:'rgba(0,255,180,0.10)',   bd:'rgba(0,220,160,0.65)',    tx:'#00ffb3'},
  bearish_trend_reversal:    {bg:'rgba(255,80,180,0.10)',  bd:'rgba(255,60,160,0.60)',   tx:'#ff50b0'},
  ema_slope_reversal_bull:   {bg:'rgba(0,230,118,0.10)',   bd:'rgba(0,210,80,0.60)',     tx:'#00e676'},
  ema_slope_reversal_bear:   {bg:'rgba(255,50,80,0.10)',   bd:'rgba(255,50,80,0.60)',    tx:'#ff3250'},
  buy_signal_3m:             {bg:'rgba(0,230,118,0.10)',   bd:'rgba(0,200,100,0.60)',    tx:'#00e676'},
  sell_signal_3m:            {bg:'rgba(255,50,80,0.10)',   bd:'rgba(255,50,80,0.60)',    tx:'#ff3250'},
  ema16_dip_buy_3m:          {bg:'rgba(0,255,180,0.10)',   bd:'rgba(0,220,160,0.60)',    tx:'#00ffb3'},
  ema16_dip_sell_3m:         {bg:'rgba(255,80,180,0.10)',  bd:'rgba(255,60,160,0.60)',   tx:'#ff50b0'},
}
const BULL_PC = {bg:'rgba(0,230,118,0.10)', bd:'rgba(0,210,80,0.60)',  tx:'#00e676'}
const BEAR_PC = {bg:'rgba(255,50,80,0.10)', bd:'rgba(255,50,80,0.60)', tx:'#ff3250'}
const gPC = (id, side) => PC[id] || (side === 'bear' ? BEAR_PC : BULL_PC)

// ── Dedup / volume options ─────────────────────────────────
const DEDUP_OPTIONS = [['1m','1m'],['3m','3m'],['5m','5m'],['15m','15m'],['30m','30m'],['1h','1h'],['4h','4h'],['1d','Daily']]
const VOLUME_FILTERS = [
  {id:'all',label:'All Vol',min:0},
  {id:'500k',label:'>500K',min:500_000},
  {id:'1m',label:'>1M',min:1_000_000},
  {id:'5m',label:'>5M',min:5_000_000},
  {id:'10m',label:'>10M',min:10_000_000},
]

// ── Countdown ─────────────────────────────────────────────
function Countdown({ nextAt }) {
  const [sec, setSec] = useState(0)
  useEffect(() => {
    if (!nextAt) return
    const t = setInterval(() => setSec(Math.max(0,Math.ceil((nextAt-Date.now())/1000))), 1000)
    return () => clearInterval(t)
  }, [nextAt])
  if (!nextAt || sec<=0) return null
  const m = Math.floor(sec/60), s = sec%60
  return <span style={{fontFamily:'var(--mono)',fontSize:12,color:'var(--amber)',fontWeight:700}}>⏱ {m>0?`${m}m `:''}{ s}s</span>
}

// ── Alert result card ─────────────────────────────────────
function AlertCard({ alert, onDismiss, onTap, resultFilter }) {
  const isBull = alert.side==='bull'
  const pc = gPC(alert.scannerId, alert.side)
  if (resultFilter === 'bull' && !isBull) return null
  if (resultFilter === 'bear' && isBull) return null
  return (
    <div className="fade-in" onClick={()=>onTap(alert)} style={{
      borderRadius:14, border:`2px solid ${pc.bd}`, background:pc.bg,
      padding:'14px', cursor:'pointer', position:'relative',marginBottom:2,
    }}>
      <button className="alert-card-dismiss" onClick={e=>{e.stopPropagation();onDismiss()}} style={{position:'absolute',top:8,right:8}}>×</button>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
        <span style={{fontSize:22,flexShrink:0}}>{alert.scannerIcon}</span>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:'inline-flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
            <span style={{fontSize:11,fontWeight:800,padding:'2px 8px',borderRadius:16,
              background:`${pc.tx}22`,color:pc.tx,border:`1.5px solid ${pc.bd}`,fontFamily:'var(--mono)'}}>{alert.scannerName}</span>
            <span className={`badge ${isBull?'badge-green':'badge-red'}`} style={{fontSize:9}}>{isBull?'BULL':'BEAR'}</span>
          </div>
        </div>
        <TvIcon symbol={alert.symbol} timeframe={alert.timeframe}/>
      </div>
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:10}}>
        <div style={{flex:1}}>
          <div style={{fontWeight:900,fontSize:20,color:pc.tx,fontFamily:'var(--mono)',letterSpacing:'-.02em'}}>{alert.symbol.replace('USDT','')}<span style={{fontSize:12,fontWeight:400,color:'var(--text3)'}}>/USDT</span></div>
          <div style={{fontSize:10,fontFamily:'var(--mono)',color:'var(--text3)',marginTop:3}}>
            {alert.timeframe} · {timeSince(alert.time)}
            {alert.ticker&&<> · <span style={{color:alert.ticker.priceChangePercent>=0?'var(--green)':'var(--red)'}}>{alert.ticker.priceChangePercent>0?'+':''}{alert.ticker.priceChangePercent?.toFixed(2)}%</span></>}
          </div>
        </div>
        {alert.details.run && <CandleChart candles={alert.details.run} width={84} height={42}/>}
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:6,marginBottom:8}}>
        {[['Candles',alert.details.candleCount,false],[isBull?'Gain':'Drop',`${isBull?'+':'-'}${alert.details.gainPct}%`,true],['Close',fmt(alert.details.highestClose),false]].map(([l,v,colored])=>(
          <div key={l} style={{borderRadius:8,padding:'7px 8px',background:'rgba(0,0,0,0.25)',border:`1px solid ${pc.bd}`}}>
            <div style={{fontSize:9,fontFamily:'var(--mono)',color:'var(--text3)',marginBottom:3,textTransform:'uppercase',letterSpacing:'.05em'}}>{l}</div>
            <div style={{fontFamily:'var(--mono)',fontWeight:900,fontSize:13,color:colored?pc.tx:'var(--text)'}}>{v}</div>
          </div>
        ))}
      </div>
      {(alert.details.ema20||alert.details.ema40||alert.details.rsi!=null)&&(
        <div style={{display:'flex',gap:5,flexWrap:'wrap',marginBottom:6}}>
          {alert.details.ema20&&<div style={{display:'flex',alignItems:'center',gap:5,padding:'4px 8px',borderRadius:6,background:'rgba(0,210,80,0.07)',border:'1px solid rgba(0,210,80,0.25)'}}><span style={{fontSize:10,color:'#00e676',fontFamily:'var(--mono)',fontWeight:700}}>EMA20</span><span style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--text)',fontWeight:700}}>{fmt(alert.details.ema20)}</span></div>}
          {alert.details.ema40&&<div style={{display:'flex',alignItems:'center',gap:5,padding:'4px 8px',borderRadius:6,background:'rgba(255,180,0,0.07)',border:'1px solid rgba(255,180,0,0.25)'}}><span style={{fontSize:10,color:'var(--amber)',fontFamily:'var(--mono)',fontWeight:700}}>EMA40</span><span style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--text)',fontWeight:700}}>{fmt(alert.details.ema40)}</span></div>}
          {alert.details.rsi!=null&&<div style={{display:'flex',alignItems:'center',gap:5,padding:'4px 8px',borderRadius:6,background:'rgba(255,160,0,0.08)',border:'1px solid rgba(255,160,0,0.25)'}}><span style={{fontSize:10,color:'#ffa000',fontFamily:'var(--mono)',fontWeight:700}}>RSI</span><span style={{fontFamily:'var(--mono)',fontSize:11,fontWeight:700,color:alert.details.rsi<30?'var(--green)':alert.details.rsi>70?'var(--red)':'var(--text)'}}>{alert.details.rsi?.toFixed(1)}</span></div>}
        </div>
      )}
      <div style={{fontSize:10,fontFamily:'var(--mono)',color:'var(--text3)',opacity:.55}}>Tap for details →</div>
    </div>
  )
}

// ── List row ──────────────────────────────────────────────
function ScanListItem({ alert, onDismiss, onTap, resultFilter }) {
  const isBull = alert.side==='bull'
  const pc = gPC(alert.scannerId, alert.side)
  if (resultFilter==='bull'&&!isBull) return null
  if (resultFilter==='bear'&&isBull) return null
  return (
    <div className="fade-in" onClick={()=>onTap(alert)} style={{
      display:'flex',alignItems:'center',gap:10,padding:'10px 12px',
      borderRadius:12,cursor:'pointer',border:`2px solid ${pc.bd}`,background:pc.bg,marginBottom:2,
    }}>
      <span style={{fontSize:19,flexShrink:0}}>{alert.scannerIcon}</span>
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap',marginBottom:2}}>
          <span style={{fontWeight:900,color:pc.tx,fontFamily:'var(--mono)',fontSize:14}}>{alert.symbol.replace('USDT','')}<span style={{fontSize:10,fontWeight:400,color:'var(--text3)'}}>/USDT</span></span>
          <span style={{fontSize:9,fontWeight:800,padding:'2px 6px',borderRadius:4,background:`${pc.tx}20`,color:pc.tx,border:`1px solid ${pc.bd}`,fontFamily:'var(--mono)'}}>{alert.scannerName}</span>
          <span className={`badge ${isBull?'badge-green':'badge-red'}`} style={{fontSize:9}}>{isBull?'●':'●'}</span>
        </div>
        <div style={{fontSize:10,fontFamily:'var(--mono)',color:'var(--text3)'}}>
          {alert.timeframe} · {timeSince(alert.time)} · <span style={{color:pc.tx}}>{isBull?'+':'-'}{alert.details.gainPct}%</span>
          {alert.ticker&&` · ${fmtVol(alert.ticker.volume)}`}
          {alert.details.rsi!=null&&<> · <span style={{color:'#ffa000'}}>RSI:{alert.details.rsi?.toFixed(1)}</span></>}
        </div>
      </div>
      {alert.details.run && <CandleChart candles={alert.details.run} width={56} height={28}/>}
      <TvIcon symbol={alert.symbol} timeframe={alert.timeframe} sz={24}/>
      <button className="btn-small" onClick={e=>{e.stopPropagation();onDismiss()}} style={{padding:'3px 7px',fontSize:13,flexShrink:0}}>×</button>
    </div>
  )
}

// ── Detail sheet ──────────────────────────────────────────
function DetailSheet({ alert, onClose }) {
  useEffect(() => {
    const fn = e => e.key==='Escape' && onClose()
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [onClose])
  if (!alert) return null
  const isBull = alert.side==='bull'
  const pc = gPC(alert.scannerId, alert.side)
  return (
    <div className="detail-overlay open">
      <div className="detail-backdrop" onClick={onClose}/>
      <div className="detail-panel">
        <div className="detail-handle"/>
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:16}}>
          <span style={{fontSize:26}}>{alert.scannerIcon}</span>
          <div style={{flex:1}}>
            <div style={{fontWeight:800,fontSize:17,color:pc.tx}}>{alert.scannerName}</div>
            <div style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--text3)',marginTop:2}}>{alert.symbol} · {alert.timeframe} · {timeSince(alert.time)}</div>
          </div>
          <TvIcon symbol={alert.symbol} timeframe={alert.timeframe}/>
          <span className={`badge ${isBull?'badge-green':'badge-red'}`}>{isBull?'BULL':'BEAR'}</span>
        </div>
        {alert.details.run&&(
          <div style={{background:'var(--bg2)',borderRadius:10,padding:'12px',marginBottom:12}}>
            <div style={{fontSize:10,fontFamily:'var(--mono)',color:'var(--text3)',marginBottom:6}}>CANDLE CHART</div>
            <CandleChart candles={alert.details.run} width={Math.min(300,window.innerWidth-80)} height={68}/>
          </div>
        )}
        <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:8,marginBottom:12}}>
          {[
            ['Candles',alert.details.candleCount],
            [isBull?'Gain':'Drop',`${isBull?'+':'-'}${alert.details.gainPct}%`],
            ['Entry',fmt(alert.details.lowestOpen)],
            ['Close',fmt(alert.details.highestClose)],
            ...(alert.ticker?[['24h Vol',fmtVol(alert.ticker.volume)],['24h%',`${alert.ticker.priceChangePercent>0?'+':''}${alert.ticker.priceChangePercent?.toFixed(2)}%`]]:[]),
          ].map(([l,v])=>(
            <div key={l} style={{background:'var(--bg2)',borderRadius:8,padding:'9px 11px'}}>
              <div style={{fontSize:10,fontFamily:'var(--mono)',color:'var(--text3)',marginBottom:3,textTransform:'uppercase'}}>{l}</div>
              <div style={{fontFamily:'var(--mono)',fontWeight:700,fontSize:15,color:'var(--text)'}}>{v}</div>
            </div>
          ))}
        </div>
        {alert.details.conds&&(
          <div style={{marginBottom:12}}>
            <div style={{fontSize:10,fontFamily:'var(--mono)',color:'var(--text3)',marginBottom:6}}>CONDITIONS</div>
            {alert.details.conds.map((c,i)=>(
              <div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 0',borderBottom:'1px solid var(--border)'}}>
                <span style={{color:c.startsWith('✓')?'var(--green)':'var(--amber)',fontSize:14}}>{c.startsWith('✓')?'✓':'◆'}</span>
                <span style={{fontSize:13,color:'var(--text2)'}}>{c.replace('✓ ','')}</span>
              </div>
            ))}
          </div>
        )}
        <button onClick={onClose} className="btn-secondary" style={{width:'100%',marginTop:14,justifyContent:'center',display:'flex'}}>Close</button>
      </div>
    </div>
  )
}

// ── Main TFScannerTab ─────────────────────────────────────
export default function TFScannerTab({ timeframe, tabColor, settings, update, saveNowWithPatch, user, isFirstVisit, isActive, onAlertCount, onScanProgress, onGoToPatterns }) {
  // Per-tab persistent settings stored under tf-specific keys
  const tfKey = tf => `${tf}_${timeframe}`
  const scanMode      = settings[tfKey('scanMode')]      ?? settings.scanMode      ?? 'all'
  const dedupInterval = settings[tfKey('dedupInterval')] ?? settings.dedupInterval ?? '1m'
  const resultFilter  = settings[tfKey('resultFilter')]  ?? settings.resultFilter  ?? 'all'
  const volumeFilter  = settings[tfKey('volumeFilter')]  ?? settings.volumeFilter  ?? '500k'

  const scannerEnabled = useMemo(() => {
    const saved = settings[tfKey('scannerEnabled')] || settings.scannerEnabled || {}
    const merged = {}
    ALL_SCANNERS.forEach(s => { merged[s.id] = s.id in saved ? saved[s.id] : true })
    return merged
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings[tfKey('scannerEnabled')], settings.scannerEnabled])

  const setTfSetting  = (key, value) => update({ [tfKey(key)]: value })
  const setScanMode      = v   => setTfSetting('scanMode', v)
  const setDedupInterval = v   => { seenRef.current = {}; setTfSetting('dedupInterval', v) }
  const setResultFilter  = v   => setTfSetting('resultFilter', v)
  const setVolumeFilter  = v   => setTfSetting('volumeFilter', v)
  const setScannerEnabled = fn => {
    const next = typeof fn==='function' ? fn(scannerEnabled) : fn
    const key  = tfKey('scannerEnabled')
    update({ [key]: next })
    // Save immediately so scanner toggles survive refresh
    saveNowWithPatch?.({ [key]: next })
  }

  // ── Ephemeral state ──────────────────────────────────────
  const [enabled,       setEnabled]      = useState(false)
  const [loopMode,      setLoopMode]     = useState(false)
  const [scanning,      setScanning]     = useState(false)
  const [progress,      setProgress]     = useState(0)
  const [progressSym,   setProgressSym]  = useState('')
  const [alerts,        setAlerts]       = useState([])
  const [lastScan,      setLastScan]     = useState(null)
  const [nextScanAt,    setNextScanAt]   = useState(null)
  const [errors,        setErrors]       = useState([])
  const sortBy  = settings[tfKey('sortBy')]  ?? settings.defaultSort    ?? 'time'
  const sortDir = settings[tfKey('sortDir')] ?? settings.defaultSortDir ?? 'desc'
  const [selPatterns,   setSelPatterns]  = useState(new Set()) // selected pattern name filter
  const [viewMode,      setViewMode]     = useState('list')
  const [selectedAlert, setSelectedAlert] = useState(null)
  const [allSymbols,    setAllSymbols]   = useState([])
  const [tickers,       setTickers]      = useState({})
  const [loadingSyms,   setLoadingSyms]  = useState(true)
  const [symLoadFailed, setSymLoadFailed] = useState(false)
  const [singleSym,     setSingleSym]    = useState('')
  const [loopCount,     setLoopCount]    = useState(0)
  const [noPatternWarning, setNoPatternWarning] = useState(false)

  const timerRef    = useRef(null)
  const idRef       = useRef(0)
  const abortRef    = useRef(null)
  const loopRef     = useRef(false)
  const seenRef     = useRef({})
  const scanningRef = useRef(false)
  const settingsRef = useRef(settings)
  const symbolsRef  = useRef([])
  const tickersRef  = useRef({})
  const scannersRef = useRef([])
  const candleCacheRef = useRef({})  // Fix 3: candle cache {key → {candles, expiresAt}}

  useEffect(() => { settingsRef.current = settings }, [settings])
  useEffect(() => { tickersRef.current  = tickers }, [tickers])

  // Load symbols + tickers — with retry and explicit failure tracking
  const loadSymbols = useCallback(async () => {
    setLoadingSyms(true)
    setSymLoadFailed(false)
    try {
      const [[syms, failed], tkrs] = await Promise.all([
        fetchAllUSDTSymbolsWithRetry(3),
        fetch24hTickers(),
      ])
      setAllSymbols(syms)
      setTickers(tkrs)
      setSymLoadFailed(failed)
    } catch {
      setAllSymbols(TOP_SYMBOLS)
      setSymLoadFailed(true)
    } finally {
      setLoadingSyms(false)
    }
  }, [])

  useEffect(() => { loadSymbols() }, [loadSymbols])

  const symbols = useMemo(() => {
    const extra = settings.customPairs || []
    if (scanMode === 'custom') return [...new Set(extra)]

    const symSet = settings.symbolSet

    // ── KEY FIX ──────────────────────────────────────────────────────────────
    // While real symbols are still loading AND user wants more than top30,
    // return empty so UI shows "Loading…" instead of wrong 30-pair count.
    if (loadingSyms && symSet !== 'top30') return []

    // Use real data if loaded; only fall back to TOP_SYMBOLS for top30 scenario
    const source = allSymbols.length > 0 ? allSymbols : TOP_SYMBOLS
    const sorted = [...source].sort(
      (a, b) => (tickers[b]?.volume || 0) - (tickers[a]?.volume || 0)
    )

    let base
    if      (symSet === 'top30')  base = sorted.slice(0, 30)
    else if (symSet === 'top100') base = sorted.slice(0, 100)
    else if (symSet === 'top200') base = sorted.slice(0, 200)
    else if (symSet === 'top500') base = sorted.slice(0, 500)
    else                          base = sorted  // 'all' — full 400+ list

    return [...new Set([...base, ...extra])]
  }, [settings.symbolSet, settings.customPairs, allSymbols, tickers, scanMode, loadingSyms])

  useEffect(() => { symbolsRef.current = symbols }, [symbols])

  const activeScanners = useMemo(() => {
    const patternTfs = settings.patternTfs || {}
    const builtIn = ALL_SCANNERS.filter(s => {
      if (!scannerEnabled[s.id]) return false
      if (scanMode !== 'all' && scanMode !== 'single' && scanMode !== 'custom' && s.side !== scanMode) return false
      // If user has explicitly saved a patternTfs config for this scanner, respect it.
      if (s.id in patternTfs) {
        const tfs = patternTfs[s.id]
        // [] means user cleared all TFs — skip this scanner entirely
        return tfs.length > 0 && tfs.includes(timeframe)
      }
      // No user override saved — run on all TFs by default.
      // (scanner.tfs is only a UI hint for the Settings panel, not a runtime filter)
      return true
    })

    // Custom patterns from Pattern Builder
    const custom = (settings.customPatterns || [])
      .filter(p => p.enabled && p.tfs.includes(timeframe) && p.conditions.some(c => c.enabled))
      .filter(p => scanMode === 'all' || p.side === scanMode)
      .map(p => ({
        id:   p.id,
        name: p.name,
        side: p.side,
        icon: p.icon,
        conditions: p.conditions.filter(c => c.enabled).map(c => {
          const { compilePattern: _, ...rest } = c
          return rest
        }),
        group: 'custom',
        tfs:   p.tfs,
        logic: compilePattern(p),
      }))

    return [...builtIn, ...custom]
  }, [scannerEnabled, scanMode, settings.patternTfs, settings.customPatterns, timeframe])

  useEffect(() => { scannersRef.current = activeScanners }, [activeScanners])

  // Notify parent of alert count
  useEffect(() => {
    onAlertCount?.(timeframe, alerts.length)
  }, [alerts.length, timeframe, onAlertCount])

  // Report scanning progress to parent (for topbar progress bar)
  useEffect(() => {
    if (isActive) onScanProgress?.(scanning ? progress : -1, tabColor)
  }, [scanning, progress, isActive, tabColor, onScanProgress])

  // ── Fix 3: Candle cache — reuse candles fetched within last 60s ──────────────
  // Cache key = symbol + timeframe + limit. Expires after 60s.
  // All EMAs/RSI are recomputed from cached raw candles — no pattern impact.
  async function fetchCandlesCached(symbol, tf, limit, ticker) {
    const key = `${symbol}__${tf}__${limit}`
    const now = Date.now()
    const cached = candleCacheRef.current[key]
    if (cached && now < cached.expiresAt) {
      // Update 24h change on cached candles if ticker changed
      if (ticker && ticker.priceChangePercent != null) {
        for (const c of cached.candles) c.change24h = ticker.priceChangePercent
      }
      return cached.candles
    }
    const candles = await fetchCandles(symbol, tf, limit, ticker)
    candleCacheRef.current[key] = { candles, expiresAt: now + 60_000 }
    // Prune cache if it grows too large (keep newest 600 entries)
    const keys = Object.keys(candleCacheRef.current)
    if (keys.length > 600) {
      keys.sort((a, b) => candleCacheRef.current[a].expiresAt - candleCacheRef.current[b].expiresAt)
      keys.slice(0, keys.length - 600).forEach(k => delete candleCacheRef.current[k])
    }
    return candles
  }

  // ── Fix 4: Dynamic candle limit — fetch only as many candles as needed ───────
  // Scans all active pattern conditions for the deepest lookback offset needed.
  // Adds 30-candle buffer for EMA warmup. Minimum 40, maximum 200.
  function calcCandleLimit(scanners) {
    let maxDepth = 0
    for (const sc of scanners) {
      for (const cond of (sc.conditions || [])) {
        // LHS / RHS offsets
        const lhsOff  = Math.abs(cond.lhsOffset  ?? 0)
        const rhsOff  = Math.abs(cond.rhsOffset   ?? 0)
        const pinOff  = Math.abs(cond.rhsPinnedOffset ?? 0)
        // Range check depths
        const rangeFrom = Math.abs(cond.rangeFrom ?? 0)
        const rangeTo   = Math.abs(cond.rangeTo   ?? 0)
        // Slope lookback: skip + len
        const slopeDepth = (cond.slopeSkip ?? 0) + (cond.slopeLen ?? 0)
        const depth = Math.max(lhsOff, rhsOff, pinOff, rangeFrom, rangeTo, slopeDepth)
        if (depth > maxDepth) maxDepth = depth
      }
    }
    // +30 warmup buffer for EMA accuracy, floor 40, cap 200
    return Math.min(200, Math.max(40, maxDepth + 30))
  }

  function isDupe(symbol, scannerId, tf) {
    const key = `${symbol}__${scannerId}__${tf}`
    const now = Date.now()
    const exp = seenRef.current[key]
    if (exp && now < exp) return true
    const ttl = Math.max(intervalToMs(dedupInterval), intervalToMs(settingsRef.current.scanInterval||'30s'))
    seenRef.current[key] = now + ttl
    return false
  }

  async function scanBatch(symList) {
    const CONCURRENCY = 25  // ↑ from 10 — ~2.5x faster on mobile
    const newAlerts=[], newErrors=[]
    let i=0, done=0
    const abort = abortRef.current?.signal
    const scanners = scannersRef.current
    const tkrs = tickersRef.current
    const limit = calcCandleLimit(scanners)

    async function worker() {
      while (true) {
        if (abort?.aborted) return
        const idx = i++
        if (idx >= symList.length) return
        const sym = symList[idx]
        setProgressSym(sym)
        try {
          const candles = await fetchCandlesCached(sym, timeframe, limit, tkrs[sym] || null)

          // ── Collect all HTF timeframes needed across all scanners ──────────
          const htfTfsNeeded = new Set()
          for (const scanner of scanners) {
            for (const cond of (scanner.conditions || [])) {
              if (cond.htfTf && cond.enabled !== false) htfTfsNeeded.add(cond.htfTf)
            }
          }
          // Pre-fetch each unique HTF TF (120 candles is enough for slope + range)
          const htfCandlesMap = {}
          for (const tf of htfTfsNeeded) {
            if (tf !== timeframe) {
              try {
                const htfArr = await fetchCandlesCached(sym, tf, 120, null)
                if (htfArr && htfArr.length >= 2) htfCandlesMap[tf] = htfArr
              } catch { /* skip — condition will gracefully return null */ }
            } else {
              htfCandlesMap[tf] = candles // same TF reuse
            }
          }

          for (const scanner of scanners) {
            if (abort?.aborted) continue
            if (isDupe(sym, scanner.id, timeframe)) continue
            const result = scanner.logic(candles, htfCandlesMap)
            if (result) {
              const a = {
                id: ++idRef.current, symbol: sym, timeframe, time: Date.now(),
                scannerId: scanner.id, scannerName: scanner.name,
                scannerIcon: scanner.icon, side: scanner.side,
                group: scanner.group||'standard',
                details: result, ticker: tkrs[sym]||null,
              }
              newAlerts.push(a)
              historyAddAlerts([a])
            }
          }
        } catch { newErrors.push(sym) }
        done++
        setProgress(Math.round(done / symList.length * 100))
        await new Promise(r => setTimeout(r, 5))  // ↓ from 20ms — saves ~8s per 450-sym scan
      }
    }

    await Promise.all(Array.from({length:CONCURRENCY}, () => worker()))
    return { newAlerts, newErrors }
  }

  const runScan = useCallback(async (symOverride) => {
    if (scanningRef.current) return
    // Guard: no patterns configured for this TF
    if (scannersRef.current.length === 0) {
      setNoPatternWarning(true)
      return
    }
    scanningRef.current = true
    setScanning(true); setProgress(0); setErrors([])
    abortRef.current = new AbortController()
    const cfg = settingsRef.current
    const currentScanMode = cfg[`scanMode_${timeframe}`] || cfg.scanMode || 'all'
    const currentCustomPairs = cfg.customPairs || []
    const syms = symOverride || (
      currentScanMode==='custom' ? [...new Set(currentCustomPairs)] : symbolsRef.current
    )
    if (!syms || syms.length===0) { scanningRef.current=false; setScanning(false); return }
    const { newAlerts, newErrors } = await scanBatch(syms)
    setProgress(100)
    if (newAlerts.length) {
      if (cfg.soundEnabled) {
        if (newAlerts.some(a=>a.side==='bull')) playBeep(false)
        if (newAlerts.some(a=>a.side==='bear')) setTimeout(()=>playBeep(true),300)
      }
      if (cfg.tgOn && cfg.tgToken && cfg.tgChatId)
        for (const a of newAlerts.slice(0,5))
          await sendTelegram(cfg.tgToken, cfg.tgChatId, buildTelegramMsg(a))
    }
    if (newErrors.length) setErrors(newErrors)
    setLastScan(Date.now())
    // Replace results — fresh batch replaces previous (both loop and auto behave identically)
    setAlerts(newAlerts.slice(0, 500))
    scanningRef.current = false
    setProgressSym('')
    if (loopRef.current) {
      setLoopCount(c=>c+1)
      candleCacheRef.current = {}
      setScanning(false)
      setAlerts([]) // clear results before next loop so display is fresh
      setTimeout(()=>runScan(symOverride), 5000) // 5s gap between loop iterations
    } else {
      setScanning(false)
    }
  }, [timeframe]) // eslint-disable-line

  // ── Auto-scan on tab activation: run when user switches to this TF ─────────
  const prevActiveRef = useRef(isActive)
  const hasScannedOnce = useRef(false)
  useEffect(() => {
    const wasActive = prevActiveRef.current
    prevActiveRef.current = isActive
    if (!isActive) return
    if (scanningRef.current) return
    // Scan on first visit to this tab, and on every subsequent tab switch to it
    if (wasActive && hasScannedOnce.current) return

    // If symbols are still loading, retry until they're ready
    const tryRun = () => {
      if (symbolsRef.current.length > 0 && scannersRef.current.length > 0 && !scanningRef.current) {
        hasScannedOnce.current = true
        runScan()
      } else if (!hasScannedOnce.current) {
        setTimeout(tryRun, 400)
      }
    }
    const t = setTimeout(tryRun, 300)
    return () => clearTimeout(t)
  }, [isActive, runScan])

  // Auto-scan interval
  useEffect(() => {
    if (!enabled||loopMode) { clearTimeout(timerRef.current); setNextScanAt(null); return }
    let cancelled = false

    // Recursive setTimeout chain: next scan only schedules AFTER current scan finishes.
    // This prevents instant re-trigger when 500+ coins take longer than the interval.
    const scheduleNext = () => {
      if (cancelled) return
      const ms = intervalToMs(settingsRef.current.scanInterval||'30s')
      setNextScanAt(Date.now()+ms)
      timerRef.current = setTimeout(async () => {
        if (cancelled) return
        await runScan()
        scheduleNext()
      }, ms)
    }

    const kickoff = async () => {
      await runScan()
      scheduleNext()
    }
    kickoff()
    return () => {
      cancelled = true
      clearTimeout(timerRef.current)
      setNextScanAt(null)
    }
  }, [enabled, loopMode, settings.scanInterval]) // eslint-disable-line

  function toggleLoop(v) {
    setLoopMode(v)
    if (v) { loopRef.current=true; setEnabled(false); setLoopCount(0); runScan() }
    else { loopRef.current=false; abortRef.current?.abort(); scanningRef.current=false; setScanning(false); setProgressSym('') }
  }

  function stopScan() {
    loopRef.current=false; abortRef.current?.abort()
    setScanning(false); setEnabled(false); setLoopMode(false)
    setNextScanAt(null); clearTimeout(timerRef.current)
    scanningRef.current = false
  }

  function toggleSort(col) {
    if (sortBy===col) setTfSetting('sortDir', sortDir==='asc'?'desc':'asc')
    else { setTfSetting('sortBy', col); setTfSetting('sortDir', 'desc') }
  }

  const volMin = VOLUME_FILTERS.find(f=>f.id===volumeFilter)?.min ?? 0

  const filteredAlerts = useMemo(() => {
    return [...alerts].filter(a =>
      (a.ticker?.volume ?? 0) >= volMin &&
      (selPatterns.size === 0 || selPatterns.has(a.scannerName))
    )
      .sort((x,y) => {
        let cmp=0
        if (sortBy==='time')    cmp=x.time-y.time
        if (sortBy==='symbol')  cmp=x.symbol.localeCompare(y.symbol)
        if (sortBy==='pattern') cmp=x.scannerName.localeCompare(y.scannerName)
        if (sortBy==='gain')    cmp=parseFloat(x.details.gainPct||0)-parseFloat(y.details.gainPct||0)
        if (sortBy==='volume')  cmp=(x.ticker?.volume||0)-(y.ticker?.volume||0)
        return sortDir==='desc'?-cmp:cmp
      })
  }, [alerts, sortBy, sortDir, volMin, selPatterns])

  const bullCount = alerts.filter(a=>a.side==='bull').length
  const bearCount = alerts.filter(a=>a.side==='bear').length
  const displayedCount = filteredAlerts.filter(a => resultFilter==='all'?true:a.side===resultFilter).length

  const customPairs = useMemo(()=>[...new Set(settings.customPairs||[])],[settings.customPairs])

  const SCAN_MODES=[
    {id:'single',icon:'⚡',label:'Single',col:'var(--amber)',  bd:'var(--amber)',  bg:'rgba(255,180,0,.1)'},
    {id:'all',   icon:'⬡', label:'All',   col:'var(--accent)', bd:'var(--accent)', bg:'var(--accent-dim)'},
    {id:'bull',  icon:'🟢',label:'Bull',  col:'var(--green)',  bd:'var(--green2)', bg:'var(--green-dim)'},
    {id:'bear',  icon:'🔴',label:'Bear',  col:'var(--red)',    bd:'var(--red2)',   bg:'var(--red-dim)'},
    {id:'custom',icon:'⊞', label:'Custom',col:'#b388ff',       bd:'rgba(179,136,255,.5)',bg:'rgba(179,136,255,.08)'},
  ]

  return (
    <div style={{ paddingBottom: 4 }}>
      <DetailSheet alert={selectedAlert} onClose={()=>setSelectedAlert(null)}/>

      {/* ── No-pattern warning modal ── */}
      {noPatternWarning && (
        <>
          <div onClick={() => setNoPatternWarning(false)} style={{
            position: 'fixed', inset: 0, zIndex: 299, background: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(4px)',
          }} />
          <div style={{
            position: 'fixed', left: '50%', top: '50%',
            transform: 'translate(-50%,-50%)',
            zIndex: 300, width: 'min(310px, 90vw)',
            borderRadius: 18, padding: '24px 20px',
            background: 'var(--bg1)',
            border: '1.5px solid rgba(255,200,0,0.4)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>🔬</div>
            <div style={{ fontWeight: 900, fontSize: 15, color: 'rgb(255,200,0)', marginBottom: 6 }}>
              No Patterns for {timeframe.toUpperCase()}
            </div>
            <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)', lineHeight: 1.7, marginBottom: 18 }}>
              There are no active patterns configured to scan on the <b style={{ color: tabColor }}>{timeframe}</b> timeframe.<br/>
              Build a pattern and enable this TF to start scanning.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                onClick={() => { setNoPatternWarning(false); onGoToPatterns?.() }}
                style={{
                  width: '100%', padding: '12px', borderRadius: 10, cursor: 'pointer',
                  fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 12,
                  border: '1.5px solid rgba(255,200,0,0.5)',
                  background: 'rgba(255,200,0,0.12)', color: 'rgb(255,200,0)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                <span style={{ fontSize: 15 }}>🔬</span> Open Patterns
              </button>
              <button
                onClick={() => setNoPatternWarning(false)}
                style={{
                  width: '100%', padding: '10px', borderRadius: 10, cursor: 'pointer',
                  fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 11,
                  border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text3)',
                }}
              >Dismiss</button>
            </div>
          </div>
        </>
      )}

      {/* ── TF header ── */}
      <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16,gap:8 }}>
        <div>
          <div style={{ display:'flex',alignItems:'center',gap:7 }}>
            <div style={{ width:8,height:8,borderRadius:'50%',background:tabColor,boxShadow:`0 0 7px ${tabColor}` }}/>
            <h2 style={{ fontSize:14,fontWeight:800,letterSpacing:'.04em',color:tabColor,fontFamily:'var(--mono)' }}>{timeframe.toUpperCase()}</h2>
          </div>
          <p style={{ fontSize:12,color:'var(--text3)',fontFamily:'var(--mono)',marginTop:3, display:'flex', alignItems:'center', gap:6 }}>
            {loadingSyms
              ? <span style={{color:'var(--amber)'}}>⟳ Loading pairs…</span>
              : symLoadFailed
                ? <><span style={{color:'var(--red)'}}>⚠ API failed · {symbols.length} pairs</span>
                    <button onClick={loadSymbols} style={{fontSize:10,padding:'1px 6px',borderRadius:4,border:'1px solid var(--red2)',background:'var(--red-dim)',color:'var(--red)',cursor:'pointer',fontFamily:'var(--mono)'}}>Retry</button>
                  </>
                : <span>{symbols.length} symbols · {activeScanners.length} patterns</span>
            }
          </p>
        </div>
        <div style={{ display:'flex',gap:5,alignItems:'center',flexShrink:0,flexWrap:'wrap',justifyContent:'flex-end' }}>
          <Countdown nextAt={nextScanAt}/>

          {/* ── SCAN button: single-click = run once, second click (while not scanning) = auto mode ── */}
          {scanMode!=='single'&&(
            <button
              onClick={() => {
                if (scanning) return
                if (loopMode) return
                if (enabled) {
                  // already in auto → turn off
                  stopScan()
                } else {
                  // Arm auto — useEffect kickoff will immediately run a fresh scan then start interval
                  setEnabled(true)
                }
              }}
              disabled={scanning && !enabled && !loopMode}
              style={{
                display:'flex', alignItems:'center', gap:5,
                padding:'7px 14px', borderRadius:8, cursor:'pointer',
                fontSize:12, fontFamily:'var(--mono)', fontWeight:700,
                border:`2px solid ${enabled&&!loopMode ? 'var(--green)' : scanning ? tabColor+'cc' : tabColor}`,
                background: enabled&&!loopMode ? 'var(--green-dim)' : `${tabColor}15`,
                color: enabled&&!loopMode ? 'var(--green)' : tabColor,
                boxShadow: enabled&&!loopMode ? '0 0 8px rgba(0,230,118,0.3)' : scanning ? `0 0 10px ${tabColor}55` : `0 0 6px ${tabColor}33`,
                transition:'all .15s',
                minWidth: 74,
                justifyContent:'center',
              }}
            >
              {scanning
                ? <><span style={{animation:'spin 0.7s linear infinite',display:'inline-block'}}>⟳</span> {progress}%</>
                : enabled
                  ? <>⏱ Auto</>
                  : <>▶ Scan</>
              }
            </button>
          )}

          {/* ── LOOP button — styled same as Scan button but with cyan color ── */}
          {scanMode!=='single'&&(
            <button
              onClick={() => toggleLoop(!loopMode)}
              style={{
                display:'flex', alignItems:'center', gap:5,
                padding:'7px 14px', borderRadius:8, cursor:'pointer',
                fontSize:12, fontFamily:'var(--mono)', fontWeight:700,
                border:`2px solid ${loopMode ? '#00d4ff' : 'rgba(0,212,255,0.55)'}`,
                background: loopMode ? 'rgba(0,212,255,.13)' : 'rgba(0,212,255,0.07)',
                color: loopMode ? '#00d4ff' : 'rgba(0,212,255,0.8)',
                boxShadow: loopMode ? '0 0 10px rgba(0,212,255,0.35)' : '0 0 6px rgba(0,212,255,0.15)',
                transition:'all .15s',
                minWidth: loopMode ? 68 : 56,
                justifyContent:'center',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                style={{flexShrink:0,animation:loopMode?'spin 1.4s linear infinite':'none'}}>
                <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
              </svg>
              {loopMode ? `#${loopCount}` : 'Loop'}
            </button>
          )}

          {/* Stop button — only show when something is running */}
          {(scanning||loopMode||enabled)&&(
            <button onClick={stopScan}
              style={{ padding:'7px 11px',borderRadius:8,fontSize:13,fontWeight:800,cursor:'pointer',
                border:'1.5px solid var(--red2)',background:'var(--red-dim)',color:'var(--red)',
                display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>
              ■
            </button>
          )}

          {/* Clear alerts badge */}
          {alerts.length>0&&(
            <button onClick={()=>setAlerts([])} style={{ fontSize:10,fontFamily:'var(--mono)',
              color:'var(--text3)',padding:'5px 9px',border:'1px solid var(--border)',borderRadius:8,cursor:'pointer',background:'var(--bg2)' }}>
              ✕ {alerts.length}
            </button>
          )}
        </div>
      </div>

      {/* ── Scan mode pills — single scrollable row ── */}
      <div style={{
        display:'flex', gap:4, flexWrap:'nowrap', marginBottom:10,
        overflowX:'auto', WebkitOverflowScrolling:'touch',
        scrollbarWidth:'none', msOverflowStyle:'none',
        marginLeft:-12, marginRight:-12, paddingLeft:12, paddingRight:12,
        paddingBottom:2,
      }}>
        {SCAN_MODES.map(m=>(
          <button key={m.id} onClick={()=>setScanMode(m.id)} style={{
            display:'flex',alignItems:'center',gap:4,padding:'5px 11px',borderRadius:20,cursor:'pointer',
            border:`1.5px solid ${scanMode===m.id?m.bd:'var(--border)'}`,
            background:scanMode===m.id?m.bg:'var(--bg2)',
            color:scanMode===m.id?m.col:'var(--text3)',
            fontWeight:scanMode===m.id?700:400,fontSize:11,fontFamily:'var(--mono)',
            transition:'all .15s', flexShrink:0, whiteSpace:'nowrap',
          }}>
            <span style={{fontSize:12}}>{m.icon}</span>
            <span>{m.label}</span>
            {m.id==='custom'&&<span style={{fontSize:8,opacity:.7}}>({customPairs.length})</span>}
          </button>
        ))}
      </div>

      {/* ── Single sym input ── */}
      {scanMode==='single'&&(
        <div style={{ display:'flex',gap:8,marginBottom:10 }}>
          <input className="text-input" placeholder="e.g. BTCUSDT…" value={singleSym}
            onChange={e=>setSingleSym(e.target.value.toUpperCase())}
            onKeyDown={e=>e.key==='Enter'&&singleSym.trim()&&runScan([singleSym.trim()])}
            style={{ flex:1,fontFamily:'var(--mono)',fontWeight:700 }}/>
          <button className="btn-primary" onClick={()=>runScan([singleSym.trim()])}
            disabled={!singleSym.trim()||scanning}
            style={{ flexShrink:0,padding:'0 16px',borderColor:tabColor,color:tabColor,background:`${tabColor}15` }}>
            {scanning?'⟳':'▶'}
          </button>
        </div>
      )}





      {errors.length>0&&(
        <div className="error-banner">
          ⚠ {errors.slice(0,5).join(', ')}{errors.length>5?` +${errors.length-5} more`:''}
          <span style={{marginLeft:8,cursor:'pointer',textDecoration:'underline'}} onClick={()=>setErrors([])}>dismiss</span>
        </div>
      )}

      {/* ── Results ── */}
      <div>
        {/* Results header bar */}
        <div style={{ background:'var(--bg1)',border:`1.5px solid ${tabColor}33`,
          borderRadius:12,padding:'12px 14px',marginBottom:8 }}>
          <div style={{ display:'flex',alignItems:'center',gap:5,marginBottom:8,flexWrap:'wrap' }}>
            {scanning&&(
              <span style={{ display:'flex',alignItems:'center',gap:4,fontFamily:'var(--mono)',fontSize:11,
                color:'var(--amber)',background:'rgba(255,167,38,.1)',border:'1px solid var(--amber)',
                borderRadius:8,padding:'3px 10px',flexShrink:0 }}>
                <span style={{ display:'inline-block',animation:'spin 1s linear infinite' }}>⟳</span> LIVE {progress}%
              </span>
            )}
            <span style={{ fontFamily:'var(--mono)',fontSize:17,fontWeight:800,color:'var(--text)',flexShrink:0 }}>{displayedCount}</span>
            <span style={{ fontFamily:'var(--mono)',fontSize:13,color:'var(--text3)',flexShrink:0 }}>results</span>
            <span style={{ padding:'3px 9px',borderRadius:8,fontSize:12,fontWeight:700,
              background:'var(--green-dim)',color:'var(--green)',border:'1px solid var(--green2)',
              fontFamily:'var(--mono)',flexShrink:0 }}>🟢 {bullCount}</span>
            <span style={{ padding:'3px 9px',borderRadius:8,fontSize:12,fontWeight:700,
              background:'var(--red-dim)',color:'var(--red)',border:'1px solid var(--red2)',
              fontFamily:'var(--mono)',flexShrink:0 }}>🔴 {bearCount}</span>
            <div style={{ display:'flex',gap:3,marginLeft:'auto',flexShrink:0 }}>
              {['list','cards'].map(v=>(
                <button key={v} className={`btn-small ${viewMode===v?'active':''}`} onClick={()=>setViewMode(v)}
                  style={viewMode===v?{borderColor:tabColor,color:tabColor,background:`${tabColor}15`}:{}}>
                  {v==='list'?'≡':'⊞'}
                </button>
              ))}
            </div>
          </div>
          {/* Pattern filter chips — shown when >1 distinct pattern in results */}
          {(() => {
            const names = [...new Set(alerts.map(a => a.scannerName))].sort()
            if (names.length < 2) return null
            return (
              <div style={{ display:'flex', alignItems:'center', gap:5, overflowX:'auto', flexWrap:'nowrap',
                paddingBottom:4, WebkitOverflowScrolling:'touch', scrollbarWidth:'none',
                marginBottom:2,
              }}>
                <span style={{ fontSize:9, fontFamily:'var(--mono)', color:'var(--text3)', flexShrink:0, letterSpacing:'0.05em' }}>PAT</span>
                {/* All button */}
                <button
                  onClick={() => setSelPatterns(new Set())}
                  className="btn-small"
                  style={{ flexShrink:0, whiteSpace:'nowrap',
                    ...(selPatterns.size === 0 ? { borderColor:'var(--accent)', color:'var(--accent)', background:'var(--accent-dim)', fontWeight:700 } : {})
                  }}
                >All</button>
                {names.map(name => {
                  const active = selPatterns.has(name)
                  const count  = alerts.filter(a => a.scannerName === name).length
                  return (
                    <button key={name}
                      onClick={() => setSelPatterns(prev => {
                        const next = new Set(prev)
                        if (next.has(name)) next.delete(name)
                        else next.add(name)
                        return next
                      })}
                      className="btn-small"
                      style={{ flexShrink:0, whiteSpace:'nowrap', maxWidth:110, overflow:'hidden', textOverflow:'ellipsis',
                        ...(active ? { borderColor:'var(--accent)', color:'var(--accent)', background:'var(--accent-dim)', fontWeight:700 } : {})
                      }}
                    >{name} <span style={{ opacity:0.6 }}>({count})</span></button>
                  )
                })}
              </div>
            )
          })()}

          {/* Filter + sort row — single horizontal scrollable line */}
          <div style={{ display:'flex',alignItems:'center',gap:4,overflowX:'auto',flexWrap:'nowrap',
            paddingBottom:4,WebkitOverflowScrolling:'touch',scrollbarWidth:'none',msOverflowStyle:'none' }}>
            {/* Signal / Bull / Bear filter */}
            {[['all','Signal','var(--accent)','var(--accent-dim)'],['bull','🟢 Bull','var(--green)','var(--green-dim)'],['bear','🔴 Bear','var(--red)','var(--red-dim)']].map(([id,lbl,col,bg])=>(
              <button key={id} onClick={()=>setResultFilter(id)} className="btn-small" style={{ flexShrink:0,whiteSpace:'nowrap',...(resultFilter===id?{borderColor:col,color:col,background:bg,fontWeight:700}:{}) }}>{lbl}</button>
            ))}
            <div style={{ width:1,height:16,background:'var(--border)',flexShrink:0,margin:'0 3px' }}/>
            {/* Volume filter */}
            {VOLUME_FILTERS.map(f=>(
              <button key={f.id} onClick={()=>setVolumeFilter(f.id)} className="btn-small" style={{ flexShrink:0,whiteSpace:'nowrap',...(volumeFilter===f.id?{borderColor:'var(--purple)',color:'var(--purple)',background:'var(--purple-dim)',fontWeight:700}:{}) }}>{f.label}</button>
            ))}
            <div style={{ width:1,height:16,background:'var(--border)',flexShrink:0,margin:'0 3px' }}/>
            <span style={{ fontSize:10,fontFamily:'var(--mono)',color:'var(--text3)',flexShrink:0 }}>↕</span>
            {[['time','Time'],['symbol','Sym'],['pattern','Pat'],['gain','Gain'],['volume','Vol']].map(([col,label])=>(
              <button key={col} className={`sort-btn ${sortBy===col?'active':''}`} onClick={()=>toggleSort(col)} style={{ flexShrink:0,whiteSpace:'nowrap' }}>
                {label}{sortBy===col?(sortDir==='desc'?' ↓':' ↑'):''}
              </button>
            ))}
          </div>
        </div>

        {displayedCount===0 ? (
          <div className="empty-state">
            <div className="empty-icon" style={{ color:tabColor }}>{scanMode==='single'?'⚡':scanning?'🔍':loopMode?'🔁':enabled?'⏳':'💤'}</div>
            <div style={{ color:'var(--text2)',fontSize:14 }}>
              {scanMode==='single'?'Enter a symbol and tap Scan'
                :scanning?`Scanning ${progressSym} (${progress}%)…`
                :loopMode?`Loop #${loopCount}`
                :enabled?'Auto-scan armed · waiting for next cycle…'
                :'Tap Scan to start'}
            </div>
            <div style={{ fontSize:11,color:'var(--text3)',marginTop:6 }}>{activeScanners.length} patterns · {symbols.length} symbols · {timeframe}</div>
          </div>
        ) : viewMode==='cards' ? (
          <div style={{ display:'flex',flexDirection:'column',gap:10 }}>
            {filteredAlerts.map(a=><AlertCard key={a.id} alert={a} resultFilter={resultFilter} onDismiss={()=>setAlerts(p=>p.filter(x=>x.id!==a.id))} onTap={setSelectedAlert}/>)}
          </div>
        ) : (
          <div style={{ display:'flex',flexDirection:'column',gap:5 }}>
            {filteredAlerts.map(a=><ScanListItem key={a.id} alert={a} resultFilter={resultFilter} onDismiss={()=>setAlerts(p=>p.filter(x=>x.id!==a.id))} onTap={setSelectedAlert}/>)}
          </div>
        )}
      </div>
    </div>
  )
}
