import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Toggle, CandleChart } from '../UI.jsx'
import { SCANNERS, ADVANCED_SCANNERS, ALL_SCANNERS } from '../../utils/scanners.js'
import {
  fetchCandles, fetchAllUSDTSymbolsWithRetry, fetch24hTickers,
  TOP_SYMBOLS, intervalToMs, playBeep,
  sendTelegram, buildTelegramMsg, fmt, timeSince, fmtVol,
} from '../../utils/scanner.js'

// ── TradingView link ──────────────────────────────────────
const TF_MAP = {'1m':'1','3m':'3','5m':'5','15m':'15','30m':'30','1h':'60','4h':'240','1d':'D','1D':'D'}
function tvUrl(symbol, tf='15m') {
  return `https://www.tradingview.com/chart/?symbol=BINANCE:${symbol.replace('USDT','')}USDT&interval=${TF_MAP[tf]||'15'}`
}
function TvIcon({ symbol, timeframe, sz=28 }) {
  return (
    <a href={tvUrl(symbol,timeframe)} target="_blank" rel="noopener noreferrer"
      onClick={e=>e.stopPropagation()} title={`Open ${timeframe} on TradingView`}
      style={{ display:'inline-flex', alignItems:'center', justifyContent:'center',
        width:sz, height:sz, borderRadius:6, flexShrink:0,
        background:'rgba(33,150,243,0.12)', border:'1.5px solid rgba(33,150,243,0.35)',
        color:'#2196f3', textDecoration:'none', transition:'all .15s' }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
      </svg>
    </a>
  )
}

// ── Pattern colors ─────────────────────────────────────────
const PC = {
  ema_base_rev_bull_v2:   {bg:'rgba(0,230,118,0.11)',   bd:'rgba(0,210,80,0.65)',     tx:'#00e676'},
  ema_base_rev_bear_v2:   {bg:'rgba(255,50,80,0.10)',   bd:'rgba(255,50,80,0.60)',    tx:'#ff3250'},
  ema20_reversal_bull:    {bg:'rgba(0,230,118,0.10)',   bd:'rgba(0,200,100,0.60)',    tx:'#00e676'},
  ema20_reversal_bear:    {bg:'rgba(255,80,100,0.10)',  bd:'rgba(255,60,80,0.58)',    tx:'#ff5060'},
  bullish_trend_reversal: {bg:'rgba(0,255,180,0.10)',   bd:'rgba(0,220,160,0.65)',    tx:'#00ffb3'},
  bearish_trend_reversal: {bg:'rgba(255,80,180,0.10)',  bd:'rgba(255,60,160,0.60)',   tx:'#ff50b0'},
}
const gPC = id => PC[id] || {bg:'var(--bg2)',bd:'var(--border)',tx:'var(--text)'}

// ── Accordion ─────────────────────────────────────────────
function Accordion({ title, icon, badge, defaultOpen=false, children, accentColor }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{
      border:`1.5px solid ${open && accentColor ? accentColor : 'var(--border)'}`,
      borderRadius:'var(--radius)', marginBottom:10,
      background:'var(--bg1)', overflow:'hidden', transition:'border-color .2s',
    }}>
      <button onClick={() => setOpen(o=>!o)} style={{
        width:'100%', display:'flex', alignItems:'center', gap:10,
        padding:'13px 16px', background:'none', border:'none', cursor:'pointer',
        borderBottom: open ? '1px solid var(--border)' : 'none',
      }}>
        {icon && <span style={{fontSize:17}}>{icon}</span>}
        <span style={{flex:1,fontWeight:700,fontSize:14,color:'var(--text)',textAlign:'left'}}>{title}</span>
        {badge && <span style={{fontSize:9,fontFamily:'var(--mono)',fontWeight:700,padding:'2px 7px',borderRadius:8,
          letterSpacing:'.06em',background:'var(--accent-dim)',color:'var(--accent)',border:'1px solid var(--accent)'}}>{badge}</span>}
        <span style={{color:'var(--text3)',fontSize:12,display:'inline-block',transition:'transform .2s',transform:open?'rotate(180deg)':'rotate(0deg)'}}>▼</span>
      </button>
      {open && <div style={{padding:'14px'}}>{children}</div>}
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
  const pc = gPC(alert.scannerId)
  const isAdv = alert.group === 'advanced'
  return (
    <div className="detail-overlay open">
      <div className="detail-backdrop" onClick={onClose}/>
      <div className="detail-panel">
        <div className="detail-handle"/>
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:18}}>
          <span style={{fontSize:28}}>{alert.scannerIcon}</span>
          <div style={{flex:1}}>
            <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
              <div style={{fontWeight:800,fontSize:18,color:pc.tx}}>{alert.scannerName}</div>
            </div>
            <div style={{fontFamily:'var(--mono)',fontSize:12,color:'var(--text3)',marginTop:2}}>
              {alert.symbol} · {alert.timeframe} · {timeSince(alert.time)}
            </div>
          </div>
          <TvIcon symbol={alert.symbol} timeframe={alert.timeframe}/>
          <span className={`badge ${isBull?'badge-green':'badge-red'}`}>{isBull?'BULL':'BEAR'}</span>
        </div>
        {alert.details.run && (
          <div style={{background:'var(--bg2)',borderRadius:10,padding:'12px 14px',marginBottom:14}}>
            <div style={{fontSize:11,fontFamily:'var(--mono)',color:'var(--text3)',marginBottom:8}}>CANDLE CHART</div>
            <CandleChart candles={alert.details.run} width={Math.min(300,window.innerWidth-80)} height={72}/>
          </div>
        )}
        {(alert.details.ema10 || alert.details.ema9 || alert.details.ema20 || alert.details.ema40 || alert.details.rsi != null) && (
          <div style={{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap'}}>
            {alert.details.ema10 && (
              <div style={{flex:1,background:'rgba(33,150,243,0.08)',border:'1px solid rgba(33,150,243,0.3)',borderRadius:8,padding:'10px 14px',display:'flex',alignItems:'center',gap:10}}>
                <span style={{fontSize:16}}>📐</span>
                <div>
                  <div style={{fontSize:10,fontFamily:'var(--mono)',color:'#2196f3',fontWeight:700,letterSpacing:'.06em',marginBottom:2}}>EMA 10</div>
                  <div style={{fontFamily:'var(--mono)',fontWeight:900,fontSize:15,color:'var(--text)'}}>{fmt(alert.details.ema10)}</div>
                </div>
              </div>
            )}
            {alert.details.ema20 && (
              <div style={{flex:1,background:'rgba(0,210,80,0.07)',border:'1px solid rgba(0,210,80,0.28)',borderRadius:8,padding:'10px 14px',display:'flex',alignItems:'center',gap:10}}>
                <span style={{fontSize:16}}>〰️</span>
                <div>
                  <div style={{fontSize:10,fontFamily:'var(--mono)',color:'#00e676',fontWeight:700,letterSpacing:'.06em',marginBottom:2}}>EMA 20</div>
                  <div style={{fontFamily:'var(--mono)',fontWeight:900,fontSize:15,color:'var(--text)'}}>{fmt(alert.details.ema20)}</div>
                </div>
              </div>
            )}
            {alert.details.ema40 && (
              <div style={{flex:1,background:'rgba(255,180,0,0.07)',border:'1px solid rgba(255,180,0,0.28)',borderRadius:8,padding:'10px 14px',display:'flex',alignItems:'center',gap:10}}>
                <span style={{fontSize:16}}>📏</span>
                <div>
                  <div style={{fontSize:10,fontFamily:'var(--mono)',color:'var(--amber)',fontWeight:700,letterSpacing:'.06em',marginBottom:2}}>EMA 40</div>
                  <div style={{fontFamily:'var(--mono)',fontWeight:900,fontSize:15,color:'var(--text)'}}>{fmt(alert.details.ema40)}</div>
                </div>
              </div>
            )}
            {alert.details.ema80 && (
              <div style={{flex:1,background:'rgba(255,100,200,0.07)',border:'1px solid rgba(255,100,200,0.28)',borderRadius:8,padding:'10px 14px',display:'flex',alignItems:'center',gap:10}}>
                <span style={{fontSize:16}}>🎯</span>
                <div>
                  <div style={{fontSize:10,fontFamily:'var(--mono)',color:'#ff64c8',fontWeight:700,letterSpacing:'.06em',marginBottom:2}}>EMA 80</div>
                  <div style={{fontFamily:'var(--mono)',fontWeight:900,fontSize:15,color:'var(--text)'}}>{fmt(alert.details.ema80)}</div>
                </div>
              </div>
            )}
            {alert.details.rsi != null && (
              <div style={{flex:1,background:'rgba(255,160,0,0.08)',border:'1px solid rgba(255,160,0,0.3)',borderRadius:8,padding:'10px 14px',display:'flex',alignItems:'center',gap:10}}>
                <span style={{fontSize:16}}>📊</span>
                <div>
                  <div style={{fontSize:10,fontFamily:'var(--mono)',color:'#ffa000',fontWeight:700,letterSpacing:'.06em',marginBottom:2}}>RSI 14</div>
                  <div style={{fontFamily:'var(--mono)',fontWeight:900,fontSize:15,color:alert.details.rsi<30?'var(--green)':alert.details.rsi>70?'var(--red)':'var(--text)'}}>{alert.details.rsi?.toFixed(1)}</div>
                </div>
              </div>
            )}
          </div>
        )}
        <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:8,marginBottom:14}}>
          {[
            ['Candles',alert.details.candleCount],
            [isBull?'Gain':'Drop',`${isBull?'+':'-'}${alert.details.gainPct}%`],
            ['Entry',fmt(alert.details.lowestOpen)],
            ['Close',fmt(alert.details.highestClose)],
            ...(alert.ticker ? [
              ['24h Vol',fmtVol(alert.ticker.volume)],
              ['24h%',`${alert.ticker.priceChangePercent>0?'+':''}${alert.ticker.priceChangePercent?.toFixed(2)}%`],
            ] : []),
          ].map(([l,v])=>(
            <div key={l} style={{background:'var(--bg2)',borderRadius:8,padding:'10px 12px'}}>
              <div style={{fontSize:10,fontFamily:'var(--mono)',color:'var(--text3)',marginBottom:4,textTransform:'uppercase'}}>{l}</div>
              <div style={{fontFamily:'var(--mono)',fontWeight:700,fontSize:16,color:'var(--text)'}}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,fontFamily:'var(--mono)',color:'var(--text3)',marginBottom:8}}>CONDITIONS</div>
          {alert.details.conds?.map((c,i)=>(
            <div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 0',borderBottom:'1px solid var(--border)'}}>
              <span style={{color:c.startsWith('✓')?'var(--green)':'var(--amber)',fontSize:16}}>{c.startsWith('✓')?'✓':'◆'}</span>
              <span style={{fontSize:14,color:'var(--text2)'}}>{c.replace('✓ ','')}</span>
            </div>
          ))}
        </div>
        {(() => {
          const sc = ALL_SCANNERS.find(s=>s.id===alert.scannerId)
          return sc ? (
            <div style={{background:'var(--bg2)',borderRadius:10,padding:'12px 14px'}}>
              <div style={{fontSize:11,fontFamily:'var(--mono)',color:'var(--text3)',marginBottom:8}}>SCANNER RULES</div>
              <div style={{fontSize:12,color:'var(--text3)',fontFamily:'var(--mono)',marginBottom:8}}>{sc.sub}</div>
              {sc.conditions.map((c,i)=>(
                <div key={i} style={{display:'flex',gap:8,fontSize:13,color:'var(--text2)',padding:'4px 0'}}>
                  <span style={{color:pc.tx}}>◆</span><span>{c}</span>
                </div>
              ))}
            </div>
          ) : null
        })()}
        <button onClick={onClose} className="btn-secondary" style={{width:'100%',marginTop:18,justifyContent:'center',display:'flex'}}>Close</button>
      </div>
    </div>
  )
}

