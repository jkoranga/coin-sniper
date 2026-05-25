import { SectionCard } from '../UI.jsx'

function SectionHeader({ title, sub }) {
  return <div className="section-header"><h2>{title}</h2>{sub && <p>{sub}</p>}</div>
}

function Toggle({ checked, onChange }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span className="toggle-slider" />
    </label>
  )
}

function SettingRow({ label, sub, children }) {
  return (
    <div className="setting-row">
      <div className="row-label"><span>{label}</span>{sub && <small>{sub}</small>}</div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  )
}

export function SignalStrengthSection({ cfg, set }) {
  const s = cfg.signalStrength || { enabled: false, minScore: 5 }
  return (
    <div>
      <SectionHeader title="Signal Strength" sub="Only show alerts above a minimum pattern score" />
      <SectionCard>
        <SettingRow label="Min Score Filter" sub="Enable/disable score filtering">
          <Toggle checked={s.enabled} onChange={v => set('signalStrength.enabled', v)} />
        </SettingRow>
      </SectionCard>
      {s.enabled && (
        <SectionCard>
          <SettingRow label="Minimum Score" sub={`Show signals scoring above ${s.minScore} (1–10)`}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <input
                type="range" min={1} max={10} step={1}
                value={s.minScore}
                onChange={e => set('signalStrength.minScore', +e.target.value)}
                style={{ width: 110, accentColor: 'var(--amber)' }}
              />
              <div style={{ display: 'flex', gap: 2 }}>
                {Array.from({ length: 10 }, (_, i) => (
                  <div key={i} style={{ width: 8, height: 18, borderRadius: 2, background: i < s.minScore ? 'var(--amber)' : 'var(--bg3)', transition: 'background .15s' }} />
                ))}
              </div>
              <span style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 18, color: 'var(--amber)', minWidth: 18 }}>{s.minScore}</span>
            </div>
          </SettingRow>
        </SectionCard>
      )}
    </div>
  )
}
