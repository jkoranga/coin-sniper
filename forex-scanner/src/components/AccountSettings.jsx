import { useState } from 'react'

export default function AccountSettings({ 
  user, 
  settings, 
  onUpdate,
  onLoginGoogle,
  onLoginEmail,
  onSignUp,
  onLogout
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [error, setError] = useState(null)

  const handleAuth = async (e) => {
    e.preventDefault()
    setError(null)
    
    try {
      if (isSignUp) {
        await onSignUp(email, password)
      } else {
        await onLoginEmail(email, password)
      }
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <>
      {/* Account Section */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">
            <span>👤</span> Account
          </h3>
        </div>
        
        {user ? (
          <div>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '12px',
              padding: '12px',
              background: 'var(--bg-secondary)',
              borderRadius: 'var(--radius-md)',
              marginBottom: '16px'
            }}>
              <div style={{ 
                width: '40px', 
                height: '40px', 
                borderRadius: '50%', 
                background: 'var(--accent-blue)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px'
              }}>
                👤
              </div>
              <div>
                <div style={{ fontWeight: 600 }}>{user.displayName || user.email}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {user.email}
                </div>
              </div>
            </div>
            <button className="scan-btn" onClick={onLogout}>
              Sign Out
            </button>
          </div>
        ) : (
          <form onSubmit={handleAuth}>
            {error && (
              <div style={{ 
                padding: '12px', 
                background: 'rgba(239, 68, 68, 0.1)', 
                borderRadius: 'var(--radius-md)',
                marginBottom: '16px',
                fontSize: '13px',
                color: 'var(--accent-bear)'
              }}>
                {error}
              </div>
            )}
            
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px' }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
              />
            </div>
            
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px' }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            
            <button type="submit" className="scan-btn" style={{ marginBottom: '12px' }}>
              {isSignUp ? 'Create Account' : 'Sign In'}
            </button>
            
            <div style={{ 
              textAlign: 'center', 
              marginBottom: '16px',
              fontSize: '13px',
              color: 'var(--text-muted)'
            }}>
              or
            </div>
            
            <button 
              type="button" 
              className="scan-btn"
              style={{ 
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)'
              }}
              onClick={onLoginGoogle}
            >
              <span>🔍</span> Continue with Google
            </button>
            
            <button
              type="button"
              onClick={() => setIsSignUp(!isSignUp)}
              style={{
                marginTop: '16px',
                display: 'block',
                width: '100%',
                textAlign: 'center',
                background: 'none',
                border: 'none',
                color: 'var(--accent-blue)',
                cursor: 'pointer',
                fontSize: '13px'
              }}
            >
              {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
            </button>
          </form>
        )}
      </div>

      {/* Notifications Section */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">
            <span>🔔</span> Notifications
          </h3>
        </div>
        
        <div className="setting-row">
          <label>Sound Alerts</label>
          <div 
            className={`toggle ${settings.soundEnabled ? 'active' : ''}`}
            onClick={() => onUpdate({ soundEnabled: !settings.soundEnabled })}
          >
            <div className="toggle-knob" />
          </div>
        </div>
        
        <div className="setting-row">
          <label>Telegram Alerts</label>
          <div 
            className={`toggle ${settings.telegramEnabled ? 'active' : ''}`}
            onClick={() => onUpdate({ telegramEnabled: !settings.telegramEnabled })}
          >
            <div className="toggle-knob" />
          </div>
        </div>
        
        {settings.telegramEnabled && (
          <>
            <div style={{ marginTop: '12px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px' }}>
                Bot Token
              </label>
              <input
                type="text"
                value={settings.telegramBotToken}
                onChange={(e) => onUpdate({ telegramBotToken: e.target.value })}
                placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
              />
            </div>
            <div style={{ marginTop: '12px' }}>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px' }}>
                Chat ID
              </label>
              <input
                type="text"
                value={settings.telegramChatId}
                onChange={(e) => onUpdate({ telegramChatId: e.target.value })}
                placeholder="@channelname or 123456789"
              />
            </div>
          </>
        )}
        
        <div className="setting-row" style={{ marginTop: '16px' }}>
          <label>Email Alerts</label>
          <div 
            className={`toggle ${settings.emailEnabled ? 'active' : ''}`}
            onClick={() => onUpdate({ emailEnabled: !settings.emailEnabled })}
          >
            <div className="toggle-knob" />
          </div>
        </div>
        
        {settings.emailEnabled && (
          <div style={{ marginTop: '12px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px' }}>
              Email Address
            </label>
            <input
              type="email"
              value={settings.emailAddress}
              onChange={(e) => onUpdate({ emailAddress: e.target.value })}
              placeholder="alerts@yourdomain.com"
            />
          </div>
        )}
      </div>

      {/* Appearance Section */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">
            <span>🎨</span> Appearance
          </h3>
        </div>
        
        <div className="setting-row">
          <label>Dark Mode</label>
          <div 
            className={`toggle ${settings.darkMode ? 'active' : ''}`}
            onClick={() => onUpdate({ darkMode: !settings.darkMode })}
          >
            <div className="toggle-knob" />
          </div>
        </div>
        
        <div className="setting-row">
          <label>Compact View</label>
          <div 
            className={`toggle ${settings.compactView ? 'active' : ''}`}
            onClick={() => onUpdate({ compactView: !settings.compactView })}
          >
            <div className="toggle-knob" />
          </div>
        </div>
      </div>

      {/* Data Provider Section */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">
            <span>🔌</span> Data Provider Configuration
          </h3>
        </div>
        
        <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '12px' }}>
          Configure these in your .env file:
        </div>
        
        <div style={{ display: 'grid', gap: '12px' }}>
          <div style={{ 
            padding: '12px', 
            background: 'var(--bg-tertiary)', 
            borderRadius: 'var(--radius-md)',
            fontFamily: 'monospace',
            fontSize: '12px'
          }}>
            <div style={{ color: 'var(--text-muted)' }}>OANDA:</div>
            <div>VITE_OANDA_API_KEY=your_api_key</div>
          </div>
          
          <div style={{ 
            padding: '12px', 
            background: 'var(--bg-tertiary)', 
            borderRadius: 'var(--radius-md)',
            fontFamily: 'monospace',
            fontSize: '12px'
          }}>
            <div style={{ color: 'var(--text-muted)' }}>Alpaca:</div>
            <div>VITE_ALPACA_API_KEY=your_key</div>
            <div>VITE_ALPACA_SECRET=your_secret</div>
          </div>
        </div>
      </div>
    </>
  )
}
