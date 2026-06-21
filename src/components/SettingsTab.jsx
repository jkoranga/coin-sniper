import React, { useState, useMemo } from 'react'
import { Toggle } from './UI.jsx'
import { ALL_SCANNERS, TF_META, TF_ORDER } from '../utils/scanners.js'
import { sendTelegram } from '../utils/scanner.js'
import { AppearanceSection, AlertsSection, DefaultSortSection } from './sections/GeneralSections.jsx'
import CustomPairsSection from './sections/CustomPairsSection.jsx'
import AccountSection from './sections/AccountSection.jsx'
import { historyLoad, historySave, fmtHistoryDate, exportHistoryCSV, tvUrl, TF_COLORS, HISTORY_CAP } from '../utils/history.js'

// ── All available TFs for pattern selection ───────────────
const PATTERN_TF_LIST = ['1m','3m','5m','15m','30m','1h','4h','1d']

// Default TFs for a scanner — uses scanner.tfs if defined, else ALL timeframes
function defaultTfsForScanner(scanner) {
  return scanner.tfs && scanner.tfs.length > 0
    ? scanner.tfs
    : ['1m','3m','5m','15m','30m','1h','4h','1d']
}

// Resolve effective TF list for a scanner from saved patternTfs, with migration.
// [] (explicitly cleared) is respected as-is. Only fall back to default when key is absent.
export function getPatternTfs(patternTfs, scanner) {
  if (patternTfs && scanner.id in patternTfs) {
    return patternTfs[scanner.id]  // may be [] — honour the explicit choice
  }
  return defaultTfsForScanner(scanner)
}

// ── Accordion ─────────────────────────────────────────────
function Accordion({ title, icon, badge, defaultOpen=false, children, accentColor, openKey }) {
  const [open, setOpen] = useState(defaultOpen)
  const prevKeyRef = React.useRef(openKey)
  React.useEffect(() => {
    if (openKey !== prevKeyRef.current) {
      prevKeyRef.current = openKey
      setOpen(false)
    }
  }, [openKey])
  return (
    <div style={{
      border:`1.5px solid ${open&&accentColor?accentColor:'var(--border)'}`,
      borderRadius:'var(--radius)',marginBottom:10,
      background:'var(--bg1)',overflow:'hidden',transition:'border-color .2s',
    }}>
      <button onClick={()=>setOpen(o=>!o)} style={{
        width:'100%',display:'flex',alignItems:'center',gap:10,
        padding:'13px 16px',background:'none',border:'none',cursor:'pointer',
        borderBottom:open?'1px solid var(--border)':'none',
      }}>
        {icon&&<span style={{fontSize:17}}>{icon}</span>}
        <span style={{flex:1,fontWeight:700,fontSize:14,color:'var(--text)',textAlign:'left'}}>{title}</span>
        {badge&&<span style={{fontSize:9,fontFamily:'var(--mono)',fontWeight:700,padding:'2px 7px',borderRadius:8,
          letterSpacing:'.06em',background:'var(--accent-dim)',color:'var(--accent)',border:'1px solid var(--accent)'}}>{badge}</span>}
        <span style={{color:'var(--text3)',fontSize:12,display:'inline-block',transition:'transform .2s',transform:open?'rotate(180deg)':'rotate(0deg)'}}>▼</span>
      </button>
      {open&&<div style={{padding:'14px'}}>{children}</div>}
    </div>
  )
}