// ── Scanner def card ──────────────────────────────────────
function ScannerDefCard({ scanner, expanded, onTap, enabled, onToggle }) {
  const pc = gPC(scanner.id)
  const isAdv = scanner.group === 'advanced'
  return (
    <div style={{
      borderRadius:10,
      border:`2px solid ${enabled ? pc.bd : 'var(--border)'}`,
      background: enabled ? pc.bg : 'var(--bg2)',
      opacity: enabled ? 1 : 0.6, transition:'all .18s', flexShrink:0,
    }}>
      <div style={{display:'flex',alignItems:'center',gap:10,padding:'12px 14px',cursor:'pointer',minHeight:60}} onClick={onTap}>
        <span style={{fontSize:22,flexShrink:0,lineHeight:1}}>{scanner.icon}</span>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:3}}>
            <div style={{fontWeight:800,fontSize:14,color:enabled?pc.tx:'var(--text2)',letterSpacing:'-.01em',lineHeight:1.3,flexWrap:'wrap'}}>{scanner.name}</div>
          </div>
          <div style={{fontSize:11,color:'var(--text3)',fontFamily:'var(--mono)',lineHeight:1.4}}>{scanner.sub}</div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}} onClick={e=>e.stopPropagation()}>
          <span className={`badge ${scanner.badgeCls}`} style={{fontSize:9}}>{scanner.badge}</span>
          <Toggle checked={!!enabled} onChange={v=>onToggle?.(v)}/>
        </div>
        <span style={{color:'var(--text3)',fontSize:12,flexShrink:0,marginLeft:2}}>{expanded?'▲':'▼'}</span>
      </div>
      {expanded && (
        <div style={{borderTop:`1px solid ${pc.bd}`,background:'rgba(0,0,0,0.18)',padding:'10px 14px'}}>
          {scanner.conditions.map((cond,i)=>(
            <div key={i} style={{display:'flex',alignItems:'flex-start',gap:8,padding:'4px 0'}}>
              <span style={{color:pc.tx,fontSize:12,marginTop:2,flexShrink:0}}>◆</span>
              <span style={{fontSize:12,color:'var(--text2)',lineHeight:1.5}}>{cond}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Alert result card ─────────────────────────────────────
function AlertCard({ alert, onDismiss, onTap, resultFilter }) {
  const isBull = alert.side==='bull'
  const pc = gPC(alert.scannerId)
  const isAdv = alert.group === 'advanced'

  // result filter: 'all' | 'bull' | 'bear'
  if (resultFilter === 'bull' && !isBull) return null
  if (resultFilter === 'bear' && isBull) return null

  return (
    <div className="fade-in" onClick={()=>onTap(alert)} style={{
      borderRadius:14, border:`2px solid ${pc.bd}`, background:pc.bg,
      padding:'16px', cursor:'pointer', position:'relative', transition:'all .15s',
      marginBottom:2,
    }}>
      <button className="alert-card-dismiss" onClick={e=>{e.stopPropagation();onDismiss()}} style={{position:'absolute',top:10,right:10}}>×</button>

      {/* Pattern badge row */}
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
        <span style={{fontSize:24,flexShrink:0,lineHeight:1}}>{alert.scannerIcon}</span>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:'inline-flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
            <span style={{
              fontSize:11,fontWeight:800,padding:'3px 10px',borderRadius:20,
              background:`${pc.tx}22`,color:pc.tx,
              border:`1.5px solid ${pc.bd}`,fontFamily:'var(--mono)',letterSpacing:'.04em',
            }}>{alert.scannerName}</span>
            <span className={`badge ${isBull?'badge-green':'badge-red'}`} style={{fontSize:9}}>{isBull?'BULL':'BEAR'}</span>
          </div>
        </div>
        <TvIcon symbol={alert.symbol} timeframe={alert.timeframe}/>
      </div>

      {/* Symbol + meta */}
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:12}}>
        <div style={{flex:1}}>
          <div style={{fontWeight:900,fontSize:22,color:pc.tx,fontFamily:'var(--mono)',letterSpacing:'-.02em',lineHeight:1}}>{alert.symbol.replace('USDT','')}<span style={{fontSize:13,fontWeight:400,color:'var(--text3)'}}>/USDT</span></div>
          <div style={{fontSize:11,fontFamily:'var(--mono)',color:'var(--text3)',marginTop:4}}>
            {alert.timeframe} · {timeSince(alert.time)}
            {alert.ticker && <> · <span style={{color:alert.ticker.priceChangePercent>=0?'var(--green)':'var(--red)'}}>{alert.ticker.priceChangePercent>0?'+':''}{alert.ticker.priceChangePercent?.toFixed(2)}%</span> · {fmtVol(alert.ticker.volume)}</>}
          </div>
        </div>
        {alert.details.run && <CandleChart candles={alert.details.run} width={88} height={44}/>}
      </div>

      {/* Stats row */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:10}}>
        {[['Candles',alert.details.candleCount,false],[isBull?'Gain':'Drop',`${isBull?'+':'-'}${alert.details.gainPct}%`,true],['Close',fmt(alert.details.highestClose),false]].map(([l,v,colored])=>(
          <div key={l} style={{borderRadius:10,padding:'8px 10px',background:'rgba(0,0,0,0.25)',border:`1px solid ${pc.bd}`}}>
            <div style={{fontSize:9,fontFamily:'var(--mono)',color:'var(--text3)',marginBottom:4,textTransform:'uppercase',letterSpacing:'.06em'}}>{l}</div>
            <div style={{fontFamily:'var(--mono)',fontWeight:900,fontSize:14,color:colored?pc.tx:'var(--text)'}}>{v}</div>
          </div>
        ))}
      </div>

      {/* EMA / RSI row for advanced patterns */}
      {(alert.details.ema10 || alert.details.ema20 || alert.details.ema40 || alert.details.rsi != null) && (
        <div style={{display:'flex',gap:6,marginBottom:8,flexWrap:'wrap'}}>
          {alert.details.ema10 && (
            <div style={{flex:1,display:'flex',alignItems:'center',gap:6,padding:'5px 9px',borderRadius:7,background:'rgba(33,150,243,0.08)',border:'1px solid rgba(33,150,243,0.25)'}}>
              <span style={{fontSize:11,color:'#2196f3',fontFamily:'var(--mono)',fontWeight:700}}>EMA10</span>
              <span style={{fontFamily:'var(--mono)',fontSize:12,color:'var(--text)',fontWeight:700}}>{fmt(alert.details.ema10)}</span>
            </div>
          )}
          {alert.details.ema20 && (
            <div style={{flex:1,display:'flex',alignItems:'center',gap:6,padding:'5px 9px',borderRadius:7,background:'rgba(0,210,80,0.07)',border:'1px solid rgba(0,210,80,0.25)'}}>
              <span style={{fontSize:11,color:'#00e676',fontFamily:'var(--mono)',fontWeight:700}}>EMA20</span>
              <span style={{fontFamily:'var(--mono)',fontSize:12,color:'var(--text)',fontWeight:700}}>{fmt(alert.details.ema20)}</span>
            </div>
          )}
          {alert.details.ema40 && (
            <div style={{flex:1,display:'flex',alignItems:'center',gap:6,padding:'5px 9px',borderRadius:7,background:'rgba(255,180,0,0.07)',border:'1px solid rgba(255,180,0,0.25)'}}>
              <span style={{fontSize:11,color:'var(--amber)',fontFamily:'var(--mono)',fontWeight:700}}>EMA40</span>
              <span style={{fontFamily:'var(--mono)',fontSize:12,color:'var(--text)',fontWeight:700}}>{fmt(alert.details.ema40)}</span>
            </div>
          )}
          {alert.details.rsi != null && (
            <div style={{flex:1,display:'flex',alignItems:'center',gap:6,padding:'5px 9px',borderRadius:7,background:'rgba(255,160,0,0.08)',border:'1px solid rgba(255,160,0,0.25)'}}>
              <span style={{fontSize:11,color:'#ffa000',fontFamily:'var(--mono)',fontWeight:700}}>RSI</span>
              <span style={{fontFamily:'var(--mono)',fontSize:12,fontWeight:700,color:alert.details.rsi<30?'var(--green)':alert.details.rsi>70?'var(--red)':'var(--text)'}}>{alert.details.rsi?.toFixed(1)}</span>
            </div>
          )}
        </div>
      )}

      {/* Condition pills */}
      {alert.details.conds && (
        <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
          {alert.details.conds.map((cd,i)=>(
            <span key={i} style={{
              fontSize:10,padding:'3px 9px',borderRadius:6,
              background:cd.startsWith('✓')?`${pc.tx}15`:'rgba(0,0,0,0.2)',
              color:cd.startsWith('✓')?pc.tx:'var(--text3)',
              border:`1px solid ${cd.startsWith('✓')?pc.bd:'transparent'}`,
              fontFamily:'var(--mono)',
            }}>{cd}</span>
          ))}
        </div>
      )}
      <div style={{fontSize:10,fontFamily:'var(--mono)',color:'var(--text3)',marginTop:8,opacity:.6}}>Tap for details →</div>
    </div>
  )
}

// ── List row ──────────────────────────────────────────────
function ScanListItem({ alert, onDismiss, onTap, resultFilter }) {
  const isBull = alert.side==='bull'
  const pc = gPC(alert.scannerId)
  if (resultFilter === 'bull' && !isBull) return null
  if (resultFilter === 'bear' && isBull) return null

  return (
    <div className="fade-in" onClick={()=>onTap(alert)} style={{
      display:'flex',alignItems:'center',gap:10,padding:'11px 14px',
      borderRadius:12,cursor:'pointer',
      border:`2px solid ${pc.bd}`,background:pc.bg,transition:'all .15s',marginBottom:2,
    }}>
      <span style={{fontSize:20,flexShrink:0}}>{alert.scannerIcon}</span>
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:'flex',alignItems:'center',gap:7,flexWrap:'wrap',marginBottom:3}}>
          <span style={{fontWeight:900,color:pc.tx,fontFamily:'var(--mono)',fontSize:15,letterSpacing:'-.01em'}}>{alert.symbol.replace('USDT','')}<span style={{fontSize:11,fontWeight:400,color:'var(--text3)'}}>/USDT</span></span>
          <span style={{fontSize:9,fontWeight:800,padding:'2px 7px',borderRadius:5,background:`${pc.tx}20`,color:pc.tx,border:`1px solid ${pc.bd}`,fontFamily:'var(--mono)',letterSpacing:'.04em'}}>{alert.scannerName}</span>
          <span className={`badge ${isBull?'badge-green':'badge-red'}`} style={{fontSize:9}}>{isBull?'BULL':'BEAR'}</span>
        </div>
        <div style={{fontSize:11,fontFamily:'var(--mono)',color:'var(--text3)'}}>
          {alert.timeframe} · {timeSince(alert.time)} · <span style={{color:pc.tx}}>{isBull?'+':'-'}{alert.details.gainPct}%</span> · {fmt(alert.details.highestClose)}
          {alert.ticker && ` · ${fmtVol(alert.ticker.volume)}`}
          {alert.details.ema10 && <> · <span style={{color:'#2196f3'}}>EMA10: {fmt(alert.details.ema10)}</span></>}
          {alert.details.rsi != null && <> · <span style={{color:'#ffa000'}}>RSI: {alert.details.rsi?.toFixed(1)}</span></>}
        </div>
      </div>
      {alert.details.run && <CandleChart candles={alert.details.run} width={62} height={30}/>}
      <TvIcon symbol={alert.symbol} timeframe={alert.timeframe} sz={26}/>
      <button className="btn-small" onClick={e=>{e.stopPropagation();onDismiss()}} style={{padding:'4px 8px',fontSize:14,flexShrink:0}}>×</button>
    </div>
  )
}

