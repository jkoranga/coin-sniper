import { useState } from 'react'
import CurrencyScanner from './components/CurrencyScanner.jsx'
import PatternSettings from './components/PatternSettings.jsx'
import AlertHistory from './components/AlertHistory.jsx'
import AccountSettings from './components/AccountSettings.jsx'
import { useSettings } from './hooks/useSettings.js'

export default function App() {
  const [activeTab, setActiveTab] = useState('scanner')
  const {
    user,
    settings,
    scanning,
    alerts,
    pairs,
    TIMEFRAMES,
    PATTERN_TYPES,
    updateSettings,
    performScan,
    clearAlerts,
    removeAlert,
    loginWithGoogle,
    loginWithEmail,
    signUpWithEmail,
    logout
  } = useSettings()

  const tabs = [
    { id: 'scanner', name: 'Scanner', icon: '🔍' },
    { id: 'patterns', name: 'Patterns', icon: '📊' },
    { id: 'history', name: 'History', icon: '🕐' },
    { id: 'settings', name: 'Settings', icon: '⚙️' }
  ]

  return (
    <div className="app-container">
      <header className="header">
        <div className="header-title">
          <span>📈</span>
          <span>Forex Scanner</span>
        </div>
        <div className="header-actions">
          <button className="icon-btn" onClick={() => updateSettings({ darkMode: !settings.darkMode })}>
            {settings.darkMode ? '☀️' : '🌙'}
          </button>
        </div>
      </header>

      <div className="tabs-container">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.icon} {tab.name}
          </button>
        ))}
      </div>

      <main className="main-content">
        {activeTab === 'scanner' && (
          <CurrencyScanner
            settings={settings}
            scanning={scanning}
            alerts={alerts}
            pairs={pairs}
            timeframes={TIMEFRAMES}
            onUpdateSettings={updateSettings}
            onScan={performScan}
            onRemoveAlert={removeAlert}
          />
        )}

        {activeTab === 'patterns' && (
          <PatternSettings
            patterns={PATTERN_TYPES}
            enabled={settings.patternsEnabled}
            onUpdate={updateSettings}
          />
        )}

        {activeTab === 'history' && (
          <AlertHistory
            alerts={alerts}
            onClear={clearAlerts}
            onRemove={removeAlert}
          />
        )}

        {activeTab === 'settings' && (
          <AccountSettings
            user={user}
            settings={settings}
            onUpdate={updateSettings}
            onLoginGoogle={loginWithGoogle}
            onLoginEmail={loginWithEmail}
            onSignUp={signUpWithEmail}
            onLogout={logout}
          />
        )}
      </main>
    </div>
  )
}
