// ─── Delta Exchange India Scanner ────────────────────────────────────────────
// Completely separate from Binance scanner.
// Uses Delta India REST API for candles and symbols.
// Reuses the same Pattern Builder patterns for signal logic.

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { fetchDeltaSymbols, fetchDeltaCandles } from '../utils/deltaScanner.js'
import { compilePattern } from './PatternBuilder.jsx'
import { intervalToMs, sendTelegram, buildTelegramMsg, fmt, timeSince } from '../utils/scanner.js'

const DELTA_COLOR  = '#ff6b00'
const DELTA_DIM    = 'rgba(255,107,0,0.12)'
const DELTA_BORDER = 'rgba(255,107,0,0.4)'

const TF_LIST = ['1m','3m','5m','15m','30m','1h','4h','1d']

// TradingView link for Delta symbols (uses BYBIT as fallback for Delta-exclusive coins)
function tvUrl(symbol, tf = '15m') {
  const tfMap = {'1m':'1','3m':'3','5m':'5','15m':'15','30m':'30','1h':'60','4h':'240','1d':'D'}
  const base = symbol.replace('USDT','')
  return `https://www.tradingview.com/chart/?symbol=BYBIT:${base}USDT.P&interval=${tfMap[tf]||'15'}`
}

function uid() { return Math.random().toString(36).slice(2,10) }

