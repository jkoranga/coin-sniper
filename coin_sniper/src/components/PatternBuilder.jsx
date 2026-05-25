// ─── Pattern Builder v3 ───────────────────────────────────────────────────────
import React, { useState, useMemo, useRef } from 'react'

// ── Field catalogue ───────────────────────────────────────────────────────────
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
const FIELD_GROUPS = FIELDS.reduce((g, f) => { (g[f.group] = g[f.group] || []).push(f); return g }, {})

const OPS = ['>', '>=', '<', '<=', '=', '≠']
const OP_SYM = { '=': '==', '≠': '!=' }

// RHS modes
const RHS_MODES = [
  { id: 'number',  label: 'Value',       hint: 'A fixed number' },
  { id: 'field',   label: 'Field',       hint: 'Another candle field' },
  { id: 'mult',    label: '× Mult',      hint: 'Field × multiplier  e.g. EMA20[-2] × 1.5' },
  { id: 'pct',     label: '± %',         hint: 'Field ± percent  e.g. EMA20[-2] + 0.35%' },
  { id: 'pctdiff', label: '% Diff',      hint: '% gap between left and right field' },
  { id: 'slope',   label: 'Slope %',     hint: '(field[0] / field[-N] − 1) × 100 — how much the field rose over N candles' },
]

// Range-check modes — condition applied to every candle in a window
const RANGE_MODES = [
  { id: 'all', label: 'ALL candles pass' },
  { id: 'any', label: 'ANY candle passes' },
]

const OFFSETS = Array.from({ length: 11 }, (_, i) =>
  i === 0 ? { v: 0, label: '[0] Current' } : { v: -i, label: `[-${i}] Prev ${i}` }
)

const TF_LIST = ['1m','3m','5m','15m','30m','1h','4h','1d']
const ICON_CATEGORIES = [
  { label: '📈 Markets',  icons: ['📈','📉','💹','📊','💰','💵','💴','💸','🏦','💳','🪙','💲'] },
  { label: '🚀 Signals',  icons: ['🚀','⚡','🔥','💎','🎯','🏹','🧲','🔔','⭐','🌟','✨','💫'] },
  { label: '🌊 Nature',   icons: ['🌊','🌪','⛈','🌙','🌞','🌈','❄️','🌋','🌀','🦁','🐂','🐻'] },
  { label: '⚔️ Power',    icons: ['⚔️','🛡','🗡','💣','🔱','👑','🏆','🎖','🥇','⚠️','☠️','🔴'] },
  { label: '🔧 Tools',    icons: ['🔧','🔩','⚙️','🔬','🧪','🧬','📡','🖥','💻','📱','🔭','🛰'] },
  { label: '🎰 Fun',      icons: ['🎰','🎲','🎯','🃏','🎪','🎭','🎬','🎵','🎸','🥂','🍀','🦋'] },
]

const G = '#00e676'
const R = '#ff4757'
const A = '#b388ff'
const BLU = '#4dabf7'
const AMB = '#ffa000'

// Per-condition colour palette (cycles if more than palette length)
const COND_COLORS = [
  '#4dabf7', // blue
  '#b388ff', // violet
  '#ffa000', // amber
  '#26c6da', // cyan
  '#f06292', // pink
  '#a5d6a7', // mint green
  '#ffb74d', // orange
  '#80cbc4', // teal
  '#ce93d8', // lavender
  '#ef9a9a', // soft red
]
function condColor(idx) { return COND_COLORS[idx % COND_COLORS.length] }

// Group bracket colours (cycles across distinct groups)
const GROUP_COLORS = ['#69f0ae','#ff6090','#ffab40','#40c4ff','#ea80fc','#ccff90']
// Map groupId → stable color using a simple hash
function groupColor(groupId) {
  if (!groupId) return GROUP_COLORS[0]
  let h = 0
  for (let i = 0; i < groupId.length; i++) h = (h * 31 + groupId.charCodeAt(i)) >>> 0
  return GROUP_COLORS[h % GROUP_COLORS.length]
}

// Mirror an operator (flip comparison direction)
const MIRROR_OP = { '>': '<', '>=': '<=', '<': '>', '<=': '>=', '=': '=', '≠': '≠' }

// Flip High ↔ Low and LowerWick ↔ UpperWick for bearish/bullish mirror
const MIRROR_FIELD = {
  'high':      'low',
  'low':       'high',
  'lowerWick': 'upperWick',
  'upperWick': 'lowerWick',
}

function mirrorCond(cond) {
  const mirroredLhs = MIRROR_FIELD[cond.lhsField] ?? cond.lhsField
  const mirroredRhs = MIRROR_FIELD[cond.rhsField] ?? cond.rhsField

  // Wick swap: lowerWick <-> upperWick — same measurement direction, keep sign & op
  const wickSwap = cond.lhsField !== mirroredLhs &&
    (cond.lhsField === 'lowerWick' || cond.lhsField === 'upperWick')

  // Size/magnitude fields are always absolute positive values (0-100 range, no negatives).
  // Body%, Body, Range, Wick sizes, IsGreen/IsRed — keep RHS sign and operator on mirror.
  // Bull Body% > 90  →  Bear Body% > 90  (same threshold, not -90)
  // Size/magnitude fields — always absolute positive (0-100), keep value & op
  const SIZE_FIELDS = new Set([
    'body','bodyPct','range','rangePct',
    'upperWick','lowerWick','wickPct',
    'isGreen','isRed','volume',
  ])
  const isSizeField = SIZE_FIELDS.has(cond.lhsField)

  // RSI mirrors around 50 (the neutral midpoint):
  //   Bull RSI > 60  →  Bear RSI < 40   (100 - 60 = 40)
  //   Bull RSI > 70  →  Bear RSI < 30   (100 - 70 = 30)
  //   Bull RSI = 50  →  Bear RSI = 50   (symmetric)
  const isRsiField = cond.lhsField === 'rsi'

  const keepSign = wickSwap || isSizeField
  const keepOp   = isSizeField || wickSwap

  // Invert multiplier for non-size, non-RSI fields
  const rhsMult = cond.rhsMult != null
    ? (isSizeField || isRsiField ? parseFloat(cond.rhsMult) : parseFloat((1 / parseFloat(cond.rhsMult)).toFixed(6)))
    : cond.rhsMult

  // RSI: mirror rhsNum around 50; others: keep or negate
  const rhsNum = cond.rhsNum != null
    ? (isRsiField
        ? parseFloat((100 - parseFloat(cond.rhsNum)).toFixed(4))
        : keepSign ? parseFloat(cond.rhsNum) : -parseFloat(cond.rhsNum))
    : cond.rhsNum

  const rhsPct   = cond.rhsPct   != null ? (keepSign ? parseFloat(cond.rhsPct)   : -parseFloat(cond.rhsPct))   : cond.rhsPct
  const slopeNum = cond.slopeNum != null ? (keepSign ? parseFloat(cond.slopeNum) : -parseFloat(cond.slopeNum)) : cond.slopeNum

  // RSI flips operator (> 60 → < 40); size fields keep op; others flip
  const finalOp = isRsiField
    ? (MIRROR_OP[cond.op] ?? cond.op)
    : keepOp ? cond.op : (MIRROR_OP[cond.op] ?? cond.op)

  return {
    ...cond,
    id: uid(),
    op: finalOp,
    lhsField: mirroredLhs,
    rhsField: mirroredRhs,
    rhsMult,
    rhsNum,
    rhsPct,
    slopeNum,
    label: cond.label ? `Mirror of ${cond.label}` : '',
  }
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6) }

// ── Formula label ─────────────────────────────────────────────────────────────
export function condFormula(c) {
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
    if (c.rhsMode === 'number')  return `${windowLabel} ${lhsF} ${op} ${c.rhsNum ?? 0}`
    if (c.rhsMode === 'field')   return `${windowLabel} ${lhsF} ${op} ${rhs}`
    if (c.rhsMode === 'mult')    return `${windowLabel} ${lhsF} ${op} ${rhs} × ${c.rhsMult ?? 1}`
    if (c.rhsMode === 'pct') {
      const s = (c.rhsPct ?? 0) >= 0 ? '+' : ''
      return `${windowLabel} ${lhsF} ${op} ${rhs} ${s}${c.rhsPct ?? 0}%`
    }
    if (c.rhsMode === 'pctdiff') return `${windowLabel} (${lhsF}/${rhs}−1)×100 ${op} ${c.rhsNum ?? 0}%`
    if (c.rhsMode === 'slope') {
      const n = c.slopeLen ?? 5
      const sk = c.slopeSkip ?? 0
      const thresh = c.slopeNum ?? 0
      const s = thresh >= 0 ? '+' : ''
      const skipStr = sk > 0 ? `,skip${sk}` : ''
      return `${windowLabel} Slope(${lhsF},${n}${skipStr}) ${op} ${s}${thresh}%`
    }
    return `${windowLabel} ${lhsF} ${op} ?`
  }

  const lhsO = c.lhsOffset === 0 ? '' : `[${c.lhsOffset}]`
  const lhs  = `${lhsF}${lhsO}`

  if (c.rhsMode === 'number')  return `${lhs} ${op} ${c.rhsNum ?? 0}`

  const rhsF = FIELD_MAP[c.rhsField]?.short || (c.rhsField || '?')
  const rhsO = (c.rhsOffset ?? 0) === 0 ? '' : `[${c.rhsOffset}]`
  const rhs  = `${rhsF}${rhsO}`

  if (c.rhsMode === 'field')   return `${lhs} ${op} ${rhs}`
  if (c.rhsMode === 'mult')    return `${lhs} ${op} ${rhs} × ${c.rhsMult ?? 1}`
  if (c.rhsMode === 'pct') {
    const s = (c.rhsPct ?? 0) >= 0 ? '+' : ''
    return `${lhs} ${op} ${rhs} ${s}${c.rhsPct ?? 0}%`
  }
  if (c.rhsMode === 'pctdiff') return `(${lhs}/${rhs}−1)×100 ${op} ${c.rhsNum ?? 0}%`
  if (c.rhsMode === 'slope') {
    const n = c.slopeLen ?? 5
    const sk = c.slopeSkip ?? 0
    const thresh = c.slopeNum ?? 0
    const s = thresh >= 0 ? '+' : ''
    const skipStr = sk > 0 ? `,skip${sk}` : ''
    return `Slope(${lhs},${n}${skipStr}) ${op} ${s}${thresh}%`
  }
  return `${lhs} ${op} ?`
}

// ── Blank items ───────────────────────────────────────────────────────────────
function blankCond() {
  return {
    id: uid(), enabled: true, joinNext: 'AND',
    groupId: null,   // null = ungrouped; same string = same group (evaluated as a unit)
    label: '',
    lhsField: 'ema20', lhsOffset: 0,
    op: '>',
    rhsMode: 'mult', rhsField: 'ema20', rhsOffset: -2,
    rhsNum: 0, rhsMult: 1, rhsPct: 0,
    slopeLen: 5, slopeSkip: 0, slopeNum: 0, // for slope mode: look-back candles, skip recent candles, threshold %
    // Range check (applies condition to every candle in a window)
    rangeCheck: false,
    rangeFrom: -1,   // start offset (most recent), e.g. -1
    rangeTo: -5,     // end offset (oldest), e.g. -5
    rangeMode: 'all', // 'all' | 'any'
  }
}

export function blankPattern() {
  return {
    id: `custom_${uid()}`,
    name: 'My Pattern', side: 'bull', icon: '⭐',
    tfs: ['15m','1h'],
    conditions: [blankCond()],
    enabled: true, createdAt: Date.now(),
  }
}

