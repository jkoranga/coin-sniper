// ─── Coins Sniper — Delta India Perpetuals via Bybit feed ─────────────────────
// Delta India's API blocks ALL external IPs (Cloudflare WAF allowlist).
// Bybit carries the same USDT perpetuals at near-identical prices.
// Their API is fully open CORS — works from browser AND Vercel with no auth.

const BYBIT  = 'https://api.bybit.com'
const BYBIT2 = 'https://api-testnet.bybit.com' // fallback

const INTERVAL_MAP = {
  '1m':'1','3m':'3','5m':'5','15m':'15','30m':'30',
  '1h':'60','4h':'240','1d':'D','Day':'D',
}

// ── Fetch all active USDT perpetuals ─────────────────────────────────────────
export async function fetchDeltaSymbols() {
  // Bybit /v5/market/tickers has live price + volume (turnover24h) for all linear perps
  const URLS = [
    `${BYBIT}/v5/market/tickers?category=linear`,
    `${BYBIT2}/v5/market/tickers?category=linear`,
    `/api/delta-symbols`,
  ]

  for (const url of URLS) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
      if (!res.ok) continue
      const data = await res.json()

      // Bybit tickers shape: { retCode:0, result:{ list:[{ symbol, lastPrice, turnover24h, volume24h, ... }] } }
      if (data.retCode === 0 && Array.isArray(data.result?.list)) {
        const products = data.result.list
          .filter(p =>
            p.symbol?.endsWith('USDT') &&
            !p.symbol?.includes('-') // exclude options
          )
          .map(p => ({
            symbol:    p.symbol,
            name:      p.symbol.replace('USDT', ''),
            markPrice: parseFloat(p.lastPrice    || p.markPrice || 0),
            volume:    parseFloat(p.turnover24h  || 0), // 24h volume in USDT — what filters use
          }))
          .filter(p => p.volume > 0)
          .sort((a, b) => b.volume - a.volume)
        if (products.length > 0) {
          console.log(`[Sniper] Bybit tickers: ${products.length} symbols`)
          return { symbols: products, fallback: false, error: null }
        }
      }

      // Proxy/fallback shape: { products:[...] }
      if (Array.isArray(data.products) && data.products.length > 0) {
        return { symbols: data.products, fallback: data.fallback || true, error: null }
      }
    } catch (e) {
      console.warn('[Sniper] Symbol fetch failed:', url, e.message)
    }
  }

  return { symbols: DELTA_FALLBACK_SYMBOLS, fallback: true, error: 'All sources failed' }
}

// ── Fetch OHLCV candles ───────────────────────────────────────────────────────
export async function fetchDeltaCandles(symbol, interval = '15m', limit = 60) {
  const iv = INTERVAL_MAP[interval] || '15'

  // Bybit kline endpoint — open CORS, no auth, rate-limit generous
  const URLS = [
    `${BYBIT}/v5/market/kline?category=linear&symbol=${symbol}&interval=${iv}&limit=${limit + 5}`,
    `${BYBIT2}/v5/market/kline?category=linear&symbol=${symbol}&interval=${iv}&limit=${limit + 5}`,
    `/api/delta-candles?symbol=${symbol}&resolution=${iv}&limit=${limit}`,
  ]

  for (const url of URLS) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2500) })
      if (!res.ok) continue
      const data = await res.json()

      // Bybit shape: { retCode:0, result:{ list:[ [time,open,high,low,close,vol,turnover], ... ] } }
      if (data.retCode === 0 && Array.isArray(data.result?.list) && data.result.list.length >= 3) {
        const raw = data.result.list
          .map(c => ({
            time:   parseInt(c[0]),      // ms already
            open:   parseFloat(c[1]),
            high:   parseFloat(c[2]),
            low:    parseFloat(c[3]),
            close:  parseFloat(c[4]),
            volume: parseFloat(c[5]),
          }))
          .filter(c => c.close > 0)
          .sort((a, b) => a.time - b.time) // Bybit returns newest first
          .slice(-limit)
        if (raw.length >= 3) return attachIndicators(raw)
      }

      // Proxy/Delta shape: { result:[ {time,open,high,low,close,volume} ] }
      if (Array.isArray(data.result) && data.result.length >= 3) {
        const raw = data.result
          .map(c => ({
            time:   (c.time || c.t) * (c.time > 1e10 ? 1 : 1000),
            open:   parseFloat(c.open  || c.o),
            high:   parseFloat(c.high  || c.h),
            low:    parseFloat(c.low   || c.l),
            close:  parseFloat(c.close || c.c),
            volume: parseFloat(c.volume|| c.v || 0),
          }))
          .filter(c => c.close > 0)
          .sort((a, b) => a.time - b.time)
          .slice(-limit)
        if (raw.length >= 3) return attachIndicators(raw)
      }
    } catch (e) {
      console.warn(`[Sniper] Candle fetch failed for ${symbol}:`, e.message)
    }
  }

  return null
}

