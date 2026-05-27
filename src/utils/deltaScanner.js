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
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) })
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
  let avgGain = 0, avgLoss = 0
  for (let i = 1; i <= period && i < candles.length; i++) {
    const d = candles[i].close - candles[i-1].close
    if (d > 0) avgGain += d / period; else avgLoss += -d / period
  }
  for (let i = period; i < candles.length; i++) {
    if (i > period) {
      const d = candles[i].close - candles[i-1].close
      avgGain = (avgGain * (period-1) + Math.max(0,  d)) / period
      avgLoss = (avgLoss * (period-1) + Math.max(0, -d)) / period
    }
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss
    candles[i].rsi14 = 100 - 100 / (1 + rs)
  }
}

function attachDMI(candles, period = 14) {
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i], p = candles[i-1]
    const up = c.high - p.high, dn = p.low - c.low
    c._pdm = up > dn && up > 0 ? up : 0
    c._ndm = dn > up && dn > 0 ? dn : 0
    c._tr  = Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close))
  }
  let atr = 0, pdi = 0, ndi = 0
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i]
    atr = i < period ? atr + c._tr  : (atr*(period-1) + c._tr)  / period
    pdi = i < period ? pdi + c._pdm : (pdi*(period-1) + c._pdm) / period
    ndi = i < period ? ndi + c._ndm : (ndi*(period-1) + c._ndm) / period
    if (atr > 0) {
      const pp = pdi/atr*100, np = ndi/atr*100
      c.dmi_plus = pp; c.dmi_minus = np
      c.adx = (pp+np) > 0 ? Math.abs(pp-np)/(pp+np)*100 : 0
    }
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
