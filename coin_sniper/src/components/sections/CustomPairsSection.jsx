import React, { useState } from 'react'
import { SectionHeader, SectionCard } from '../UI'
import { TOP_SYMBOLS } from '../../utils/scanner.js'

export default function CustomPairsSection({ cfg, set }) {
  const [input, setInput] = useState('')

  function addPair() {
    const raw = input.trim().toUpperCase()
    if (!raw) return
    const pair = raw.endsWith('USDT') ? raw : `${raw}USDT`
    if (cfg.customPairs.includes(pair)) { setInput(''); return }
    set('customPairs', [...cfg.customPairs, pair])
    setInput('')
  }

  function removePair(p) {
    set('customPairs', cfg.customPairs.filter(x => x !== p))
  }

  function addTop30() {
    const current = new Set(cfg.customPairs)
    const toAdd = TOP_SYMBOLS.slice(0, 30).filter(p => !current.has(p))
    if (toAdd.length === 0) return
    set('customPairs', [...cfg.customPairs, ...toAdd])
  }

  function clearAll() {
    set('customPairs', [])
  }

  const hasAllTop30 = TOP_SYMBOLS.slice(0, 30).every(p => cfg.customPairs.includes(p))

  return (
    <div>
      <SectionHeader title="Custom Pairs" sub="Add trading pairs to scan (USDT auto-appended)" />

      <SectionCard>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <input
            className="field"
            placeholder="BTC / BTCUSDT…"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addPair()}
          />
          <button onClick={addPair} style={{
            padding: '6px 16px', borderRadius: 6, flexShrink: 0,
            border: '1px solid var(--green2)', background: 'var(--green-dim)',
            color: 'var(--green)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}>Add</button>
        </div>

        {/* Quick-add buttons */}
        <div style={{ display:'flex', gap:6, marginBottom:14, flexWrap:'wrap' }}>
          <button
            onClick={addTop30}
            disabled={hasAllTop30}
            style={{
              padding:'5px 12px', borderRadius:6, fontSize:12, fontFamily:'var(--mono)',
              border:'1px solid rgba(0,184,217,0.5)', background:'rgba(0,184,217,0.08)',
              color: hasAllTop30 ? 'var(--text3)' : 'var(--accent)',
              cursor: hasAllTop30 ? 'default' : 'pointer', fontWeight:700, opacity: hasAllTop30 ? 0.5 : 1,
            }}
          >
            ⊞ Add Top 30
          </button>
          {cfg.customPairs.length > 0 && (
            <button
              onClick={clearAll}
              style={{
                padding:'5px 12px', borderRadius:6, fontSize:12, fontFamily:'var(--mono)',
                border:'1px solid rgba(255,71,87,0.4)', background:'var(--red-dim)',
                color:'var(--red)', cursor:'pointer', fontWeight:700,
              }}
            >
              ✕ Clear All
            </button>
          )}
        </div>

        {cfg.customPairs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text3)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            No custom pairs added yet — tap "Add Top 30" to get started
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap:'wrap', gap: 6 }}>
            {cfg.customPairs.map(p => (
              <div key={p} style={{
                display: 'inline-flex', alignItems: 'center', gap:6,
                padding: '5px 10px', borderRadius: 16,
                background: 'var(--bg2)', border: '1px solid var(--border)',
              }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text)', fontWeight: 600 }}>{p.replace('USDT','')}</span>
                <button onClick={() => removePair(p)} style={{
                  width: 16, height: 16, borderRadius: 3, border: 'none',
                  background: 'transparent', color: 'var(--text3)', fontSize: 13,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', padding:0, lineHeight:1,
                }}>×</button>
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>
          {cfg.customPairs.length} pair{cfg.customPairs.length !== 1 ? 's' : ''} · Stored in localStorage
        </div>
      </SectionCard>
    </div>
  )
}
