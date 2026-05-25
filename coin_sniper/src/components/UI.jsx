// Shared primitive components


export function Toggle({ checked, onChange }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span className="toggle-slider" />
    </label>
  )
}


export function CandleChart({ candles, width = 100, height = 40 }) {
  if (!candles?.length) return null
  const prices = candles.flatMap(c => [c.high, c.low])
  const mn = Math.min(...prices), mx = Math.max(...prices)
  const range = mx - mn || 1
  const cw = Math.floor(width / candles.length), gap = 1
  const bw = Math.max(2, cw - gap)
  const toY = v => height - ((v - mn) / range * height)
  return (
    <svg width={width} height={height} style={{ background: 'var(--bg3)', borderRadius: 4, display: 'block', overflow: 'hidden' }}>
      {candles.map((c, i) => {
        const x = i * cw + gap / 2
        const bull = c.close >= c.open
        const col = bull ? '#00c060' : '#cc2233'
        const oy = toY(Math.max(c.open, c.close))
        const cy = toY(Math.min(c.open, c.close))
        const bh = Math.max(1, cy - oy)
        return (
          <g key={i}>
            <line x1={x + bw / 2} y1={toY(c.high)} x2={x + bw / 2} y2={toY(c.low)} stroke={col} strokeWidth={1} />
            <rect x={x} y={oy} width={bw} height={bh} fill={col} />
          </g>
        )
      })}
    </svg>
  )
}


export function SectionHeader({ title, sub }) {
  return (
    <div className="section-header">
      <h2>{title}</h2>
      {sub && <p>{sub}</p>}
    </div>
  )
}


export function SettingRow({ label, sub, children }) {
  return (
    <div className="setting-row">
      <div className="row-label">
        <span>{label}</span>
        {sub && <small>{sub}</small>}
      </div>
      {children}
    </div>
  )
}

export function SectionCard({ children, style }) {
  return (
    <div className="section-card" style={style}>
      {children}
    </div>
  )
}


export function NumInput({ value, min, max, onChange }) {
  return (
    <input
      type="number"
      className="field"
      value={value}
      min={min}
      max={max}
      style={{ width: 70, textAlign: 'right' }}
      onChange={e => {
        const v = Number(e.target.value)
        if (!isNaN(v)) onChange(Math.min(max, Math.max(min, v)))
      }}
    />
  )
}


export function SubHeader({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', fontFamily: 'var(--mono)', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 8 }}>
      {children}
    </div>
  )
}


export function PillGroup({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {options.map(opt => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          style={{
            padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
            fontFamily: 'var(--mono)', cursor: 'pointer', border: '1px solid',
            borderColor: value === opt ? 'var(--green2)' : 'var(--border)',
            background: value === opt ? 'var(--green-dim)' : 'var(--bg2)',
            color: value === opt ? 'var(--green)' : 'var(--text2)',
            transition: 'all .15s',
          }}
        >{opt}</button>
      ))}
    </div>
  )
}
