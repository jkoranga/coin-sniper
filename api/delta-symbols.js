// Vercel serverless function — proxies Delta Exchange India symbol list
// Called from browser as /api/delta-symbols
// No CORS issues since this runs server-side on Vercel

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600') // 5 min cache

  try {
    const response = await fetch(
      'https://api.india.delta.exchange/v2/products?contract_types=perpetual_futures&states=live&page_size=500',
      {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0',
        },
        signal: AbortSignal.timeout(12000),
      }
    )

    if (!response.ok) {
      return res.status(502).json({ error: `Delta API returned ${response.status}` })
    }

    const data = await response.json()
    const products = (data.result || [])
      .filter(p =>
        p.quoting_asset?.symbol === 'USDT' &&
        p.state === 'live' &&
        p.contract_type === 'perpetual_futures'
      )
      .map(p => ({
        symbol:    p.symbol,
        name:      p.underlying_asset?.symbol || p.symbol,
        markPrice: parseFloat(p.mark_price  || 0),
        volume:    parseFloat(p.volume      || 0),
      }))
      .sort((a, b) => b.volume - a.volume)

    return res.status(200).json({ products })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
