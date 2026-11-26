// ─── Delta Exchange India Scanner ─────────────────────────────────────────────
// Dedicated scanner for Delta India perpetuals.
// Supports: Scan / Auto / Loop modes, scan-mode pills, dedup, sort, vol filter.

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { fetchDeltaSymbols, fetchDeltaCandles, DELTA_FALLBACK_SYMBOLS as DELTA_FALLBACK_SYMBOLS_IMPORT } from '../utils/deltaScanner.js'
import { compilePattern } from './PatternBuilder.jsx'
import { requiredCandleCount } from '../utils/patternEngine.js'
import { historyAddAlerts } from '../utils/history.js'
import { onAuthChanged, loadNotificationCooldownsFromCloud, saveNotificationCooldownsToCloud } from '../firebase.js'
import { intervalToMs, sendTelegram, buildTelegramMsg, fmt, timeSince, fmtVol, fetchCandles } from '../utils/scanner.js'
import { createLiveCandles } from '../utils/liveCandles.js'
import { acquireScannerSlot } from '../utils/scanCoordinator.js'
import { showLocalScannerNotification } from '../utils/webPush.js'
import { DEFAULT_GROUPS } from './sections/CustomPairsSection.jsx'

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

const DELTA_RESULTS_KEY = 'cs_delta_results_v1'
const DELTA_RESULTS_CAP = 300
// Persist notification cooldowns across reloads so restarting the app does not
// immediately resend a signal that was already notified within its cooldown.
const DELTA_DEDUP_KEY = 'cs_delta_notification_cooldowns_v1'

function loadDedupCooldowns() {
  try {
    const saved = JSON.parse(localStorage.getItem(DELTA_DEDUP_KEY) || '{}')
    const now = Date.now()
    return Object.fromEntries(
      Object.entries(saved).filter(([, expiresAt]) => Number(expiresAt) > now)
    )
  } catch { return {} }
}

function saveDedupCooldowns(cooldowns) {
  try {
    const now = Date.now()
    const active = Object.entries(cooldowns)
      .filter(([, expiresAt]) => Number(expiresAt) > now)
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, 5000)
    localStorage.setItem(DELTA_DEDUP_KEY, JSON.stringify(Object.fromEntries(active)))
  } catch (err) {
    console.warn('[DeltaScanner] Could not persist notification cooldowns', err)
  }
}

function deltaResultKey(a) {
  // Normalize identity values so the same signal is recognized consistently
  // in every timeframe tab, including older saved rows with scannerName only.
  const symbol = String(a?.symbol || '').trim().toUpperCase()
  const timeframe = String(a?.timeframe || '').trim().toLowerCase()
  const pattern = String(a?.scannerId ?? a?.scannerName ?? '').trim().toLowerCase()
  const side = String(a?.side || '').trim().toLowerCase()
  return [String(a?.exchange || 'delta').trim().toLowerCase(), symbol, timeframe, pattern, side].join('__')
}

function normalizeDeltaResults(items) {
  const unique = new Map()
  for (const item of (Array.isArray(items) ? items : [])) {
    if (!item?.symbol || !item?.timeframe || !(item?.scannerId || item?.scannerName)) continue
    const key = deltaResultKey(item)
    const old = unique.get(key)
    if (!old || Number(item.lastSeen || item.time || 0) >= Number(old.lastSeen || old.time || 0)) {
      unique.set(key, {
        ...item,
        scannerId: item.scannerId ?? old?.scannerId ?? item.scannerName,
        id: old?.id ?? item.id ?? key,
        firstSeen: old?.firstSeen ?? item.firstSeen ?? item.time,
        lastSeen: Math.max(Number(old?.lastSeen || old?.time || 0), Number(item.lastSeen || item.time || 0)),
      })
    }
  }
  return [...unique.values()].sort((a,b) => Number(b.lastSeen || b.time || 0) - Number(a.lastSeen || a.time || 0)).slice(0, DELTA_RESULTS_CAP)
}

function loadDeltaResults(tf) {
  try {
    const saved = JSON.parse(localStorage.getItem(DELTA_RESULTS_KEY) || '{}')
    return normalizeDeltaResults(saved[tf] || [])
  } catch { return [] }
}

function saveDeltaResults(tf, items) {
  try {
    const saved = JSON.parse(localStorage.getItem(DELTA_RESULTS_KEY) || '{}')
    saved[tf] = normalizeDeltaResults(items)
    localStorage.setItem(DELTA_RESULTS_KEY, JSON.stringify(saved))
  } catch (err) {
    console.warn('[DeltaScanner] Could not persist results', err)
  }
}

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
      <div style={{display:'flex', alignItems:'center', gap:9, marginBottom:10, paddingRight:25}}>
        <span style={{fontSize:25, flexShrink:0}}>{a.scannerIcon}</span>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:'flex',alignItems:'center',gap:7,flexWrap:'wrap'}}>
            <span style={{fontSize:17,fontWeight:900,color:col,lineHeight:1.2}}>{a.scannerName}</span>
            <span style={{fontSize:10,fontWeight:900,padding:'4px 10px',borderRadius:8,background:isBull?'rgba(0,230,118,.12)':'rgba(255,60,80,.12)',color:col,border:`1px solid ${col}66`}}>{isBull?'BULL':'BEAR'}</span>
          </div>
          <div style={{fontSize:11,color:'var(--text3)',fontFamily:'var(--mono)',marginTop:3}}>{base}/USDT · {a.timeframe} · {timeSince(a.time)}</div>
        </div>
        <TvIcon symbol={a.symbol} timeframe={a.timeframe} sz={31}/>
      </div>
      {a.details?.run?.length >= 2 && (
        <div style={{marginBottom:9}}>
          <div style={{fontSize:10,fontFamily:'var(--mono)',letterSpacing:'.12em',color:'var(--text3)',marginBottom:6}}>CANDLE CHART</div>
          <MiniCandleChart candles={a.details.run} timeframe={a.details.chartTimeframe || a.timeframe}/>
        </div>
      )}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:5,marginBottom:8}}>
        {[
          ['PRICE',a.details?.close != null ? fmt(a.details.close) : '—','var(--text)'],
          ['EMA 9',a.details?.ema9 != null ? fmt(a.details.ema9) : '—','#4dabf7'],
          ['EMA 20',a.details?.ema20 != null ? fmt(a.details.ema20) : '—','#b388ff'],
          ['EMA 40',a.details?.ema40 != null ? fmt(a.details.ema40) : '—','#aab2bd'],
        ].map(([label,value,color])=>(
          <div key={label} style={{borderRadius:8,padding:'7px 6px',background:'rgba(0,0,0,.22)',border:'1px solid rgba(255,255,255,.08)',minWidth:0}}>
            <div style={{fontSize:8,fontFamily:'var(--mono)',color,marginBottom:3,fontWeight:800}}>{label}</div>
            <div style={{fontWeight:800,fontSize:11,color:'var(--text)',fontFamily:'var(--mono)',overflow:'hidden',textOverflow:'ellipsis'}}>{value}</div>
          </div>
        ))}
      </div>
      {a.details?.rsi14 != null && <div style={{fontSize:10,color:'var(--text3)',fontFamily:'var(--mono)'}}>RSI 14 <b style={{color:'#b388ff'}}>{a.details.rsi14.toFixed(1)}</b></div>}
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