// ── Countdown timer ───────────────────────────────────────
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

// ── Dedup cooldown options ────────────────────────────────
const DEDUP_OPTIONS = [
  ['1m','1m'],['3m','3m'],['5m','5m'],['15m','15m'],['30m','30m'],['1h','1h'],['4h','4h'],['1d','Daily']
]

// ── 24h Volume filter thresholds ─────────────────────────
const VOLUME_FILTERS = [
  {id:'all',  label:'All Vol', min:0},
  {id:'500k', label:'>500K',  min:500_000},
  {id:'1m',   label:'>1M',    min:1_000_000},
  {id:'5m',   label:'>5M',    min:5_000_000},
  {id:'10m',  label:'>10M',   min:10_000_000},
]


// ── Main section ──────────────────────────────────────────
export default function ScanFormationsSection({ settings, update, isFirstVisit }) {
  // ── Persistent settings (saved to localStorage + Firebase) ──
  const scanMode      = settings.scanMode      ?? 'all'
  const dedupInterval = settings.dedupInterval ?? '1m'
  const resultFilter  = settings.resultFilter  ?? 'all'
  const volumeFilter  = settings.volumeFilter  ?? '500k'

  // scannerEnabled: merge saved state with ALL_SCANNERS defaults (new patterns = ON)
  const scannerEnabled = useMemo(() => {
    const saved = settings.scannerEnabled || {}
    const merged = {}
    ALL_SCANNERS.forEach(s => { merged[s.id] = s.id in saved ? saved[s.id] : true })
    return merged
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.scannerEnabled])

  const setScanMode      = v   => update({ scanMode: v })
  const setDedupInterval = v   => { seenRef.current = {}; update({ dedupInterval: v }) }
  const setResultFilter  = v   => update({ resultFilter: v })
  const setVolumeFilter  = v   => update({ volumeFilter: v })
  const setScannerEnabled = fn => {
    const next = typeof fn === 'function' ? fn(scannerEnabled) : fn
    update({ scannerEnabled: next })
  }

  // ── Ephemeral state ───────────────────────────────────────
  const [enabled,         setEnabled]         = useState(false)   // auto mode always OFF on load
  const [loopMode,        setLoopMode]         = useState(false)   // loop mode always OFF on load
  const [scanning,        setScanning]         = useState(false)
  const [progress,        setProgress]         = useState(0)
  const [progressSym,     setProgressSym]      = useState('')
  const [alerts,          setAlerts]           = useState([])
  const [lastScan,        setLastScan]         = useState(null)
  const [nextScanAt,      setNextScanAt]       = useState(null)
  const [errors,          setErrors]           = useState([])
  const [sideTab,         setSideTab]          = useState('all')
  const [expanded,        setExpanded]         = useState({})
  const [sortBy,          setSortBy]           = useState('time')
  const [sortDir,         setSortDir]          = useState('desc')
  const [viewMode,        setViewMode]         = useState(settings.viewMode ?? 'list')
  const [searchQ,         setSearchQ]          = useState('')
  const [selectedAlert,   setSelectedAlert]    = useState(null)
  const [allSymbols,      setAllSymbols]       = useState([])
  const [tickers,         setTickers]          = useState({})
  const [loadingSyms,     setLoadingSyms]      = useState(false)
  const [symLoadFailed,   setSymLoadFailed]    = useState(false)
  const [singleSym,       setSingleSym]        = useState('')
  const [loopCount,       setLoopCount]        = useState(0)
  const [advSideTab,      setAdvSideTab]       = useState('all')

  const timerRef    = useRef(null)
  const idRef       = useRef(0)
  const abortRef    = useRef(null)
  const loopRef     = useRef(false)
  const seenRef     = useRef({})
  const scanningRef = useRef(false)      // stable ref so callbacks don't go stale
  const settingsRef = useRef(settings)   // always-current settings without re-subscribing
  const symbolsRef  = useRef([])
  const tickersRef  = useRef({})
  const scannersRef = useRef([])

  // Keep refs in sync — both symbolsRef and scannersRef are placed BELOW
  // their respective useMemo declarations to avoid TDZ (Temporal Dead Zone) errors
  useEffect(() => { settingsRef.current = settings }, [settings])
  useEffect(() => { tickersRef.current  = tickers  }, [tickers])

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

  const symbols = useMemo(()=>{
    const extra = settings.customPairs||[]
    if (settings.symbolSet==='custom') return [...new Set(extra)]
    const sorted = allSymbols.length>0
      ? [...allSymbols].sort((a,b)=>(tickers[b]?.volume||0)-(tickers[a]?.volume||0))
      : [...TOP_SYMBOLS]
    let base
    if (settings.symbolSet==='top30')       base=sorted.slice(0,30)
    else if (settings.symbolSet==='top100') base=sorted.slice(0,100)
    else if (settings.symbolSet==='top200') base=sorted.slice(0,200)
    else if (settings.symbolSet==='top500') base=sorted.slice(0,500)
    else                                    base=sorted
    return [...new Set([...base,...extra])]
  },[settings.symbolSet,settings.customPairs,allSymbols,tickers])

  // Sync symbolsRef after symbols is defined
  useEffect(() => { symbolsRef.current = symbols }, [symbols])

  const customPairs = useMemo(()=>[...new Set(settings.customPairs||[])]
  ,[settings.customPairs])

  const activeScanners = useMemo(()=>{
    return ALL_SCANNERS.filter(s=>scannerEnabled[s.id]&&(scanMode==='all'||scanMode==='single'||s.side===scanMode))
  },[scannerEnabled,scanMode])

  // Fix: placed AFTER activeScanners declaration to avoid TDZ ReferenceError -> black screen
  useEffect(() => { scannersRef.current = activeScanners }, [activeScanners])

  // ✅ scannersRef sync placed HERE — after activeScanners is declared — to avoid TDZ crash
  useEffect(() => { scannersRef.current = activeScanners }, [activeScanners])

  function isDupe(symbol, scannerId, tf) {
    const key = `${symbol}__${scannerId}__${tf}`
    const now = Date.now()
    const exp = seenRef.current[key]
    if (exp && now < exp) return true
    const ttl = Math.max(
      intervalToMs(dedupInterval),
      intervalToMs(settingsRef.current.scanInterval||'1m')
    )
    seenRef.current[key] = now + ttl
    return false
  }

  async function scanBatch(symList, tf) {
    const CONCURRENCY = 10
    const newAlerts=[], newErrors=[]
    let i=0, done=0
    const abort = abortRef.current?.signal
    const scanners = scannersRef.current
    const tkrs = tickersRef.current

    async function worker() {
      while(true) {
        if (abort?.aborted) return
        const idx = i++
        if (idx >= symList.length) return
        const sym = symList[idx]
        setProgressSym(sym)
        try {
          const candles = await fetchCandles(sym, tf, 60, tkrs[sym] || null)
          for (const scanner of scanners) {
            if (abort?.aborted) continue
            if (isDupe(sym, scanner.id, tf)) continue
            const result = scanner.logic(candles)
            if (result) {
              const a = {
                id:++idRef.current, symbol:sym, timeframe:tf, time:Date.now(),
                scannerId:scanner.id, scannerName:scanner.name,
                scannerIcon:scanner.icon, side:scanner.side,
                group: scanner.group||'standard',
                details:result, ticker:tkrs[sym]||null,
              }
              newAlerts.push(a)
              // APPEND only — never wipe existing results
              setAlerts(prev => [a, ...prev].slice(0, 500))
            }
          }
        } catch { newErrors.push(sym) }
        done++
        setProgress(Math.round(done / symList.length * 100))
        await new Promise(r => setTimeout(r, 20))
      }
    }

    await Promise.all(Array.from({length:CONCURRENCY}, ()=>worker()))
    return { newAlerts, newErrors }
  }

  // Stable runScan using refs — never goes stale in intervals
  const runScan = useCallback(async (symOverride) => {
    if (scanningRef.current) return
    scanningRef.current = true
    setScanning(true); setProgress(0); setErrors([])
    abortRef.current = new AbortController()
    const cfg = settingsRef.current
    const tf = cfg.timeframe || '1h'
    const currentScanMode = cfg.scanMode || 'all'
    const currentCustomPairs = cfg.customPairs || []
    const syms = symOverride || (
      currentScanMode === 'custom' ? [...new Set(currentCustomPairs)] : symbolsRef.current
    )
    if (!syms || syms.length === 0) {
      scanningRef.current = false
      setScanning(false)
      return
    }
    const { newAlerts, newErrors } = await scanBatch(syms, tf)
    setProgress(100)
    if (newAlerts.length) {
      if (cfg.soundEnabled) {
        if (newAlerts.some(a => a.side==='bull')) playBeep(false)
        if (newAlerts.some(a => a.side==='bear')) setTimeout(()=>playBeep(true), 300)
      }
      if (cfg.tgOn && cfg.tgToken && cfg.tgChatId)
        for (const a of newAlerts.slice(0,5))
          await sendTelegram(cfg.tgToken, cfg.tgChatId, buildTelegramMsg(a))
    }
    if (newErrors.length) setErrors(newErrors)
    setLastScan(Date.now())
    scanningRef.current = false
    setScanning(false); setProgressSym('')
    if (loopRef.current) {
      setLoopCount(c => c+1)
      setTimeout(() => runScan(symOverride), 300)
    }
  }, []) // eslint-disable-line

  // ── One-time initial scan on first page load ──────────────
  const initialScanDone = useRef(false)
  useEffect(() => {
    if (initialScanDone.current) return
    initialScanDone.current = true
    const tryRun = () => {
      if (symbolsRef.current.length > 0) {
        if (isFirstVisit) {
          // First-time visitor: always scan top200 regardless of settings
          const top200 = symbolsRef.current.slice(0, 200)
          runScan(top200)
        } else {
          runScan()
        }
      } else {
        setTimeout(tryRun, 500)
      }
    }
    setTimeout(tryRun, 800)
  }, []) // eslint-disable-line

  // ── Always-on auto scan ────────────────────────────────────
  // Starts 5s after page load. Reschedules on interval change.
  // Results ACCUMULATE — never cleared between cycles.
  useEffect(() => {
    if (!enabled || loopMode) {
      clearInterval(timerRef.current)
      setNextScanAt(null)
      return
    }
    const ms = intervalToMs(settingsRef.current.scanInterval || '1m')

    // 5-second delay on first load so page has time to settle
    const boot = setTimeout(() => {
      runScan()
      setNextScanAt(Date.now() + ms)
      timerRef.current = setInterval(() => {
        runScan()
        setNextScanAt(Date.now() + ms)
      }, ms)
    }, 5000)

    return () => {
      clearTimeout(boot)
      clearInterval(timerRef.current)
      setNextScanAt(null)
    }
  }, [enabled, loopMode, settings.scanInterval]) // eslint-disable-line

  function toggleLoop(v) {
    setLoopMode(v)
    if (v){loopRef.current=true;setEnabled(false);setLoopCount(0);runScan()}
    else {loopRef.current=false;abortRef.current?.abort();setScanning(false)}
  }

  function stopScan() {
    loopRef.current=false; abortRef.current?.abort()
    setScanning(false); setEnabled(false); setLoopMode(false)
    setNextScanAt(null); clearInterval(timerRef.current)
  }

  function toggleSort(col){
    if(sortBy===col) setSortDir(d=>d==='asc'?'desc':'asc')
    else {setSortBy(col);setSortDir('desc')}
  }

  const visibleScanners = useMemo(()=>{
    let s=ALL_SCANNERS
    if(sideTab==='standard') s=s.filter(x=>!x.group||x.group==='standard')
    else if(sideTab==='advanced') s=s.filter(x=>x.group==='advanced')
    else if(sideTab==='bull') s=s.filter(x=>x.side==='bull')
    else if(sideTab==='bear') s=s.filter(x=>x.side==='bear')
    if(searchQ) s=s.filter(x=>x.name.toLowerCase().includes(searchQ.toLowerCase()))
    return s
  },[sideTab,searchQ])

  // ── Volume filter min threshold ───────────────────────────
  const volMin = VOLUME_FILTERS.find(f=>f.id===volumeFilter)?.min ?? 0

  const filteredAlerts = useMemo(()=>{
    return [...alerts]
      .filter(a => {
        const vol = a.ticker?.volume ?? 0
        return vol >= volMin
      })
      .sort((x,y)=>{
        let cmp=0
        if(sortBy==='time')    cmp=x.time-y.time
        if(sortBy==='symbol')  cmp=x.symbol.localeCompare(y.symbol)
        if(sortBy==='pattern') cmp=x.scannerName.localeCompare(y.scannerName)
        if(sortBy==='gain')    cmp=parseFloat(x.details.gainPct||0)-parseFloat(y.details.gainPct||0)
        if(sortBy==='volume')  cmp=(x.ticker?.volume||0)-(y.ticker?.volume||0)
        return sortDir==='desc'?-cmp:cmp
      })
  },[alerts,sortBy,sortDir,volMin])

  const bullCount=alerts.filter(a=>a.side==='bull').length
  const bearCount=alerts.filter(a=>a.side==='bear').length

  // Counts for display (respects resultFilter)
  const displayedCount = filteredAlerts.filter(a =>
    resultFilter==='all' ? true : a.side===resultFilter
  ).length

  // Scan mode tabs
  const SCAN_MODES=[
    {id:'single', icon:'⚡', label:'Single', col:'var(--amber)',  bd:'var(--amber)',  bg:'rgba(255,180,0,.1)'},
    {id:'all',    icon:'⬡',  label:'All',    col:'var(--accent)', bd:'var(--accent)', bg:'var(--accent-dim)'},
    {id:'bull',   icon:'🟢', label:'Bull',   col:'var(--green)',  bd:'var(--green2)', bg:'var(--green-dim)'},
    {id:'bear',   icon:'🔴', label:'Bear',   col:'var(--red)',    bd:'var(--red2)',   bg:'var(--red-dim)'},
    {id:'custom', icon:'⊞',  label:'Custom', col:'#b388ff',       bd:'rgba(179,136,255,.5)', bg:'rgba(179,136,255,.08)'},
  ]

  return (
    <div>
      <DetailSheet alert={selectedAlert} onClose={()=>setSelectedAlert(null)}/>

      {/* Header */}
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:10,marginBottom:10,flexWrap:'wrap'}}>
        <div>
          <h2 style={{fontSize:21,fontWeight:800,letterSpacing:'-.02em',marginBottom:3}}>ACF Scanner</h2>
          <p style={{fontSize:11,color:'var(--text3)',fontFamily:'var(--mono)',display:'flex',alignItems:'center',gap:6}}>
            {loadingSyms
              ? <span style={{color:'var(--amber)'}}>⟳ Loading Binance…</span>
              : symLoadFailed
                ? <><span style={{color:'var(--red)'}}>⚠ API failed · {symbols.length} pairs</span>
                    <button onClick={loadSymbols} style={{fontSize:10,padding:'1px 6px',borderRadius:4,border:'1px solid var(--red2)',background:'var(--red-dim)',color:'var(--red)',cursor:'pointer',fontFamily:'var(--mono)'}}>Retry</button>
                  </>
                : `${settings.timeframe} · ${symbols.length} symbols · ${activeScanners.length}/${ALL_SCANNERS.length} patterns`
            }
          </p>
        </div>
        {scanMode!=='single'&&(
          <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
            <Countdown nextAt={nextScanAt}/>
            <button className="btn-primary" style={{fontSize:13}} onClick={()=>runScan()} disabled={scanning}>
              {scanning?`⟳ ${progress}%`:'▶ Scan'}
            </button>
            {(scanning||loopMode||enabled)&&(
              <button className="btn-danger" style={{fontSize:13}} onClick={stopScan}>■ Stop</button>
            )}
          </div>
        )}
      </div>

      {/* ── SCAN MODE accordion ── */}
      <Accordion title="Scan Mode" icon="⬡" badge="LIVE" defaultOpen={false} accentColor="var(--accent)">
        {/* Mode tabs */}
        <div style={{marginBottom:14}}>
          <div style={{fontSize:10,fontFamily:'var(--mono)',color:'var(--text3)',marginBottom:6,letterSpacing:'.08em',textTransform:'uppercase'}}>Mode</div>
          <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
            {SCAN_MODES.map(m=>(
              <button key={m.id} onClick={()=>setScanMode(m.id)} style={{
                display:'flex',alignItems:'center',gap:5,
                padding:'6px 12px',borderRadius:20,cursor:'pointer',
                border:`1.5px solid ${scanMode===m.id?m.bd:'var(--border)'}`,
                background:scanMode===m.id?m.bg:'var(--bg2)',
                color:scanMode===m.id?m.col:'var(--text3)',
                fontWeight:scanMode===m.id?700:400,
                fontSize:12,fontFamily:'var(--mono)',transition:'all .15s',
              }}>
                <span style={{fontSize:14}}>{m.icon}</span>
                <span>{m.label}</span>
                {m.id==='custom'&&<span style={{fontSize:9,opacity:.7}}>({customPairs.length})</span>}
              </button>
            ))}
          </div>
        </div>

        {scanMode==='single' ? (
          <div>
            <div style={{fontSize:12,color:'var(--text3)',marginBottom:10}}>
              Scan one pair across <strong style={{color:'var(--text)'}}>{activeScanners.length}</strong> patterns
            </div>
            <div style={{display:'flex',gap:8}}>
              <input className="text-input" placeholder="e.g. BTCUSDT…" value={singleSym}
                onChange={e=>setSingleSym(e.target.value.toUpperCase())}
                onKeyDown={e=>e.key==='Enter'&&singleSym.trim()&&runScan([singleSym.trim()])}
                style={{flex:1,fontFamily:'var(--mono)',fontWeight:700}}/>
              <button className="btn-primary" onClick={()=>runScan([singleSym.trim()])}
                disabled={!singleSym.trim()||scanning} style={{flexShrink:0,padding:'0 18px'}}>
                {scanning?'⟳':'▶'}
              </button>
            </div>
          </div>
        ) : scanMode==='custom' ? (
          <div>
            <div style={{fontSize:12,color:'var(--text3)',marginBottom:8}}>
              Scanning <strong style={{color:'#b388ff'}}>{customPairs.length}</strong> custom pair{customPairs.length!==1?'s':''} · add more in Custom Pairs settings
            </div>
            {customPairs.length===0 ? (
              <div style={{fontSize:12,fontFamily:'var(--mono)',color:'var(--text3)',padding:'10px',background:'var(--bg2)',borderRadius:8,textAlign:'center'}}>
                No custom pairs yet — add them in ⊞ Custom Pairs settings
              </div>
            ) : (
              <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                {customPairs.map(p=>(
                  <span key={p} style={{padding:'3px 10px',borderRadius:14,background:'rgba(179,136,255,0.1)',border:'1px solid rgba(179,136,255,0.4)',color:'#b388ff',fontFamily:'var(--mono)',fontSize:11,fontWeight:700}}>{p}</span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Symbol set */}
            <div className="setting-row">
              <div className="row-label">
                <span>Symbol Set</span>
                <small>{settings.symbolSet==='top30'?`Top 30`:settings.symbolSet==='top100'?`Top 100`:settings.symbolSet==='top200'?`Top 200`:settings.symbolSet==='top500'?`Top 500`:settings.symbolSet==='all'?`All (${allSymbols.length})`:`Custom (${customPairs.length})`}</small>
              </div>
              <div style={{display:'flex',gap:4,flexWrap:'wrap',justifyContent:'flex-end'}}>
                {['top30','top100','top200','top500','all'].map(s=>(
                  <button key={s} className={`btn-small ${settings.symbolSet===s?'active':''}`}
                    onClick={()=>update({symbolSet:s})}
                    style={settings.symbolSet===s?{borderColor:'var(--accent)',color:'var(--accent)',background:'var(--accent-dim)'}:{}}>
                    {s==='top30'?'30':s==='top100'?'100':s==='top200'?'200':s==='top500'?'500':'All'}
                  </button>
                ))}
              </div>
            </div>
            {/* Timeframe */}
            <div className="setting-row">
              <div className="row-label">
                <span>Timeframe</span>
                <small>Candle interval</small>
              </div>
              <div style={{display:'flex',gap:4,flexWrap:'wrap',justifyContent:'flex-end'}}>
                {['1m','5m','15m','30m','1h','4h','1d'].map(tf=>(
                  <button key={tf} className={`btn-small ${settings.timeframe===tf?'active':''}`}
                    onClick={()=>update({timeframe:tf})}
                    style={settings.timeframe===tf?{borderColor:'var(--green2)',color:'var(--green)',background:'var(--green-dim)'}:{}}>
                    {tf}
                  </button>
                ))}
              </div>
            </div>
            {/* Scan Interval */}
            <div className="setting-row" style={{borderBottom:'none',paddingBottom:0}}>
              <div className="row-label">
                <span>Scan Interval</span>
                <small>How often auto-scan repeats</small>
              </div>
              <div style={{display:'flex',gap:4,flexWrap:'wrap',justifyContent:'flex-end'}}>
                {['1m','5m','15m','30m','1h'].map(si=>(
                  <button key={si} className={`btn-small ${settings.scanInterval===si?'active':''}`}
                    onClick={()=>update({scanInterval:si})}
                    style={settings.scanInterval===si?{borderColor:'var(--accent)',color:'var(--accent)',background:'var(--accent-dim)'}:{}}>
                    {si}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Dedup interval */}
        <div className="setting-row" style={{marginTop:12,paddingTop:12,borderTop:'1px solid var(--border)'}}>
          <div className="row-label">
            <span>Result Repeat Filter</span>
            <small>Hide same pattern/symbol/TF for {dedupInterval} (min: scan interval)</small>
          </div>
          <div style={{display:'flex',gap:4,flexWrap:'wrap',justifyContent:'flex-end'}}>
            {DEDUP_OPTIONS.map(([v,l])=>(
              <button key={v} className={`btn-small ${dedupInterval===v?'active':''}`}
                onClick={()=>setDedupInterval(v)}
                style={dedupInterval===v?{borderColor:'var(--amber)',color:'var(--amber)',background:'rgba(255,180,0,.1)'}:{}}>
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* 24h Volume filter */}
        <div className="setting-row" style={{borderBottom:'none',paddingBottom:0}}>
          <div className="row-label">
            <span>24h Volume Filter</span>
            <small>Only show results above volume threshold</small>
          </div>
          <div style={{display:'flex',gap:4,flexWrap:'wrap',justifyContent:'flex-end'}}>
            {VOLUME_FILTERS.map(f=>(
              <button key={f.id} className={`btn-small ${volumeFilter===f.id?'active':''}`}
                onClick={()=>setVolumeFilter(f.id)}
                style={volumeFilter===f.id?{borderColor:'var(--purple)',color:'var(--purple)',background:'var(--purple-dim)'}:{}}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </Accordion>

      {/* ── ADVANCED PATTERNS accordion ── */}
      <Accordion title={`Advanced Patterns (${ALL_SCANNERS.length} patterns)`} icon="🔬" defaultOpen={false} accentColor="rgba(150,100,255,0.6)">
        {/* Info banner */}
        <div style={{background:'rgba(150,100,255,0.07)',border:'1px solid rgba(150,100,255,0.22)',borderRadius:8,padding:'9px 12px',marginBottom:12}}>
          <div style={{fontSize:11,fontFamily:'var(--mono)',color:'#b388ff',fontWeight:700,marginBottom:3}}>⚡ EMA + RSI Patterns</div>
          <div style={{fontSize:11,color:'var(--text3)',lineHeight:1.6}}>
            Patterns use EMA9, EMA10, EMA20, EMA40 and RSI14. V2 patterns require 15+ candle history. EMA40 needs 40+ candles to activate.
          </div>
        </div>

        {/* Bulk toggles + filter tabs */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,marginBottom:10,flexWrap:'wrap'}}>
          {/* All On / All Off / Bull / Bear */}
          <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
            <button className="btn-small" onClick={()=>setScannerEnabled(()=>{const n={};ALL_SCANNERS.forEach(s=>n[s.id]=true);return n})}
              style={{background:'rgba(0,230,118,0.12)',borderColor:'rgba(0,192,96,0.5)',color:'var(--green)',fontWeight:700}}>✓ All On</button>
            <button className="btn-small" onClick={()=>setScannerEnabled(()=>{const n={};ALL_SCANNERS.forEach(s=>n[s.id]=false);return n})}
              style={{background:'rgba(255,70,70,0.08)',borderColor:'rgba(255,70,70,0.35)',color:'var(--red)',fontWeight:700}}>✗ All Off</button>
            <button className="btn-small"
              onClick={()=>setScannerEnabled(p=>{const n={...p};ALL_SCANNERS.forEach(s=>{ if(s.side==='bull') n[s.id]=true });return n})}
              style={{background:'rgba(0,230,118,0.07)',borderColor:'rgba(0,192,96,0.35)',color:'var(--green)'}}>🟢 Bull On</button>
            <button className="btn-small"
              onClick={()=>setScannerEnabled(p=>{const n={...p};ALL_SCANNERS.forEach(s=>{ if(s.side==='bear') n[s.id]=true });return n})}
              style={{background:'rgba(255,70,70,0.07)',borderColor:'rgba(255,70,70,0.3)',color:'var(--red)'}}>🔴 Bear On</button>
          </div>
          {/* Side filter */}
          <div style={{display:'flex',gap:4}}>
            {[['all','All'],['bull','🟢'],['bear','🔴']].map(([id,lbl])=>(
              <button key={id} className="btn-small" onClick={()=>setAdvSideTab(id)}
                style={advSideTab===id?{
                  borderColor:id==='bull'?'var(--green2)':id==='bear'?'var(--red2)':'var(--border2)',
                  color:id==='bull'?'var(--green)':id==='bear'?'var(--red)':'var(--text)',
                  background:id==='bull'?'var(--green-dim)':id==='bear'?'var(--red-dim)':'var(--bg3)',
                  fontWeight:700,
                }:{}}>{lbl}</button>
            ))}
          </div>
        </div>

        {/* Pattern list */}
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {ALL_SCANNERS
            .filter(s => advSideTab === 'all' || s.side === advSideTab)
            .map(s => (
              <ScannerDefCard key={s.id} scanner={s}
                expanded={!!expanded[s.id]} onTap={()=>setExpanded(p=>({...p,[s.id]:!p[s.id]}))}
                enabled={scannerEnabled[s.id]} onToggle={v=>setScannerEnabled(p=>({...p,[s.id]:v}))}/>
            ))}
        </div>
      </Accordion>

      {/* ── Auto-scan & Loop Mode accordion ── */}
      {scanMode!=='single'&&(
        <Accordion
          title="Auto Scan & Loop Mode"
          icon="⏱"
          badge={scanning?`${progress}%`:loopMode?`LOOP #${loopCount}`:enabled?'RUNNING':'IDLE'}
          defaultOpen={false}
          accentColor={scanning?'var(--amber)':loopMode||enabled?'var(--green)':'var(--border)'}
        >
          <div className="setting-row">
            <div className="row-label"><span>Auto-Scan</span><small>Every {settings.scanInterval} · {scanMode==='custom'?customPairs.length:symbols.length} symbols</small></div>
            <Toggle checked={enabled&&!loopMode} onChange={v=>{if(loopMode)return;setEnabled(v);update({autoScan:v});if(!v)stopScan()}}/>
          </div>
          <div className="setting-row">
            <div className="row-label"><span>Loop Mode</span><small>{loopMode?`Running — loop #${loopCount}`:'Restart scan instantly each cycle'}</small></div>
            <Toggle checked={loopMode} onChange={toggleLoop}/>
          </div>
          <div className="setting-row" style={{borderBottom:'none',paddingBottom:0}}>
            <div className="row-label"><span>Status</span>
              <small>{scanning?`${progressSym} — ${progress}% (${scanMode==='custom'?customPairs.length:symbols.length} syms)`:lastScan?`Last: ${new Date(lastScan).toLocaleTimeString()} · ${alerts.length} alerts`:'Not started'}</small>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              {scanning&&<span className="spin" style={{color:'var(--amber)'}}>⟳</span>}
              <span className={`badge ${scanning?'badge-amber':loopMode?'badge-green':enabled?'badge-green':'badge-blue'}`}>
                {scanning?`${progress}%`:loopMode?`LOOP #${loopCount}`:enabled?'RUNNING':'IDLE'}
              </span>
            </div>
          </div>
          {scanning&&(
            <div style={{marginTop:8}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                <span style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--amber)',fontWeight:700}}>{progressSym} — {progress}%</span>
                {nextScanAt&&!loopMode&&<Countdown nextAt={nextScanAt}/>}
              </div>
              <div className="progress-bar-wrap"><div className="progress-bar-fill" style={{width:`${progress}%`}}/></div>
            </div>
          )}
          {!scanning&&nextScanAt&&!loopMode&&<div style={{marginTop:8}}><Countdown nextAt={nextScanAt}/></div>}
          <div className="ctrl-bar" style={{paddingTop:12,borderTop:'1px solid var(--border)',marginTop:8}}>
            <button className="btn-primary" onClick={()=>runScan()} disabled={scanning}>{scanning?'⟳ Scanning…':'▶ Scan All'}</button>
            {(scanning||loopMode)&&<button className="btn-danger" onClick={stopScan}>■ Stop</button>}
            {alerts.length>0&&<button className="btn-secondary" style={{marginLeft:'auto'}} onClick={()=>setAlerts([])}>Clear ({alerts.length})</button>}
          </div>
        </Accordion>
      )}

      {scanMode==='single'&&scanning&&(
        <div className="section-card" style={{marginBottom:12}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
            <span style={{fontSize:13,fontFamily:'var(--mono)',color:'var(--amber)'}}>⟳ Scanning {progressSym}…</span>
            <button className="btn-danger btn-small" onClick={stopScan}>■ Stop</button>
          </div>
          <div className="progress-bar-wrap"><div className="progress-bar-fill" style={{width:`${progress}%`}}/></div>
        </div>
      )}

      {errors.length>0&&(
        <div className="error-banner">
          ⚠ {errors.slice(0,5).join(', ')}{errors.length>5?` +${errors.length-5} more`:''}
          <span style={{marginLeft:8,cursor:'pointer',textDecoration:'underline'}} onClick={()=>setErrors([])}>dismiss</span>
        </div>
      )}

      {/* ── Results ── */}
      <div style={{marginTop:16}}>

        {/* ── Merged counter + sort + filter bar ── */}
        <div style={{
          background:'var(--bg1)', border:'1.5px solid var(--border)',
          borderRadius:12, padding:'10px 12px', marginBottom:10,
        }}>
          {/* Row 1: counter + view toggles */}
          <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:8,flexWrap:'wrap'}}>
            {scanning && (
              <span style={{display:'flex',alignItems:'center',gap:5,fontFamily:'var(--mono)',fontSize:10,
                color:'var(--amber)',background:'rgba(255,167,38,.1)',border:'1px solid var(--amber)',
                borderRadius:8,padding:'2px 8px',flexShrink:0,animation:'fadeIn .3s'}}>
                <span style={{display:'inline-block',animation:'spin 1s linear infinite'}}>⟳</span> LIVE {progress}%
              </span>
            )}
            <div style={{display:'flex',alignItems:'center',gap:5,flex:1,minWidth:0,flexWrap:'wrap'}}>
              <span style={{fontFamily:'var(--mono)',fontSize:13,fontWeight:800,color:'var(--text)',flexShrink:0}}>{displayedCount}</span>
              <span style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--text3)',flexShrink:0}}>results</span>
              <span style={{padding:'2px 8px',borderRadius:8,fontSize:10,fontWeight:700,
                background:'var(--green-dim)',color:'var(--green)',border:'1px solid var(--green2)',
                fontFamily:'var(--mono)',flexShrink:0}}>🟢 {bullCount}</span>
              <span style={{padding:'2px 8px',borderRadius:8,fontSize:10,fontWeight:700,
                background:'var(--red-dim)',color:'var(--red)',border:'1px solid var(--red2)',
                fontFamily:'var(--mono)',flexShrink:0}}>🔴 {bearCount}</span>
              {alerts.length>0&&(
                <button onClick={()=>setAlerts([])} style={{fontSize:10,fontFamily:'var(--mono)',
                  color:'var(--text3)',padding:'2px 7px',border:'1px solid var(--border)',borderRadius:6,
                  cursor:'pointer',background:'var(--bg2)',marginLeft:'auto',flexShrink:0}}>
                  ✕ Clear
                </button>
              )}
            </div>
            <div style={{display:'flex',gap:3,flexShrink:0}}>
              <button className={`btn-small ${viewMode==='list'?'active':''}`} onClick={()=>setViewMode('list')}
                style={viewMode==='list'?{borderColor:'var(--accent)',color:'var(--accent)',background:'var(--accent-dim)'}:{}}>≡</button>
              <button className={`btn-small ${viewMode==='cards'?'active':''}`} onClick={()=>setViewMode('cards')}
                style={viewMode==='cards'?{borderColor:'var(--accent)',color:'var(--accent)',background:'var(--accent-dim)'}:{}}>⊞</button>
            </div>
          </div>
          {/* Row 2: filter + sort — horizontally scrollable on mobile */}
          <div style={{display:'flex',alignItems:'center',gap:4,overflowX:'auto',paddingBottom:2,
            WebkitOverflowScrolling:'touch',scrollbarWidth:'none'}}>
            {[['all','All','var(--accent)','var(--accent-dim)'],['bull','🟢','var(--green)','var(--green-dim)'],['bear','🔴','var(--red)','var(--red-dim)']].map(([id,lbl,col,bg])=>(
              <button key={id} onClick={()=>setResultFilter(id)} className="btn-small"
                style={{flexShrink:0,...(resultFilter===id?{borderColor:col,color:col,background:bg,fontWeight:700}:{})}}>
                {lbl}
              </button>
            ))}
            <div style={{width:1,height:18,background:'var(--border)',flexShrink:0,margin:'0 4px'}}/>
            <span style={{fontSize:10,fontFamily:'var(--mono)',color:'var(--text3)',flexShrink:0}}>↕</span>
            {[['time','Time'],['symbol','Sym'],['pattern','Pat'],['gain','Gain'],['volume','Vol']].map(([col,label])=>(
              <button key={col} className={`sort-btn ${sortBy===col?'active':''}`}
                onClick={()=>toggleSort(col)} style={{flexShrink:0}}>
                {label}{sortBy===col?(sortDir==='desc'?' ↓':' ↑'):''}
              </button>
            ))}
          </div>
        </div>
        {displayedCount===0?(
          <div className="empty-state">
            <div className="empty-icon">{scanMode==='single'?'⚡':scanning?'🔍':loopMode?'🔁':enabled?'⏳':'💤'}</div>
            {scanMode==='single'?'Enter a symbol and tap Scan'
              :scanning?`Scanning ${progressSym} (${progress}%)… results appear instantly`
              :loopMode?`Loop mode — scan #${loopCount}`
              :enabled?'Waiting for next scan cycle…'
              :'Press Scan or enable auto-scan'}
            <br/><span style={{fontSize:11}}>{activeScanners.length} patterns · {scanMode==='custom'?`${customPairs.length} custom pairs`:scanMode==='single'?'single symbol':`${symbols.length} symbols`} · {settings.timeframe}</span>
          </div>
        ):viewMode==='cards'?(
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            {filteredAlerts.map(a=><AlertCard key={a.id} alert={a} resultFilter={resultFilter} onDismiss={()=>setAlerts(p=>p.filter(x=>x.id!==a.id))} onTap={setSelectedAlert}/>)}
          </div>
        ):(
          <div style={{display:'flex',flexDirection:'column',gap:6}}>
            {filteredAlerts.map(a=><ScanListItem key={a.id} alert={a} resultFilter={resultFilter} onDismiss={()=>setAlerts(p=>p.filter(x=>x.id!==a.id))} onTap={setSelectedAlert}/>)}
          </div>
        )}
      </div>
    </div>
  )
}