// ── Compile pattern → logic(candles) ─────────────────────────────────────────
export function compilePattern(pattern) {
  // ── Core evaluator — returns true/false/null for a given candle array ─────
  function evalCore(candles) {
    if (!candles || candles.length < 5) return null
    const len = candles.length

    function getC(offset) {
      const idx = len - 1 + offset
      return idx >= 0 ? candles[idx] : null
    }
    function getVal(candle, fieldId, candleIdx) {
      if (!candle) return null
      const f = FIELD_MAP[fieldId]
      if (!f) return null
      // changePct: (close[i] / close[i-1] - 1) × 100
      if (f.needsPrev) {
        if (fieldId === 'changePct') {
          const prevIdx = (candleIdx ?? (len - 1)) - 1
          const prev = prevIdx >= 0 ? candles[prevIdx] : null
          if (!prev || prev.close === 0) return null
          return (candle.close / prev.close - 1) * 100
        }
        return null
      }
      if (f.computed) return f.computed(candle)
      const v = candle[fieldId]
      return v == null ? null : v
    }

    const active = pattern.conditions.filter(c => c.enabled)
    if (!active.length) return null

    function evalCond(cond) {
      // ── Range check: apply condition to every candle in [rangeFrom..rangeTo] ──
      if (cond.rangeCheck) {
        const from = Math.min(cond.rangeFrom ?? -1, 0)   // e.g. -1 (most recent)
        const to   = Math.min(cond.rangeTo   ?? -5, 0)   // e.g. -5 (oldest)
        const start = Math.min(from, to)
        const end   = Math.max(from, to)
        const results = []
        for (let off = start; off <= end; off++) {
          // Evaluate lhs at this offset, rhs at same offset (field-relative) or fixed
          const absIdx = len - 1 + off
          const lhsCandle = getC(off)
          if (!lhsCandle) continue
          const lhsV = getVal(lhsCandle, cond.lhsField, absIdx)
          if (lhsV == null) continue

          let rhsV
          if (cond.rhsMode === 'number') {
            rhsV = parseFloat(cond.rhsNum) || 0
          } else if (cond.rhsMode === 'slope') {
            const n  = Math.max(1, Math.round(cond.slopeLen ?? 5))
            const sk = Math.max(0, Math.round(cond.slopeSkip ?? 0))
            const nowCandle  = getC(off - sk)
            const nowV       = getVal(nowCandle, cond.lhsField, len - 1 + off - sk)
            const pastCandle = getC(off - sk - n)
            const pastV      = getVal(pastCandle, cond.lhsField, len - 1 + off - sk - n)
            if (nowV == null || pastV == null || pastV === 0) continue
            const slopePct = (nowV / pastV - 1) * 100
            const thresh   = parseFloat(cond.slopeNum) || 0
            const op = OP_SYM[cond.op] || cond.op
            let r
            if (op === '>')  r = slopePct >  thresh
            else if (op === '>=') r = slopePct >= thresh
            else if (op === '<')  r = slopePct <  thresh
            else if (op === '<=') r = slopePct <= thresh
            else if (op === '==') r = Math.abs(slopePct - thresh) < 1e-9
            else r = Math.abs(slopePct - thresh) >= 1e-9
            results.push(r)
            continue
          } else {
            // RHS field: if pinned, use fixed offset; otherwise walks with LHS
            const rhsOff = cond.rhsPinned ? (cond.rhsPinnedOffset ?? 0) : off + (cond.rhsOffset ?? 0)
            const rhsAbsIdx = len - 1 + rhsOff
            const rhsCandle = getC(rhsOff)
            const rhsBase = getVal(rhsCandle, cond.rhsField || cond.lhsField, rhsAbsIdx)
            if (rhsBase == null) continue
            if (cond.rhsMode === 'field')   rhsV = rhsBase
            else if (cond.rhsMode === 'mult')  rhsV = rhsBase * (parseFloat(cond.rhsMult) || 1)
            else if (cond.rhsMode === 'pct')   rhsV = rhsBase * (1 + (parseFloat(cond.rhsPct) || 0) / 100)
            else if (cond.rhsMode === 'pctdiff') {
              if (rhsBase === 0) continue
              const diff = (lhsV / rhsBase - 1) * 100
              const num  = parseFloat(cond.rhsNum) || 0
              const op   = OP_SYM[cond.op] || cond.op
              let r
              if (op === '>')  r = diff >  num
              else if (op === '>=') r = diff >= num
              else if (op === '<')  r = diff <  num
              else if (op === '<=') r = diff <= num
              else if (op === '==') r = Math.abs(diff - num) < 1e-9
              else r = Math.abs(diff - num) >= 1e-9
              results.push(r)
              continue
            } else { rhsV = rhsBase }
          }

          const op = OP_SYM[cond.op] || cond.op
          let r
          if (op === '>')  r = lhsV >  rhsV
          else if (op === '>=') r = lhsV >= rhsV
          else if (op === '<')  r = lhsV <  rhsV
          else if (op === '<=') r = lhsV <= rhsV
          else if (op === '==') r = Math.abs(lhsV - rhsV) < 1e-9
          else r = Math.abs(lhsV - rhsV) >= 1e-9
          results.push(r)
        }
        if (!results.length) return null
        return cond.rangeMode === 'any' ? results.some(Boolean) : results.every(Boolean)
      }

      // ── Standard single-candle check ──
      const lhsAbsIdx = len - 1 + (cond.lhsOffset ?? 0)
      const lhsV = getVal(getC(cond.lhsOffset), cond.lhsField, lhsAbsIdx)
      if (lhsV == null) return null

      let rhsV
      const rhsAbsIdx = len - 1 + (cond.rhsOffset ?? 0)
      const rhsBase = cond.rhsField ? getVal(getC(cond.rhsOffset ?? 0), cond.rhsField, rhsAbsIdx) : null

      if (cond.rhsMode === 'number')  { rhsV = parseFloat(cond.rhsNum) || 0 }
      else if (cond.rhsMode === 'field')   { if (rhsBase == null) return null; rhsV = rhsBase }
      else if (cond.rhsMode === 'mult')    { if (rhsBase == null) return null; rhsV = rhsBase * (parseFloat(cond.rhsMult) || 1) }
      else if (cond.rhsMode === 'pct')     { if (rhsBase == null) return null; rhsV = rhsBase * (1 + (parseFloat(cond.rhsPct) || 0) / 100) }
      else if (cond.rhsMode === 'slope') {
        const n  = Math.max(1, Math.round(cond.slopeLen ?? 5))
        const sk = Math.max(0, Math.round(cond.slopeSkip ?? 0))
        const nowAbsIdx  = lhsAbsIdx - sk
        const pastAbsIdx = lhsAbsIdx - sk - n
        const nowCandle  = nowAbsIdx  >= 0 ? candles[nowAbsIdx]  : null
        const pastCandle = pastAbsIdx >= 0 ? candles[pastAbsIdx] : null
        const nowV  = getVal(nowCandle,  cond.lhsField, nowAbsIdx)
        const pastV = getVal(pastCandle, cond.lhsField, pastAbsIdx)
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
  return function logic(candles) {
    if (!evalCore(candles)) return null

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
      if (evalCore(slice) === true) {
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

// ── UI primitives ─────────────────────────────────────────────────────────────
function Pill({ active, color = A, onClick, children, sm }) {
  return (
    <button onClick={onClick} style={{
      padding: sm ? '4px 9px' : '6px 12px',
      borderRadius: 20, cursor: 'pointer',
      fontSize: sm ? 10 : 11, fontFamily: 'var(--mono)', fontWeight: active ? 800 : 500,
      border: `1.5px solid ${active ? color : 'var(--border)'}`,
      background: active ? `${color}1e` : 'transparent',
      color: active ? color : 'var(--text3)',
      transition: 'all .12s', whiteSpace: 'nowrap', flexShrink: 0,
    }}>{children}</button>
  )
}

function Lbl({ children }) {
  return <div style={{ fontSize: 9, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--text3)', letterSpacing: '.07em', marginBottom: 5 }}>{children}</div>
}

function FSelect({ value, offset, onField, onOffset, color, hideOffset }) {
  return (
    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
      <select value={value} onChange={e => onField(e.target.value)} style={{
        background: 'var(--bg3)', border: `1.5px solid ${color}55`,
        color, borderRadius: 8, padding: '6px 9px',
        fontSize: 12, fontFamily: 'var(--mono)', fontWeight: 700, cursor: 'pointer',
      }}>
        {Object.entries(FIELD_GROUPS).map(([grp, fs]) => (
          <optgroup key={grp} label={grp}>
            {fs.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
          </optgroup>
        ))}
      </select>
      {!hideOffset && (
        <select value={offset ?? 0} onChange={e => onOffset(parseInt(e.target.value))} style={{
          background: 'var(--bg3)', border: '1.5px solid var(--border)',
          color: 'var(--text2)', borderRadius: 8, padding: '6px 8px',
          fontSize: 11, fontFamily: 'var(--mono)', cursor: 'pointer',
        }}>
          {OFFSETS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
        </select>
      )}
    </div>
  )
}

function NInput({ value, onChange, suffix, step = 'any', w = 80 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <input type="number" value={value ?? 0} step={step}
        onChange={e => onChange(e.target.value)}
        style={{
          width: w, background: 'var(--bg3)', border: '1.5px solid var(--border2)',
          color: 'var(--text)', borderRadius: 8, padding: '6px 9px',
          fontSize: 12, fontFamily: 'var(--mono)',
        }} />
      {suffix && <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{suffix}</span>}
    </div>
  )
}

function IBtn({ onClick, title, children, col = 'var(--text3)' }) {
  return (
    <button onClick={onClick} title={title} style={{
      width: 26, height: 26, borderRadius: 7, border: '1px solid var(--border)',
      background: 'var(--bg2)', color: col, cursor: 'pointer',
      fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--mono)', fontWeight: 700, flexShrink: 0,
    }}>{children}</button>
  )
}

function JoinBadge({ value, onChange, onGroupToggle, grouped, groupColor }) {
  const isAnd = value === 'AND'
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, margin: '1px 0' }}>
      <div style={{ flex: 1, height: 1, background: grouped ? `${groupColor}40` : 'var(--border)' }} />
      {/* AND / OR toggle */}
      <button onClick={() => onChange(isAnd ? 'OR' : 'AND')} style={{
        padding: '3px 14px', borderRadius: 20, cursor: 'pointer',
        fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 800,
        border: `1.5px solid ${isAnd ? BLU + '90' : AMB + '90'}`,
        background: isAnd ? BLU + '18' : AMB + '18',
        color: isAnd ? BLU : AMB,
        letterSpacing: '.07em', transition: 'all .15s',
      }}>{value}</button>
      {/* Group toggle button */}
      <button
        onClick={onGroupToggle}
        title={grouped ? 'Remove from group' : 'Group with condition above'}
        style={{
          padding: '3px 8px', borderRadius: 20, cursor: 'pointer',
          fontSize: 9, fontFamily: 'var(--mono)', fontWeight: 800,
          border: `1.5px solid ${grouped ? groupColor + 'cc' : 'rgba(150,150,150,0.3)'}`,
          background: grouped ? groupColor + '22' : 'transparent',
          color: grouped ? groupColor : 'var(--text3)',
          letterSpacing: '.05em', transition: 'all .15s',
        }}
      >{grouped ? '[ ]' : '( )'}</button>
      <div style={{ flex: 1, height: 1, background: grouped ? `${groupColor}40` : 'var(--border)' }} />
    </div>
  )
}

// ── Condition card ────────────────────────────────────────────────────────────
function CondCard({ cond, idx, total, color, onChange, onRemove, onCopy, onMoveUp, onMoveDown, open, onToggleOpen }) {
  function s(k, v) { onChange({ ...cond, [k]: v }) }
  const formula = condFormula(cond)
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <div style={{
      borderRadius: 10,
      border: `1.5px solid ${cond.enabled ? color + '50' : 'var(--border)'}`,
      background: cond.enabled ? `${color}08` : 'rgba(0,0,0,0.1)',
      opacity: cond.enabled ? 1 : 0.5,
      transition: 'opacity .15s',
      overflow: 'hidden',
    }}>
      {/* Topbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '7px 9px', background: 'rgba(0,0,0,0.2)',
      }}>
        {/* Enable / Disable toggle button */}
        <button
          onClick={() => s('enabled', !cond.enabled)}
          title={cond.enabled ? 'Disable condition' : 'Enable condition'}
          style={{
            height: 20, padding: '0 7px', borderRadius: 5, cursor: 'pointer', flexShrink: 0,
            border: `1.5px solid ${cond.enabled ? color + '80' : 'rgba(255,60,60,0.5)'}`,
            background: cond.enabled ? `${color}20` : 'rgba(255,60,60,0.1)',
            color: cond.enabled ? color : 'var(--red)',
            fontSize: 9, fontFamily: 'var(--mono)', fontWeight: 800,
            letterSpacing: '.04em', transition: 'all .15s',
            display: 'flex', alignItems: 'center', gap: 4,
            boxShadow: cond.enabled ? 'none' : '0 0 6px rgba(255,60,60,0.35)',
          }}
        >
          <div style={{
            width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
            background: cond.enabled ? color : 'var(--red)',
            boxShadow: cond.enabled ? `0 0 5px ${color}` : '0 0 6px rgba(255,60,60,0.9)',
            transition: 'all .15s',
          }} />
          {cond.enabled ? 'ON' : 'OFF'}
        </button>

        {/* Formula — tap to expand */}
        <div onClick={onToggleOpen} style={{
          flex: 1, fontFamily: 'var(--mono)', fontWeight: 700,
          fontSize: 11, color: cond.enabled ? color : 'var(--text3)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          cursor: 'pointer',
        }}>
          {formula}
        </div>

        {/* Action icons */}
        <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
          {idx > 0        && <IBtn onClick={onMoveUp}   title="Move up">↑</IBtn>}
          {idx < total-1  && <IBtn onClick={onMoveDown} title="Move down">↓</IBtn>}
          <IBtn onClick={onCopy}   title="Duplicate condition" col={BLU}>⧉</IBtn>
          {confirmDelete ? (
            <>
              <IBtn onClick={onRemove} title="Confirm delete" col="var(--red)" style={{ padding: '0 7px', fontSize: 9, fontWeight: 800, letterSpacing: '.03em' }}>DEL?</IBtn>
              <IBtn onClick={() => setConfirmDelete(false)} title="Cancel" col="var(--text3)">✕</IBtn>
            </>
          ) : (
            <IBtn onClick={() => setConfirmDelete(true)} title="Delete" col="var(--red)">×</IBtn>
          )}
        </div>
        <span onClick={onToggleOpen} style={{ color:'var(--text3)', fontSize:11, cursor:'pointer', flexShrink:0 }}>
          {open ? '▲' : '▼'}
        </span>
      </div>

      {/* Body */}
      {open && (
        <div style={{ padding: '8px 9px 10px', display: 'flex', flexDirection: 'column', gap: 7 }}>

          {/* RANGE CHECK TOGGLE */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '7px 10px', borderRadius: 8,
            background: cond.rangeCheck ? `${color}14` : 'rgba(0,0,0,0.12)',
            border: `1px solid ${cond.rangeCheck ? color + '40' : 'var(--border)'}`,
            transition: 'all .15s',
          }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: cond.rangeCheck ? color : 'var(--text2)' }}>
                Multi-Candle Range
              </div>
              <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', marginTop: 1 }}>
                {cond.rangeCheck
                  ? `Check ${Math.abs((cond.rangeTo ?? -5) - (cond.rangeFrom ?? -1)) + 1} candles [${cond.rangeFrom ?? -1} → ${cond.rangeTo ?? -5}]`
                  : 'Apply condition across a window of candles'}
              </div>
            </div>
            {/* Toggle switch */}
            <div onClick={() => s('rangeCheck', !cond.rangeCheck)} style={{
              width: 38, height: 22, borderRadius: 11, cursor: 'pointer', flexShrink: 0,
              background: cond.rangeCheck ? color : 'var(--bg3)',
              border: `1.5px solid ${cond.rangeCheck ? color : 'var(--border)'}`,
              position: 'relative', transition: 'all .2s',
            }}>
              <div style={{
                position: 'absolute', top: 2,
                left: cond.rangeCheck ? 18 : 2,
                width: 14, height: 14, borderRadius: '50%',
                background: '#fff', transition: 'left .2s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
              }} />
            </div>
          </div>

          {/* RANGE WINDOW CONTROLS (shown when range is on) */}
          {cond.rangeCheck && (
            <div style={{
              padding: '10px 10px', borderRadius: 8,
              background: `${color}0a`, border: `1px solid ${color}30`,
              display: 'flex', flexDirection: 'column', gap: 9,
            }}>
              {/* From / To row */}
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <Lbl>FROM (newest)</Lbl>
                  <select value={cond.rangeFrom ?? -1} onChange={e => s('rangeFrom', parseInt(e.target.value))} style={{
                    width: '100%', background: 'var(--bg3)', border: `1.5px solid ${color}40`,
                    color: 'var(--text)', borderRadius: 7, padding: '6px 8px', fontSize: 11,
                    fontFamily: 'var(--mono)',
                  }}>
                    {Array.from({ length: 21 }, (_, i) => -i).map(v => (
                      <option key={v} value={v}>[{v}] {v === 0 ? 'Current' : `Prev ${Math.abs(v)}`}</option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <Lbl>TO (oldest)</Lbl>
                  <select value={cond.rangeTo ?? -5} onChange={e => s('rangeTo', parseInt(e.target.value))} style={{
                    width: '100%', background: 'var(--bg3)', border: `1.5px solid ${color}40`,
                    color: 'var(--text)', borderRadius: 7, padding: '6px 8px', fontSize: 11,
                    fontFamily: 'var(--mono)',
                  }}>
                    {Array.from({ length: 21 }, (_, i) => -i).map(v => (
                      <option key={v} value={v}>[{v}] {v === 0 ? 'Current' : `Prev ${Math.abs(v)}`}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* ALL / ANY */}
              <div>
                <Lbl>MATCH</Lbl>
                <div style={{ display: 'flex', gap: 6 }}>
                  {RANGE_MODES.map(m => (
                    <button key={m.id} onClick={() => s('rangeMode', m.id)} style={{
                      flex: 1, padding: '6px 8px', borderRadius: 7, cursor: 'pointer',
                      fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 11,
                      border: `1.5px solid ${cond.rangeMode === m.id ? color : 'var(--border)'}`,
                      background: cond.rangeMode === m.id ? `${color}20` : 'var(--bg3)',
                      color: cond.rangeMode === m.id ? color : 'var(--text3)',
                      transition: 'all .15s',
                    }}>{m.label}</button>
                  ))}
                </div>
              </div>

              {/* Summary pill */}
              <div style={{
                fontSize: 10, fontFamily: 'var(--mono)', color: color,
                padding: '4px 9px', borderRadius: 6,
                background: `${color}10`, border: `1px solid ${color}25`,
              }}>
                {cond.rangeMode === 'any' ? 'ANY' : 'ALL'} candles
                from [{cond.rangeFrom ?? -1}] to [{cond.rangeTo ?? -5}]
                ({Math.abs((cond.rangeTo ?? -5) - (cond.rangeFrom ?? -1)) + 1} candles) must pass
              </div>
            </div>
          )}

          {/* LEFT SIDE — show candle offset only when range is OFF */}
          <div style={{ padding: '7px 8px', borderRadius: 7, background: 'rgba(0,0,0,0.18)' }}>
            <Lbl>LEFT — candle field</Lbl>
            <FSelect
              value={cond.lhsField} offset={cond.rangeCheck ? 0 : cond.lhsOffset}
              onField={v => s('lhsField', v)} onOffset={cond.rangeCheck ? null : v => s('lhsOffset', v)}
              color={color} hideOffset={!!cond.rangeCheck}
            />
          </div>

          {/* OPERATOR */}
          <div>
            <Lbl>OPERATOR</Lbl>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {OPS.map(op => (
                <Pill key={op} active={cond.op === op} color={color} onClick={() => s('op', op)}>{op}</Pill>
              ))}
            </div>
          </div>

          {/* RIGHT SIDE — mode select */}
          <div style={{ padding: '7px 8px', borderRadius: 7, background: 'rgba(0,0,0,0.18)' }}>
            <Lbl>RIGHT — compare to</Lbl>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 9 }}>
              {RHS_MODES.map(m => (
                <Pill key={m.id} active={cond.rhsMode === m.id} color={color}
                  onClick={() => s('rhsMode', m.id)} sm>{m.label}</Pill>
              ))}
            </div>

            {/* hint */}
            <div style={{ fontSize: 9, fontFamily:'var(--mono)', color:'var(--text3)', marginBottom: 8, opacity:.75 }}>
              {RHS_MODES.find(m => m.id === cond.rhsMode)?.hint}
            </div>

            {/* PIN RHS OFFSET — only shown in range check mode, for field-based RHS */}
            {cond.rangeCheck && !['number','slope'].includes(cond.rhsMode) && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '7px 10px', borderRadius: 8, marginBottom: 8,
                background: cond.rhsPinned ? `${color}14` : 'rgba(0,0,0,0.12)',
                border: `1px solid ${cond.rhsPinned ? color + '40' : 'var(--border)'}`,
                transition: 'all .15s',
              }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: cond.rhsPinned ? color : 'var(--text2)' }}>
                    Pin RHS to fixed candle
                  </div>
                  <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', marginTop: 1 }}>
                    {cond.rhsPinned
                      ? `RHS fixed at [${cond.rhsPinnedOffset ?? 0}] — not walking with range`
                      : 'RHS walks with range (each candle vs its own field)'}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  {cond.rhsPinned && (
                    <select
                      value={cond.rhsPinnedOffset ?? 0}
                      onChange={e => s('rhsPinnedOffset', parseInt(e.target.value))}
                      style={{
                        background: 'var(--bg3)', border: `1.5px solid ${color}50`,
                        color, borderRadius: 7, padding: '4px 7px',
                        fontSize: 11, fontFamily: 'var(--mono)', cursor: 'pointer',
                      }}
                    >
                      {OFFSETS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
                    </select>
                  )}
                  <div onClick={() => s('rhsPinned', !cond.rhsPinned)} style={{
                    width: 38, height: 22, borderRadius: 11, cursor: 'pointer', flexShrink: 0,
                    background: cond.rhsPinned ? color : 'var(--bg3)',
                    border: `1.5px solid ${cond.rhsPinned ? color : 'var(--border)'}`,
                    position: 'relative', transition: 'all .2s',
                  }}>
                    <div style={{
                      position: 'absolute', top: 2,
                      left: cond.rhsPinned ? 18 : 2,
                      width: 14, height: 14, borderRadius: '50%',
                      background: '#fff', transition: 'left .2s',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                    }} />
                  </div>
                </div>
              </div>
            )}

            {/* Value inputs per mode */}
            {cond.rhsMode === 'number' && (
              <NInput value={cond.rhsNum} onChange={v => s('rhsNum', v)} />
            )}

            {cond.rhsMode === 'field' && (
              <FSelect
                value={cond.rhsField || 'ema20'} offset={cond.rhsOffset ?? 0}
                onField={v => s('rhsField', v)} onOffset={v => s('rhsOffset', v)}
                color={color} hideOffset={!!cond.rangeCheck}
              />
            )}

            {cond.rhsMode === 'mult' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <FSelect
                  value={cond.rhsField || 'ema20'} offset={cond.rhsOffset ?? 0}
                  onField={v => s('rhsField', v)} onOffset={v => s('rhsOffset', v)}
                  color={color} hideOffset={!!cond.rangeCheck}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ fontFamily:'var(--mono)', color:'var(--text3)', fontSize:13 }}>×</span>
                  <NInput value={cond.rhsMult ?? 1} onChange={v => s('rhsMult', v)} step="0.0001" />
                  <span style={{ fontSize:9, color:'var(--text3)', fontFamily:'var(--mono)' }}>1.5 = ×1.5 · 1.005 = +0.5%</span>
                </div>
              </div>
            )}

            {cond.rhsMode === 'pct' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <FSelect
                  value={cond.rhsField || 'ema20'} offset={cond.rhsOffset ?? 0}
                  onField={v => s('rhsField', v)} onOffset={v => s('rhsOffset', v)}
                  color={color} hideOffset={!!cond.rangeCheck}
                />
                <NInput value={cond.rhsPct ?? 0} onChange={v => s('rhsPct', v)} step="0.01" suffix="%" />
              </div>
            )}

            {cond.rhsMode === 'pctdiff' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <FSelect
                  value={cond.rhsField || 'ema20'} offset={cond.rhsOffset ?? 0}
                  onField={v => s('rhsField', v)} onOffset={v => s('rhsOffset', v)}
                  color={color} hideOffset={!!cond.rangeCheck}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize:11, fontFamily:'var(--mono)', color:'var(--text3)' }}>{cond.op}</span>
                  <NInput value={cond.rhsNum ?? 0} onChange={v => s('rhsNum', v)} step="0.01" suffix="%" />
                </div>
                <div style={{ fontSize:9, fontFamily:'var(--mono)', color:'var(--text3)' }}>
                  (Left / Right − 1) × 100 {cond.op} {cond.rhsNum ?? 0}%
                </div>
              </div>
            )}


            {cond.rhsMode === 'slope' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {/* Which field to measure slope of — same as LHS, just show info */}
                <div style={{
                  fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)',
                  padding: '6px 9px', borderRadius: 7, background: 'rgba(0,0,0,0.18)',
                }}>
                  📐 Measures slope of <b style={{ color }}>{FIELD_MAP[cond.lhsField]?.short || cond.lhsField}</b> (same as LEFT field)
                </div>

                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 140 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <Lbl>LOOK-BACK CANDLES</Lbl>
                      <span style={{
                        fontSize: 13, fontWeight: 700, color,
                        background: `${color}20`, border: `1px solid ${color}40`,
                        borderRadius: 5, padding: '1px 7px', fontFamily: 'var(--mono)',
                      }}>{cond.slopeLen ?? 5}</span>
                    </div>
                    <input
                      type="range" min={1} max={20} step={1}
                      value={cond.slopeLen ?? 5}
                      onChange={e => s('slopeLen', parseInt(e.target.value))}
                      style={{ width: '100%', accentColor: color, cursor: 'pointer' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: 2 }}>
                      <span>1</span><span>5</span><span>10</span><span>15</span><span>20</span>
                    </div>
                  </div>
                  <div style={{ flex: 1, minWidth: 140 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <Lbl>SKIP RECENT CANDLES</Lbl>
                      <span style={{
                        fontSize: 13, fontWeight: 700,
                        color: (cond.slopeSkip ?? 0) > 0 ? color : 'var(--text3)',
                        background: (cond.slopeSkip ?? 0) > 0 ? `${color}20` : 'rgba(0,0,0,0.18)',
                        border: `1px solid ${(cond.slopeSkip ?? 0) > 0 ? color + '40' : 'var(--border)'}`,
                        borderRadius: 5, padding: '1px 7px', fontFamily: 'var(--mono)',
                      }}>{cond.slopeSkip ?? 0}</span>
                    </div>
                    <input
                      type="range" min={0} max={10} step={1}
                      value={cond.slopeSkip ?? 0}
                      onChange={e => s('slopeSkip', parseInt(e.target.value))}
                      style={{ width: '100%', accentColor: color, cursor: 'pointer' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: 2 }}>
                      <span>0</span><span>2</span><span>4</span><span>6</span><span>8</span><span>10</span>
                    </div>
                  </div>
                  <div>
                    <Lbl>THRESHOLD %</Lbl>
                    <NInput
                      value={cond.slopeNum ?? 0}
                      onChange={v => s('slopeNum', v)}
                      step="0.01" suffix="%" w={80}
                    />
                  </div>
                </div>

                {/* Live explanation */}
                <div style={{
                  fontSize: 9, fontFamily: 'var(--mono)', color: color,
                  padding: '6px 9px', borderRadius: 6,
                  background: `${color}10`, border: `1px solid ${color}25`,
                  lineHeight: 1.7,
                }}>
                  {(() => {
                    const sk = cond.slopeSkip ?? 0
                    const n  = cond.slopeLen ?? 5
                    const f  = FIELD_MAP[cond.lhsField]?.short
                    const nowRef  = sk > 0 ? `[-${sk}]` : '[0]'
                    const pastRef = `[-${sk + n}]`
                    return <>
                      <b>Slope</b> = ({f}{nowRef} / {f}{pastRef} − 1) × 100
                      {sk > 0 && <span style={{ color: 'var(--text3)' }}> &nbsp;·&nbsp; skipping {sk} recent candle{sk > 1 ? 's' : ''}</span>}<br/>
                      → <b>{f}{nowRef} vs {f}{pastRef} over {n} candles</b><br/>
                      <span style={{ opacity: .7 }}>
                        Bullish slope: op <b>&gt;</b> threshold <b>0</b> or <b>0.3</b> &nbsp;·&nbsp;
                        Bearish slope: op <b>&lt;</b> threshold <b>0</b> or <b>-0.3</b>
                      </span>
                    </>
                  })()}
                </div>
              </div>
            )}
          </div>

          {/* Live formula */}
          <div style={{
            fontSize: 10, fontFamily: 'var(--mono)', color: color,
            padding: '5px 9px', borderRadius: 6,
            background: `${color}10`, border: `1px solid ${color}30`,
          }}>
            → {formula}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Icon Picker ───────────────────────────────────────────────────────────────
