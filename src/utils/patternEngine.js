// Shared pure pattern engine — used by the app and background scanner.

const FIELDS = [
  // ── Price ──────────────────────────────────────────────────────────────────
  { id: 'close',     label: 'Close',       short: 'Close',   group: 'Price' },
  { id: 'open',      label: 'Open',        short: 'Open',    group: 'Price' },
  { id: 'high',      label: 'High',        short: 'High',    group: 'Price' },
  { id: 'low',       label: 'Low',         short: 'Low',     group: 'Price' },
  { id: 'volume',    label: 'Volume',      short: 'Vol',     group: 'Price' },
  // ── EMA (sorted by period) ─────────────────────────────────────────────────
  { id: 'ema5',      label: 'EMA 5',       short: 'EMA5',    group: 'EMA' },
  { id: 'ema9',      label: 'EMA 9',       short: 'EMA9',    group: 'EMA' },
  { id: 'ema15',     label: 'EMA 15',      short: 'EMA15',   group: 'EMA' },
  { id: 'ema16',     label: 'EMA 16',      short: 'EMA16',   group: 'EMA' },
  { id: 'ema20',     label: 'EMA 20',      short: 'EMA20',   group: 'EMA' },
  { id: 'ema25',     label: 'EMA 25',      short: 'EMA25',   group: 'EMA' },
  { id: 'ema30',     label: 'EMA 30',      short: 'EMA30',   group: 'EMA' },
  { id: 'ema40',     label: 'EMA 40',      short: 'EMA40',   group: 'EMA' },
  { id: 'ema50',     label: 'EMA 50',      short: 'EMA50',   group: 'EMA' },
  { id: 'ema60',     label: 'EMA 60',      short: 'EMA60',   group: 'EMA' },
  { id: 'ema75',     label: 'EMA 75',      short: 'EMA75',   group: 'EMA' },
  { id: 'ema80',     label: 'EMA 80',      short: 'EMA80',   group: 'EMA' },
  { id: 'ema100',    label: 'EMA 100',     short: 'EMA100',  group: 'EMA' },
  { id: 'ema120',    label: 'EMA 120',     short: 'EMA120',  group: 'EMA' },
  { id: 'ema150',    label: 'EMA 150',     short: 'EMA150',  group: 'EMA' },
  { id: 'ema200',    label: 'EMA 200',     short: 'EMA200',  group: 'EMA' },
  { id: 'ema300',    label: 'EMA 300',     short: 'EMA300',  group: 'EMA' },
  { id: 'ema600',    label: 'EMA 600',     short: 'EMA600',  group: 'EMA' },
  // ── Indicator ──────────────────────────────────────────────────────────────
  { id: 'rsi',       label: 'RSI 14',      short: 'RSI',     group: 'Indicator' },
  { id: 'diPlus',    label: '+DI 14',      short: '+DI',     group: 'Indicator' },
  { id: 'diMinus',   label: '-DI 14',      short: '-DI',     group: 'Indicator' },
  { id: 'adx',       label: 'ADX 14',      short: 'ADX',     group: 'Indicator' },
  // ── Calc ───────────────────────────────────────────────────────────────────
  { id: 'changePct',  label: 'Change %',    short: 'Chg%',    group: 'Calc',
    // (close[0] / close[-1] - 1) × 100  — needs prev candle; returns null if unavailable
    computed: null, needsPrev: true },
  { id: 'change24h',  label: '24h Change%', short: '24h%',    group: 'Calc',
    // Binance 24h priceChangePercent — attached to last candle by fetchCandles when ticker passed
    computed: c => c.change24h ?? null },
  { id: 'bodyPct',   label: 'Body %',      short: 'Body%',   group: 'Calc', computed: c => c.high !== c.low ? Math.abs(c.close - c.open) / (c.high - c.low) * 100 : 0 },
  { id: 'body',      label: 'Body Size',   short: 'Body',    group: 'Calc', computed: c => Math.abs(c.close - c.open) },
  { id: 'range',     label: 'Range H-L',   short: 'Range',   group: 'Calc', computed: c => c.high - c.low },
  { id: 'upperWick', label: 'Upper Wick',  short: 'UWick',   group: 'Calc', computed: c => c.high - Math.max(c.close, c.open) },
  { id: 'lowerWick', label: 'Lower Wick',  short: 'LWick',   group: 'Calc', computed: c => Math.min(c.close, c.open) - c.low },
  { id: 'isGreen',   label: 'Is Green',    short: 'Green?',  group: 'Calc', computed: c => c.close > c.open ? 1 : 0 },
  { id: 'isRed',     label: 'Is Red',      short: 'Red?',    group: 'Calc', computed: c => c.close < c.open ? 1 : 0 },
]
const FIELD_MAP = Object.fromEntries(FIELDS.map(f => [f.id, f]))



