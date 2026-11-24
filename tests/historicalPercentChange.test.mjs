import test from 'node:test'
import assert from 'node:assert/strict'
import { compilePattern, validateConditionConfig } from '../src/utils/patternEngine.js'

const candles = () => Array.from({length:35},(_,i) => ({
  time:i*900000,open:100,close:100,high:105,low:95,
  rsi:50,ema20:100,volume:1000,adx:20,diPlus:20,diMinus:20,
}))
const rule=(overrides={})=>({
  id:'percent-change-test',enabled:true,lhsField:'rsi',rhsField:'rsi',
  op:'>',rhsMode:'pctdiff',rhsNum:15,histCompare:true,
  histCurrentFrom:0,histCurrentTo:1,
  histPreviousFrom:3,histPreviousTo:10,
  histPreviousMode:'max',histCurrentMatch:'any',
  ...overrides,
})
const passes=(c,values)=>Boolean(compilePattern({side:'bull',enabled:true,tfs:['15m'],conditions:[c]})(values))
test('RSI from historical maximum: 60 against 50 is +20%, passes >15%',()=>{
  const data=candles();data.at(-1).rsi=60
  assert.equal(validateConditionConfig(rule()).valid,true)
  assert.equal(passes(rule(),data),true)
  assert.equal(passes(rule({rhsNum:25}),data),false)
})
test('RSI decline from historical max: 40 against 50 is -20%, passes below -15%',()=>{
  const data=candles();data.at(-1).rsi=40;data.at(-2).rsi=40
  assert.equal(passes(rule({op:'<',rhsNum:-15}),data),true)
  assert.equal(passes(rule({op:'>',rhsNum:0}),data),false)
})
test('ALL recent candles requires both 0 and -1 to clear threshold',()=>{
  const data=candles();data.at(-1).rsi=60;data.at(-2).rsi=51
  assert.equal(passes(rule({histCurrentMatch:'any'}),data),true)
  assert.equal(passes(rule({histCurrentMatch:'all'}),data),false)
})
test('EVERY older candle comparison checks ALL older reference values',()=>{
  const data=candles();data.at(-1).rsi=60;data.at(-2).rsi=60
  data.at(-4).rsi=80
  assert.equal(passes(rule({histPreviousMode:'every'}),data),false)
  assert.equal(passes(rule({histPreviousMode:'min'}),data),true)
})
test('numeric indicators RSI, EMA, price and volume use exactly the same change formula',()=>{
  for (const [lhsField,rhsField,from,to] of [
    ['rsi','rsi',50,60],['ema20','ema20',100,120],
    ['close','close',100,120],['volume','volume',1000,1200],
    ['adx','adx',20,24],['diPlus','diPlus',20,24],
  ]){
    const data=candles()
    for(let i=0;i<10;i++)data[data.length-1-3-i][rhsField]=from
    data.at(-1)[lhsField]=to
    assert.equal(passes(rule({lhsField,rhsField}),data),true,lhsField)
    assert.equal(passes(rule({lhsField,rhsField,rhsNum:25}),data),false,lhsField)
  }
})
test('zero historical reference must not produce divide-by-zero signals',()=>{
  const data=candles()
  for(let i=0;i<10;i++)data[data.length-1-3-i].volume=0
  data.at(-1).volume=500
  assert.equal(passes(rule({lhsField:'volume',rhsField:'volume'}),data),false)
})
test('no direction means no signal even when recent indicator changes',()=>{
  const data=candles();data.at(-1).rsi=80
  assert.equal(validateConditionConfig(rule({op:''})).valid,false)
  assert.equal(passes(rule({op:''}),data),false)
})
