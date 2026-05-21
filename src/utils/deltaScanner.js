// ─── Delta Exchange India Scanner ─────────────────────────────────────────────
// Strategy: try direct browser fetch first (Delta has open CORS for browsers),
// then fall back to Vercel proxy, then hardcoded fallback list.

const DELTA_BASE = 'https://api.india.delta.exchange'

const DELTA_RES_MAP = {
  '1m':'1','3m':'3','5m':'5','15m':'15','30m':'30',
  '1h':'60','4h':'240','1d':'D','Day':'D',
}

// ── Fetch all active USDT perpetuals ─────────────────────────────────────────
export async function fetchDeltaSymbols() {
  // 1. Try direct browser fetch (Delta allows browser CORS - no proxy needed)
  try {
    const res = await fetch(
      `${DELTA_BASE}/v2/products?contract_types=perpetual_futures&states=live&page_size=500`,
      {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000),
      }
    )
    if (res.ok) {
      const data = await res.json()
      const products = parseProducts(data.result || [])
      if (products.length > 0) {
        console.log(`[Delta] Direct fetch: ${products.length} symbols`)
        return { symbols: products, fallback: false, error: null }
      }
    }
  } catch (e) {
    console.warn('[Delta] Direct fetch failed:', e.message)
  }

  // 2. Try Vercel proxy
  try {
    const res = await fetch('/api/delta-symbols', { signal: AbortSignal.timeout(12000) })
    if (res.ok) {
      const data = await res.json()
      const products = data.products || []
      if (products.length > 0) {
        console.log(`[Delta] Proxy fetch: ${products.length} symbols, fallback=${data.fallback}`)
        return { symbols: products, fallback: data.fallback || false, error: data.error || null }
      }
    }
  } catch (e) {
    console.warn('[Delta] Proxy fetch failed:', e.message)
  }

  // 3. Hardcoded fallback
  console.warn('[Delta] Using hardcoded fallback list')
  return { symbols: DELTA_FALLBACK_SYMBOLS, fallback: true, error: 'API unreachable' }
}

function parseProducts(result) {
  return result
    .filter(p =>
      p.quoting_asset?.symbol === 'USDT' &&
      p.state === 'live' &&
      p.contract_type === 'perpetual_futures'
    )
    .map(p => ({
      symbol:    p.symbol,
      name:      p.underlying_asset?.symbol || p.symbol.replace('USDT',''),
      markPrice: parseFloat(p.mark_price  || 0),
      volume:    parseFloat(p.volume      || p.turnover_usd || 0),
    }))
    .sort((a, b) => b.volume - a.volume)
}

// ── Fetch OHLCV candles ───────────────────────────────────────────────────────
export async function fetchDeltaCandles(symbol, interval = '15m', limit = 60) {
  const resolution = DELTA_RES_MAP[interval] || '15'
  const now   = Math.floor(Date.now() / 1000)
  const msMap = {
    '1':60,'3':180,'5':300,'15':900,'30':1800,
    '60':3600,'240':14400,'D':86400
  }
  const ms    = msMap[resolution] || 900
  const start = now - ms * (limit + 5)

  // 1. Try direct browser fetch
  try {
    const url = `${DELTA_BASE}/v2/history/candles?symbol=${symbol}&resolution=${resolution}&start=${start}&end=${now}`
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (res.ok) {
      const data = await res.json()
      const candles = buildCandles(data.result || [], limit)
      if (candles && candles.length >= 3) return candles
    }
  } catch (_) {}

  // 2. Try Vercel proxy
  try {
    const url = `/api/delta-candles?symbol=${symbol}&resolution=${resolution}&start=${start}&end=${now}`
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
    if (res.ok) {
      const data = await res.json()
      const candles = buildCandles(data.result || [], limit)
      if (candles && candles.length >= 3) return candles
    }
  } catch (_) {}

  return null
}

