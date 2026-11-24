// Pure bullish/bearish counterpart builder. Keep this independent of React so
// mirrored rules can be regression-tested against the shared pattern engine.
const MIRROR_OP = { '>': '<', '>=': '<=', '<': '>', '<=': '>=', '=': '=', '≠': '≠',
  crossUp: 'crossDown', crossDown: 'crossUp' }

// A bullish lower wick is a bearish UPPER wick, not another lower wick.
const MIRROR_FIELD = {
  high: 'low', low: 'high',
  lowerWick: 'upperWick', upperWick: 'lowerWick',
  greenLowerWickPct: 'redUpperWickPct', redUpperWickPct: 'greenLowerWickPct',
  greenUpperWickPct: 'redLowerWickPct', redLowerWickPct: 'greenUpperWickPct',
  isGreen: 'isRed', isRed: 'isGreen',
  diPlus: 'diMinus', diMinus: 'diPlus',
}
const directionalChange = new Set(['changePct', 'change24h'])
const priceField = name => ['open', 'high', 'low', 'close'].includes(name) || /^ema\d+$/.test(name || '')
const directionalField = name => priceField(name) || name === 'rsi' || directionalChange.has(name)
const numeric = value => value !== '' && value != null && Number.isFinite(Number(value))
const rounded = value => Number(value.toPrecision(12))
const inversePercent = value => {
  const factor = 1 + Number(value) / 100
  return factor > 0 ? rounded((1 / factor - 1) * 100) : null
}

export function mirrorCondition(cond, nextId = () => Math.random().toString(36).slice(2)) {
  const lhs = cond.lhsField
  const mode = cond.rhsMode || (cond.histCompare ? 'field' : 'mult')
  const rhs = cond.rhsField
  const isDirectional = directionalField(lhs)
  const isPrice = priceField(lhs)
  const isRsi = lhs === 'rsi'
  const isChange = directionalChange.has(lhs)
  let rhsNum = cond.rhsNum
  let rhsMult = cond.rhsMult
  let rhsPct = cond.rhsPct
  let slopeNum = cond.slopeNum
  let histPctThreshold = cond.histPctThreshold
  let histPctOp = cond.histPctOp
  const warnings = []

  if (mode === 'number' && numeric(rhsNum)) {
    if (isRsi) rhsNum = rounded(100 - Number(rhsNum))
    else if (isChange) rhsNum = -Number(rhsNum)
    // Absolute price, ADX, volume, wick-size and binary fields retain their positive threshold.
  }
  if (mode === 'mult' && numeric(rhsMult)) {
    if (isPrice && priceField(rhs)) {
      if (Number(rhsMult) > 0) rhsMult = rounded(1 / Number(rhsMult))
      else warnings.push('Price multiplier must be positive for a symmetric mirror.')
    } else if (isDirectional) {
      warnings.push('Multiplier on this indicator cannot be mirrored exactly; verify the threshold.')
    }
  }
  if (mode === 'pct' && numeric(rhsPct)) {
    if (isPrice && priceField(rhs)) {
      const value = inversePercent(rhsPct)
      if (value == null) warnings.push('Percentage factor must remain positive for a symmetric mirror.')
      else rhsPct = value
    } else if (isDirectional) {
      rhsPct = -Number(rhsPct)
      warnings.push('Percentage adjustment on this indicator is approximate; verify it manually.')
    }
  }
  if (mode === 'pctdiff' && numeric(rhsNum)) {
    if (isPrice && priceField(rhs)) {
      const value = inversePercent(rhsNum)
      if (value == null) warnings.push('Percentage gap factor must be positive for an inverse mirror.')
      else rhsNum = value
    } else if (isDirectional) {
      rhsNum = -Number(rhsNum)
      warnings.push('Percentage gap on this indicator is approximate; verify it manually.')
    }
  }
  if (mode === 'slope' && numeric(slopeNum)) {
    if (isPrice) {
      const value = inversePercent(slopeNum)
      if (value == null) warnings.push('Slope factor must be positive for a symmetric mirror.')
      else slopeNum = value
    } else if (isDirectional) {
      slopeNum = -Number(slopeNum)
      warnings.push('Slope inversion on this indicator is approximate; verify it manually.')
    }
  }

  // Legacy historical % Diff is an independent operator + threshold.
  if (cond.histCompare && cond.op === '% Diff') {
    histPctOp = isDirectional ? (MIRROR_OP[histPctOp || '>='] || histPctOp) : histPctOp
    if (numeric(histPctThreshold) && isDirectional) {
      if (isPrice && priceField(rhs)) {
        const value = inversePercent(histPctThreshold)
        if (value == null) warnings.push('Historical percentage threshold needs manual review.')
        else histPctThreshold = value
      } else {
        histPctThreshold = -Number(histPctThreshold)
        warnings.push('Historical percentage threshold is approximate; verify it manually.')
      }
    }
  }

  const result = {
    ...cond,
    id: nextId(),
    op: isDirectional ? (MIRROR_OP[cond.op] || cond.op) : cond.op,
    lhsField: MIRROR_FIELD[lhs] || lhs,
    rhsField: MIRROR_FIELD[rhs] || rhs,
    rhsNum,
    rhsMult,
    rhsPct,
    slopeNum,
    histPctThreshold,
    histPctOp,
    histPreviousMode: cond.histCompare && isDirectional
      ? ({ max: 'min', min: 'max' }[cond.histPreviousMode] || cond.histPreviousMode)
      : cond.histPreviousMode,
    label: cond.label ? `Mirror of ${cond.label}` : '',
  }
  // No false confidence: keep unsupported auto-mirrors OFF until manually reviewed.
  if (warnings.length) {
    result.enabled = false
    result.mirrorReviewReason = warnings.join(' ')
  } else {
    delete result.mirrorReviewReason
  }
  return result
}
