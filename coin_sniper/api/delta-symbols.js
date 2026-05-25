// Vercel serverless — proxies Delta Exchange India symbol list
// Delta blocks non-allowlisted IPs server-side.
// This proxy tries multiple strategies including spoofing their own origin.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const ATTEMPTS = [
    {
      url: 'https://api.india.delta.exchange/v2/products?contract_types=perpetual_futures&states=live&page_size=500',
      headers: {
        'Accept': 'application/json',
        'Origin': 'https://app.india.delta.exchange',
        'Referer': 'https://app.india.delta.exchange/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'sec-ch-ua': '"Google Chrome";v="124"',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-site',
      },
    },
    {
      url: 'https://api.india.delta.exchange/v2/products?contract_types=perpetual_futures&states=live&page_size=500',
      headers: {
        'Accept': 'application/json',
        'Origin': 'https://india.delta.exchange',
        'Referer': 'https://india.delta.exchange/',
        'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
      },
    },
    {
      url: 'https://api.india.delta.exchange/v2/tickers?contract_types=perpetual_futures',
      headers: {
        'Accept': 'application/json',
        'Origin': 'https://app.india.delta.exchange',
        'Referer': 'https://app.india.delta.exchange/',
        'User-Agent': 'Mozilla/5.0',
      },
    },
  ]

  for (const attempt of ATTEMPTS) {
    try {
      const response = await fetch(attempt.url, {
        headers: attempt.headers,
        signal: AbortSignal.timeout(12000),
      })

      if (!response.ok) continue
      const data = await response.json()

      // Shape 1: { result: [ { symbol, state, contract_type, ... } ] }
      if (Array.isArray(data.result) && data.result.length > 0 && data.result[0].symbol) {
        const products = data.result
          .filter(p =>
            (p.quoting_asset?.symbol === 'USDT' || p.symbol?.endsWith('USDT')) &&
            (p.state === 'live' || p.is_active) &&
            (p.contract_type === 'perpetual_futures' || p.contract_types === 'perpetual_futures')
          )
          .map(p => ({
            symbol:    p.symbol,
            name:      p.underlying_asset?.symbol || p.symbol.replace('USDT', ''),
            markPrice: parseFloat(p.mark_price  || p.last_price || 0),
            volume:    parseFloat(p.volume      || p.turnover_usd || 0),
          }))
          .sort((a, b) => b.volume - a.volume)

        if (products.length > 0) {
          return res.status(200).json({ products })
        }
      }

      // Shape 2: tickers [ { symbol, close, volume, ... } ]
      if (Array.isArray(data.result) && data.result.length > 0 && data.result[0].close) {
        const products = data.result
          .filter(p => p.symbol?.endsWith('USDT'))
          .map(p => ({
            symbol:    p.symbol,
            name:      p.symbol.replace('USDT', ''),
            markPrice: parseFloat(p.close || p.mark_price || 0),
            volume:    parseFloat(p.volume || p.turnover || 0),
          }))
          .sort((a, b) => b.volume - a.volume)

        if (products.length > 0) {
          return res.status(200).json({ products })
        }
      }
    } catch (_) {
      continue
    }
  }

  // Return hardcoded fallback — app still works
  return res.status(200).json({ products: FALLBACK, fallback: true })
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
  'RENDERUSDT','WLDUSDT','ONDOUSDT','TONUSDT','ALTUSDT',
  'BLURUSDT','DYMUSDT','MANTAUSDT','RONINUSDT','SAFEUSDT',
  'TURBOUSDT','ACEUSDT','PORTALUSDT','PIXELUSDT','NFPUSDT',
].map(s => ({ symbol: s, name: s.replace('USDT',''), markPrice: 0, volume: 0 }))
