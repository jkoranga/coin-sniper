// ─── Pattern Builder v3 ───────────────────────────────────────────────────────
import React, { useState, useMemo, useRef } from 'react'
import { compilePattern, condFormula, validateConditionConfig } from '../utils/patternEngine.js'
import { mirrorCondition } from '../utils/mirrorPattern.js'
import { explainCondition } from '../utils/conditionExplanation.js'
import { inspectPatternLogic } from '../utils/patternLogicGuide.js'
export { compilePattern, condFormula } from '../utils/patternEngine.js'

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
  { id: 'ema10',     label: 'EMA 10',      short: 'EMA10',   group: 'EMA' },
  { id: 'ema15',     label: 'EMA 15',      short: 'EMA15',   group: 'EMA' },
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
  { id: 'bodyPct',          label: 'Full Body %',              short: 'FullBody%', group: 'Calc', computed: c => c.high !== c.low ? Math.abs(c.close - c.open) / (c.high - c.low) * 100 : 0 },
  { id: 'bodySizePct',      label: 'Body Size %',              short: 'BodySize%', group: 'Calc', computed: c => c.open !== 0 ? Math.abs(c.close - c.open) / Math.abs(c.open) * 100 : null },
  { id: 'range',            label: 'Range H-L',                short: 'Range',     group: 'Calc', computed: c => c.high - c.low },
  { id: 'greenLowerWickPct',label: 'Green Bar Lower Wick %',   short: 'GreenLw%',  group: 'Calc', computed: c => c.close > c.open && c.open !== 0 ? (c.open - c.low) / Math.abs(c.open) * 100 : null },
  { id: 'redLowerWickPct',  label: 'Red Bar Lower Wick %',     short: 'RedLw%',    group: 'Calc', computed: c => c.close < c.open && c.close !== 0 ? (c.close - c.low) / Math.abs(c.close) * 100 : null },
  { id: 'greenUpperWickPct',label: 'Green Bar Upper Wick %',   short: 'GreenUw%', group: 'Calc', computed: c => c.close > c.open && c.open !== 0 ? (c.high - c.close) / Math.abs(c.open) * 100 : null },
  { id: 'redUpperWickPct',  label: 'Red Bar Upper Wick %',     short: 'RedUw%',    group: 'Calc', computed: c => c.close < c.open && c.close !== 0 ? (c.high - c.open) / Math.abs(c.close) * 100 : null },
  { id: 'isGreen',   label: 'Is Green',    short: 'Green?',  group: 'Calc', computed: c => c.close > c.open ? 1 : 0 },
  { id: 'isRed',     label: 'Is Red',      short: 'Red?',    group: 'Calc', computed: c => c.close < c.open ? 1 : 0 },
]
const FIELD_MAP = Object.fromEntries(FIELDS.map(f => [f.id, f]))
const FIELD_GROUPS = FIELDS.reduce((g, f) => { (g[f.group] = g[f.group] || []).push(f); return g }, {})

const OPS = ['>', '>=', '<', '<=', '=', '≠']
const OP_SYM = { '=': '==', '≠': '!=' }

// RHS modes
const RHS_MODES = [
  { id: 'number', label: 'Value' },
  { id: 'field', label: 'Field' },
  { id: 'mult', label: '× Mult' },
  { id: 'pct', label: 'Adjust ± %' },
  { id: 'pctdiff', label: '% Change' },
  { id: 'slope', label: 'Slope %' },
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
const HTF_TF_LIST = ['1m','3m','5m','15m','30m','1h','4h','1d']
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

// Mirror rules live in a pure, regression-testable utility.
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6) }

// ── Formula label ─────────────────────────────────────────────────────────────
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
    // Historical range comparison: current candles vs an older reference window
    histCompare: false,
    histCurrentFrom: 1, histCurrentTo: 2,
    histPreviousFrom: 3, histPreviousTo: 20,
    histCurrentMatch: 'any', histPreviousMode: 'max',
    // HTF: if set, this condition is evaluated on Higher-Timeframe candles instead
    htfTf: null,     // e.g. '1h', '4h', '1d' — null means use current TF candles
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