// ── TF Chip Selector ──────────────────────────────────────
// Inline multi-select with checkbox-style chips — full clear allowed
function TFChipSelector({ scannerId, selectedTfs, onChange, accentColor }) {
  const col = accentColor || 'var(--accent)'

  function toggle(tf) {
    const next = selectedTfs.includes(tf)
      ? selectedTfs.filter(t => t !== tf)
      : [...selectedTfs, tf]
    onChange(next)
  }

  function selectAll() { onChange([...PATTERN_TF_LIST]) }
  function clearAll()  { onChange([]) }  // fully unchecks all

  const allSelected = PATTERN_TF_LIST.every(tf => selectedTfs.includes(tf))
  const noneSelected = selectedTfs.length === 0

  return (
    <div style={{
      padding:'10px 13px 12px',
      borderTop:'1px solid var(--border)',
      background:'rgba(0,0,0,0.18)',
    }}>
      {/* Row label + bulk actions */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8, gap:6 }}>
        <span style={{ fontSize:10, fontFamily:'var(--mono)', fontWeight:700, color:'var(--text3)', letterSpacing:'.05em' }}>
          TIMEFRAMES
        </span>
        <div style={{ display:'flex', gap:4 }}>
          <button
            onClick={e => { e.stopPropagation(); selectAll() }}
            style={{
              fontSize:9, fontFamily:'var(--mono)', fontWeight:700,
              padding:'2px 8px', borderRadius:4, cursor:'pointer',
              border:`1px solid ${allSelected ? 'rgba(0,230,118,0.7)' : 'rgba(0,230,118,0.4)'}`,
              background: allSelected ? 'rgba(0,230,118,0.18)' : 'rgba(0,230,118,0.07)',
              color:'var(--green)', transition:'all .15s',
            }}>
            ✓ Select All
          </button>
          <button
            onClick={e => { e.stopPropagation(); clearAll() }}
            style={{
              fontSize:9, fontFamily:'var(--mono)', fontWeight:700,
              padding:'2px 8px', borderRadius:4, cursor:'pointer',
              border:`1px solid ${noneSelected ? 'rgba(255,70,70,0.7)' : 'rgba(255,70,70,0.35)'}`,
              background: noneSelected ? 'rgba(255,70,70,0.15)' : 'rgba(255,70,70,0.07)',
              color:'var(--red)', transition:'all .15s',
            }}>
            ✗ Clear All
          </button>
        </div>
      </div>

      {/* Checkbox-style TF chips */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
        {PATTERN_TF_LIST.map(tf => {
          const checked = selectedTfs.includes(tf)
          const meta = TF_META[tf] || {}
          const chipCol = checked ? (meta.color || col) : 'var(--text3)'
          return (
            <button
              key={tf}
              onClick={e => { e.stopPropagation(); toggle(tf) }}
              style={{
                display:'flex', alignItems:'center', gap:5,
                fontSize:10, fontFamily:'var(--mono)', fontWeight: checked ? 800 : 500,
                padding:'5px 9px', borderRadius:6, cursor:'pointer',
                border:`1.5px solid ${checked ? chipCol : 'var(--border)'}`,
                background: checked ? `${chipCol}20` : 'var(--bg2)',
                color: checked ? chipCol : 'var(--text3)',
                transition:'all .15s',
                boxShadow: checked ? `0 0 7px ${chipCol}44` : 'none',
              }}
            >
              <span style={{
                display:'inline-flex', alignItems:'center', justifyContent:'center',
                width:12, height:12, borderRadius:3, flexShrink:0,
                border:`1.5px solid ${checked ? chipCol : 'var(--border)'}`,
                background: checked ? chipCol : 'transparent',
                transition:'all .15s',
              }}>
                {checked && (
                  <svg width="7" height="7" viewBox="0 0 8 8" fill="none">
                    <polyline points="1,4 3.2,6.2 7,2" stroke="#000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </span>
              {tf === '1d' ? 'Day' : tf}
            </button>
          )
        })}
      </div>

      <div style={{ fontSize:9, fontFamily:'var(--mono)', marginTop:6,
        color: noneSelected ? 'var(--red)' : 'var(--text3)', opacity: noneSelected ? 1 : 0.6 }}>
        {noneSelected
          ? '⚠ No TF selected — pattern will not scan'
          : `${selectedTfs.length} of ${PATTERN_TF_LIST.length} TFs selected · scans only these`
        }
      </div>
    </div>
  )
}

// ── Scanner def card ──────────────────────────────────────
function ScannerDefCard({ scanner, expanded, onTap, enabled, onToggle, selectedTfs, onTfsChange }) {
  const isBull = scanner.side==='bull'
  const col = isBull?'var(--green)':'var(--red)'
  const bd  = isBull?'rgba(0,200,100,0.5)':'rgba(255,60,80,0.5)'
  const bg  = isBull?'rgba(0,230,118,0.07)':'rgba(255,60,80,0.07)'
  const isAdv = scanner.group==='advanced'

  return (
    <div style={{
      borderRadius:10, border:`1.5px solid ${enabled?bd:'var(--border)'}`,
      background:enabled?bg:'var(--bg2)', opacity:enabled?1:0.55, transition:'all .18s', flexShrink:0,
    }}>
      {/* Header row */}
      <div style={{display:'flex',alignItems:'center',gap:10,padding:'11px 13px',cursor:'pointer',minHeight:54}} onClick={onTap}>
        <span style={{fontSize:20,flexShrink:0}}>{scanner.icon}</span>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:2,flexWrap:'wrap'}}>
            <div style={{fontWeight:700,fontSize:13,color:enabled?col:'var(--text2)',letterSpacing:'-.01em'}}>{scanner.name}</div>
            {isAdv&&<span style={{fontSize:8,fontFamily:'var(--mono)',fontWeight:800,padding:'1px 5px',borderRadius:4,
              background:'rgba(150,100,255,0.15)',color:'#b388ff',border:'1px solid rgba(150,100,255,0.3)',flexShrink:0}}>ADV</span>}
          </div>
          {/* Selected TF pills — compact display */}
          <div style={{display:'flex',flexWrap:'wrap',gap:3,marginTop:2}}>
            {selectedTfs.length > 0 ? selectedTfs.map(tf => {
              const meta = TF_META[tf] || {}
              const tfCol = enabled ? (meta.color || col) : 'var(--text3)'
              return (
                <span key={tf} style={{
                  fontSize:8, fontFamily:'var(--mono)', fontWeight:700,
                  padding:'1px 5px', borderRadius:4,
                  background: enabled ? `${tfCol}18` : 'var(--bg3)',
                  color: enabled ? tfCol : 'var(--text3)',
                  border:`1px solid ${enabled ? tfCol+'44' : 'var(--border)'}`,
                }}>
                  {tf === '1d' ? 'Day' : tf}
                </span>
              )
            }) : (
              <span style={{fontSize:8,fontFamily:'var(--mono)',color:'var(--red)',fontWeight:700}}>⚠ No TF</span>
            )}
          </div>
          <div style={{fontSize:10,color:'var(--text3)',fontFamily:'var(--mono)',lineHeight:1.4,marginTop:2}}>{scanner.sub}</div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:7,flexShrink:0}} onClick={e=>e.stopPropagation()}>
          <span className={`badge ${isBull?'badge-green':'badge-red'}`} style={{fontSize:9}}>{scanner.badge}</span>
          <Toggle checked={!!enabled} onChange={v=>onToggle?.(v)}/>
        </div>
        <span style={{color:'var(--text3)',fontSize:11,flexShrink:0}}>{expanded?'▲':'▼'}</span>
      </div>

      {/* Expanded panel: TF selector + conditions */}
      {expanded && (
        <>
          {/* TF chip selector */}
          <TFChipSelector
            scannerId={scanner.id}
            selectedTfs={selectedTfs}
            onChange={onTfsChange}
            accentColor={col}
          />
          {/* Conditions */}
          <div style={{borderTop:`1px solid ${bd}`,background:'rgba(0,0,0,0.12)',padding:'10px 14px'}}>
            <div style={{fontSize:9,fontFamily:'var(--mono)',color:'var(--text3)',fontWeight:700,letterSpacing:'.05em',marginBottom:6}}>CONDITIONS</div>
            {scanner.conditions.map((cond,i)=>(
              <div key={i} style={{display:'flex',alignItems:'flex-start',gap:8,padding:'4px 0'}}>
                <span style={{color:col,fontSize:11,marginTop:2,flexShrink:0}}>◆</span>
                <span style={{fontSize:11,color:'var(--text2)',lineHeight:1.5}}>{cond}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Scan Settings section ─────────────────────────────────
function ScanSettingsSection({ settings, update, saveNowWithPatch }) {
  function set(key, val) { update({ [key]: val }) }

  const DEDUP_OPTIONS = ['1m','3m','5m','15m','30m','1h','4h','1d']
  const VOLUME_FILTERS = [
    {id:'all',  label:'All Vol'},
    {id:'500k', label:'>500K'},
    {id:'1m',   label:'>1M'},
    {id:'5m',   label:'>5M'},
    {id:'10m',  label:'>10M'},
  ]

  return (
    <div>
      {/* Symbol Set */}
      <div className="setting-row">
        <div className="row-label">
          <span>Symbol Set</span>
          <small>How many coins to scan per run</small>
        </div>
        <div style={{display:'flex',gap:4,flexWrap:'wrap',justifyContent:'flex-end'}}>
          {[['top30','Top 30'],['top100','Top 100'],['top200','Top 200'],['top500','Top 500'],['all','All']].map(([s,l])=>(
            <button key={s} className={`btn-small ${settings.symbolSet===s?'active':''}`}
              onClick={()=>set('symbolSet',s)}
              style={settings.symbolSet===s?{borderColor:'var(--accent)',color:'var(--accent)',background:'var(--accent-dim)'}:{}}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Scan Interval */}
      <div className="setting-row">
        <div className="row-label">
          <span>Auto Scan Interval</span>
          <small>Wait time between auto-scan cycles</small>
        </div>
        <div style={{display:'flex',gap:4,flexWrap:'wrap',justifyContent:'flex-end'}}>
          {['15s','30s','1m','3m','5m','15m','30m','1h'].map(si=>(
            <button key={si} className={`btn-small ${settings.scanInterval===si?'active':''}`}
              onClick={()=>set('scanInterval',si)}
              style={settings.scanInterval===si?{borderColor:'var(--green2)',color:'var(--green)',background:'var(--green-dim)'}:{}}>
              {si}
            </button>
          ))}
        </div>
      </div>

      {/* Dedup Interval */}
      <div className="setting-row">
        <div className="row-label">
          <span>Dedup Interval</span>
          <small>Suppress same coin+pattern within this window</small>
        </div>
        <div style={{display:'flex',gap:4,flexWrap:'wrap',justifyContent:'flex-end'}}>
          {DEDUP_OPTIONS.map(d=>(
            <button key={d} className={`btn-small ${settings.dedupInterval===d?'active':''}`}
              onClick={()=>set('dedupInterval',d)}
              style={settings.dedupInterval===d?{borderColor:'var(--amber)',color:'var(--amber)',background:'rgba(255,167,38,0.1)'}:{}}>
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* Volume Filter */}
      <div className="setting-row">
        <div className="row-label">
          <span>Default Volume Filter</span>
          <small>Minimum 24h volume to show in results</small>
        </div>
        <div style={{display:'flex',gap:4,flexWrap:'wrap',justifyContent:'flex-end'}}>
          {VOLUME_FILTERS.map(f=>(
            <button key={f.id} className={`btn-small ${settings.volumeFilter===f.id?'active':''}`}
              onClick={()=>set('volumeFilter',f.id)}
              style={settings.volumeFilter===f.id?{borderColor:'var(--purple)',color:'var(--purple)',background:'var(--purple-dim)'}:{}}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Default View Mode */}
      <div className="setting-row">
        <div className="row-label">
          <span>Default View</span>
          <small>List or card view for scan results</small>
        </div>
        <div style={{display:'flex',gap:4}}>
          {[['list','≡ List'],['cards','⊞ Cards']].map(([v,l])=>(
            <button key={v} className={`btn-small ${settings.defaultViewMode===v?'active':''}`}
              onClick={()=>set('defaultViewMode',v)}
              style={settings.defaultViewMode===v?{borderColor:'var(--accent)',color:'var(--accent)',background:'var(--accent-dim)'}:{}}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Default Result Filter */}
      <div className="setting-row">
        <div className="row-label">
          <span>Default Signal Filter</span>
          <small>Show all, only bull, or only bear signals</small>
        </div>
        <div style={{display:'flex',gap:4}}>
          {[['all','All'],['bull','🟢 Bull'],['bear','🔴 Bear']].map(([v,l])=>(
            <button key={v} className={`btn-small ${settings.defaultResultFilter===v?'active':''}`}
              onClick={()=>set('defaultResultFilter',v)}
              style={settings.defaultResultFilter===v
                ?{borderColor: v==='bull'?'var(--green2)':v==='bear'?'var(--red2)':'var(--accent)',
                   color:v==='bull'?'var(--green)':v==='bear'?'var(--red)':'var(--accent)',
                   background:v==='bull'?'var(--green-dim)':v==='bear'?'var(--red-dim)':'var(--accent-dim)'}
                :{}}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Concurrency */}
      <div className="setting-row">
        <div className="row-label">
          <span>Scan Concurrency</span>
          <small>Parallel symbol fetches — higher = faster but more memory</small>
        </div>
        <div style={{display:'flex',gap:4,flexWrap:'wrap',justifyContent:'flex-end'}}>
          {[['10','10'],['20','20'],['30','30 (default)'],['50','50'],['100','100']].map(([v,l])=>(
            <button key={v} className={`btn-small ${String(settings.concurrency||30)===v?'active':''}`}
              onClick={()=>set('concurrency', parseInt(v))}
              style={String(settings.concurrency||30)===v?{borderColor:'var(--lime)',color:'var(--lime)',background:'var(--lime-dim)'}:{}}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Cache TTL */}
      <div className="setting-row" style={{borderBottom:'none',paddingBottom:0}}>
        <div className="row-label">
          <span>Candle Cache TTL</span>
          <small>How long fetched candles are reused before re-fetching</small>
        </div>
        <div style={{display:'flex',gap:4,flexWrap:'wrap',justifyContent:'flex-end'}}>
          {[['1m','1m'],['2m','2m'],['3m','3m (default)'],['5m','5m'],['10m','10m']].map(([v,l])=>(
            <button key={v} className={`btn-small ${(settings.cacheTtl||'3m')===v?'active':''}`}
              onClick={()=>set('cacheTtl',v)}
              style={(settings.cacheTtl||'3m')===v?{borderColor:'var(--blue)',color:'var(--blue)',background:'rgba(74,144,255,0.1)'}:{}}>
              {l}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Pattern Manager ───────────────────────────────────────
// Each pattern shows: enabled toggle + inline TF chip selector + conditions
function PatternManager({ settings, update, saveNowWithPatch }) {
  const [expanded, setExpanded] = useState({})
  const [sideFilter, setSideFilter] = useState('all')
  const [tfFilter, setTfFilter] = useState('all') // filter list by TF

  // ── Enabled state ──────────────────────────────────────
  const scannerEnabled = useMemo(() => {
    const saved = settings.scannerEnabled || {}
    const merged = {}
    ALL_SCANNERS.forEach(s => { merged[s.id] = s.id in saved ? saved[s.id] : true })
    return merged
  }, [settings.scannerEnabled])

  // ── Per-pattern TF selections ──────────────────────────
  // patternTfs: { [scannerId]: string[] }
  // Migration: if not saved, seed from scanner.tfs defaults
  const patternTfs = useMemo(() => {
    const saved = settings.patternTfs || {}
    const out = {}
    ALL_SCANNERS.forEach(s => {
      // Use saved value when key exists (even if []), only default when key absent
      out[s.id] = s.id in saved ? saved[s.id] : defaultTfsForScanner(s)
    })
    return out
  }, [settings.patternTfs])

  function setEnabled(id, val) {
    const next = { ...scannerEnabled, [id]: val }
    update({ scannerEnabled: next })
    saveNowWithPatch?.({ scannerEnabled: next })
  }

  function setPatternTfs(id, tfs) {
    // Allow empty array — user can fully uncheck all TFs
    const next = { ...(settings.patternTfs || {}), [id]: tfs }
    update({ patternTfs: next })
    saveNowWithPatch?.({ patternTfs: next })
  }

  // ── Bulk TF actions ────────────────────────────────────
  function bulkSetTfs(tfs) {
    const patch = {}
    ALL_SCANNERS.forEach(s => { patch[s.id] = tfs })
    const next = { ...(settings.patternTfs || {}), ...patch }
    update({ patternTfs: next })
    saveNowWithPatch?.({ patternTfs: next })
  }

  // ── Visible scanners ───────────────────────────────────
  const visible = useMemo(() => {
    return ALL_SCANNERS.filter(s => {
      if (sideFilter !== 'all' && s.side !== sideFilter) return false
      if (tfFilter !== 'all') {
        const tfs = (s.id in patternTfs) ? patternTfs[s.id] : defaultTfsForScanner(s)
        if (!tfs.includes(tfFilter)) return false
      }
      return true
    })
  }, [sideFilter, tfFilter, patternTfs])

  const enabledCount = visible.filter(s => scannerEnabled[s.id]).length

  // Available TFs for filter tabs — union of all assigned TFs
  const allUsedTfs = useMemo(() => {
    const used = new Set()
    ALL_SCANNERS.forEach(s => {
      const tfs = (s.id in patternTfs) ? patternTfs[s.id] : defaultTfsForScanner(s)
      tfs.forEach(tf => used.add(tf))
    })
    return TF_ORDER.filter(tf => used.has(tf) && PATTERN_TF_LIST.includes(tf))
  }, [patternTfs])

  return (
    <div>
      {/* Info banner */}
      <div style={{
        background:'rgba(150,100,255,0.07)', border:'1px solid rgba(150,100,255,0.22)',
        borderRadius:8, padding:'8px 11px', marginBottom:12,
        display:'flex', alignItems:'flex-start', gap:8,
      }}>
        <span style={{fontSize:14,flexShrink:0,marginTop:1}}>⚡</span>
        <div>
          <div style={{fontSize:11,fontFamily:'var(--mono)',color:'#b388ff',fontWeight:700,marginBottom:2}}>
            Per-Pattern Timeframe Control
          </div>
          <div style={{fontSize:10,color:'var(--text3)',lineHeight:1.5}}>
            Each pattern scans <b style={{color:'var(--text2)'}}>only its selected TFs</b>.
            Expand a pattern to choose which timeframes it runs on.
          </div>
        </div>
      </div>

      {/* Bulk actions row */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, marginBottom:10, flexWrap:'wrap' }}>
        <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
          {/* Enable/disable bulk */}
          <button className="btn-small"
            onClick={() => { const n={}; ALL_SCANNERS.forEach(s=>n[s.id]=true); update({ scannerEnabled: n }); saveNowWithPatch?.({ scannerEnabled: n }) }}
            style={{background:'rgba(0,230,118,0.12)',borderColor:'rgba(0,192,96,0.5)',color:'var(--green)',fontWeight:700}}>
            ✓ All On
          </button>
          <button className="btn-small"
            onClick={() => { const n={}; ALL_SCANNERS.forEach(s=>n[s.id]=false); update({ scannerEnabled: n }); saveNowWithPatch?.({ scannerEnabled: n }) }}
            style={{background:'rgba(255,70,70,0.08)',borderColor:'rgba(255,70,70,0.35)',color:'var(--red)',fontWeight:700}}>
            ✗ All Off
          </button>
          {/* Bulk TF set */}
          <button className="btn-small"
            onClick={() => bulkSetTfs([...PATTERN_TF_LIST])}
            style={{background:'rgba(0,184,217,0.08)',borderColor:'rgba(0,184,217,0.35)',color:'var(--accent)',fontWeight:700}}>
            TF: All
          </button>
          <button className="btn-small"
            onClick={() => bulkSetTfs(['15m','1h'])}
            style={{background:'rgba(105,219,124,0.08)',borderColor:'rgba(105,219,124,0.35)',color:'#69db7c',fontWeight:700}}>
            TF: Default
          </button>
        </div>
        {/* Side filter */}
        <div style={{ display:'flex', gap:4 }}>
          {[['all','All'],['bull','🟢'],['bear','🔴']].map(([id,lbl])=>(
            <button key={id} className="btn-small" onClick={() => setSideFilter(id)}
              style={sideFilter===id?{
                borderColor:id==='bull'?'var(--green2)':id==='bear'?'var(--red2)':'var(--border2)',
                color:id==='bull'?'var(--green)':id==='bear'?'var(--red)':'var(--text)',
                background:id==='bull'?'var(--green-dim)':id==='bear'?'var(--red-dim)':'var(--bg3)',
                fontWeight:700
              }:{}}>{lbl}</button>
          ))}
        </div>
      </div>

      {/* TF filter chips — filter which patterns are shown by their assigned TF */}
      <div style={{ marginBottom:10 }}>
        <div style={{ fontSize:9, fontFamily:'var(--mono)', color:'var(--text3)', fontWeight:700, letterSpacing:'.05em', marginBottom:5 }}>
          FILTER BY TF
        </div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
          <button
            onClick={() => setTfFilter('all')}
            style={{
              fontSize:10, fontFamily:'var(--mono)', fontWeight: tfFilter==='all'?800:500,
              padding:'4px 9px', borderRadius:6, cursor:'pointer',
              border:`1.5px solid ${tfFilter==='all'?'var(--accent)':'var(--border)'}`,
              background: tfFilter==='all'?'var(--accent-dim)':'var(--bg2)',
              color: tfFilter==='all'?'var(--accent)':'var(--text3)',
              transition:'all .15s',
            }}>
            All
          </button>
          {allUsedTfs.map(tf => {
            const meta = TF_META[tf] || {}
            const isActive = tfFilter === tf
            return (
              <button key={tf} onClick={() => setTfFilter(isActive ? 'all' : tf)}
                style={{
                  fontSize:10, fontFamily:'var(--mono)', fontWeight: isActive?800:500,
                  padding:'4px 9px', borderRadius:6, cursor:'pointer',
                  border:`1.5px solid ${isActive ? meta.color||'var(--accent)' : 'var(--border)'}`,
                  background: isActive ? `${meta.color||'var(--accent)'}18` : 'var(--bg2)',
                  color: isActive ? meta.color||'var(--accent)' : 'var(--text3)',
                  transition:'all .15s',
                }}>
                {tf === '1d' ? 'Day' : tf}
              </button>
            )
          })}
        </div>
      </div>

      {/* Count */}
      <div style={{ fontSize:10, fontFamily:'var(--mono)', color:'var(--text3)', marginBottom:10 }}>
        <span style={{ color:'var(--text)' }}>{enabledCount}</span>/{visible.length} enabled
        {tfFilter !== 'all' && (
          <span style={{ color: TF_META[tfFilter]?.color||'var(--accent)', marginLeft:6 }}>
            · showing patterns on {tfFilter}
          </span>
        )}
      </div>

      {/* Pattern cards */}
      <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
        {visible.map(s => (
          <ScannerDefCard
            key={s.id}
            scanner={s}
            expanded={!!expanded[s.id]}
            onTap={() => setExpanded(p => ({...p,[s.id]:!p[s.id]}))}
            enabled={scannerEnabled[s.id]}
            onToggle={v => setEnabled(s.id, v)}
            selectedTfs={(s.id in patternTfs) ? patternTfs[s.id] : defaultTfsForScanner(s)}
            onTfsChange={tfs => setPatternTfs(s.id, tfs)}
          />
        ))}
      </div>
    </div>
  )
}


// ── User Manual ────────────────────────────────────────────
function ManualSection() {
  function Block({ icon, title, children, accent='var(--text3)' }) {
    const [open, setOpen] = React.useState(false)
    return (
      <div style={{ border:'1px solid var(--border)', borderRadius:9, marginBottom:8, overflow:'hidden' }}>
        <div onClick={() => setOpen(o => !o)} style={{
          display:'flex', alignItems:'center', gap:8, padding:'10px 13px', cursor:'pointer',
          background: open ? `${accent}10` : 'transparent',
          borderBottom: open ? '1px solid var(--border)' : 'none',
        }}>
          <span style={{ fontSize:16 }}>{icon}</span>
          <span style={{ flex:1, fontSize:11, fontWeight:800, color:'var(--text)' }}>{title}</span>
          <span style={{ fontSize:10, color:'var(--text3)' }}>{open ? '▲' : '▼'}</span>
        </div>
        {open && <div style={{ padding:'12px 14px', fontSize:10, color:'var(--text2)', lineHeight:1.85 }}>{children}</div>}
      </div>
    )
  }
  function Row({ icon, name, desc, tip }) {
    return (
      <div style={{ display:'flex', gap:10, padding:'8px 0', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
        <span style={{ fontSize:18, flexShrink:0, width:26, textAlign:'center' }}>{icon}</span>
        <div>
          <div style={{ fontSize:11, fontWeight:800, color:'var(--text)', marginBottom:2 }}>{name}</div>
          <div style={{ fontSize:10, color:'var(--text2)', lineHeight:1.75 }}>{desc}</div>
          {tip && <div style={{ fontSize:9, color:'var(--amber)', marginTop:3, fontStyle:'italic' }}>{tip}</div>}
        </div>
      </div>
    )
  }
  function Pill({ children, color='var(--blue)', bg='rgba(77,171,247,0.12)' }) {
    return <span style={{ display:'inline-block', padding:'1px 7px', borderRadius:4, fontSize:9, fontWeight:800, color, background:bg, border:`1px solid ${color}40`, margin:'0 2px' }}>{children}</span>
  }
  function Tip({ children }) {
    return <div style={{ background:'rgba(255,160,0,0.06)', borderLeft:'2.5px solid var(--amber)', borderRadius:'0 7px 7px 0', padding:'8px 11px', fontSize:10, color:'var(--text2)', lineHeight:1.75, margin:'8px 0' }}>{children}</div>
  }
  function Info({ children }) {
    return <div style={{ background:'rgba(77,171,247,0.06)', borderLeft:'2.5px solid var(--blue)', borderRadius:'0 7px 7px 0', padding:'8px 11px', fontSize:10, color:'var(--text2)', lineHeight:1.75, margin:'8px 0' }}>{children}</div>
  }
  function Ex({ children }) {
    return <div style={{ background:'rgba(0,230,118,0.04)', border:'1px solid rgba(0,230,118,0.18)', borderRadius:7, padding:'9px 11px', fontSize:10, color:'var(--text2)', lineHeight:1.85, margin:'8px 0' }}>{children}</div>
  }
  function Table({ rows }) {
    return (
      <div style={{ overflowX:'auto', marginTop:6 }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:10 }}>
          <tbody>
            {rows.map(([a,b,c],i) => (
              <tr key={i} style={{ borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                <td style={{ padding:'5px 8px', color:'var(--blue)', fontWeight:700, whiteSpace:'nowrap', verticalAlign:'top' }}>{a}</td>
                <td style={{ padding:'5px 8px', color:'var(--text2)', verticalAlign:'top' }}>{b}</td>
                {c && <td style={{ padding:'5px 8px', color:'var(--green)', fontStyle:'italic', verticalAlign:'top' }}>{c}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }
  return (
    <div>
      <Block icon="🏠" title="Home — Scan Modes" accent="var(--accent)">
        <Row icon="⚡" name="Single" desc="Scans one selected symbol only. Fast and focused." tip="Tap any coin in results to switch focus to it." />
        <Row icon="⬡" name="All" desc="Scans every symbol in your symbol set against all active Bull + Bear patterns." tip="Use Top 100 or smaller for faster scans." />
        <Row icon="🟢" name="Bull" desc="Scans all symbols but only runs Bull patterns. Skips Bear patterns entirely." />
        <Row icon="🔴" name="Bear" desc="Scans all symbols but only runs Bear patterns." />
        <Row icon="⊞" name="Custom" desc="Only scans your Custom Pairs watchlist (set in Settings → Custom Pairs)." tip="Best for monitoring a focused list of 5–20 coins." />
        <Tip>Start with <b>All mode + Top 100</b> symbols for the best balance of speed and coverage.</Tip>
      </Block>
      <Block icon="🔁" title="Loop Mode" accent="var(--green)">
        <Row icon="▶" name="Normal Mode (Loop OFF)" desc="Scanner runs once, then waits for the set interval (30s / 1m / 2m / 5m) before running again." />
        <Row icon="🔁" name="Loop Mode (Loop ON)" desc="Scanner runs continuously — as soon as one scan finishes, the next starts immediately. The loop counter shows how many full scans have completed." tip="⚠ Uses more battery and data. Best on WiFi with device charging." />
        <Tip><b>Loop + Single mode</b> = watch one coin non-stop at maximum speed.</Tip>
      </Block>
      <Block icon="🔽" title="Sort & Filter Results" accent="var(--purple)">
        <div style={{ fontSize:10, color:'var(--text2)', marginBottom:8 }}><b style={{ color:'var(--text)' }}>Result Filter</b> — show All / Bull only / Bear only signals.</div>
        <div style={{ fontSize:10, color:'var(--text2)', marginBottom:8 }}><b style={{ color:'var(--text)' }}>Sort columns</b> — tap any column header to sort results:</div>
        <Table rows={[['Time','When detected — newest first by default',''],['Symbol','Coin name A→Z or Z→A',''],['Pattern','Pattern name alphabetically',''],['Gain %','Price change % — biggest movers first',''],['Volume','24h trading volume — highest first','']]} />
        <Info>Volume filter in Scan Settings hides coins with insufficient 24h volume — e.g. <b>1M</b> = only coins with ≥ $1M daily volume.</Info>
      </Block>
      <Block icon="⏱" title="Timeframe Tabs" accent="var(--blue)">
        <div style={{ fontSize:10, color:'var(--text2)', lineHeight:1.85 }}>
          The bottom bar shows: <Pill>1m</Pill><Pill>3m</Pill><Pill>5m</Pill><Pill>15m</Pill><Pill>30m</Pill><Pill>1h</Pill><Pill>4h</Pill><Pill color="var(--green)" bg="rgba(0,230,118,0.1)">Day</Pill><br/><br/>
          Each tab is <b style={{ color:'var(--text)' }}>fully independent</b> — its own scan, results, sort, and filter. Switching tabs does not stop a scan on another tab.<br/><br/>
          A pattern only fires on a timeframe if that TF is enabled in <b style={{ color:'var(--text)' }}>Settings → Pattern Settings</b>.
        </div>
        <Tip>If you see "No Patterns for this TF" go to Settings → Pattern Settings and enable the TF for at least one pattern.</Tip>
      </Block>
      <Block icon="⚙️" title="Scan Settings" accent="var(--accent)">
        <Row icon="📦" name="Symbol Set" desc="How many coins to include in each scan. Top 30 = fastest · Top 100 = balanced · Top 500 = comprehensive · All = every coin (slow)" tip="Start with Top 100. Increase if you need wider market coverage." />
        <Row icon="⏰" name="Scan Interval" desc="How often the auto-scanner runs when Loop Mode is OFF. Options: 30s / 1m / 2m / 5m. Shorter = more frequent updates but more data usage." />
        <Row icon="🔕" name="Dedup Interval" desc="Suppresses duplicate alerts for the same coin + pattern within a time window. Set to 5m = same signal won't re-fire within 5 minutes." tip="Set 15m–30m to reduce noise. Set 0 to see every single match." />
        <Row icon="📊" name="Volume Filter" desc="Minimum 24h volume. Coins below this threshold are hidden from all results. Applies globally to all TF tabs." />
      </Block>
      <Block icon="🔧" title="What is a Pattern?" accent="var(--lime,#c6ff00)">
        <div style={{ fontSize:10, color:'var(--text2)', lineHeight:1.85 }}>
          A <b style={{ color:'var(--text)' }}>Pattern</b> is a named set of conditions. <b>All conditions must be true</b> for a coin to fire a signal — like an AND logic gate.<br/><br/>
          Every pattern has:<br/>
          • A <b style={{ color:'var(--green)' }}>Side</b> — Bull or Bear<br/>
          • A list of <b style={{ color:'var(--blue)' }}>Conditions</b><br/>
          • A set of <b style={{ color:'var(--purple)' }}>Timeframes</b> it runs on
        </div>
        <Ex>
          <b style={{ color:'var(--green)' }}>Example — "EMA Bounce Bull":</b><br/>
          ① Close &gt; EMA20 → price is above EMA20<br/>
          ② EMA20 &gt; EMA50 → short EMA above long EMA<br/>
          ③ Close[-1] &lt; EMA20[-1] → previous candle was below EMA20<br/>
          ④ RSI &lt; 60 → not overbought<br/>
          <span style={{ color:'var(--amber)' }}>→ Fires when price just bounced back above EMA20 with trend alignment.</span>
        </Ex>
      </Block>
      <Block icon="📊" title="Fields — What You Can Measure" accent="var(--blue)">
        <Table rows={[
          ['Close / Open / High / Low','Raw candle price data',''],
          ['Volume','Trading volume of the candle',''],
          ['EMA 5 → EMA 600','Exponential Moving Average. Smaller period = faster reaction',''],
          ['RSI 14','Momentum oscillator 0–100. Below 30 = oversold, above 70 = overbought',''],
          ['+DI / -DI / ADX','Directional trend strength. ADX > 25 = strong trend',''],
          ['Change %','Candle close vs previous close as %',''],
          ['Body %','% of candle range that is body (100% = no wicks)',''],
          ['Is Green / Is Red','1 if condition true, else 0',''],
        ]} />
        <Tip><b>Candle Offset</b> — [0] current candle, [-1] previous, [-2] two back. Use to check past candles.</Tip>
      </Block>
      <Block icon="⚖️" title="Operators" accent="var(--amber)">
        <Table rows={[
          ['>','Greater than','Close > EMA20 → price above EMA'],
          ['>=','Greater than or equal','RSI >= 50 → momentum positive'],
          ['<','Less than','Close < EMA50 → price below EMA50'],
          ['<=','Less than or equal','RSI <= 30 → oversold'],
          ['=','Equal to','Is Green = 1 → candle is bullish'],
          ['≠','Not equal to','Is Red ≠ 1 → not a red candle'],
        ]} />
      </Block>
      <Block icon="⚡" title="Pattern Actions" accent="var(--blue)">
        <Row icon="⇄" name="Mirror" desc="Creates the opposite pattern — flips Bull↔Bear, inverts all operators automatically." tip="Review mirrored conditions after creation." />
        <Row icon="⧉" name="Copy" desc="Duplicates with a new name. Same side, same conditions." />
        <Row icon="🔒" name="Lock" desc="Prevents accidental edits. Pattern still scans when locked." />
        <Row icon="🗑" name="Delete → Trash" desc="Deleted patterns go to Trash Bin. Recoverable from there." />
      </Block>
      <Block icon="📤" title="Import / Export" accent="var(--green)">
        <Row icon="📤" name="Export" desc="Download patterns as .json backup. Choose Combined or Individual files." />
        <Row icon="📥" name="Import" desc="Load patterns from a .json file. Duplicate names are skipped automatically." />
        <Row icon="☑" name="Select Mode" desc="Tap ☑ Select → tap patterns → Export or Delete selected." tip="Regularly backup your patterns to Google Drive or Telegram." />
      </Block>
    </div>
  )
}

// ── Main SettingsTab ──────────────────────────────────────

// ── History Section (inline in settings) ─────────────────────────────────────
function HistorySection() {
  const [history,    setHistory]    = useState(() => historyLoad())
  const [refreshKey, setRefreshKey] = useState(0)

  // Refresh when localStorage changes (new alerts from scanner)
  React.useEffect(() => {
    function onStorage(e) {
      if (e.key === 'cs_scan_history_v1' || e.key === null) {
        setHistory(historyLoad())
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // Also poll every 5s while open (same-tab localStorage doesn't fire storage event)
  React.useEffect(() => {
    const t = setInterval(() => setHistory(historyLoad()), 5000)
    return () => clearInterval(t)
  }, [])
  const [tfFilter,   setTfFilter]   = useState('all')
  const [sortCol,    setSortCol]    = useState('time')
  const [sortDir,    setSortDir]    = useState('desc')
  const [sideFilter, setSideFilter] = useState('all')

  const allTfs = useMemo(() =>
    ['1m','3m','5m','15m','30m','1h','4h','1d'].filter(tf => (history[tf]||[]).length > 0)
  , [history])

  const rows = useMemo(() => {
    const src = tfFilter === 'all' ? Object.values(history).flat() : (history[tfFilter] || [])
    return [...src]
      .filter(h => sideFilter === 'all' ? true : h.side === sideFilter)
      .sort((a, b) => {
        let c = 0
        if (sortCol === 'time')   c = a.time - b.time
        if (sortCol === 'symbol') c = a.symbol.localeCompare(b.symbol)
        if (sortCol === 'volume') c = (a.volume ?? 0) - (b.volume ?? 0)
        if (sortCol === 'gain')   c = (parseFloat(a.gainPct) || 0) - (parseFloat(b.gainPct) || 0)
        return sortDir === 'desc' ? -c : c
      })
  }, [history, tfFilter, sortCol, sortDir, sideFilter])

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortCol(col); setSortDir('desc') }
  }
  function clearHistory() {
    const data = historyLoad()
    if (tfFilter === 'all') { historySave({}); setHistory({}) }
    else { data[tfFilter] = []; historySave(data); setHistory({...data}) }
  }

  const SH = (col) => ({
    padding:'4px 8px', borderRadius:6, cursor:'pointer', fontSize:9,
    fontFamily:'var(--mono)', fontWeight: sortCol===col?800:400, whiteSpace:'nowrap',
    border:`1px solid ${sortCol===col?'#7ecfff':'var(--border)'}`,
    background:sortCol===col?'rgba(126,207,255,0.10)':'transparent',
    color:sortCol===col?'#7ecfff':'var(--text3)',
  })

  return (
    <div style={{display:'flex', flexDirection:'column', gap:0}}>
      {/* TF + Side filter */}
      <div style={{display:'flex', gap:5, flexWrap:'wrap', marginBottom:8}}>
        {['all', ...allTfs].map(tf => {
          const col = tf === 'all' ? '#aaa' : (TF_COLORS[tf] || '#aaa')
          const cnt = tf === 'all' ? Object.values(history).flat().length : (history[tf]||[]).length
          return (
            <button key={tf} onClick={() => setTfFilter(tf)} style={{
              padding:'4px 10px', borderRadius:7, cursor:'pointer', fontSize:10,
              fontFamily:'var(--mono)', fontWeight: tfFilter===tf?800:400,
              border:`1.5px solid ${tfFilter===tf?col:'var(--border)'}`,
              background:tfFilter===tf?col+'22':'transparent',
              color:tfFilter===tf?col:'var(--text3)',
            }}>{tf === 'all' ? 'All' : tf.toUpperCase()} <span style={{opacity:.7}}>({cnt})</span></button>
          )
        })}
        <div style={{width:1,height:20,background:'var(--border)',margin:'auto 2px'}}/>
        {[['all','All'],['bull','▲'],['bear','▼']].map(([v,l])=>(
          <button key={v} onClick={()=>setSideFilter(v)} style={{
            padding:'4px 9px', borderRadius:7, cursor:'pointer', fontSize:10,
            fontFamily:'var(--mono)', fontWeight:sideFilter===v?800:400,
            border:`1.5px solid ${sideFilter===v?(v==='bull'?'#00e676':v==='bear'?'#ff4757':'#aaa'):'var(--border)'}`,
            background:sideFilter===v?(v==='bull'?'rgba(0,230,118,0.12)':v==='bear'?'rgba(255,71,87,0.12)':'rgba(255,255,255,0.06)'):'transparent',
            color:sideFilter===v?(v==='bull'?'#00e676':v==='bear'?'#ff4757':'var(--text)'):'var(--text3)',
          }}>{l}</button>
        ))}
        <div style={{marginLeft:'auto', display:'flex', gap:5}}>
          <button onClick={() => exportHistoryCSV(history, tfFilter)} style={{
            padding:'4px 10px', borderRadius:7, cursor:'pointer', fontSize:10,
            fontFamily:'var(--mono)', fontWeight:700,
            border:'1.5px solid rgba(0,230,118,0.4)', background:'rgba(0,230,118,0.08)', color:'#00e676',
          }}>↓ CSV</button>
          <button onClick={() => setHistory(historyLoad())} style={{
            padding:'4px 10px', borderRadius:7, cursor:'pointer', fontSize:10,
            fontFamily:'var(--mono)', fontWeight:700,
            border:'1.5px solid rgba(126,207,255,0.4)', background:'rgba(126,207,255,0.08)', color:'#7ecfff',
          }}>↺ Refresh</button>
          <button onClick={clearHistory} style={{
            padding:'4px 10px', borderRadius:7, cursor:'pointer', fontSize:10,
            fontFamily:'var(--mono)', fontWeight:700,
            border:'1.5px solid rgba(255,60,80,0.35)', background:'rgba(255,60,80,0.07)', color:'#ff4757',
          }}>Clear</button>
        </div>
      </div>

      {/* Sort bar */}
      <div style={{display:'flex', alignItems:'center', gap:5, marginBottom:10, flexWrap:'wrap'}}>
        <span style={{fontSize:9, color:'var(--text3)', fontFamily:'var(--mono)'}}>SORT:</span>
        {[['time','Time'],['symbol','A-Z'],['gain','Gain'],['volume','Vol']].map(([col,lbl])=>(
          <button key={col} onClick={()=>toggleSort(col)} style={SH(col)}>
            {lbl}{sortCol===col?(sortDir==='desc'?' ↓':' ↑'):''}
          </button>
        ))}
        <span style={{marginLeft:'auto', fontSize:9, fontFamily:'var(--mono)', color:'var(--text3)'}}>
          {rows.length} result{rows.length!==1?'s':''}
        </span>
      </div>

      {/* Rows */}
      {rows.length === 0 ? (
        <div style={{textAlign:'center', padding:'24px 16px', color:'var(--text3)', fontFamily:'var(--mono)', fontSize:12}}>
          📭 No history yet — run a scan to start recording.
        </div>
      ) : rows.map((h, i) => {
        const isBull = h.side === 'bull'
        const col = isBull ? '#00e676' : '#ff4757'
        const bd  = isBull ? 'rgba(0,230,118,0.3)' : 'rgba(255,71,87,0.3)'
        const bg  = isBull ? 'rgba(0,230,118,0.04)' : 'rgba(255,71,87,0.04)'
        const tfCol = TF_COLORS[h.timeframe] || '#aaa'
        return (
          <div key={h.id ?? i} style={{
            display:'flex', alignItems:'center', gap:8, padding:'9px 11px',
            borderRadius:10, marginBottom:6, border:`1.5px solid ${bd}`, background:bg,
          }}>
            <span style={{fontSize:16, flexShrink:0}}>{h.scannerIcon || (isBull?'🟢':'🔴')}</span>
            <div style={{flex:1, minWidth:0}}>
              <div style={{display:'flex', alignItems:'center', gap:5, flexWrap:'wrap', marginBottom:2}}>
                <span style={{fontWeight:900, fontSize:13, color:col, fontFamily:'var(--mono)'}}>
                  {h.symbol.replace('USDT','')}<span style={{fontSize:9,fontWeight:400,color:'var(--text3)'}}>/USDT</span>
                </span>
                <span style={{fontSize:8, fontFamily:'var(--mono)', fontWeight:700, padding:'1px 5px',
                  borderRadius:4, background:tfCol+'22', color:tfCol, border:`1px solid ${tfCol}55`}}>
                  {(h.timeframe||'').toUpperCase()}
                </span>
                <span style={{fontSize:8, fontFamily:'var(--mono)', fontWeight:800, padding:'1px 5px',
                  borderRadius:4, background:col+'18', color:col, border:`1px solid ${col}40`}}>
                  {h.scannerName}
                </span>
                {h.gainPct != null && (
                  <span style={{fontSize:8, fontFamily:'var(--mono)', fontWeight:800, padding:'1px 5px',
                    borderRadius:4, background:'rgba(255,167,38,0.12)', color:'#ffa726', border:'1px solid rgba(255,167,38,0.3)'}}>
                    {parseFloat(h.gainPct)>=0?'+':''}{h.gainPct}%
                  </span>
                )}
              </div>
              <div style={{fontSize:10, fontFamily:'var(--mono)', color:'var(--text3)'}}>
                {fmtHistoryDate(h.time)}
                {h.close  != null && <> · <span style={{color:'var(--text2)'}}>${typeof h.close==='number'?h.close.toFixed(4):h.close}</span></>}
                {h.rsi14  != null && <> · <span style={{color:'#ffa726'}}>RSI {parseFloat(h.rsi14).toFixed(1)}</span></>}
                {h.volume  >  0   && <> · <span style={{color:'var(--text3)'}}>
                  {h.volume>=1e9?(h.volume/1e9).toFixed(1)+'B':h.volume>=1e6?(h.volume/1e6).toFixed(1)+'M':h.volume>=1e3?(h.volume/1e3).toFixed(0)+'K':h.volume}
                </span></>}
              </div>
            </div>
            <div style={{display:'flex', flexDirection:'column', alignItems:'center', gap:4, flexShrink:0}}>
              <span style={{fontSize:12, color:col}}>{isBull?'▲':'▼'}</span>
              <a href={tvUrl(h.symbol, h.timeframe)} target="_blank" rel="noopener noreferrer"
                style={{
                  display:'flex', alignItems:'center', justifyContent:'center',
                  width:24, height:24, borderRadius:6,
                  background:'rgba(33,150,243,0.12)', border:'1.5px solid rgba(33,150,243,0.4)',
                  color:'#2196f3', textDecoration:'none', fontSize:12,
                }}>📈</a>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Font Settings Section ─────────────────────────────────────────────────────
function FontSection({ cfg, set }) {
  const scale  = cfg.fontScale  ?? 1
  const bold   = cfg.fontBold   ?? false
  const family = cfg.fontFamily ?? 'default'

  const SCALES = [
    { id: 0.9,  label: 'XS' },
    { id: 1,    label: 'S'  },
    { id: 1.1,  label: 'M'  },
    { id: 1.2,  label: 'L'  },
    { id: 1.35, label: 'XL' },
    { id: 1.5,  label: 'XXL'},
  ]
  const FONTS = [
    { id: 'default', label: 'Space Grotesk', preview: 'Aa' },
    { id: 'system',  label: 'System UI',     preview: 'Aa' },
    { id: 'mono',    label: 'Monospace',      preview: 'Aa' },
    { id: 'rounded', label: 'Rounded',        preview: 'Aa' },
  ]
  const FONT_PREVIEW = {
    default: "'Space Grotesk',system-ui,sans-serif",
    system:  "system-ui,-apple-system,sans-serif",
    mono:    "'Space Mono',monospace",
    rounded: "'Nunito','Space Grotesk',system-ui,sans-serif",
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

      {/* Live preview */}
      <div style={{
        padding:'14px 16px', borderRadius:10,
        background:'var(--bg2)', border:'1px solid var(--border)',
      }}>
        <div style={{
          fontSize:`calc(15px * ${scale})`,
          fontWeight: bold ? 700 : 400,
          fontFamily: FONT_PREVIEW[family],
          color:'var(--text)', marginBottom:4,
        }}>Coins Sniper Preview</div>
        <div style={{
          fontSize:`calc(11px * ${scale})`,
          fontWeight: bold ? 600 : 400,
          fontFamily: FONT_PREVIEW[family],
          color:'var(--text3)',
        }}>BTCUSDT · 15M · EMA Cross Signal</div>
      </div>

      {/* Font size */}
      <div>
        <div style={{ fontSize:11, fontFamily:'var(--mono)', color:'var(--text3)', marginBottom:8, letterSpacing:'.06em' }}>FONT SIZE</div>
        <div style={{ display:'flex', gap:6 }}>
          {SCALES.map(s => (
            <button key={s.id} onClick={() => set('fontScale', s.id)} style={{
              flex:1, padding:'8px 4px', borderRadius:8, cursor:'pointer',
              border:`1.5px solid ${Math.abs(scale - s.id) < 0.01 ? '#7ecfff' : 'var(--border)'}`,
              background: Math.abs(scale - s.id) < 0.01 ? 'rgba(126,207,255,0.12)' : 'var(--bg2)',
              color: Math.abs(scale - s.id) < 0.01 ? '#7ecfff' : 'var(--text3)',
              fontWeight: Math.abs(scale - s.id) < 0.01 ? 800 : 400,
              fontSize: 12, fontFamily:'var(--mono)',
            }}>{s.label}</button>
          ))}
        </div>
        {/* Slider */}
        <input
          type="range" min={0.85} max={1.6} step={0.01}
          value={scale}
          onChange={e => set('fontScale', parseFloat(e.target.value))}
          style={{ width:'100%', marginTop:10, accentColor:'#7ecfff' }}
        />
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:9, fontFamily:'var(--mono)', color:'var(--text3)', marginTop:2 }}>
          <span>Small</span>
          <span>{Math.round(scale * 100)}%</span>
          <span>Large</span>
        </div>
      </div>

      {/* Font weight */}
      <div>
        <div style={{ fontSize:11, fontFamily:'var(--mono)', color:'var(--text3)', marginBottom:8, letterSpacing:'.06em' }}>FONT WEIGHT</div>
        <div style={{ display:'flex', gap:8 }}>
          {[
            { id: false, label: 'Regular', weight: 400 },
            { id: true,  label: 'Bold',    weight: 700 },
          ].map(w => (
            <button key={String(w.id)} onClick={() => set('fontBold', w.id)} style={{
              flex:1, padding:'10px', borderRadius:9, cursor:'pointer',
              border:`1.5px solid ${bold === w.id ? '#7ecfff' : 'var(--border)'}`,
              background: bold === w.id ? 'rgba(126,207,255,0.12)' : 'var(--bg2)',
              color: bold === w.id ? '#7ecfff' : 'var(--text3)',
              fontSize: 14, fontWeight: w.weight,
            }}>{w.label}</button>
          ))}
        </div>
      </div>

      {/* Font family */}
      <div>
        <div style={{ fontSize:11, fontFamily:'var(--mono)', color:'var(--text3)', marginBottom:8, letterSpacing:'.06em' }}>FONT FAMILY</div>
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {FONTS.map(f => (
            <button key={f.id} onClick={() => set('fontFamily', f.id)} style={{
              display:'flex', alignItems:'center', justifyContent:'space-between',
              padding:'10px 14px', borderRadius:9, cursor:'pointer', textAlign:'left',
              border:`1.5px solid ${family === f.id ? '#7ecfff' : 'var(--border)'}`,
              background: family === f.id ? 'rgba(126,207,255,0.10)' : 'var(--bg2)',
            }}>
              <span style={{
                fontSize: 14, fontFamily: FONT_PREVIEW[f.id],
                color: family === f.id ? '#7ecfff' : 'var(--text2)',
                fontWeight: family === f.id ? 700 : 400,
              }}>{f.label}</span>
              <span style={{
                fontSize: 20, fontFamily: FONT_PREVIEW[f.id],
                color: family === f.id ? '#7ecfff' : 'var(--text3)',
                fontWeight: 700,
              }}>{f.preview}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Reset fonts */}
      <button onClick={() => {
        set('fontScale', 1); set('fontBold', false); set('fontFamily', 'default')
      }} style={{
        padding:'9px', borderRadius:8, cursor:'pointer', fontSize:12,
        border:'1px solid var(--border)', background:'var(--bg2)',
        color:'var(--text3)', fontFamily:'var(--mono)', fontWeight:600,
      }}>↺ Reset to Default</button>
    </div>
  )
}

export default function SettingsTab({ settings, set, update, reset, clearSortOverrides, user, onUserChange, cloudSynced, cloudSaving, onSaveNow, saveNowWithPatch, openCount=0 }) {
  const [resetMsg, setResetMsg] = React.useState('')
  const [resetConfirm, setResetConfirm] = React.useState(false)
  const openKey = openCount

  function handleReset() {
    if (!resetConfirm) {
      setResetConfirm(true)
      setTimeout(() => setResetConfirm(false), 3000)
      return
    }
    reset()
    setResetConfirm(false)
    setResetMsg('✓ Settings reset to defaults · patterns preserved')
    setTimeout(() => setResetMsg(''), 3500)
  }

  return (
    <div>
      <div style={{ marginBottom:12 }}>
        <h2 style={{ fontSize:18,fontWeight:800,letterSpacing:'-.02em',marginBottom:2 }}>Settings</h2>
        <p style={{ fontSize:10,color:'var(--text3)',fontFamily:'var(--mono)' }}>
          Configuration · per-pattern timeframe control
        </p>
      </div>

      <Accordion title="Account & Sync" icon="👤" defaultOpen={false} accentColor="var(--accent)" openKey={openKey}>
        <AccountSection user={user} onUserChange={onUserChange}
          cloudSynced={cloudSynced} cloudSaving={cloudSaving} onSaveNow={onSaveNow}/>
      </Accordion>

      <Accordion title="Scan Settings" icon="⬡" badge="GLOBAL" defaultOpen={false} accentColor="var(--accent)" openKey={openKey}>
        <ScanSettingsSection settings={settings} update={update} saveNowWithPatch={saveNowWithPatch}/>
      </Accordion>

      <Accordion title="Result Sort" icon="↕" defaultOpen={false} accentColor="var(--accent)" openKey={openKey}>
        <DefaultSortSection cfg={settings} set={set} clearSortOverrides={clearSortOverrides}/>
      </Accordion>

      <Accordion title="Alerts & Notifications" icon="◈" defaultOpen={false} accentColor="rgba(255,167,38,0.5)" openKey={openKey}>
        <AlertsSection cfg={settings} set={set}/>
      </Accordion>

      <Accordion title="Appearance" icon="◑" defaultOpen={false} openKey={openKey}>
        <AppearanceSection cfg={settings} set={set}/>
      </Accordion>

      <Accordion title="Font Settings" icon="Aa" defaultOpen={false} accentColor="rgba(126,207,255,0.4)" openKey={openKey}>
        <FontSection cfg={settings} set={set}/>
      </Accordion>

      <Accordion title="Custom Pairs" icon="⊞" defaultOpen={false} accentColor="rgba(179,136,255,0.4)" openKey={openKey}>
        <CustomPairsSection cfg={settings} set={set}/>
      </Accordion>

      <Accordion title="Scan History" icon="🕓" badge="LOG" defaultOpen={false} accentColor="rgba(126,207,255,0.4)" openKey={openKey}>
        <HistorySection />
      </Accordion>

      <Accordion title="User Manual" icon="📖" badge="HELP" defaultOpen={false} accentColor="rgba(0,230,118,0.4)" openKey={openKey}>
        <ManualSection />
      </Accordion>

      {/* Reset */}
      <div style={{ marginTop:20,padding:'14px 16px',background:'var(--bg1)',border:'1.5px solid var(--border)',borderRadius:'var(--radius)' }}>
        <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between' }}>
          <div>
            <div style={{ fontWeight:700,fontSize:14,color:'var(--text)',marginBottom:3 }}>Reset All Settings</div>
            <div style={{ fontSize:11,fontFamily:'var(--mono)',color:'var(--text3)' }}>Restore defaults · your patterns are kept</div>
          </div>
          <button onClick={handleReset} style={{ padding:'8px 16px',borderRadius:8,
            border:`1.5px solid ${resetConfirm ? 'var(--red)' : 'var(--red2)'}`,
            background: resetConfirm ? 'var(--red)' : 'var(--red-dim)',
            color: resetConfirm ? '#fff' : 'var(--red)',
            fontSize:13,fontWeight:700,cursor:'pointer',transition:'all .15s',whiteSpace:'nowrap' }}>
            {resetConfirm ? '⚠ Confirm?' : '↺ Reset'}
          </button>
        </div>
        {resetMsg && (
          <div style={{ marginTop:10,fontSize:12,fontFamily:'var(--mono)',color:'var(--green)',
            background:'var(--green-dim)',border:'1px solid var(--green2)',
            borderRadius:6,padding:'6px 10px' }}>
            {resetMsg}
          </div>
        )}
      </div>

      <div style={{ height:20 }}/>

      {/* ── Copyright ─────────────────────────────────────────────────────────── */}
      <div style={{
        padding:'18px 20px', borderRadius:'var(--radius)',
        background:'var(--bg1)', border:'1.5px solid var(--border)',
        textAlign:'center',
      }}>
        {/* Logo mark */}
        <div style={{
          width:36, height:36, borderRadius:10, margin:'0 auto 10px',
          background:'rgba(255,107,0,0.1)', border:'1.5px solid rgba(255,107,0,0.35)',
          display:'flex', alignItems:'center', justifyContent:'center', fontSize:18,
        }}>🎯</div>

        <div style={{fontWeight:800, fontSize:14, color:'var(--text)', marginBottom:3, letterSpacing:'-.01em'}}>
          Coins Sniper
        </div>
        <div style={{fontSize:9, fontFamily:'var(--mono)', color:'rgba(255,107,0,0.8)', letterSpacing:'.12em', marginBottom:10}}>
          REAL-TIME SCANNER · PROFESSIONAL TRADING TOOL
        </div>

        {/* Version badge */}
        <div style={{display:'flex', alignItems:'center', justifyContent:'center', gap:6, marginBottom:12}}>
          <span style={{
            fontSize:10, fontFamily:'var(--mono)', fontWeight:700,
            padding:'3px 10px', borderRadius:12,
            background:'rgba(255,107,0,0.12)', color:'#ff6b00',
            border:'1px solid rgba(255,107,0,0.35)', letterSpacing:'.05em',
          }}>v3.0</span>
          <span style={{
            fontSize:10, fontFamily:'var(--mono)', fontWeight:700,
            padding:'3px 10px', borderRadius:12,
            background:'rgba(0,230,118,0.08)', color:'var(--green)',
            border:'1px solid rgba(0,230,118,0.3)', letterSpacing:'.05em',
          }}>STABLE</span>
        </div>

        <div style={{
          fontSize:11, fontFamily:'var(--mono)', color:'var(--text3)',
          lineHeight:1.8, marginBottom:6,
        }}>
          © {new Date().getFullYear()} Coins Sniper. All rights reserved.
        </div>
        <div style={{
          fontSize:10, fontFamily:'var(--mono)', color:'var(--text3)',
          opacity:0.6, lineHeight:1.6,
        }}>
          Built for traders · Professional pattern scanning tool<br/>
          Not financial advice. Trade responsibly.
        </div>
      </div>

      <div style={{ height:32 }}/>
    </div>
  )
}