// ─── Indicators ───────────────────────────────────────────────────────────────
function attachIndicators(candles) {
  const periods = [5,9,15,16,20,25,30,40,50,60,75,80,100,120,150,200,300,600]
  for (const p of periods) attachEMAn(candles, p, `ema${p}`)
  attachRSI(candles, 14)
  attachDMI(candles, 14)
  return candles
}

function attachEMAn(candles, period, key) {
  const k = 2 / (period + 1)
  let ema = null
  for (const c of candles) {
    ema = ema === null ? c.close : c.close * k + ema * (1 - k)
    c[key] = ema
  }
}

function attachRSI(candles, period = 14) {
  // Proper Wilder smoothing — matches scanner.js and TradingView
  if (!candles || candles.length < period + 1) return
  let gains = 0, losses = 0
  for (let i = 1; i <= period; i++) {
    const diff = candles[i].close - candles[i - 1].close
    if (diff >= 0) gains += diff; else losses -= diff
  }
  let avgGain = gains / period
  let avgLoss = losses / period
  for (let i = 0; i < candles.length; i++) {
    if (i < period) { candles[i].rsi = null; candles[i].rsi14 = null; continue }
    if (i === period) {
      const v = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
      candles[i].rsi = v; candles[i].rsi14 = v
    } else {
      const diff = candles[i].close - candles[i - 1].close
      avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period
      avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period
      const v = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
      candles[i].rsi = v; candles[i].rsi14 = v
    }
  }
}

function attachDMI(candles, period = 14) {
  // Proper Wilder smoothing — matches scanner.js and TradingView
  if (!candles || candles.length < period + 1) return
  const dmPlus  = new Array(candles.length).fill(0)
  const dmMinus = new Array(candles.length).fill(0)
  const trArr   = new Array(candles.length).fill(0)
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i], p = candles[i - 1]
    const up = c.high - p.high, dn = p.low - c.low
    dmPlus[i]  = (up > dn && up > 0) ? up : 0
    dmMinus[i] = (dn > up && dn > 0) ? dn : 0
    trArr[i]   = Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close))
  }
  let smDmPlus  = dmPlus.slice(1, period + 1).reduce((s, v) => s + v, 0)
  let smDmMinus = dmMinus.slice(1, period + 1).reduce((s, v) => s + v, 0)
  let smTr      = trArr.slice(1, period + 1).reduce((s, v) => s + v, 0)
  for (let i = 0; i <= period; i++) {
    candles[i].diPlus = null; candles[i].diMinus = null; candles[i].adx = null
  }
  const diPlusArr  = new Array(candles.length).fill(null)
  const diMinusArr = new Array(candles.length).fill(null)
  candles[period].diPlus  = smTr > 0 ? (smDmPlus  / smTr) * 100 : 0
  candles[period].diMinus = smTr > 0 ? (smDmMinus / smTr) * 100 : 0
  diPlusArr[period]  = candles[period].diPlus
  diMinusArr[period] = candles[period].diMinus
  for (let i = period + 1; i < candles.length; i++) {
    smDmPlus  = smDmPlus  - smDmPlus  / period + dmPlus[i]
    smDmMinus = smDmMinus - smDmMinus / period + dmMinus[i]
    smTr      = smTr      - smTr      / period + trArr[i]
    candles[i].diPlus  = smTr > 0 ? (smDmPlus  / smTr) * 100 : 0
    candles[i].diMinus = smTr > 0 ? (smDmMinus / smTr) * 100 : 0
    diPlusArr[i]  = candles[i].diPlus
    diMinusArr[i] = candles[i].diMinus
  }
  const dxArr = new Array(candles.length).fill(null)
  for (let i = period; i < candles.length; i++) {
    const sum = diPlusArr[i] + diMinusArr[i]
    dxArr[i] = sum > 0 ? Math.abs(diPlusArr[i] - diMinusArr[i]) / sum * 100 : 0
  }
  const adxStart = period * 2
  if (candles.length <= adxStart) return
  let adx = 0
  for (let i = period; i < adxStart; i++) adx += dxArr[i]
  adx /= period
  candles[adxStart - 1].adx = adx
  for (let i = adxStart; i < candles.length; i++) {
    adx = (adx * (period - 1) + dxArr[i]) / period
    candles[i].adx = adx
  }
}

// ─── Fallback 65 Delta India perpetuals ──────────────────────────────────────
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
].map(s => ({ symbol:s, name:s.replace('USDT',''), markPrice:0, volume:0 }))