function IconPicker({ value, onChange, color }) {
  const [open, setOpen]   = useState(false)
  const [cat, setCat]     = useState(0)
  const [prevVal, setPrev] = useState(value)

  function pick(ic) {
    setPrev(value)
    onChange(ic)
    setOpen(false)
  }

  return (
    <div style={{ position: 'relative' }}>
      {/* Trigger button — current icon */}
      <button
        className={`pb-icon-btn${value !== prevVal ? ' pb-icon-sel' : ''}`}
        onClick={() => setOpen(o => !o)}
        style={{
          width: 54, height: 54, borderRadius: 14, fontSize: 26,
          border: `2px solid ${open ? color : color + '60'}`,
          background: open ? `${color}22` : `${color}0e`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: open ? `0 0 18px ${color}55` : `0 0 8px ${color}22`,
          position: 'relative', overflow: 'visible',
        }}
      >
        <span style={{ lineHeight: 1 }}>{value}</span>
        {/* small edit badge */}
        <span style={{
          position: 'absolute', bottom: -4, right: -4,
          width: 16, height: 16, borderRadius: '50%',
          background: color, fontSize: 8, display: 'flex',
          alignItems: 'center', justifyContent: 'center', color: '#000', fontWeight: 900,
        }}>✎</span>
      </button>

      {/* Dropdown picker */}
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 200 }} />
          <div style={{
            position: 'absolute', top: 62, left: 0, zIndex: 201,
            width: 300, borderRadius: 16,
            background: 'var(--bg1)',
            border: `1.5px solid ${color}55`,
            boxShadow: `0 16px 48px rgba(0,0,0,0.7), 0 0 0 1px ${color}22`,
            overflow: 'hidden',
            animation: 'pb-pop .25s cubic-bezier(.34,1.56,.64,1)',
          }}>
            {/* Category tabs */}
            <div style={{
              display: 'flex', overflowX: 'auto', gap: 2, padding: '8px 8px 0',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              scrollbarWidth: 'none',
            }}>
              {ICON_CATEGORIES.map((c, i) => (
                <button key={i} onClick={() => setCat(i)} style={{
                  flexShrink: 0, padding: '5px 9px', borderRadius: '8px 8px 0 0',
                  fontSize: 10, fontFamily: 'var(--mono)', fontWeight: cat === i ? 800 : 500,
                  border: 'none', cursor: 'pointer',
                  background: cat === i ? `${color}28` : 'transparent',
                  color: cat === i ? color : 'var(--text3)',
                  borderBottom: cat === i ? `2px solid ${color}` : '2px solid transparent',
                  transition: 'all .15s',
                }}>{c.label}</button>
              ))}
            </div>

            {/* Icon grid */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)',
              gap: 6, padding: 12,
            }}>
              {ICON_CATEGORIES[cat].icons.map(ic => {
                const sel = value === ic
                return (
                  <button
                    key={ic}
                    className={`pb-icon-btn${sel ? ' pb-icon-sel' : ''}`}
                    onClick={() => pick(ic)}
                    style={{
                      width: '100%', aspectRatio: '1', borderRadius: 10, fontSize: 22,
                      border: `1.5px solid ${sel ? color : 'rgba(255,255,255,0.07)'}`,
                      background: sel ? `${color}30` : 'rgba(255,255,255,0.03)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: sel ? `0 0 12px ${color}60, inset 0 0 8px ${color}18` : 'none',
                    }}
                  >{ic}</button>
                )
              })}
            </div>

            {/* Footer hint */}
            <div style={{
              padding: '6px 12px 10px',
              fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)',
              borderTop: '1px solid rgba(255,255,255,0.05)', textAlign: 'center',
            }}>
              Tap an icon to select · current: {value}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Pattern editor ────────────────────────────────────────────────────────────