export default function DeltaScannerTab({ settings, update, isActive, onGoToPatterns, onAlertCount, timeframe: tfProp }) {
  const [timeframe,    setTimeframe]    = useState(tfProp || '15m')
  const [symbols,      setSymbols]      = useState([])
  const [loadingSyms,  setLoadingSyms]  = useState(false)
  const [symFailed,    setSymFailed]    = useState(false)
  const [scanning,     setScanning]     = useState(false)
  const [progress,     setProgress]     = useState(-1)
  const [progressSym,  setProgressSym]  = useState('')
  const [alerts,       setAlerts]       = useState([])
  const [errors,       setErrors]       = useState([])
  const [lastScan,     setLastScan]     = useState(null)
  const [noPatternWarn,setNoPatternWarn]= useState(false)
  const [expandedIds,  setExpandedIds]  = useState(new Set())

  const abortRef    = useRef(null)
  const scanningRef = useRef(false)
  const seenRef     = useRef({})
  const cacheRef    = useRef({})   // candle cache
  const idRef       = useRef(0)

  const [symFallback, setSymFallback] = useState(false)

  // ── Load Delta symbols once on mount ────────────────────────────────────────
  useEffect(() => {
    setLoadingSyms(true)
    fetchDeltaSymbols().then(syms => {
      setSymbols(syms)
      setSymFailed(syms.length === 0)
      // If we got symbols but they all have volume=0 it means fallback was used
      setSymFallback(syms.length > 0 && syms.every(s => s.volume === 0))
    }).catch(() => {
      setSymFailed(true)
    }).finally(() => setLoadingSyms(false))
  }, [])

  // ── Active patterns for selected TF ─────────────────────────────────────────
  const activeScanners = useMemo(() => {
    return (settings.customPatterns || [])
      .filter(p =>
        p.enabled &&
        !p.locked &&
        Array.isArray(p.tfs) && p.tfs.includes(timeframe) &&
        p.conditions.some(c => c.enabled)
      )
      .map(p => ({
        id:    p.id,
        name:  p.name,
        side:  p.side,
        icon:  p.icon || (p.side === 'bull' ? '🟢' : '🔴'),
        logic: compilePattern(p),
      }))
      .filter(p => p.logic !== null)
  }, [settings.customPatterns, timeframe])

  // ── Candle cache (60s TTL) ───────────────────────────────────────────────────
  async function fetchCached(symbol, tf, limit) {
    const key = `${symbol}__${tf}__${limit}`
    const now = Date.now()
    const hit = cacheRef.current[key]
    if (hit && now < hit.expiresAt) return hit.candles
    const candles = await fetchDeltaCandles(symbol, tf, limit)
    if (candles) {
      cacheRef.current[key] = { candles, expiresAt: now + 60_000 }
    }
    return candles
  }

  // ── Dedup check ──────────────────────────────────────────────────────────────
  function isDupe(symbol, scannerId) {
    const key = `delta__${symbol}__${scannerId}__${timeframe}`
    const now = Date.now()
    const exp = seenRef.current[key]
    if (exp && now < exp) return true
    seenRef.current[key] = now + intervalToMs(timeframe)
    return false
  }

  // ── Core scan ────────────────────────────────────────────────────────────────
  const runScan = useCallback(async () => {
    if (scanningRef.current) return
    if (activeScanners.length === 0) { setNoPatternWarn(true); return }
    if (symbols.length === 0) return

    // Abort previous
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac

    scanningRef.current = true
    setScanning(true)
    setProgress(0)
    setErrors([])

    const CONCURRENCY = 20
    const symList = symbols.map(s => s.symbol)
    const limit   = 60
    let i = 0, done = 0
    const newAlerts = []

    async function worker() {
      while (true) {
        if (ac.signal.aborted) return
        const idx = i++
        if (idx >= symList.length) return
        const sym = symList[idx]
        setProgressSym(sym)
        try {
          const candles = await fetchCached(sym, timeframe, limit)
          if (!candles || candles.length < 10) { done++; setProgress(Math.round(done/symList.length*100)); continue }
          for (const sc of activeScanners) {
            if (ac.signal.aborted) continue
            if (isDupe(sym, sc.id)) continue
            const result = sc.logic(candles)
            if (result) {
              const a = {
                id: ++idRef.current,
                exchange: 'delta',
                symbol: sym,
                timeframe,
                time: Date.now(),
                scannerId: sc.id,
                scannerName: sc.name,
                scannerIcon: sc.icon,
                side: sc.side,
                details: result,
              }
              newAlerts.push(a)
              setAlerts(prev => [a, ...prev].slice(0, 300))
            }
          }
        } catch { setErrors(prev => [...prev, sym]) }
        done++
        setProgress(Math.round(done / symList.length * 100))
        await new Promise(r => setTimeout(r, 5))
      }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))

    setLastScan(Date.now())
    setProgress(-1)
    setProgressSym('')
    scanningRef.current = false
    setScanning(false)
    onAlertCount?.(newAlerts.length)

    // Telegram notify if configured
    if (newAlerts.length > 0 && settings.telegramToken && settings.telegramChatId) {
      for (const a of newAlerts.slice(0, 5)) {
        sendTelegram(
          settings.telegramToken, settings.telegramChatId,
          `🔶 Delta India\n${a.scannerIcon} ${a.scannerName}\n${a.symbol} · ${a.timeframe}`
        ).catch(() => {})
      }
    }
  }, [activeScanners, symbols, timeframe, settings])

  // Stop scan when tab becomes inactive
  useEffect(() => {
    if (!isActive) { abortRef.current?.abort(); scanningRef.current = false; setScanning(false) }
  }, [isActive])

  const toggleExpand = id => setExpandedIds(prev => {
    const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s
  })

  // ── UI ───────────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '10px 10px 90px', maxWidth: 620, margin: '0 auto' }}>

      {/* No-pattern modal */}
      {noPatternWarn && (
        <>
          <div onClick={() => setNoPatternWarn(false)} style={{
            position: 'fixed', inset: 0, zIndex: 299, background: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(4px)',
          }} />
          <div style={{
            position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
            zIndex: 300, width: 'min(310px,90vw)', borderRadius: 18, padding: '24px 20px',
            background: 'var(--bg1)', border: `1.5px solid ${DELTA_BORDER}`,
            boxShadow: '0 20px 60px rgba(0,0,0,0.7)', textAlign: 'center',
          }}>
            <div style={{ fontSize: 38, marginBottom: 10 }}>🔶</div>
            <div style={{ fontWeight: 900, fontSize: 15, color: DELTA_COLOR, marginBottom: 6 }}>
              No Patterns for {timeframe}
            </div>
            <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)', lineHeight: 1.7, marginBottom: 18 }}>
              No active patterns are set for <b style={{ color: DELTA_COLOR }}>{timeframe}</b> on Delta India.<br/>
              Build a pattern and enable this TF.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={() => { setNoPatternWarn(false); onGoToPatterns?.() }} style={{
                width: '100%', padding: '12px', borderRadius: 10, cursor: 'pointer',
                fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 12,
                border: `1.5px solid ${DELTA_BORDER}`, background: DELTA_DIM, color: DELTA_COLOR,
              }}>🔬 Open Patterns</button>
              <button onClick={() => setNoPatternWarn(false)} style={{
                width: '100%', padding: '10px', borderRadius: 10, cursor: 'pointer',
                fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 11,
                border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text3)',
              }}>Dismiss</button>
            </div>
          </div>
        </>
      )}

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 12, padding: '10px 12px', borderRadius: 12,
        background: DELTA_DIM, border: `1.5px solid ${DELTA_BORDER}`,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ fontSize: 18 }}>🔶</span>
            <div>
              <div style={{ fontWeight: 900, fontSize: 14, color: DELTA_COLOR }}>Delta Exchange India</div>
              <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', marginTop: 1 }}>
                {loadingSyms
                  ? 'Loading symbols…'
                  : symFailed
                    ? '⚠ Symbol load failed'
                    : symFallback
                      ? `⚠ Using ${symbols.length} fallback symbols (proxy unavailable)`
                      : `${symbols.length} perpetuals · USDT · Delta India`}
              </div>
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>
            {activeScanners.length} pattern{activeScanners.length !== 1 ? 's' : ''} active
          </div>
          {lastScan && (
            <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', marginTop: 1 }}>
              Last: {timeSince(lastScan)}
            </div>
          )}
        </div>
      </div>

      {/* TF selector */}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 10 }}>
        {TF_LIST.map(tf => (
          <button key={tf} onClick={() => setTimeframe(tf)} style={{
            padding: '5px 11px', borderRadius: 8, cursor: 'pointer',
            fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 700,
            border: `1.5px solid ${timeframe === tf ? DELTA_COLOR : 'var(--border)'}`,
            background: timeframe === tf ? DELTA_DIM : 'var(--bg2)',
            color: timeframe === tf ? DELTA_COLOR : 'var(--text3)',
            transition: 'all .15s',
          }}>{tf}</button>
        ))}
      </div>

      {/* Scan button + progress */}
      <div style={{ marginBottom: 12 }}>
        {scanning ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
              <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: DELTA_COLOR }}>
                🔶 Scanning Delta… {progressSym}
              </span>
              <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{progress}%</span>
            </div>
            <div style={{ height: 4, borderRadius: 2, background: 'var(--bg3)', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 2,
                background: DELTA_COLOR,
                width: `${Math.max(2, progress)}%`,
                transition: 'width .3s',
                boxShadow: `0 0 8px ${DELTA_COLOR}`,
              }} />
            </div>
            <button onClick={() => { abortRef.current?.abort(); scanningRef.current = false; setScanning(false) }}
              style={{
                marginTop: 7, width: '100%', padding: '8px', borderRadius: 8, cursor: 'pointer',
                fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 11,
                border: '1px solid rgba(255,60,60,0.4)', background: 'rgba(255,60,60,0.08)', color: 'var(--red)',
              }}>⏹ Stop</button>
          </div>
        ) : (
          <button
            onClick={runScan}
            disabled={loadingSyms || symbols.length === 0}
            style={{
              width: '100%', padding: '12px', borderRadius: 10, cursor: 'pointer',
              fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 13,
              border: `1.5px solid ${DELTA_BORDER}`,
              background: DELTA_DIM, color: DELTA_COLOR,
              opacity: (loadingSyms || symbols.length === 0) ? 0.5 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            <span style={{ fontSize: 16 }}>▶</span>
            {loadingSyms ? 'Loading symbols…' : `Scan ${symbols.length} Delta Perpetuals · ${timeframe}`}
          </button>
        )}
      </div>

      {/* Stats row */}
      {alerts.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
          {[
            { label: 'Total', val: alerts.length, col: DELTA_COLOR },
            { label: '🟢 Bull', val: alerts.filter(a=>a.side==='bull').length, col: 'var(--green)' },
            { label: '🔴 Bear', val: alerts.filter(a=>a.side==='bear').length, col: 'var(--red)'   },
          ].map(s => (
            <div key={s.label} style={{
              padding: '4px 10px', borderRadius: 7,
              background: `${s.col}14`, border: `1px solid ${s.col}44`,
              fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700, color: s.col,
            }}>{s.label}: {s.val}</div>
          ))}
          <button onClick={() => setAlerts([])} style={{
            marginLeft: 'auto', padding: '4px 10px', borderRadius: 7, cursor: 'pointer',
            fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700,
            border: '1px solid rgba(255,60,60,0.3)', background: 'rgba(255,60,60,0.07)', color: 'var(--red)',
          }}>Clear</button>
        </div>
      )}

      {/* Alert list */}
      {alerts.length === 0 && !scanning && (
        <div style={{ textAlign: 'center', padding: '32px 16px' }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>🔶</div>
          <div style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--text3)', lineHeight: 1.7 }}>
            No Delta India signals yet.<br/>
            Tap Scan to run your patterns on {symbols.length} perpetuals.
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {alerts.map(a => {
          const isBull = a.side === 'bull'
          const col    = isBull ? 'var(--green)' : 'var(--red)'
          const bd     = isBull ? 'rgba(0,200,100,0.35)' : 'rgba(255,60,80,0.35)'
          const bg     = isBull ? 'rgba(0,230,118,0.05)' : 'rgba(255,60,80,0.05)'
          const isOpen = expandedIds.has(a.id)
          const base   = a.symbol.replace('USDT','')

          return (
            <div key={a.id} style={{
              borderRadius: 11, border: `1.5px solid ${bd}`, background: bg,
              overflow: 'hidden', transition: 'all .15s',
            }}>
              {/* Row */}
              <div
                onClick={() => toggleExpand(a.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', cursor: 'pointer' }}
              >
                <span style={{ fontSize: 17, flexShrink: 0 }}>{a.scannerIcon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 800, fontSize: 13, color: col }}>{base}</span>
                    <span style={{ fontSize: 8, fontFamily: 'var(--mono)', fontWeight: 700,
                      padding: '1px 5px', borderRadius: 4,
                      background: DELTA_DIM, color: DELTA_COLOR, border: `1px solid ${DELTA_BORDER}` }}>
                      DELTA
                    </span>
                    <span style={{ fontSize: 8, fontFamily: 'var(--mono)', fontWeight: 700,
                      padding: '1px 5px', borderRadius: 4,
                      background: `${col}15`, color: col, border: `1px solid ${col}40` }}>
                      {a.timeframe}
                    </span>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 1 }}>{a.scannerName}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>
                    {timeSince(a.time)}
                  </div>
                  {a.details?.close && (
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', marginTop: 1 }}>
                      ${fmt(a.details.close)}
                    </div>
                  )}
                </div>
                <span style={{ color: 'var(--text3)', fontSize: 11 }}>{isOpen ? '▲' : '▼'}</span>
              </div>

              {/* Expanded details */}
              {isOpen && (
                <div style={{ padding: '8px 11px 11px', borderTop: `1px solid ${bd}`, background: 'rgba(0,0,0,0.1)' }}>
                  {a.details && Object.entries(a.details)
                    .filter(([k]) => !['time'].includes(k))
                    .map(([k,v]) => (
                      <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                        <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{k}</span>
                        <span style={{ fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--text2)' }}>
                          {typeof v === 'number' ? fmt(v) : String(v)}
                        </span>
                      </div>
                    ))
                  }
                  <a
                    href={tvUrl(a.symbol, a.timeframe)}
                    target="_blank" rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      marginTop: 8, padding: '6px 12px', borderRadius: 7,
                      fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700,
                      border: '1px solid rgba(33,150,243,0.4)',
                      background: 'rgba(33,150,243,0.1)', color: '#2196f3',
                      textDecoration: 'none',
                    }}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                    </svg>
                    View on TradingView
                  </a>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Error count */}
      {errors.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', textAlign: 'center' }}>
          {errors.length} symbol{errors.length !== 1 ? 's' : ''} failed to fetch
        </div>
      )}
    </div>
  )
}