// ── Compile pattern → logic(candles, htfCandlesMap) ──────────────────────────
// htfCandlesMap: { '1h': [...], '4h': [...], '1d': [...] } — pre-fetched by caller
// ── UI primitives ─────────────────────────────────────────────────────────────
function Pill({ active, color = A, onClick, children, sm }) {
  return (
    <button onClick={onClick} style={{
      padding: sm ? '4px 9px' : '6px 12px',
      borderRadius: 20, cursor: 'pointer',
      fontSize: sm ? 10 : 11, fontFamily: 'var(--mono)', fontWeight: active ? 800 : 500,
      border: `1.5px solid ${active ? color : 'var(--border)'}`,
      background: active ? `${color}1e` : 'transparent',
      color: active ? color : 'var(--text2)',
      boxShadow: active ? `0 0 9px ${color}55, 0 0 18px ${color}22` : 'none',
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

function JoinBadge({ value, onChange, onGroupToggle, onQuickOrGroup, grouped, groupColor }) {
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
        title={grouped ? 'Remove from group' : 'Group these two adjacent conditions'}
        style={{
          padding: '3px 8px', borderRadius: 20, cursor: 'pointer',
          fontSize: 9, fontFamily: 'var(--mono)', fontWeight: 800,
          border: `1.5px solid ${grouped ? groupColor + 'cc' : 'rgba(150,150,150,0.3)'}`,
          background: grouped ? groupColor + '22' : 'transparent',
          color: grouped ? groupColor : 'var(--text3)',
          letterSpacing: '.05em', transition: 'all .15s',
        }}
      >{grouped ? '[ ]' : '( )'}</button>
      {onQuickOrGroup && (
        <button onClick={onQuickOrGroup}
          title="Create OR group: either of these two conditions can pass. Other conditions keep their own AND/OR links."
          aria-label="Make these two conditions an OR group"
          style={{
            padding: '3px 8px', borderRadius: 20, cursor: 'pointer',
            fontSize: 9, fontFamily: 'var(--mono)', fontWeight: 900,
            background: 'rgba(158,220,70,.12)', border: '1px solid rgba(158,220,70,.55)',
            color: '#bbef85', whiteSpace: 'nowrap',
          }}>(OR)</button>
      )}
      <div style={{ flex: 1, height: 1, background: grouped ? `${groupColor}40` : 'var(--border)' }} />
    </div>
  )
}

// ── Condition card ────────────────────────────────────────────────────────────
function CondCard({ cond, idx, total, color, onChange, onRemove, onCopy, onMoveUp, onMoveDown, open, onToggleOpen }) {
  function s(k, v) {
    const next = { ...cond, [k]: v, ...(cond.histCompare && k === 'lhsField' ? {rhsField:v} : {}) }
    // Editing a mirrored condition acknowledges its review flag. The regular
    // condition validator still checks all required fields.
    if (k !== 'enabled' && cond.mirrorReviewReason) delete next.mirrorReviewReason
    onChange(next)
  }
  const isHistCross = cond.histCompare && ['crossUp','crossDown'].includes(cond.op)
  const histStart = cond.histPreviousFrom ?? 3, histEnd = cond.histPreviousTo ?? 20
  const histMid = histStart + Math.ceil((histEnd-histStart+1)/2)-1
  const candleIndexLabel = n => Number(n) === 0 ? '0 · running' : String(-Number(n))
  const formula = condFormula(cond)
  const validation = validateConditionConfig(cond)
  const ready = cond.enabled && validation.valid && !cond.mirrorReviewReason
  const statusColor = ready ? '#19bb72' : '#ef646a'
  const statusBackground = ready ? 'rgba(25,187,114,0.09)' : 'rgba(239,100,106,0.10)'
  const statusBorder = ready ? 'rgba(25,187,114,0.50)' : 'rgba(239,100,106,0.55)'
  const statusText = !cond.enabled ? 'OFF · NOT SCANNING' : validation.valid ? 'READY · VALID LOGIC' : 'FIX REQUIRED'
  const statusReason = cond.mirrorReviewReason
    ? `Mirror review: ${cond.mirrorReviewReason}`
    : (!cond.enabled ? 'This condition is OFF and will not be scanned.' : validation.reason)
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <div style={{
      borderRadius: 10,
      border: `1.5px solid ${statusBorder}`,
      background: statusBackground,
      boxShadow: ready ? 'inset 0 0 0 1px rgba(25,187,114,.05)' : 'inset 0 0 0 1px rgba(239,100,106,.05)',
      transition: 'background .18s, border-color .18s',
      overflow: 'hidden',
    }}>
      {/* Topbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '7px 9px', background: ready ? 'rgba(25,187,114,.05)' : 'rgba(239,100,106,.06)',
      }}>
        {/* Enable / Disable toggle button */}
        <button
          onClick={() => {
            if (cond.mirrorReviewReason && !cond.enabled) {
              if (!window.confirm(`Mirror requires manual verification: ${cond.mirrorReviewReason}\n\nHave you reviewed the formula and want to enable this condition?`)) return
              const verified = { ...cond, enabled: true }
              delete verified.mirrorReviewReason
              onChange(verified)
            } else {
              s('enabled', !cond.enabled)
            }
          }}
          title={cond.mirrorReviewReason ? 'Review before enabling mirror' : cond.enabled ? 'Disable condition' : 'Enable condition'}
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
          fontSize: 11, color: ready ? 'var(--text)' : '#ff999e',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          cursor: 'pointer',
        }}>
          {formula}
        </div>
        <span title={statusReason} style={{
          padding: '3px 6px', flexShrink: 0,
          borderRadius: 5, background: ready ? 'rgba(25,187,114,.16)' : 'rgba(239,100,106,.16)',
          border: `1px solid ${statusBorder}`, color: statusColor,
          fontSize: 9, fontFamily: 'var(--mono)', fontWeight: 800, letterSpacing: '.02em',
        }}>{ready ? '✓ READY' : '⚠ CHECK'}</span>

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

      {/* A collapsed condition still shows its readiness and reason. */}
      <div role="status" style={{
        fontSize: 10, lineHeight: 1.5, padding: '5px 10px 7px',
        borderTop: `1px solid ${statusBorder}`,
        color: ready ? '#58dba2' : '#ffa1a5',
        overflowWrap: 'anywhere',
      }}>
        <b>{statusText}</b> · {statusReason}
      </div>

      {/* Body */}
      {open && (
        <div style={{ padding: '8px 9px 10px', display: 'flex', flexDirection: 'column', gap: 7 }}>

          {/* ── HTF TIMEFRAME SELECTOR (per condition) ─────────────────────── */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '7px 10px', borderRadius: 8,
            background: cond.htfTf ? 'rgba(179,136,255,0.10)' : 'rgba(0,0,0,0.12)',
            border: `1px solid ${cond.htfTf ? 'rgba(179,136,255,0.40)' : 'var(--border)'}`,
            transition: 'all .15s',
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: cond.htfTf ? 'rgba(179,136,255,1)' : 'var(--text2)', marginBottom: 4 }}>
                Condition Timeframe {cond.htfTf ? `· ${cond.htfTf.toUpperCase()}` : ''}
              </div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {/* "OFF" pill = null */}
                {[null, ...HTF_TF_LIST].map(tf => (
                  <div key={tf ?? 'off'}
                    onClick={() => s('htfTf', cond.htfTf === tf ? null : tf)}
                    style={{
                      padding: '2px 8px', borderRadius: 5, fontSize: 10,
                      fontFamily: 'var(--mono)', fontWeight: 700, cursor: 'pointer',
                      background: cond.htfTf === tf
                        ? (tf ? 'rgba(179,136,255,0.25)' : 'rgba(255,255,255,0.08)')
                        : 'transparent',
                      color: cond.htfTf === tf
                        ? (tf ? 'rgba(179,136,255,1)' : 'var(--text)')
                        : 'var(--text3)',
                      border: `1px solid ${cond.htfTf === tf
                        ? (tf ? 'rgba(179,136,255,0.5)' : 'var(--border)')
                        : 'transparent'}`,
                      boxShadow: tf && cond.htfTf === tf ? '0 0 10px rgba(179,136,255,.47)' : 'none',
                      transition: 'all .12s',
                    }}>
                    {tf ?? 'off'}
                  </div>
                ))}
              </div>

            </div>
          </div>

          {/* One consistent range-mode selector. Stored flags remain backward compatible. */}
          <div style={{
            padding: '9px 10px', borderRadius: 9,
            background: cond.rangeCheck || cond.histCompare ? 'rgba(0,230,118,.065)' : 'var(--bg2)',
            border: `1px solid ${cond.rangeCheck || cond.histCompare ? 'rgba(0,230,118,.42)' : 'var(--border)'}`,
          }}>
            <Lbl>RANGE COMPARISON</Lbl>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[
                ['single', 'Single Candle'],
                ['multi', 'Multi-Candle'],
                ['hist', 'Historical'],
              ].map(([mode, label]) => {
                const selected = mode === 'hist' ? cond.histCompare : mode === 'multi' ? cond.rangeCheck && !cond.histCompare : !cond.rangeCheck && !cond.histCompare
                return (
                  <button key={mode} type="button"
                    onClick={() => {
                      if (selected) return
                      const historical = mode === 'hist'
                      const multi = mode === 'multi'
                      onChange({
                        ...cond, histCompare: historical, rangeCheck: multi,
                        op: historical || ['crossUp','crossDown','% Diff'].includes(cond.op) ? '' : cond.op,
                        ...(historical ? {rhsMode: 'field', rhsField: cond.rhsField || cond.lhsField} : {}),
                      })
                    }}
                    aria-pressed={!!selected}
                    style={{
                      padding: '6px 10px', borderRadius: 7, cursor: 'pointer', fontSize: 10,
                      fontFamily: 'var(--mono)', fontWeight: selected ? 900 : 650,
                      background: selected ? 'rgba(0,230,118,.18)' : 'var(--bg3)',
                      border: `1px solid ${selected ? '#00e676' : 'var(--border)'}`,
                      color: selected ? '#7dffb2' : 'var(--text2)',
                      boxShadow: selected ? '0 0 12px rgba(0,230,118,.40), inset 0 0 7px rgba(0,230,118,.10)' : 'none',
                      transition: 'background .15s, box-shadow .15s',
                    }}
                  >{label}</button>
                )
              })}
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


          {cond.histCompare && (
            <div style={{
              padding: 10, borderRadius: 8,
              background: 'rgba(0,230,118,.05)',
              border: '1px solid rgba(0,230,118,.25)',
              display: 'flex', flexDirection: 'column', gap: 9,
            }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text2)', letterSpacing: '.04em' }}>1 · RECENT RANGE</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <Lbl>RECENT FROM</Lbl>
                  <select value={cond.histCurrentFrom ?? 1} onChange={e => { const v=+e.target.value; const ct = Math.max(v, cond.histCurrentTo ?? 2); const pf = Math.max(ct + 1, cond.histPreviousFrom ?? 3); onChange({ ...cond, histCurrentFrom: v, histCurrentTo: ct, histPreviousFrom: pf, histPreviousTo: Math.max(pf, cond.histPreviousTo ?? 20) }) }} style={{ width: '100%', padding: 7, borderRadius: 7, background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border)' }}>
                    {Array.from({length:19},(_,i)=>i).map(v=><option key={v} value={v}>{candleIndexLabel(v)}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <Lbl>RECENT TO</Lbl>
                  <select value={cond.histCurrentTo ?? 2} onChange={e => { const v=+e.target.value; onChange({ ...cond, histCurrentTo: v, histPreviousFrom: Math.max(v + 1, cond.histPreviousFrom ?? 3), histPreviousTo: Math.max(v + 2, cond.histPreviousTo ?? 20) }) }} style={{ width: '100%', padding: 7, borderRadius: 7, background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border)' }}>
                    {Array.from({length:19},(_,i)=>i).filter(v=>v>=(cond.histCurrentFrom ?? 1)).map(v=><option key={v} value={v}>{candleIndexLabel(v)}</option>)}
                  </select>
                </div>
              </div>
              {!isHistCross && (
              <div>
                <Lbl>CURRENT RANGE MATCH</Lbl>

                <div style={{ display: 'flex', gap: 6 }}>
                  {[['any','ANY current candle'],['all','ALL current candles']].map(([v,l])=><Pill key={v} active={(cond.histCurrentMatch ?? 'any')===v} color="#00e676" onClick={()=>s('histCurrentMatch',v)}>{l}</Pill>)}
                </div>
              </div>
              )}
            </div>
          )}

          {/* LEFT SIDE — show candle offset only when range is OFF */}
          <div style={{ padding: '7px 8px', borderRadius: 7, background: 'rgba(0,0,0,0.18)' }}>
            <Lbl>{cond.histCompare ? '2 · RECENT INDICATOR' : 'LEFT — candle field'}</Lbl>
            <FSelect
              value={cond.lhsField} offset={(cond.rangeCheck || cond.histCompare) ? 0 : cond.lhsOffset}
              onField={v => s('lhsField', v)} onOffset={(cond.rangeCheck || cond.histCompare) ? null : v => s('lhsOffset', v)}
              color={color} hideOffset={!!(cond.rangeCheck || cond.histCompare)}
            />
          </div>

          {/* Operator is always placed BETWEEN recent and previous values. */}
          <div style={{ padding: '8px 9px', borderRadius: 8, border: `1px solid ${cond.histCompare && !cond.op ? 'rgba(239,100,106,.48)' : 'var(--border)'}` }}>
            <Lbl>{cond.histCompare ? '3 · COMPARISON OPERATOR' : 'OPERATOR'}</Lbl>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {(cond.histCompare ? [...OPS, 'crossUp', 'crossDown'] : OPS).map(op => (
                <Pill key={op} active={cond.op === op}
                  color={op === 'crossDown' ? '#f87171' : color}
                  onClick={() => ['crossUp','crossDown'].includes(op)
                    ? onChange({ ...cond, op, rhsMode:'field', histPreviousTo: Math.max(histStart + 1, histEnd) })
                    : s('op', op)}>
                  {cond.histCompare ? ({'>':'Above (>)','>=':'At/above (≥)','<':'Below (<)','<=':'At/below (≤)','=':'Equal (=)','≠':'Not equal (≠)',crossUp:'Cross Up',crossDown:'Cross Down'})[op] : op}
                </Pill>
              ))}
              {cond.op && <button type="button" onClick={() => s('op','')}
                style={{fontSize:10,padding:'5px 8px',borderRadius:7,border:'1px solid var(--border)',color:'var(--text2)',background:'transparent',cursor:'pointer'}}>Clear</button>}
            </div>
            {cond.histCompare && !cond.op && (
              <div role="status" style={{color:'#ffa1a7',fontSize:10,marginTop:6}}>⚠ Select an operator to enable this condition.</div>
            )}
          </div>

          {cond.histCompare && (
            <div style={{
              padding: 10, borderRadius: 8,
              background:'rgba(0,230,118,.05)',border:'1px solid rgba(0,230,118,.25)',
              display:'flex',flexDirection:'column',gap:9,
            }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text2)', letterSpacing: '.04em' }}>4 · PREVIOUS RANGE</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <Lbl>OLDER FROM</Lbl>
                  <select value={cond.histPreviousFrom ?? 3} onChange={e => { const v=+e.target.value; onChange({ ...cond, histPreviousFrom: v, histPreviousTo: Math.max(v, cond.histPreviousTo ?? 20) }) }} style={{ width: '100%', padding: 7, borderRadius: 7, background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border)' }}>
                    {Array.from({length:19},(_,i)=>i+1).filter(v=>v>(cond.histCurrentTo ?? 2)).map(v=><option key={v} value={v}>{candleIndexLabel(v)}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <Lbl>OLDER TO</Lbl>
                  <select value={cond.histPreviousTo ?? 20} onChange={e => s('histPreviousTo', +e.target.value)} style={{ width: '100%', padding: 7, borderRadius: 7, background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border)' }}>
                    {Array.from({length:20},(_,i)=>i+1).filter(v=>v>=(cond.histPreviousFrom ?? 3)).map(v=><option key={v} value={v}>{candleIndexLabel(v)}</option>)}
                  </select>
                </div>
              </div>
              {isHistCross ? <div style={{fontSize:11,color:'var(--text2)',lineHeight:1.6}}>{histEnd <= histStart ? 'Select at least two historical candles.' : `Auto split: B ${candleIndexLabel(histStart)} to ${candleIndexLabel(histMid)} · C ${candleIndexLabel(histMid+1)} to ${candleIndexLabel(histEnd)}`}<div>{cond.op === 'crossUp' ? 'Start below both levels; finish above both.' : 'Start above both levels; finish below both.'}</div><div>{cond.lhsField === 'close' ? 'Uses current range minimum/maximum Open and latest selected Close.' : 'Uses oldest and newest selected indicator values.'}</div></div> : <>
              <div>
                <Lbl>PREVIOUS RANGE COMPARE</Lbl>

                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {[['every','Every candle'],['max','Maximum'],['min','Minimum'],['avg','Average']].map(([v,l])=><Pill key={v} sm active={(cond.histPreviousMode ?? 'max')===v} color="#00e676" onClick={()=>s('histPreviousMode',v)}>{l}</Pill>)}
                </div>
              </div>
              </>}
            </div>
          )}

          <div style={{ padding: '7px 8px', borderRadius: 7, background: 'rgba(0,0,0,0.18)' }}>
            <Lbl>{cond.histCompare ? '5 · PREVIOUS INDICATOR / VALUE' : 'RIGHT — compare to'}</Lbl>

            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 9 }}>
              {(isHistCross ? RHS_MODES.filter(m=>m.id==='field') : RHS_MODES).map(m => (
                <Pill key={m.id} active={(cond.rhsMode ?? (cond.histCompare ? 'field' : 'number')) === m.id} color={color}
                  onClick={() => s('rhsMode', m.id)} sm>{m.label}</Pill>
              ))}
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
            {(cond.rhsMode ?? (cond.histCompare ? 'field' : 'number')) === 'number' && (
              <NInput value={cond.rhsNum} onChange={v => s('rhsNum', v)} />
            )}

            {(cond.rhsMode ?? (cond.histCompare ? 'field' : 'number')) === 'field' && (
              <FSelect
                value={cond.rhsField || (cond.histCompare ? cond.lhsField : 'ema20')} offset={cond.histCompare ? 0 : (cond.rhsOffset ?? 0)}
                onField={v => s('rhsField', v)} onOffset={cond.histCompare ? null : v => s('rhsOffset', v)}
                color={color} hideOffset={!!(cond.rangeCheck || cond.histCompare)}
              />
            )}

            {(cond.rhsMode ?? (cond.histCompare ? 'field' : 'number')) === 'mult' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <FSelect
                  value={cond.rhsField || (cond.histCompare ? cond.lhsField : 'ema20')} offset={cond.histCompare ? 0 : (cond.rhsOffset ?? 0)}
                  onField={v => s('rhsField', v)} onOffset={cond.histCompare ? null : v => s('rhsOffset', v)}
                  color={color} hideOffset={!!(cond.rangeCheck || cond.histCompare)}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ fontFamily:'var(--mono)', color:'var(--text3)', fontSize:13 }}>×</span>
                  <NInput value={cond.rhsMult ?? 1} onChange={v => s('rhsMult', v)} step="0.0001" />
                </div>
              </div>
            )}

            {(cond.rhsMode ?? (cond.histCompare ? 'field' : 'number')) === 'pct' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <FSelect
                  value={cond.rhsField || (cond.histCompare ? cond.lhsField : 'ema20')} offset={cond.histCompare ? 0 : (cond.rhsOffset ?? 0)}
                  onField={v => s('rhsField', v)} onOffset={cond.histCompare ? null : v => s('rhsOffset', v)}
                  color={color} hideOffset={!!(cond.rangeCheck || cond.histCompare)}
                />
                <NInput value={cond.rhsPct ?? 0} onChange={v => s('rhsPct', v)} step="0.01" suffix="%" />
              </div>
            )}

            {(cond.rhsMode ?? (cond.histCompare ? 'field' : 'number')) === 'pctdiff' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <FSelect
                  value={cond.rhsField || (cond.histCompare ? cond.lhsField : 'ema20')} offset={cond.histCompare ? 0 : (cond.rhsOffset ?? 0)}
                  onField={v => s('rhsField', v)} onOffset={cond.histCompare ? null : v => s('rhsOffset', v)}
                  color={color} hideOffset={!!(cond.rangeCheck || cond.histCompare)}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize:11, fontFamily:'var(--mono)', color:'var(--text3)' }}>{cond.op}</span>
                  <NInput value={cond.rhsNum ?? 0} onChange={v => s('rhsNum', v)} step="0.01" suffix="%" />
                </div>
              </div>
            )}


            {(cond.rhsMode ?? (cond.histCompare ? 'field' : 'number')) === 'slope' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
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

              </div>
            )}
          </div>


          {/* One live formula, with an explicit incomplete state. */}
          <div style={{
            fontSize: 11, fontFamily: 'var(--mono)', lineHeight: 1.65,
            color: cond.histCompare && !cond.op ? '#ffc46b' : color,
            padding: '10px 11px', borderRadius: 8, overflowWrap: 'anywhere',
            background: cond.histCompare && !cond.op ? 'rgba(255,196,107,.06)' : `${color}10`,
            border: `1px solid ${cond.histCompare && !cond.op ? 'rgba(255,196,107,.4)' : color + '30'}`,
          }}>
            <div style={{ fontSize: 9, color: 'var(--text2)', marginBottom: 5 }}>LIVE CONDITION PREVIEW</div>
            {cond.histCompare && !cond.op ? '⚠ Choose direction:  ' : '→ '}{formula}
            {!validation.valid && (
              <div role="alert" style={{
                color: '#ffa1a7', fontFamily: 'inherit', fontSize: 10,
                lineHeight: 1.55, marginTop: 6,
              }}>⚠ {validation.reason}</div>
            )}
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

