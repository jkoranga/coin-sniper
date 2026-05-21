// ─── Delta Exchange India — via Vercel serverless proxy ───────────────────────
// Delta's API blocks direct browser requests (CORS + host allowlist).
// All calls go through /api/delta-symbols and /api/delta-candles
// which are Vercel serverless functions that proxy to Delta server-side.

const DELTA_RES_MAP = {
  '1m':'1','3m':'3','5m':'5','15m':'15','30m':'30',
  '1h':'60','4h':'240','1d':'D',
}

// ── Fetch all active USDT perpetuals via proxy ────────────────────────────────
// Returns: { symbols: [...], fallback: bool, error: string|null }
export async function fetchDeltaSymbols() {
  try {
    const res = await fetch('/api/delta-symbols', {
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) throw new Error(`Proxy HTTP ${res.status}`)
    const data = await res.json()
    const products = data.products || []
    if (products.length === 0) throw new Error('Empty product list from proxy')
    return { symbols: products, fallback: data.fallback || false, error: data.error || null }
  } catch (e) {
    console.warn('[Delta] fetchDeltaSymbols failed — using hardcoded fallback:', e.message)
    return { symbols: DELTA_FALLBACK_SYMBOLS, fallback: true, error: e.message }
  }
}

// ── Fetch OHLCV candles via proxy ─────────────────────────────────────────────
export async function fetchDeltaCandles(symbol, interval = '15m', limit = 60) {
  const resolution = DELTA_RES_MAP[interval] || '15'
  const resMs  = intervalToMs(interval)
  const now    = Math.floor(Date.now() / 1000)
  const start  = now - Math.ceil(resMs / 1000) * (limit + 5)

  try {
    const url = `/api/delta-candles?symbol=${symbol}&resolution=${resolution}&start=${start}&end=${now}`
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) })
    if (!res.ok) throw new Error(`Proxy error ${res.status}`)
    const data = await res.json()
    if (data.error) throw new Error(data.error)

    const raw = data.result || []
    if (raw.length < 3) return null

    const candles = raw
      .map(c => ({
        time:   c.time * 1000,
        open:   parseFloat(c.open),
        high:   parseFloat(c.high),
        low:    parseFloat(c.low),
        close:  parseFloat(c.close),
        volume: parseFloat(c.volume),
      }))
      .sort((a, b) => a.time - b.time)
      .slice(-limit)

    // Attach all indicators — same as Binance scanner for pattern compatibility
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
  } catch (e) {
    console.warn(`[Delta] fetchDeltaCandles ${symbol} failed:`, e.message)
    return null
  }
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
    atr = i < period ? atr + c._tr  : (atr * (period-1) + c._tr)  / period
    pdi = i < period ? pdi + c._pdm : (pdi * (period-1) + c._pdm) / period
    ndi = i < period ? ndi + c._ndm : (ndi * (period-1) + c._ndm) / period
    if (atr > 0) {
      const p = pdi/atr*100, n = ndi/atr*100
      c.dmi_plus = p; c.dmi_minus = n
      c.adx = (p+n) > 0 ? Math.abs(p-n)/(p+n)*100 : 0
    }
  }
}

function intervalToMs(tf) {
  return {'1m':60000,'3m':180000,'5m':300000,'15m':900000,
    '30m':1800000,'1h':3600000,'4h':14400000,'1d':86400000}[tf] || 900000
}

// ─── Fallback symbol list if proxy also fails ─────────────────────────────────
// Top Delta Exchange India USDT perpetuals by volume (manually curated)
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
].map(symbol => ({ symbol, name: symbol.replace('USDT',''), markPrice: 0, volume: 0 }))
