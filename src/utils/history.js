// ── Scan History utilities ─────────────────────────────────────────────────────
export const HISTORY_KEY = 'cs_scan_history_v1'
export const HISTORY_CAP = 100

export const TF_COLORS = {
  '1m':'#ff6b6b','3m':'#ffa94d','5m':'#ffd43b','15m':'#69db7c',
  '30m':'#38d9a9','1h':'#4dabf7','4h':'#9775fa','1d':'#f783ac',
}

export function historyLoad() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '{}') } catch { return {} }
}
export function historySave(data) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(data)) } catch {}
}

export function historyAddAlerts(alerts) {
  if (!alerts || !alerts.length) return
  const data = historyLoad()
  for (const a of alerts) {
    const tf = a.timeframe || 'unknown'
    if (!data[tf]) data[tf] = []
    const minute = Math.floor(a.time / 60000)
    if (data[tf].some(h => h.symbol === a.symbol && h.scannerId === a.scannerId && Math.floor(h.time/60000) === minute)) continue
    data[tf].unshift({
      id: a.id, symbol: a.symbol, timeframe: tf,
      time: a.time, side: a.side,
      scannerName: a.scannerName, scannerIcon: a.scannerIcon || '',
      close:   a.details?.highestClose ?? a.details?.close ?? null,
      entry:   a.details?.lowestOpen   ?? a.details?.entry ?? null,
      gainPct: a.details?.gainPct      ?? null,
      rsi14:   a.details?.rsi14        ?? null,
      ema9:    a.details?.ema9         ?? null,
      ema20:   a.details?.ema20        ?? null,
      adx:     a.details?.adx          ?? null,
      volume:  a.volume                ?? 0,
      scannerId: a.scannerId,
    })
    if (data[tf].length > HISTORY_CAP) data[tf] = data[tf].slice(0, HISTORY_CAP)
  }
  historySave(data)
}

export function fmtHistoryDate(ts) {
  const d = new Date(ts)
  return d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) +
    ' ' + d.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit', second:'2-digit' })
}

export function tvUrl(symbol, tf = '15m') {
  const m = {'1m':'1','3m':'3','5m':'5','15m':'15','30m':'30','1h':'60','4h':'240','1d':'D','Day':'D'}
  return `https://www.tradingview.com/chart/?symbol=BYBIT:${symbol.replace('USDT','')}USDT.P&interval=${m[tf]||'15'}`
}

export function exportHistoryCSV(historyData, tfFilter) {
  const tfsToExport = tfFilter === 'all' ? Object.keys(historyData) : [tfFilter]
  const rows = []
  rows.push(['Coin Sniper — Scan History Export'])
  rows.push([`Exported: ${fmtHistoryDate(Date.now())}`])
  rows.push([])
  for (const tf of tfsToExport) {
    const items = historyData[tf] || []
    if (!items.length) continue
    rows.push([`Timeframe: ${tf.toUpperCase()}`, `Total: ${items.length}`])
    rows.push(['#','Date & Time','Symbol','TF','Direction','Pattern',
      'Entry Price','Close Price','Gain %','RSI-14','EMA9','EMA20','ADX','24H Vol (USDT)','TradingView'])
    items.forEach((h, i) => {
      const fmtN = (v, dp=4) => v != null ? parseFloat(v).toFixed(dp) : ''
      rows.push([
        i + 1,
        fmtHistoryDate(h.time),
        h.symbol,
        h.timeframe.toUpperCase(),
        h.side === 'bull' ? 'BULL ▲' : 'BEAR ▼',
        h.scannerName,
        fmtN(h.entry),
        fmtN(h.close),
        h.gainPct != null ? h.gainPct + '%' : '',
        h.rsi14   != null ? parseFloat(h.rsi14).toFixed(1) : '',
        fmtN(h.ema9),
        fmtN(h.ema20),
        h.adx != null ? parseFloat(h.adx).toFixed(1) : '',
        h.volume > 0 ? h.volume : '',
        tvUrl(h.symbol, h.timeframe),
      ])
    })
    rows.push([])
  }
  const csv = rows.map(r =>
    r.map(cell => {
      const s = String(cell ?? '')
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"` : s
    }).join(',')
  ).join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = `coin_sniper_history_${tfFilter}_${new Date().toISOString().slice(0,10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
