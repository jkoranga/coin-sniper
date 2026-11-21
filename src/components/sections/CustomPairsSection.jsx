import React, { useEffect, useMemo, useState } from 'react'
import { SectionHeader, SectionCard } from '../UI'
import { TOP_SYMBOLS } from '../../utils/scanner.js'

const STOCKS = [
  ['AAPL', 'Apple'], ['MSFT', 'Microsoft'], ['NVDA', 'NVIDIA'], ['AMZN', 'Amazon'],
  ['GOOGL', 'Alphabet'], ['META', 'Meta'], ['TSLA', 'Tesla'], ['AVGO', 'Broadcom'],
  ['BRK.B', 'Berkshire Hathaway'], ['JPM', 'JPMorgan'], ['WMT', 'Walmart'],
  ['LLY', 'Eli Lilly'], ['V', 'Visa'], ['XOM', 'Exxon Mobil'], ['ORCL', 'Oracle'],
  ['COST', 'Costco'], ['NFLX', 'Netflix'], ['AMD', 'AMD'], ['MA', 'Mastercard'],
  ['PLTR', 'Palantir'],
]

const DEFAULT_GROUPS = [
  {
    id: 'crypto', name: 'Crypto', kind: 'crypto', locked: true,
    assets: TOP_SYMBOLS.slice(0, 30).map(symbol => ({
      id: symbol, symbol: symbol.replace(/USDT$/, ''), name: symbol.replace(/USDT$/, ''),
      scanSymbol: symbol, status: 'supported',
    })),
  },
  {
    id: 'stocks', name: 'Stocks', kind: 'stock', locked: true,
    assets: STOCKS.map(([symbol, name]) => ({
      id: symbol, symbol, name, scanSymbol: 'STOCK:' + symbol, status: 'supported',
    })),
  },
  {
    id: 'commodity', name: 'Commodity', kind: 'commodity', locked: true,
    assets: [
      { id: 'GOLD', symbol: 'GOLD', name: 'Gold', scanSymbol: null, status: 'provider-required' },
      { id: 'SILVER', symbol: 'SILVER', name: 'Silver', scanSymbol: null, status: 'provider-required' },
      { id: 'OIL', symbol: 'OIL', name: 'Oil', scanSymbol: null, status: 'provider-required' },
    ],
  },
]

const buttonStyle = {
  padding: '7px 11px', borderRadius: 7, border: '1px solid var(--border)',
  background: 'var(--bg2)', color: 'var(--text2)', fontSize: 11,
  fontWeight: 700, cursor: 'pointer',
}

