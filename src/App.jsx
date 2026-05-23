import React, { useState, useCallback, useEffect, Component } from 'react'
import { useSettings } from './hooks/useSettings.js'
import DeltaScannerTab from './components/DeltaScannerTab.jsx'
import SettingsTab from './components/SettingsTab.jsx'
import PatternBuilderTab from './components/PatternBuilder.jsx'
import { onAuthChanged, checkConfigured } from './firebase.js'

const ORANGE       = '#ff6b00'
const ORANGE_DIM   = 'rgba(255,107,0,0.12)'
const ORANGE_BORDER= 'rgba(255,107,0,0.4)'

// ── Error Boundary ─────────────────────────────────────────────────────────────
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error, info) { console.error('[ErrBnd]', error, info) }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding:'24px 20px',margin:'16px',borderRadius:12,
          background:'rgba(255,71,87,0.08)',border:'1.5px solid rgba(255,71,87,0.4)',fontFamily:'var(--mono)' }}>
          <div style={{ fontSize:18,marginBottom:8 }}>⚠️ Error</div>
          <div style={{ fontSize:12,color:'var(--red)',marginBottom:12,wordBreak:'break-word' }}>{this.state.error.message}</div>
          <button onClick={()=>this.setState({error:null})} style={{ padding:'7px 18px',borderRadius:6,cursor:'pointer',
            border:'1px solid var(--red)',background:'var(--red-dim)',color:'var(--red)',fontSize:12,fontWeight:700 }}>↺ Retry</button>
        </div>
      )
    }
    return this.props.children
  }
}

// ── Coins Sniper Logo ──────────────────────────────────────────────────────────
function CoinSniperLogo({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="64" height="64" rx="14" fill="#0a0f14"/>
      {/* Coin rings */}
      <circle cx="32" cy="32" r="20" stroke={ORANGE} strokeWidth="3.5"/>
      <circle cx="32" cy="32" r="14" fill={ORANGE_DIM} stroke={ORANGE} strokeWidth="1.5"/>
      {/* Delta triangle */}
      <polygon points="32,19 44,43 20,43" fill="none" stroke={ORANGE} strokeWidth="2.5" strokeLinejoin="round"/>
      {/* Crosshair top-right */}
      <line x1="46" y1="6" x2="46" y2="22" stroke={ORANGE} strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="38" y1="14" x2="54" y2="14" stroke={ORANGE} strokeWidth="2.5" strokeLinecap="round"/>
      <circle cx="46" cy="14" r="2.5" fill={ORANGE}/>
      {/* Center dot */}
      <circle cx="32" cy="32" r="2" fill={ORANGE} opacity="0.9"/>
    </svg>
  )
}