const OP_SYM = { '=': '==', '≠': '!=' }

export function condFormula(c) {
  // HTF prefix — shown when condition runs on a higher timeframe
  const htfPfx = c.htfTf ? `[${c.htfTf.toUpperCase()}] ` : ''

  // Special label for needsPrev fields
  function fieldLabel(fieldId, offset) {
    const f = FIELD_MAP[fieldId]
    if (!f) return fieldId
    if (f.needsPrev) {
      const o = offset === 0 ? '' : `[${offset}]`
      return `${f.short}${o}`
    }
    const o = offset === 0 ? '' : `[${offset}]`
    return `${f.short}${o}`
  }

  const lhsF = FIELD_MAP[c.lhsField]?.short || c.lhsField
  const op   = c.op

  // Range mode: prefix with "ALL/ANY [from..to]"
  if (c.rangeCheck) {
    const from = c.rangeFrom ?? -1
    const to   = c.rangeTo   ?? -5
    const modeLabel = c.rangeMode === 'any' ? 'ANY' : 'ALL'
    const windowLabel = `${modeLabel}[${from}→${to}]`
    const rhsF = FIELD_MAP[c.rhsField]?.short || (c.rhsField || '?')
    const pinnedO = c.rhsPinned && (c.rhsPinnedOffset ?? 0) !== 0 ? `[${c.rhsPinnedOffset}]` : c.rhsPinned ? '[0]' : ''
    const rhs = c.rhsPinned ? `${rhsF}${pinnedO}` : rhsF
    if (c.rhsMode === 'number')  return `${htfPfx}${windowLabel} ${lhsF} ${op} ${c.rhsNum ?? 0}`
    if (c.rhsMode === 'field')   return `${htfPfx}${windowLabel} ${lhsF} ${op} ${rhs}`
    if (c.rhsMode === 'mult')    return `${htfPfx}${windowLabel} ${lhsF} ${op} ${rhs} × ${c.rhsMult ?? 1}`
    if (c.rhsMode === 'pct') {
      const s = (c.rhsPct ?? 0) >= 0 ? '+' : ''
      return `${htfPfx}${windowLabel} ${lhsF} ${op} ${rhs} ${s}${c.rhsPct ?? 0}%`
    }
    if (c.rhsMode === 'pctdiff') return `${htfPfx}${windowLabel} (${lhsF}/${rhs}−1)×100 ${op} ${c.rhsNum ?? 0}%`
    if (c.rhsMode === 'slope') {
      const n = c.slopeLen ?? 5
      const sk = c.slopeSkip ?? 0
      const thresh = c.slopeNum ?? 0
      const s = thresh >= 0 ? '+' : ''
      const skipStr = sk > 0 ? `,skip${sk}` : ''
      return `${htfPfx}${windowLabel} Slope(${lhsF},${n}${skipStr}) ${op} ${s}${thresh}%`
    }
    return `${htfPfx}${windowLabel} ${lhsF} ${op} ?`
  }

  const lhsO = c.lhsOffset === 0 ? '' : `[${c.lhsOffset}]`
  const lhs  = `${lhsF}${lhsO}`

  if (c.rhsMode === 'number')  return `${htfPfx}${lhs} ${op} ${c.rhsNum ?? 0}`

  const rhsF = FIELD_MAP[c.rhsField]?.short || (c.rhsField || '?')
  const rhsO = (c.rhsOffset ?? 0) === 0 ? '' : `[${c.rhsOffset}]`
  const rhs  = `${rhsF}${rhsO}`

  if (c.rhsMode === 'field')   return `${htfPfx}${lhs} ${op} ${rhs}`
  if (c.rhsMode === 'mult')    return `${htfPfx}${lhs} ${op} ${rhs} × ${c.rhsMult ?? 1}`
  if (c.rhsMode === 'pct') {
    const s = (c.rhsPct ?? 0) >= 0 ? '+' : ''
    return `${htfPfx}${lhs} ${op} ${rhs} ${s}${c.rhsPct ?? 0}%`
  }
  if (c.rhsMode === 'pctdiff') return `${htfPfx}(${lhs}/${rhs}−1)×100 ${op} ${c.rhsNum ?? 0}%`
  if (c.rhsMode === 'slope') {
    const n = c.slopeLen ?? 5
    const sk = c.slopeSkip ?? 0
    const thresh = c.slopeNum ?? 0
    const s = thresh >= 0 ? '+' : ''
    const skipStr = sk > 0 ? `,skip${sk}` : ''
    return `${htfPfx}Slope(${lhs},${n}${skipStr}) ${op} ${s}${thresh}%`
  }
  return `${htfPfx}${lhs} ${op} ?`
}

