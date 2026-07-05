import { useState } from 'react'

export default function CurrencyScanner({ 
  settings, 
  scanning, 
  alerts, 
  pairs,
  timeframes,
  onUpdateSettings,
  onScan,
  onRemoveAlert
}) {
  const [showFilters, setShowFilters] = useState(false)

  return (
    <>
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">
            <span>🔍</span> Scan Configuration
          </h3>
        </div>
        
        <div style={{ display: 'grid', gap: '12px', marginBottom: '16px' }}>
          <div className="setting-row">
            <label>Timeframe</label>
            <select 
              value={settings.timeframe}
              onChange={(e) => onUpdateSettings({ timeframe: e.target.value })}
              disabled={scanning}
            >
              {timeframes.map((tf) => (
                <option key={tf} value={tf}>{tf}</option>
              ))}
            </select>
          </div>

          <div className="setting-row">
            <label>Currency Pairs</label>
            <select
              value={settings.symbolSet}
              onChange={(e) => onUpdateSettings({ symbolSet: e.target.value })}
              disabled={scanning}
            >
              <option value="major">Major Pairs (12)</option>
              <option value="minor">Minor Pairs (24)</option>
              <option value="exotic">Exotic Pairs (36)</option>
              <option value="all">All Pairs (48)</option>
              <option value="custom">Custom</option>
            </select>
          </div>

          <div className="setting-row">
            <label>Data Provider</label>
            <select
              value={settings.dataProvider}
              onChange={(e) => onUpdateSettings({ dataProvider: e.target.value })}
              disabled={scanning}
            >
              <option value="oanda">OANDA</option>
              <option value="demo">Demo Mode</option>
            </select>
          </div>

          <div className="setting-row">
            <label>Auto-Scan</label>
            <div 
              className={`toggle ${settings.autoScan ? 'active' : ''}`}
              onClick={() => onUpdateSettings({ autoScan: !settings.autoScan })}
            >
              <div className="toggle-knob" />
            </div>
          </div>

          {settings.autoScan && (
            <div className="setting-row">
              <label>Interval (seconds)</label>
              <input
                type="number"
                value={settings.scanInterval}
                onChange={(e) => onUpdateSettings({ scanInterval: parseInt(e.target.value) || 60 })}
                style={{ width: '100px' }}
              />
            </div>
          )}
        </div>

        <button 
          className={`scan-btn ${scanning ? 'spinning' : ''}`}
          onClick={onScan}
          disabled={scanning}
        >
          {scanning ? (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2v4m0 12v4m4-8h4M4 12H8m11.3-4.3l-2.8 2.8M7.5 16.5l-2.8 2.8m14.6 0l-2.8-2.8M7.5 7.5l-2.8-2.8"/>
              </svg>
              Scanning...
            </>
          ) : (
            <>
              <span>🔍</span>
              Scan Now
            </>
          )}
        </button>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">
            <span>🔔</span> Active Alerts ({alerts.length})
          </h3>
          <button 
            className="icon-btn"
            onClick={() => setShowFilters(!showFilters)}
          >
            🔽
          </button>
        </div>

        {alerts.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📊</div>
            <div className="empty-state-text">No patterns detected yet. Click Scan Now to find trading opportunities.</div>
          </div>
        ) : (
          <div className="alert-list">
            {alerts.slice(0, 20).map((alert) => (
              <div key={alert.id} className={`alert-card ${alert.side}`}>
                <div className={`alert-icon ${alert.side}`}>
                  {alert.side === 'bull' ? '📈' : '📉'}
                </div>
                <div className="alert-info">
                  <div className="alert-symbol">{alert.symbol}</div>
                  <div className="alert-pattern">{alert.pattern}</div>
                  <div className="alert-time">
                    {new Date(alert.timestamp).toLocaleTimeString()} • {alert.timeframe} • {alert.confidence}% conf
                  </div>
                </div>
                <div className="alert-price">
                  <div className={`alert-price-value ${alert.side}`}>{alert.price}</div>
                  <div className="alert-change">{alert.change}%</div>
                  <button 
                    className="icon-btn"
                    style={{ width: '24px', height: '24px', marginTop: '4px' }}
                    onClick={() => onRemoveAlert(alert.id)}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