// ── Login Modal ────────────────────────────────────────────────────────────────
function LoginModal({ onClose, onUserChange }) {
  const [tab,     setTab]     = React.useState('signin')
  const [email,   setEmail]   = React.useState('')
  const [pass,    setPass]    = React.useState('')
  const [name,    setName]    = React.useState('')
  const [confirm, setConfirm] = React.useState('')
  const [err,     setErr]     = React.useState('')
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    const fn = e => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', fn)
    return () => document.removeEventListener('keydown', fn)
  }, [onClose])

  function switchTab(t) { setTab(t); setErr(''); setEmail(''); setPass(''); setName(''); setConfirm('') }

  async function handleGoogle() {
    setErr(''); setLoading(true)
    try {
      const { loginWithGoogle, checkConfigured } = await import('./firebase.js')
      if (!checkConfigured()) { setErr('Firebase not configured.'); return }
      const u = await loginWithGoogle()
      onUserChange(u); onClose()
    } catch(e) { setErr(e.message) }
    finally { setLoading(false) }
  }

  async function handleSignIn(e) {
    e.preventDefault(); setErr(''); setLoading(true)
    try {
      const { loginWithEmail, checkConfigured } = await import('./firebase.js')
      if (!checkConfigured()) { setErr('Firebase not configured.'); return }
      const u = await loginWithEmail(email, pass)
      onUserChange(u); onClose()
    } catch(e) { setErr(e.message) }
    finally { setLoading(false) }
  }

  async function handleSignUp(e) {
    e.preventDefault(); setErr('')
    if (!name.trim())     { setErr('Please enter your name.'); return }
    if (pass.length < 6)  { setErr('Password must be at least 6 characters.'); return }
    if (pass !== confirm) { setErr('Passwords do not match.'); return }
    setLoading(true)
    try {
      const { signUpWithEmail, checkConfigured } = await import('./firebase.js')
      if (!checkConfigured()) { setErr('Firebase not configured.'); return }
      const u = await signUpWithEmail(email, pass, name)
      onUserChange(u); onClose()
    } catch(e) { setErr(e.message) }
    finally { setLoading(false) }
  }

  const isSignIn = tab === 'signin'
  const accent = isSignIn ? ORANGE : 'var(--accent)'

  const inputStyle = {
    width: '100%', boxSizing: 'border-box', padding: '9px 11px',
    borderRadius: 8, border: '1px solid var(--border2)',
    background: 'var(--bg3)', color: 'var(--text)',
    fontSize: 13, fontFamily: 'inherit', outline: 'none',
  }

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:1000,
      display:'flex', alignItems:'center', justifyContent:'center',
      background:'rgba(0,0,0,0.72)', backdropFilter:'blur(5px)',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background:'var(--bg2)', border:'1px solid var(--border2)',
        borderRadius:18, padding:'24px 22px', width:'min(360px, 94vw)',
        boxShadow:'0 16px 56px rgba(0,0,0,0.75)',
      }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
          <div>
            <div style={{ fontWeight:800, fontSize:17, color:'var(--text)' }}>
              {isSignIn ? 'Welcome Back' : 'Create Account'}
            </div>
            <div style={{ fontSize:11, color:'var(--text3)', fontFamily:'var(--mono)', marginTop:2 }}>
              Coins Sniper · Delta India
            </div>
          </div>
          <button onClick={onClose} style={{ background:'none',border:'none',cursor:'pointer',fontSize:20,color:'var(--text3)',lineHeight:1 }}>✕</button>
        </div>

        {/* Tab switcher */}
        <div style={{ display:'flex', gap:6, marginBottom:18, background:'var(--bg3)', borderRadius:10, padding:4 }}>
          {['signin','signup'].map(id => (
            <button key={id} onClick={() => switchTab(id)} style={{
              flex:1, padding:'7px', borderRadius:7, cursor:'pointer', fontSize:12,
              fontWeight:700, fontFamily:'var(--mono)', border:'none',
              background: tab===id ? accent : 'transparent',
              color: tab===id ? '#000' : 'var(--text3)',
              transition:'all .15s',
            }}>{id === 'signin' ? 'Sign In' : 'Sign Up'}</button>
          ))}
        </div>

        {err && (
          <div style={{ padding:'8px 10px', borderRadius:8, background:'rgba(255,60,60,0.1)',
            border:'1px solid rgba(255,60,60,0.3)', color:'var(--red)', fontSize:11,
            fontFamily:'var(--mono)', marginBottom:12 }}>{err}</div>
        )}

        <button onClick={handleGoogle} disabled={loading} style={{
          width:'100%', padding:'10px', borderRadius:9, cursor:'pointer',
          border:'1px solid var(--border2)', background:'var(--bg3)',
          color:'var(--text)', fontSize:13, fontWeight:600, marginBottom:14,
          display:'flex', alignItems:'center', justifyContent:'center', gap:8,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285f4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34a853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#fbbc05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#ea4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          Continue with Google
        </button>

        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
          <div style={{ flex:1, height:1, background:'var(--border)' }}/>
          <span style={{ fontSize:10, color:'var(--text3)', fontFamily:'var(--mono)' }}>or</span>
          <div style={{ flex:1, height:1, background:'var(--border)' }}/>
        </div>

        <form onSubmit={isSignIn ? handleSignIn : handleSignUp} style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {!isSignIn && (
            <input style={inputStyle} placeholder="Full name" value={name} onChange={e=>setName(e.target.value)} autoComplete="name"/>
          )}
          <input style={inputStyle} type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email"/>
          <input style={inputStyle} type="password" placeholder="Password" value={pass} onChange={e=>setPass(e.target.value)} autoComplete={isSignIn?'current-password':'new-password'}/>
          {!isSignIn && (
            <input style={inputStyle} type="password" placeholder="Confirm password" value={confirm} onChange={e=>setConfirm(e.target.value)} autoComplete="new-password"/>
          )}
          <button type="submit" disabled={loading} style={{
            width:'100%', padding:'11px', borderRadius:9, cursor:'pointer',
            border:`1.5px solid ${ORANGE_BORDER}`, background: ORANGE_DIM,
            color: ORANGE, fontSize:13, fontWeight:800, fontFamily:'var(--mono)', marginTop:2,
          }}>
            {loading ? '…' : isSignIn ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <div style={{ textAlign:'center', marginTop:14, fontSize:11, color:'var(--text3)' }}>
          {isSignIn
            ? <>No account? <span onClick={()=>switchTab('signup')} style={{color:ORANGE,cursor:'pointer',fontWeight:700}}>Sign up free</span></>
            : <>Have an account? <span onClick={()=>switchTab('signin')} style={{color:ORANGE,cursor:'pointer',fontWeight:700}}>Sign in</span></>
          }
        </div>
      </div>
    </div>
  )
}

// ── UserMenu ───────────────────────────────────────────────────────────────────
function UserMenu({ user, onLogout, onGoToSettings }) {
  const [open, setOpen] = React.useState(false)
  if (!user) return null
  return (
    <div style={{ position:'relative' }}>
      <button onClick={()=>setOpen(v=>!v)} style={{
        background:'none', border:`1.5px solid ${ORANGE_BORDER}`, borderRadius:20,
        padding:'3px 10px 3px 5px', cursor:'pointer',
        display:'flex', alignItems:'center', gap:6,
        color: ORANGE, fontSize:11, fontFamily:'var(--mono)', fontWeight:700,
      }}>
        <div style={{
          width:22, height:22, borderRadius:'50%', background: ORANGE_DIM,
          border:`1.5px solid ${ORANGE_BORDER}`, display:'flex', alignItems:'center',
          justifyContent:'center', fontSize:11, fontWeight:800, color: ORANGE, flexShrink:0,
        }}>
          {(user.displayName||user.email||'U')[0].toUpperCase()}
        </div>
        {(user.displayName||user.email||'').split(/[\s@]/)[0].slice(0,10)}
      </button>
      {open && (
        <>
          <div onClick={()=>setOpen(false)} style={{ position:'fixed',inset:0,zIndex:299 }}/>
          <div style={{
            position:'absolute', right:0, top:'calc(100% + 6px)', zIndex:300,
            background:'var(--bg2)', border:'1px solid var(--border2)',
            borderRadius:12, padding:8, minWidth:160,
            boxShadow:'0 8px 32px rgba(0,0,0,0.6)',
          }}>
            <div style={{ fontSize:10, fontFamily:'var(--mono)', color:'var(--text3)', padding:'4px 8px 8px' }}>
              {user.email}
            </div>
            <button onClick={()=>{setOpen(false);onGoToSettings()}} style={{
              display:'block', width:'100%', padding:'8px 10px', borderRadius:8,
              border:'none', background:'none', cursor:'pointer', textAlign:'left',
              fontSize:12, fontWeight:600, color:'var(--text2)',
            }}>⚙ Settings</button>
            <button onClick={()=>{setOpen(false);onLogout()}} style={{
              display:'block', width:'100%', padding:'8px 10px', borderRadius:8,
              border:'none', background:'none', cursor:'pointer', textAlign:'left',
              fontSize:12, fontWeight:600, color:'var(--red)',
            }}>↩ Sign out</button>
          </div>
        </>
      )}
    </div>
  )
}

// ── Nav tabs config ────────────────────────────────────────────────────────────
// Coins Sniper: TF tabs + builder + settings (no Binance tabs)
const CS_TABS = [
  { id: '1m',  label: '1m',  color: '#ff6b6b' },
  { id: '3m',  label: '3m',  color: '#ffa94d' },
  { id: '5m',  label: '5m',  color: '#ffd43b' },
  { id: '15m', label: '15m', color: '#69db7c' },
  { id: '30m', label: '30m', color: '#38d9a9' },
  { id: '1h',  label: '1h',  color: '#4dabf7' },
  { id: '4h',  label: '4h',  color: '#9775fa' },
  { id: '1d',  label: 'Day', color: '#f783ac' },
  { id: 'builder',  label: '🔧', color: 'var(--lime)', isBuilder: true },
  { id: 'settings', label: 'settings', color: ORANGE, isSettings: true },
]

// Patterns modal (inline bottom sheet showing pattern list for active TF)
function PatternsModal({ open, onClose, settings, update, onGoToBuilder }) {
  if (!open) return null
  const patterns = (settings.customPatterns || [])
  return (
    <>
      <div onClick={onClose} style={{
        position:'fixed', inset:0, zIndex:499, background:'rgba(0,0,0,0.6)', backdropFilter:'blur(3px)',
      }}/>
      <div style={{
        position:'fixed', bottom:0, left:0, right:0, zIndex:500,
        background:'var(--bg2)', borderRadius:'20px 20px 0 0',
        border:'1px solid var(--border2)', maxHeight:'70vh', overflow:'hidden',
        display:'flex', flexDirection:'column',
      }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 16px 12px' }}>
          <div style={{ fontWeight:800, fontSize:15, color:'var(--text)' }}>Patterns</div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={onGoToBuilder} style={{
              padding:'6px 12px', borderRadius:8, cursor:'pointer',
              border:`1.5px solid ${ORANGE_BORDER}`, background: ORANGE_DIM,
              color: ORANGE, fontSize:11, fontWeight:700, fontFamily:'var(--mono)',
            }}>+ New Pattern</button>
            <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', fontSize:20, color:'var(--text3)', lineHeight:1 }}>✕</button>
          </div>
        </div>
        <div style={{ overflow:'auto', padding:'0 16px 24px' }}>
          {patterns.length === 0 ? (
            <div style={{ textAlign:'center', padding:'32px 16px', color:'var(--text3)', fontSize:12, fontFamily:'var(--mono)' }}>
              No patterns yet.<br/>Tap "+ New Pattern" to build one.
            </div>
          ) : patterns.map(p => {
            const isBull = p.side === 'bull'
            const pColor = isBull ? '#00e676' : '#ff4757'
            const enabledConds = (p.conditions||[]).filter(c=>c.enabled)
            return (
            <div key={p.id} style={{
              borderRadius:11, marginBottom:8,
              background:'var(--bg3)', border:`1.5px solid ${pColor}30`,
            }}>
              {/* Header row */}
              <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px' }}>
                <span style={{ fontSize:18, flexShrink:0 }}>{p.icon || (isBull?'🟢':'🔴')}</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:700, fontSize:13, color:'var(--text)', wordBreak:'break-word' }}>{p.name}</div>
                  <div style={{ fontSize:10, fontFamily:'var(--mono)', color:'var(--text3)', marginTop:2 }}>
                    {(p.tfs||[]).join(' · ') || 'No TFs'} · {enabledConds.length} condition{enabledConds.length!==1?'s':''}
                  </div>
                </div>
                <button onClick={() => update(prev => ({
                  customPatterns: (prev.customPatterns||[]).map(x => x.id===p.id ? {...x, enabled:!x.enabled} : x)
                }))} style={{
                  padding:'4px 10px', borderRadius:7, cursor:'pointer', fontSize:10, fontWeight:700, fontFamily:'var(--mono)',
                  border: p.enabled ? `1px solid ${ORANGE_BORDER}` : '1px solid var(--border)',
                  background: p.enabled ? ORANGE_DIM : 'var(--bg2)',
                  color: p.enabled ? ORANGE : 'var(--text3)',
                  flexShrink:0,
                }}>{p.enabled ? 'ON' : 'OFF'}</button>
              </div>
              {/* Conditions list */}
              {enabledConds.length > 0 && (
                <div style={{ padding:'0 12px 10px', borderTop:'1px solid var(--border)' }}>
                  {enabledConds.map((c,i) => {
                    const formula = [
                      c.lhsField,
                      c.op,
                      c.rhsMode==='number' ? (c.rhsNum??0)
                        : c.rhsMode==='field' ? c.rhsField
                        : c.rhsMode==='mult'  ? `${c.rhsField}×${c.rhsMult??1}`
                        : c.rhsMode==='pct'   ? `${c.rhsField}${c.rhsPct>=0?'+':''}${c.rhsPct??0}%`
                        : c.rhsField
                    ].join(' ')
                    return (
                      <div key={c.id||i} style={{
                        display:'flex', alignItems:'center', gap:6,
                        padding:'4px 0',
                        borderBottom: i < enabledConds.length-1 ? '1px solid var(--border)' : 'none',
                      }}>
                        <div style={{
                          width:16, height:16, borderRadius:4, flexShrink:0,
                          background:`${pColor}20`, border:`1px solid ${pColor}50`,
                          display:'flex', alignItems:'center', justifyContent:'center',
                          fontSize:8, fontWeight:800, color:pColor, fontFamily:'var(--mono)',
                        }}>{i+1}</div>
                        <span style={{ fontSize:10, fontFamily:'var(--mono)', color:'var(--text2)', flex:1, wordBreak:'break-all' }}>
                          {formula}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )})}
        </div>
      </div>
    </>
  )
}

// ── Main App ───────────────────────────────────────────────────────────────────
export default function App() {
  const [activeTab,      setActiveTab]      = useState('15m')
  const [user,           setUser]           = useState(null)
  const [authReady,      setAuthReady]      = useState(false)
  const [alertCounts,    setAlertCounts]    = useState({})
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [scanProgress,   setScanProgress]   = useState({ pct: -1, color: ORANGE })
  const [settingsOpenCount, setSettingsOpenCount] = useState(0)
  const [showPatterns,   setShowPatterns]   = useState(false)
  const [prevTab,        setPrevTab]        = useState('15m')
  const [userTappedTabs, setUserTappedTabs] = useState(new Set())
  const [showExitWarning,setShowExitWarning]= useState(false)

  const HOME_TAB    = '15m'
  const activeTabRef = React.useRef(activeTab)
  const showExitRef  = React.useRef(false)
  activeTabRef.current = activeTab
  showExitRef.current  = showExitWarning

  useEffect(() => {
    window.history.pushState({ coinsSniper: true }, '')
    function handlePop() {
      window.history.pushState({ coinsSniper: true }, '')
      if (showExitRef.current) { setShowExitWarning(false); return }
      const tab = activeTabRef.current
      if (tab !== HOME_TAB) { setActiveTab(HOME_TAB); setPrevTab(tab) }
      else { setShowExitWarning(true) }
    }
    window.addEventListener('popstate', handlePop)
    return () => window.removeEventListener('popstate', handlePop)
  }, [])

  const { settings, update, reset, cloudSynced, cloudSaving, saveNow, saveNowWithPatch, isFirstVisit } = useSettings(user)

  useEffect(() => {
    if (!checkConfigured()) { setAuthReady(true); return }
    let unsub
    onAuthChanged(u => { setUser(u); setAuthReady(true) }).then(fn => { unsub = fn })
    return () => unsub?.()
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.darkMode === false ? 'light' : 'dark')
  }, [settings.darkMode])

  function set(path, value) {
    const parts = path.split('.')
    if (parts.length === 1) { update({ [path]: value }); return }
    update(prev => {
      function setIn(obj, keys, val) {
        const [h, ...t] = keys
        if (!t.length) return { ...obj, [h]: val }
        return { ...obj, [h]: setIn(obj[h] || {}, t, val) }
      }
      return setIn(prev, parts, value)
    })
  }

  const handleAlertCount = useCallback((count) => {
    setAlertCounts(prev => ({ ...prev, [activeTab]: (prev[activeTab]||0) + count }))
  }, [activeTab])

  const handleScanProgress = useCallback((pct, color) => {
    setScanProgress({ pct, color: color || ORANGE })
  }, [])

  function navigateTo(tab) {
    if (tab === 'settings') {
      if (activeTab === 'settings') { setActiveTab(prevTab); return }
      setPrevTab(activeTab)
      setSettingsOpenCount(c => c + 1)
    }
    if (tab === 'builder') {
      if (activeTab === 'builder') { setActiveTab(prevTab); return }
      setPrevTab(activeTab)
    }
    setActiveTab(tab)
  }

  async function handleLogout() {
    const { logout } = await import('./firebase.js')
    await logout()
    setUser(null)
  }

  const togglePatterns = () => setShowPatterns(v => !v)

  return (
    <div className="app-shell-v2">
      {showLoginModal && (
        <LoginModal onClose={() => setShowLoginModal(false)} onUserChange={u => { setUser(u); setShowLoginModal(false) }} />
      )}

      {/* Exit warning */}
      {showExitWarning && (
        <div style={{
          position:'fixed', inset:0, zIndex:3000,
          display:'flex', alignItems:'center', justifyContent:'center',
          background:'rgba(0,0,0,0.75)', backdropFilter:'blur(6px)',
        }}>
          <div style={{
            background:'var(--bg2)', border:`1.5px solid ${ORANGE_BORDER}`,
            borderRadius:20, padding:'28px 24px', width:'min(300px, 88vw)',
            boxShadow:'0 20px 60px rgba(0,0,0,0.8)',
            display:'flex', flexDirection:'column', alignItems:'center', gap:16,
          }}>
            <div style={{ fontSize:42, lineHeight:1 }}>🎯</div>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontWeight:800, fontSize:16, color:'var(--text)', marginBottom:6 }}>Exit Coins Sniper?</div>
              <div style={{ fontSize:12, color:'var(--text3)', fontFamily:'var(--mono)', lineHeight:1.5 }}>
                {scanProgress.pct >= 0 ? 'A scan is running.\nExiting will stop it.' : 'Are you sure you want to exit?'}
              </div>
            </div>
            <div style={{ display:'flex', gap:10, width:'100%' }}>
              <button onClick={() => setShowExitWarning(false)} style={{
                flex:1, padding:'12px', borderRadius:10, cursor:'pointer',
                border:'1.5px solid var(--border2)', background:'var(--bg3)',
                color:'var(--text2)', fontSize:14, fontWeight:700, fontFamily:'var(--mono)',
              }}>Cancel</button>
              <button onClick={() => {
                setShowExitWarning(false)
                try { window.history.go(-(window.history.length)) } catch(_) {}
                try { if (window.navigator?.app?.exitApp) { window.navigator.app.exitApp(); return } } catch(_) {}
                try { window.close() } catch(_) {}
                document.body.innerHTML = ''; document.body.style.background = '#000'
              }} style={{
                flex:1, padding:'12px', borderRadius:10, cursor:'pointer',
                border:'1.5px solid rgba(255,60,60,0.6)', background:'rgba(255,60,60,0.15)',
                color:'var(--red)', fontSize:14, fontWeight:800, fontFamily:'var(--mono)',
              }}>Exit</button>
            </div>
          </div>
        </div>
      )}

      {/* Top bar */}
      <header className="topbar-v2" style={{ borderBottom:'none', position:'relative' }}>
        {/* Progress bar — always acts as the bottom border of the top section */}
        <div style={{ position:'absolute', bottom:0, left:0, right:0, height:2, overflow:'hidden', zIndex:1 }}>
          <div style={{ position:'absolute', inset:0, background:'var(--border)' }}/>
          {scanProgress.pct >= 0 && (
            <div style={{
              position:'absolute', top:0, left:0, bottom:0,
              width:`${scanProgress.pct}%`,
              background: ORANGE,
              boxShadow:`0 0 8px ${ORANGE}cc`,
              transition:'width .2s linear',
            }}/>
          )}
        </div>

        {/* Logo → home */}
        <button onClick={() => setActiveTab('15m')} title="Home · 15m"
          style={{ display:'flex', alignItems:'center', gap:8, background:'none', border:'none',
            cursor:'pointer', padding:'3px 6px 3px 0', borderRadius:8, flexShrink:0 }}>
          <CoinSniperLogo size={32} />
          <div style={{ textAlign:'left' }}>
            <div style={{ fontWeight:800, fontSize:17, color: ORANGE, letterSpacing:'-.02em', lineHeight:1.1 }}>Coins Sniper</div>
            <div style={{ fontSize:8, fontFamily:'var(--mono)', color:'var(--text3)', letterSpacing:'.05em', lineHeight:1 }}>DELTA EXCHANGE INDIA</div>
          </div>
        </button>

        {/* Right side actions */}
        <div style={{ display:'flex', alignItems:'center', gap:6, marginLeft:'auto' }}>
          {/* Pattern toggle */}
          <button onClick={togglePatterns} title="Patterns" style={{
            display:'flex', alignItems:'center', gap:5,
            padding:'5px 10px', borderRadius:8, cursor:'pointer',
            border: showPatterns ? `1.5px solid ${ORANGE_BORDER}` : '1.5px solid var(--border2)',
            background: showPatterns ? ORANGE_DIM : 'var(--bg2)',
            color: showPatterns ? ORANGE : 'var(--text3)',
            fontSize:11, fontFamily:'var(--mono)', fontWeight:700,
          }}>
            <span style={{ fontFamily:'Georgia,serif', fontSize:14, fontWeight:900, letterSpacing:'-1px' }}>P</span>
          </button>

          {/* Settings */}
          <button onClick={() => navigateTo('settings')} title="Settings" style={{
            width:34, height:34, borderRadius:8, cursor:'pointer', display:'flex',
            alignItems:'center', justifyContent:'center',
            border: activeTab==='settings' ? `1.5px solid ${ORANGE_BORDER}` : '1.5px solid var(--border2)',
            background: activeTab==='settings' ? ORANGE_DIM : 'var(--bg2)',
            color: activeTab==='settings' ? ORANGE : 'var(--text3)',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ transition:'transform .3s', transform: activeTab==='settings'?'rotate(45deg)':'rotate(0deg)' }}>
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>

          {/* User / login */}
          {user
            ? <UserMenu user={user} onLogout={handleLogout} onGoToSettings={() => navigateTo('settings')} />
            : (
              <button onClick={() => setShowLoginModal(true)} style={{
                padding:'5px 12px', borderRadius:8, cursor:'pointer',
                border:`1.5px solid ${ORANGE_BORDER}`, background: ORANGE_DIM,
                color: ORANGE, fontSize:11, fontFamily:'var(--mono)', fontWeight:700,
              }}>Sign In</button>
            )
          }
        </div>
      </header>

      {/* Main content */}
      <main className="content-scroll-v2">
        {/* Delta Scanner tabs — one per TF */}
        {CS_TABS.filter(t => !t.isSettings && !t.isBuilder).map(tab => (
          <div key={tab.id} style={{ display: activeTab === tab.id ? 'block' : 'none', height: '100%' }}>
            <ErrorBoundary>
              <DeltaScannerTab
                timeframe={tab.id}
                settings={settings}
                update={update}
                saveNowWithPatch={saveNowWithPatch}
                user={user}
                isActive={activeTab === tab.id && userTappedTabs.has(tab.id)}
                onAlertCount={handleAlertCount}
                onGoToPatterns={() => { setShowPatterns(true) }}
                triggerAutoScan={activeTab === tab.id && userTappedTabs.has(tab.id)}
              />
            </ErrorBoundary>
          </div>
        ))}

        {activeTab === 'settings' && (
          <ErrorBoundary>
            <SettingsTab settings={settings} set={set} update={update} reset={reset}
              user={user} onUserChange={setUser} cloudSynced={cloudSynced}
              cloudSaving={cloudSaving} onSaveNow={saveNow} saveNowWithPatch={saveNowWithPatch}
              openCount={settingsOpenCount} />
          </ErrorBoundary>
        )}

        {activeTab === 'builder' && (
          <ErrorBoundary>
            <PatternBuilderTab settings={settings} update={update} saveNowWithPatch={saveNowWithPatch} />
          </ErrorBoundary>
        )}
      </main>

      {/* Bottom nav */}
      <nav className="bottom-nav-v2">
        {CS_TABS.map(tab => {
          const isActive = activeTab === tab.id
          const count = (!tab.isSettings && !tab.isBuilder) ? (alertCounts[tab.id] || 0) : 0
          return (
            <button
              key={tab.id}
              className={`bottom-tab${tab.isSettings?' bottom-tab-settings':''}${tab.isBuilder&&isActive?' bottom-tab-builder-active':''}`}
              onClick={() => {
                if (!tab.isSettings && !tab.isBuilder) {
                  setUserTappedTabs(prev => new Set([...prev, tab.id]))
                }
                navigateTo(tab.id)
              }}
              style={{
                color: isActive ? tab.color : 'var(--text3)',
                background: isActive ? `${tab.color}10` : 'transparent',
                borderTop: isActive ? `2px solid ${tab.color}` : '2px solid transparent',
              }}>
              {tab.isSettings ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  style={{ transition:'transform .3s', transform: isActive?'rotate(45deg)':'rotate(0deg)' }}>
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
              ) : tab.isBuilder ? (
                <span style={{
                  fontFamily:'Georgia,"Times New Roman",serif',
                  fontSize:20, fontWeight:900, lineHeight:1,
                  color: isActive ? 'var(--lime)' : 'currentColor',
                  letterSpacing:'-1px', display:'block',
                }}>P</span>
              ) : (
                <span className="bottom-tab-label">{tab.label}</span>
              )}
              {count > 0 && (
                <span className="bottom-tab-badge" style={{ background: tab.color, color:'#000' }}>
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {/* Patterns bottom sheet */}
      <PatternsModal
        open={showPatterns}
        onClose={togglePatterns}
        settings={settings}
        update={update}
        onGoToBuilder={() => { setShowPatterns(false); navigateTo('builder') }}
      />
    </div>
  )
}
