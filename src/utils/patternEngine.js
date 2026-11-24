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
  { id: 'ema10',     label: 'EMA 10',      short: 'EMA10',   group: 'EMA' },
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
  { id: 'bodyPct',   label: 'Full Body %',             short: 'FullBody%', group: 'Calc', computed: c => c.high !== c.low ? Math.abs(c.close - c.open) / (c.high - c.low) * 100 : 0 },
  // New percentage-based body size; legacy "body" remains below for saved-pattern compatibility.
  { id: 'bodySizePct', label: 'Body Size %',              short: 'BodySize%', group: 'Calc', computed: c => c.open !== 0 ? Math.abs(c.close - c.open) / Math.abs(c.open) * 100 : null },
  { id: 'range',      label: 'Range H-L',                 short: 'Range',    group: 'Calc', computed: c => c.high - c.low },
  { id: 'upperWick',  label: 'Upper Wick',                short: 'UWick',    group: 'Calc', computed: c => c.high - Math.max(c.close, c.open) },
  // Direction-specific lower-wick percentages use the candle's closing-side reference:
  // Green: wick is Open-Low, normalized by Open. Red: wick is Close-Low, normalized by Close.
  { id: 'greenLowerWickPct', label: 'Green Bar Lower Wick %', short: 'GreenLw%', group: 'Calc', computed: c => c.close > c.open && c.open !== 0 ? (c.open - c.low) / Math.abs(c.open) * 100 : null },
  { id: 'redLowerWickPct',   label: 'Red Bar Lower Wick %',   short: 'RedLw%',   group: 'Calc', computed: c => c.close < c.open && c.close !== 0 ? (c.close - c.low) / Math.abs(c.close) * 100 : null },
  // Upper-wick percentages mirror the lower-wick reference convention: green uses Open, red uses Close.
  { id: 'greenUpperWickPct', label: 'Green Bar Upper Wick %', short: 'GreenUw%', group: 'Calc', computed: c => c.close > c.open && c.open !== 0 ? (c.high - c.close) / Math.abs(c.open) * 100 : null },
  { id: 'redUpperWickPct',   label: 'Red Bar Upper Wick %',   short: 'RedUw%',   group: 'Calc', computed: c => c.close < c.open && c.close !== 0 ? (c.high - c.open) / Math.abs(c.close) * 100 : null },
  // Legacy absolute-size fields remain evaluable for already-saved patterns.
  { id: 'body',       label: 'Legacy Body Size',  short: 'Body',  group: 'Calc', computed: c => Math.abs(c.close - c.open) },
  { id: 'lowerWick', label: 'Legacy Lower Wick', short: 'LWick', group: 'Calc', computed: c => Math.min(c.close, c.open) - c.low },
  { id: 'isGreen',   label: 'Is Green',    short: 'Green?',  group: 'Calc', computed: c => c.close > c.open ? 1 : 0 },
  { id: 'isRed',     label: 'Is Red',      short: 'Red?',    group: 'Calc', computed: c => c.close < c.open ? 1 : 0 },
]
const FIELD_MAP = Object.fromEntries(FIELDS.map(f => [f.id, f]))

