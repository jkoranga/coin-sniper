// Live, market-independent explanation of a Pattern Builder condition.
// This describes the SAME choices that the shared pattern engine evaluates.
const FIELD_NAMES = {
  close: 'Close price', open: 'Open price', high: 'High price', low: 'Low price',
  volume: 'Volume', rsi: 'RSI 14', adx: 'ADX 14',
  diPlus: '+DI 14', diMinus: '-DI 14', changePct: 'Price change %',
  change24h: '24-hour change %', bodyPct: 'Full body %', bodySizePct: 'Body size %',
  body: 'Body size', range: 'Candle range', upperWick: 'Upper wick',
  lowerWick: 'Lower wick', isGreen: 'Is green candle (1/0)',
  isRed: 'Is red candle (1/0)',
  greenLowerWickPct: 'Green bar lower wick %',
  redLowerWickPct: 'Red bar lower wick %',
  greenUpperWickPct: 'Green bar upper wick %',
  redUpperWickPct: 'Red bar upper wick %',
}
const fieldName = id => FIELD_NAMES[id] || (/^ema\d+$/.test(id || '') ? `EMA ${id.slice(3)}` : id || '(indicator not selected)')
const hindiOps = { '>': 'से ज्यादा', '>=': 'के बराबर या ज्यादा', '<': 'से कम', '<=': 'के बराबर या कम', '=': 'के बराबर', '≠': 'से अलग' }
const opWords = {
  '>': 'greater than', '>=': 'greater than or equal to',
  '<': 'less than', '<=': 'less than or equal to',
  '=': 'equal to', '≠': 'not equal to',
}
const fmt = n => Number(n) === 0 ? '0 (running)' : `-${Math.abs(Number(n))}`
const standardFmt = n => Number(n) === 0 ? '0 (running)' : String(n)
const singular = (a, b) => Number(a) === Number(b)
const joinRange = (from, to, hist = true) => {
  const show = hist ? fmt : standardFmt
  return singular(from, to) ? `[${show(from)}]` : `[${show(from)} to ${show(to)}]`
}
const refDescription = (mode, field, window) => {
  const source = `${field} in older candles ${window}`
  if (mode === 'every') return `every individual ${source}`
  if (mode === 'min') return `the minimum ${source}`
  if (mode === 'avg') return `the average ${source}`
  return `the maximum ${source}`
}
const number = (value, fallback = 0) => value ?? fallback