// ── Mini candle chart with EMA overlay + RSI panel ────────────────────────────
function MiniCandleChart({ candles, timeframe = '15m' }) {
  if (!candles || candles.length < 2) return null

  const W = 420, CH = 210, RH = 78, PAD = 9, GAP = 9
  const TH = CH + GAP + RH  // total height

  // ── Candle chart ────────────────────────────────────────────────────────────
  const minP = Math.min(...candles.map(c => c.low))
  const maxP = Math.max(...candles.map(c => c.high))
  const rng  = maxP - minP || 1
  const toY  = p => PAD + (1 - (p - minP) / rng) * (CH - PAD * 2)
  const cw   = (W - PAD * 2) / candles.length
  const bw   = Math.max(1.5, cw * 0.68)
  const cx   = (i) => PAD + i * cw + cw / 2

  // Price labels
  const priceFmt = (v) => v >= 1000 ? v.toLocaleString('en-US',{maximumFractionDigits:0})
    : v >= 1 ? v.toFixed(2) : v.toPrecision(3)

  // ── RSI panel ───────────────────────────────────────────────────────────────
  const RY0 = CH + GAP  // top of RSI panel
  const rsiVals = candles.map(c => c.rsi14).filter(v => v != null)
  const hasRsi  = rsiVals.length >= 2
  const toRY = (v) => RY0 + PAD/2 + (1 - (v - 0) / 100) * (RH - PAD)

  // EMA paths helper
  const emaPath = (key, color, sw = 1.2, op = 0.9) => {
    const pts = candles.map((c,i) => c[key] != null ? `${cx(i)},${toY(c[key])}` : null)
    const segments = []
    let seg = []
    for (const p of pts) {
      if (p) { seg.push(p) }
      else if (seg.length > 1) { segments.push(seg); seg = [] }
    }
    if (seg.length > 1) segments.push(seg)
    return segments.map((s,i) => (
      <polyline key={i} points={s.join(' ')}
        fill="none" stroke={color} strokeWidth={sw} opacity={op} strokeLinejoin="round"/>
    ))
  }

  const last = candles[candles.length - 1]
  const tfMinutes = ({'1m':1,'3m':3,'5m':5,'15m':15,'30m':30,'1h':60,'4h':240,'1d':1440,'Day':1440})[timeframe] || 15
  const mult = tfMinutes < 15 ? 15 / tfMinutes : 1
  const emaDefs = tfMinutes < 15
    ? [
        {key:`ema${9*mult}`,label:`EMA ${9*mult}`,color:'#4dabf7'},
        {key:`ema${20*mult}`,label:`EMA ${20*mult}`,color:'#b388ff'},
        {key:`ema${40*mult}`,label:`EMA ${40*mult}`,color:'#aab2bd'},
        {key:`ema${5*mult}`,label:`EMA ${5*mult} · 15m EMA 5`,color:'#ff5252'},
      ]
    : [
        {key:'ema9',label:'EMA 9',color:'#4dabf7'},
        {key:'ema20',label:'EMA 20',color:'#b388ff'},
        {key:'ema40',label:'EMA 40',color:'#aab2bd'},
      ]
  const visibleEmaDefs = emaDefs.filter(def => last?.[def.key] != null)

  return (
    <div style={{width:'100%',minWidth:0,borderRadius:10,overflow:'hidden',background:'rgba(0,0,0,0.3)'}}>
      <svg width="100%" viewBox={`0 0 ${W} ${TH}`} preserveAspectRatio="xMidYMid meet" style={{display:'block',width:'100%',height:'auto',maxWidth:'100%'}}>
        {/* ── Candle chart background ── */}
        <rect x={0} y={0} width={W} height={CH} fill="rgba(0,0,0,0.0)"/>

        {/* Grid lines */}
        {[0.25, 0.5, 0.75].map(f => (
          <line key={f} x1={PAD} y1={PAD + f*(CH-PAD*2)} x2={W-PAD} y2={PAD + f*(CH-PAD*2)}
            stroke="rgba(255,255,255,0.05)" strokeWidth={1}/>
        ))}

        {/* Price labels right side */}
        {[0, 0.5, 1].map(f => {
          const price = maxP - f * rng
          return (
            <text key={f} x={W - 2} y={PAD + f*(CH-PAD*2) + 3}
              fontSize={7} fill="rgba(255,255,255,0.25)" textAnchor="end" fontFamily="monospace">
              {priceFmt(price)}
            </text>
          )
        })}

        {/* EMA lines */}
        {visibleEmaDefs.map(def => emaPath(def.key, def.color, 1.5, 0.92))}

        {/* Candles */}
        {candles.map((c, i) => {
          const bull = c.close >= c.open
          const col  = bull ? '#00e676' : '#ff4757'
          const x    = PAD + i * cw + (cw - bw) / 2
          const bTop = toY(Math.max(c.open, c.close))
          const bBot = toY(Math.min(c.open, c.close))
          const bH   = Math.max(1, bBot - bTop)
          return (
            <g key={i}>
              <line x1={cx(i)} y1={toY(c.high)} x2={cx(i)} y2={toY(c.low)}
                stroke={col} strokeWidth={1} opacity={0.6}/>
              <rect x={x} y={bTop} width={bw} height={bH} fill={col} rx={1}/>
            </g>
          )
        })}

        {/* EMA legend */}
        {visibleEmaDefs.length > 0 && (
          <g>
            {visibleEmaDefs.map((def,i) => {
              const x = PAD + i * (W - PAD*2) / visibleEmaDefs.length
              return <g key={def.key}>
                <line x1={x} y1={CH-10} x2={x+12} y2={CH-10} stroke={def.color} strokeWidth={1.8}/>
                <text x={x+15} y={CH-7} fontSize={7.5} fill={def.color} fontFamily="monospace">{def.label}</text>
              </g>
            })}
          </g>
        )}

        {/* ── RSI panel ── */}
        {hasRsi && (
          <>
            {/* Panel background */}
            <rect x={0} y={RY0} width={W} height={RH} fill="rgba(0,0,0,0.2)"/>
            <line x1={0} y1={RY0} x2={W} y2={RY0} stroke="rgba(255,255,255,0.08)" strokeWidth={1}/>

            {/* RSI zones */}
            {/* Overbought 70 */}
            <line x1={PAD} y1={toRY(70)} x2={W-PAD} y2={toRY(70)}
              stroke="rgba(255,71,87,0.3)" strokeWidth={0.8} strokeDasharray="3,3"/>
            {/* Oversold 30 */}
            <line x1={PAD} y1={toRY(30)} x2={W-PAD} y2={toRY(30)}
              stroke="rgba(0,230,118,0.3)" strokeWidth={0.8} strokeDasharray="3,3"/>
            {/* Mid 50 */}
            <line x1={PAD} y1={toRY(50)} x2={W-PAD} y2={toRY(50)}
              stroke="rgba(255,255,255,0.08)" strokeWidth={0.8}/>

            {/* RSI labels */}
            <text x={W-2} y={toRY(70)+3} fontSize={6} fill="rgba(255,71,87,0.5)" textAnchor="end" fontFamily="monospace">70</text>
            <text x={W-2} y={toRY(30)+3} fontSize={6} fill="rgba(0,230,118,0.5)" textAnchor="end" fontFamily="monospace">30</text>
            <text x={PAD}  y={RY0+8}    fontSize={6} fill="rgba(255,255,255,0.3)" fontFamily="monospace">RSI</text>

            {/* RSI line */}
            <polyline
              points={candles.map((c,i) => c.rsi14 != null ? `${cx(i)},${toRY(c.rsi14)}` : null).filter(Boolean).join(' ')}
              fill="none" stroke="#b388ff" strokeWidth={1.5} strokeLinejoin="round" opacity={0.9}/>

            {/* Current RSI value */}
            {last?.rsi14 != null && (
              <text x={W-PAD-2} y={RY0+8} fontSize={7} textAnchor="end" fontFamily="monospace"
                fill={last.rsi14 > 70 ? '#ff4757' : last.rsi14 < 30 ? '#00e676' : '#b388ff'}>
                {last.rsi14.toFixed(1)}
              </text>
            )}
          </>
        )}
      </svg>
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
            <a href="https://t.me/" target="_blank" rel="noopener noreferrer" style={{fontSize:11,color:CY}}>Telegram</a>
            <button onClick={onClose} aria-label="Close details" title="Close" style={{
              width:30, height:30, borderRadius:8, flexShrink:0, cursor:'pointer',
              display:'flex', alignItems:'center', justifyContent:'center',
              background:'var(--bg2)', border:'1px solid var(--border2)',
              color:'var(--text2)', fontSize:20, fontWeight:700, lineHeight:1,
            }}>×</button>
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
              <MiniCandleChart candles={d.run} timeframe={d.chartTimeframe || a.timeframe}/>
            </div>
          )}

          {/* Stat grid */}
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:12}}>
            {a.dailyChangePct != null && <StatBox label="24H CHANGE" value={Number(a.dailyChangePct).toFixed(2)+'%'}/>}
            {a.hourlyChangePct != null && <StatBox label="1H CHANGE" value={Number(a.hourlyChangePct).toFixed(2)+'%'}/>}
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
  settings, update, saveNowWithPatch, isActive, scanReady = true,
  onGoToPatterns, onAlertCount, timeframe: tfProp,
  triggerAutoScan,
}) {
  // Per-tab settings keys
  const tfKey       = k => `delta_${k}_${tfProp}`
  const scanMode    = settings[tfKey('scanMode')]     ?? 'all'
  const dedupInt    = settings.dedupInterval ?? '15m'
  const resultFilter= settings.defaultResultFilter ?? 'all'
  const volumeFilter= settings.volumeFilter ?? 'all'
  const sortBy      = settings.defaultSort       ?? 'time'
  const sortDir     = settings.defaultSortDir    ?? 'desc'
  const viewMode    = settings.defaultViewMode   ?? 'list'
  const setTfSetting = (k, v) => update({ [({volumeFilter:'volumeFilter',dedupInt:'dedupInterval',sortBy:'defaultSort',sortDir:'defaultSortDir',viewMode:'defaultViewMode',resultFilter:'defaultResultFilter'})[k] || tfKey(k)]: v })

  // Ephemeral state
  const [timeframe,   setTimeframe]   = useState(tfProp || '15m')
  const [symbols,     setSymbols]     = useState([])
  const [loadingSyms, setLoadingSyms] = useState(false)
  const [symFailed,   setSymFailed]   = useState(false)
  const [symFallback, setSymFallback] = useState(false)
  const [scanning,    setScanning]    = useState(false)
  const [progress,    setProgress]    = useState(0)
  const [progressSym, setProgressSym] = useState('')
  const [alerts,      setAlerts]      = useState(() => loadDeltaResults(tfProp || '15m'))
  const [errors,      setErrors]      = useState([])
  const [lastScan,    setLastScan]    = useState(null)
  const [scanReport,setScanReport] = useState(null)
  const autoEnabled = settings.autoScan ?? true
  const loopMode = settings.loopScan ?? false
  const [loopCount,   setLoopCount]   = useState(0)
  const [nextScanAt,  setNextScanAt]  = useState(null)
  const [singleSym,   setSingleSym]   = useState('')
  const [selected,    setSelected]    = useState(null)
  useEffect(() => {
    if (!isActive) return
    const q = new URLSearchParams(window.location.search)
    if (q.get('signal') !== '1' || q.get('timeframe') !== tfProp) return
    const symbol = q.get('symbol')
    if (!symbol || !/^[A-Za-z0-9:_./-]{1,80}$/.test(symbol)) return
    const side = /^(sell|bear)$/i.test(q.get('side')||'') ? 'bear' : 'bull'
    const scannerName = q.get('scannerName') || 'Scanner signal'
    const existing = alerts.find(a=>a.symbol===symbol && a.side===side && a.scannerName===scannerName)
    const number = k => q.get(k) && Number.isFinite(Number(q.get(k))) ? Number(q.get(k)) : null
    const alert = existing || {symbol,timeframe:tfProp,side,scannerName,time:number('time')||Date.now(),scannerIcon:side==='bull'?'🟢':'🔴',dailyChangePct:number('dailyChangePct'),hourlyChangePct:number('hourlyChangePct'),details:{}}
    setSelected(alert)
    window.history.replaceState(window.history.state,'',window.location.pathname)
    if (!alert.details?.run && symbol!=='WEBPUSH') {
      const chartTimeframe = ['1m','3m','5m'].includes(tfProp)?'5m':tfProp
      fetchDeltaCandles(symbol,chartTimeframe,520).then(candles=>{
        if(candles?.length>=2) setSelected(prev=>prev===alert?{...prev,details:{...prev.details,run:candles.slice(-28),chartTimeframe}}:prev)
      }).catch(()=>{})
    }
  }, [isActive,tfProp])
  const [noPatWarn,   setNoPatWarn]   = useState(false)
  const shownMissingPatternModalRef = useRef(false)
  const [selPatterns,  setSelPatterns]  = useState(new Set()) // selected pattern name filter
  const [activeCategoryId, setActiveCategoryId] = useState('crypto')
  const [customCryptoLimit, setCustomCryptoLimit] = useState(settings.customCryptoLimit || 30)
  const [dailyCryptoTop, setDailyCryptoTop] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cs_daily_crypto_top_v1') || 'null') } catch { return null }
  })
  const [creatingCustomList, setCreatingCustomList] = useState(false)
  const [customPanel, setCustomPanel] = useState('preset')
  const [selectedAssetIds, setSelectedAssetIds] = useState(() => new Set(settings.customPairs || []))
  const [showCustomPicker, setShowCustomPicker] = useState(false)
  const [manualAssetList, setManualAssetList] = useState('')
  const [manualAssetError, setManualAssetError] = useState('')
  const [assetSearch, setAssetSearch] = useState('')
  const [showPasteAssets, setShowPasteAssets] = useState(false)
  const [cachedAssetSymbols, setCachedAssetSymbols] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cs_custom_asset_catalog_v1') || '[]') } catch { return [] }
  })

  const [customListName, setCustomListName] = useState(settings.activeCustomListName || 'My Custom List')
  const [listNameError, setListNameError] = useState('')
  const [deleteListName, setDeleteListName] = useState(null)
  const savedCustomLists = Array.isArray(settings.namedCustomLists) ? settings.namedCustomLists : []
  const saveNamedList = () => {
    const name = customListName.trim()
    if (!name || name.length > 60) { setListNameError('Enter a list name (1–60 characters).'); return }
    const pairs = [...selectedAssetIds].filter(Boolean)
    if (!pairs.length) { setListNameError('Select at least one asset first.'); return }
    const oldName = creatingCustomList ? '' : settings.activeCustomListName
    if (savedCustomLists.some(item => item.name === name && item.name !== oldName)) { setListNameError('This list name already exists. Choose another name.'); return }
    const other = savedCustomLists.filter(item => item.name !== oldName && item.name !== name)
    update({ namedCustomLists: [...other, { name, pairs }], activeCustomListName: name,
      customPairs: pairs, customSelectionType:'namedList', selectedAssetGroupIds: assetGroups.filter(g=>(g.assets||[]).some(a=>selectedAssetIds.has(a.scanSymbol||a.id))).map(g=>g.id) })
    setListNameError('')
    setCreatingCustomList(false)
    setShowCustomPicker(false)
    setAssetSearch('')
  }

  const deleteNamedList = name => {
    const remaining = savedCustomLists.filter(item => item.name !== name)
    const wasActive = settings.activeCustomListName === name
    update({
      namedCustomLists: remaining,
      ...(wasActive ? {activeCustomListName: '', customPairs: [], selectedAssetGroupIds: []} : {}),
    })
    if (wasActive) { setCustomListName(''); setSelectedAssetIds(new Set()) }
    setDeleteListName(null)
    setListNameError('')
  }

  const assetGroups = useMemo(() => {
    const saved = Array.isArray(settings.assetGroups) ? settings.assetGroups : []
    const builtIns = DEFAULT_GROUPS.map(def => {
      const existing = saved.find(group => group.id === def.id)
      return existing ? {
        ...def, ...existing,
        assets: [
          ...def.assets.map(base => {
            const savedAsset = (existing.assets || []).find(a => a.id === base.id || a.symbol === base.symbol)
            return savedAsset ? { ...base, ...savedAsset, scanSymbol: savedAsset.scanSymbol || base.scanSymbol, status: base.scanSymbol ? 'supported' : (savedAsset.status || base.status) } : base
          }),
          ...(existing.assets || []).filter(a => !def.assets.some(base => base.id === a.id || base.symbol === a.symbol)),
        ],
      } : def
    })
    return [...builtIns, ...saved.filter(group => !DEFAULT_GROUPS.some(def => def.id === group.id))]
  }, [settings.assetGroups])
  const assetCatalog = useMemo(() => {
    const entries = [
      ...cachedAssetSymbols.map(symbol => ({symbol, label:symbol})),
      ...symbols.map(item => ({symbol:item.symbol, label:item.symbol})),
      ...assetGroups.flatMap(group => (group.assets||[]).filter(item=>item.scanSymbol).map(item=>({
        symbol:item.scanSymbol,label:item.symbol || item.scanSymbol,market:group.name,
      }))),
    ]
    const unique = new Map()
    entries.forEach(item=>{if(item.symbol)unique.set(item.symbol.toUpperCase(),item)})
    return [...unique.values()].sort((a,b)=>a.label.localeCompare(b.label)||a.symbol.localeCompare(b.symbol))
  }, [cachedAssetSymbols,symbols,assetGroups])
  useEffect(() => {
    const known = [...new Set(assetCatalog.map(item=>item.symbol))].slice(0,2000)
    try { localStorage.setItem('cs_custom_asset_catalog_v1',JSON.stringify(known)) } catch {}
  }, [assetCatalog])
  const matchingAssets = useMemo(() => {
    const query=assetSearch.trim().toUpperCase()
    if(!query)return []
    return assetCatalog.filter(item=>item.symbol.toUpperCase().includes(query)||item.label.toUpperCase().includes(query)||item.market?.toUpperCase().includes(query)).slice(0,80)
  },[assetSearch,assetCatalog])

  const activeAssetGroup = activeCategoryId === '__all__'
    ? { id:'__all__', name:'All Categories', assets:assetGroups.flatMap(group => group.assets || []) }
    : assetGroups.find(group => group.id === activeCategoryId) || assetGroups[0]

  const abortRef    = useRef(null)
  const loopRef     = useRef(false)
  const scanningRef = useRef(false)
  const seenRef     = useRef(loadDedupCooldowns())
  const cooldownUidRef = useRef(null)
  const cooldownSaveTimerRef = useRef(null)
  useEffect(() => {
    let active = true
    let unsubscribe
    onAuthChanged(async user => {
      if (!active) return
      cooldownUidRef.current = user?.uid || null
      if (!user?.uid) return
      const cloud = await loadNotificationCooldownsFromCloud(user.uid)
      if (!active || cooldownUidRef.current !== user.uid || !cloud) return
      const merged = { ...loadDedupCooldowns(), ...cloud }
      const now = Date.now()
      seenRef.current = Object.fromEntries(Object.entries(merged).filter(([, expiry]) => Number(expiry) > now))
      saveDedupCooldowns(seenRef.current)
    }).then(fn => { unsubscribe = fn })
    return () => { active = false; unsubscribe?.(); clearTimeout(cooldownSaveTimerRef.current) }
  }, [])
  const liveCandlesRef = useRef(null)
  useEffect(() => {
    if (!isActive || typeof WebSocket === 'undefined') return
    const live = createLiveCandles()
    liveCandlesRef.current = live
    return () => { live.close(); liveCandlesRef.current = null }
  }, [isActive, timeframe])
  const cacheRef    = useRef({})
  const inflightRef = useRef(new Map())
  const providerPauseRef = useRef({})
  const idRef       = useRef(0)
  const timerRef    = useRef(null)
  const patternRefreshTimerRef = useRef(null)
  const patternRefreshPendingRef = useRef(false)
  const previousPatternsRef = useRef(settings.customPatterns)
  const settingsRef = useRef(settings)
  useEffect(() => { settingsRef.current = settings }, [settings])
  useEffect(() => { saveDeltaResults(timeframe, alerts) }, [timeframe, alerts])

  // Clear results across all mounted timeframe tabs without stopping scanners.
  useEffect(() => {
    const clear = () => { setAlerts([]); setSelected(null) }
    window.addEventListener('coinsniper:clear-results', clear)
    return () => window.removeEventListener('coinsniper:clear-results', clear)
  }, [])

  // Notify parent of current alert count (consistent with TFScannerTab)
  useEffect(() => {
    onAlertCount?.(timeframe, alerts.length)
  }, [alerts.length, timeframe, onAlertCount])

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
  useEffect(() => { const id=setInterval(loadSymbols,60 * 60 * 1000); return ()=>clearInterval(id) }, [loadSymbols])
  // Daily snapshot of ranked 24h USDT turnover. Keep the last valid snapshot if the provider fails.
  useEffect(() => {
    if (!symbols.length || symFallback || loadingSyms) return
    const now = Date.now()
    if (dailyCryptoTop?.updatedAt && now - dailyCryptoTop.updatedAt < 24 * 60 * 60 * 1000) return
    const ranked = [...symbols].filter(s=>s.symbol?.endsWith('USDT') && Number(s.volume)>0)
      .sort((a,b)=>Number(b.volume)-Number(a.volume)).map(s=>s.symbol)
    if (!ranked.length) return
    const snapshot = {updatedAt:now,symbols:ranked}
    setDailyCryptoTop(snapshot)
    try { localStorage.setItem('cs_daily_crypto_top_v1',JSON.stringify(snapshot)) } catch {}
    if (settingsRef.current.customSelectionType === 'cryptoPreset') {
      const limit = Number(settingsRef.current.customCryptoLimit) || 30
      const pairs = ranked.slice(0,limit)
      update({customPairs:pairs})
      setSelectedAssetIds(new Set(pairs))
    }
  }, [symbols,symFallback,loadingSyms,dailyCryptoTop?.updatedAt])
  const rankedCryptoSymbols = useMemo(() => {
    const ranked = dailyCryptoTop?.symbols || []
    return ranked.length ? ranked : symbols.filter(s=>Number(s.volume)>0).sort((a,b)=>Number(b.volume)-Number(a.volume)).map(s=>s.symbol)
  }, [dailyCryptoTop,symbols])
  const applyCryptoPreset = count => {
    setActiveCategoryId('crypto')
    setCustomCryptoLimit(count)
    const pairs=rankedCryptoSymbols.slice(0,count)
    setSelectedAssetIds(new Set(pairs))
    update({customCryptoLimit:count,customSelectionType:'cryptoPreset',customPairs:pairs,activeCustomListName:'',
      selectedAssetGroupIds:[]})
  }


  // ── Active patterns ──────────────────────────────────────────────────────────
  const activePatterns = useMemo(() => {
    const modeFilter = scanMode === 'bull' || scanMode === 'bear' ? scanMode : null
    return (settings.customPatterns || [])
      .filter(p =>
        p.enabled && // lock/unlock only controls Pattern Builder visibility, never scan eligibility
        Array.isArray(p.tfs) && p.tfs.includes(timeframe) &&
        p.conditions.some(c => c.enabled) &&
        (!modeFilter || p.side === modeFilter)
      )
      .map(p => ({ id:p.id, name:p.name, side:p.side, icon:p.icon||(p.side==='bull'?'🟢':'🔴'), conditions: p.conditions.filter(c => c.enabled), logic:compilePattern(p) }))
      .filter(p => p.logic !== null)
  }, [settings.customPatterns, timeframe, scanMode])

  // Alert once on entry when this timeframe has no active conditions.
  // Dismissing the modal hides it, but the compact warning stays visible.
  useEffect(() => {
    if (activePatterns.length) {
      shownMissingPatternModalRef.current = false
      setNoPatWarn(false)
      return
    }
    if (!isActive || !scanReady || shownMissingPatternModalRef.current) return
    shownMissingPatternModalRef.current = true
    setNoPatWarn(true)
  }, [activePatterns.length, isActive, scanReady])

  // ── Candle cache (60s TTL) ───────────────────────────────────────────────────
  async function fetchCached(symbol, tf, limit, ticker = null) {
    const provider = String(symbol).startsWith('STOCK:') ? 'stock' : String(symbol).startsWith('ITICK:') ? 'commodity' : 'crypto'
    const pause = providerPauseRef.current[provider]
    if (pause && Date.now() < pause.until) throw new Error(pause.reason)
    const key = `${symbol}__${tf}`
    const requestedLimit = Math.max(3, Number(limit) || 60)
    const now = Date.now()
    const hit = cacheRef.current[key]
    if (provider === 'crypto') {
      liveCandlesRef.current?.watch(symbol, tf)
      const live = hit && liveCandlesRef.current?.merge(symbol, tf, hit.candles)
      if (live && live.length >= requestedLimit) return live.slice(-requestedLimit)
    }
    if (hit && now < hit.expiresAt && hit.candles.length >= requestedLimit) {
      const change24h = Number(ticker?.dailyChangePct ?? ticker?.priceChangePercent)
      if (Number.isFinite(change24h)) for (const candle of hit.candles) candle.change24h = change24h
      return hit.candles.slice(-requestedLimit)
    }
    // Share simultaneous requests for the same symbol/timeframe across patterns.
    if (inflightRef.current.has(key)) {
      const pending = inflightRef.current.get(key)
      if (pending.limit >= requestedLimit) {
        const candles = await pending.promise
        return candles?.slice(-requestedLimit) || null
      }
      // A larger request is needed; do not reuse an undersized candle response.
    }
    const request = (async () => {
      // Delta perpetuals use the Bybit feed; only stocks/metals use the generic proxy.
      const fetchLimit = Math.max(requestedLimit, hit?.candles?.length || 0)
      const candles = (String(symbol).startsWith('STOCK:') || String(symbol).startsWith('ITICK:'))
        ? await fetchCandles(symbol, tf, fetchLimit, ticker)
        : await fetchDeltaCandles(symbol, tf, fetchLimit, ticker)
      const ttlMap = {'1m':60_000,'2m':120_000,'3m':180_000,'5m':300_000,'10m':600_000}
      const ttl = Math.min(ttlMap[settingsRef.current.cacheTtl || '1m'] || 60_000, intervalToMs(settingsRef.current.scanInterval || '3m'))
      if (candles && (!cacheRef.current[key] || cacheRef.current[key].expiresAt <= Date.now() || cacheRef.current[key].candles.length <= candles.length)) cacheRef.current[key] = { candles, expiresAt: Date.now() + ttl }
      return candles
    })()
    const inflightEntry = {promise:request,limit:Math.max(requestedLimit,hit?.candles?.length||0)}
    inflightRef.current.set(key, inflightEntry)
    try { const candles = await request; return candles?.slice(-requestedLimit) || null } catch (error) {
      const message = String(error?.message || 'Market data unavailable')
      if (provider !== 'crypto' && /not configured|API_KEY|429|rate limit|credits|quota/i.test(message)) {
        providerPauseRef.current[provider] = { until: Date.now() + 120_000, reason: message }
      }
      throw error
    } finally { if (inflightRef.current.get(key) === inflightEntry) inflightRef.current.delete(key) }
  }

  // ── Dedup ────────────────────────────────────────────────────────────────────
  function isDupe(symbol, scannerId, side) {
    // Cooldown is per coin + timeframe + pattern + direction.
    const key = `delta__${symbol}__${timeframe}__${scannerId}__${side || 'any'}`
    const now = Date.now()
    const exp = Number(seenRef.current[key] || 0)
    if (exp > now) return true
    seenRef.current[key] = now + intervalToMs(dedupInt)
    saveDedupCooldowns(seenRef.current)
    if (cooldownUidRef.current) {
      clearTimeout(cooldownSaveTimerRef.current)
      const uid = cooldownUidRef.current
      const snapshot = { ...seenRef.current }
      cooldownSaveTimerRef.current = setTimeout(() => {
        if (cooldownUidRef.current === uid) saveNotificationCooldownsToCloud(uid, snapshot)
      }, 250)
    }
    return false
  }

  // ── Core scan ────────────────────────────────────────────────────────────────
  // ── Core scan engine ─────────────────────────────────────────────────────────
  // runScan is stored in a ref so auto/loop effects never recreate on every render.
  // All state reads go through refs (settingsRef, etc.) to avoid stale closures.
  const runScan = useCallback(async (symOverride) => {
    if (scanningRef.current) return
    if (activePatterns.length === 0) { setNoPatWarn(true); return }

    const cfg      = settingsRef.current
    const scanMode = cfg[`delta_scanMode_${timeframe}`] ?? 'all'

    let symList
    if (symOverride) {
      symList = symOverride
    } else if (scanMode === 'custom') {
      symList = [...new Set(cfg.customPairs || [])].map(s => ({ symbol: s }))
    } else {
      // All/Bull/Bear share the same Settings-driven asset universe.
      const countBySet = { top30: 30, top100: 100, top200: 200, top250: 250, top500: 500 }
      const count = countBySet[cfg.symbolSet] || Infinity
      const bySymbol = new Map(symbols.map(s=>[s.symbol,s]))
      const crypto = [...new Set([...rankedCryptoSymbols,...symbols.map(s=>s.symbol)])].map(s=>bySymbol.get(s)).filter(Boolean).slice(0,count)
      const mixed = cfg.allAssetScope === 'mixed'
        ? [...new Set(assetGroups.flatMap(g => g.assets || []).map(a => a.scanSymbol).filter(s => s && (s.startsWith('STOCK:') || s.startsWith('ITICK:'))))].map(symbol => ({ symbol }))
        : []
      symList = [...crypto, ...mixed]
    }
    if (!symList || symList.length === 0) return

    // ── Start ────────────────────────────────────────────────────────────────
    abortRef.current  = new AbortController()
    scanningRef.current = true
    setScanning(true)
    setProgress(0)
    setErrors([])
    // Keep existing results in Auto and Loop modes; repeated signals update in place.
    // All timeframe panes stay mounted. Share a small number of scan slots
    // so switching tabs does not stop the previous timeframe or overload APIs.
    setProgressSym('Waiting for scan slot…')
    const releaseScanSlot = await acquireScannerSlot(abortRef.current.signal)
    if (!releaseScanSlot) {
      scanningRef.current = false
      setScanning(false)
      setProgressSym('')
      return
    }
    try {
    const CONCURRENCY = Math.max(2, Math.min(12, Number(cfg.concurrency) || 12))
    // Adaptive worker limit: start conservatively, expand on healthy responses,
    // and back off on rate limits/timeouts without changing the user's configured cap.
    let activeLimit = Math.min(CONCURRENCY, 4)
    let healthySamples = 0
    let lastThrottleAt = 0
    const scanStartedAt = performance.now()
    const scanMetrics = { requests:0, failures:0, throttles:0, cacheHits:0 }
    const recordResponse = (elapsed, error = null) => {
      scanMetrics.requests++
      const message = String(error?.message || '')
      const throttled = /429|rate.limit|too.many.requests|timeout|timed.out|abort/i.test(message)
      if (error) scanMetrics.failures++
      if (throttled) {
        scanMetrics.throttles++
        activeLimit = Math.max(2, Math.floor(activeLimit / 2))
        healthySamples = 0
        lastThrottleAt = Date.now()
      } else if (!error && elapsed < 1800 && Date.now() - lastThrottleAt > 5000) {
        healthySamples++
        if (healthySamples >= Math.max(8, activeLimit * 3) && activeLimit < CONCURRENCY) {
          activeLimit++
          healthySamples = 0
        }
      }
    }
    const baseConditions = activePatterns.flatMap(pattern => (pattern.conditions || []).filter(cond => !cond.htfTf || cond.htfTf === timeframe))
    const baseCandleCount = requiredCandleCount(baseConditions)
    const htfConditionsByTf = new Map()
    for (const pattern of activePatterns) for (const cond of (pattern.conditions || [])) {
      if (cond.enabled === false || !cond.htfTf || cond.htfTf === timeframe) continue
      if (!htfConditionsByTf.has(cond.htfTf)) htfConditionsByTf.set(cond.htfTf, [])
      htfConditionsByTf.get(cond.htfTf).push(cond)
    }
    let lastProgressUpdate = 0
    const updateScanProgress = () => {
      const now = Date.now()
      if (done === symList.length || now - lastProgressUpdate >= 150) {
        lastProgressUpdate = now
        setProgress(Math.round(done / symList.length * 100))
      }
    }
    const newAlerts   = []
    const newErrors   = []
    let cursor = 0, done = 0, validSymbols = 0, failedSymbols = 0, matched = 0, missingHtf = 0

    async function worker(workerId) {
      while (true) {
        while (cursor < symList.length && workerId >= activeLimit && !abortRef.current.signal.aborted) {
          await new Promise(resolve => setTimeout(resolve, 150))
        }
        if (abortRef.current.signal.aborted) return
        const idx = cursor++
        if (idx >= symList.length) return

        const symObj = symList[idx]
        const sym    = symObj?.symbol || symObj
        const symVol = parseFloat(symObj?.volume ?? 0)
        setProgressSym(sym)

        const requestStarted = performance.now()
        try {
          const candles = await fetchCached(sym, timeframe, baseCandleCount, symObj)
          if (!candles || candles.length < 10) throw new Error('Insufficient valid candle history')
          recordResponse(performance.now() - requestStarted)
          validSymbols++
          if (abortRef.current.signal.aborted) break

          // HTF candles needed by any condition
          const htfMap = { [timeframe]: candles }
          await Promise.all([...htfConditionsByTf.entries()].map(async ([tf, conditions]) => {
            try {
              const higherCandles = await fetchCached(sym, tf, requiredCandleCount(conditions), symObj)
              if (higherCandles?.length >= 2) htfMap[tf] = higherCandles
            } catch (error) { recordResponse(performance.now()-requestStarted,error) }
          }))

          for (const sc of activePatterns) {
            if (abortRef.current.signal.aborted) break
            if (sc.conditions.some(cond=>cond.htfTf && !htfMap[cond.htfTf])) { missingHtf++; continue }
            const result = sc.logic(candles, htfMap)
            if (!result) continue

            // Signals on 1m/3m/5m all use a consistent 5m candle chart.
            // Scanner evaluation itself remains on the selected timeframe.
            const chartTimeframe = ['1m','3m','5m'].includes(timeframe) ? '5m' : timeframe
            let chartCandles = candles.slice(-28)
            if (chartTimeframe !== timeframe || chartTimeframe === '5m') {
              try {
                const fiveMinuteCandles = await fetchCached(sym, '5m', 520, symObj)
                if (fiveMinuteCandles?.length >= 2) chartCandles = fiveMinuteCandles.slice(-28)
                else if (chartTimeframe !== timeframe) chartCandles = null
              } catch { if (chartTimeframe !== timeframe) chartCandles = null }
            }
            const chartDetails = chartCandles
              ? { ...result, run: chartCandles, chartTimeframe }
              : { ...result, run: null, chartTimeframe }

            let hourlyChangePct = null
            try {
              const hourlyCandles = await fetchCached(sym, '1h', 2)
              const lastHour = hourlyCandles?.[hourlyCandles.length - 1]
              if (lastHour?.open > 0 && lastHour?.close > 0) {
                hourlyChangePct = ((lastHour.close - lastHour.open) / lastHour.open) * 100
              }
            } catch {}

            if (abortRef.current.signal.aborted) break
            matched++
            const now = Date.now()
            const a = {
              id: [ 'delta', sym, timeframe, sc.id, sc.side ].join('__'),
              exchange: 'delta', symbol: sym, timeframe,
              time: now, lastSeen: now, scannerId: sc.id, scannerName: sc.name,
              scannerIcon: sc.icon, side: sc.side, details: chartDetails, volume: symVol,
              dailyChangePct: Number.isFinite(Number(symObj?.dailyChangePct)) ? Number(symObj.dailyChangePct) : null,
              hourlyChangePct,
            }

            // Upsert one row per coin + timeframe + pattern + direction.
            setAlerts(prev => {
              const key = deltaResultKey(a)
              const existing = prev.find(x => deltaResultKey(x) === key)
              const updated = {
                ...a,
                id: existing?.id ?? a.id,
                firstSeen: existing?.firstSeen ?? existing?.time ?? now,
              }
              return normalizeDeltaResults([updated, ...prev.filter(x => deltaResultKey(x) !== key)])
            })

            // Notification cooldown is independent: refresh the row every scan,
            // but only send Telegram after the configured dedup interval.
            const notifyCfg = settingsRef.current
            if ((notifyCfg.webPushOn || (notifyCfg.tgOn && notifyCfg.tgToken && notifyCfg.tgChatId)) && !isDupe(sym, sc.id, sc.side)) {
              newAlerts.push(a)
              if (notifyCfg.webPushOn) showLocalScannerNotification(a, () => settingsRef.current.webPushOn).catch(error => console.warn('[CoinSniper] Local notification failed:', error.message))
            }
            historyAddAlerts([a])
          }
        } catch (error) {
          failedSymbols++
          recordResponse(performance.now() - requestStarted, error)
          const reason = String(error?.message || 'Data unavailable').slice(0, 110)
          if (!newErrors.some(x => x.reason === reason)) newErrors.push({ symbol: sym, reason })
        }

        done++
        updateScanProgress()
        await new Promise(r => setTimeout(r, 0)) // yield to browser
      }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, (_, index) => worker(index)))
    console.info('[CoinSniper] Scan performance', {timeframe,assets:symList.length,elapsedMs:Math.round(performance.now()-scanStartedAt),maxWorkers:CONCURRENCY,finalWorkers:activeLimit,...scanMetrics})

    // ── Scan complete ─────────────────────────────────────────────────────────
    setScanReport({total:symList.length,valid:validSymbols,failed:failedSymbols,matched,missingHtf,aborted:abortRef.current.signal.aborted})
    setLastScan(Date.now())
    setProgress(-1)
    setProgressSym('')
    scanningRef.current = false
    setScanning(false)
    if (newErrors.length) setErrors(newErrors)

    // Telegram notifications
    const tgCfg = settingsRef.current
    if (newAlerts.length > 0 && tgCfg.tgOn && tgCfg.tgToken && tgCfg.tgChatId) {
      for (const a of newAlerts.slice(0, 5)) {
        sendTelegram(tgCfg.tgToken, tgCfg.tgChatId, buildTelegramMsg(a)).catch(() => {})
      }
    }

    // Loop: schedule next cycle immediately after completion
    if (loopRef.current) {
      setLoopCount(c => c + 1)
      // Small 300ms breath between loop cycles, then immediately restart
      setTimeout(() => { if (loopRef.current) runScanRef.current(symOverride) }, 300)
    }
    } finally {
      // Release even if any scan worker throws, so other TFs never deadlock.
      releaseScanSlot()
      if (scanningRef.current) {
        scanningRef.current = false
        setScanning(false)
        setProgress(-1)
      }
      if (patternRefreshPendingRef.current && settingsRef.current.autoScan) {
        patternRefreshPendingRef.current = false
        setTimeout(() => { if (!scanningRef.current) runScanRef.current() }, 700)
      }
    }
  }, [activePatterns, symbols, timeframe, dedupInt, assetGroups, rankedCryptoSymbols]) // eslint-disable-line

  // Keep runScan ref always current so effects/timers never call stale version
  const runScanRef = useRef(runScan)
  useEffect(() => { runScanRef.current = runScan }, [runScan])

  // Auto ON means ALL timeframes that have enabled patterns continue to run,
  // regardless of the visible tab, Builder or Settings. No overlap per TF;
  // the shared queue limits overall concurrency across TFs.
  const wasAutoRunningRef = useRef(false)
  const readyToScan = activePatterns.length > 0 &&
    (scanMode === 'custom' ? (settings.customPairs || []).length > 0 : symbols.length > 0)
  const autoRunEnabled = scanReady && readyToScan && (autoEnabled || loopMode)
  useEffect(() => {
    const newlyArmed = !wasAutoRunningRef.current
    wasAutoRunningRef.current = autoRunEnabled
    if (!autoRunEnabled) {
      clearTimeout(timerRef.current)
      setNextScanAt(null)
      return
    }
    let cancelled = false
    const repeatMs = loopMode ? 1000 : intervalToMs(settings.scanInterval || '3m')
    const schedule = ms => {
      if (cancelled) return
      setNextScanAt(Date.now() + ms)
      timerRef.current = setTimeout(async () => {
        if (cancelled) return
        if (scanningRef.current) { schedule(700); return }
        setNextScanAt(null)
        try {
          await runScanRef.current()
        } catch (error) {
          console.error('[CoinSniper] Scan cycle failed', error)
          scanningRef.current = false
          setScanning(false)
        }
        if (!cancelled) schedule(repeatMs)
      }, ms)
    }
    const stagger = ['1m','3m','5m','15m','30m','1h','4h','1d'].indexOf(timeframe) * 1000
    const startupMs = settings.scanOnLoad === false
      ? repeatMs
      : (newlyArmed ? 1800 + Math.max(0, stagger) : repeatMs)
    schedule(startupMs)
    return () => { cancelled = true; clearTimeout(timerRef.current); setNextScanAt(null) }
  }, [autoRunEnabled, loopMode, settings.scanOnLoad, settings.scanInterval, timeframe])

  // Pattern changes affect scanning without resetting the Auto countdown
  // and without cancelling a scan that is already checking market data.
  useEffect(() => {
    if (previousPatternsRef.current === settings.customPatterns) return
    previousPatternsRef.current = settings.customPatterns
    clearTimeout(patternRefreshTimerRef.current)
    if (!autoRunEnabled) return
    patternRefreshTimerRef.current = setTimeout(() => {
      if (scanningRef.current) patternRefreshPendingRef.current = true
      else runScanRef.current().catch(error => console.error('[CoinSniper] Pattern refresh scan failed', error))
    }, 1500)
    return () => clearTimeout(patternRefreshTimerRef.current)
  }, [settings.customPatterns, autoRunEnabled])

  // Changing the visible tab only affects the UI. Keep Auto/Loop scans alive.
  useEffect(() => {
    if (!isActive && !autoEnabled && !loopMode) {
      abortRef.current?.abort()
      loopRef.current = false
    }
  }, [isActive, autoEnabled, loopMode])

  function stopScan() {
    loopRef.current = false
    abortRef.current?.abort()
    update({autoScan:false,loopScan:false})
    clearTimeout(timerRef.current); setNextScanAt(null)
  }
  function toggleLoop(on) {
    if (!on) abortRef.current?.abort()
    update({loopScan:on,...(on?{autoScan:false}:{})})
  }
  function toggleAuto() {
    if (autoEnabled) stopScan()
    else update({autoScan:true,loopScan:false})
  }

  function toggleSort(col) {
    if (sortBy === col) setTfSetting('sortDir', sortDir === 'asc' ? 'desc' : 'asc')
    else { setTfSetting('sortBy', col); setTfSetting('sortDir', 'desc') }
  }

  const volMin = VOLUME_FILTERS.find(f => f.id === volumeFilter)?.min ?? 0

  const filteredAlerts = useMemo(() => [...alerts]
    .filter(a =>
      (volMin === 0 || (a.volume ?? 0) >= volMin) &&
      (selPatterns.size === 0 || selPatterns.has(a.scannerName))
    )
    .sort((x, y) => {
      let c = 0
      if (sortBy === 'time')    c = x.time - y.time
      if (sortBy === 'symbol')  c = x.symbol.localeCompare(y.symbol)
      if (sortBy === 'pattern') c = (x.scannerName||'').localeCompare(y.scannerName||'')
      if (sortBy === 'gain')    c = (parseFloat(x.details?.gainPct) || 0) - (parseFloat(y.details?.gainPct) || 0)
      if (sortBy === 'volume')  c = (x.volume ?? 0) - (y.volume ?? 0)
      return sortDir === 'desc' ? -c : c
    })
  , [alerts, sortBy, sortDir, volMin, selPatterns])

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
            <div style={{fontWeight:900, fontSize:15, color:'#ff9b9e', marginBottom:6}}>No active conditions · {timeframe}</div>
            <div style={{fontSize:11, fontFamily:'var(--mono)', color:'var(--text2)', lineHeight:1.7, marginBottom:18}}>
              Add a pattern with at least one enabled condition to scan this timeframe.
            </div>
            <button onClick={() => { setNoPatWarn(false); onGoToPatterns?.(timeframe) }} style={{
              width:'100%', padding:'12px', borderRadius:10, cursor:'pointer', marginBottom:8,
              fontFamily:'var(--mono)', fontWeight:800, fontSize:12,
              border:`1.5px solid ${DB}`, background:DD, color:DC,
            }}>+ Add Pattern</button>
            <button onClick={() => setNoPatWarn(false)} style={{
              width:'100%', padding:'10px', borderRadius:10, cursor:'pointer',
              fontFamily:'var(--mono)', fontWeight:700, fontSize:11,
              border:'1px solid var(--border)', background:'var(--bg2)', color:'var(--text3)',
            }}>Dismiss</button>
          </div>
        </>
      )}

      {/* Auto applies to every enabled pattern timeframe, not only this view. */}
      {autoEnabled && !loopMode && (
        <div role="status" style={{
          marginBottom: 9, padding: '7px 10px', borderRadius: 8,
          border: '1px solid rgba(96,217,146,.33)',
          background: 'rgba(46,164,104,.07)',
          color: 'var(--text2)', fontSize: 10, lineHeight: 1.55,
          display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center',
        }}>
          <b style={{ color: '#71dfa0' }}>● AUTO ON</b>
          <span>All enabled TFs · Every {settings.scanInterval || '3m'} after each scan · Tab switches do not stop Auto</span>
        </div>
      )}

      {/* Persistent compact warning when this timeframe has no scan conditions. */}
      {scanReady && activePatterns.length === 0 && (
        <div role="alert" style={{
          padding: '10px 11px', marginBottom: 10, borderRadius: 10,
          background: 'rgba(239,100,106,.09)', border: '1px solid rgba(239,100,106,.42)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          gap: 9, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 11, color: '#ffadb1', fontWeight: 750 }}>
            ⚠ {timeframe}: No enabled conditions
          </span>
          <button onClick={() => setNoPatWarn(true)} style={{
            border: '1px solid rgba(239,100,106,.55)', background: 'rgba(239,100,106,.12)',
            borderRadius: 7, cursor: 'pointer', padding: '7px 10px', fontSize: 11,
            fontWeight: 800, color: '#ffd2d5',
          }}>+ Add Pattern</button>
        </div>
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
          const customCount = isCustom && settings.customSelectionType==='cryptoPreset' && !settings.activeCustomListName ? (settings.customCryptoLimit || customCryptoLimit) : null
          return (
            <button key={m.id} onClick={() => {
              if (isCustom) {
                setSelectedAssetIds(new Set(settingsRef.current.customPairs || []))
                setActiveCategoryId('crypto')
                setCustomPanel('preset')
                setTfSetting('scanMode', 'custom')
                setShowCustomPicker(v => !v)
              } else {
                setShowCustomPicker(false)
                setTfSetting('scanMode', m.id)
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
              {isCustom && customCount != null && customCount > 0 && (
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
        {savedCustomLists.map(item=><button key={item.name} title={item.name}
          onClick={()=>{
            setTfSetting('scanMode','custom')
            setCustomPanel('lists')
            setCreatingCustomList(false)
            setShowCustomPicker(true)
            setCustomListName(item.name)
            setSelectedAssetIds(new Set(item.pairs||[]))
            update({activeCustomListName:item.name,customPairs:item.pairs||[],customSelectionType:'namedList'})
          }}
          style={{flexShrink:0,maxWidth:165,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',
            padding:'5px 10px',borderRadius:20,cursor:'pointer',fontSize:11,
            border:settings.activeCustomListName===item.name?'1.5px solid var(--green2)':'1px solid var(--border)',
            background:settings.activeCustomListName===item.name?'var(--green-dim)':'var(--bg2)',
            color:settings.activeCustomListName===item.name?'var(--green)':'var(--text2)'}}>
          {item.name}
        </button>)}
        <button title="Create new custom list" aria-label="Create new custom list"
          onClick={()=>{
            setTfSetting('scanMode','custom')
            setShowCustomPicker(true)
            setCreatingCustomList(true)
            setCustomPanel('lists')
            setCustomListName('')
            setSelectedAssetIds(new Set())
            setAssetSearch('')
            setShowPasteAssets(false)
            setListNameError('')
          }}
          style={{flexShrink:0,padding:'5px 11px',borderRadius:20,cursor:'pointer',fontSize:16,fontWeight:800,
            border:'1.5px solid var(--green2)',background:'var(--green-dim)',color:'var(--green)'}}>＋</button>
      </div>

      {/* Custom asset category picker */}
      {scanMode === 'custom' && showCustomPicker && (
        <div style={{marginBottom:12,padding:12,borderRadius:12,background:'var(--bg1)',border:'1px solid var(--border)'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,marginBottom:9}}>
            <div style={{fontSize:12,fontWeight:800,color:PU}}>{customPanel==='lists'?'Custom List Manager':'Choose Asset Category'}</div>
            <button onClick={()=>setShowCustomPicker(false)} aria-label="Close custom list panel" style={{border:0,background:'transparent',color:'var(--text2)',cursor:'pointer',fontSize:17}}>×</button>
          </div>
          {customPanel==='lists' && <>
          <div style={{display:'flex',alignItems:'center',gap:7,flexWrap:'wrap',marginBottom:8}}>
            <input aria-label="Custom list name" value={customListName} maxLength={60}
              onChange={e=>{setCustomListName(e.target.value);setListNameError('')}}
              placeholder="List name · e.g. My Favorites"
              style={{flex:'1 1 155px',minWidth:0,padding:'10px 11px',borderRadius:9,background:'var(--bg2)',color:'var(--text)',border:'1px solid var(--border)',fontSize:12}}/>
            <button onClick={saveNamedList} style={{padding:'10px 13px',borderRadius:9,cursor:'pointer',border:'1px solid var(--green2)',background:'var(--green-dim)',color:'var(--green)',fontSize:11,fontWeight:800}}>
              {creatingCustomList?'✓ Create List':'✓ Save Changes'}
            </button>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:7,flexWrap:'wrap',marginBottom:8}}>
            <span style={{fontSize:11,color:'var(--text2)',flex:'1 1 90px'}}>{selectedAssetIds.size} assets selected</span>
            <span style={{fontSize:10,fontWeight:800,color:'var(--text2)'}}>Saved Lists ({savedCustomLists.length})</span>
            <button onClick={()=>setShowPasteAssets(v=>!v)} style={{padding:'6px 9px',borderRadius:7,border:'1px solid var(--border)',background:'var(--bg2)',color:'var(--text2)',fontSize:10,cursor:'pointer'}}>
              Paste Symbols {showPasteAssets?'▴':'▾'}
            </button>
          </div>
          <div style={{display:'flex',gap:5,flexWrap:'wrap',marginBottom:9}}>
            {savedCustomLists.length===0 && <span style={{fontSize:11,color:'var(--text3)'}}>No saved lists yet</span>}
            {savedCustomLists.map(item=><div key={item.name} style={{display:'inline-flex',alignItems:'center',border:'1px solid var(--border)',borderRadius:7,overflow:'hidden'}}>
              <button onClick={()=>{
                setCreatingCustomList(false);setCustomListName(item.name);setSelectedAssetIds(new Set(item.pairs||[]))
                update({customPairs:item.pairs||[],activeCustomListName:item.name,customSelectionType:'namedList'});setListNameError('')
              }} style={{padding:'6px 9px',cursor:'pointer',fontSize:10,border:0,
                background:settings.activeCustomListName===item.name?'var(--green-dim)':'var(--bg2)',color:'var(--text)'}}>
                {item.name} ({(item.pairs||[]).length})
              </button>
              <button aria-label={'Delete '+item.name} title={'Delete '+item.name} onClick={()=>setDeleteListName(item.name)}
                style={{padding:'6px 8px',border:0,borderLeft:'1px solid var(--border)',background:'var(--red-dim)',color:RD,cursor:'pointer',fontSize:11}}>✕</button>
            </div>)}
          </div>
          <div style={{marginBottom:9,padding:'8px 9px',borderRadius:9,background:'var(--bg2)',border:'1px solid var(--border)'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,marginBottom:6}}>
              <span style={{fontSize:10,fontWeight:800,color:'var(--text2)'}}>Assets in {creatingCustomList?'New List':(customListName||'Current List')}</span>
              <span style={{fontSize:10,color:'var(--green)',fontWeight:800}}>{selectedAssetIds.size}</span>
            </div>
            {selectedAssetIds.size===0
              ? <span style={{fontSize:10,color:'var(--text3)'}}>Search or paste symbols to add assets.</span>
              : <div style={{display:'flex',gap:5,flexWrap:'wrap',maxHeight:110,overflowY:'auto'}}>
                {[...selectedAssetIds].sort((a,b)=>a.localeCompare(b)).map(symbol=><button key={symbol}
                  title={'Remove '+symbol} aria-label={'Remove '+symbol}
                  onClick={()=>setSelectedAssetIds(prev=>{const next=new Set(prev);next.delete(symbol);return next})}
                  style={{display:'inline-flex',alignItems:'center',gap:6,padding:'5px 7px',borderRadius:6,cursor:'pointer',
                    border:'1px solid var(--border)',background:'var(--bg1)',color:'var(--text)',fontSize:10}}>
                  {symbol} <span style={{color:RD,fontWeight:800}}>×</span>
                </button>)}
              </div>}
          </div>
          {deleteListName && <div role="alertdialog" aria-label="Confirm delete custom list"
            style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:9,padding:8,borderRadius:7,border:'1px solid var(--red2)',background:'var(--red-dim)'}}>
            <span style={{fontSize:11,color:RD,flex:'1 1 150px'}}>Delete "{deleteListName}" permanently?</span>
            <button onClick={()=>deleteNamedList(deleteListName)} style={{padding:'6px 10px',borderRadius:6,border:'1px solid var(--red2)',background:'var(--red-dim)',color:RD,cursor:'pointer'}}>Delete</button>
            <button onClick={()=>setDeleteListName(null)} style={{padding:'6px 10px',borderRadius:6,border:'1px solid var(--border)',background:'var(--bg2)',color:'var(--text)',cursor:'pointer'}}>Cancel</button>
          </div>}
          {listNameError && <div role="alert" style={{color:RD,fontSize:11,marginBottom:8}}>{listNameError}</div>}
          </>}
          {customPanel==='preset' && <>
          {/* One compact category row: tap a preset or market to browse its assets. */}
          <div style={{display:'flex',gap:6,overflowX:'auto',paddingBottom:8,marginBottom:8,WebkitOverflowScrolling:'touch'}}>
            {[30,100,250,500].map(count=>(
              <button key={count} onClick={()=>applyCryptoPreset(count)}
                style={{flexShrink:0,padding:'8px 11px',borderRadius:8,cursor:'pointer',fontSize:11,fontWeight:700,
                  border:activeCategoryId==='crypto'&&customCryptoLimit===count?'1.5px solid var(--green)':'1px solid var(--border)',
                  background:activeCategoryId==='crypto'&&customCryptoLimit===count?'var(--green-dim)':'var(--bg2)',
                  color:activeCategoryId==='crypto'&&customCryptoLimit===count?'var(--green)':'var(--text2)'}}>
                Crypto Top {count}
              </button>
            ))}
            {assetGroups.filter(g=>g.id!=='crypto').map(group=>(
              <button key={group.id} onClick={()=>setActiveCategoryId(group.id)}
                style={{flexShrink:0,padding:'8px 11px',borderRadius:8,cursor:'pointer',fontSize:11,fontWeight:700,
                  border:activeCategoryId===group.id?'1.5px solid var(--green)':'1px solid var(--border)',
                  background:activeCategoryId===group.id?'var(--green-dim)':'var(--bg2)',
                  color:activeCategoryId===group.id?'var(--green)':'var(--text2)'}}>
                {group.name} ({(group.assets||[]).length})
              </button>
            ))}
          </div>
          <div style={{fontSize:10,color:'var(--text3)',marginBottom:7}}>
            {activeCategoryId==='crypto'?`CRYPTO TOP ${customCryptoLimit}`:(activeAssetGroup?.name||'ASSETS').toUpperCase()} · TAP TO SELECT / DESELECT
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(105px,1fr))',gap:6,maxHeight:210,overflowY:'auto',marginBottom:10}}>
            {(activeCategoryId==='crypto'
              ? rankedCryptoSymbols.slice(0,customCryptoLimit).map(symbol=>({id:symbol,symbol,scanSymbol:symbol}))
              : (activeAssetGroup?.assets||[])).map(asset=>{
              const key=asset.scanSymbol || asset.id
              const chosen=selectedAssetIds.has(key)
              return <button key={asset.id} onClick={()=>setSelectedAssetIds(prev=>{
                const next=new Set(prev);if(next.has(key))next.delete(key);else if(asset.scanSymbol)next.add(key);return next
              })} disabled={!asset.scanSymbol} style={{
                padding:'8px 9px',borderRadius:8,textAlign:'left',cursor:asset.scanSymbol?'pointer':'not-allowed',
                border:chosen?'1.5px solid var(--green)':'1px solid var(--border)',
                background:chosen?'var(--green-dim)':'var(--bg2)',color:chosen?'var(--green)':'var(--text2)',
                opacity:asset.scanSymbol?1:.55}}>
                <div style={{fontSize:11,fontWeight:800}}>{chosen?'✓ ':''}{asset.symbol}</div>
                <div style={{fontSize:9,opacity:.7,marginTop:2}}>{asset.scanSymbol?'Available':'Provider needed'}</div>
              </button>
            })}
          </div>
          <div style={{display:'flex',gap:6,justifyContent:'flex-end',marginBottom:10}}>
            <button onClick={()=>{
              const keys=(activeCategoryId==='crypto'?rankedCryptoSymbols.slice(0,customCryptoLimit):(activeAssetGroup?.assets||[]).map(a=>a.scanSymbol)).filter(Boolean)
              setSelectedAssetIds(prev=>new Set([...prev,...keys]))
            }} style={{padding:'7px 10px',borderRadius:7,border:'1px solid var(--green2)',background:'var(--green-dim)',color:'var(--green)',cursor:'pointer',fontSize:10}}>Select Visible</button>
            <button onClick={()=>{
              const keys=new Set((activeCategoryId==='crypto'?symbols.slice(0,customCryptoLimit).map(s=>s.symbol):(activeAssetGroup?.assets||[]).map(a=>a.scanSymbol)).filter(Boolean))
              setSelectedAssetIds(prev=>new Set([...prev].filter(s=>!keys.has(s))))
            }} style={{padding:'7px 10px',borderRadius:7,border:'1px solid var(--border)',background:'var(--bg2)',color:'var(--text2)',cursor:'pointer',fontSize:10}}>Clear Visible</button>
          </div>
          </>}
          {customPanel==='lists' && <div style={{marginBottom:8}}>
            <input aria-label="Search assets to add to custom list" value={assetSearch}
              onChange={e=>setAssetSearch(e.target.value)} placeholder="⌕ Search assets A–Z · BTC, AAPL, Gold..."
              style={{width:'100%',boxSizing:'border-box',padding:'11px 12px',borderRadius:9,border:'1px solid var(--border)',background:'var(--bg2)',color:'var(--text)',fontSize:12}}/>
            {assetSearch.trim() && <div style={{maxHeight:180,overflowY:'auto',marginTop:5,display:'grid',gap:4}}>
              {matchingAssets.length===0 && <div style={{fontSize:10,color:'var(--text3)',padding:8}}>No matching asset. Use Paste Symbols for manual entry.</div>}
              {matchingAssets.map(asset=><button key={asset.symbol}
                onClick={()=>setSelectedAssetIds(prev=>{const next=new Set(prev);if(next.has(asset.symbol))next.delete(asset.symbol);else next.add(asset.symbol);return next})}
                style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,padding:'8px 10px',borderRadius:7,cursor:'pointer',
                  border:selectedAssetIds.has(asset.symbol)?'1px solid var(--green2)':'1px solid var(--border)',
                  background:selectedAssetIds.has(asset.symbol)?'var(--green-dim)':'var(--bg2)',color:'var(--text)',fontSize:11,textAlign:'left'}}>
                <span>{asset.label} <span style={{opacity:.6}}>{asset.market||''}</span></span>
                <span style={{color:selectedAssetIds.has(asset.symbol)?'var(--green)':'var(--text2)',fontWeight:800}}>{selectedAssetIds.has(asset.symbol)?'✓ Added':'+ Add'}</span>
              </button>)}
            </div>}
          </div>}
          {customPanel==='lists' && showPasteAssets && <>
          <div style={{padding:9,border:'1px solid var(--border)',borderRadius:9,marginBottom:8,background:'var(--bg2)'}}>
            <div style={{fontSize:11,fontWeight:800,marginBottom:6}}>Paste symbols · comma or new line separated</div>
            <textarea value={manualAssetList} onChange={e=>{setManualAssetList(e.target.value);setManualAssetError('')}}
              placeholder={'BTCUSDT, ETHUSDT, SOLUSDT\nSTOCK:AAPL, STOCK:MSFT\nITICK:XAUUSD'}
              rows={3} style={{width:'100%',resize:'vertical',borderRadius:7,padding:9,background:'var(--bg1)',color:'var(--text)',border:'1px solid var(--border)',fontFamily:'var(--mono)',fontSize:11,boxSizing:'border-box'}}/>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,marginTop:6,flexWrap:'wrap'}}>
              <span style={{fontSize:10,color:'var(--text3)'}}>Comma, space or new line separated. Existing selections stay selected.</span>
              <button onClick={()=>{
                const tokens=manualAssetList.toUpperCase().split(/[\\s,;]+/).map(s=>s.trim()).filter(Boolean)
                const invalid=tokens.filter(s=>!(/^[A-Z0-9]+(?:[._-][A-Z0-9]+)*$/.test(s) || /^(STOCK|ITICK):[A-Z0-9]+(?:[._-][A-Z0-9]+)*$/.test(s)))
                if(invalid.length){setManualAssetError('Invalid symbols: '+invalid.slice(0,5).join(', '));return}
                if(!tokens.length){setManualAssetError('Enter at least one symbol.');return}
                setSelectedAssetIds(prev=>new Set([...prev,...tokens]))
                setManualAssetList('')
                setManualAssetError('')
              }} style={{padding:'7px 12px',borderRadius:8,border:'1px solid var(--green2)',background:'var(--green-dim)',color:'var(--green)',fontSize:11,fontWeight:800,cursor:'pointer'}}>+ Add to Selection</button>
            </div>
            {manualAssetError && <div role="alert" style={{fontSize:10,color:RD,marginTop:6}}>{manualAssetError}</div>}
          </div>
          </>}
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,marginTop:11,flexWrap:'wrap'}}>
            <span style={{fontSize:10,color:'var(--text2)'}}>✓ {selectedAssetIds.size} selected</span>
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              {customPanel==='preset' && <button onClick={() => {
                const allKeys = assetGroups.flatMap(g => (g.assets || []).filter(a => a.scanSymbol).map(a => a.scanSymbol || a.id))
                const allSelected = allKeys.length > 0 && allKeys.every(key => selectedAssetIds.has(key))
                setSelectedAssetIds(allSelected ? new Set() : new Set(allKeys))
              }} style={{padding:'8px 10px',borderRadius:8,cursor:'pointer',fontSize:10,fontWeight:800,
                border:'1px solid var(--border)',background:'var(--bg2)',color:'var(--text2)'}}>
                {assetGroups.flatMap(g => (g.assets || []).filter(a => a.scanSymbol).map(a => a.scanSymbol || a.id)).length > 0 && assetGroups.flatMap(g => (g.assets || []).filter(a => a.scanSymbol).map(a => a.scanSymbol || a.id)).every(key => selectedAssetIds.has(key)) ? 'Deselect All' : 'Select All'}
              </button>}
              <button onClick={()=>{
              if(customPanel==='lists' && creatingCustomList) {setListNameError('Name and save this new list first.');return}
              const pairs=[...selectedAssetIds].filter(Boolean)
              update({customPairs:pairs,customSelectionType:customPanel==='lists'?'namedList':'manual',...(!creatingCustomList && settings.activeCustomListName ? {namedCustomLists:savedCustomLists.map(item=>item.name===settings.activeCustomListName?{...item,pairs}:item)} : {}),selectedAssetGroupIds:assetGroups.filter(g=>(g.assets||[]).some(a=>selectedAssetIds.has(a.scanSymbol||a.id))).map(g=>g.id)})
            }} style={{padding:'8px 12px',borderRadius:8,cursor:'pointer',fontSize:10,fontWeight:800,
              border:'1px solid var(--green2)',background:'var(--green-dim)',color:'var(--green)'}}>
              Apply Selection · {selectedAssetIds.size}
              </button>
            </div>
          </div>
          <div style={{fontSize:10,fontFamily:'var(--mono)',color:'var(--text3)',marginTop:8}}>
            {activePatterns.length} patterns · {timeframe.toUpperCase()} · Custom scan
          </div>
        </div>
      )}

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
          <span>⚠ {errors.slice(0,2).map(e => typeof e === 'string' ? e : `${e.symbol}: ${e.reason}`).join(' · ')}{errors.length>2?` +${errors.length-2} more`:''}</span>
          <span onClick={() => setErrors([])} style={{cursor:'pointer', textDecoration:'underline', flexShrink:0, marginLeft:8}}>dismiss</span>
        </div>
      )}

      {/* Pattern selection chips — shown when >1 distinct pattern in results */}
      {(() => {
        const names = [...new Set(alerts.map(a => a.scannerName))].sort()
        if (names.length < 2) return null
        return (
          <div style={{ display:'flex', alignItems:'center', gap:5, overflowX:'auto', flexWrap:'nowrap',
            paddingBottom:4, WebkitOverflowScrolling:'touch', scrollbarWidth:'none',
            marginBottom:4, marginLeft:-12, marginRight:-12, paddingLeft:12, paddingRight:12,
          }}>
            <span style={{ fontSize:9, fontFamily:'var(--mono)', color:'var(--text3)', flexShrink:0, letterSpacing:'0.05em' }}>PAT</span>
            <button
              onClick={() => setSelPatterns(new Set())}
              style={{ padding:'5px 10px', borderRadius:7, cursor:'pointer', fontSize:10,
                fontFamily:'var(--mono)', flexShrink:0, whiteSpace:'nowrap',
                fontWeight: selPatterns.size===0 ? 800 : 400,
                border:`1px solid ${selPatterns.size===0 ? 'var(--accent)' : 'var(--border)'}`,
                background: selPatterns.size===0 ? 'var(--accent-dim)' : 'var(--bg2)',
                color: selPatterns.size===0 ? 'var(--accent)' : 'var(--text3)',
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
                  style={{ padding:'5px 10px', borderRadius:7, cursor:'pointer', fontSize:10,
                    fontFamily:'var(--mono)', flexShrink:0, whiteSpace:'nowrap',
                    maxWidth:120, overflow:'hidden', textOverflow:'ellipsis',
                    fontWeight: active ? 800 : 400,
                    border:`1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                    background: active ? 'var(--accent-dim)' : 'var(--bg2)',
                    color: active ? 'var(--accent)' : 'var(--text3)',
                  }}
                >{name} <span style={{opacity:0.6}}>({count})</span></button>
              )
            })}
          </div>
        )
      })()}

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
        {[['time','Time'],['symbol','Sym'],['pattern','Pat'],['gain','Gain'],['volume','Vol']].map(([col,lbl])=>(
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

      {scanReport && <div style={{padding:'8px 10px',margin:'6px 0',border:'1px solid var(--border)',borderRadius:8,fontSize:11,fontFamily:'var(--mono)',color:'var(--text2)',display:'flex',gap:8,flexWrap:'wrap'}}>
        <span>{timeframe} · {scanReport.aborted?'Stopped':'Last scan'}</span>
        <span style={{color:GR}}>Data {scanReport.valid}/{scanReport.total}</span>
        <span style={{color:scanReport.failed?RD:'var(--text3)'}}>Failed {scanReport.failed}</span>
        <span style={{color:AM}}>HTF unavailable {scanReport.missingHtf}</span>
        <span>Matches {scanReport.matched}</span><span>Visible {displayed}</span>
        {alerts.length>displayed && <button className="btn-small" onClick={()=>{update({volumeFilter:'all',defaultResultFilter:'all'});setSelPatterns(new Set())}}>Clear filters</button>}
      </div>}
      {/* ── Empty state — only before first scan or after scan with no results ── */}
      {!scanning && displayed === 0 && (
        <div style={{textAlign:'center', padding:'40px 16px'}}>
          <div style={{fontSize:36, marginBottom:10, color:DC}}>
            {scanMode==='single'?'⚡':loopMode?'🔁':autoEnabled?'⏳':'🔶'}
          </div>
          <div style={{fontSize:12, fontFamily:'var(--mono)', color:'var(--text3)', lineHeight:1.7}}>
            {scanMode==='single'?'Enter a symbol and tap Scan'
              :loopMode?`Loop #${loopCount} — scanning continuously`
              :activePatterns.length===0?'No enabled patterns for this timeframe'
              :alerts.length>0?'Signals hidden by current filters'
              :scanReport?.failed===scanReport?.total && scanReport?.total>0?'Market data unavailable — scan could not evaluate signals'
              :lastScan?'Scan complete — no visible signals'
              :autoEnabled?'Auto-scan armed · waiting for next cycle…'
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
