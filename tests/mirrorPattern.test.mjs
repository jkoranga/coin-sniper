import test from 'node:test'
import assert from 'node:assert/strict'
import { mirrorCondition } from '../src/utils/mirrorPattern.js'
import { compilePattern, validateConditionConfig } from '../src/utils/patternEngine.js'

const cond = (options = {}) => ({
  enabled: true, lhsField: 'close', lhsOffset: 0,
  op: '>', rhsMode: 'field', rhsField: 'ema20', rhsOffset: 0, ...options,
})
const mirror = original => mirrorCondition(original, () => 'mirrored-test-id')
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`)
const candles = () => Array.from({ length: 35 }, (_, i) => ({
  time: i * 900000, open: 100, close: 101, high: 102, low: 99,
  ema20: 100, rsi: 55, diPlus: 30, diMinus: 10, adx: 28,
  volume: 1000, changePct: 1, change24h: 2,
}))
const reflect = values => values.map(c => ({
  ...c, open: 200 - c.open, close: 200 - c.close,
  high: 200 - c.low, low: 200 - c.high,
  ema20: 200 - c.ema20, rsi: 100 - c.rsi,
  diPlus: c.diMinus, diMinus: c.diPlus,
  changePct: -c.changePct, change24h: -c.change24h,
}))
const matches = (condition, data) =>
  Boolean(compilePattern({ side: 'bull', conditions: [condition] })(data))

test('bullish historical Cross Up mirrors bearish Cross Down', () => {
  const input = cond({
    histCompare: true, lhsField: 'close', rhsField: 'close', op: 'crossUp',
    histCurrentFrom: 1, histCurrentTo: 2,
    histPreviousFrom: 3, histPreviousTo: 6,
  })
  const result = mirror(input)
  assert.equal(result.op, 'crossDown')
  assert.equal(result.histCurrentFrom, 1)
  assert.equal(result.histPreviousTo, 6)
})
test('wick-strength Cross Up remains a strength breakout', () => {
  const result = mirror(cond({
    histCompare: true, lhsField: 'greenLowerWickPct',
    rhsField: 'greenLowerWickPct', op: 'crossUp',
  }))
  assert.equal(result.op, 'crossUp')
})
test('green lower wick mirrors red UPPER wick (not lower)', () => {
  assert.equal(mirror(cond({ lhsField: 'greenLowerWickPct' })).lhsField, 'redUpperWickPct')
  assert.equal(mirror(cond({ lhsField: 'redUpperWickPct' })).lhsField, 'greenLowerWickPct')
})
test('green upper wick mirrors red LOWER wick', () => {
  assert.equal(mirror(cond({ lhsField: 'greenUpperWickPct' })).lhsField, 'redLowerWickPct')
  assert.equal(mirror(cond({ lhsField: 'redLowerWickPct' })).lhsField, 'greenUpperWickPct')
})
test('DI+ > DI- mirrors DI- > DI+ without reversing >', () => {
  const result = mirror(cond({ lhsField: 'diPlus', rhsField: 'diMinus' }))
  assert.equal(result.lhsField, 'diMinus')
  assert.equal(result.rhsField, 'diPlus')
  assert.equal(result.op, '>')
})
test('trend-strength ADX and absolute magnitude thresholds stay positive', () => {
  const result = mirror(cond({ lhsField: 'adx', rhsMode: 'number', rhsNum: 25 }))
  assert.equal(result.op, '>')
  assert.equal(result.rhsNum, 25)
})
test('RSI > 60 mirrors RSI < 40 around midpoint 50', () => {
  const result = mirror(cond({ lhsField: 'rsi', rhsMode: 'number', rhsNum: 60 }))
  assert.equal(result.op, '<')
  assert.equal(result.rhsNum, 40)
})
test('absolute price > 100 mirrors price < 100, not negative price', () => {
  const result = mirror(cond({ lhsField: 'close', rhsMode: 'number', rhsNum: 100 }))
  assert.equal(result.op, '<')
  assert.equal(result.rhsNum, 100)
})
test('price multiplier uses the reciprocal', () => {
  const result = mirror(cond({ rhsMode: 'mult', rhsMult: 1.05 }))
  near(result.rhsMult, 1 / 1.05)
  assert.equal(result.op, '<')
})
test('relative price percent and gap use inverse ratio', () => {
  const adjustment = mirror(cond({ rhsMode: 'pct', rhsPct: 5 }))
  near(adjustment.rhsPct, (1 / 1.05 - 1) * 100)
  const gap = mirror(cond({ rhsMode: 'pctdiff', rhsNum: 5 }))
  near(gap.rhsNum, (1 / 1.05 - 1) * 100)
  assert.equal(gap.op, '<')
})
test('daily signed change threshold reverses sign and operator', () => {
  const result = mirror(cond({ lhsField: 'changePct', rhsMode: 'number', rhsNum: 1 }))
  assert.equal(result.rhsNum, -1)
  assert.equal(result.op, '<')
})
test('historical MAX breakthrough becomes MIN breakdown', () => {
  const result = mirror(cond({
    histCompare: true, lhsField: 'high', rhsField: 'high',
    histPreviousMode: 'max',
  }))
  assert.equal(result.lhsField, 'low')
  assert.equal(result.rhsField, 'low')
  assert.equal(result.histPreviousMode, 'min')
})
test('historical MAX remains MAX for wick magnitude', () => {
  const result = mirror(cond({
    histCompare: true, lhsField: 'greenLowerWickPct',
    rhsField: 'greenLowerWickPct', histPreviousMode: 'max',
  }))
  assert.equal(result.histPreviousMode, 'max')
})
test('candle 0, past offsets, HTF and AND/OR groups retain structure', () => {
  const input = cond({
    histCompare: true, histCurrentFrom: 0, histCurrentTo: 2,
    histPreviousFrom: 3, histPreviousTo: 8, lhsOffset: -1,
    rhsPinned: true, rhsPinnedOffset: -3, htfTf: '1h',
    groupId: 'grp_3', joinNext: 'OR',
  })
  const result = mirror(input)
  for (const key of [
    'histCurrentFrom', 'histCurrentTo', 'histPreviousFrom',
    'histPreviousTo', 'lhsOffset', 'rhsPinned', 'rhsPinnedOffset',
    'htfTf', 'groupId', 'joinNext',
  ]) assert.equal(result[key], input[key], key)
})
test('incomplete comparison stays incomplete, not silently >', () => {
  const result = mirror(cond({ histCompare: true, op: '' }))
  assert.equal(result.op, '')
  assert.equal(validateConditionConfig(result).valid, false)
})
test('non-exact RSI multiplier is disabled for manual review', () => {
  const result = mirror(cond({ lhsField: 'rsi', rhsField: 'rsi', rhsMode: 'mult', rhsMult: 1.2 }))
  assert.equal(result.enabled, false)
  assert.ok(result.mirrorReviewReason)
})
test('shared engine evaluates simple bullish and mirrored bearish prices', () => {
  const data = candles()
  data.at(-1).close = 110
  data.at(-1).high = 112
  const rule = cond()
  assert.equal(matches(rule, data), true)
  assert.equal(matches(mirror(rule), reflect(data)), true)
})
test('shared engine evaluates historical high/MAX vs low/MIN using candle 0', () => {
  const data = candles()
  data.at(-1).high = 115
  data.at(-1).close = 110
  const rule = cond({
    histCompare: true, lhsField: 'high', rhsField: 'high',
    histCurrentFrom: 0, histCurrentTo: 0,
    histPreviousFrom: 1, histPreviousTo: 5, histPreviousMode: 'max',
  })
  assert.equal(matches(rule, data), true)
  assert.equal(matches(mirror(rule), reflect(data)), true)
})
test('shared engine evaluates historical Cross Up / Cross Down mirror', () => {
  const data = candles()
  for (let n = 3; n <= 6; n++) {
    const x = data[data.length - 1 - n]
    Object.assign(x, { open: 100, close: 100, high: 101, low: 99 })
  }
  for (let n = 1; n <= 2; n++) {
    const x = data[data.length - 1 - n]
    x.open = 90
    x.close = n === 1 ? 110 : 95
    x.high = Math.max(x.open, x.close) + 1
    x.low = Math.min(x.open, x.close) - 1
  }
  const rule = cond({
    histCompare: true, op: 'crossUp', lhsField: 'close', rhsField: 'close',
    histCurrentFrom: 1, histCurrentTo: 2,
    histPreviousFrom: 3, histPreviousTo: 6,
  })
  assert.equal(matches(rule, data), true)
  assert.equal(matches(mirror(rule), reflect(data)), true)
})
test('shared engine evaluates DI counterparts', () => {
  const data = candles()
  const rule = cond({ lhsField: 'diPlus', rhsField: 'diMinus' })
  assert.equal(matches(rule, data), true)
  assert.equal(matches(mirror(rule), reflect(data)), true)
})
test('shared engine evaluates wick counterparts', () => {
  const data = candles()
  Object.assign(data.at(-1), { open: 100, close: 110, low: 90, high: 112 })
  const rule = cond({ lhsField: 'greenLowerWickPct', rhsMode: 'number', rhsNum: 4 })
  assert.equal(matches(rule, data), true)
  assert.equal(matches(mirror(rule), reflect(data)), true)
})
