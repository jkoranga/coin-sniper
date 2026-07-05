// Forex Scanner Engine
// Pattern detection for major forex pairs

const MAJOR_PAIRS = [
  'EUR_USD', 'GBP_USD', 'USD_JPY', 'USD_CHF',
  'AUD_USD', 'USD_CAD', 'NZD_USD', 'EUR_GBP',
  'EUR_JPY', 'GBP_JPY', 'AUD_JPY', 'EUR_CHF'
]

const MINOR_PAIRS = [
  'EUR_AUD', 'EUR_CAD', 'GBP_AUD', 'GBP_CHF',
  'CHF_JPY', 'AUD_CHF', 'CAD_JPY', 'NZD_JPY',
  'GBP_CAD', 'AUD_NZD', 'EUR_NZD', 'GBP_NZD'
  
]

const EXOTIC_PAIRS = [
  'USD_SGD', 'USD_HKD', 'USD_CNH', 'USD_SEK',
  'USD_NOK', 'USD_DKK', 'USD_ZAR', 'USD_MXN',
  'USD_PLN', 'USD_TRY', 'USD_CZK', 'USD_HUF'
]

export const PATTERN_TYPES = {
  HARMONIC: 'harmonic',
  SUPPORT_RESISTANCE: 'supportResistance',
  DIVERGENCE: 'divergence',
  BREAKOUT: 'breakout'
}

const PATTERNS = {
  // Harmonic Patterns
  GARTLEY_BULL: {
    id: 'gartley_bull',
    name: 'Bullish Gartley',
    type: PATTERN_TYPES.HARMONIC,
    side: 'bull',
    description: 'M-shaped retracement with precise Fibonacci ratios'
  },
  GARTLEY_BEAR: {
    id: 'gartley_bear',
    name: 'Bearish Gartley',
    type: PATTERN_TYPES.HARMONIC,
    side: 'bear',
    description: 'W-shaped retracement with precise Fibonacci ratios'
  },
  BUTTERFLY_BULL: {
    id: 'butterfly_bull',
    name: 'Bullish Butterfly',
    type: PATTERN_TYPES.HARMONIC,
    side: 'bull',
    description: 'Extension pattern beyond X point'
  },
  BUTTERFLY_BEAR: {
    id: 'butterfly_bear',
    name: 'Bearish Butterfly',
    type: PATTERN_TYPES.HARMONIC,
    side: 'bear',
    description: 'Extension pattern below X point'
  },
  BAT_BULL: {
    id: 'bat_bull',
    name: 'Bullish Bat',
    type: PATTERN_TYPES.HARMONIC,
    side: 'bull',
    description: 'Deep retracement to 88.6% of XA'
  },
  BAT_BEAR: {
    id: 'bat_bear',
    name: 'Bearish Bat',
    type: PATTERN_TYPES.HARMONIC,
    side: 'bear',
    description: 'Deep retracement to 88.6% of XA'
  },
  
  // Support/Resistance
  SUPPORT_BOUNCE: {
    id: 'support_bounce',
    name: 'Support Bounce',
    type: PATTERN_TYPES.SUPPORT_RESISTANCE,
    side: 'bull',
    description: 'Price bouncing off support level'
  },
  RESISTANCE_REJECT: {
    id: 'resistance_reject',
    name: 'Resistance Rejection',
    type: PATTERN_TYPES.SUPPORT_RESISTANCE,
    side: 'bear',
    description: 'Price rejected at resistance level'
  },
  
  // Divergence
  RSI_BULL_DIVERGENCE: {
    id: 'rsi_bull_div',
    name: 'RSI Bullish Divergence',
    type: PATTERN_TYPES.DIVERGENCE,
    side: 'bull',
    description: 'Price lower low, RSI higher low'
  },
  RSI_BEAR_DIVERGENCE: {
    id: 'rsi_bear_div',
    name: 'RSI Bearish Divergence',
    type: PATTERN_TYPES.DIVERGENCE,
    side: 'bear',
    description: 'Price higher high, RSI lower high'
  },
  MACD_BULL_DIVERGENCE: {
    id: 'macd_bull_div',
    name: 'MACD Bullish Divergence',
    type: PATTERN_TYPES.DIVERGENCE,
    side: 'bull',
    description: 'Price lower low, MACD histogram higher'
  },
  MACD_BEAR_DIVERGENCE: {
    id: 'macd_bear_div',
    name: 'MACD Bearish Divergence',
    type: PATTERN_TYPES.DIVERGENCE,
    side: 'bear',
    description: 'Price higher high, MACD histogram lower'
  },
  
  // Breakouts
  SUPPORT_BREAKDOWN: {
    id: 'support_break',
    name: 'Support Breakdown',
    type: PATTERN_TYPES.BREAKOUT,
    side: 'bear',
    description: 'Price broke below key support'
  },
  RESISTANCE_BREAKOUT: {
    id: 'resistance_break',
    name: 'Resistance Breakout',
    type: PATTERN_TYPES.BREAKOUT,
    side: 'bull',
    description: 'Price broke above key resistance'
  },
  VOLATILITY_SQUEEZE: {
    id: 'vol_squeeze',
    name: 'Volatility Squeeze',
    type: PATTERN_TYPES.BREAKOUT,
    side: 'bull',
    description: 'Low volatility period, breakout imminent'
  }
}