export function explainCondition(cond) {
  if (!cond || typeof cond !== 'object') return { summary: 'Condition not configured.', steps: [], note: '' }
  const hist = !!cond.histCompare
  const range = !hist && !!cond.rangeCheck
  const left = fieldName(cond.lhsField)
  const right = fieldName(cond.rhsField || (hist ? cond.lhsField : ''))
  const mode = cond.rhsMode ?? (hist ? 'field' : 'number')
  const op = cond.op === '% Diff' ? (cond.histPctOp || '>=') : cond.op
  const direction = opWords[op] || 'compared with'
  const scope = cond.htfTf ? `${cond.htfTf} candle chart (higher timeframe)` : 'the pattern’s selected chart timeframe'
  const steps = [{ label: 'Chart', text: `Evaluate on ${scope}.` }]
  if (!cond.lhsField) {
    return { summary: 'Select the indicator to define this condition.', steps, note: 'No signal until the condition is complete.' }
  }

  if (hist) {
    const cf = cond.histCurrentFrom ?? 1
    const ct = cond.histCurrentTo ?? 2
    const pf = cond.histPreviousFrom ?? 3
    const pt = cond.histPreviousTo ?? 20
    const current = joinRange(cf, ct)
    const older = joinRange(pf, pt)
    const currentCount = Math.abs(Number(ct) - Number(cf)) + 1
    const previousMode = cond.histPreviousMode ?? 'max'
    const currentMatch = cond.histCurrentMatch ?? 'any'
    const isCross = cond.op === 'crossUp' || cond.op === 'crossDown'
    const isLegacyDiff = cond.op === '% Diff' || cond.histCompareMode === 'pctdiff'
    const actualMode = isLegacyDiff ? 'pctdiff' : mode
    steps.push({
      label: 'Recent candles',
      text: `Read ${left} on ${currentCount} recent candle${currentCount === 1 ? '' : 's'} ${current}.`,
    })
    steps.push({
      label: 'Older candles',
      text: `Use ${right} from the older, non-overlapping candles ${older}.`,
    })
    if (isCross) {
      const size = Number(pt) - Number(pf) + 1
      const split = Math.ceil(size / 2)
      const first = joinRange(pf, Number(pf) + split - 1)
      const second = joinRange(Number(pf) + split, pt)
      const up = cond.op === 'crossUp'
      const reference = up ? 'maximum' : 'minimum'
      steps.push({
        label: 'Two reference levels',
        text: `Split the older window into ${first} and ${second}; calculate the ${reference} ${right} in EACH half.`,
      })
      const starting = cond.lhsField === 'close'
        ? `${up ? 'minimum' : 'maximum'} Open price among the recent candles`
        : `${left} on the oldest recent candle`
      const ending = `${left} on the newest recent candle ${fmt(cf)}`
      const levels = up
        ? 'Start must be below BOTH reference levels and finish above BOTH levels.'
        : 'Start must be above BOTH reference levels and finish below BOTH levels.'
      steps.push({
        label: 'Cross rule',
        text: `Start = ${starting}. Finish = ${ending}. ${levels}`,
      })
      return {
        summary: `${up ? 'CROSS UP' : 'CROSS DOWN'} passes only when ${left} moves ${up ? 'from below to above' : 'from above to below'} both historical reference levels.`,
        hindi: `पुरानी ${older} candles के दो अलग reference levels को ${left} को ${up ? 'नीचे से ऊपर' : 'ऊपर से नीचे'} पार करना होगा। तभी condition PASS होगी।`,
        steps,
        note: `This is a two-level historical cross, not simply ${left} ${up ? '>' : '<'} its older value.${Number(cf) === 0 ? ' Candle 0 is still forming, so this can change.' : ''}`,
      }
    }

    const reference = refDescription(previousMode, right, older)
    const overAll = currentMatch === 'all' ? 'EVERY recent candle must pass' : 'AT LEAST ONE recent candle must pass'
    let calculation
    let summary
    if (actualMode === 'number') {
      calculation = `For each recent ${left} value, compare it directly with the fixed value ${number(cond.rhsNum)}.`
      summary = `${overAll}: ${left} must be ${direction} ${number(cond.rhsNum)}.`
    } else if (actualMode === 'pctdiff') {
      const threshold = number(cond.op === '% Diff' ? (cond.histPctThreshold ?? cond.rhsNum) : cond.rhsNum)
      calculation = `For each recent ${left}, calculate ((recent ${left} ÷ older reference) − 1) × 100. The older reference is ${reference}. Compare this percentage result with ${threshold}% using "${op || '?'}".`
      summary = `${overAll}: the calculated percentage gap must be ${direction} ${threshold}%. This compares a PERCENTAGE GAP, not raw RSI or price values.`
    } else if (actualMode === 'slope') {
      const lookback = Math.max(1, Number(cond.slopeLen ?? 5)) + Math.max(0, Number(cond.slopeSkip ?? 0))
      calculation = `For EACH recent candle, take its ${left} value, then the SAME indicator ${lookback} candles earlier. Calculate ((recent value ÷ earlier value) − 1) × 100.`
      summary = `${overAll}: ${left} slope over ${lookback} candles must be ${direction} ${number(cond.slopeNum)}%.`
    } else {
      const compareTo = actualMode === 'mult'
        ? `${reference} multiplied by ${number(cond.rhsMult, 1)}`
        : actualMode === 'pct'
          ? `${reference} adjusted by ${number(cond.rhsPct)}% (reference × (1 + percent/100))`
          : reference
      calculation = `For each recent ${left} value, compare it with ${compareTo} using "${op || '?'}".`
      summary = `${overAll}: recent ${left} must be ${direction} ${compareTo}.`
    }
    steps.push({ label: 'Calculation', text: calculation })
    if (previousMode === 'every' && !['number', 'slope'].includes(actualMode)) {
      steps.push({ label: 'Every older candle', text: 'Each recent candle is tested against EVERY individual older value. That recent candle passes only if all those comparisons pass.' })
    } else if (!['number', 'slope'].includes(actualMode)) {
      steps.push({ label: 'Reference', text: `Older reference = ${reference}.` })
    }
    steps.push({ label: 'Signal pass rule', text: `${overAll}. Otherwise this condition fails.` })
    const incomplete = !cond.op
    const recentHindi = currentMatch === 'all' ? 'हाल की सभी candles' : 'हाल की कम-से-कम एक candle'
    const oldHindi = previousMode === 'every' ? 'हर पुरानी candle' : previousMode === 'min' ? 'पुरानी candles का Minimum' : previousMode === 'avg' ? 'पुरानी candles का Average' : 'पुरानी candles का Maximum'
    const comparisonHindi = actualMode === 'pctdiff'
      ? `${left} का ${oldHindi} ${right} से percentage gap ${number(cond.op === '% Diff' ? (cond.histPctThreshold ?? cond.rhsNum) : cond.rhsNum)}% ${hindiOps[op] || 'के अनुसार'} होना चाहिए`
      : actualMode === 'slope'
        ? `${left} का ${number(cond.slopeLen, 5) + number(cond.slopeSkip)} candles का slope ${number(cond.slopeNum)}% ${hindiOps[op] || 'के अनुसार'} होना चाहिए`
        : actualMode === 'number'
          ? `${left} ${number(cond.rhsNum)} ${hindiOps[op] || 'के अनुसार'} होना चाहिए`
          : `${left} की तुलना ${oldHindi} ${right} ${actualMode === 'mult' ? `× ${number(cond.rhsMult,1)}` : actualMode === 'pct' ? `± ${number(cond.rhsPct)}%` : ''} से ${hindiOps[op] || 'करनी है'}`
    return {
      summary: incomplete ? 'INCOMPLETE: Choose a comparison direction to finish this rule.' : summary,
      hindi: incomplete ? 'Operator चुनना जरूरी है। इसके बिना condition signal PASS नहीं करेगी।' : `${recentHindi} ${current} में ${comparisonHindi}। पुरानी candle range ${older} है।`,
      steps,
      note: `${Number(cf) === 0 ? 'Candle 0 is running and its value can change until close. ' : ''}This preview describes the configured rule; it does not claim a live market match.${incomplete ? ' No signal is generated without an operator.' : ''}`,
    }
  }

  const from = range ? (cond.rangeFrom ?? -1) : (cond.lhsOffset ?? 0)
  const to = range ? (cond.rangeTo ?? -5) : from
  const candleRange = joinRange(from, to, false)
  const match = range ? (cond.rangeMode === 'any' ? 'AT LEAST ONE candle must pass' : 'EVERY candle must pass') : 'This candle must pass'
  steps.push({ label: range ? 'Selected candles' : 'Candle', text: `Read ${left} on candle${range ? 's' : ''} ${candleRange}.` })
  const offset = range
    ? cond.rhsPinned
      ? `pinned candle ${standardFmt(cond.rhsPinnedOffset ?? 0)}`
      : `corresponding candle (offset ${number(cond.rhsOffset)}) for each selected candle`
    : `candle ${standardFmt(cond.rhsOffset ?? 0)}`
  const ref = `${right} on ${offset}`
  let action
  if (mode === 'number') action = `Compare ${left} directly with fixed value ${number(cond.rhsNum)}.`
  else if (mode === 'slope') {
    const length = number(cond.slopeLen, 5)
    const skip = number(cond.slopeSkip)
    action = `Calculate ((${left} now ÷ ${left} ${Number(length) + Number(skip)} candles earlier) − 1) × 100, then compare with ${number(cond.slopeNum)}%.`
  } else if (mode === 'pctdiff') action = `Calculate ((${left} ÷ ${ref}) − 1) × 100 and compare with ${number(cond.rhsNum)}%.`
  else if (mode === 'mult') action = `Compare ${left} with ${ref} multiplied by ${number(cond.rhsMult, 1)}.`
  else if (mode === 'pct') action = `Compare ${left} with ${ref} adjusted by ${number(cond.rhsPct)}%.`
  else action = `Compare ${left} with ${ref}.`
  steps.push({ label: 'Calculation', text: action })
  steps.push({ label: 'Signal pass rule', text: mode === 'pctdiff'
    ? `${match} when the calculated percentage gap is ${direction} ${number(cond.rhsNum)}%.`
    : mode === 'slope'
      ? `${match} when the calculated slope is ${direction} ${number(cond.slopeNum)}%.`
      : `${match} when the LEFT value is ${direction} the comparison value.` })
  return {
    summary: !cond.op ? 'INCOMPLETE: Select a comparison direction.' : `${match}; the selected operator is ${op} (${direction}).`,
    hindi: !cond.op ? 'Operator चुनना जरूरी है।' : `${range ? (cond.rangeMode === 'any' ? 'इस range की कम-से-कम एक candle' : 'इस range की सभी candles') : 'इस candle'} ${candleRange} में ${mode === 'pctdiff' ? `${left} का percentage gap ${number(cond.rhsNum)}% ${hindiOps[op] || 'के अनुसार'} होना चाहिए` : mode === 'slope' ? `${left} का slope ${number(cond.slopeNum)}% ${hindiOps[op] || 'के अनुसार'} होना चाहिए` : `${left} ${hindiOps[op] || 'के अनुसार'} compare होना चाहिए`}।`,
    steps,
    note: `${Number(from) === 0 || Number(to) === 0 ? 'Includes running candle 0; its value may change. ' : ''}This preview explains your configured logic; it is not live signal validation.`,
  }
}