function PatternEditor({ pattern, onChange, onDelete, onMirrorPattern, onCopyPattern, defaultOpen, allPatternNames, onOpenChange, outerStyle }) {
  const [open, setOpenRaw] = useState(!!defaultOpen)
  function setOpen(v) {
    const next = typeof v === 'function' ? v(open) : v
    setOpenRaw(next)
    onOpenChange?.(next)
  }
  const [openCondIds, setOpenCondIds] = useState(new Set())
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [lockPopup, setLockPopup] = useState(false)
  const [mirrorPopup, setMirrorPopup] = useState(false)
  const [mirrorName, setMirrorName] = useState('')
  const [mirrorNameAlert, setMirrorNameAlert] = useState('')
  const mirrorInputRef = React.useRef(null)
  const [copyPopup, setCopyPopup] = useState(false)
  const [copyName, setCopyName] = useState('')
  const [copyNameAlert, setCopyNameAlert] = useState('')
  const copyInputRef = React.useRef(null)
  const mirroredDefaultName = pattern.side === 'bull'
    ? pattern.name.replace(/bull/gi, 'Bear').replace(/buy/gi, 'Sell').replace(/long/gi, 'Short') || `${pattern.name} Mirror`
    : pattern.name.replace(/bear/gi, 'Bull').replace(/sell/gi, 'Buy').replace(/short/gi, 'Long') || `${pattern.name} Mirror`
  const color = pattern.side === 'bull' ? G : R
  const nameRef = React.useRef(null)

  React.useEffect(() => {
    if (defaultOpen && nameRef.current) {
      const t = setTimeout(() => {
        nameRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        nameRef.current?.focus()
        nameRef.current?.select()
      }, 120)
      return () => clearTimeout(t)
    }
  }, [])

  React.useEffect(() => {
    if (mirrorPopup) {
      setMirrorName(mirroredDefaultName)
      setTimeout(() => { mirrorInputRef.current?.focus(); mirrorInputRef.current?.select() }, 60)
    }
  }, [mirrorPopup])

  React.useEffect(() => {
    if (copyPopup) {
      setCopyName(`${pattern.name} Copy`)
      setCopyNameAlert('')
      setTimeout(() => { copyInputRef.current?.focus(); copyInputRef.current?.select() }, 60)
    }
  }, [copyPopup])

  function handleCopySave() {
    const name = copyName.trim()
    if (!name) { setCopyNameAlert('Please enter a name.'); return }
    if ((allPatternNames || []).some(n => n.toLowerCase() === name.toLowerCase())) {
      setCopyNameAlert('This name is already taken. Choose a different name.')
      return
    }
    onCopyPattern(name)
    setCopyPopup(false)
  }

  function handleMirrorSave() {
    const name = mirrorName.trim()
    if (!name) {
      setMirrorNameAlert('Please enter a name.')
      return
    }
    // Popup only appears when original mirrored name conflicts — still block if new name also conflicts
    if ((allPatternNames || []).some(n => n.toLowerCase() === name.toLowerCase())) {
      setMirrorNameAlert('This name is already taken. Please choose a different name.')
      return
    }
    onMirrorPattern(name)
    setMirrorPopup(false)
  }

  const mirroredSide = pattern.side === 'bull' ? 'bear' : 'bull'

  function s(k, v) { onChange({ ...pattern, [k]: v }) }
  function setCond(i, c) { const cs = [...pattern.conditions]; cs[i] = c; s('conditions', cs) }
  function delCond(i)    { s('conditions', pattern.conditions.filter((_,j) => j !== i)) }
  function copyCond(i)   {
    const cs = [...pattern.conditions]
    const newCond = { ...cs[i], id: uid() }
    cs.splice(i + 1, 0, newCond)
    s('conditions', cs)
    setOpenCondIds(prev => new Set([...prev, newCond.id]))
  }
  function moveCond(from, to) {
    const cs = [...pattern.conditions]
    const [item] = cs.splice(from, 1); cs.splice(to, 0, item)
    s('conditions', cs)
  }
  function setJoin(i, v) { setCond(i, { ...pattern.conditions[i], joinNext: v }) }
  function toggleTf(tf)  { s('tfs', pattern.tfs.includes(tf) ? pattern.tfs.filter(t => t !== tf) : [...pattern.tfs, tf]) }

  const active = pattern.conditions.filter(c => c.enabled).length

  return (
    <div style={{ position: 'relative', borderRadius: 13, overflow: 'hidden', ...outerStyle }}>

      {/* ── Mirror rename popup ── */}
      {mirrorPopup && (
        <>
          {/* Backdrop */}
          <div onClick={() => setMirrorPopup(false)} style={{
            position: 'fixed', inset: 0, zIndex: 99, background: 'rgba(0,0,0,0.45)',
          }} />
          {/* Card */}
          <div style={{
            position: 'absolute', top: 6, left: 0, right: 0, zIndex: 100,
            borderRadius: 13, padding: '18px 16px',
            background: 'var(--bg1)',
            border: `1.5px solid ${BLU}70`,
            boxShadow: `0 10px 40px rgba(0,0,0,0.65), 0 0 0 1px ${BLU}18`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 18 }}>⇄</span>
              <div style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 14, color: BLU }}>
                Mirror Pattern
              </div>
            </div>
            <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', marginBottom: 14, lineHeight: 1.6 }}>
              The name <b style={{color:'var(--red)'}}>already exists</b>. Choose a different name for the new {mirroredSide === 'bull' ? '🟢 Bull' : '🔴 Bear'} mirror pattern.
            </div>
            <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', fontWeight: 700,
              letterSpacing: '.07em', marginBottom: 6 }}>NAME</div>
            <input
              ref={mirrorInputRef}
              value={mirrorName}
              onChange={e => { setMirrorName(e.target.value); setMirrorNameAlert('') }}
              onKeyDown={e => { if (e.key === 'Enter') handleMirrorSave(); if (e.key === 'Escape') setMirrorPopup(false) }}
              placeholder="Enter a new name…"
              style={{
                width: '100%', boxSizing: 'border-box',
                background: 'var(--bg3)',
                border: `1.5px solid ${mirrorNameAlert ? 'var(--red)' : BLU + '80'}`,
                color: 'var(--text)', borderRadius: 8, padding: '10px 12px',
                fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
                boxShadow: mirrorNameAlert ? '0 0 0 3px rgba(255,60,60,0.18)' : `0 0 0 3px ${BLU}18`,
                outline: 'none', marginBottom: mirrorNameAlert ? 6 : 13,
                transition: 'border .2s, box-shadow .2s',
              }}
            />
            {mirrorNameAlert && (
              <div style={{
                fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--red)',
                marginBottom: 10, padding: '5px 8px', borderRadius: 6,
                background: 'rgba(255,60,60,0.08)', border: '1px solid rgba(255,60,60,0.25)',
              }}>
                ⚠ {mirrorNameAlert}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleMirrorSave} style={{
                flex: 1, padding: '10px', borderRadius: 8, cursor: 'pointer',
                fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 12,
                border: `1.5px solid ${BLU}70`, background: `${BLU}25`, color: BLU,
              }}>✓ Save &amp; Add Pattern</button>
              <button onClick={() => setMirrorPopup(false)} style={{
                padding: '10px 15px', borderRadius: 8, cursor: 'pointer',
                fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 12,
                border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text3)',
              }}>Cancel</button>
            </div>
          </div>
        </>
      )}

      {/* ── Copy rename popup ── */}
      {copyPopup && (
        <>
          <div onClick={() => setCopyPopup(false)} style={{
            position: 'fixed', inset: 0, zIndex: 99, background: 'rgba(0,0,0,0.45)',
          }} />
          <div style={{
            position: 'absolute', top: 6, left: 0, right: 0, zIndex: 100,
            borderRadius: 13, padding: '18px 16px',
            background: 'var(--bg1)',
            border: '1.5px solid rgba(255,200,0,0.5)',
            boxShadow: '0 10px 40px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,200,0,0.1)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 18 }}>⧉</span>
              <div style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 14, color: 'rgb(255,200,0)' }}>
                Copy Pattern
              </div>
            </div>
            <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', marginBottom: 14, lineHeight: 1.6 }}>
              Creates an exact copy of <b style={{ color: color }}>{pattern.name}</b> — same side, same conditions. Give it a new name.
            </div>
            <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', fontWeight: 700,
              letterSpacing: '.07em', marginBottom: 6 }}>NAME</div>
            <input
              ref={copyInputRef}
              value={copyName}
              onChange={e => { setCopyName(e.target.value); setCopyNameAlert('') }}
              onKeyDown={e => { if (e.key === 'Enter') handleCopySave(); if (e.key === 'Escape') setCopyPopup(false) }}
              placeholder="Enter a name for the copy…"
              style={{
                width: '100%', boxSizing: 'border-box',
                background: 'var(--bg3)',
                border: `1.5px solid ${copyNameAlert ? 'var(--red)' : 'rgba(255,200,0,0.5)'}`,
                color: 'var(--text)', borderRadius: 8, padding: '10px 12px',
                fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
                boxShadow: copyNameAlert ? '0 0 0 3px rgba(255,60,60,0.18)' : '0 0 0 3px rgba(255,200,0,0.1)',
                outline: 'none', marginBottom: copyNameAlert ? 6 : 13,
                transition: 'border .2s, box-shadow .2s',
              }}
            />
            {copyNameAlert && (
              <div style={{
                fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--red)',
                marginBottom: 10, padding: '5px 8px', borderRadius: 6,
                background: 'rgba(255,60,60,0.08)', border: '1px solid rgba(255,60,60,0.25)',
              }}>
                ⚠ {copyNameAlert}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleCopySave} style={{
                flex: 1, padding: '10px', borderRadius: 8, cursor: 'pointer',
                fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 12,
                border: '1.5px solid rgba(255,200,0,0.5)', background: 'rgba(255,200,0,0.12)', color: 'rgb(255,200,0)',
              }}>⧉ Save Copy</button>
              <button onClick={() => setCopyPopup(false)} style={{
                padding: '10px 15px', borderRadius: 8, cursor: 'pointer',
                fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 12,
                border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text3)',
              }}>Cancel</button>
            </div>
          </div>
        </>
      )}

      {/* ── Unlock warning popup ── */}
      {lockPopup && (
        <>
          <div onClick={() => setLockPopup(false)} style={{
            position: 'fixed', inset: 0, zIndex: 99, background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(3px)',
          }} />
          <div style={{
            position: 'absolute', top: 6, left: 0, right: 0, zIndex: 100,
            borderRadius: 13, padding: '20px 16px',
            background: 'var(--bg1)',
            border: '1.5px solid rgba(255,200,0,0.6)',
            boxShadow: '0 10px 40px rgba(0,0,0,0.65), 0 0 18px rgba(255,200,0,0.15)',
          }}>
            <div style={{ textAlign: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🔒</div>
              <div style={{ fontWeight: 900, fontSize: 14, color: 'rgb(255,200,0)' }}>Pattern Locked</div>
              <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', marginTop: 6, lineHeight: 1.7 }}>
                <b style={{ color: color }}>{pattern.name}</b> is locked to prevent accidental changes.<br/>
                Unlocking will allow editing all conditions and settings.
              </div>
            </div>
            <div style={{ height: 1, background: 'rgba(255,200,0,0.15)', marginBottom: 14 }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => { s('locked', false); setLockPopup(false); setOpen(true) }}
                style={{
                  flex: 1, padding: '11px', borderRadius: 9, cursor: 'pointer',
                  fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 12,
                  border: '1.5px solid rgba(255,200,0,0.6)',
                  background: 'rgba(255,200,0,0.14)', color: 'rgb(255,200,0)',
                }}
              >🔓 Unlock & Edit</button>
              <button
                onClick={() => setLockPopup(false)}
                style={{
                  padding: '11px 15px', borderRadius: 9, cursor: 'pointer',
                  fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 12,
                  border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text3)',
                }}
              >Cancel</button>
            </div>
          </div>
        </>
      )}

    <div style={{
      borderRadius: 0,
      border: 'none',
      background: pattern.locked ? 'rgba(255,200,0,0.04)' : pattern.enabled ? (pattern.side==='bull'?'rgba(0,230,118,0.06)':'rgba(255,60,80,0.06)') : 'var(--bg1)',
      boxShadow: 'none',
      opacity: mirrorPopup || copyPopup || lockPopup ? 0.3 : 1,
      transition: 'opacity .15s',
      pointerEvents: mirrorPopup || copyPopup || lockPopup ? 'none' : 'auto',
    }}>
      {/* Header — icon + name + subtitle + lock + toggle only */}
      <div
        onClick={() => pattern.locked ? setLockPopup(true) : setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 9, padding: '12px 13px', cursor: 'pointer',
          background: pattern.side === 'bull'
            ? pattern.enabled ? 'rgba(0,230,118,0.08)' : 'rgba(0,230,118,0.03)'
            : pattern.enabled ? 'rgba(255,60,80,0.08)' : 'rgba(255,60,80,0.03)',
        }}
      >
        <span style={{ fontSize: 22, flexShrink: 0 }}>{pattern.icon}</span>

        {/* Name + subtitle — takes all available space */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontWeight: 800, fontSize: 15, color: pattern.enabled ? color : color + '88',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{pattern.name}</div>
          <div style={{
            fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', marginTop: 3,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {pattern.side.toUpperCase()} · {active} cond{active !== 1 ? 's' : ''} · {pattern.tfs.join(' ') || 'no TF'}
          </div>
        </div>

        {/* Right side: lock + toggle + chevron */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          {/* Lock */}
          <button
            onClick={() => pattern.locked ? setLockPopup(true) : s('locked', true)}
            title={pattern.locked ? 'Locked — tap to unlock' : 'Lock pattern'}
            style={{
              width: 28, height: 28, borderRadius: 7,
              border: `1px solid ${pattern.locked ? 'rgba(255,200,0,0.6)' : 'rgba(180,180,180,0.25)'}`,
              background: pattern.locked ? 'rgba(255,200,0,0.15)' : 'transparent',
              color: pattern.locked ? 'rgb(255,200,0)' : 'var(--text3)',
              cursor: 'pointer', fontSize: 14,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: pattern.locked ? '0 0 8px rgba(255,200,0,0.35)' : 'none',
              transition: 'all .2s',
            }}
          >{pattern.locked ? '🔒' : '🔓'}</button>

          {/* Enable toggle */}
          <div onClick={() => !pattern.locked && s('enabled', !pattern.enabled)} style={{
            width: 36, height: 20, borderRadius: 10,
            cursor: pattern.locked ? 'not-allowed' : 'pointer',
            background: pattern.enabled ? color : 'var(--bg3)',
            border: `1.5px solid ${pattern.enabled ? color : 'var(--border)'}`,
            position: 'relative', transition: 'all .2s',
            opacity: pattern.locked ? 0.4 : 1,
          }}>
            <div style={{
              position: 'absolute', top: 3, left: pattern.enabled ? 17 : 3,
              width: 12, height: 12, borderRadius: '50%', background: '#fff', transition: 'left .2s',
            }} />
          </div>
        </div>

        <span style={{ color: pattern.locked ? 'rgba(255,200,0,0.6)' : 'var(--text3)', fontSize: 12, flexShrink: 0 }}>
          {pattern.locked ? '' : open ? '▲' : '▼'}
        </span>
      </div>

      {/* Action bar — mirror / copy / delete — shown below header, same row as locked hint */}
      {!pattern.locked && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '6px 13px 8px',
          borderTop: `1px solid ${color}22`,
          background: 'rgba(0,0,0,0.12)',
        }} onClick={e => e.stopPropagation()}>
          {/* Mirror */}
          <button onClick={() => {
            const names = (allPatternNames || []).map(n => n.toLowerCase())
            if (!names.includes(mirroredDefaultName.toLowerCase())) {
              onMirrorPattern(mirroredDefaultName)
            } else {
              setMirrorPopup(true)
            }
          }} title="Mirror pattern (Bull↔Bear + flip operators)" style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '4px 10px', borderRadius: 7, cursor: 'pointer',
            border: '1px solid rgba(100,180,255,0.35)', background: 'rgba(100,180,255,0.08)',
            color: BLU, fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 700,
          }}>⇄ Mirror</button>

          {/* Copy */}
          <button onClick={() => setCopyPopup(true)} title="Copy pattern" style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '4px 10px', borderRadius: 7, cursor: 'pointer',
            border: '1px solid rgba(255,200,0,0.35)', background: 'rgba(255,200,0,0.08)',
            color: 'rgb(255,200,0)', fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 700,
          }}>⧉ Copy</button>

          {/* Delete */}
          <div style={{ marginLeft: 'auto' }}>
            {confirmDelete ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--red)', whiteSpace: 'nowrap' }}>Delete?</span>
                <button onClick={onDelete} style={{
                  padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
                  fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 800,
                  border: '1px solid rgba(255,60,60,0.5)', background: 'rgba(255,60,60,0.18)',
                  color: 'var(--red)',
                }}>Yes</button>
                <button onClick={() => setConfirmDelete(false)} style={{
                  padding: '4px 8px', borderRadius: 6, cursor: 'pointer',
                  fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 800,
                  border: '1px solid var(--border)', background: 'var(--bg3)',
                  color: 'var(--text2)',
                }}>No</button>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)} style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '4px 10px', borderRadius: 7, cursor: 'pointer',
                border: '1px solid rgba(255,60,60,0.3)', background: 'rgba(255,60,60,0.07)',
                color: 'var(--red)', fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 700,
              }}>🗑 Delete</button>
            )}
          </div>
        </div>
      )}

      {/* Body */}
      {/* Locked banner */}
      {pattern.locked && (
        <div
          onClick={() => setLockPopup(true)}
          style={{
            borderTop: '1px solid rgba(255,200,0,0.2)',
            padding: '8px 14px',
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'rgba(255,200,0,0.05)',
            cursor: 'pointer',
          }}
        >
          <span style={{ fontSize: 12 }}>🔒</span>
          <span style={{ fontSize: 9, fontFamily: 'var(--mono)', fontWeight: 700, color: 'rgba(255,200,0,0.7)', letterSpacing: '.06em' }}>
            LOCKED · tap to unlock and edit
          </span>
        </div>
      )}

      {open && !pattern.locked && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '13px', display: 'flex', flexDirection: 'column', gap: 13 }}>

          {/* Name + icon */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <Lbl>ICON</Lbl>
              <IconPicker value={pattern.icon} onChange={v => s('icon', v)} color={color} />
            </div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <Lbl>NAME</Lbl>
              <input ref={nameRef} value={pattern.name} onChange={e => s('name', e.target.value)} style={{
                width: '100%', boxSizing: 'border-box',
                background: 'var(--bg3)', border: `1.5px solid ${defaultOpen ? BLU + 'cc' : 'var(--border2)'}`,
                color: 'var(--text)', borderRadius: 8, padding: '8px 10px',
                fontSize: 13, fontWeight: 700,
                boxShadow: defaultOpen ? `0 0 0 2px ${BLU}33` : 'none',
                transition: 'border .3s, box-shadow .3s',
              }} />
            </div>
          </div>

          {/* Side + TF */}
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            <div>
              <Lbl>DIRECTION</Lbl>
              <div style={{ display: 'flex', gap: 5 }}>
                {['bull','bear'].map(sd => (
                  <Pill key={sd} active={pattern.side === sd} color={sd === 'bull' ? G : R}
                    onClick={() => s('side', sd)}>{sd === 'bull' ? '🟢 Bull' : '🔴 Bear'}</Pill>
                ))}
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <Lbl>SCAN ON TIMEFRAMES</Lbl>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {TF_LIST.map(tf => (
                  <Pill key={tf} active={pattern.tfs.includes(tf)} color={color}
                    onClick={() => toggleTf(tf)} sm>{tf}</Pill>
                ))}
              </div>
              {pattern.tfs.length === 0 && (
                <div style={{ fontSize: 9, color: 'var(--red)', fontFamily: 'var(--mono)', marginTop: 4 }}>⚠ No TF — won't scan</div>
              )}
            </div>
          </div>

          {/* Conditions */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Lbl>CONDITIONS</Lbl>
              <span style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>
                {active} active · all must pass (per AND/OR)
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {pattern.conditions.map((cond, idx) => {
                const gid = cond.groupId
                const gCol = gid ? groupColor(gid) : null
                const conditions = pattern.conditions
                const isGroupStart = gid && (idx === 0 || conditions[idx - 1].groupId !== gid)
                const isGroupEnd   = gid && (idx === conditions.length - 1 || conditions[idx + 1].groupId !== gid)

                return (
                  <React.Fragment key={cond.id}>
                    {/* Group open bracket */}
                    {isGroupStart && (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        paddingLeft: 4, marginBottom: -2,
                      }}>
                        <div style={{
                          width: 10, height: 10, borderRadius: '2px 0 0 0',
                          borderTop: `2px solid ${gCol}`, borderLeft: `2px solid ${gCol}`,
                        }} />
                        <span style={{
                          fontSize: 8, fontFamily: 'var(--mono)', fontWeight: 900,
                          color: gCol, letterSpacing: '.1em', opacity: .8,
                        }}>GROUP</span>
                      </div>
                    )}

                    {/* Condition card — indented when inside a group */}
                    <div style={{ paddingLeft: gid ? 10 : 0, borderLeft: gid ? `2px solid ${gCol}44` : 'none', borderRadius: 2, transition: 'all .15s' }}>
                      <CondCard
                        cond={cond} idx={idx} total={pattern.conditions.length} color={condColor(idx)}
                        onChange={c => setCond(idx, c)}
                        onRemove={() => { delCond(idx); setOpenCondIds(prev => { const s = new Set(prev); s.delete(cond.id); return s }) }}
                        onCopy={() => copyCond(idx)}
                        onMoveUp={() => moveCond(idx, idx - 1)}
                        onMoveDown={() => moveCond(idx, idx + 1)}
                        open={openCondIds.has(cond.id)}
                        onToggleOpen={() => setOpenCondIds(prev => {
                          const s = new Set(prev)
                          s.has(cond.id) ? s.delete(cond.id) : s.add(cond.id)
                          return s
                        })}
                      />
                    </div>

                    {/* Group close bracket */}
                    {isGroupEnd && (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        paddingLeft: 4, marginTop: -2,
                      }}>
                        <div style={{
                          width: 10, height: 10, borderRadius: '0 0 0 2px',
                          borderBottom: `2px solid ${gCol}`, borderLeft: `2px solid ${gCol}`,
                        }} />
                        <span style={{
                          fontSize: 8, fontFamily: 'var(--mono)', fontWeight: 900,
                          color: gCol, letterSpacing: '.1em', opacity: .8,
                        }}>END GROUP</span>
                      </div>
                    )}

                    {idx < pattern.conditions.length - 1 && (() => {
                      const nextCond = pattern.conditions[idx + 1]
                      const bothSameGroup = gid && nextCond.groupId === gid
                      // Are these two adjacent conditions already in the same group?
                      const isGrouped = bothSameGroup
                      return (
                        <JoinBadge
                          value={cond.joinNext || 'AND'}
                          onChange={v => setJoin(idx, v)}
                          grouped={isGrouped}
                          groupColor={isGrouped ? gCol : '#888'}
                          onGroupToggle={() => {
                            const conds = [...pattern.conditions]
                            const cur  = { ...conds[idx] }
                            const next = { ...conds[idx + 1] }
                            if (isGrouped) {
                              // Remove next from group; if only one left in group, ungroup it too
                              const membersAfter = conds.filter((c, i) => i !== idx + 1 && c.groupId === gid)
                              if (membersAfter.length <= 1) {
                                // Dissolve whole group
                                conds.forEach((c, i) => { if (c.groupId === gid) conds[i] = { ...c, groupId: null } })
                              } else {
                                next.groupId = null
                                conds[idx + 1] = next
                              }
                            } else {
                              // Group these two together
                              const existingGid = cur.groupId || next.groupId || `grp_${uid()}`
                              cur.groupId  = existingGid
                              next.groupId = existingGid
                              conds[idx]     = cur
                              conds[idx + 1] = next
                            }
                            s('conditions', conds)
                          }}
                        />
                      )
                    })()}
                  </React.Fragment>
                )
              })}
            </div>

            <button
              onClick={() => {
                const nc = blankCond()
                s('conditions', [...pattern.conditions, nc])
                setOpenCondIds(prev => new Set([...prev, nc.id]))
              }}
              style={{
                marginTop: 8, width: '100%', padding: '9px',
                borderRadius: 8, cursor: 'pointer', fontSize: 12,
                fontFamily: 'var(--mono)', fontWeight: 700,
                border: `1.5px dashed ${color}55`,
                background: `${color}08`, color,
              }}
            >+ Add Condition</button>
          </div>
        </div>
      )}
    </div>
    </div>
  )
}

