const NAV = [
  { id: 'scan',      icon: '⬡', label: 'Scan Formations', badge: 'LIVE' },
  { id: 'prices',    icon: '◎', label: 'Live Prices',      badge: 'RT' },
  { id: 'account',   icon: '👤', label: 'Account' },
  { sep: true },
  { id: 'appear',    icon: '◑', label: 'Appearance' },
  { id: 'timeframe', icon: '◷', label: 'Timeframe & Interval' },
  { id: 'alerts',    icon: '◈', label: 'Alerts & Notifs' },
  { id: 'signal',    icon: '◉', label: 'Signal Strength' },
  { id: 'pairs',     icon: '⊞', label: 'Custom Pairs' },
]

export default function Sidebar({ section, onNavigate, onClose }) {
  return (
    <aside className="sidebar">
      {/* Logo */}
      <div style={{ padding: '14px 16px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', letterSpacing: '.12em', marginBottom: 3 }}>CFA v3.0</div>
          <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--green)', letterSpacing: '-.02em' }}>Candle Alert</div>
        </div>
        <button
          onClick={onClose}
          style={{ width: 30, height: 30, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text2)', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
        >✕</button>
      </div>

      {/* Nav */}
      <nav style={{ padding: '10px 8px', flex: 1 }}>
        {NAV.map((item, i) => {
          if (item.sep) return <div key={i} className="nav-divider" />
          return (
            <button
              key={item.id}
              className={`nav-item ${section === item.id ? 'active' : ''}`}
              onClick={() => onNavigate(item.id)}
            >
              <span className="nav-item-icon">{item.icon}</span>
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.badge && <span className="badge badge-green" style={{ fontSize: 9 }}>{item.badge}</span>}
            </button>
          )
        })}
      </nav>

      {/* Footer */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)' }}>v3.0 · Binance Live · Real-time only</div>
      </div>
    </aside>
  )
}
