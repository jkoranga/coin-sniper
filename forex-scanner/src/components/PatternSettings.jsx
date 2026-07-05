export default function PatternSettings({ patterns, enabled, onUpdate }) {
  const patternGroups = {
    'Harmonic Patterns': [
      { id: 'GARTLEY_BULL', name: 'Bullish Gartley', desc: 'M-shaped retracement pattern' },
      { id: 'GARTLEY_BEAR', name: 'Bearish Gartley', desc: 'W-shaped retracement pattern' },
      { id: 'BUTTERFLY_BULL', name: 'Bullish Butterfly', desc: 'Extension beyond X point' },
      { id: 'BUTTERFLY_BEAR', name: 'Bearish Butterfly', desc: 'Extension below X point' },
      { id: 'BAT_BULL', name: 'Bullish Bat', desc: 'Deep 88.6% retracement' },
      { id: 'BAT_BEAR', name: 'Bearish Bat', desc: 'Deep 88.6% retracement' }
    ],
    'Support/Resistance': [
      { id: 'SUPPORT_BOUNCE', name: 'Support Bounce', desc: 'Price bouncing off support' },
      { id: 'RESISTANCE_REJECT', name: 'Resistance Rejection', desc: 'Price rejected at resistance' }
    ],
    'Divergence': [
      { id: 'RSI_BULL_DIVERGENCE', name: 'RSI Bullish Divergence', desc: 'Price LL, RSI HL' },
      { id: 'RSI_BEAR_DIVERGENCE', name: 'RSI Bearish Divergence', desc: 'Price HH, RSI LH' },
      { id: 'MACD_BULL_DIVERGENCE', name: 'MACD Bullish Divergence', desc: 'Price LL, MACD HL' },
      { id: 'MACD_BEAR_DIVERGENCE', name: 'MACD Bearish Divergence', desc: 'Price HH, MACD LH' }
    ],
    'Breakouts': [
      { id: 'SUPPORT_BREAKDOWN', name: 'Support Breakdown', desc: 'Price broke below support' },
      { id: 'RESISTANCE_BREAKOUT', name: 'Resistance Breakout', desc: 'Price broke above resistance' },
      { id: 'VOLATILITY_SQUEEZE', name: 'Volatility Squeeze', desc: 'Low volatility, breakout imminent' }
    ]
  }

  const toggleCategory = (category) => {
    const categoryKeys = {
      'Harmonic Patterns': 'harmonic',
      'Support/Resistance': 'supportResistance',
      'Divergence': 'divergence',
      'Breakouts': 'breakout'
    }
    const key = categoryKeys[category]
    if (key) {
      onUpdate({ 
        patternsEnabled: { ...enabled, [key]: !enabled[key] }
      })
    }
  }

  return (
    <>
      {Object.entries(patternGroups).map(([category, items]) => {
        const categoryKeys = {
          'Harmonic Patterns': 'harmonic',
          'Support/Resistance': 'supportResistance',
          'Divergence': 'divergence',
          'Breakouts': 'breakout'
        }
        const isEnabled = enabled[categoryKeys[category]]
        
        return (
          <div key={category} className="card">
            <div className="card-header">
              <h3 className="card-title">
                <span>{category === 'Harmonic Patterns' && '🦋'}</span>
                <span>{category === 'Support/Resistance' && '📊'}</span>
                <span>{category === 'Divergence' && '〰️'}</span>
                <span>{category === 'Breakouts' && '🚀'}</span>
                {category}
              </h3>
              <div 
                className={`toggle ${isEnabled ? 'active' : ''}`}
                onClick={() => toggleCategory(category)}
              >
                <div className="toggle-knob" />
              </div>
            </div>
            
            <div style={{ opacity: isEnabled ? 1 : 0.5 }}>
              {items.map((item) => (
                <div key={item.id} className="setting-row">
                  <div>
                    <div style={{ fontWeight: 500, fontSize: '13px' }}>{item.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {item.desc}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">
            <span>⚠️</span> Detection Confidence
          </h3>
        </div>
        <div className="setting-row">
          <label>Minimum Confidence %</label>
          <input type="range" min="50" max="95" value="70" style={{ width: '120px' }} />
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
          Lower values = more signals, higher false positives. 
          Higher values = fewer but more reliable signals.
        </div>
      </div>
    </>
  )
}
