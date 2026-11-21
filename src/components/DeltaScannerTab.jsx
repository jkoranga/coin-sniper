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
  const dedupInt    = settings[tfKey('dedupInt')]     ?? settings.dedupInterval ?? '3m'
  const resultFilter= settings[tfKey('resultFilter')] ?? 'all'
  const volumeFilter= settings[tfKey('volumeFilter')] ?? settings.volumeFilter ?? '1m'
  const sortBy      = settings[tfKey('sortBy')]       ?? settings.defaultSort       ?? 'time'
  const sortDir     = settings[tfKey('sortDir')]      ?? settings.defaultSortDir    ?? 'desc'
  const viewMode    = settings[tfKey('viewMode')]     ?? settings.defaultViewMode   ?? 'list'
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
  const [alerts,      setAlerts]      = useState(() => loadDeltaResults(tfProp || '15m'))
  const [errors,      setErrors]      = useState([])
  const [lastScan,    setLastScan]    = useState(null)
  const [autoEnabled, setAutoEnabled] = useState(false)
  const [loopMode,    setLoopMode]    = useState(false)
  const [loopCount,   setLoopCount]   = useState(0)
  const [nextScanAt,  setNextScanAt]  = useState(null)
  const [singleSym,   setSingleSym]   = useState('')
  const [selected,    setSelected]    = useState(null)
  const [noPatWarn,   setNoPatWarn]   = useState(false)
  const [selPatterns,  setSelPatterns]  = useState(new Set()) // selected pattern name filter
  const [activeCategoryId, setActiveCategoryId] = useState('crypto')
  const [selectedAssetIds, setSelectedAssetIds] = useState(() => new Set(settings.customPairs || []))
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
  const activeAssetGroup = assetGroups.find(group => group.id === activeCategoryId) || assetGroups[0]

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
  const cacheRef    = useRef({})
  const idRef       = useRef(0)
  const timerRef    = useRef(null)
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

  // ── Candle cache (60s TTL) ───────────────────────────────────────────────────
  async function fetchCached(symbol, tf, limit, ticker = null) {
    const key = `${symbol}__${tf}__${limit}`
    const now = Date.now()
    const hit = cacheRef.current[key]
    if (hit && now < hit.expiresAt) {
      const change24h = Number(ticker?.dailyChangePct ?? ticker?.priceChangePercent)
      if (Number.isFinite(change24h)) for (const candle of hit.candles) candle.change24h = change24h
      return hit.candles
    }
    const candles = (String(symbol).startsWith('STOCK:') || String(symbol).startsWith('ITICK:') || String(symbol).endsWith('USDT'))
      ? await fetchCandles(symbol, tf, limit, ticker)
      : await fetchDeltaCandles(symbol, tf, limit, ticker)
    const ttlMap = {'1m':60_000,'2m':120_000,'3m':180_000,'5m':300_000,'10m':600_000}
    const ttl = ttlMap[settingsRef.current.cacheTtl || '3m'] || 180_000
    if (candles) cacheRef.current[key] = { candles, expiresAt: now + ttl }
    return candles
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
      symList = symbols
    }
    if (!symList || symList.length === 0) return

    // ── Start ────────────────────────────────────────────────────────────────
    abortRef.current  = new AbortController()
    scanningRef.current = true
    setScanning(true)
    setProgress(0)
    setErrors([])
    // Keep existing results in Auto and Loop modes; repeated signals update in place.

    const CONCURRENCY = cfg.concurrency || 30
    const newAlerts   = []
    const newErrors   = []
    let cursor = 0, done = 0

    async function worker() {
      while (true) {
        if (abortRef.current.signal.aborted) return
        const idx = cursor++
        if (idx >= symList.length) return

        const symObj = symList[idx]
        const sym    = symObj?.symbol || symObj
        const symVol = parseFloat(symObj?.volume ?? 0)
        setProgressSym(sym)

        try {
          const candles = await fetchCached(sym, timeframe, requiredCandleCount(activePatterns.flatMap(pattern => (pattern.conditions || []).filter(cond => !cond.htfTf || cond.htfTf === timeframe))), symObj)
          if (!candles || candles.length < 10) { done++; setProgress(Math.round(done/symList.length*100)); continue }

          // HTF candles needed by any condition
          const htfNeeded = new Set()
          for (const sc of activePatterns)
            for (const cond of (sc.conditions || []))
              if (cond.htfTf && cond.enabled !== false) htfNeeded.add(cond.htfTf)

          const htfMap = {}
          for (const tf of htfNeeded) {
            if (tf === timeframe) { htfMap[tf] = candles; continue }
            try {
              const htfConditions = activePatterns.flatMap(pattern => (pattern.conditions || []).filter(cond => cond.enabled !== false && cond.htfTf === tf))
              const c = await fetchCached(sym, tf, requiredCandleCount(htfConditions), symObj)
              if (c && c.length >= 2) htfMap[tf] = c
            } catch {}
          }

          for (const sc of activePatterns) {
            if (abortRef.current.signal.aborted) break
            const result = sc.logic(candles, htfMap)
            if (!result) continue

            // Signals on 1m/3m/5m all use a consistent 5m candle chart.
            // Scanner evaluation itself remains on the selected timeframe.
            const chartTimeframe = ['1m','3m','5m'].includes(timeframe) ? '5m' : timeframe
            let chartCandles = result.run
            if (chartTimeframe !== timeframe) {
              try {
                const fiveMinuteCandles = await fetchCached(sym, '5m', 80)
                if (fiveMinuteCandles?.length >= 2) chartCandles = fiveMinuteCandles
              } catch {}
            }
            const chartDetails = chartCandles
              ? { ...result, run: chartCandles, chartTimeframe }
              : { ...result, chartTimeframe: timeframe }

            let hourlyChangePct = null
            try {
              const hourlyCandles = await fetchCached(sym, '1h', 2)
              const lastHour = hourlyCandles?.[hourlyCandles.length - 1]
              if (lastHour?.open > 0 && lastHour?.close > 0) {
                hourlyChangePct = ((lastHour.close - lastHour.open) / lastHour.open) * 100
              }
            } catch {}

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
            if (!isDupe(sym, sc.id, sc.side)) newAlerts.push(a)
            historyAddAlerts([a])
          }
        } catch { newErrors.push(sym) }

        done++
        setProgress(Math.round(done / symList.length * 100))
        await new Promise(r => setTimeout(r, 0)) // yield to browser
      }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))

    // ── Scan complete ─────────────────────────────────────────────────────────
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
  }, [activePatterns, symbols, timeframe, dedupInt]) // eslint-disable-line

  // Keep runScan ref always current so effects/timers never call stale version
  const runScanRef = useRef(runScan)
  useEffect(() => { runScanRef.current = runScan }, [runScan])

  // ── Auto scan interval ───────────────────────────────────────────────────────
  // Pattern: scan immediately → wait interval → scan → wait → repeat
  // Uses runScanRef so this effect never re-fires when scan function changes.
  useEffect(() => {
    if (!autoEnabled || loopMode) {
      clearTimeout(timerRef.current)
      setNextScanAt(null)
      return
    }
    let cancelled = false

    const scheduleNext = () => {
      if (cancelled) return
      const ms = intervalToMs(settingsRef.current.scanInterval || '30s')
      setNextScanAt(Date.now() + ms)
      timerRef.current = setTimeout(async () => {
        if (cancelled) return
        setNextScanAt(null)
        await runScanRef.current()
        scheduleNext()
      }, ms)
    }

    ;(async () => {
      if (cancelled) return
      await runScanRef.current()
      scheduleNext()
    })()

    return () => {
      cancelled = true
      clearTimeout(timerRef.current)
      setNextScanAt(null)
    }
  }, [autoEnabled, loopMode]) // eslint-disable-line

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
          // useEffect kickoff will run the initial scan + arm the interval
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
    setNextScanAt(null); clearTimeout(timerRef.current)
  }

  function toggleLoop(on) {
    setLoopMode(on)
    if (on) { loopRef.current = true; setAutoEnabled(false); setLoopCount(0); runScan() }
    else { loopRef.current = false; abortRef.current?.abort(); scanningRef.current = false; setScanning(false) }
  }

  function toggleAuto() {
    if (autoEnabled) { stopScan() }
    else { setAutoEnabled(true) }
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
              if (isCustom) {
                setSelectedAssetIds(new Set(settingsRef.current.customPairs || []))
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

      {/* Custom asset category picker */}
      {scanMode === 'custom' && (
        <div style={{marginBottom:12,padding:12,borderRadius:12,background:'var(--bg1)',border:'1px solid var(--border)'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,marginBottom:10}}>
            <div style={{fontSize:12,fontWeight:800,color:PU}}>Choose Asset Category</div>
            <span style={{fontSize:10,color:'var(--text3)',fontFamily:'var(--mono)'}}>{(settings.customPairs||[]).length} selected</span>
          </div>
          <div style={{display:'flex',gap:7,overflowX:'auto',paddingBottom:7,marginBottom:9}}>
            {assetGroups.map(group => (
              <button key={group.id} onClick={()=>setActiveCategoryId(group.id)} style={{
                flexShrink:0,padding:'8px 11px',borderRadius:9,cursor:'pointer',whiteSpace:'nowrap',
                border:activeAssetGroup?.id===group.id?'1.5px solid var(--green)':'1px solid var(--border)',
                background:activeAssetGroup?.id===group.id?'var(--green-dim)':'var(--bg2)',
                color:activeAssetGroup?.id===group.id?'var(--green)':'var(--text2)',fontSize:11,fontWeight:800,
              }}>{group.name} <span style={{opacity:.7}}>({group.assets?.length||0})</span></button>
            ))}
          </div>
          {activeAssetGroup && (
            <>
              <div style={{fontSize:10,color:'var(--text3)',fontFamily:'var(--mono)',marginBottom:7}}>{activeAssetGroup.name.toUpperCase()} · SELECT ASSETS</div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(105px,1fr))',gap:6,maxHeight:210,overflowY:'auto'}}>
                {(activeAssetGroup.assets||[]).map(asset=>{
                  const key=asset.scanSymbol || asset.id
                  const chosen=selectedAssetIds.has(key)
                  return <button key={asset.id} onClick={()=>setSelectedAssetIds(prev=>{
                    const next=new Set(prev); if(next.has(key)) next.delete(key); else if(asset.scanSymbol) next.add(key); return next
                  })} disabled={!asset.scanSymbol} style={{
                    padding:'8px 9px',borderRadius:8,textAlign:'left',cursor:asset.scanSymbol?'pointer':'not-allowed',
                    border:chosen?'1.5px solid var(--green)':'1px solid var(--border)',
                    background:chosen?'var(--green-dim)':'var(--bg2)',color:chosen?'var(--green)':'var(--text2)',
                    opacity:asset.scanSymbol?1:.55,
                  }}>
                    <div style={{fontSize:11,fontWeight:800}}>{chosen?'✓ ':''}{asset.symbol}</div>
                    <div style={{fontSize:9,opacity:.7,marginTop:2}}>{asset.scanSymbol?(asset.scanSymbol.startsWith('ITICK:')?'iTick available':'Available'):'Provider needed'}</div>
                  </button>
                })}
              </div>
            </>
          )}
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,marginTop:11,flexWrap:'wrap'}}>
            <span style={{fontSize:9,color:'var(--text3)'}}>Selected: {selectedAssetIds.size} · Gold/Silver via iTick; other futures require a verified contract feed.</span>
            <button onClick={()=>{
              const pairs=[...selectedAssetIds].filter(Boolean)
              update({customPairs:pairs,selectedAssetGroupIds:assetGroups.filter(g=>(g.assets||[]).some(a=>selectedAssetIds.has(a.scanSymbol||a.id))).map(g=>g.id)})
            }} style={{padding:'8px 12px',borderRadius:8,cursor:'pointer',fontSize:10,fontWeight:800,
              border:'1px solid var(--green2)',background:'var(--green-dim)',color:'var(--green)'}}>
              Apply Selection · {selectedAssetIds.size}
            </button>
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
          <span>⚠ {errors.slice(0,4).join(', ')}{errors.length>4?` +${errors.length-4} more`:''}</span>
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
