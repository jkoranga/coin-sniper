import { useState, useEffect, useRef, useCallback } from 'react'
import { fmt, fmtVol } from '../../utils/scanner.js'
import { TOP_SYMBOLS } from '../../utils/scanner.js'

// ── TradingView icon button ────────────────────────────────
function TvIcon({ symbol }) {
  const base = symbol.replace('USDT', '').toUpperCase()
  const url = `https://www.tradingview.com/chart/?symbol=BINANCE:${base}USDT&interval=D`
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={e => e.stopPropagation()}
      title={`Open ${base}/USDT Daily on TradingView`}
      className="tv-icon-btn"
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
      <span className="tv-icon-label">TV</span>
    </a>
  )
}

// ── Price row — mobile responsive ─────────────────────────
function PriceRow({ sym, data, flash }) {
  const chg = data?.chgPct ?? 0
  const col = chg >= 0 ? 'var(--green)' : 'var(--red)'
  const bgFlash = flash === 'up' ? 'flash-green' : flash === 'down' ? 'flash-red' : ''
  const base = sym.replace('USDT', '')

  return (
    <div className={`price-row ${bgFlash}`}>
      {/* Symbol */}
      <span className="pr-sym">
        {base}<span style={{ color:'var(--text3)', fontWeight:400, fontSize:10 }}>/USDT</span>
      </span>

      {/* Price → 24h% clickable zone */}
      <a
        href={`https://www.tradingview.com/chart/?symbol=BINANCE:${base}USDT&interval=D`}
        target="_blank"
        rel="noopener noreferrer"
        className="pr-price-link"
        title={`Open ${base} on TradingView`}
        onClick={e => e.stopPropagation()}
      >
        <span className="pr-price" style={{ color: col }}>{fmt(data?.price)}</span>
        <span className="pr-chg" style={{ color: col }}>
          {chg >= 0 ? '+' : ''}{chg.toFixed(2)}%
        </span>
      </a>

      {/* Volume */}
      <span className="pr-vol">{fmtVol(data?.vol ?? 0)}</span>

      {/* TV button */}
      <TvIcon symbol={sym} />
    </div>
  )
}

const WS_URL = 'wss://stream.binance.com:9443/stream?streams='

// Always use exactly 30 pairs
const LIVE_SYMBOLS = TOP_SYMBOLS.slice(0, 30)

