export default function AlertHistory({ alerts, onClear, onRemove }) {
  const formatTime = (timestamp) => {
    const date = new Date(timestamp)
    return date.toLocaleString()
  }

  const formatTimeAgo = (timestamp) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000)
    if (seconds < 60) return `${seconds}s ago`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
    return `${Math.floor(seconds / 86400)}d ago`
  }

  const groupedAlerts = alerts.reduce((acc, alert) => {
    const symbol = alert.symbol
    if (!acc[symbol]) acc[symbol] = []
    acc[symbol].push(alert)
    return acc
  }, {})

  return (
    <>
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">
            <span>🕐</span> Alert History ({alerts.length})
          </h3>
          {alerts.length > 0 && (
            <button 
              className="icon-btn"
              onClick={onClear}
              title="Clear all alerts"
            >
              🗑️
            </button>
          )}
        </div>

        {alerts.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📭</div>
            <div className="empty-state-text">No alerts in history</div>
          </div>
        ) : (
          <div className="alert-list">
            {Object.entries(groupedAlerts).map(([symbol, symbolAlerts]) => (
              <div key={symbol} style={{ marginBottom: '16px' }}>
                <div style={{ 
                  fontSize: '13px', 
                  fontWeight: 600, 
                  padding: '8px 0',
                  borderBottom: '1px solid var(--border-color)',
                  marginBottom: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <span>💱</span> {symbol}
                </div>
                {symbolAlerts.map((alert) => (
                  <div key={alert.id} className="alert-card" style={{ marginBottom: '8px' }}>
                    <div className={`alert-icon ${alert.side}`}>
                      {alert.side === 'bull' ? '📈' : '📉'}
                    </div>
                    <div className="alert-info">
                      <div className="alert-pattern">{alert.pattern}</div>
                      <div className="alert-time" title={formatTime(alert.timestamp)}>
                        {formatTimeAgo(alert.timestamp)} • {alert.timeframe}
                      </div>
                    </div>
                    <div className="alert-price">
                      <div className={`alert-price-value ${alert.side}`}>
                        {alert.price}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {alert.confidence}% conf
                      </div>
                      <button 
                        className="icon-btn"
                        style={{ width: '24px', height: '24px', marginTop: '4px' }}
                        onClick={() => onRemove(alert.id)}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