// Validate what the user can configure before evaluating live market data.
// "Ready" means syntactically evaluable, NOT that the current candles match.
export function validateConditionConfig(cond) {
  const invalid = reason => ({ valid: false, reason })
  if (!cond || typeof cond !== 'object') return invalid('Condition is missing.')
  if (!cond.lhsField || !FIELD_MAP[cond.lhsField]) return invalid('Choose a valid recent / left indicator.')

  const validNumber = value => value !== null && value !== undefined &&
    String(value).trim() !== '' && Number.isFinite(Number(value))
  const validIndex = (value, min, max) => validNumber(value) &&
    Number.isInteger(Number(value)) && Number(value) >= min && Number(value) <= max
  const standardOperators = ['>', '>=', '<', '<=', '=', '≠']
  const histOperators = [...standardOperators, 'crossUp', 'crossDown', '% Diff']
  const ops = cond.histCompare ? histOperators : standardOperators
  if (!ops.includes(cond.op)) return invalid('Choose a comparison direction / operator.')

  if (cond.htfTf && !['1m', '3m', '5m', '15m', '30m', '1h', '4h', '1d'].includes(cond.htfTf)) {
    return invalid('Choose a supported higher timeframe.')
  }
  if (cond.histCompare) {
    const cf = cond.histCurrentFrom ?? 1
    const ct = cond.histCurrentTo ?? 2
    const pf = cond.histPreviousFrom ?? 3
    const pt = cond.histPreviousTo ?? 20
    if (![cf, ct, pf, pt].every(value => validIndex(value, 0, 20))) {
      return invalid('Choose candle indexes between 0 and -20.')
    }
    if (Number(cf) > Number(ct)) return invalid('Recent FROM must be newer than or equal to Recent TO.')
    if (Number(pf) < 1 || Number(pf) <= Number(ct) || Number(pf) > Number(pt)) {
      return invalid('Older candle range must be after the recent range without overlap.')
    }
    if (['crossUp', 'crossDown'].includes(cond.op) && Number(pt) - Number(pf) < 1) {
      return invalid('Cross Up / Down needs at least two older candles.')
    }
    if (cond.histCurrentMatch && !['any', 'all'].includes(cond.histCurrentMatch)) {
      return invalid('Choose ANY or ALL for the recent candles.')
    }
    if (cond.histPreviousMode && !['every', 'max', 'min', 'avg'].includes(cond.histPreviousMode)) {
      return invalid('Choose Every, Maximum, Minimum or Average for older candles.')
    }
  } else if (cond.rangeCheck) {
    if (!validIndex(cond.rangeFrom ?? -1, -1000, 0) || !validIndex(cond.rangeTo ?? -5, -1000, 0)) {
      return invalid('Multi-candle range must use 0 or negative candle indexes.')
    }
    if (cond.rangeMode && !['any', 'all'].includes(cond.rangeMode)) {
      return invalid('Choose ANY or ALL for the candle range.')
    }
    if (cond.rhsPinned && !validIndex(cond.rhsPinnedOffset ?? 0, -1000, 0)) {
      return invalid('Pinned comparison candle must be 0 or a past candle.')
    }
  } else if (!validIndex(cond.lhsOffset ?? 0, -1000, 0)) {
    return invalid('Left candle offset must be 0 or a past candle.')
  }

  const mode = cond.rhsMode ?? (cond.histCompare ? 'field' : null)
  if (!['number', 'field', 'mult', 'pct', 'pctdiff', 'slope'].includes(mode)) {
    return invalid('Choose a Compare With mode (Value, Field, Multiplier, Percent, Diff or Slope).')
  }
  if (['crossUp', 'crossDown'].includes(cond.op) && mode !== 'field') {
    return invalid('Cross Up / Down requires the Field comparison mode.')
  }
  if (!['number', 'slope'].includes(mode)) {
    const field = cond.histCompare ? (cond.rhsField || cond.lhsField) : cond.rhsField
    if (!field || !FIELD_MAP[field]) return invalid('Choose a valid historical / right indicator.')
    if (!cond.histCompare && !cond.rangeCheck && !validIndex(cond.rhsOffset ?? 0, -1000, 0)) {
      return invalid('Right candle offset must be 0 or a past candle.')
    }
    if (cond.rangeCheck && !cond.histCompare && !cond.rhsPinned &&
      !validIndex(cond.rhsOffset ?? 0, -1000, 0)) {
      return invalid('Right candle offset must be 0 or a past candle.')
    }
  }
  if (['number', 'pctdiff'].includes(mode) && !validNumber(cond.rhsNum ?? 0)) {
    return invalid('Enter a valid numeric comparison value.')
  }
  if (mode === 'mult' && (!validNumber(cond.rhsMult ?? 1) || Number(cond.rhsMult ?? 1) === 0)) {
    return invalid('Enter a non-zero multiplier.')
  }
  if (mode === 'pct' && !validNumber(cond.rhsPct ?? 0)) {
    return invalid('Enter a valid percentage.')
  }
  if (mode === 'slope') {
    if (!validIndex(cond.slopeLen ?? 5, 1, 1000) || !validIndex(cond.slopeSkip ?? 0, 0, 1000)) {
      return invalid('Slope look-back and skip must be valid candle counts.')
    }
    if (!validNumber(cond.slopeNum ?? 0)) return invalid('Enter a slope threshold.')
  }
  return { valid: true, reason: 'Ready to evaluate. Signal depends on market data.' }
}