export default function LivePriceSection({ settings }) {
  const [prices,    setPrices]    = useState({})
  const [flashes,   setFlashes]   = useState({})
  const [search,    setSearch]    = useState('')
  const [filter,    setFilter]    = useState('all')
  const [sortBy,    setSortBy]    = useState('vol')
  const [connected, setConnected] = useState(false)
  const wsRef   = useRef(null)
  const prevRef = useRef({})

  // Use custom pairs if set to custom mode, otherwise always 30
  const symbols = (() => {
    const custom = settings.customPairs || []
    if (settings.symbolSet === 'custom' && custom.length > 0) return custom.slice(0, 30)
    return LIVE_SYMBOLS
  })()

  const connectWS = useCallback(() => {
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null }
    const streams = symbols.slice(0, 30).map(s => `${s.toLowerCase()}@miniTicker`).join('/')
    const ws = new WebSocket(WS_URL + streams)
    wsRef.current = ws
    ws.onopen  = () => setConnected(true)
    ws.onclose = () => { setConnected(false); setTimeout(connectWS, 3000) }
    ws.onerror = () => ws.close()
    ws.onmessage = (e) => {
      try {
        const { data: d } = JSON.parse(e.data)
        if (!d) return
        const sym    = d.s
        const price  = parseFloat(d.c)
        const open   = parseFloat(d.o)
        const vol    = parseFloat(d.q)
        const chgPct = ((price - open) / open) * 100
        const prev   = prevRef.current[sym]
        let flashDir = null
        if (prev !== undefined) {
          if (price > prev) flashDir = 'up'
          else if (price < prev) flashDir = 'down'
        }
        prevRef.current[sym] = price
        setPrices(p => ({ ...p, [sym]: { price, chgPct, vol } }))
        if (flashDir) {
          setFlashes(f => ({ ...f, [sym]: flashDir }))
          setTimeout(() => setFlashes(f => { const n={...f}; delete n[sym]; return n }), 700)
        }
      } catch {}
    }
  }, [symbols.join(',')])

  useEffect(() => { connectWS(); return () => { wsRef.current?.close() } }, [connectWS])

  const display = symbols
    .filter(s => {
      if (search && !s.toLowerCase().includes(search.toLowerCase())) return false
      const chg = prices[s]?.chgPct ?? 0
      if (filter === 'bull') return chg >= 0
      if (filter === 'bear') return chg < 0
      return true
    })
    .sort((a, b) => {
      if (sortBy === 'vol')   return (prices[b]?.vol ?? 0) - (prices[a]?.vol ?? 0)
      if (sortBy === 'chg')   return (prices[b]?.chgPct ?? 0) - (prices[a]?.chgPct ?? 0)
      if (sortBy === 'chgD')  return (prices[a]?.chgPct ?? 0) - (prices[b]?.chgPct ?? 0)
      if (sortBy === 'price') return (prices[b]?.price ?? 0) - (prices[a]?.price ?? 0)
      if (sortBy === 'sym')   return a.localeCompare(b)
      return 0
    })

  const bullCount = symbols.filter(s => (prices[s]?.chgPct ?? 0) >= 0).length
  const bearCount = symbols.filter(s => (prices[s]?.chgPct ?? 0) < 0).length

  return (
    <div>
      <div className="section-header">
        <h2>Live Prices</h2>
        <p>
          {connected
            ? <><span style={{ color:'var(--green)' }}>● WebSocket Live</span> · {symbols.length} pairs · 🟢 {bullCount} · 🔴 {bearCount}</>
            : <span style={{ color:'var(--amber)' }}>⟳ Connecting…</span>
          }
        </p>
      </div>

      {/* Controls */}
      <div className="section-card" style={{ marginBottom:12 }}>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:10 }}>
          <input
            className="text-input"
            placeholder="Search symbol…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ flex:1, minWidth:100 }}
          />
          <button className="btn-secondary" style={{ fontSize:13, padding:'8px 14px' }} onClick={connectWS}>↺</button>
        </div>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
          {[['all',`All (${symbols.length})`],['bull',`🟢 Up`],['bear',`🔴 Down`]].map(([f,l]) => (
            <button key={f} className={`filter-pill ${filter===f?`active-${f}`:''}`} onClick={() => setFilter(f)}>{l}</button>
          ))}
          <div style={{ marginLeft:'auto', display:'flex', gap:4, flexWrap:'wrap' }}>
            {[['vol','Vol'],['chg','Top+'],['chgD','Top−'],['price','$'],['sym','A→Z']].map(([k,l]) => (
              <button key={k} className={`btn-small ${sortBy===k?'active':''}`} onClick={() => setSortBy(k)}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="section-card" style={{ padding:0, overflow:'hidden' }}>
        {/* Header */}
        <div className="pr-header">
          <span className="pr-sym" style={{ color:'var(--text3)', fontSize:10, fontWeight:700, letterSpacing:'.06em' }}>SYMBOL</span>
          <span className="pr-price-link" style={{ color:'var(--text3)', fontSize:10, fontWeight:700, letterSpacing:'.06em', textDecoration:'none' }}>
            <span>PRICE</span>
            <span>24H %</span>
          </span>
          <span className="pr-vol" style={{ color:'var(--text3)', fontSize:10, fontWeight:700, letterSpacing:'.06em' }}>VOL</span>
          <span style={{ width:54, textAlign:'center', color:'var(--text3)', fontSize:10, fontWeight:700, letterSpacing:'.06em' }}>TV</span>
        </div>

        <div style={{ maxHeight:'62dvh', overflowY:'auto' }}>
          {display.length === 0
            ? <div className="empty-state"><div className="empty-icon">{connected ? '🔍' : '📡'}</div>{connected ? 'No results' : 'Connecting to Binance…'}</div>
            : display.map(sym => <PriceRow key={sym} sym={sym} data={prices[sym]} flash={flashes[sym]} />)
          }
        </div>
      </div>

      {/* Summary */}
      {Object.keys(prices).length > 0 && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginTop:10 }}>
          {[
            { label:'Total Pairs', val: symbols.length,  col:'var(--text)'  },
            { label:'🟢 Bullish',  val: bullCount,        col:'var(--green)' },
            { label:'🔴 Bearish',  val: bearCount,        col:'var(--red)'   },
          ].map(({ label, val, col }) => (
            <div key={label} style={{ background:'var(--bg1)', border:'1px solid var(--border)', borderRadius:10, padding:'10px 14px' }}>
              <div style={{ fontSize:11, fontFamily:'var(--mono)', color:'var(--text3)', marginBottom:4 }}>{label}</div>
              <div style={{ fontFamily:'var(--mono)', fontWeight:800, fontSize:20, color: col }}>{val}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
