import React, { useState } from 'react'
import { SectionHeader, Toggle, SettingRow, SectionCard, PillGroup } from '../UI'
import { sendTelegram } from '../../utils/scanner'

// ── Appearance ────────────────────────────────────────────────────────────────
export function AppearanceSection({ cfg, set }) {
  return (
    <div>
      <SectionHeader title="Appearance" sub="Visual theme" />
      <SectionCard>
        <SettingRow label="Dark Mode" sub={cfg.darkMode ? 'Dark theme active' : 'Light theme active'}>
          <Toggle checked={!!cfg.darkMode} onChange={v => set('darkMode', v)} />
        </SettingRow>
      </SectionCard>
    </div>
  )
}

// ── Timeframe ─────────────────────────────────────────────────────────────────
export function TimeframeSection({ cfg, set }) {
  const TFS = ['5m', '15m', '1h', '4h']
  return (
    <div>
      <SectionHeader title="Timeframe" sub="Select candle timeframe for signal detection" />
      <SectionCard>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)', marginBottom: 10 }}>Candle Timeframe</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {TFS.map(tf => (
              <button key={tf} onClick={() => set('timeframe', tf)} style={{
                flex: 1, padding: '10px 4px', borderRadius: 7,
                border: `2px solid ${cfg.timeframe === tf ? 'var(--accent)' : 'var(--border)'}`,
                background: cfg.timeframe === tf ? 'var(--accent-dim)' : 'var(--bg2)',
                color: cfg.timeframe === tf ? 'var(--accent)' : 'var(--text3)',
                fontFamily: 'var(--mono)', fontSize: 13, fontWeight: cfg.timeframe === tf ? 800 : 400,
                cursor: 'pointer', transition: 'all .2s',
              }}>{tf}</button>
            ))}
          </div>
          <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', marginTop: 8 }}>
            Changing timeframe affects all pattern detection · Save persists across sessions
          </div>
        </div>

        <SettingRow label="Scan Interval" sub="How often auto-scan repeats">
          <div style={{ display: 'flex', gap: 4 }}>
            {[['15s','15s'],['30s','30s'],['1m','1m'],['5m','5m'],['15m','15m'],['1h','1h']].map(([v, l]) => (
              <button key={v} onClick={() => set('scanInterval', v)} style={{
                padding: '5px 10px', borderRadius: 6,
                border: `1px solid ${cfg.scanInterval === v ? 'var(--green2)' : 'var(--border)'}`,
                background: cfg.scanInterval === v ? 'var(--green-dim)' : 'var(--bg2)',
                color: cfg.scanInterval === v ? 'var(--green)' : 'var(--text3)',
                fontFamily: 'var(--mono)', fontSize: 11, fontWeight: cfg.scanInterval === v ? 700 : 400, cursor: 'pointer',
              }}>{l}</button>
            ))}
          </div>
        </SettingRow>
      </SectionCard>
    </div>
  )
}

// ── Default Result Sort ─────────────────────────────────────────────────────
export function DefaultSortSection({ cfg, set, clearSortOverrides }) {
  const SORT_OPTS = [['time','Time'],['symbol','Symbol'],['pattern','Pattern'],['gain','Gain'],['volume','Volume']]
  return (
    <div>
      <SectionHeader title="Result Sort" sub="Default sort applied to fresh scan results" />
      <SectionCard>
        <SettingRow label="Sort By" sub="Column used to order results by default">
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {SORT_OPTS.map(([v, l]) => (
              <button key={v} onClick={() => set('defaultSort', v)} style={{
                padding: '5px 10px', borderRadius: 6,
                border: `1px solid ${cfg.defaultSort === v ? 'var(--accent)' : 'var(--border)'}`,
                background: cfg.defaultSort === v ? 'var(--accent-dim)' : 'var(--bg2)',
                color: cfg.defaultSort === v ? 'var(--accent)' : 'var(--text3)',
                fontFamily: 'var(--mono)', fontSize: 11, fontWeight: cfg.defaultSort === v ? 700 : 400, cursor: 'pointer',
              }}>{l}</button>
            ))}
          </div>
        </SettingRow>

        <SettingRow label="Sort Direction" sub="Order applied with the column above">
          <div style={{ display: 'flex', gap: 4 }}>
            {[['desc','High → Low'],['asc','Low → High']].map(([v, l]) => (
              <button key={v} onClick={() => set('defaultSortDir', v)} style={{
                padding: '5px 10px', borderRadius: 6,
                border: `1px solid ${cfg.defaultSortDir === v ? 'var(--accent)' : 'var(--border)'}`,
                background: cfg.defaultSortDir === v ? 'var(--accent-dim)' : 'var(--bg2)',
                color: cfg.defaultSortDir === v ? 'var(--accent)' : 'var(--text3)',
                fontFamily: 'var(--mono)', fontSize: 11, fontWeight: cfg.defaultSortDir === v ? 700 : 400, cursor: 'pointer',
              }}>{l}</button>
            ))}
          </div>
        </SettingRow>

        <div style={{ marginTop: 4 }}>
          <button onClick={clearSortOverrides} style={{
            width: '100%', padding: '10px', borderRadius: 8, cursor: 'pointer',
            border: '1.5px solid rgba(255,200,0,0.5)', background: 'rgba(255,200,0,0.08)',
            color: '#ffc800', fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700,
          }}>Reset Sort On All Timeframes</button>
          <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)', marginTop: 6 }}>
            Once you tap a sort column in a scanner tab, that tab remembers your choice and
            stops following the default above. Use this to clear those per-tab overrides.
          </div>
        </div>
      </SectionCard>
    </div>
  )
}

