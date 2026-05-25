import React, { useState } from 'react'
import { loginWithGoogle, loginWithEmail, logout, checkConfigured } from '../../firebase'
import { SectionHeader, SectionCard } from '../UI'

export default function AccountSection({ user, onUserChange, cloudSynced, cloudSaving, onSaveNow }) {
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const configured = checkConfigured()

  async function handleGoogle() {
    setErr('')
    if (!configured) { setErr('Firebase not configured. Add VITE_FB_* to .env'); return }
    setLoading(true)
    try { const u = await loginWithGoogle(); onUserChange(u) }
    catch (e) { setErr(e.message) }
    finally { setLoading(false) }
  }

  async function handleEmail(e) {
    e.preventDefault(); setErr('')
    if (!configured) { setErr('Firebase not configured.'); return }
    setLoading(true)
    try { const u = await loginWithEmail(email, pass); onUserChange(u) }
    catch (e) { setErr(e.message) }
    finally { setLoading(false) }
  }

  async function handleLogout() {
    await logout(); onUserChange(null)
  }

  async function handleSaveNow() {
    setSaveMsg('')
    const ok = await onSaveNow?.()
    setSaveMsg(ok ? '✓ Saved to cloud' : '✗ Save failed')
    setTimeout(() => setSaveMsg(''), 3000)
  }

  return (
    <div>
      <SectionHeader title="Account" sub="Sign in to sync settings across devices via Firebase" />

      {!configured && (
        <div style={{ background:'var(--amber-dim)', border:'1px solid var(--amber)', borderRadius:8, padding:'10px 14px', marginBottom:12 }}>
          <span style={{ color:'var(--amber)', fontSize:12, fontFamily:'var(--mono)' }}>
            Firebase not configured — settings are local-only. Add VITE_FB_* to .env
          </span>
        </div>
      )}

      {user ? (
        <SectionCard>
          {/* User row */}
          <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:16 }}>
            {user.photoURL && (
              <img src={user.photoURL} alt="" style={{ width:44, height:44, borderRadius:'50%', border:'2px solid var(--green2)' }} />
            )}
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontWeight:700, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {user.displayName || user.email}
              </div>
              <div style={{ fontSize:12, color:'var(--text3)', fontFamily:'var(--mono)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{user.email}</div>
            </div>
            <span style={{ fontSize:20, flexShrink:0 }}>☁</span>
          </div>

          {/* Cloud sync status */}
          <div style={{ background:'var(--bg2)', borderRadius:8, padding:'10px 14px', marginBottom:12,
            border:`1px solid ${cloudSaving?'var(--amber)':cloudSynced?'var(--green2)':'var(--border)'}` }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:16 }}>{cloudSaving ? '⟳' : cloudSynced ? '✓' : '○'}</span>
              <div>
                <div style={{ fontSize:13, fontWeight:700, color:cloudSaving?'var(--amber)':cloudSynced?'var(--green)':'var(--text2)' }}>
                  {cloudSaving ? 'Saving to cloud…' : cloudSynced ? 'Settings synced to Firebase' : 'Not yet synced'}
                </div>
                <div style={{ fontSize:11, color:'var(--text3)', fontFamily:'var(--mono)', marginTop:2 }}>
                  Settings auto-save 2s after any change
                </div>
              </div>
            </div>
          </div>

          {/* Save now button */}
          <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:12 }}>
            <button onClick={handleSaveNow} disabled={cloudSaving}
              style={{ padding:'8px 16px', borderRadius:6, border:'1px solid var(--green2)',
                background:'var(--green-dim)', color:'var(--green)', fontSize:13, fontWeight:700, cursor:'pointer' }}>
              {cloudSaving ? '⟳ Saving…' : '☁ Save Now'}
            </button>
            {saveMsg && (
              <span style={{ fontSize:12, fontFamily:'var(--mono)',
                color:saveMsg.startsWith('✓')?'var(--green)':'var(--red)' }}>
                {saveMsg}
              </span>
            )}
          </div>

          <button onClick={handleLogout}
            style={{ padding:'8px 20px', borderRadius:6,
              border:'1px solid var(--red)', background:'var(--red-dim)',
              color:'var(--red)', fontSize:13, fontWeight:600, cursor:'pointer' }}>
            Sign Out
          </button>
        </SectionCard>
      ) : (
        <SectionCard>
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <button onClick={handleGoogle} disabled={loading}
              style={{ padding:'10px 20px', borderRadius:6,
                border:'1px solid var(--border2)', background:'var(--bg2)',
                color:'var(--text)', fontSize:13, fontWeight:600, cursor:'pointer',
                display:'flex', alignItems:'center', gap:8, justifyContent:'center' }}>
              <svg width="18" height="18" viewBox="0 0 48 48">
                <path fill="#4285F4" d="M44.5 20H24v8.5h11.7C34.1 33.5 29.6 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.1 8 3l6-6C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 19.7-8 19.7-20 0-1.3-.1-2.7-.2-4z"/>
              </svg>
              {loading ? 'Signing in…' : 'Continue with Google'}
            </button>

            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ flex:1, height:1, background:'var(--border)' }} />
              <span style={{ fontSize:11, color:'var(--text3)', fontFamily:'var(--mono)' }}>or email</span>
              <div style={{ flex:1, height:1, background:'var(--border)' }} />
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              <input className="field" type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
              <input className="field" type="password" placeholder="Password" value={pass} onChange={e => setPass(e.target.value)} />
              <button onClick={handleEmail} disabled={loading}
                style={{ padding:'9px', borderRadius:6,
                  border:'1px solid var(--green2)', background:'var(--green-dim)',
                  color:'var(--green)', fontSize:13, fontWeight:700, cursor:'pointer' }}>
                {loading ? 'Signing in…' : 'Sign In'}
              </button>
            </div>

            {err && <div style={{ fontSize:12, color:'var(--red)', fontFamily:'var(--mono)' }}>{err}</div>}

            <div style={{ fontSize:11, color:'var(--text3)', fontFamily:'var(--mono)' }}>
              Not signed in. Settings saved locally only.
            </div>
          </div>
        </SectionCard>
      )}
    </div>
  )
}