export function compilePattern(pattern, _htfCandlesMap) {
  // ── Core evaluator — returns true/false/null ──────────────────────────────
  function evalCore(candles, htfCandlesMap) {
    if (!candles || candles.length < 5) return null
    htfCandlesMap = htfCandlesMap || {}
    const len = candles.length

    // ── Helpers for a given candle array ──────────────────────────────────
    function makeAccessors(arr) {
      const L = arr.length
      function getC(offset) {
        const idx = L - 1 + offset
        return idx >= 0 ? arr[idx] : null
      }
      function getVal(candle, fieldId, candleIdx) {
        if (!candle) return null
        const f = FIELD_MAP[fieldId]
        if (!f) return null
        if (f.needsPrev) {
          if (fieldId === 'changePct') {
            const prevIdx = (candleIdx ?? (L - 1)) - 1
            const prev = prevIdx >= 0 ? arr[prevIdx] : null
            if (!prev || prev.close === 0) return null
            return (candle.close / prev.close - 1) * 100
          }
          return null
        }
        if (f.computed) return f.computed(candle)
        const v = candle[fieldId]
        return v == null ? null : v
      }
      return { arr, L, getC, getVal }
    }

    // Default accessors use base candles
    const base = makeAccessors(candles)

    // Backwards-compat helpers (used by segments/group logic below)
    function getC(offset)              { return base.getC(offset) }
    function getVal(c, f, i)           { return base.getVal(c, f, i) }

    const active = pattern.conditions.filter(c => c.enabled)
    if (!active.length) return null

    // ── Resolve candle accessors for a condition (HTF or base) ────────────
    function resolveAccessors(cond) {
      if (cond.htfTf && htfCandlesMap[cond.htfTf] && htfCandlesMap[cond.htfTf].length >= 2) {
        return makeAccessors(htfCandlesMap[cond.htfTf])
      }
      return base
    }

    function evalCond(cond) {
      const { arr, L, getC: gC, getVal: gV } = resolveAccessors(cond)

      // ── Range check: apply condition to every candle in [rangeFrom..rangeTo] ──
      // Uses resolved candle array (HTF or base) via gC / gV / L
      if (cond.rangeCheck) {
        const from  = Math.min(cond.rangeFrom ?? -1, 0)
        const to    = Math.min(cond.rangeTo   ?? -5, 0)
        const start = Math.min(from, to)
        const end   = Math.max(from, to)
        const results = []
        for (let off = start; off <= end; off++) {
          const absIdx   = L - 1 + off
          const lhsCandle = gC(off)
          if (!lhsCandle) continue
          const lhsV = gV(lhsCandle, cond.lhsField, absIdx)
          if (lhsV == null) continue

          let rhsV
          if (cond.rhsMode === 'number') {
            rhsV = parseFloat(cond.rhsNum) || 0
          } else if (cond.rhsMode === 'slope') {
            const n  = Math.max(1, Math.round(cond.slopeLen ?? 5))
            const sk = Math.max(0, Math.round(cond.slopeSkip ?? 0))
            const nowCandle  = gC(off - sk)
            const nowV       = gV(nowCandle,  cond.lhsField, L - 1 + off - sk)
            const pastCandle = gC(off - sk - n)
            const pastV      = gV(pastCandle, cond.lhsField, L - 1 + off - sk - n)
            if (nowV == null || pastV == null || pastV === 0) continue
            const slopePct = (nowV / pastV - 1) * 100
            const thresh   = parseFloat(cond.slopeNum) || 0
            const op = OP_SYM[cond.op] || cond.op
            let r
            if (op === '>')       r = slopePct >  thresh
            else if (op === '>=') r = slopePct >= thresh
            else if (op === '<')  r = slopePct <  thresh
            else if (op === '<=') r = slopePct <= thresh
            else if (op === '==') r = Math.abs(slopePct - thresh) < 1e-9
            else                  r = Math.abs(slopePct - thresh) >= 1e-9
            results.push(r)
            continue
          } else {
            const rhsOff    = cond.rhsPinned ? (cond.rhsPinnedOffset ?? 0) : off + (cond.rhsOffset ?? 0)
            const rhsAbsIdx = L - 1 + rhsOff
            const rhsCandle = gC(rhsOff)
            const rhsBase   = gV(rhsCandle, cond.rhsField || cond.lhsField, rhsAbsIdx)
            if (rhsBase == null) continue
            if (cond.rhsMode === 'field')      rhsV = rhsBase
            else if (cond.rhsMode === 'mult')  rhsV = rhsBase * (parseFloat(cond.rhsMult) || 1)
            else if (cond.rhsMode === 'pct')   rhsV = rhsBase * (1 + (parseFloat(cond.rhsPct) || 0) / 100)
            else if (cond.rhsMode === 'pctdiff') {
              if (rhsBase === 0) continue
              const diff = (lhsV / rhsBase - 1) * 100
              const num  = parseFloat(cond.rhsNum) || 0
              const op   = OP_SYM[cond.op] || cond.op
              let r
              if (op === '>')       r = diff >  num
              else if (op === '>=') r = diff >= num
              else if (op === '<')  r = diff <  num
              else if (op === '<=') r = diff <= num
              else if (op === '==') r = Math.abs(diff - num) < 1e-9
              else                  r = Math.abs(diff - num) >= 1e-9
              results.push(r)
              continue
            } else { rhsV = rhsBase }
          }

          const op = OP_SYM[cond.op] || cond.op
          let r
          if (op === '>')       r = lhsV >  rhsV
          else if (op === '>=') r = lhsV >= rhsV
          else if (op === '<')  r = lhsV <  rhsV
          else if (op === '<=') r = lhsV <= rhsV
          else if (op === '==') r = Math.abs(lhsV - rhsV) < 1e-9
          else                  r = Math.abs(lhsV - rhsV) >= 1e-9
          results.push(r)
        }
        if (!results.length) return null
        return cond.rangeMode === 'any' ? results.some(Boolean) : results.every(Boolean)
      }

      // ── Standard single-candle check (uses gC/gV/L — HTF or base) ────────
      const lhsAbsIdx = L - 1 + (cond.lhsOffset ?? 0)
      const lhsV = gV(gC(cond.lhsOffset), cond.lhsField, lhsAbsIdx)
      if (lhsV == null) return null

      let rhsV
      const rhsAbsIdx = L - 1 + (cond.rhsOffset ?? 0)
      const rhsBase   = cond.rhsField ? gV(gC(cond.rhsOffset ?? 0), cond.rhsField, rhsAbsIdx) : null

      if (cond.rhsMode === 'number')       { rhsV = parseFloat(cond.rhsNum) || 0 }
      else if (cond.rhsMode === 'field')   { if (rhsBase == null) return null; rhsV = rhsBase }
      else if (cond.rhsMode === 'mult')    { if (rhsBase == null) return null; rhsV = rhsBase * (parseFloat(cond.rhsMult) || 1) }
      else if (cond.rhsMode === 'pct')     { if (rhsBase == null) return null; rhsV = rhsBase * (1 + (parseFloat(cond.rhsPct) || 0) / 100) }
      else if (cond.rhsMode === 'slope') {
        const n  = Math.max(1, Math.round(cond.slopeLen ?? 5))
        const sk = Math.max(0, Math.round(cond.slopeSkip ?? 0))
        const nowAbsIdx  = lhsAbsIdx - sk
        const pastAbsIdx = lhsAbsIdx - sk - n
        const nowCandle  = nowAbsIdx  >= 0 ? arr[nowAbsIdx]  : null
        const pastCandle = pastAbsIdx >= 0 ? arr[pastAbsIdx] : null
        const nowV  = gV(nowCandle,  cond.lhsField, nowAbsIdx)
        const pastV = gV(pastCandle, cond.lhsField, pastAbsIdx)
        if (nowV == null || pastV == null || pastV === 0) return null
        const slopePct = (nowV / pastV - 1) * 100
        const thresh   = parseFloat(cond.slopeNum) || 0
        const op = OP_SYM[cond.op] || cond.op
        if (op === '>')  return slopePct >  thresh
        if (op === '>=') return slopePct >= thresh
        if (op === '<')  return slopePct <  thresh
        if (op === '<=') return slopePct <= thresh
        if (op === '==') return Math.abs(slopePct - thresh) < 1e-9
        return Math.abs(slopePct - thresh) >= 1e-9
      }
      else if (cond.rhsMode === 'pctdiff') {
        if (rhsBase == null || rhsBase === 0) return null
        const diff = (lhsV / rhsBase - 1) * 100
        const num  = parseFloat(cond.rhsNum) || 0
        const op   = OP_SYM[cond.op] || cond.op
        if (op === '>')  return diff >  num
        if (op === '>=') return diff >= num
        if (op === '<')  return diff <  num
        if (op === '<=') return diff <= num
        if (op === '==') return Math.abs(diff - num) < 1e-9
        return Math.abs(diff - num) >= 1e-9
      }

      const op = OP_SYM[cond.op] || cond.op
      if (op === '>')  return lhsV >  rhsV
      if (op === '>=') return lhsV >= rhsV
      if (op === '<')  return lhsV <  rhsV
      if (op === '<=') return lhsV <= rhsV
      if (op === '==') return Math.abs(lhsV - rhsV) < 1e-9
      return Math.abs(lhsV - rhsV) >= 1e-9
    }

    // ── Group-aware evaluation ────────────────────────────────────────────────
    // Conditions with the same groupId are evaluated as a bracketed sub-expression.
    // The joinNext on the LAST condition of a group connects it to the next group/condition.
    // Ungrouped conditions (groupId=null) each form their own single-item "group".

    // Step 1: split active conditions into segments (groups + singletons)
    // Each segment: { conds: [...], joinAfter: 'AND'|'OR'|null }
    const segments = []
    let i = 0
    while (i < active.length) {
      const gid = active[i].groupId
      if (gid) {
        // Collect all consecutive conditions with same groupId
        const members = []
        while (i < active.length && active[i].groupId === gid) {
          members.push(active[i])
          i++
        }
        // joinAfter = joinNext of last member in group
        const joinAfter = members[members.length - 1].joinNext || 'AND'
        segments.push({ conds: members, joinAfter })
      } else {
        segments.push({ conds: [active[i]], joinAfter: active[i].joinNext || 'AND' })
        i++
      }
    }

    // Step 2: evaluate each segment to a boolean
    function evalSegment(seg) {
      let acc = evalCond(seg.conds[0])
      if (acc == null) return null
      for (let j = 1; j < seg.conds.length; j++) {
        const r = evalCond(seg.conds[j])
        if (r == null) return null
        acc = seg.conds[j - 1].joinNext === 'OR' ? acc || r : acc && r
      }
      return acc
    }

    // Step 3: fold segments together with inter-segment joins
    let acc = evalSegment(segments[0])
    if (acc == null) return null
    for (let s = 1; s < segments.length; s++) {
      const r = evalSegment(segments[s])
      if (r == null) return null
      acc = segments[s - 1].joinAfter === 'OR' ? acc || r : acc && r
    }
    return acc === true ? true : null
  }

  // ── Public logic function — runs pattern + computes historical accuracy ────
  // htfCandlesMap: { '1h': candleArr, '4h': candleArr, ... } — passed from scanner
  return function logic(candles, htfCandlesMap) {
    htfCandlesMap = htfCandlesMap || {}
    if (!evalCore(candles, htfCandlesMap)) return null

    const len  = candles.length
    const curr = candles[len - 1]
    const prev = candles[len - 2] || curr
    const lo   = Math.min(curr.low, prev.low)
    const hi   = Math.max(curr.high, prev.high)
    const gainPct = pattern.side === 'bull'
      ? ((curr.close - lo) / lo * 100).toFixed(2)
      : ((hi - curr.close) / curr.close * 100).toFixed(2)

    // ── Historical accuracy: backtest last LOOKBACK bars ────────────────────
    // For each past bar, check if pattern fired and if the trade was profitable
    const FORWARD  = 3   // candles ahead to measure outcome
    const LOOKBACK = 30  // how far back to sample
    let sigCount = 0, winCount = 0
    const start = Math.max(10, len - LOOKBACK - FORWARD)
    for (let ei = start; ei < len - FORWARD; ei++) {
      const slice = candles.slice(0, ei + 1)
      if (evalCore(slice, {}) === true) {
        sigCount++
        const entry = candles[ei].close
        const exit  = candles[ei + FORWARD].close
        const won   = pattern.side === 'bull' ? exit > entry : exit < entry
        if (won) winCount++
      }
    }
    const accuracy = sigCount > 0
      ? { signals: sigCount, wins: winCount, pct: Math.round(winCount / sigCount * 100) }
      : null

    const active = pattern.conditions.filter(c => c.enabled)
    return {
      candleCount: 5, gainPct,
      highestClose: curr.close, lowestOpen: curr.open,
      conds: active.map((c, i) => {
        const pre = i > 0 ? `${active[i-1].joinNext} ` : ''
        return `✓ ${pre}${condFormula(c)}`
      }),
      run: candles.slice(len - 8, len),
      ema9: curr.ema9, ema20: curr.ema20, rsi: curr.rsi,
      accuracy,
    }
  }
}