function buildCandles(raw, limit) {
  if (!raw || raw.length < 3) return null

  const candles = raw
    .map(c => ({
      time:   (c.time || c.t) * 1000,
      open:   parseFloat(c.open   || c.o),
      high:   parseFloat(c.high   || c.h),
      low:    parseFloat(c.low    || c.l),
      close:  parseFloat(c.close  || c.c),
      volume: parseFloat(c.volume || c.v || 0),
    }))
    .filter(c => !isNaN(c.close) && c.close > 0)
    .sort((a, b) => a.time - b.time)
    .slice(-limit)

  if (candles.length < 3) return null

  // Attach all indicators
  attachEMAn(candles,   5, 'ema5')
  attachEMAn(candles,   9, 'ema9')
  attachEMAn(candles,  15, 'ema15')
  attachEMAn(candles,  16, 'ema16')
  attachEMAn(candles,  20, 'ema20')
  attachEMAn(candles,  25, 'ema25')
  attachEMAn(candles,  30, 'ema30')
  attachEMAn(candles,  40, 'ema40')
  attachEMAn(candles,  50, 'ema50')
  attachEMAn(candles,  60, 'ema60')
  attachEMAn(candles,  75, 'ema75')
  attachEMAn(candles,  80, 'ema80')
  attachEMAn(candles, 100, 'ema100')
  attachEMAn(candles, 120, 'ema120')
  attachEMAn(candles, 150, 'ema150')
  attachEMAn(candles, 200, 'ema200')
  attachEMAn(candles, 300, 'ema300')
  attachEMAn(candles, 600, 'ema600')
  attachRSI(candles, 14)
  attachDMI(candles, 14)

  return candles
}

// ─── Indicators ───────────────────────────────────────────────────────────────
function attachEMAn(candles, period, key) {
  const k = 2 / (period + 1)
  let ema = null
  for (const c of candles) {
    ema = ema === null ? c.close : c.close * k + ema * (1 - k)
    c[key] = ema
  }
}

function attachRSI(candles, period = 14) {
  let avgGain = 0, avgLoss = 0
  for (let i = 1; i <= period && i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close
    if (diff > 0) avgGain += diff / period
    else avgLoss += Math.abs(diff) / period
  }
  for (let i = period; i < candles.length; i++) {
    if (i > period) {
      const diff = candles[i].close - candles[i - 1].close
      avgGain = (avgGain * (period - 1) + Math.max(0, diff))  / period
      avgLoss = (avgLoss * (period - 1) + Math.max(0, -diff)) / period
    }
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss
    candles[i].rsi14 = 100 - 100 / (1 + rs)
  }
}

function attachDMI(candles, period = 14) {
  for (let i = 1; i < candles.length; i++) {
    const curr = candles[i], prev = candles[i - 1]
    const upMove = curr.high - prev.high
    const dnMove = prev.low  - curr.low
    curr._pdm = upMove > dnMove && upMove > 0 ? upMove : 0
    curr._ndm = dnMove > upMove && dnMove > 0 ? dnMove : 0
    curr._tr  = Math.max(curr.high - curr.low, Math.abs(curr.high - prev.close), Math.abs(curr.low - prev.close))
  }
  let atr = 0, pdi = 0, ndi = 0
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i]
    atr = i < period ? atr + c._tr  : (atr * (period - 1) + c._tr)  / period
    pdi = i < period ? pdi + c._pdm : (pdi * (period - 1) + c._pdm) / period
    ndi = i < period ? ndi + c._ndm : (ndi * (period - 1) + c._ndm) / period
    if (atr > 0) {
      const p = pdi / atr * 100, n = ndi / atr * 100
      c.dmi_plus = p; c.dmi_minus = n
      c.adx = (p + n) > 0 ? Math.abs(p - n) / (p + n) * 100 : 0
    }
  }
}

// ─── Fallback symbol list ─────────────────────────────────────────────────────
export const DELTA_FALLBACK_SYMBOLS = [
  'BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT',
  'ADAUSDT','DOGEUSDT','AVAXUSDT','MATICUSDT','DOTUSDT',
  'LINKUSDT','LTCUSDT','NEARUSDT','APTUSDT','ARBUSDT',
  'OPUSDT','INJUSDT','SUIUSDT','SHIBUSDT','TRXUSDT',
  'FETUSDT','WIFUSDT','PEPEUSDT','TIAUSDT','JUPUSDT',
  'ORDIUSDT','BOMEUSDT','MEMEUSDT','NOTUSDT','EIGENUSDT',
  'AAVEUSDT','LDOUSDT','STXUSDT','GRTUSDT','IMXUSDT',
  'ENAUSDT','PYTHUSDT','SEIUSDT','HBARUSDT','ALGOUSDT',
  'XLMUSDT','VETUSDT','FILUSDT','ICPUSDT','AXSUSDT',
  'SANDUSDT','MANAUSDT','KAVAUSDT','ATOMUSDT','UNIUSDT',
  'RENDERUSDT','WLDUSDT','ONDOUSDT','TONUSDT','ALTUSDT',
  'BLURUSDT','DYMUSDT','MANTAUSDT','RONINUSDT','SAFEUSDT',
  'TURBOUSDT','ACEUSDT','PORTALUSDT','PIXELUSDT','NFPUSDT',
].map(symbol => ({
  symbol,
  name:      symbol.replace('USDT', ''),
  markPrice: 0,
  volume:    0,
}))
