// Vercel serverless — proxies Delta Exchange India symbol list
// Tries v2 API first, falls back to v3 if needed

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')

  if (req.method === 'OPTIONS') return res.status(200).end()

  // Try multiple endpoints — Delta sometimes changes their API structure
  const ENDPOINTS = [
    'https://api.india.delta.exchange/v2/products?contract_types=perpetual_futures&states=live&page_size=500',
    'https://api.india.delta.exchange/v2/products?contract_type=perpetual_futures&state=live&page_size=500',
    'https://api.india.delta.exchange/v2/tickers?contract_type=perpetual_futures',
  ]

  for (const url of ENDPOINTS) {
    try {
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0',
          'Origin': 'https://www.delta.exchange',
        },
        signal: AbortSignal.timeout(12000),
      })

      if (!response.ok) continue

      const data = await response.json()

      // v2/products shape
      if (data.result && Array.isArray(data.result) && data.result[0]?.symbol) {
        const products = data.result
          .filter(p =>
            p.quoting_asset?.symbol === 'USDT' &&
            (p.state === 'live' || p.is_active) &&
            (p.contract_type === 'perpetual_futures' || p.contract_types === 'perpetual_futures')
          )
          .map(p => ({
            symbol:    p.symbol,
            name:      p.underlying_asset?.symbol || p.name || p.symbol.replace('USDT',''),
            markPrice: parseFloat(p.mark_price || p.last_price || 0),
            volume:    parseFloat(p.volume     || p.turnover_usd || 0),
          }))
          .sort((a, b) => b.volume - a.volume)

        if (products.length > 0) {
          return res.status(200).json({ products, source: url })
        }
      }

      // v2/tickers shape
      if (data.result && Array.isArray(data.result) && data.result[0]?.close) {
        const products = data.result
          .filter(p => p.symbol?.endsWith('USDT') || p.quoting_asset_symbol === 'USDT')
          .map(p => ({
            symbol:    p.symbol,
            name:      p.symbol.replace('USDT',''),
            markPrice: parseFloat(p.close || p.mark_price || 0),
            volume:    parseFloat(p.volume || p.turnover || 0),
          }))
          .sort((a, b) => b.volume - a.volume)

        if (products.length > 0) {
          return res.status(200).json({ products, source: url })
        }
      }
    } catch (_) {
      continue
    }
  }

  // All endpoints failed — return hardcoded fallback so app still works
  return res.status(200).json({
    products: FALLBACK,
    fallback: true,
    error: 'Delta API unreachable — using fallback symbol list',
  })
}

const FALLBACK = [
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
  'RENDERUSDT','WLDUSDT','ONDOUSDT','TONUSDT','ACEUSDT',
  'ALTUSDT','BLURUSDT','DYMUSDT','MANTAUSDT','PIXELUSDT',
  'PORTALUSDT','RONINUSDT','SAFEUSDT','STRIPEUSDT','TURBOUSDT',
].map(symbol => ({
  symbol,
  name: symbol.replace('USDT',''),
  markPrice: 0,
  volume: 0,
}))