// ── Hints accordion ───────────────────────────────────────────────────────────
function HintsAccordion() {
  const [open, setOpen] = React.useState(false)
  return (
    <div style={{
      marginBottom: 12, borderRadius: 9,
      border: `1px solid ${open ? 'rgba(179,136,255,0.38)' : 'rgba(179,136,255,0.18)'}`,
      background: open ? 'rgba(179,136,255,0.07)' : 'rgba(179,136,255,0.03)',
      overflow: 'hidden', transition: 'border-color .18s, background .18s',
    }}>
      {/* Toggle row */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer',
        }}
      >
        <span style={{ fontSize: 13 }}>💡</span>
        <span style={{ flex: 1, fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 10,
          letterSpacing: '.07em', color: A, textAlign: 'left' }}>QUICK REFERENCE</span>
        <span style={{ fontSize: 10, color: A, opacity: .7, transition: 'transform .18s',
          display: 'inline-block', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
      </button>
      {/* Content */}
      {open && (
        <div style={{
          padding: '2px 12px 11px', borderTop: '1px solid rgba(179,136,255,0.15)',
          fontSize: 10, fontFamily: 'var(--mono)', color: A, lineHeight: 1.85,
        }}>
          <b>× Mult</b>: EMA20[0] &gt; EMA20[-2] × 1.5 &nbsp;·&nbsp;
          <b>± %</b>: EMA20[0] &gt; EMA20[-2] + 0.35% &nbsp;·&nbsp;
          <b>% Diff</b>: how many % LHS is above/below RHS<br/>
          <b>Slope %</b>: how much field rose over N candles &nbsp;·&nbsp; bullish = op &gt; 0 &nbsp;·&nbsp; bearish = op &lt; 0<br/>
          <b>Change%</b>: candle-to-candle % &nbsp;·&nbsp; <b>24h%</b>: Binance 24h change<br/>
          <b>DMI/ADX</b>: +DI &gt; -DI = bullish &nbsp;·&nbsp; ADX &gt; 25 = strong trend<br/>
          Tap <b style={{color: BLU}}>AND</b>/<b style={{color:AMB}}>OR</b> badge between conditions to switch logic · <b>⧉</b> copies a condition
        </div>
      )}
    </div>
  )
}

// ── Main tab ──────────────────────────────────────────────────────────────────
export default function PatternBuilderTab({ settings, update }) {
  const patterns = useMemo(() => settings.customPatterns || [], [settings.customPatterns])
  const trash    = useMemo(() => settings.deletedPatterns || [], [settings.deletedPatterns])
  const [newId, setNewId] = useState(null)
  const [openPatternId, setOpenPatternId] = useState(null)
  const [trashOpen, setTrashOpen] = useState(false)
  const [confirmPurgeId, setConfirmPurgeId] = useState(null)
  const [confirmPurgeAll, setConfirmPurgeAll] = useState(false)
  const [purgeAllChecked, setPurgeAllChecked] = useState(false)

  // Keep a ref to patterns so debounced save always uses the latest version
  const patternsRef = useRef(patterns)
  patternsRef.current = patterns

  // Debounce timer for text-field edits (name, condition values)
  // Single atomic save for patterns + trash together — one Firebase write
  function saveBoth(ps, ts) {
    const now = Date.now()
    update({
      customPatterns:    ps,
      deletedPatterns:   ts,
      _customPatternsAt:  now,
      _deletedPatternsAt: now,
    })
  }

  // Immediate save — used for structural changes (add, delete, toggle, mirror, restore)
  function savePatterns(ps) {
    const now = Date.now()
    update({ customPatterns: ps, _customPatternsAt: now })
  }

  function saveTrash(ts) {
    const now = Date.now()
    update({ deletedPatterns: ts, _deletedPatternsAt: now })
  }

  function add() { const p = blankPattern(); setNewId(p.id); setOpenPatternId(p.id); savePatterns([...patterns, p]) }

  // upd() is called on every keystroke (name input, condition values).
  // Each call saves the full updated pattern list to state + Firebase immediately.
  // Firebase writes are fast and idempotent — last write wins, no data corruption.
  function upd(i, p) {
    const ps = [...patternsRef.current]
    ps[i] = p
    savePatterns(ps)
  }

  function del(i) {
    // Atomic: remove from patterns AND add to trash in one update() call
    const removed  = { ...patterns[i], deletedAt: Date.now() }
    const newTrash = [removed, ...trash].slice(0, 50)
    const newPats  = patterns.filter((_, j) => j !== i)
    saveBoth(newPats, newTrash)
  }

  function restore(i) {
    // If name already exists in active patterns, generate a unique name
    let p = { ...trash[i], deletedAt: undefined }
    const existingNames = patterns.map(x => x.name.toLowerCase())
    if (existingNames.includes(p.name.toLowerCase())) {
      // Find a free name: "Name (2)", "Name (3)", etc.
      let n = 2
      while (existingNames.includes(`${p.name} (${n})`.toLowerCase())) n++
      p = { ...p, name: `${p.name} (${n})` }
    }
    const newPats = [...patterns, p]
    const newTrsh = trash.filter((_, j) => j !== i)
    // Restore immediately — no rename prompt, just save
    saveBoth(newPats, newTrsh)
  }

  function purgeOne(i) {
    saveTrash(trash.filter((_, j) => j !== i))
  }

  function purgeAll() {
    saveTrash([])
  }

  function mirrorPattern(i, customName) {
    const src = patterns[i]
    const mirrored = {
      ...src,
      id: `custom_${uid()}`,
      name: customName,
      side: src.side === 'bull' ? 'bear' : 'bull',
      conditions: src.conditions.map(c => mirrorCond(c)),
      createdAt: Date.now(),
    }
    const ps = [...patterns]
    ps.splice(i + 1, 0, mirrored)
    setNewId(null)
    savePatterns(ps)
  }

  function copyPattern(i, customName) {
    const src = patterns[i]
    const copy = {
      ...src,
      id: `custom_${uid()}`,
      name: customName,
      conditions: src.conditions.map(c => ({ ...c, id: uid() })),
      createdAt: Date.now(),
    }
    const ps = [...patterns]
    ps.splice(i + 1, 0, copy)
    setNewId(null)
    savePatterns(ps)
  }

  const bull = patterns.filter(p => p.side === 'bull' && p.enabled).length
  const bear = patterns.filter(p => p.side === 'bear' && p.enabled).length
  const [importError, setImportError] = useState('')
  const [importSuccess, setImportSuccess] = useState('')
  const [importPopup, setImportPopup] = useState(false)
  const importInputRef = React.useRef(null)

  // ── Selection state for bulk export ──────────────────────────────────────
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds]     = useState(new Set())
  const [exportPopup, setExportPopup]     = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)   // bulk-delete confirm

  function toggleSelect(id) {
    setDeleteConfirm(false)
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function selectAll()  { setDeleteConfirm(false); setSelectedIds(new Set(patterns.map(p => p.id))) }
  function selectNone() { setDeleteConfirm(false); setSelectedIds(new Set()) }
  function exitSelectionMode() { setSelectionMode(false); setSelectedIds(new Set()); setDeleteConfirm(false) }

  // Move a pattern up or down in the list
  function movePattern(fromIdx, dir) {
    const toIdx = fromIdx + dir
    if (toIdx < 0 || toIdx >= patterns.length) return
    const next = [...patterns]
    ;[next[fromIdx], next[toIdx]] = [next[toIdx], next[fromIdx]]
    savePatterns(next)
  }

  // Bulk-delete selected patterns (move to trash like normal del)
  function deleteSelected() {
    const now = Date.now()
    const removed  = patterns.filter(p => selectedIds.has(p.id)).map(p => ({ ...p, deletedAt: now }))
    const newTrash = [...removed, ...trash].slice(0, 50)
    const newPats  = patterns.filter(p => !selectedIds.has(p.id))
    saveBoth(newPats, newTrash)
    exitSelectionMode()
  }

  // ── Export helpers ────────────────────────────────────────────────────────
  // Export all patterns as one combined JSON (original behaviour)
  function exportAllCombined(pats) {
    const data = {
      _type: 'signal_engine_patterns',
      _version: 1,
      _exportedAt: new Date().toISOString(),
      _count: pats.length,
      patterns: pats,
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `patterns_backup_${new Date().toISOString().slice(0,10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Export each pattern as its own .json file, named after the pattern
  function exportIndividual(pats) {
    const safeName = str => str.replace(/[^a-z0-9_\-]/gi, '_').replace(/_+/g, '_').slice(0, 60) || 'pattern'
    pats.forEach(p => {
      const data = {
        _type: 'signal_engine_patterns',
        _version: 1,
        _exportedAt: new Date().toISOString(),
        _count: 1,
        patterns: [p],
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `${safeName(p.name || 'pattern')}.json`
      a.click()
      URL.revokeObjectURL(url)
    })
  }

  // The main "Export" button click — if nothing selected, export all combined
  function exportPatterns() {
    if (selectionMode) {
      const chosen = patterns.filter(p => selectedIds.has(p.id))
      if (chosen.length === 0) return
      setExportPopup(true)
    } else {
      exportAllCombined(patterns)
    }
  }

  function handleImportFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportError('')
    setImportSuccess('')
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const json = JSON.parse(ev.target.result)
        // Accept both wrapped format and raw array
        const imported = Array.isArray(json)
          ? json
          : (json._type === 'signal_engine_patterns' && Array.isArray(json.patterns))
            ? json.patterns
            : null
        if (!imported) { setImportError('Invalid file — not a patterns backup.'); return }
        if (imported.length === 0) { setImportError('File has no patterns.'); return }
        // Merge: skip duplicates by name, re-id all to avoid collisions
        const existingNames = new Set(patterns.map(p => p.name.toLowerCase()))
        const toAdd   = []
        const skipped = []
        imported.forEach(p => {
          if (existingNames.has((p.name||'').toLowerCase())) {
            skipped.push(p.name)
          } else {
            toAdd.push({ ...p, id: `custom_${uid()}`, conditions: (p.conditions||[]).map(c => ({...c, id: uid()})) })
          }
        })
        if (toAdd.length === 0) {
          setImportError(`All ${skipped.length} pattern(s) already exist by name — nothing imported.`)
          return
        }
        savePatterns([...patterns, ...toAdd])
        setImportSuccess(`✓ Imported ${toAdd.length} pattern(s)${skipped.length ? ` · ${skipped.length} skipped (duplicate names)` : ''}.`)
        setImportPopup(false)
      } catch {
        setImportError('Could not parse file — make sure it\'s a valid JSON backup.')
      }
    }
    reader.readAsText(file)
    // Reset input so same file can be re-selected
    e.target.value = ''
  }

  return (
    <div style={{ padding: '14px 10px 90px', maxWidth: 620, margin: '0 auto' }}>

      {/* ── Export mode popup ── */}
      {exportPopup && (() => {
        const chosen = patterns.filter(p => selectedIds.has(p.id))
        return (
          <>
            <div onClick={() => setExportPopup(false)} style={{
              position: 'fixed', inset: 0, zIndex: 299, background: 'rgba(0,0,0,0.65)',
              backdropFilter: 'blur(4px)',
            }} />
            <div style={{
              position: 'fixed', left: '50%', top: '50%',
              transform: 'translate(-50%,-50%)',
              zIndex: 300, width: 'min(340px, 93vw)',
              borderRadius: 16, padding: '22px 18px',
              background: 'var(--bg1)',
              border: '1.5px solid rgba(0,230,118,0.35)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
            }}>
              <div style={{ textAlign: 'center', marginBottom: 14 }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📤</div>
                <div style={{ fontWeight: 900, fontSize: 15, color: 'var(--text)' }}>
                  Export {chosen.length} Pattern{chosen.length !== 1 ? 's' : ''}
                </div>
                <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', marginTop: 5, lineHeight: 1.7 }}>
                  Choose how to export the selected patterns.
                </div>
              </div>
              <div style={{ height: 1, background: 'var(--border)', marginBottom: 14 }} />

              {/* Preview list */}
              <div style={{ marginBottom: 14, maxHeight: 140, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {chosen.map(p => (
                  <div key={p.id} style={{
                    display: 'flex', alignItems: 'center', gap: 7,
                    padding: '5px 9px', borderRadius: 7,
                    background: 'var(--bg2)', border: '1px solid var(--border)',
                    fontSize: 11, fontFamily: 'var(--mono)',
                  }}>
                    <span style={{ fontSize: 14 }}>{p.icon}</span>
                    <span style={{ flex: 1, color: p.side === 'bull' ? G : R, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                    <span style={{ color: 'var(--text3)', fontSize: 9 }}>{p.side.toUpperCase()}</span>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button
                  onClick={() => { exportAllCombined(chosen); setExportPopup(false); exitSelectionMode() }}
                  style={{
                    width: '100%', padding: '11px', borderRadius: 10, cursor: 'pointer',
                    fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 12,
                    border: '1.5px solid rgba(0,230,118,0.5)',
                    background: 'rgba(0,230,118,0.1)', color: G,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}
                >
                  📦 Combined JSON <span style={{ fontSize: 9, fontWeight: 400, color: 'var(--text3)' }}>— one file, all patterns</span>
                </button>
                <button
                  onClick={() => { exportIndividual(chosen); setExportPopup(false); exitSelectionMode() }}
                  style={{
                    width: '100%', padding: '11px', borderRadius: 10, cursor: 'pointer',
                    fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 12,
                    border: '1.5px solid rgba(77,171,247,0.5)',
                    background: 'rgba(77,171,247,0.08)', color: BLU,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}
                >
                  📄 Individual Files <span style={{ fontSize: 9, fontWeight: 400, color: 'var(--text3)' }}>— one .json per pattern</span>
                </button>
                <button
                  onClick={() => setExportPopup(false)}
                  style={{
                    width: '100%', padding: '10px', borderRadius: 10, cursor: 'pointer',
                    fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 11,
                    border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text3)',
                  }}
                >Cancel</button>
              </div>
            </div>
          </>
        )
      })()}

      {/* Import popup modal */}
      {importPopup && (
        <>
          <div onClick={() => { setImportPopup(false); setImportError('') }} style={{
            position: 'fixed', inset: 0, zIndex: 299, background: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(4px)',
          }} />
          <div style={{
            position: 'fixed', left: '50%', top: '50%',
            transform: 'translate(-50%,-50%)',
            zIndex: 300, width: 'min(320px, 92vw)',
            borderRadius: 16, padding: '22px 18px',
            background: 'var(--bg1)',
            border: '1.5px solid rgba(100,200,255,0.4)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
          }}>
            <div style={{ textAlign: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📥</div>
              <div style={{ fontWeight: 900, fontSize: 15, color: 'var(--text)' }}>Import Patterns</div>
              <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', marginTop: 5, lineHeight: 1.7 }}>
                Select a <b>.json</b> backup file exported from this app.<br/>
                Duplicate names are skipped automatically.
              </div>
            </div>
            <div style={{ height: 1, background: 'var(--border)', marginBottom: 14 }} />
            {importError && (
              <div style={{
                fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--red)',
                padding: '8px 10px', borderRadius: 8, marginBottom: 12,
                background: 'rgba(255,60,60,0.08)', border: '1px solid rgba(255,60,60,0.3)',
              }}>⚠ {importError}</div>
            )}
            <input
              ref={importInputRef}
              type="file" accept=".json" onChange={handleImportFile}
              style={{ display: 'none' }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                onClick={() => importInputRef.current?.click()}
                style={{
                  width: '100%', padding: '12px', borderRadius: 10, cursor: 'pointer',
                  fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 12,
                  border: '1.5px solid rgba(100,200,255,0.5)',
                  background: 'rgba(100,200,255,0.1)', color: 'var(--text)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >📂 Choose JSON File</button>
              <button
                onClick={() => { setImportPopup(false); setImportError('') }}
                style={{
                  width: '100%', padding: '10px', borderRadius: 10, cursor: 'pointer',
                  fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 11,
                  border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text3)',
                }}
              >Cancel</button>
            </div>
          </div>
        </>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 17 }}>🔧 Pattern Builder</div>
          <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: 2 }}>
            Visual condition editor · live on every scan
          </div>
        </div>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <span style={{ fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700, padding: '3px 9px', borderRadius: 6,
            background: 'rgba(0,230,118,0.1)', color: G, border: '1px solid rgba(0,230,118,0.3)' }}>🟢 {bull}</span>
          <span style={{ fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700, padding: '3px 9px', borderRadius: 6,
            background: 'rgba(255,60,80,0.1)', color: R, border: '1px solid rgba(255,60,80,0.3)' }}>🔴 {bear}</span>
          {/* Select mode toggle */}
          {patterns.length > 0 && (
            <button
              onClick={() => selectionMode ? exitSelectionMode() : setSelectionMode(true)}
              title={selectionMode ? 'Exit selection mode' : 'Select patterns to export / delete'}
              style={{
                padding: '4px 10px', borderRadius: 7, cursor: 'pointer',
                fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700,
                border: `1px solid ${selectionMode ? 'rgba(255,160,0,0.6)' : 'rgba(255,255,255,0.15)'}`,
                background: selectionMode ? 'rgba(255,160,0,0.12)' : 'rgba(255,255,255,0.04)',
                color: selectionMode ? AMB : 'var(--text3)',
                display: 'flex', alignItems: 'center', gap: 4,
              }}
            >{selectionMode ? '✕ Cancel' : '☑ Select'}</button>
          )}
          {/* Export button */}
          <button
            onClick={exportPatterns}
            disabled={patterns.length === 0 || (selectionMode && selectedIds.size === 0)}
            title={selectionMode ? `Export ${selectedIds.size} selected pattern(s)` : 'Export all patterns as JSON backup'}
            style={{
              padding: '4px 10px', borderRadius: 7,
              cursor: (patterns.length === 0 || (selectionMode && selectedIds.size === 0)) ? 'not-allowed' : 'pointer',
              fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700,
              border: '1px solid rgba(0,230,118,0.4)',
              background: (patterns.length === 0 || (selectionMode && selectedIds.size === 0)) ? 'transparent' : 'rgba(0,230,118,0.08)',
              color: (patterns.length === 0 || (selectionMode && selectedIds.size === 0)) ? 'var(--text3)' : G,
              opacity: (patterns.length === 0 || (selectionMode && selectedIds.size === 0)) ? 0.4 : 1,
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >📤 {selectionMode && selectedIds.size > 0 ? `Export (${selectedIds.size})` : 'Export'}</button>
          {/* Import button */}
          <button
            onClick={() => { setImportError(''); setImportSuccess(''); setImportPopup(true) }}
            title="Import patterns from JSON backup"
            style={{
              padding: '4px 10px', borderRadius: 7, cursor: 'pointer',
              fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700,
              border: '1px solid rgba(100,200,255,0.4)',
              background: 'rgba(100,200,255,0.08)', color: 'var(--text2)',
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >📥 Import</button>
        </div>
      </div>

      {/* Selection mode toolbar */}
      {selectionMode && patterns.length > 0 && (
        <div style={{
          marginBottom: 10, borderRadius: 10, overflow: 'hidden',
          border: '1px solid rgba(255,160,0,0.3)',
          background: 'rgba(255,160,0,0.05)',
        }}>
          {/* Top row — count + all/none */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid rgba(255,160,0,0.15)' }}>
            <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: AMB, fontWeight: 800 }}>
              {selectedIds.size === 0 ? '☑ Tap patterns below to select' : `✅ ${selectedIds.size} of ${patterns.length} selected`}
            </span>
            <div style={{ flex: 1 }} />
            <button onClick={selectAll} style={{
              fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700,
              padding: '3px 9px', borderRadius: 6, cursor: 'pointer',
              border: '1px solid rgba(255,160,0,0.35)', background: 'rgba(255,160,0,0.1)', color: AMB,
            }}>All</button>
            <button onClick={selectNone} style={{
              fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700,
              padding: '3px 9px', borderRadius: 6, cursor: 'pointer',
              border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text3)',
            }}>None</button>
          </div>

          {/* Action row — Export + Delete (only when something selected) */}
          {selectedIds.size > 0 && (
            <div style={{ display: 'flex', gap: 8, padding: '8px 12px' }}>
              {/* Export selected */}
              <button onClick={exportPatterns} style={{
                flex: 1, padding: '8px', borderRadius: 8, cursor: 'pointer',
                fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 11,
                border: '1px solid rgba(0,230,118,0.4)', background: 'rgba(0,230,118,0.08)', color: G,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              }}>📤 Export ({selectedIds.size})</button>

              {/* Delete selected — two-step confirm */}
              {!deleteConfirm ? (
                <button onClick={() => setDeleteConfirm(true)} style={{
                  flex: 1, padding: '8px', borderRadius: 8, cursor: 'pointer',
                  fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 11,
                  border: '1px solid rgba(255,60,80,0.4)', background: 'rgba(255,60,80,0.06)', color: R,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                }}>🗑 Delete ({selectedIds.size})</button>
              ) : (
                <div style={{ flex: 1, display: 'flex', gap: 5 }}>
                  <button onClick={deleteSelected} style={{
                    flex: 1, padding: '8px', borderRadius: 8, cursor: 'pointer',
                    fontFamily: 'var(--mono)', fontWeight: 900, fontSize: 11,
                    border: '1px solid rgba(255,60,80,0.7)', background: 'rgba(255,60,80,0.18)', color: R,
                  }}>⚠ Confirm</button>
                  <button onClick={() => setDeleteConfirm(false)} style={{
                    flex: 1, padding: '8px', borderRadius: 8, cursor: 'pointer',
                    fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 11,
                    border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text3)',
                  }}>Cancel</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Import success toast */}
      {importSuccess && (
        <div style={{
          fontSize: 10, fontFamily: 'var(--mono)', color: G,
          padding: '8px 12px', borderRadius: 8, marginBottom: 10,
          background: 'rgba(0,230,118,0.08)', border: '1px solid rgba(0,230,118,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span>{importSuccess}</span>
          <button onClick={() => setImportSuccess('')} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 14 }}>×</button>
        </div>
      )}

      {/* Quick reference — collapsible hints accordion */}
      <HintsAccordion />

      {/* List — "My Patterns" section */}
      {patterns.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--lime)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: .4, marginBottom: 10 }}>
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
          </svg>
          <div style={{ fontSize: 13 }}>No custom patterns yet</div>
          <div style={{ fontSize: 10, marginTop: 5, opacity: .6 }}>Tap New Pattern to build one</div>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ flex: 1, height: 1, background: 'var(--lime-dim)' }} />
            <span style={{ fontSize: 9, fontFamily: 'var(--mono)', fontWeight: 800, letterSpacing: '.1em', color: 'var(--lime)', opacity: .8 }}>
              MY PATTERNS
            </span>
            <div style={{ flex: 1, height: 1, background: 'var(--lime-dim)' }} />
          </div>

          {/* ── Horizontal name strip — tap to jump to pattern ── */}
          {patterns.length > 1 && (
            <div style={{
              display: 'flex', gap: 5, overflowX: 'auto', flexWrap: 'nowrap',
              marginBottom: 10, paddingBottom: 4,
              scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch',
              marginLeft: -10, marginRight: -10, paddingLeft: 10, paddingRight: 10,
            }}>
              {patterns.map(p => {
                const isBull = p.side === 'bull'
                const col = isBull ? 'var(--green)' : 'var(--red)'
                const bd  = isBull ? 'rgba(0,230,118,0.4)' : 'rgba(255,60,80,0.4)'
                const bg  = isBull ? 'rgba(0,230,118,0.08)' : 'rgba(255,60,80,0.08)'
                const isActive = openPatternId === p.id
                return (
                  <button
                    key={p.id}
                    onClick={() => {
                      setOpenPatternId(p.id)
                      // Scroll to pattern card
                      setTimeout(() => {
                        const el = document.getElementById(`pattern-card-${p.id}`)
                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
                      }, 60)
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
                      padding: '5px 10px', borderRadius: 20, cursor: 'pointer',
                      border: `1.5px solid ${isActive ? bd : 'var(--border)'}`,
                      background: isActive ? bg : 'var(--bg2)',
                      color: isActive ? col : 'var(--text3)',
                      fontSize: 11, fontFamily: 'var(--mono)', fontWeight: isActive ? 800 : 400,
                      whiteSpace: 'nowrap', maxWidth: 140, transition: 'all .12s',
                    }}
                  >
                    <span style={{ fontSize: 13 }}>{p.icon || (isBull ? '🟢' : '🔴')}</span>
                    <span style={{
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      maxWidth: 100,
                    }}>{p.name}</span>
                  </button>
                )
              })}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 10 }}>
            {patterns.map((p, i) => {
              const isOpen = openPatternId === p.id
              return (
              <div key={p.id} id={`pattern-card-${p.id}`} style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>

                {/* ── Left gutter — outside the border ── */}
                {!isOpen && (
                <div style={{
                  flexShrink: 0, width: 28,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: 4, paddingRight: 4,
                }}>
                  {selectionMode ? (
                    /* Checkbox */
                    <div
                      onClick={() => toggleSelect(p.id)}
                      style={{
                        width: 22, height: 22, borderRadius: 6,
                        border: `2px solid ${selectedIds.has(p.id) ? AMB : 'rgba(255,255,255,0.2)'}`,
                        background: selectedIds.has(p.id) ? 'rgba(255,160,0,0.22)' : 'rgba(255,255,255,0.04)',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all .15s', flexShrink: 0,
                      }}
                    >
                      {selectedIds.has(p.id) && (
                        <svg width="11" height="11" viewBox="0 0 9 9" fill="none">
                          <polyline points="1.5,4.5 3.5,6.5 7.5,2.5" stroke={AMB} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                  ) : (
                    /* ▲ index ▼ */
                    <>
                      <button
                        onClick={() => movePattern(i, -1)}
                        disabled={i === 0}
                        title="Move up"
                        style={{
                          width: 24, height: 24, borderRadius: 6, padding: 0,
                          border: `1px solid ${i === 0 ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.18)'}`,
                          background: i === 0 ? 'transparent' : 'rgba(255,255,255,0.05)',
                          cursor: i === 0 ? 'default' : 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          opacity: i === 0 ? 0.2 : 1,
                        }}
                      >
                        <span style={{ fontSize: 13, lineHeight: 1, color: 'var(--text2)', fontWeight: 700 }}>↑</span>
                      </button>

                      <span style={{
                        fontSize: 9, fontFamily: 'var(--mono)', fontWeight: 800,
                        color: 'var(--text3)', lineHeight: 1, userSelect: 'none',
                      }}>{i + 1}</span>

                      <button
                        onClick={() => movePattern(i, +1)}
                        disabled={i === patterns.length - 1}
                        title="Move down"
                        style={{
                          width: 24, height: 24, borderRadius: 6, padding: 0,
                          border: `1px solid ${i === patterns.length - 1 ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.18)'}`,
                          background: i === patterns.length - 1 ? 'transparent' : 'rgba(255,255,255,0.05)',
                          cursor: i === patterns.length - 1 ? 'default' : 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          opacity: i === patterns.length - 1 ? 0.2 : 1,
                        }}
                      >
                        <span style={{ fontSize: 13, lineHeight: 1, color: 'var(--text2)', fontWeight: 700 }}>↓</span>
                      </button>
                    </>
                  )}
                </div>
                )}

                {/* ── Pattern card — border via outerStyle prop ── */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <PatternEditor
                    key={p.id} pattern={p} defaultOpen={p.id === newId || p.id === openPatternId}
                    onChange={np => upd(i, np)} onDelete={() => del(i)}
                    onMirrorPattern={(name) => mirrorPattern(i, name)}
                    onCopyPattern={(name) => copyPattern(i, name)}
                    allPatternNames={patterns.map(x => x.name)}
                    onOpenChange={(isNowOpen) => setOpenPatternId(isNowOpen ? p.id : null)}
                    outerStyle={{
                      border: p.locked
                        ? '2px solid rgba(255,200,0,0.9)'
                        : p.enabled
                          ? (p.side==='bull' ? '2px solid #00e676' : '2px solid #ff4757')
                          : (p.side==='bull' ? '2px solid rgba(0,230,118,0.35)' : '2px solid rgba(255,71,87,0.35)'),
                      boxShadow: p.locked
                        ? '0 0 16px rgba(255,200,0,0.5)'
                        : p.enabled
                          ? (p.side==='bull'
                              ? '0 0 14px rgba(0,230,118,0.6), inset 0 0 10px rgba(0,230,118,0.08)'
                              : '0 0 14px rgba(255,71,87,0.6), inset 0 0 10px rgba(255,71,87,0.08)')
                          : (p.side==='bull' ? '0 0 4px rgba(0,230,118,0.2)' : '0 0 4px rgba(255,71,87,0.2)'),
                    }}
                  />
                </div>
              </div>
            )})}
          </div>
        </>
      )}

      {/* Add button */}
      <button onClick={add} style={{
        width: '100%', padding: '12px', borderRadius: 10, cursor: 'pointer',
        fontSize: 13, fontFamily: 'var(--mono)', fontWeight: 800,
        border: '2px dashed var(--lime-border)',
        background: 'var(--lime-dim)', color: 'var(--lime)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--lime-dim)'}
        onMouseLeave={e => e.currentTarget.style.background = 'var(--lime-dim)'}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
        </svg>
        New Pattern
      </button>

      {/* ── Trash Bin ── */}
      <div style={{ marginTop: 22 }}>
        {/* Trash header toggle */}
        <button
          onClick={() => setTrashOpen(o => !o)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 13px', borderRadius: 10, cursor: 'pointer',
            border: '1.5px solid rgba(255,160,0,0.25)',
            background: trashOpen ? 'rgba(255,160,0,0.07)' : 'rgba(255,160,0,0.03)',
            color: AMB, fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 13,
            transition: 'background .15s',
          }}
        >
          <span style={{ fontSize: 16 }}>🗑</span>
          <span style={{ flex: 1, textAlign: 'left' }}>Trash Bin</span>
          <span style={{
            fontSize: 10, padding: '2px 7px', borderRadius: 5,
            background: trash.length ? 'rgba(255,160,0,0.18)' : 'rgba(255,255,255,0.05)',
            border: `1px solid ${trash.length ? 'rgba(255,160,0,0.4)' : 'var(--border)'}`,
          }}>{trash.length} / 50</span>
          <span style={{ fontSize: 11, opacity: .6 }}>{trashOpen ? '▲' : '▼'}</span>
        </button>

        {trashOpen && (
          <div style={{
            marginTop: 6, borderRadius: 10, overflow: 'hidden',
            border: '1.5px solid rgba(255,160,0,0.2)',
            background: 'rgba(255,160,0,0.03)',
          }}>
            {trash.length === 0 ? (
              <div style={{ padding: '28px 16px', textAlign: 'center', fontFamily: 'var(--mono)', color: 'var(--text3)', fontSize: 11 }}>
                Trash is empty
              </div>
            ) : (
              <>
                {/* Purge all warning modal */}
                {confirmPurgeAll && (
                  <>
                    <div onClick={() => { setConfirmPurgeAll(false); setPurgeAllChecked(false) }} style={{
                      position: 'fixed', inset: 0, zIndex: 199, background: 'rgba(0,0,0,0.65)',
                      backdropFilter: 'blur(3px)',
                    }} />
                    <div style={{
                      position: 'fixed', left: '50%', top: '50%',
                      transform: 'translate(-50%,-50%)',
                      zIndex: 200, width: 'min(320px, 90vw)',
                      borderRadius: 16, padding: '22px 18px',
                      background: 'var(--bg1)',
                      border: '1.5px solid rgba(255,60,60,0.45)',
                      boxShadow: '0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,60,60,0.1)',
                    }}>
                      {/* Icon + title */}
                      <div style={{ textAlign: 'center', marginBottom: 14 }}>
                        <div style={{ fontSize: 36, marginBottom: 8 }}>⚠️</div>
                        <div style={{ fontWeight: 900, fontSize: 16, color: 'var(--red)', letterSpacing: '-.01em' }}>
                          Delete All Permanently?
                        </div>
                        <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', marginTop: 5, lineHeight: 1.6 }}>
                          This will permanently delete all <b style={{ color: AMB }}>{trash.length} pattern{trash.length !== 1 ? 's' : ''}</b> from the trash bin.<br/>
                          <b style={{ color: 'var(--red)' }}>This action cannot be undone.</b>
                        </div>
                      </div>

                      {/* Divider */}
                      <div style={{ height: 1, background: 'rgba(255,60,60,0.15)', marginBottom: 14 }} />

                      {/* Dual checkbox confirm */}
                      <div
                        onClick={() => setPurgeAllChecked(v => !v)}
                        style={{
                          display: 'flex', alignItems: 'flex-start', gap: 10,
                          padding: '10px 12px', borderRadius: 9, cursor: 'pointer',
                          border: `1.5px solid ${purgeAllChecked ? 'rgba(255,60,60,0.5)' : 'var(--border)'}`,
                          background: purgeAllChecked ? 'rgba(255,60,60,0.08)' : 'var(--bg2)',
                          transition: 'all .15s', marginBottom: 14, userSelect: 'none',
                        }}
                      >
                        <div style={{
                          width: 16, height: 16, borderRadius: 4, flexShrink: 0, marginTop: 1,
                          border: `2px solid ${purgeAllChecked ? 'var(--red)' : 'var(--border)'}`,
                          background: purgeAllChecked ? 'var(--red)' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'all .15s',
                        }}>
                          {purgeAllChecked && (
                            <svg width="9" height="9" viewBox="0 0 8 8" fill="none">
                              <polyline points="1,4 3.2,6.2 7,2" stroke="#000" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </div>
                        <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: purgeAllChecked ? 'var(--red)' : 'var(--text3)', lineHeight: 1.5, transition: 'color .15s' }}>
                          I understand all deleted patterns are <b>permanently lost</b> and cannot be recovered.
                        </span>
                      </div>

                      {/* Buttons */}
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={() => { setConfirmPurgeAll(false); setPurgeAllChecked(false) }}
                          style={{
                            flex: 1, padding: '11px', borderRadius: 9, cursor: 'pointer',
                            fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 12,
                            border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text2)',
                          }}
                        >✕ Cancel</button>
                        <button
                          disabled={!purgeAllChecked}
                          onClick={() => { purgeAll(); setConfirmPurgeAll(false); setPurgeAllChecked(false) }}
                          style={{
                            flex: 1, padding: '11px', borderRadius: 9, cursor: purgeAllChecked ? 'pointer' : 'not-allowed',
                            fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 12,
                            border: `1.5px solid ${purgeAllChecked ? 'rgba(255,60,60,0.6)' : 'rgba(255,60,60,0.2)'}`,
                            background: purgeAllChecked ? 'rgba(255,60,60,0.2)' : 'rgba(255,60,60,0.05)',
                            color: purgeAllChecked ? 'var(--red)' : 'rgba(255,60,60,0.3)',
                            transition: 'all .2s',
                          }}
                        >🗑 Delete All</button>
                      </div>
                    </div>
                  </>
                )}

                {/* Purge all trigger button */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 10px 4px' }}>
                  <button onClick={() => { setConfirmPurgeAll(true); setPurgeAllChecked(false) }} style={{
                    fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700,
                    padding: '4px 11px', borderRadius: 6, cursor: 'pointer',
                    border: '1px solid rgba(255,60,60,0.3)', background: 'rgba(255,60,60,0.07)',
                    color: 'var(--red)',
                  }}>Clear all</button>
                </div>

                {/* Trash items */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {trash.map((p, i) => {
                    const c = p.side === 'bull' ? G : R
                    const ago = p.deletedAt
                      ? (() => {
                          const s = Math.floor((Date.now() - p.deletedAt) / 1000)
                          if (s < 60) return `${s}s ago`
                          if (s < 3600) return `${Math.floor(s/60)}m ago`
                          if (s < 86400) return `${Math.floor(s/3600)}h ago`
                          return `${Math.floor(s/86400)}d ago`
                        })()
                      : ''
                    return (
                      <div key={p.id} style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '9px 11px',
                        borderBottom: i < trash.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                        background: 'transparent',
                      }}>
                        <span style={{ fontSize: 18, flexShrink: 0 }}>{p.icon}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 12, color: c,
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {p.name}
                          </div>
                          <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', marginTop: 2 }}>
                            {p.side.toUpperCase()} · {p.conditions?.length ?? 0} conds · {p.tfs?.join(' ') || 'no TF'} · deleted {ago}
                          </div>
                        </div>
                        <button onClick={() => restore(i)} title="Restore pattern" style={{
                          fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700,
                          padding: '4px 10px', borderRadius: 6, cursor: 'pointer', flexShrink: 0,
                          border: '1px solid rgba(0,230,118,0.35)', background: 'rgba(0,230,118,0.08)',
                          color: G,
                        }}>↩ Restore</button>
                        {confirmPurgeId === p.id ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                            <button onClick={() => { purgeOne(i); setConfirmPurgeId(null) }} style={{
                              padding: '3px 8px', borderRadius: 6, cursor: 'pointer', flexShrink: 0,
                              fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 800,
                              border: '1px solid rgba(255,60,60,0.5)', background: 'rgba(255,60,60,0.18)',
                              color: 'var(--red)',
                            }}>Yes</button>
                            <button onClick={() => setConfirmPurgeId(null)} style={{
                              padding: '3px 8px', borderRadius: 6, cursor: 'pointer', flexShrink: 0,
                              fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 800,
                              border: '1px solid var(--border)', background: 'var(--bg3)',
                              color: 'var(--text2)',
                            }}>Cancel</button>
                          </div>
                        ) : (
                          <button onClick={() => setConfirmPurgeId(p.id)} title="Delete permanently" style={{
                            width: 26, height: 26, borderRadius: 6, cursor: 'pointer', flexShrink: 0,
                            border: '1px solid rgba(255,60,60,0.25)', background: 'rgba(255,60,60,0.06)',
                            color: 'var(--red)', fontSize: 13,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>×</button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
