// Vercel serverless function — proxies Delta Exchange India OHLCV candles
// Called from browser as /api/delta-candles?symbol=BTCUSDT&resolution=15&start=...&end=...

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60')

  const { symbol, resolution, start, end } = req.query

  if (!symbol || !resolution) {
    return res.status(400).json({ error: 'Missing symbol or resolution' })
  }

  try {
    const url = `https://api.india.delta.exchange/v2/history/candles?symbol=${symbol}&resolution=${resolution}&start=${start}&end=${end}`
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0',
      },
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) {
      return res.status(502).json({ error: `Delta candle API ${response.status}` })
    }

    const data = await response.json()
    return res.status(200).json(data)
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
