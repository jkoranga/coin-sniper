// Vercel serverless — proxies Delta Exchange India OHLCV candles
// /api/delta-candles?symbol=BTCUSDT&resolution=15&start=...&end=...

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60')

  if (req.method === 'OPTIONS') return res.status(200).end()

  const { symbol, resolution, start, end } = req.query

  if (!symbol || !resolution) {
    return res.status(400).json({ error: 'Missing symbol or resolution' })
  }

  // Try multiple Delta India candle endpoints
  const ENDPOINTS = [
    `https://api.india.delta.exchange/v2/history/candles?symbol=${symbol}&resolution=${resolution}&start=${start}&end=${end}`,
    `https://api.india.delta.exchange/v2/chart/history?symbol=${symbol}&resolution=${resolution}&from=${start}&to=${end}`,
  ]

  for (const url of ENDPOINTS) {
    try {
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0',
          'Origin': 'https://www.delta.exchange',
          'Referer': 'https://www.delta.exchange/',
        },
        signal: AbortSignal.timeout(10000),
      })

      if (!response.ok) continue

      const data = await response.json()

      // v2/history/candles returns { result: [...] }
      if (data.result && data.result.length > 0) {
        return res.status(200).json(data)
      }

      // v2/chart/history returns { t:[], o:[], h:[], l:[], c:[], v:[] }
      if (data.t && data.t.length > 0) {
        const result = data.t.map((time, i) => ({
          time,
          open:   data.o[i],
          high:   data.h[i],
          low:    data.l[i],
          close:  data.c[i],
          volume: data.v[i],
        }))
        return res.status(200).json({ result })
      }
    } catch (_) {
      continue
    }
  }

  return res.status(502).json({ error: `Delta candle API unreachable for ${symbol}` })
}
