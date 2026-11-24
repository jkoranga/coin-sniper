import test from 'node:test'
import assert from 'node:assert/strict'
import { explainCondition } from '../src/utils/conditionExplanation.js'

const base = {
  enabled: true, histCompare: true, lhsField: 'rsi', rhsField: 'rsi',
  rhsMode: 'pctdiff', op: '>', rhsNum: 25,
  histCurrentFrom: 0, histCurrentTo: 1,
  histPreviousFrom: 3, histPreviousTo: 10,
  histPreviousMode: 'max', histCurrentMatch: 'any',
}
const explain = options => explainCondition({ ...base, ...options })
const fullText = e => [e.summary, ...e.steps.map(s => s.text), e.note].join(' ')
test('screenshotted historical RSI % gap explains the exact percentage calculation and threshold', () => {
  const text = fullText(explain())
  assert.match(text, /\[0 \(running\) to -1\]/)
  assert.match(text, /\[-3 to -10\]/)
  assert.match(text, /maximum RSI 14/)
  assert.match(text, /\(\(recent RSI 14 ÷ older reference\) − 1\) × 100/)
  assert.match(text, /AT LEAST ONE/)
  assert.match(text, /greater than 25%/)
  assert.doesNotMatch(text, /[\u0900-\u097F]/)
})
test('operator and threshold update independently and immediately', () => {
  const x = explain({ op: '<=', rhsNum: 12 })
  assert.match(fullText(x), /less than or equal to 12%/)
  assert.doesNotMatch(x.summary, /greater than 25%/)
})
test('ALL and EVERY mean all recent candles versus every individual older candle', () => {
  const x = explain({ histCurrentMatch: 'all', histPreviousMode: 'every', rhsMode: 'field' })
  assert.match(x.summary, /EVERY recent candle/)
  assert.match(fullText(x), /EVERY individual older value/)
  assert.match(fullText(x), /all those comparisons pass/)
})
test('older references change between MIN, MAX and AVG', () => {
  for (const [mode, word] of [['min', 'minimum'], ['max', 'maximum'], ['avg', 'average']]) {
    assert.match(fullText(explain({ histPreviousMode: mode, rhsMode: 'field' })), new RegExp(word))
  }
})
test('VALUE mode explains fixed numeric condition without making it a percent gap', () => {
  const x = explain({ rhsMode: 'number', rhsNum: 58 })
  assert.match(x.summary, /RSI 14 must be greater than 58/)
  assert.doesNotMatch(x.summary, /percentage gap/)
})
test('multiplication and percentage adjustment get their own calculation detail', () => {
  assert.match(fullText(explain({ rhsMode: 'mult', rhsMult: 1.5 })), /multiplied by 1.5/)
  assert.match(fullText(explain({ rhsMode: 'pct', rhsPct: -2.5 })), /adjusted by -2.5%/)
})
test('historical slope explains lookback plus skip and the measured percent', () => {
  const x = explain({ rhsMode: 'slope', slopeLen: '5', slopeSkip: '2', slopeNum: 1.2 })
  assert.match(x.summary, /over 7 candles/)
  assert.match(fullText(x), /7 candles earlier/)
  assert.doesNotMatch(fullText(x), /[\u0900-\u097F]/)
})
test('historical Cross Up and Down explain two levels rather than a simple comparison', () => {
  for (const [op,word] of [['crossUp', 'below to above'], ['crossDown', 'above to below']]) {
    const x = explain({ op, rhsMode: 'field' })
    assert.match(x.summary, new RegExp(word))
    assert.match(fullText(x), /Two reference levels|reference levels/)
    assert.match(fullText(x), /Start =/)
  }
})
test('no historical operator tells user why signal cannot pass', () => {
  const x = explain({ op: '' })
  assert.match(x.summary, /INCOMPLETE/)
  assert.match(x.note, /No signal is generated without an operator/)
})
test('higher timeframe selection appears in explanation', () => {
  assert.match(fullText(explain({ htfTf: '1h' })), /1h candle chart/)
})
test('normal multi-candle % difference explains threshold, not raw left-right comparison', () => {
  const x = explain({ histCompare: false, rangeCheck: true, rangeFrom: -1, rangeTo: -5, rangeMode: 'any', op: '>', rhsMode: 'pctdiff', rhsNum: 2 })
  assert.match(fullText(x), /calculated percentage gap is greater than 2%/)
})
test('normal single-candle comparison explains candle offset', () => {
  const x = explain({ histCompare: false, rangeCheck: false, lhsOffset: -2, rhsOffset: -1, op: '<', rhsMode: 'field' })
  assert.match(fullText(x), /\[-2\]/)
  assert.match(fullText(x), /candle -1/)
})