// Get available pairs based on set
export async function getAvailablePairs(set = 'major') {
  switch (set) {
    case 'major': return MAJOR_PAIRS
    case 'minor': return [...MAJOR_PAIRS, ...MINOR_PAIRS]
    case 'exotic': return [...MAJOR_PAIRS, ...MINOR_PAIRS, ...EXOTIC_PAIRS]
    case 'all': return [...MAJOR_PAIRS, ...MINOR_PAIRS, ...EXOTIC_PAIRS]
    default: return MAJOR_PAIRS
  }
}

// Fetch candles from OANDA API
async function fetchOANDACandles(pair, timeframe, count = 100) {
  const granularity = {
    '1m': 'M1', '5m': 'M5', '15m': 'M15', '30m': 'M30',
    '1h': 'H1', '2h': 'H2', '4h': 'H4', '6h': 'H6',
    '8h': 'H8', '12h': 'H12', '1D': 'D', '1W': 'W'
  }[timeframe] || 'H1'
  
  try {
    const response = await fetch(
      `https://api-fxtrade.oanda.com/v3/instruments/${pair}/candles?count=${count}&granularity=${granularity}`,
      {
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_OANDA_API_KEY || ''}`,
          'Accept': 'application/json'
        }
      }
    )
    
    if (!response.ok) throw new Error('OANDA API error')
    
    const data = await response.json()
    return data.candles?.map(c => ({
      time: new Date(c.time).getTime(),
      open: parseFloat(c.mid.o),
      high: parseFloat(c.mid.h),
      low: parseFloat(c.mid.l),
      close: parseFloat(c.mid.c),
      volume: parseInt(c.volume, 10)
    })) || []
  } catch (e) {
    // Fallback: generate sample data for demo
    return generateSampleCandles(pair, count)
  }
}

// Generate sample candles for demo when API unavailable
function generateSampleCandles(pair, count = 100) {
  const candles = []
  let price = pair.includes('JPY') ? 150 : 1.1
  
  for (let i = count; i >= 0; i--) {
    const time = Date.now() - i * 3600000
    const change = (Math.random() - 0.5) * 0.01
    const open = price
    const close = price * (1 + change)
    const high = Math.max(open, close) * (1 + Math.random() * 0.005)
    const low = Math.min(open, close) * (1 - Math.random() * 0.005)
    
    candles.push({
      time,
      open,
      high,
      low,
      close,
      volume: Math.floor(Math.random() * 10000) + 1000
    })
    
    price = close
  }
  
  return candles
}

// Calculate technical indicators
function calculateEMA(prices, period) {
  const k = 2 / (period + 1)
  const emas = [prices[0]]
  
  for (let i = 1; i < prices.length; i++) {
    emas.push(prices[i] * k + emas[i - 1] * (1 - k))
  }
  
  return emas
}

function calculateRSI(prices, period = 14) {
  const changes = []
  for (let i = 1; i < prices.length; i++) {
    changes.push(prices[i] - prices[i - 1])
  }
  
  const rsi = []
  for (let i = period; i < changes.length; i++) {
    const slice = changes.slice(i - period, i)
    const gains = slice.filter(c => c > 0).reduce((a, b) => a + b, 0) / period
    const losses = Math.abs(slice.filter(c => c < 0).reduce((a, b) => a + b, 0)) / period
    
    if (losses === 0) rsi.push(100)
    else rsi.push(100 - (100 / (1 + gains / losses)))
  }
  
  return rsi
}

function calculateMACD(prices, fast = 12, slow = 26, signal = 9) {
  const emaFast = calculateEMA(prices, fast)
  const emaSlow = calculateEMA(prices, slow)
  const macdLine = emaFast.slice(emaFast.length - emaSlow.length).map((f, i) => f - emaSlow[i])
  const signalLine = calculateEMA(macdLine, signal)
  const histogram = macdLine.slice(macdLine.length - signalLine.length).map((m, i) => m - signalLine[i])
  
  return { macdLine, signalLine, histogram }
}

// Pattern detection algorithms
function detectHarmonicPatterns(candles) {
  const patterns = []
  const highs = candles.map(c => c.high)
  const lows = candles.map(c => c.low)
  const closes = candles.map(c => c.close)
  
  const n = candles.length
  if (n < 20) return patterns
  
  // Simplified Gartley detection (X-A-B-C-D structure)
  const X = { price: highs[n - 20], idx: n - 20 }
  const A = { price: lows[n - 15], idx: n - 15 }
  const B = { price: highs[n - 10], idx: n - 10 }
  const C = { price: lows[n - 5], idx: n - 5 }
  const D = { price: closes[n - 1], idx: n - 1 }
  
  // Bullish Gartley check
  if (X.price > A.price && A.price < B.price && B.price > C.price && C.price < D.price) {
    const XA = X.price - A.price
    const AB = B.price - A.price
    const BC = B.price - C.price
    const CD = D.price - C.price
    
    // Check Fibonacci ratios (simplified)
    if (AB/XA > 0.618 && AB/XA < 0.786 && BC/AB > 0.382 && BC/AB < 0.886) {
      patterns.push({
        pattern: PATTERNS.GARTLEY_BULL,
        confidence: Math.min(85, Math.round((AB/XA + BC/AB) * 50)),
        entry: D.price,
        stop: C.price - XA * 0.1,
        target: D.price + XA * 0.618
      })
    }
  }
  
  // Bearish Gartley check
  if (X.price < A.price && A.price > B.price && B.price < C.price && C.price > D.price) {
    const XA = A.price - X.price
    const AB = A.price - B.price
    const BC = C.price - B.price
    const CD = C.price - D.price
    
    if (AB/XA > 0.618 && AB/XA < 0.786 && BC/AB > 0.382 && BC/AB < 0.886) {
      patterns.push({
        pattern: PATTERNS.GARTLEY_BEAR,
        confidence: Math.min(85, Math.round((AB/XA + BC/AB) * 50)),
        entry: D.price,
        stop: C.price + XA * 0.1,
        target: D.price - XA * 0.618
      })
    }
  }
  
  return patterns
}

function detectSupportResistance(candles) {
  const patterns = []
  const highs = candles.map(c => c.high)
  const lows = candles.map(c => c.low)
  const closes = candles.map(c => c.close)
  const currentPrice = closes[closes.length - 1]
  
  // Find local highs/lows
  const lookback = 10
  const resistance = Math.max(...highs.slice(-lookback - 5, -lookback))
  const support = Math.min(...lows.slice(-lookback - 5, -lookback))
  
  // Support bounce
  const supportTouch = Math.abs(currentPrice - support) / support < 0.005
  const nearSupport = currentPrice > support && currentPrice < support * 1.01
  
  if (nearSupport && supportTouch) {
    const recentCloses = closes.slice(-5)
    const direction = recentCloses[recentCloses.length - 1] - recentCloses[0]
    
    if (direction > 0) {
      patterns.push({
        pattern: PATTERNS.SUPPORT_BOUNCE,
        confidence: Math.min(90, 60 + Math.abs(direction) * 1000),
        level: support,
        touches: 2
      })
    }
  }
  
  // Resistance rejection
  const resistanceTouch = Math.abs(currentPrice - resistance) / resistance < 0.005
  const nearResistance = currentPrice < resistance && currentPrice > resistance * 0.99
  
  if (nearResistance && resistanceTouch) {
    const recentCloses = closes.slice(-5)
    const direction = recentCloses[recentCloses.length - 1] - recentCloses[0]
    
    if (direction < 0) {
      patterns.push({
        pattern: PATTERNS.RESISTANCE_REJECT,
        confidence: Math.min(90, 60 + Math.abs(direction) * 1000),
        level: resistance,
        touches: 2
      })
    }
  }
  
  return patterns
}

function detectDivergence(candles) {
  const patterns = []
  const closes = candles.map(c => c.close)
  
  // Calculate RSI
  const rsi = calculateRSI(closes, 14)
  const rsiValues = rsi.slice(-20)
  const priceValues = closes.slice(-20)
  
  if (rsiValues.length < 10) return patterns
  
  // Bullish divergence: price lower low, RSI higher low
  const priceLL = Math.min(...priceValues.slice(0, -5))
  const priceRecent = priceValues[priceValues.length - 1]
  const rsiLL = Math.min(...rsiValues.slice(0, -5))
  const rsiRecent = rsiValues[rsiValues.length - 1]
  
  if (priceRecent < priceLL && rsiRecent > rsiLL && priceRecent < priceLL * 1.02) {
    patterns.push({
      pattern: PATTERNS.RSI_BULL_DIVERGENCE,
      confidence: Math.min(85, 70 + (rsiRecent - rsiLL) * 0.5),
      rsi: rsiRecent,
      priceLow: priceRecent
    })
  }
  
  // Bearish divergence: price higher high, RSI lower high
  const priceHH = Math.max(...priceValues.slice(0, -5))
  const rsiHH = Math.max(...rsiValues.slice(0, -5))
  
  if (priceRecent > priceHH && rsiRecent < rsiHH && priceRecent > priceHH * 0.98) {
    patterns.push({
      pattern: PATTERNS.RSI_BEAR_DIVERGENCE,
      confidence: Math.min(85, 70 + (rsiHH - rsiRecent) * 0.5),
      rsi: rsiRecent,
      priceHigh: priceRecent
    })
  }
  
  return patterns
}

function detectBreakouts(candles) {
  const patterns = []
  const closes = candles.map(c => c.close)
  const highs = candles.map(c => c.high)
  const lows = candles.map(c => c.low)
  const volumes = candles.map(c => c.volume)
  
  const current = closes[closes.length - 1]
  const prevClose = closes[closes.length - 2]
  
  // 20-period channels
  const lookback = 20
  const upperChannel = Math.max(...highs.slice(-lookback - 1, -1))
  const lowerChannel = Math.min(...lows.slice(-lookback - 1, -1))
  
  const avgVolume = volumes.slice(-lookback).reduce((a, b) => a + b, 0) / lookback
  const currentVolume = volumes[volumes.length - 1]
  const volumeSpike = currentVolume > avgVolume * 1.5
  
  // Resistance breakout
  if (current > upperChannel && prevClose <= upperChannel && volumeSpike) {
    patterns.push({
      pattern: PATTERNS.RESISTANCE_BREAKOUT,
      confidence: Math.min(90, 65 + (currentVolume / avgVolume) * 10),
      breakoutLevel: upperChannel,
      volumeRatio: currentVolume / avgVolume
    })
  }
  
  // Support breakdown
  if (current < lowerChannel && prevClose >= lowerChannel && volumeSpike) {
    patterns.push({
      pattern: PATTERNS.SUPPORT_BREAKDOWN,
      confidence: Math.min(90, 65 + (currentVolume / avgVolume) * 10),
      breakoutLevel: lowerChannel,
      volumeRatio: currentVolume / avgVolume
    })
  }
  
  // Volatility squeeze (Bollinger Band contraction)
  const sma = closes.slice(-lookback).reduce((a, b) => a + b) / lookback
  const stdDev = Math.sqrt(
    closes.slice(-lookback).reduce((sum, p) => sum + Math.pow(p - sma, 2), 0) / lookback
  )
  const bandwidth = (upperChannel - lowerChannel) / sma
  
  if (bandwidth < 0.04 && closes[closes.length - 1] > closes[closes.length - 5]) {
    patterns.push({
      pattern: PATTERNS.VOLATILITY_SQUEEZE,
      confidence: Math.min(85, 60 + (0.04 - bandwidth) * 1000),
      bandwidth
    })
  }
  
  return patterns
}

// Main scan function
export async function scanForexPairs(pairs, timeframe, provider, options = {}) {
  const { patternsEnabled = {}, signal } = options
  const results = []
  
  const enabledTypes = Object.keys(patternsEnabled).filter(k => patternsEnabled[k])
  if (enabledTypes.length === 0) return results
  
  for (const pair of pairs) {
    if (signal?.aborted) break
    
    try {
      const candles = await fetchOANDACandles(pair, timeframe, 100)
      if (candles.length < 30) continue
      
      const closePrices = candles.map(c => c.close)
      const currentPrice = closePrices[closePrices.length - 1]
      const prevPrice = closePrices[closePrices.length - 2]
      const change = ((currentPrice - prevPrice) / prevPrice) * 100
      
      // Check all enabled pattern types
      const detected = []
      
      if (patternsEnabled.harmonic) {
        detected.push(...detectHarmonicPatterns(candles))
      }
      
      if (patternsEnabled.supportResistance) {
        detected.push(...detectSupportResistance(candles))
      }
      
      if (patternsEnabled.divergence) {
        detected.push(...detectDivergence(candles))
      }
      
      if (patternsEnabled.breakout) {
        detected.push(...detectBreakouts(candles))
      }
      
      // Add results for detected patterns
      for (const d of detected) {
        results.push({
          symbol: pair.replace('_', '/'),
          timeframe,
          pattern: d.pattern.name,
          patternType: d.pattern.type,
          side: d.pattern.side,
          price: currentPrice,
          change: change.toFixed(4),
          confidence: d.confidence,
          details: d
        })
      }
    } catch (e) {
      console.warn(`Failed to scan ${pair}:`, e.message)
    }
  }
  
  // Sort by confidence
  return results.sort((a, b) => b.confidence - a.confidence)
}
