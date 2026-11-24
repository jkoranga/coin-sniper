import test from 'node:test'
import assert from 'node:assert/strict'
import { inspectPatternLogic } from '../src/utils/patternLogicGuide.js'
import { compilePattern } from '../src/utils/patternEngine.js'

const c = (n, overrides = {}) => ({
  id: 'c'+n, enabled:true, groupId:null, joinNext:'AND',
  lhsField:'close', lhsOffset:0, op:'>', rhsMode:'number', rhsNum:90, ...overrides,
})
const p = (conditions, tfs=['15m']) => ({ side:'bull', tfs, conditions, enabled:true })
const data = () => Array.from({length:30},(_,i)=>({
  time:i*900000, open:99, close:100, high:102, low:98, volume:1000, ema20:99, rsi:55,
}))
const passes = pattern => !!compilePattern(pattern)(data())

test('guided formula preserves OR only inside grouped alternatives',()=>{
  const x = p([c(1),c(2),c(3,{groupId:'g1',rhsNum:200,joinNext:'OR'}),c(4,{groupId:'g1'}),c(5)])
  const s=inspectPatternLogic(x)
  assert.equal(s.ready,true)
  assert.equal(s.groupedOr,true)
  assert.equal(s.ungroupedOr,false)
  assert.match(s.expression,/\(C3 OR C4\)/)
  assert.equal(passes(x),true)
})
test('grouped OR does not bypass required conditions outside group',()=>{
  const x=p([c(1,{rhsNum:150}),c(2),c(3,{groupId:'g1',rhsNum:200,joinNext:'OR'}),c(4,{groupId:'g1'}),c(5)])
  assert.equal(passes(x),false)
  assert.equal(inspectPatternLogic(x).ungroupedOr,false)
})
test('ungrouped OR is warned as able to bypass earlier AND conditions',()=>{
  const x=p([c(1,{rhsNum:150,joinNext:'OR'}),c(2),c(3)])
  const s=inspectPatternLogic(x)
  assert.equal(s.ungroupedOr,true)
  assert.match(s.warnings.join(' '),/bypass earlier AND/i)
  assert.equal(passes(x),true)
})
test('invalid operator never accidentally turns into NOT EQUAL signal',()=>{
  for(const op of ['',null,'banana','crossUp']) {
    const x=p([c(1,{op,rhsNum:150})])
    assert.equal(passes(x),false,`operator=${op}`)
    assert.equal(inspectPatternLogic(x).ready,false)
  }
})
test('incomplete OR branch cannot mistakenly pass a pattern',()=>{
  const x=p([c(1,{rhsNum:0,joinNext:'OR'}),c(2,{op:'',rhsNum:150})])
  assert.equal(passes(x),false)
  assert.equal(inspectPatternLogic(x).ready,false)
})
test('disabled invalid conditions do not block a valid active rule',()=>{
  const x=p([c(1),c(2,{enabled:false,op:''})])
  const s=inspectPatternLogic(x)
  assert.equal(s.ready,true)
  assert.equal(s.active,1)
  assert.equal(s.expression,'C1')
  assert.equal(passes(x),true)
})
test('missing timeframe or no enabled conditions reports clear errors',()=>{
  assert.equal(inspectPatternLogic(p([c(1)],[])).ready,false)
  assert.match(inspectPatternLogic(p([c(1,{enabled:false})])).errors.join(' '),/No enabled/)
})
test('identical candle-and-field comparisons receive a caution',()=>{
  const x=p([c(1,{lhsField:'ema20',rhsMode:'field',rhsField:'ema20',lhsOffset:0,rhsOffset:0})])
  assert.match(inspectPatternLogic(x).warnings.join(' '),/same indicator and candle/)
})
test('historical candle 0 warns the user that the bar is still forming',()=>{
  const x=p([c(1,{histCompare:true,histCurrentFrom:0,histCurrentTo:1,histPreviousFrom:3,histPreviousTo:10,rhsMode:'field',rhsField:'rsi',lhsField:'rsi'})])
  assert.match(inspectPatternLogic(x).warnings.join(' '),/running candle 0/)
})
