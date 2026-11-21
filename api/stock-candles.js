// Vercel serverless proxy for Twelve Data US equity OHLCV.
// Keep TWELVE_DATA_API_KEY in Vercel Environment Variables; never expose it to the browser.
const ALLOWED_INTERVALS = new Set(['1m','3m','5m','15m','30m','1h','4h','1d'])
const INTERVAL_MAP = { '1m':'1min', '3m':'1min', '5m':'5min', '15m':'15min', '30m':'30min', '1h':'1h', '4h':'4h', '1d':'1day' }
const ALLOWED_SYMBOL = /^[A-Z0-9.\-]{1,15}$/

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=20, stale-while-revalidate=40')
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
    return res.status(204).end()
  }
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const apiKey = process.env.TWELVE_DATA_API_KEY
  if (!apiKey) return res.status(503).json({ error: 'Stocks provider is not configured. Add TWELVE_DATA_API_KEY in Vercel Environment Variables.' })

  const symbol = String(req.query.symbol || '').toUpperCase()
  const interval = String(req.query.interval || '15m')
  const outputsize = Math.min(5000, Math.max(60, Number(req.query.outputsize) || 60))
  if (!ALLOWED_SYMBOL.test(symbol)) return res.status(400).json({ error: 'Invalid stock symbol' })
  if (!ALLOWED_INTERVALS.has(interval)) return res.status(400).json({ error: 'Unsupported timeframe' })

  try {
    const url = new URL('https://api.twelvedata.com/time_series')
    url.searchParams.set('symbol', symbol)
    url.searchParams.set('interval', INTERVAL_MAP[interval])
    url.searchParams.set('outputsize', String(interval === '3m' ? Math.min(5000, outputsize * 3) : outputsize))
    url.searchParams.set('timezone', 'UTC')
    const response = await fetch(url, { headers: { Authorization: 'apikey ' + apiKey }, signal: AbortSignal.timeout(12000) })
    const data = await response.json()
    if (!response.ok || data.status === 'error' || !Array.isArray(data.values)) {
      return res.status(response.status >= 400 ? response.status : 502).json({ error: data.message || 'Twelve Data could not return stock candles' })
    }
    let values = data.values
    if (interval === '3m') {
      const buckets = new Map()
      for (const row of [...values].reverse()) {
        const ms = Date.parse(String(row.datetime).replace(' ', 'T') + 'Z')
        if (!Number.isFinite(ms)) continue
        const bucket = Math.floor(ms / 180000) * 180000
        const current = buckets.get(bucket)
        if (!current) buckets.set(bucket, { datetime: new Date(bucket).toISOString().slice(0,19).replace('T',' '), open: row.open, high: row.high, low: row.low, close: row.close, volume: row.volume || '0' })
        else {
          current.high = String(Math.max(Number(current.high), Number(row.high)))
          current.low = String(Math.min(Number(current.low), Number(row.low)))
          current.close = row.close
          current.volume = String(Number(current.volume || 0) + Number(row.volume || 0))
        }
      }
      values = [...buckets.values()].sort((a,b) => a.datetime.localeCompare(b.datetime)).slice(-outputsize)
    }
    return res.status(200).json({ meta: { ...(data.meta || {}), timezone: 'UTC' }, values })
  } catch (error) {
    return res.status(502).json({ error: error.message || 'Stock data provider unavailable' })
  }
}