// ── Normalize a pattern loaded from storage — stamps missing fields onto conditions
// so old saved patterns work correctly with all current features (id, htfTf, etc.)
function normalizePattern(p) {
  if (!p) return p
  return {
    ...p,
    conditions: (p.conditions || []).map(c => ({
      htfTf: null,          // default — overridden if already set
      rangeCheck: false,    // default
      rangeMode: 'all',     // default
      ...c,
      id: c.id || uid(),    // stamp missing id last so existing id wins
    })),
  }
}

// ── Pattern editor ────────────────────────────────────────────────────────────
function PatternEditor({ pattern: rawPattern, onChange, onDelete, onMirrorPattern, onCopyPattern, onCopyToTimeframe, defaultOpen, allPatternNames, onOpenChange, outerStyle }) {
  // Stamp missing fields (id, htfTf, etc.) onto conditions from old saved patterns
  const pattern = React.useMemo(() => normalizePattern(rawPattern), [rawPattern])
  function wrappedOnChange(updated) { onChange(normalizePattern(updated)) }
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
  const [previewPopup, setPreviewPopup] = useState(false)
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

  function s(k, v) { wrappedOnChange({ ...pattern, [k]: v }) }
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
  const logicGuide = inspectPatternLogic(pattern)
  // Expand symbolic C1/C2 references only for display. Keep the underlying
  // AND/OR grouping and saved pattern logic entirely unchanged.
  const readableLogic = logicGuide.expression.replace(/\bC(\d+)\b/g, (label, number) => {
    const condition = pattern.conditions[Number(number) - 1]
    return condition ? `[${condFormula(condition)}]` : label
  })

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
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            width: 'min(320px,88vw)', zIndex: 1000,
            borderRadius: 14, padding: '20px 18px',
            background: 'var(--bg1)',
            border: `1.5px solid ${BLU}`,
            boxShadow: `0 20px 60px rgba(0,0,0,0.8), 0 0 20px ${BLU}30`,
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
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            width: 'min(320px,88vw)', zIndex: 1000,
            borderRadius: 14, padding: '20px 18px',
            background: 'var(--bg1)',
            border: '2px solid rgba(255,200,0,0.7)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.8), 0 0 20px rgba(255,200,0,0.2)',
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
            position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(4px)',
          }} />
          <div style={{
            position: 'fixed',
            top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 1000,
            width: 'min(320px, 88vw)',
            borderRadius: 16, padding: '24px 18px',
            background: 'var(--bg1)',
            border: '2px solid rgba(255,200,0,0.7)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.8), 0 0 24px rgba(255,200,0,0.2)',
          }}>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>🔒</div>
              <div style={{ fontWeight: 900, fontSize: 15, color: 'rgb(255,200,0)' }}>Pattern Locked</div>
              <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)', marginTop: 8, lineHeight: 1.7 }}>
                <b style={{ color: color }}>{pattern.name}</b> is locked.<br/>
                Unlocking allows editing all conditions and settings.
              </div>
            </div>
            <div style={{ height: 1, background: 'rgba(255,200,0,0.2)', marginBottom: 16 }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => { s('locked', false); setLockPopup(false); setOpen(true) }}
                style={{
                  flex: 1, padding: '12px', borderRadius: 10, cursor: 'pointer',
                  fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 13,
                  border: '2px solid rgba(255,200,0,0.7)',
                  background: 'rgba(255,200,0,0.15)', color: 'rgb(255,200,0)',
                }}
              >🔓 Unlock & Edit</button>
              <button
                onClick={() => setLockPopup(false)}
                style={{
                  padding: '12px 16px', borderRadius: 10, cursor: 'pointer',
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

      {/* Action bar — mirror / copy / 👁 preview / delete */}
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

          {/* Compact copy menu: keeps both copy actions beside Mirror on mobile */}
          <select
            defaultValue=""
            aria-label="Copy options"
            title="Copy pattern"
            onChange={e => {
              const action = e.target.value
              e.target.value = ''
              if (action === 'copy') setCopyPopup(true)
              if (action === 'tf') onCopyToTimeframe?.(pattern)
            }}
            style={{
              maxWidth: 112, minWidth: 88, padding: '5px 6px', borderRadius: 7,
              cursor: 'pointer', border: '1px solid rgba(255,200,0,0.35)',
              background: 'rgba(255,200,0,0.08)', color: 'rgb(255,200,0)',
              fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700,
            }}
          >
            <option value="" disabled>⧉ Copy ▾</option>
            <option value="copy">Copy Pattern</option>
            <option value="tf">Copy to Another TF</option>
          </select>

          {/* 👁 Preview conditions */}
          <button onClick={() => setPreviewPopup(true)} title="Preview all conditions" style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '4px 10px', borderRadius: 7, cursor: 'pointer',
            border: `1px solid ${color}55`, background: `${color}10`,
            color: color, fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 700,
          }}>👁 View</button>

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

      {/* 👁 Preview popup — fixed centered modal */}
      {previewPopup && (
        <>
          <div onClick={() => setPreviewPopup(false)} style={{
            position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(5px)',
          }} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 1000, width: 'min(360px, 94vw)',
            maxHeight: '80vh', display: 'flex', flexDirection: 'column',
            borderRadius: 16, overflow: 'hidden',
            border: `2px solid ${color}99`,
            boxShadow: `0 24px 60px rgba(0,0,0,0.85), 0 0 24px ${color}33`,
            background: 'var(--bg1)',
          }}>
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px',
              borderBottom: `1px solid ${color}30`,
              background: `${color}08`, flexShrink: 0,
            }}>
              <span style={{ fontSize: 22, flexShrink: 0 }}>{pattern.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 900, fontSize: 15, color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {pattern.name}
                </div>
                <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', marginTop: 2 }}>
                  {pattern.side.toUpperCase()} · {pattern.tfs.join(' ') || 'no TF'}
                  {' · '}{pattern.conditions.filter(c => c.enabled).length} conditions
                </div>
              </div>
              <button onClick={() => setPreviewPopup(false)} style={{
                width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                background: 'var(--bg3)', border: '1px solid var(--border)',
                color: 'var(--text3)', fontSize: 18, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>✕</button>
            </div>

            {/* Conditions list */}
            <div style={{ overflow: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <div style={{
                padding: '9px 13px', fontSize: 10, lineHeight: 1.6,
                background: logicGuide.ready ? 'rgba(158,220,70,.07)' : 'rgba(239,100,106,.1)',
                color: logicGuide.ready ? '#b5ed83' : '#ffb2b8',
                borderBottom: '1px solid var(--border)', overflowWrap: 'anywhere',
              }}>
                <b>{logicGuide.ready ? '✓ LOGIC READY' : '⚠ CHECK CONFIGURATION'}</b>
                <div style={{ marginTop: 3, fontFamily: 'var(--mono)', overflowWrap: 'anywhere' }}>{readableLogic}</div>
                {logicGuide.errors.map((msg,i) => <div key={i}>⚠ {msg}</div>)}
                {logicGuide.ungroupedOr && <div style={{ color: '#ffc46b', marginTop: 3 }}>! Outside-group OR can bypass earlier AND conditions.</div>}
              </div>
              {pattern.conditions.filter(c => c.enabled).length === 0 ? (
                <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>
                  No enabled conditions.
                </div>
              ) : pattern.conditions.filter(c => c.enabled).map((c, i, arr) => {
                const formula = condFormula(c)
                const joinNext = i < arr.length - 1 ? (c.joinNext || 'AND') : null
                const isGroup  = c.groupStart || c.groupEnd
                return (
                  <div key={c.id || i}>
                    {/* Group open bracket */}
                    {c.groupStart && (
                      <div style={{ padding: '4px 16px 0', fontSize: 10, fontFamily: 'var(--mono)', color: `${color}88` }}>
                        {'( group'}
                      </div>
                    )}

                    {/* Condition row */}
                    <div style={{
                      display: 'flex', alignItems: 'flex-start', gap: 10,
                      padding: '10px 16px',
                      background: i % 2 === 0 ? 'rgba(0,0,0,0.1)' : 'transparent',
                      borderBottom: `1px solid ${color}12`,
                    }}>
                      {/* Number badge */}
                      <div style={{
                        width: 22, height: 22, borderRadius: 6, flexShrink: 0, marginTop: 1,
                        background: `${color}18`, border: `1.5px solid ${color}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, fontWeight: 900, color, fontFamily: 'var(--mono)',
                      }}>{i + 1}</div>

                      {/* Formula */}
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--text)', lineHeight: 1.5, wordBreak: 'break-all' }}>
                          {formula}
                        </div>
                        {/* Extra details */}
                        {c.slopeBack > 1 && (
                          <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', marginTop: 2 }}>
                            slope look-back: {c.slopeBack} · skip: {c.slopeSkip || 0}
                          </div>
                        )}
                        {c.rangeLen > 1 && (
                          <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', marginTop: 2 }}>
                            range: {c.rangeMode || 'ALL'} of last {c.rangeLen} candles
                          </div>
                        )}
                        {c.label && (
                          <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: `${color}88`, marginTop: 2 }}>
                            {c.label}
                          </div>
                        )}
                      </div>

                      {/* Check */}
                      <span style={{ color, fontSize: 16, flexShrink: 0, textShadow: `0 0 8px ${color}` }}>✓</span>
                    </div>

                    {/* Group close bracket */}
                    {c.groupEnd && (
                      <div style={{ padding: '0 16px 4px', fontSize: 10, fontFamily: 'var(--mono)', color: `${color}88` }}>
                        {'group )'}
                      </div>
                    )}

                    {/* AND / OR connector */}
                    {joinNext && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3px 0' }}>
                        <span style={{
                          fontSize: 9, fontFamily: 'var(--mono)', fontWeight: 900,
                          padding: '2px 10px', borderRadius: 5,
                          color: joinNext === 'OR' ? '#ff9800' : color,
                          background: joinNext === 'OR' ? 'rgba(255,152,0,0.12)' : `${color}12`,
                          border: `1px solid ${joinNext === 'OR' ? 'rgba(255,152,0,0.35)' : color + '35'}`,
                          letterSpacing: '.08em',
                        }}>{joinNext}</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Footer */}
            <div style={{ padding: '10px 16px', borderTop: `1px solid ${color}20`, flexShrink: 0, background: 'rgba(0,0,0,0.12)' }}>
              <button onClick={() => setPreviewPopup(false)} style={{
                width: '100%', padding: '11px', borderRadius: 10, cursor: 'pointer',
                border: `1px solid ${color}55`, background: `${color}10`,
                color, fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 13,
              }}>Close</button>
            </div>
          </div>
        </>
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
            {pattern.conditions.some(c => c.mirrorReviewReason) && (
              <div role="alert" style={{
                border: '1px solid rgba(255,120,120,.55)', background: 'rgba(255,75,85,.1)',
                color: '#ffb5b5', padding: '9px 11px', borderRadius: 8,
                fontSize: 11, lineHeight: 1.65, marginBottom: 10,
              }}>
                ⚠ Mirror review required. {pattern.conditions.filter(c => c.mirrorReviewReason).length} condition(s)
                were left OFF because their formula cannot be mirrored exactly.
                Review each red condition, confirm its values, then turn the pattern ON.
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Lbl>CONDITIONS</Lbl>
              <span style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>
                {active} active
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
                          onQuickOrGroup={!gid && !nextCond.groupId ? () => {
                            const conditions = [...pattern.conditions]
                            const groupId = `grp_${uid()}`
                            conditions[idx] = { ...conditions[idx], groupId, joinNext: 'OR' }
                            conditions[idx + 1] = { ...conditions[idx + 1], groupId }
                            s('conditions', conditions)
                          } : null}
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

            {/* Same card shape as a condition, with a distinct cyan creation state. */}
            <button
              type="button"
              aria-label="Add a new condition"
              onClick={() => {
                const nc = blankCond()
                s('conditions', [...pattern.conditions, nc])
                setOpenCondIds(prev => new Set([...prev, nc.id]))
              }}
              style={{
                marginTop: 9, width: '100%', minHeight: 52, padding: '8px 11px',
                display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                borderRadius: 10, cursor: 'pointer',
                border: '1.5px dashed rgba(56,189,248,.65)',
                background: 'rgba(56,189,248,.075)', color: '#8dddff',
                boxShadow: 'inset 0 0 0 1px rgba(56,189,248,.035)',
                transition: 'background .15s, border-color .15s, box-shadow .15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(56,189,248,.15)'
                e.currentTarget.style.boxShadow = '0 0 14px rgba(56,189,248,.18)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(56,189,248,.075)'
                e.currentTarget.style.boxShadow = 'inset 0 0 0 1px rgba(56,189,248,.035)'
              }}
            >
              <span aria-hidden="true" style={{
                width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                border: '1px solid rgba(56,189,248,.55)',
                background: 'rgba(56,189,248,.13)', color: '#8dddff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22, lineHeight: 1, fontWeight: 500,
              }}>+</span>
              <span style={{flex: 1, minWidth: 0}}>
                <span style={{
                  display: 'block', fontFamily: 'var(--mono)',
                  fontSize: 12, fontWeight: 850, letterSpacing: '.01em',
                }}>Add Condition</span>
                <span style={{
                  display: 'block', marginTop: 3, fontSize: 10,
                  color: 'var(--text2)', lineHeight: 1.3,
                }}>Create another condition</span>
              </span>
              <span aria-hidden="true" style={{
                flexShrink: 0, padding: '3px 7px', borderRadius: 5,
                border: '1px solid rgba(56,189,248,.30)',
                color: '#82cfff', fontFamily: 'var(--mono)', fontWeight: 800,
                fontSize: 9,
              }}>NEW</span>
            </button>
          </div>
            {/* Final full-pattern logic review — displayed after the last condition. */}
            <div role="status" style={{
              padding: '12px 11px', borderRadius: 9, marginTop: 13,
              background: logicGuide.ready ? 'rgba(158,220,70,.07)' : 'rgba(239,100,106,.10)',
              border: `1px solid ${logicGuide.ready ? 'rgba(158,220,70,.35)' : 'rgba(239,100,106,.5)'}`,
              color: 'var(--text)', lineHeight: 1.65, overflowWrap: 'anywhere',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '.04em', color: 'var(--text2)' }}>FINAL PATTERN LOGIC</span>
                <span style={{ fontSize: 9, fontWeight: 900, color: logicGuide.ready ? '#a7e86e' : '#ffa0a5' }}>
                  {logicGuide.ready ? '✓ LOGIC READY' : '⚠ NEEDS FIX'} · {logicGuide.active} ON
                </span>
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 11, lineHeight: 1.85, wordBreak: 'break-word', color: logicGuide.ready ? '#bdf099' : '#ffc3c4' }}>
                {readableLogic}
              </div>
              {pattern.conditions.some(cond => cond.enabled) && (
                <div style={{ borderTop: '1px solid var(--border)', marginTop: 9, paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {pattern.conditions.map((cond, i) => {
                    if (!cond.enabled) return null
                    const explanation = explainCondition(cond)
                    const calculation = explanation.steps.find(step => step.label === 'Calculation')?.text
                    return (
                      <div key={cond.id || i} style={{ fontSize: 10, color: 'var(--text2)', lineHeight: 1.65, overflowWrap: 'anywhere' }}>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 800, color: '#a3e9c7' }}>
                          {condFormula(cond)}
                        </div>
                        <div style={{ marginTop: 3 }}>{explanation.summary}</div>
                        {calculation && <div style={{ marginTop: 2, color: 'var(--text3)' }}>{calculation}</div>}
                      </div>
                    )
                  })}
                </div>
              )}
              {logicGuide.errors.map((message, i) => (
                <div key={`error-${i}`} style={{ fontSize: 10, color: '#ffa1a7', marginTop: 6 }}>
                  ⚠ {message}
                </div>
              ))}
              {logicGuide.warnings.filter(msg => !msg.startsWith('Grouped OR is correctly')).slice(0, 2).map((message, i) => (
                <div key={`warning-${i}`} style={{ fontSize: 10, color: '#ffc46b', marginTop: 6 }}>
                  ! {message}
                </div>
              ))}
              {logicGuide.warnings.filter(msg => !msg.startsWith('Grouped OR is correctly')).length > 2 && (
                <details style={{ marginTop: 5, fontSize: 10, color: '#ffc46b' }}>
                  <summary style={{ cursor: 'pointer' }}>More logic warnings</summary>
                  {logicGuide.warnings.filter(msg => !msg.startsWith('Grouped OR is correctly')).slice(2).map((msg, i) => <div key={i}>! {msg}</div>)}
                </details>
              )}
            </div>
        </div>
      )}
    </div>
    </div>
  )
}

// ── Main tab ──────────────────────────────────────────────────────────────────
export default function PatternBuilderTab({ settings, update, createPatternRequest, onCreatePatternRequestHandled }) {
  const patterns = useMemo(() => settings.customPatterns || [], [settings.customPatterns])
  const trash    = useMemo(() => settings.deletedPatterns || [], [settings.deletedPatterns])
  const [newId, setNewId] = useState(null)
  const [openPatternId, setOpenPatternId] = useState(null)
  const [trashOpen, setTrashOpen] = useState(false)
  const [confirmPurgeId, setConfirmPurgeId] = useState(null)
  const [confirmPurgeAll, setConfirmPurgeAll] = useState(false)
  const [purgeAllChecked, setPurgeAllChecked] = useState(false)
  const [tfCopyOpen, setTfCopyOpen] = useState(false)
  const [tfCopySourceId, setTfCopySourceId] = useState('')
  const [tfCopySourceTf, setTfCopySourceTf] = useState('')
  const [tfCopyTargetTf, setTfCopyTargetTf] = useState('15m')
  const [tfCopyName, setTfCopyName] = useState('')
  const [tfCopyError, setTfCopyError] = useState('')

  // Keep a ref to patterns so debounced save always uses the latest version
  const patternsRef = useRef(patterns)
  patternsRef.current = patterns
  const handledCreateRequestRef = useRef(null)

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

  // The Add Pattern action inside an empty timeframe's warning card creates
  // a NEW pattern for that exact timeframe and opens it for editing.
  React.useEffect(() => {
    const req = createPatternRequest
    if (!req || handledCreateRequestRef.current === req.id) return
    handledCreateRequestRef.current = req.id
    const tf = TF_LIST.includes(req.timeframe) ? req.timeframe : '15m'
    const p = blankPattern()
    const baseName = `My ${tf} Pattern`
    const names = new Set(patternsRef.current.map(item => item.name?.toLowerCase()))
    let name = baseName
    for (let count = 2; names.has(name.toLowerCase()); count++) name = `${baseName} ${count}`
    p.name = name
    p.tfs = [tf]
    // A new condition must be set deliberately, not accidentally emit signals
    // using the starter EMA example before the user finishes configuring it.
    p.conditions = [{ ...p.conditions[0], op: '' }]
    setNewId(p.id)
    setOpenPatternId(p.id)
    savePatterns([...patternsRef.current, p])
    onCreatePatternRequestHandled?.()
  }, [createPatternRequest?.id])

  function add() { const p = blankPattern(); setNewId(p.id); setOpenPatternId(p.id); savePatterns([...patterns, p]) }

  const tfCopySource = patterns.find(p => p.id === tfCopySourceId) || null
  function openTimeframeCopy(sourcePattern) {
    const source = sourcePattern || patterns.find(p => !p.locked) || patterns[0]
    setTfCopySourceId(source?.id || '')
    setTfCopySourceTf(source?.tfs?.[0] || '1h')
    setTfCopyTargetTf('15m')
    setTfCopyName(source ? `${source.name} 15m` : '')
    setTfCopyError('')
    setTfCopyOpen(true)
  }
  function createTimeframeCopy() {
    if (!tfCopySource) { setTfCopyError('Select a source pattern.'); return }
    const name = tfCopyName.trim()
    if (!name) { setTfCopyError('Enter a name for the copied pattern.'); return }
    const sourceTf = tfCopySourceTf || tfCopySource.tfs?.[0] || null
    const duplicate = patterns.find(p => p.id !== tfCopySource.id && p.name.trim().toLowerCase() === name.toLowerCase())
    if (duplicate) {
      setTfCopyError(`“${name}” already exists. Please rename this copy before creating it.`)
      return
    }
    const copied = { ...tfCopySource, id:`custom_${uid()}`, name, tfs:[tfCopyTargetTf], conditions:(tfCopySource.conditions||[]).map(cond=>({...cond,id:uid(),htfTf:cond.htfTf && sourceTf && cond.htfTf===sourceTf ? tfCopyTargetTf : cond.htfTf})), createdAt:Date.now(), hiddenInBuilder:false }
    const next = [...patterns, copied]
    savePatterns(next); setNewId(copied.id); setOpenPatternId(copied.id); setTfCopyOpen(false)
  }

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
      mirrorOf: src.mirrorOf || src.id,
      side: src.side === 'bull' ? 'bear' : 'bull',
      conditions: src.conditions.map(c => mirrorCondition(c, uid)),
      createdAt: Date.now(),
      hiddenInBuilder: false,
    }
    // If a non-symmetric expression needs manual review, do not activate an
    // incomplete bearish/bullish pattern automatically.
    if (mirrored.conditions.some(c => c.mirrorReviewReason)) mirrored.enabled = false
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
      hiddenInBuilder: false,
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

  // Reorder editable patterns without touching locked pattern positions.
  // Middle entries move exactly one position; boundary entries wrap end-to-end.
  function movePattern(fromIdx, direction) {
    const slots = patterns.map((p, i) => p.locked ? -1 : i).filter(i => i >= 0)
    const from = slots.indexOf(fromIdx)
    if (from < 0 || slots.length < 2) return
    const last = slots.length - 1
    let to
    if (direction === 'up') to = from - 1
    else if (direction === 'down') to = from + 1
    else if (direction === 'top' && from === last) to = 0
    else if (direction === 'bottom' && from === 0) to = last
    else return
    if (to < 0 || to > last || to === from) return
    const ordered = slots.map(i => patterns[i])
    const [item] = ordered.splice(from, 1)
    ordered.splice(to, 0, item)
    const next = [...patterns]
    slots.forEach((slot, i) => { next[slot] = ordered[i] })
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

      {/* Copy to timeframe modal */}
      {tfCopyOpen && (
        <>
          <div onClick={() => setTfCopyOpen(false)} style={{ position:'fixed', inset:0, zIndex:399, background:'rgba(0,0,0,0.68)', backdropFilter:'blur(4px)' }} />
          <div style={{ position:'fixed', left:'50%', top:'50%', transform:'translate(-50%,-50%)', zIndex:400, width:'min(360px,92vw)', borderRadius:15, padding:18, background:'var(--bg1)', border:'1.5px solid rgba(0,230,118,0.45)', boxShadow:'0 20px 60px rgba(0,0,0,0.75)' }}>
            <div style={{ fontWeight:900, fontSize:15, color:G, marginBottom:5 }}>⧉ Copy to Timeframe</div>
            <div style={{ fontSize:10, color:'var(--text3)', fontFamily:'var(--mono)', lineHeight:1.6, marginBottom:14 }}>Copies the complete pattern and its conditions. The original remains unchanged.</div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <div style={{fontSize:10,color:'var(--text2)',fontFamily:'var(--mono)'}}>SOURCE: <b>{tfCopySource?.icon || '⭐'} {tfCopySource?.name || '—'}</b></div>
              <div style={{display:'flex',gap:8}}>
                <div style={{flex:1}}><Lbl>SOURCE TIMEFRAME</Lbl><select value={tfCopySourceTf} onChange={e=>setTfCopySourceTf(e.target.value)} style={{width:'100%',background:'var(--bg3)',color:'var(--text)',border:'1px solid var(--border2)',borderRadius:8,padding:9,fontSize:12}}>{(tfCopySource?.tfs?.length?tfCopySource.tfs:TF_LIST).map(tf=><option key={tf} value={tf}>{tf.toUpperCase()}</option>)}</select></div>
                <div style={{flex:1}}><Lbl>TARGET TIMEFRAME</Lbl><select value={tfCopyTargetTf} onChange={e=>{setTfCopyTargetTf(e.target.value);if(tfCopySource)setTfCopyName(tfCopySource.name+' '+e.target.value);setTfCopyError('')}} style={{width:'100%',background:'var(--bg3)',color:'var(--text)',border:'1px solid var(--border2)',borderRadius:8,padding:9,fontSize:12}}>{TF_LIST.map(tf=><option key={tf} value={tf}>{tf.toUpperCase()}</option>)}</select></div>
              </div>
              <div><Lbl>NEW PATTERN NAME</Lbl><input value={tfCopyName} onChange={e=>{setTfCopyName(e.target.value);setTfCopyError('')}} placeholder="Enter copied pattern name" style={{width:'100%',boxSizing:'border-box',background:'var(--bg3)',color:'var(--text)',border:'1px solid var(--border2)',borderRadius:8,padding:10,fontSize:12}} /></div>
              {tfCopyError && <div style={{color:'var(--red)',fontSize:10,fontFamily:'var(--mono)'}}>⚠ {tfCopyError}</div>}
              <div style={{display:'flex',gap:8,marginTop:3}}><button onClick={createTimeframeCopy} style={{flex:1,padding:10,borderRadius:8,cursor:'pointer',border:'1px solid rgba(0,230,118,0.55)',background:'rgba(0,230,118,0.12)',color:G,fontWeight:800,fontSize:11}}>✓ Create Copy</button><button onClick={()=>setTfCopyOpen(false)} style={{padding:'10px 14px',borderRadius:8,cursor:'pointer',border:'1px solid var(--border)',background:'var(--bg2)',color:'var(--text3)',fontSize:11}}>Cancel</button></div>
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
            {patterns.filter(p => p.locked).length > 0 && (
              <span style={{ fontSize: 9, fontFamily: 'var(--mono)', fontWeight: 700, padding: '1px 6px', borderRadius: 5,
                background: 'rgba(255,167,38,0.12)', color: '#ffa726', border: '1px solid rgba(255,167,38,0.3)' }}>
                {patterns.filter(p => p.locked).length} locked (hidden)
              </span>
            )}
            <div style={{ flex: 1, height: 1, background: 'var(--lime-dim)' }} />
          </div>

          {/* ── Horizontal name strip — tap to jump to pattern ── */}
          {patterns.filter(p => !p.locked).length > 1 && (
            <div style={{
              display: 'flex', gap: 5, overflowX: 'auto', flexWrap: 'nowrap',
              marginBottom: 10, paddingBottom: 4,
              scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch',
              marginLeft: -10, marginRight: -10, paddingLeft: 10, paddingRight: 10,
            }}>
              {patterns.filter(p => !p.locked).map(p => {
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
            {patterns.filter(p => !p.locked).length === 0 && patterns.length > 0 && (
              <div style={{ textAlign:'center', padding:'20px 16px', color:'var(--text3)', fontSize:12, fontFamily:'var(--mono)', lineHeight:1.7 }}>
                All patterns are locked and hidden from editing.<br/>Unlock via the P button or tap each pattern.
              </div>
            )}
            {patterns.filter(p => !p.locked).map((p, i, visibleList) => {
              // Keep original index for operations
              const origIdx = patterns.indexOf(p)
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
                    /* Only the list boundaries wrap; middle entries move one step. */
                    <>
                      {visibleList.length > 1 && i > 0 && (
                        <button
                          onClick={() => movePattern(origIdx, i === visibleList.length - 1 ? 'top' : 'up')}
                          title={i === visibleList.length - 1 ? 'Bottom → Top' : 'Move up one position'}
                          aria-label={i === visibleList.length - 1 ? 'Move from Bottom to Top' : 'Move up one position'}
                          style={{
                            width: 24, height: 24, borderRadius: 6, padding: 0,
                            border: '1px solid rgba(255,255,255,0.18)',
                            background: 'rgba(255,255,255,0.05)',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          <span style={{ fontSize: 13, lineHeight: 1, color: 'var(--text2)', fontWeight: 700 }}>{i === visibleList.length - 1 ? '⇈' : '↑'}</span>
                        </button>
                      )}

                      <span style={{
                        fontSize: 9, fontFamily: 'var(--mono)', fontWeight: 800,
                        color: 'var(--text3)', lineHeight: 1, userSelect: 'none',
                      }}>{i + 1}</span>

                      {visibleList.length > 1 && i < visibleList.length - 1 && (
                        <button
                          onClick={() => movePattern(origIdx, i === 0 ? 'bottom' : 'down')}
                          title={i === 0 ? 'Top → Bottom' : 'Move down one position'}
                          aria-label={i === 0 ? 'Move from Top to Bottom' : 'Move down one position'}
                          style={{
                            width: 24, height: 24, borderRadius: 6, padding: 0,
                            border: '1px solid rgba(255,255,255,0.18)',
                            background: 'rgba(255,255,255,0.05)',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          <span style={{ fontSize: 13, lineHeight: 1, color: 'var(--text2)', fontWeight: 700 }}>{i === 0 ? '⇊' : '↓'}</span>
                        </button>
                      )}
                    </>
                  )}
                </div>
                )}

                {/* ── Pattern card — border via outerStyle prop ── */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <PatternEditor
                    key={p.id} pattern={p} defaultOpen={p.id === newId || p.id === openPatternId}
                    onChange={np => upd(origIdx, np)} onDelete={() => del(origIdx)}
                    onMirrorPattern={(name) => mirrorPattern(origIdx, name)}
                    onCopyPattern={(name) => copyPattern(origIdx, name)}
                    onCopyToTimeframe={openTimeframeCopy}
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