// Calculate the candle history needed by the selected conditions.
// EMA history includes a 400-bar stabilization buffer (API limit is 1,000).
export function requiredCandleCount(items = []) {
  const list = Array.isArray(items) ? items : [items]
  const conditions = list.flatMap(item =>
    Array.isArray(item?.conditions) ? item.conditions : [item]
  ).filter(Boolean)
  let maxDepth = 0
  let maxEma = 0
  for (const c of conditions) {
    const offsets = [
      Math.abs(Number(c.lhsOffset) || 0),
      Math.abs(Number(c.rhsOffset) || 0),
      Math.abs(Number(c.rhsPinnedOffset) || 0),
      Math.abs(Number(c.rangeFrom) || 0),
      Math.abs(Number(c.rangeTo) || 0),
      c.histCompare ? Math.max(Number(c.histCurrentTo) || 0, Number(c.histPreviousTo) || 0) : 0,
      (Number(c.slopeSkip) || 0) + (Number(c.slopeLen) || 0),
    ]
    maxDepth = Math.max(maxDepth, ...offsets)
    for (const field of [c.lhsField, c.rhsField]) {
      const match = typeof field === 'string' ? field.match(/^ema(\d+)$/) : null
      if (match) maxEma = Math.max(maxEma, Number(match[1]))
    }
  }
  return Math.min(1000, Math.max(250, maxDepth + 250, maxEma ? maxEma + maxDepth + 400 : 250))
}



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

  if (c.histCompare) {
    const f = FIELD_MAP[c.lhsField]?.short || c.lhsField || '?'
    const rf = FIELD_MAP[c.rhsField || c.lhsField]?.short || c.rhsField || c.lhsField || '?'
    const cf = c.histCurrentFrom ?? 1, ct = c.histCurrentTo ?? 2
    const pf = c.histPreviousFrom ?? 3, pt = c.histPreviousTo ?? 20
    // Stored historical indices are backward compatible: 1 means [-1], 0 means [0].
    const signed = n => Number(n) === 0 ? '0' : String(-Math.abs(Number(n)))
    const recentRange = `${signed(cf)}→${signed(ct)}`
    const olderRange = `${signed(pf)}→${signed(pt)}`
    const operator = c.op || '?'
    if (['crossUp','crossDown'].includes(c.op)) return `${htfPfx}${f}[${recentRange}] ${c.op === 'crossUp' ? 'Cross Up' : 'Cross Down'} BOTH halves of ${rf}[${olderRange}]`
    const mode = (c.histPreviousMode ?? 'max').toUpperCase()
    const match = (c.histCurrentMatch ?? 'any').toUpperCase()
    const ref = `${rf} PREV[${olderRange}] ${mode}`
    const rhs = c.rhsMode === 'number' ? String(c.rhsNum ?? 0) : c.rhsMode === 'mult' ? `${ref} × ${c.rhsMult ?? 1}` : c.rhsMode === 'pct' ? `${ref} × (1 + ${c.rhsPct ?? 0}/100)` : ref
    if (c.op === '% Diff' || c.rhsMode === 'pctdiff' || c.histCompareMode === 'pctdiff') return `${htfPfx}${match} %Δ(${f}[${recentRange}], ${ref}) ${c.op === '% Diff' ? c.histPctOp || '>=' : operator} ${c.op === '% Diff' ? c.histPctThreshold ?? c.rhsNum ?? 0 : c.rhsNum ?? 0}%`
    if (c.rhsMode === 'slope') return `${htfPfx}${match} ${f}[${recentRange}] slope (${c.slopeLen ?? 5}+${c.slopeSkip ?? 0} bars) ${operator} ${c.slopeNum ?? 0}%`
    return `${htfPfx}${match} ${f}[${recentRange}] ${operator} ${rhs}`
  }

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
        return v == null || !Number.isFinite(v) ? null : v
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
      if (cond.htfTf) {
        const htf = htfCandlesMap[cond.htfTf]
        // Never silently evaluate an HTF rule against the base timeframe.
        if (!Array.isArray(htf) || htf.length < 2) return null
        return makeAccessors(htf)
      }
      return base
    }

    function evalCond(cond) {
      // Fail closed for unfinished rules; an unknown/blank operator must never
      // fall through to the final "not equal" comparison and produce a signal.
      if (!validateConditionConfig(cond).valid || cond.mirrorReviewReason) return null
      const accessors = resolveAccessors(cond)
      if (!accessors) return null
      const { arr, L, getC: gC, getVal: gV } = accessors

      // ── Historical range comparison: current window vs older reference window ──
      if (cond.histCompare) {
        if (!cond.op) return null // no hidden comparison direction / no accidental signal
        const cf = Math.max(0, Math.min(20, Math.round(cond.histCurrentFrom ?? 1)))
        const ct = Math.max(0, Math.min(20, Math.round(cond.histCurrentTo ?? 2)))
        const pf = Math.max(1, Math.min(20, Math.round(cond.histPreviousFrom ?? 3)))
        const pt = Math.max(1, Math.min(20, Math.round(cond.histPreviousTo ?? 20)))
        const cStart = Math.min(cf, ct), cEnd = Math.max(cf, ct)
        const pStart = Math.min(pf, pt), pEnd = Math.max(pf, pt)
        if (pStart <= cEnd) return null // reference window must be older and non-overlapping
        // Convert user-facing candle numbers (1 = latest closed) to negative offsets.
        const currentValues = [], previousValues = []
        for (let n = cStart; n <= cEnd; n++) {
          const off = -n, candle = gC(off)
          if (!candle) return null
          const value = gV(candle, cond.lhsField, L - 1 + off)
          if (value == null || !Number.isFinite(Number(value))) return null
          currentValues.push(Number(value))
        }
        for (let n = pStart; n <= pEnd; n++) {
          const off = -n, candle = gC(off)
          if (!candle) return null
          const value = gV(candle, cond.rhsField || cond.lhsField, L - 1 + off)
          if (value == null || !Number.isFinite(Number(value))) return null
          previousValues.push(Number(value))
        }
        if (cond.op === 'crossUp' || cond.op === 'crossDown') {
          if (previousValues.length < 2) return null
          const up = cond.op === 'crossUp'
          const split = Math.ceil(previousValues.length / 2)
          const extreme = up ? Math.max : Math.min
          const b = extreme(...previousValues.slice(0, split))
          const c = extreme(...previousValues.slice(split))
          let start
          if (cond.lhsField === 'close') {
            const opens = []
            for (let n = cStart; n <= cEnd; n++) {
              const value = gV(gC(-n), 'open', L - 1 - n)
              if (!Number.isFinite(value)) return null
              opens.push(value)
            }
            start = (up ? Math.min : Math.max)(...opens)
          } else {
            start = currentValues[currentValues.length - 1]
          }
          const end = currentValues[0]
          return up ? start < Math.min(b,c) && end > Math.max(b,c)
                    : start > Math.max(b,c) && end < Math.min(b,c)
        }
        const legacyPctDiff = cond.op === '% Diff' || (cond.histCompareMode ?? 'value') === 'pctdiff'
        const rhsMode = legacyPctDiff ? 'pctdiff' : (cond.rhsMode ?? 'field')
        const rawOp = cond.op === '% Diff' ? (cond.histPctOp || '>=') : cond.op
        const op = OP_SYM[rawOp] || rawOp
        const compare = (a, b) => {
          if (op === '>') return a > b
          if (op === '>=') return a >= b
          if (op === '<') return a < b
          if (op === '<=') return a <= b
          if (op === '==') return Math.abs(a - b) < 1e-9
          if (op === '!=') return Math.abs(a - b) >= 1e-9
          return false
        }
        const previousMode = cond.histPreviousMode ?? 'max'
        const referenceValue = previousMode === 'min' ? Math.min(...previousValues)
          : previousMode === 'avg' ? previousValues.reduce((a,b)=>a+b,0) / previousValues.length
          : Math.max(...previousValues)
        const currentResults = currentValues.map((currentValue, index) => {
          if (rhsMode === 'number') return compare(currentValue, Number.parseFloat(cond.rhsNum) || 0)
          if (rhsMode === 'slope') {
            const candleNo = cStart + index
            const lookback = Math.max(1, Math.round(cond.slopeLen ?? 5)) + Math.max(0, Math.round(cond.slopeSkip ?? 0))
            const nowValue = currentValue
            const pastCandle = gC(-(candleNo + lookback))
            const pastValue = gV(pastCandle, cond.lhsField, L - 1 - (candleNo + lookback))
            if (pastValue == null || pastValue === 0) return null
            const slopePct = (nowValue / pastValue - 1) * 100
            return compare(slopePct, Number.parseFloat(cond.slopeNum) || 0)
          }
          const compareReference = baseValue => {
          if (baseValue == null) return null
          if (rhsMode === 'mult') return compare(currentValue, baseValue * (Number.parseFloat(cond.rhsMult) || 1))
          if (rhsMode === 'pct') return compare(currentValue, baseValue * (1 + (Number.parseFloat(cond.rhsPct) || 0) / 100))
          if (rhsMode === 'pctdiff') {
            if (baseValue === 0) return null
            const diffPct = (currentValue / baseValue - 1) * 100
            return compare(diffPct, Number.parseFloat(cond.op === '% Diff' ? (cond.histPctThreshold ?? cond.rhsNum) : cond.rhsNum) || 0)
          }
          return compare(currentValue, baseValue)
          }
          const refs = previousMode === 'every' ? previousValues : [referenceValue]
          const checks = refs.map(compareReference)
          return checks.some(v=>v==null) ? null : checks.every(Boolean)
        })
        if (currentResults.some(result => result == null)) return null
        return (cond.histCurrentMatch ?? 'any') === 'all'
          ? currentResults.every(Boolean)
          : currentResults.some(Boolean)
      }

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
          if (!lhsCandle) return null
          const lhsV = gV(lhsCandle, cond.lhsField, absIdx)
          if (lhsV == null) return null

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
            if (nowV == null || pastV == null || pastV === 0) return null
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
            if (rhsBase == null) return null
            if (cond.rhsMode === 'field')      rhsV = rhsBase
            else if (cond.rhsMode === 'mult')  rhsV = rhsBase * (parseFloat(cond.rhsMult) || 1)
            else if (cond.rhsMode === 'pct')   rhsV = rhsBase * (1 + (parseFloat(cond.rhsPct) || 0) / 100)
            else if (cond.rhsMode === 'pctdiff') {
              if (rhsBase === 0) return null
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
        const expectedCount = end - start + 1
        if (results.length !== expectedCount) return null
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
      run: candles.slice(Math.max(0, len - 28), len),
      ema9: curr.ema9, ema20: curr.ema20, rsi: curr.rsi,
      accuracy,
    }
  }
}
