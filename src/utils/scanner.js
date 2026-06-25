// ─── Binance API ──────────────────────────────────────────────────────────────
const BASES = [
  'https://api.binance.com',
  'https://api1.binance.com',
  'https://api2.binance.com',
  'https://api3.binance.com',
  'https://api4.binance.com',
]

export async function fetchCandles(symbol, interval = '15m', limit = 60, ticker = null) {
  const path = `/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
  for (const base of BASES) {
    try {
      const res = await fetch(base + path, { signal: AbortSignal.timeout(8000) })
      if (!res.ok) continue
      const data = await res.json()
      const candles = data.map(([t, o, h, l, c, v]) => ({
        time: t,
        open: parseFloat(o),
        high: parseFloat(h),
        low: parseFloat(l),
        close: parseFloat(c),
        volume: parseFloat(v),
      }))
      // Attach EMAs (all periods) + RSI14 + DMI/ADX(14)
      attachEMA(candles, 10)
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
      // Attach 24h priceChangePercent to every candle if ticker provided
      if (ticker && ticker.priceChangePercent != null) {
        const pcp = ticker.priceChangePercent
        for (const c of candles) c.change24h = pcp
      }
      return candles
    } catch { /* try next mirror */ }
  }
  throw new Error(`Failed to fetch ${symbol}`)
}

// ─── RSI computation ──────────────────────────────────────────────────────────
// Computes RSI(14) and attaches .rsi to each candle in-place
export function attachRSI(candles, period = 14) {
  if (!candles || candles.length < period + 1) return
  let gains = 0, losses = 0
  for (let i = 1; i <= period; i++) {
    const diff = candles[i].close - candles[i - 1].close
    if (diff >= 0) gains += diff; else losses -= diff
  }
  let avgGain = gains / period
  let avgLoss = losses / period
  for (let i = 0; i < candles.length; i++) {
    if (i < period) { candles[i].rsi = null; continue }
    if (i === period) {
      candles[i].rsi = candles[i].rsi14 = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
    } else {
      const diff = candles[i].close - candles[i - 1].close
      avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period
      avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period
      candles[i].rsi = candles[i].rsi14 = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
    }
  }
}

// ─── EMA computation ──────────────────────────────────────────────────────────
// Computes EMA(period) using close prices and attaches .ema10 to each candle in-place
export function attachEMA(candles, period = 10) {
  if (!candles || candles.length < period) return
  const k = 2 / (period + 1)
  let ema = candles.slice(0, period).reduce((s, c) => s + c.close, 0) / period
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      candles[i].ema10 = null
    } else if (i === period - 1) {
      ema = candles.slice(0, period).reduce((s, c) => s + c.close, 0) / period
      candles[i].ema10 = ema
    } else {
      ema = candles[i].close * k + ema * (1 - k)
      candles[i].ema10 = ema
    }
  }
}

// Generic EMA attacher — attaches .ema{N} to each candle
export function attachEMAn(candles, period, key) {
  if (!candles || candles.length < period) return
  const k = 2 / (period + 1)
  let ema = candles.slice(0, period).reduce((s, c) => s + c.close, 0) / period
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      candles[i][key] = null
    } else if (i === period - 1) {
      ema = candles.slice(0, period).reduce((s, c) => s + c.close, 0) / period
      candles[i][key] = ema
    } else {
      ema = candles[i].close * k + ema * (1 - k)
      candles[i][key] = ema
    }
  }
}

// ─── DMI / ADX computation ────────────────────────────────────────────────────
// Attaches .diPlus, .diMinus, .adx to each candle (Wilder smoothing, period=14)
export function attachDMI(candles, period = 14) {
  if (!candles || candles.length < period + 1) return

  // Step 1 — raw directional movement and true range
  const dmPlus  = new Array(candles.length).fill(0)
  const dmMinus = new Array(candles.length).fill(0)
  const trArr   = new Array(candles.length).fill(0)

  for (let i = 1; i < candles.length; i++) {
    const curr = candles[i]
    const prev = candles[i - 1]
    const upMove   = curr.high - prev.high
    const downMove = prev.low  - curr.low
    dmPlus[i]  = (upMove > downMove && upMove > 0)   ? upMove   : 0
    dmMinus[i] = (downMove > upMove && downMove > 0) ? downMove : 0
    trArr[i]   = Math.max(
      curr.high - curr.low,
      Math.abs(curr.high - prev.close),
      Math.abs(curr.low  - prev.close)
    )
  }

  // Step 2 — Wilder smoothing over first `period` bars
  let smDmPlus  = dmPlus.slice(1, period + 1).reduce((s, v) => s + v, 0)
  let smDmMinus = dmMinus.slice(1, period + 1).reduce((s, v) => s + v, 0)
  let smTr      = trArr.slice(1, period + 1).reduce((s, v) => s + v, 0)

  // Step 3 — fill nulls for warmup candles
  for (let i = 0; i <= period; i++) {
    candles[i].diPlus  = null
    candles[i].diMinus = null
    candles[i].adx     = null
  }

  // Step 4 — compute DI+ / DI- for each candle after warmup
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

  // Step 5 — compute DX then smooth into ADX (Wilder, second pass)
  const dxArr = new Array(candles.length).fill(null)
  for (let i = period; i < candles.length; i++) {
    const sum = diPlusArr[i] + diMinusArr[i]
    dxArr[i]  = sum > 0 ? Math.abs(diPlusArr[i] - diMinusArr[i]) / sum * 100 : 0
  }

  // First ADX = simple avg of first `period` DX values starting at index `period`
  const adxStart = period * 2  // need period DX values (DX starts at index `period`)
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

// ─── Fetch ALL tradable USDT pairs from Binance exchange info ─────────────────
// Uses /api/v3/ticker/24hr as a secondary strategy (lighter payload)
// Falls back to TOP_SYMBOLS only as last resort
export async function fetchAllUSDTSymbols() {
  // Strategy 1: exchangeInfo (full list, heavy ~2MB)
  for (const base of BASES) {
    try {
      const res = await fetch(`${base}/api/v3/exchangeInfo`, { signal: AbortSignal.timeout(15000) })
      if (!res.ok) continue
      const data = await res.json()
      const syms = data.symbols
        .filter(s =>
          s.status === 'TRADING' &&
          s.quoteAsset === 'USDT' &&
          !s.symbol.includes('DOWN') &&
          !s.symbol.includes('UP') &&
          !s.symbol.includes('BULL') &&
          !s.symbol.includes('BEAR')
        )
        .map(s => s.symbol)
        .sort()
      if (syms.length > 50) return syms // success guard
    } catch { /* try next mirror */ }
  }

  // Strategy 2: derive from 24h ticker (already fetched in parallel, lighter)
  for (const base of BASES) {
    try {
      const res = await fetch(`${base}/api/v3/ticker/24hr`, { signal: AbortSignal.timeout(15000) })
      if (!res.ok) continue
      const data = await res.json()
      const syms = data
        .filter(t =>
          t.symbol.endsWith('USDT') &&
          !t.symbol.includes('DOWN') &&
          !t.symbol.includes('UP') &&
          !t.symbol.includes('BULL') &&
          !t.symbol.includes('BEAR')
        )
        .map(t => t.symbol)
        .sort()
      if (syms.length > 50) return syms
    } catch { /* try next mirror */ }
  }

  // Last resort — return null so callers know it truly failed (don't silently cap at 30)
  return null
}

// Fetch ALL symbols with retry — returns [symbols, didFail]
export async function fetchAllUSDTSymbolsWithRetry(retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const result = await fetchAllUSDTSymbols()
    if (result !== null) return [result, false]
    if (attempt < retries) await new Promise(r => setTimeout(r, 1500 * (attempt + 1)))
  }
  return [TOP_SYMBOLS, true] // true = fallback used
}

// Fetch 24h ticker for all pairs (volume/price data)
export async function fetch24hTickers() {
  for (const base of BASES) {
    try {
      const res = await fetch(`${base}/api/v3/ticker/24hr`, { signal: AbortSignal.timeout(12000) })
      if (!res.ok) continue
      const data = await res.json()
      return data.filter(t => t.symbol.endsWith('USDT'))
        .reduce((acc, t) => {
          acc[t.symbol] = {
            priceChangePercent: parseFloat(t.priceChangePercent),
            volume: parseFloat(t.quoteVolume),
            lastPrice: parseFloat(t.lastPrice),
          }
          return acc
        }, {})
    } catch { /* next mirror */ }
  }
  return {}
}

// ─── Top symbols + Indian exchange coverage ───────────────────────────────────
// NOTE: Delta Exchange India and CoinDCX/WazirX use their own APIs incompatible
// with the Binance OHLCV scanner format. Their coins that are ALSO listed on
// Binance are included here so they appear in the full scan. Coins exclusive
// to Indian exchanges (INR pairs only) cannot be scanned via this engine.
export const TOP_SYMBOLS = [
  // ── Tier 1 — Mega caps (all Indian exchanges) ───────────────────────────────
  'BTCUSDT','ETHUSDT','BNBUSDT','SOLUSDT','XRPUSDT',
  'ADAUSDT','DOGEUSDT','AVAXUSDT','MATICUSDT','DOTUSDT',

  // ── Tier 2 — Large caps ─────────────────────────────────────────────────────
  'LINKUSDT','UNIUSDT','LTCUSDT','ATOMUSDT','NEARUSDT',
  'APTUSDT','ARBUSDT','OPUSDT','INJUSDT','SUIUSDT',
  'SHIBUSDT','TRXUSDT','TONUSDT','FETUSDT','RNDRUSDT',
  'WIFUSDT','PEPEUSDT','FLOKIUSDT','TIAUSDT','JUPUSDT',

  // ── Tier 3 — Mid caps ───────────────────────────────────────────────────────
  'AAVEUSDT','SNXUSDT','CRVUSDT','MKRUSDT','COMPUSDT',
  'LDOUSDT','STXUSDT','GRTUSDT','IMXUSDT','MANTAUSDT',
  'EIGENUSDT','ENAUSDT','PYTHUSDT','WUSDT','ALTUSDT',
  'JTOUSDT','DYMUSDT','SEIUSDT','BLURUSDT','PERPUSDT',
  'KAVAUSDT','ZILUSDT','IOSTUSDT','IOTXUSDT','ONTUSDT',
  'HBARUSDT','ALGOUSDT','XLMUSDT','VETUSDT','FILUSDT',
  'EGLDUSDT','ICPUSDT','FLOWUSDT','AXSUSDT','SANDUSDT',
  'MANAUSDT','APEUSDT','GMTUSDT','GALUSDT',
  'FTMUSDT','KLAYUSDT','STORJUSDT','RLCUSDT','CTSIUSDT',
  'BANDUSDT','TRUUSDT','ANKRUSDT','MASKUSDT','BNTUSDT',
  'UMAUSDT','RENUSDT','KNCUSDT','CVXUSDT','FXSUSDT',
  'STGUSDT','THETAUSDT','ONEUSDT','HNTUSDT','RAYUSDT',

  // ── Delta Exchange India popular futures ────────────────────────────────────
  // These coins trade as USDT perps on Delta India AND are on Binance
  'CELOUSDT','COTIUSDT','BAKEUSDT','CAKEUSDT','ALPACAUSDT',
  'MIRUSDT','RIFUSDT','DREPUSDT','FLMUSDT',
  'XVGUSDT','TUSDT','ACHUSDT',

  // ── CoinDCX / WazirX popular coins (Binance listed) ────────────────────────
  'CHZUSDT','ENJUSDT','BATUSDT','ZRXUSDT','LRCUSDT',
  'AUDIOUSDT','CTXCUSDT','REQUSDT','POWRUSDT','FUNUSDT',
  'MTLUSDT','POLYUSDT','OXTUSDT','NKNUSDT','PONDUSDT',
  'CFXUSDT','HOOKUSDT','HIGHUSDT','PHBUSDT','MAGICUSDT',
  'LDOUSDT','AMBUSDT','GALUSDT','PROSUSDT','REIUSDT',
  'ASTRUSDT','SSVUSDT','IDUSDT','EDUUSDT','SUIUSDT',
  'ACEUSDT','NFPUSDT','AIUSDT','XAIUSDT','MANTAUSDT',
  'ALTUSDT','JUPUSDT','RONINUSDT','PIXELUSDT','PORTALUSDT',
  'AXLUSDT','WLDUSDT','CYBERUSDT','ARKMUSDT','GLMUSDT',
  'BONDUSDT','FORTHUSDT','BADGERUSDT','ALPHALUSDT','BALUSUSDT',

  // ── Additional Delta India perpetuals (high volume) ─────────────────────────
  'ORDIUSDT','SATSUSDT','RATS','1000SATSUSDT','BOMEUSDT',
  'MEMEUSDT','WIFUSDT','BRETTUSDT','MEWUSDT','DOGENUSDT',
  'DOGSUSDT','NOTUSDT','HMSTRUSDT','CATIUSDT','EIGENUSDT',
  'SCRUSDT','NEIROUSDT','TURBOUSDT','GOATUSDT','PNUTUSDT',
  'ACTUSDT','OMUSDT','MOVEUSDT','VIRTUALUSDT','THEUSDT',

  // ── Popular Indian altcoins also on Binance ──────────────────────────────────
  'POLUSDT','GALAUSDT','ILVUSDT','SLPUSDT','YGG',
  'ALICEUSDT','TLMUSDT','DYDXUSDT','STMXUSDT','NULSUSDT',
  'DENTUSDT','WINUSDT','HOTUSDT','CELRUSDT','CVCUSDT',
  'QTUMUSDT','ICXUSDT','ZENUSDT','LSKUSDT','NANOUSUSDT',
  'WAVESUSDT','SCUSDT','DGBUSDT','REEFUSDT','HARDUSDT',
  'SXPUSDT','WINGUSDT','LITUSDT','UNFIUSDT','BELUSDT',
  'VITEUSDT','RSRUSDT','MBLUSDT','IRISUSDT','MDTUSDT',
  'TRIBEUSDT','CFXUSDT','LQTYUSDT','BNXUSDT','REIUSDT',
]

// ─── Sound ────────────────────────────────────────────────────────────────────
export function playBeep(isBear = false) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.connect(g); g.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(isBear ? 440 : 880, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(isBear ? 220 : 440, ctx.currentTime + 0.3)
    g.gain.setValueAtTime(0.25, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45)
    osc.start(); osc.stop(ctx.currentTime + 0.45)
  } catch { /* audio blocked */ }
}

// ─── Telegram ─────────────────────────────────────────────────────────────────
export async function sendTelegram(botToken, chatId, text) {
  if (!botToken || !chatId) return
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  })
}

export function buildTelegramMsg(alert) {
  const isBull = alert.side === 'bull'
  const dir = isBull ? '🟢 BULL' : '🔴 BEAR'
  return `${dir} <b>${alert.symbol}</b> — ${alert.scannerName}\n📊 TF: ${alert.timeframe} | ${isBull ? '+' : '-'}${alert.details.gainPct}% | ${alert.details.candleCount} candles\n⏱ ${new Date(alert.time).toUTCString()}`
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
export function intervalToMs(i) {
  return {
    '15s': 15000,'30s': 30000,
    '1m': 60000,'3m': 180000,'5m': 300000,'15m': 900000,
    '30m': 1800000,'1h': 3600000,'4h': 14400000,'1d': 86400000,
  }[i] || 300000
}

export function fmt(n) {
  if (typeof n !== 'number' || isNaN(n)) return '—'
  if (n > 10000) return n.toFixed(0)
  if (n > 100) return n.toFixed(2)
  if (n > 1) return n.toFixed(4)
  return n.toFixed(6)
}

export function timeSince(ts) {
  const d = (Date.now() - ts) / 1000
  if (d < 60) return `${Math.floor(d)}s ago`
  if (d < 3600) return `${Math.floor(d / 60)}m ago`
  return `${Math.floor(d / 3600)}h ago`
}

export function fmtVol(v) {
  if (v >= 1e9) return (v/1e9).toFixed(1) + 'B'
  if (v >= 1e6) return (v/1e6).toFixed(1) + 'M'
  if (v >= 1e3) return (v/1e3).toFixed(1) + 'K'
  return v.toFixed(0)
}
