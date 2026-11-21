// Secure iTick proxy for spot precious-metal OHLCV candles.
// Keep ITICK_API_KEY server-side in Vercel Environment Variables.
const ALLOWED = new Set(['XAUUSD','XAGUSD'])
const INTERVALS = {
  '1m': { kType: 1, factor: 1 }, '3m': { kType: 1, factor: 3 },
  '5m': { kType: 2, factor: 1 }, '15m': { kType: 3, factor: 1 },
  '30m': { kType: 4, factor: 1 }, '1h': { kType: 5, factor: 1 },
  '4h': { kType: 5, factor: 4 }, '1d': { kType: 8, factor: 1 },
}
function aggregate(rows, minutes, limit) {
  const size = minutes * 60000, buckets = new Map()
  for (const row of [...rows].reverse()) {
    const t = Number(row.t), bucket = Math.floor(t / size) * size
    if (!Number.isFinite(t)) continue
    const old = buckets.get(bucket)
    if (!old) buckets.set(bucket, { t: bucket, o: row.o, h: row.h, l: row.l, c: row.c, v: Number(row.v || 0) })
    else { old.h = Math.max(Number(old.h), Number(row.h)); old.l = Math.min(Number(old.l), Number(row.l)); old.c = row.c; old.v += Number(row.v || 0) }
  }
  return [...buckets.values()].sort((a,b)=>a.t-b.t).slice(-limit)
}
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30')
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const token = process.env.ITICK_API_KEY
  if (!token) return res.status(503).json({ error: 'iTick is not configured. Add ITICK_API_KEY in Vercel Environment Variables.' })
  const region = String(req.query.region || 'GB').toUpperCase()
  const symbol = String(req.query.symbol || '').toUpperCase()
  const interval = String(req.query.interval || '15m')
  const limit = Math.min(500, Math.max(60, Number(req.query.limit) || 60))
  const spec = INTERVALS[interval]
  if (region !== 'GB' || !ALLOWED.has(symbol)) return res.status(400).json({ error: 'Unsupported iTick commodity symbol' })
  if (!spec) return res.status(400).json({ error: 'Unsupported timeframe' })
  try {
    const url = new URL('https://api.itick.org/forex/kline')
    url.searchParams.set('region', region); url.searchParams.set('code', symbol)
    url.searchParams.set('kType', String(spec.kType))
    url.searchParams.set('limit', String(Math.min(500, limit * spec.factor)))
    const response = await fetch(url, { headers: { accept: 'application/json', token }, signal: AbortSignal.timeout(12000) })
    const payload = await response.json().catch(()=>({}))
    if (!response.ok || payload.code !== 0 || !Array.isArray(payload.data)) {
      return res.status(response.status >= 400 ? response.status : 502).json({ error: payload.msg || 'iTick did not return candle data', providerCode: payload.code ?? null })
    }
    const values = spec.factor === 1 ? payload.data.map(x=>({t:Number(x.t),o:Number(x.o),h:Number(x.h),l:Number(x.l),c:Number(x.c),v:Number(x.v||0)})).sort((a,b)=>a.t-b.t).slice(-limit) : aggregate(payload.data, interval === '3m' ? 3 : 240, limit)
    return res.status(200).json({ values })
  } catch (error) { return res.status(502).json({ error: error.message || 'iTick request failed' }) }
}