export default function CustomPairsSection({ cfg, set }) {
  const [activeId, setActiveId] = useState('crypto')
  const [assetInput, setAssetInput] = useState('')
  const [categoryInput, setCategoryInput] = useState('')
  const [showNewCategory, setShowNewCategory] = useState(false)

  const groups = Array.isArray(cfg.assetGroups) && cfg.assetGroups.length
    ? cfg.assetGroups : DEFAULT_GROUPS
  useEffect(() => {
    if (!Array.isArray(cfg.assetGroups) || cfg.assetGroups.length === 0) {
      set('assetGroups', DEFAULT_GROUPS)
    }
  }, [cfg.assetGroups, set])
  const active = groups.find(g => g.id === activeId) || groups[0]
  const supportedSymbols = useMemo(() => (active?.assets || [])
    .map(a => a.scanSymbol).filter(Boolean), [active])

  function saveGroups(next) { set('assetGroups', next) }

  function addAsset() {
    const raw = assetInput.trim().toUpperCase()
    if (!raw || !active) return
    const symbol = active.kind === 'crypto' && !raw.endsWith('USDT') ? raw + 'USDT' : raw
    const duplicate = active.assets.some(a => a.symbol === symbol || a.scanSymbol === symbol)
    if (duplicate) { setAssetInput(''); return }
    const asset = {
      id: symbol + '-' + Date.now(), symbol: symbol.replace(/USDT$/, ''),
      name: symbol.replace(/USDT$/, ''), scanSymbol: active.kind === 'crypto' ? symbol : null,
      status: active.kind === 'crypto' ? 'supported' : 'provider-required',
    }
    saveGroups(groups.map(g => g.id === active.id ? { ...g, assets: [...g.assets, asset] } : g))
    setAssetInput('')
  }

  function removeAsset(assetId) {
    saveGroups(groups.map(g => g.id === active.id
      ? { ...g, assets: g.assets.filter(a => a.id !== assetId) } : g))
  }

  function createCategory() {
    const name = categoryInput.trim()
    if (!name) return
    const id = 'custom-' + Date.now()
    saveGroups([...groups, { id, name, kind: 'custom', locked: false, assets: [] }])
    setActiveId(id)
    setCategoryInput('')
    setShowNewCategory(false)
  }

  function deleteCategory(group) {
    if (group.locked || !window.confirm('Delete category "' + group.name + '" and its assets?')) return
    const next = groups.filter(g => g.id !== group.id)
    saveGroups(next)
    setActiveId(next[0]?.id || 'crypto')
  }

  function useForScanner() {
    if (!supportedSymbols.length) return
    set('customPairs', [...new Set(supportedSymbols)])
    set('scanMode', 'custom')
  }

  const isCrypto = active?.kind === 'crypto'
  const scanCount = supportedSymbols.length

  return (
    <div>
      <SectionHeader title="Custom Pairs" sub="Organize assets into reusable groups · select supported pairs for scanning" />
      <SectionCard>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, marginBottom:10 }}>
          <div style={{ fontSize:11, color:'var(--text3)', fontFamily:'var(--mono)' }}>ASSET CATEGORIES</div>
          <button onClick={() => setShowNewCategory(v => !v)} style={{
            ...buttonStyle, border:'1px solid var(--green2)', color:'var(--green)',
            background:'var(--green-dim)', fontSize:12,
          }}>＋ Add Category</button>
        </div>

        {showNewCategory && (
          <div style={{ display:'flex', gap:7, marginBottom:12 }}>
            <input className="field" placeholder="New category name…" value={categoryInput}
              onChange={e => setCategoryInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createCategory()} />
            <button onClick={createCategory} disabled={!categoryInput.trim()} style={buttonStyle}>Create</button>
          </div>
        )}

        <div style={{ display:'flex', gap:7, overflowX:'auto', paddingBottom:8, marginBottom:10 }}>
          {groups.map(group => (
            <button key={group.id} onClick={() => setActiveId(group.id)} style={{
              ...buttonStyle, flexShrink:0, whiteSpace:'nowrap',
              border: active?.id === group.id ? '1.5px solid var(--green)' : '1px solid var(--border)',
              background: active?.id === group.id ? 'var(--green-dim)' : 'var(--bg2)',
              color: active?.id === group.id ? 'var(--green)' : 'var(--text2)',
            }}>{group.name} <span style={{opacity:.7}}>({group.assets.length})</span></button>
          ))}
        </div>

        {active && (
          <>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, marginBottom:10 }}>
              <div>
                <div style={{ fontSize:14, fontWeight:800, color:'var(--text)' }}>{active.name}</div>
                <div style={{ fontSize:10, color:'var(--text3)', fontFamily:'var(--mono)', marginTop:2 }}>
                  {isCrypto ? 'BINANCE SPOT PAIRS' : active.kind === 'stock' ? 'NASDAQ / NYSE STOCK WATCHLIST' : active.kind === 'commodity' ? 'COMMODITY WATCHLIST' : 'CUSTOM ASSET GROUP'}
                </div>
              </div>
              {!active.locked && <button onClick={() => deleteCategory(active)} style={{
                ...buttonStyle, color:'var(--red)', borderColor:'var(--red2)', background:'var(--red-dim)',
              }}>Delete</button>}
            </div>

            <div style={{ display:'flex', gap:7, marginBottom:10 }}>
              <input className="field"
                placeholder={isCrypto ? 'BTC / BTCUSDT…' : 'Add asset symbol…'}
                value={assetInput} onChange={e => setAssetInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addAsset()} />
              <button onClick={addAsset} style={{...buttonStyle, color:'var(--green)', borderColor:'var(--green2)'}}>＋ Add</button>
            </div>

            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, flexWrap:'wrap', marginBottom:10 }}>
              <span style={{ fontSize:10, color:'var(--text3)', fontFamily:'var(--mono)' }}>
                {active.assets.length} assets · {scanCount} scan-ready
              </span>
              {scanCount > 0 && (
                <button onClick={useForScanner} style={{
                  ...buttonStyle, color:'var(--green)', borderColor:'var(--green2)', background:'var(--green-dim)',
                }}>Use {scanCount} in Scanner →</button>
              )}
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(118px,1fr))', gap:6 }}>
              {active.assets.map(asset => (
                <div key={asset.id} style={{
                  display:'flex', alignItems:'center', justifyContent:'space-between', gap:5,
                  minWidth:0, padding:'7px 8px', borderRadius:8,
                  background:'var(--bg2)', border:'1px solid var(--border)',
                }}>
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontSize:11, fontWeight:800, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis' }}>{asset.symbol}</div>
                    <div style={{ fontSize:9, color:asset.status === 'supported' ? 'var(--green)' : 'var(--amber)', marginTop:2 }}>
                      {asset.status === 'supported' ? (active.kind === 'stock' ? 'US stock data' : 'Binance pair') : 'Provider needed'}
                    </div>
                  </div>
                  <button onClick={() => removeAsset(asset.id)} aria-label={'Remove ' + asset.symbol} style={{
                    border:0, background:'transparent', color:'var(--text3)', fontSize:16, cursor:'pointer', padding:'0 2px',
                  }}>×</button>
                </div>
              ))}
              {active.assets.length === 0 && (
                <div style={{ gridColumn:'1 / -1', textAlign:'center', padding:18, color:'var(--text3)', fontSize:11 }}>
                  No assets yet. Add a symbol above.
                </div>
              )}
            </div>

            {!isCrypto && (
              <div style={{
                marginTop:12, padding:'9px 10px', borderRadius:8,
                border:'1px solid rgba(255,167,38,.28)', background:'rgba(255,167,38,.07)',
                color:'var(--text2)', fontSize:10, lineHeight:1.6,
              }}>
                ℹ️ Stocks use real NASDAQ/NYSE OHLCV candles through Twelve Data. Add your TWELVE_DATA_API_KEY in Vercel Environment Variables to enable live scanning. Crypto continues using Binance. Commodity feeds remain separate and are not enabled yet.
              </div>
            )}
          </>
        )}
      </SectionCard>
    </div>
  )
}