// ── Alerts & Notifications ────────────────────────────────────────────────────
function TgTestBtn({ token, chatId, onSave }) {
  const [st, setSt] = useState('idle')
  const send = async () => {
    if (!token || !chatId) { setSt('fail'); setTimeout(() => setSt('idle'), 3000); return }
    onSave?.() // flush buffered values to settings before test
    setSt('sending')
    try {
      await sendTelegram(token, chatId, '✅ Candle Alert — Telegram connected successfully!')
      setSt('ok')
    } catch { setSt('fail') }
    setTimeout(() => setSt('idle'), 4000)
  }
  const col = st === 'ok' ? 'var(--green)' : st === 'fail' ? 'var(--red)' : 'var(--accent)'
  const label = st === 'sending' ? 'SENDING…' : st === 'ok' ? '✓ SENT!' : st === 'fail' ? '✗ FAILED' : 'SEND TEST MSG'
  return (
    <button onClick={send} disabled={st === 'sending'} style={{
      width: '100%', marginTop: 8, marginBottom: 4, padding: '9px 12px',
      border: `1px solid ${col}55`, background: `${col}10`, color: col,
      fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700, cursor: 'pointer',
      borderRadius: 6, transition: 'all .2s',
    }}>{label}</button>
  )
}

export function AlertsSection({ cfg, set }) {
  // Buffer telegram fields locally — flush to settings on blur to avoid stale-closure issues
  const [tgToken,  setTgToken]  = React.useState(cfg.tgToken  || '')
  const [tgChatId, setTgChatId] = React.useState(cfg.tgChatId || '')

  // Sync if parent settings change externally (e.g. reset)
  React.useEffect(() => { setTgToken(cfg.tgToken  || '') }, [cfg.tgToken])
  React.useEffect(() => { setTgChatId(cfg.tgChatId || '') }, [cfg.tgChatId])

  return (
    <div>
      <SectionHeader title="Alerts & Notifications" sub="Sound, Telegram and push notification settings" />

      <SectionCard>
        <SettingRow label="Sound Alert" sub={cfg.soundEnabled ? 'Plays tone on each signal' : 'Silent mode'}>
          <Toggle checked={!!cfg.soundEnabled} onChange={v => set('soundEnabled', v)} />
        </SettingRow>

        <SettingRow label="Telegram Alert" sub={cfg.tgOn ? 'Sending to your Telegram bot' : 'Disabled'}>
          <Toggle checked={!!cfg.tgOn} onChange={v => set('tgOn', v)} />
        </SettingRow>

        {cfg.tgOn && (
          <div style={{ paddingTop: 12 }}>
            <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', marginBottom: 5 }}>Bot Token:</div>
            <input
              className="field"
              placeholder="123456789:AAF..."
              value={tgToken}
              onChange={e => setTgToken(e.target.value)}
              onBlur={() => set('tgToken', tgToken)}
              style={{ marginBottom: 10 }}
            />
            <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', marginBottom: 5 }}>Chat ID:</div>
            <input
              className="field"
              placeholder="Your chat ID (use @userinfobot)"
              value={tgChatId}
              onChange={e => setTgChatId(e.target.value)}
              onBlur={() => set('tgChatId', tgChatId)}
            />
            <TgTestBtn token={tgToken} chatId={tgChatId} onSave={() => { set('tgToken', tgToken); set('tgChatId', tgChatId) }} />
            <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>
              Get token from @BotFather · Get ID from @userinfobot
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  )
}
