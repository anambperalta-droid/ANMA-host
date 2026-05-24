import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '../../context/DataContext'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { useConfirm } from '../../context/ConfirmContext'
import { fmt, fmtDate, MONTHS, STATUS_MAP, STATUS_CLS, PAY_STATUS_MAP, PAY_STATUS_CLS, db, dbW } from '../../lib/storage'
import { usePrivacy } from '../../context/PrivacyContext'

function Badge({ status }) {
  return <span className={`badge ${STATUS_CLS[status] || 'b-draft'}`}>{STATUS_MAP[status] || 'Borrador'}</span>
}

function Sparkline({ data, color = 'var(--brand)', height = 22 }) {
  if (!data || data.length < 2) return null
  const max = Math.max(...data, 1)
  const min = Math.min(...data, 0)
  const range = max - min || 1
  const W = 100, H = height
  const step = W / (data.length - 1)
  const points = data.map((v, i) => `${(i * step).toFixed(1)},${(H - 1 - ((v - min) / range) * (H - 2)).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H} style={{ display: 'block', marginTop: 6 }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" opacity="0.45" />
    </svg>
  )
}

function KpiCard({ label, value, delta, isKey, sparkData, sparkColor }) {
  const hasDelta = delta !== null && delta !== undefined
  const base = { position: 'relative', padding: '12px 14px 10px' }
  return (
    <div className="bento-kpi" style={isKey ? { ...base, borderLeft: '3px solid var(--green)', paddingLeft: 14 } : base}>
      <div style={{ fontSize: 9.5, fontWeight: 700, color: '#B0B8C9', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--txt)', letterSpacing: '-0.03em', lineHeight: 1.05, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
        {hasDelta && (
          <span style={{ fontSize: 11, fontWeight: 700, color: delta >= 0 ? '#16A34A' : '#DC2626', background: delta >= 0 ? 'rgba(22,163,74,.10)' : 'rgba(220,38,38,.10)', padding: '2px 7px', borderRadius: 6, lineHeight: 1.2, whiteSpace: 'nowrap', flexShrink: 0 }}>
            {delta >= 0 ? '↑' : '↓'}{Math.abs(delta)}%
          </span>
        )}
      </div>
      {sparkData && <Sparkline data={sparkData} color={sparkColor || 'var(--brand)'} />}
    </div>
  )
}

/* ── Modal motivo de pérdida ── */
function LossReasonModal({ onSave, onClose }) {
  const [reason, setReason] = useState('')
  const [other, setOther] = useState('')
  const REASONS = [
    { k: 'price', l: '💰 Precio muy alto' },
    { k: 'time', l: '⏰ No llegábamos con los tiempos' },
    { k: 'competitor', l: '🏃 Eligió a un competidor' },
    { k: 'no_response', l: '🔇 Cliente nunca respondió' },
    { k: 'budget', l: '💸 Cliente no tenía presupuesto' },
    { k: 'other', l: '📝 Otro motivo' },
  ]
  const finalReason = reason === 'other' ? other.trim() : (REASONS.find(r => r.k === reason)?.l.replace(/^\S+ /, '') || '')
  return (
    <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 460 }}>
        <div className="mh">
          <h3><i className="fa fa-circle-xmark" style={{ color: 'var(--red)', marginRight: 8 }} />¿Por qué se perdió?</h3>
          <button className="mclose" onClick={onClose}><i className="fa fa-xmark" /></button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--txt3)', margin: '0 0 14px', lineHeight: 1.5 }}>
          Capturar el motivo te ayuda a ver patrones y mejorar tu tasa de cierre. Quedará en el histórico del presupuesto.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
          {REASONS.map(r => (
            <button key={r.k} onClick={() => setReason(r.k)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 12px', borderRadius: 10,
                border: `1.5px solid ${reason === r.k ? 'var(--brand)' : 'var(--border)'}`,
                background: reason === r.k ? 'var(--brand-xlt)' : 'var(--surface)',
                color: reason === r.k ? 'var(--brand)' : 'var(--txt2)',
                fontSize: 13, fontWeight: reason === r.k ? 700 : 500,
                cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                transition: 'all .12s'
              }}>{r.l}</button>
          ))}
        </div>
        {reason === 'other' && (
          <div className="fg" style={{ marginBottom: 10 }}>
            <input type="text" value={other} onChange={e => setOther(e.target.value)}
              placeholder="Describí brevemente..." autoFocus
              style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--border)', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }} />
          </div>
        )}
        <div className="mfooter">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => onSave(finalReason)} disabled={!finalReason}
            style={{ background: 'var(--red)', borderColor: 'var(--red)' }}>
            <i className="fa fa-floppy-disk" /> Guardar y marcar como perdido
          </button>
        </div>
      </div>
    </div>
  )
}

const DOT_STATUS = { draft: '#94A3B8', sent: '#3B82F6', negotiating: '#D97706', confirmed: '#16A34A', lost: '#DC2626' }
const DOT_PAY = { pending: '#DC2626', partial: '#D97706', paid: '#16A34A' }

function DotBadge({ status }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--txt2)', fontSize: 12, whiteSpace: 'nowrap', fontWeight: 500 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: DOT_STATUS[status] || '#94A3B8', flexShrink: 0, display: 'inline-block' }} />
      {STATUS_MAP[status] || 'Borrador'}
    </span>
  )
}

function BarChart({ data, prevData = [], type = 'income' }) {
  const hasData = data.some(m => m.val > 0)
  const hasPrev = prevData.some(m => m.val > 0)
  if (!hasData) return (
    <div style={{ textAlign: 'center', padding: '22px 0 6px', color: 'var(--txt4)', fontSize: 12 }}>
      <i className="fa fa-chart-bar" style={{ fontSize: 26, opacity: .2, display: 'block', marginBottom: 6 }} />
      <div style={{ fontWeight: 600, color: 'var(--txt3)' }}>Sin datos aún</div>
      <div style={{ fontSize: 11, marginTop: 3 }}>Los ingresos cobrados aparecerán acá mes a mes</div>
    </div>
  )
  const shown = data.map((m, i) => ({ ...m, prev: prevData[i]?.val || 0 }))
  const maxV = Math.max(...shown.map(m => m.val), ...shown.map(m => m.prev), 1)
  const H = 104
  const barMax = 96
  return (
    <div style={{ overflow: 'hidden', width: '100%' }}>
      <div className="bar-chart" style={{ height: H }}>
        {shown.map((m, i) => {
          const pct = m.val / maxV
          const prevPct = m.prev / maxV
          return (
            <div key={i} className="bc" style={{ position: 'relative' }}>
              {prevPct > 0 && (
                <div style={{
                  position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)',
                  width: '70%', height: Math.max(2, prevPct * barMax),
                  background: 'var(--brand)', opacity: 0.15, borderRadius: '3px 3px 0 0', zIndex: 0
                }} />
              )}
              <div
                className="bb"
                style={{
                  height: Math.max(4, pct * barMax),
                  background: 'var(--brand)',
                  opacity: pct === 0 ? 0.12 : 0.35 + pct * 0.65,
                  position: 'relative', zIndex: 1,
                }}
                title={`${fmt(m.val)}${m.prev ? ` · Anterior: ${fmt(m.prev)}` : ''}`}
              />
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        {shown.map((m, i) => (
          <div key={i} className="bl" style={{ flex: 1, textAlign: 'center', opacity: shown.length > 15 ? (Number(m.lbl) % 5 === 0 ? 1 : 0) : 1 }}>
            {m.lbl}
          </div>
        ))}
      </div>
      {hasPrev && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6, fontSize: 10, color: 'var(--txt4)' }}>
          <div style={{ width: 10, height: 10, background: 'var(--brand)', opacity: 0.18, borderRadius: 2, flexShrink: 0 }} />
          <span>Período anterior</span>
        </div>
      )}
    </div>
  )
}

/* ── Urgency helpers ── */
function urgency(days) {
  if (days <= 3) return { cls: 'green', icon: 'fa-clock', label: 'Reciente', color: 'var(--green)' }
  if (days <= 7) return { cls: 'amber', icon: 'fa-hourglass-half', label: 'Necesita atención', color: 'var(--amber)' }
  if (days <= 14) return { cls: 'orange', icon: 'fa-triangle-exclamation', label: 'Urgente', color: '#EA580C' }
  return { cls: 'red', icon: 'fa-fire', label: 'Crítico — sin respuesta', color: 'var(--red)' }
}

const TIERS = [
  { key: 'red', min: 15, max: Infinity, label: 'Crítico — +15 días sin respuesta', color: 'var(--red)', icon: 'fa-fire' },
  { key: 'orange', min: 8, max: 14, label: 'Urgente — 8 a 14 días', color: '#EA580C', icon: 'fa-triangle-exclamation' },
  { key: 'amber', min: 4, max: 7, label: 'Necesita atención — 4 a 7 días', color: 'var(--amber)', icon: 'fa-hourglass-half' },
  { key: 'green', min: 0, max: 3, label: 'Reciente — 0 a 3 días', color: 'var(--green)', icon: 'fa-clock' },
]

const PERIODS = [
  { key: 'thismonth', label: 'Este mes' },
  { key: 'prevmonth', label: 'Mes anterior' },
  { key: '3m', label: 'Últimos 3 meses' },
  { key: '6m', label: 'Últimos 6 meses' },
  { key: 'year', label: 'Año actual' },
  { key: 'custom', label: 'Personalizado' },
]

/* ── Seguimiento card with Re-enviar button ── */
function SeguimientoCard({ b, onEdit, onWA, onResend }) {
  const { money } = usePrivacy()
  const now = new Date()
  const days = b.date ? Math.floor((now - new Date(b.date)) / 86400000) : 0
  const urg = urgency(days)

  return (
    <div className={`seg-card urg-${urg.cls}`}>
      <div className={`seg-light ${urg.cls}`}><i className={`fa ${urg.icon}`} /></div>
      <div className="seg-info">
        <div className="seg-top">
          <span className="seg-num">{b.num}</span>
          <DotBadge status={b.status} />
          <span style={{ fontSize: 11, fontWeight: 600, color: urg.color, background: urg.color + '15', padding: '2px 8px', borderRadius: 12 }}>{urg.label}</span>
        </div>
        <div className="seg-cli"><b>{b.contact || 'Sin contacto'}</b> — {b.company || 'Sin empresa'}</div>
        <div className="seg-co">
          {b.ocasion && <><i className="fa fa-calendar-day" style={{ marginRight: 4 }} />{b.ocasion}  ·  </>}
          <i className="fa fa-calendar" style={{ marginRight: 4 }} />Enviado: {fmtDate(b.date)}
          {b.deliveryDate && ` · Entrega: ${fmtDate(b.deliveryDate)}`}
        </div>
      </div>
      <div className="seg-meta">
        <div className="seg-days">
          <div className="num" style={{ color: urg.color }}>{days}</div>
          <div className="lbl" style={{ color: urg.color }}>días</div>
        </div>
        <div className="seg-total">{money(b.total)}</div>
        <div className="seg-actions" style={{ display:'flex',gap:4 }}>
          <button onClick={() => onEdit(b.id)} title="Editar" style={{ width:28,height:28,borderRadius:'50%',border:'1.5px solid var(--border2)',background:'var(--surface2)',color:'var(--txt2)',cursor:'pointer',fontSize:11,display:'inline-flex',alignItems:'center',justifyContent:'center',padding:0,flexShrink:0 }}><i className="fa fa-pen" /></button>
          <button onClick={() => onWA(b)} title="WhatsApp" style={{ width:28,height:28,borderRadius:'50%',border:'none',background:'#DCFCE7',color:'#16A34A',cursor:'pointer',fontSize:13,display:'inline-flex',alignItems:'center',justifyContent:'center',padding:0,flexShrink:0 }}><i className="fa-brands fa-whatsapp" /></button>
          <button onClick={() => onResend(b)} title="Re-enviar presupuesto" style={{ width:28,height:28,borderRadius:'50%',border:'1.5px solid var(--border2)',background:'var(--surface2)',color:'var(--txt2)',cursor:'pointer',fontSize:11,display:'inline-flex',alignItems:'center',justifyContent:'center',padding:0,flexShrink:0 }}><i className="fa fa-paper-plane" /></button>
        </div>
      </div>
    </div>
  )
}

/* ── Resend Modal ── */
function ResendModal({ budget, onClose, onSend }) {
  const defaultMsg = `Hola ${budget.contact || ''}!\n\nTe escribo para darle seguimiento al presupuesto ${budget.num || ''} que te enviamos el ${budget.date || '—'} por un total de ${fmt(budget.total)}.\n\nPudiste revisarlo? Estamos a disposicion para cualquier consulta o ajuste que necesites.\n\nSaludos!\nEquipo ANMA`
  const [msg, setMsg] = useState(defaultMsg)

  const copyAndClose = () => {
    navigator.clipboard.writeText(msg).then(() => onSend())
  }

  const openWA = () => {
    if (budget.wa) {
      const num = budget.wa.replace(/\D/g, '')
      window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`, '_blank')
    }
    onSend()
  }

  return (
    <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
        <div className="mh">
          <h3><i className="fa fa-paper-plane" style={{ color: 'var(--brand)', marginRight: 8 }} />Re-enviar presupuesto</h3>
          <button className="mclose" onClick={onClose}><i className="fa fa-xmark" /></button>
        </div>

        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <div style={{ background: 'var(--brand-xlt)', color: 'var(--brand)', padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
            <i className="fa fa-file-invoice" style={{ marginRight: 6 }} />{budget.num || '—'}
          </div>
          <div style={{ background: 'var(--surface2)', color: 'var(--txt2)', padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
            <i className="fa fa-building" style={{ marginRight: 6 }} />{budget.company || budget.contact || '—'}
          </div>
          <div style={{ background: 'var(--green-lt)', color: 'var(--green)', padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
            {fmt(budget.total)}
          </div>
        </div>

        <div className="fg">
          <label>Mensaje de seguimiento</label>
          <textarea value={msg} onChange={e => setMsg(e.target.value)} rows={8}
            style={{ fontFamily: 'inherit', lineHeight: 1.6, fontSize: 13 }} />
        </div>

        <div className="mfooter">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-secondary" onClick={copyAndClose}>
            <i className="fa fa-copy" /> Copiar texto
          </button>
          {budget.wa && (
            <button className="btn btn-primary" style={{ background: '#25D366' }} onClick={openWA}>
              <i className="fa-brands fa-whatsapp" /> Enviar por WhatsApp
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Status Donut ── */
function StatusDonut({ statuses, budgets, onSegmentClick }) {
  const total = budgets.length || 1
  let cumulative = 0
  const segments = statuses.map(s => {
    const n = budgets.filter(b => b.status === s.k).length
    const pct = n / total * 100
    const start = cumulative
    cumulative += pct
    return { ...s, n, pct, start }
  }).filter(s => s.n > 0)

  const radius = 36
  const circumference = 2 * Math.PI * radius
  const clickable = !!onSegmentClick

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
      <svg width="108" height="108" viewBox="0 0 90 90" style={{ flexShrink: 0 }}>
        <circle cx="45" cy="45" r={radius} fill="none" stroke="var(--surface2)" strokeWidth="10" />
        {segments.map((s, i) => (
          <circle key={i} cx="45" cy="45" r={radius} fill="none" stroke={s.c} strokeWidth="10"
            strokeDasharray={`${s.pct / 100 * circumference} ${circumference}`}
            strokeDashoffset={-s.start / 100 * circumference}
            transform="rotate(-90 45 45)" strokeLinecap="round"
            style={{ transition: 'all .6s ease', cursor: clickable ? 'pointer' : 'default' }}
            onClick={clickable ? () => onSegmentClick(s.k) : undefined}>
            <title>{`${s.l}: ${s.n} (${Math.round(s.pct)}%) — click para filtrar`}</title>
          </circle>
        ))}
        <text x="45" y="50" textAnchor="middle" fontSize="16" fontWeight="800" fill="var(--txt)">{budgets.length}</text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
        {statuses.filter(s => budgets.filter(b => b.status === s.k).length > 0).length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--txt4)', textAlign: 'center', padding: 8 }}>Sin presupuestos aún</div>
        ) : statuses.filter(s => budgets.filter(b => b.status === s.k).length > 0).map(s => {
          const n = budgets.filter(b => b.status === s.k).length
          const pct = Math.round(n / total * 100)
          return (
            <div key={s.k}
              onClick={clickable ? () => onSegmentClick(s.k) : undefined}
              style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: clickable ? 'pointer' : 'default', padding: '2px 4px', borderRadius: 6, transition: 'background .15s' }}
              onMouseEnter={e => { if (clickable) e.currentTarget.style.background = 'var(--surface2)' }}
              onMouseLeave={e => { if (clickable) e.currentTarget.style.background = 'transparent' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.c, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: 'var(--txt2)', flex: 1 }}>{s.l}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: s.c, background: s.c + '15', padding: '1px 5px', borderRadius: 6, flexShrink: 0 }}>{pct}%</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--txt)', background: 'var(--surface2)', padding: '1px 7px', borderRadius: 8, flexShrink: 0 }}>{n}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function Historial() {
  const { get, config, updateBudgetStatus, deleteBudget, saveBudget, deductKitStock } = useData()
  const toast   = useToast()
  const confirm = useConfirm()
  const nav = useNavigate()
  const [tab, setTab] = useState('resumen')
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [resendBudget, setResendBudget] = useState(null)
  const [period, setPeriod] = useState('thismonth')
  const [showPeriodDrop, setShowPeriodDrop] = useState(false)
  const [sortKey, setSortKey] = useState('id')
  const [sortDir, setSortDir] = useState('desc')
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [bulkStatus, setBulkStatus] = useState('')
  const [openMenuId, setOpenMenuId] = useState(null)
  const [carouselSlide, setCarouselSlide] = useState(0)
  const [quickFilter, setQuickFilter] = useState('')
  const [pendingLossId, setPendingLossId] = useState(null)
  const [showLossReason, setShowLossReason] = useState(false)
  const [selectedCliente, setSelectedCliente] = useState(null)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [previewBudget, setPreviewBudget] = useState(null)
  const [todayCollapsed, setTodayCollapsed] = useState(() => db('todayCollapsed', false))
  const toggleTodayCollapsed = () => {
    setTodayCollapsed(c => {
      const next = !c
      dbW('todayCollapsed', next)
      return next
    })
  }
  const { hidden, money } = usePrivacy()

  const drillDownToStatus = (statusKey) => {
    setFilter(statusKey)
    setQuickFilter('')
    setTab('lista')
  }
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [filterLoading, setFilterLoading] = useState(false)

  const budgets = get('budgets')
  const products = get('products')
  const insumos  = get('insumos')
  const clients = get('clients')
  const c = config()
  const { role } = useAuth()
  const opHideMetrics = role === 'operator' && c.opShowMetrics === false
  const now = new Date()

  useEffect(() => { const t = setTimeout(() => setLoading(false), 80); return () => clearTimeout(t) }, [])
  useEffect(() => {
    setFilterLoading(true)
    const t = setTimeout(() => setFilterLoading(false), 220)
    return () => clearTimeout(t)
  }, [period, customFrom, customTo])

  // Period filter
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const prevYM2 = (() => { const d = new Date(now.getFullYear(), now.getMonth() - 1, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` })()
  let periodBudgets
  if (period === 'custom' && customFrom && customTo) {
    const from = new Date(customFrom)
    const to = new Date(customTo + 'T23:59:59')
    periodBudgets = budgets.filter(b => b.date && new Date(b.date) >= from && new Date(b.date) <= to)
  } else if (period === 'thismonth') {
    periodBudgets = budgets.filter(b => b.date?.startsWith(ym))
  } else if (period === 'prevmonth') {
    periodBudgets = budgets.filter(b => b.date?.startsWith(prevYM2))
  } else if (period === 'year') {
    periodBudgets = budgets.filter(b => b.date?.startsWith(String(now.getFullYear())))
  } else if (period === '3m') {
    const s = new Date(now.getFullYear(), now.getMonth() - 3, 1)
    periodBudgets = budgets.filter(b => b.date && new Date(b.date) >= s)
  } else if (period === '6m') {
    const s = new Date(now.getFullYear(), now.getMonth() - 6, 1)
    periodBudgets = budgets.filter(b => b.date && new Date(b.date) >= s)
  } else {
    periodBudgets = budgets
  }

  // Helper: dinero real cobrado segun estado de pago
  const cobrado = (b) => {
    if (b.payStatus === 'paid') return b.total || 0
    if (b.payStatus === 'partial') return b.depositAmt || Math.round((b.total || 0) * (b.deposit || 50) / 100)
    return 0
  }
  const ganCobrada = (b) => {
    if (b.payStatus === 'paid') return b.totalGain || 0
    if (b.payStatus === 'partial') {
      const pct = (b.depositAmt || 0) / ((b.total || 1))
      return Math.round((b.totalGain || 0) * pct)
    }
    return 0
  }

  // KPI calculations
  const totBudgeted = periodBudgets.reduce((s, b) => s + (b.total || 0), 0)
  const confirmed = periodBudgets.filter(b => b.status === 'confirmed')
  const pagados = periodBudgets.filter(b => b.payStatus === 'paid' || b.payStatus === 'partial')
  const totCobrado = pagados.reduce((s, b) => s + cobrado(b), 0)
  const avgTicket = periodBudgets.length ? Math.round(totBudgeted / periodBudgets.length) : 0
  const convRate = periodBudgets.length ? Math.round(confirmed.length / periodBudgets.length * 100) + '%' : '—'

  // Prev period budgets for delta comparisons
  let prevPeriodBudgets = []
  if (period === 'thismonth') {
    prevPeriodBudgets = budgets.filter(b => b.date?.startsWith(prevYM2))
  } else if (period === 'prevmonth') {
    const twoAgo = (() => { const d = new Date(now.getFullYear(), now.getMonth() - 2, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` })()
    prevPeriodBudgets = budgets.filter(b => b.date?.startsWith(twoAgo))
  } else if (period === '3m') {
    const s3 = new Date(now.getFullYear(), now.getMonth() - 6, 1)
    const e3 = new Date(now.getFullYear(), now.getMonth() - 3, 1)
    prevPeriodBudgets = budgets.filter(b => b.date && new Date(b.date) >= s3 && new Date(b.date) < e3)
  } else if (period === '6m') {
    const s6 = new Date(now.getFullYear(), now.getMonth() - 12, 1)
    const e6 = new Date(now.getFullYear(), now.getMonth() - 6, 1)
    prevPeriodBudgets = budgets.filter(b => b.date && new Date(b.date) >= s6 && new Date(b.date) < e6)
  } else if (period === 'year') {
    prevPeriodBudgets = budgets.filter(b => b.date?.startsWith(String(now.getFullYear() - 1)))
  }
  const prevPagados = prevPeriodBudgets.filter(b => b.payStatus === 'paid' || b.payStatus === 'partial')
  const prevTotBudgeted = prevPeriodBudgets.reduce((s, b) => s + (b.total || 0), 0)
  const prevTotCobrado = prevPagados.reduce((s, b) => s + cobrado(b), 0)
  const deltaBrutas = prevTotBudgeted > 0 ? Math.round((totBudgeted - prevTotBudgeted) / prevTotBudgeted * 100) : null
  const deltaCaja = prevTotCobrado > 0 ? Math.round((totCobrado - prevTotCobrado) / prevTotCobrado * 100) : null

  // ── Sparklines: últimos 14 días ──
  const sparkBrutas = (() => {
    const arr = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0,0,0,0)
      const ds = d.toISOString().slice(0, 10)
      arr.push(budgets.filter(b => b.date === ds).reduce((s, b) => s + (b.total || 0), 0))
    }
    return arr
  })()
  const sparkCaja = (() => {
    const arr = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0,0,0,0)
      const ds = d.toISOString().slice(0, 10)
      arr.push(budgets.filter(b => b.date === ds).reduce((s, b) => s + cobrado(b), 0))
    }
    return arr
  })()
  const sparkTicket = (() => {
    const arr = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0,0,0,0)
      const ds = d.toISOString().slice(0, 10)
      const dayBs = budgets.filter(b => b.date === ds)
      arr.push(dayBs.length ? dayBs.reduce((s, b) => s + (b.total || 0), 0) / dayBs.length : 0)
    }
    return arr
  })()

  // ── MODO HOY ──
  const today = new Date(); today.setHours(0,0,0,0)
  const todayStr = today.toISOString().slice(0, 10)
  const cobrosVencidos = budgets.filter(b => {
    if (b.status !== 'confirmed') return false
    if (b.payStatus === 'paid') return false
    if (!b.deliveryDate) return false
    return new Date(b.deliveryDate + 'T00:00') <= today
  })
  const cobrosVencidosMonto = cobrosVencidos.reduce((s, b) => s + ((b.total || 0) - cobrado(b)), 0)
  const entregasHoy = budgets.filter(b => b.deliveryDate === todayStr && !['lost'].includes(b.status))
  const aConfirmar = budgets.filter(b => {
    if (!['sent', 'negotiating'].includes(b.status)) return false
    const days = b.date ? Math.floor((today - new Date(b.date + 'T00:00')) / 86400000) : 0
    return days >= 3
  })

  // Insight banner
  const insightIcon = deltaBrutas !== null && deltaBrutas > 20 ? 'fa-rocket' : deltaBrutas !== null && deltaBrutas > 0 ? 'fa-chart-line' : deltaBrutas !== null && deltaBrutas < -20 ? 'fa-triangle-exclamation' : deltaBrutas !== null && deltaBrutas < 0 ? 'fa-arrow-trend-down' : convRate !== '—' && parseInt(convRate) >= 60 ? 'fa-star' : periodBudgets.length === 0 ? 'fa-circle-info' : 'fa-chart-bar'
  const insightColor = deltaBrutas !== null && deltaBrutas > 0 ? 'var(--green)' : deltaBrutas !== null && deltaBrutas < 0 ? 'var(--amber)' : 'var(--brand)'
  const insightText = periodBudgets.length === 0
    ? 'Todavía no hay datos para este período. Registrá presupuestos para ver tus métricas.'
    : deltaBrutas !== null && deltaBrutas > 20
      ? `Las ventas crecieron un ${deltaBrutas}% respecto al período anterior. ¡Excelente momento!`
      : deltaBrutas !== null && deltaBrutas > 0
        ? `Crecimiento del ${deltaBrutas}% en ventas vs. el período anterior. Buen ritmo.`
        : deltaBrutas !== null && deltaBrutas < -20
          ? `Las ventas bajaron un ${Math.abs(deltaBrutas)}% vs. el período anterior. Momento de reforzar el seguimiento.`
          : deltaBrutas !== null && deltaBrutas < 0
            ? `Leve caída del ${Math.abs(deltaBrutas)}% en ventas respecto al período anterior.`
            : convRate !== '—' && parseInt(convRate) >= 60
              ? `Conversión del ${convRate} — cerrás más de la mitad de los presupuestos que enviás.`
              : `${periodBudgets.length} presupuesto${periodBudgets.length !== 1 ? 's' : ''} en el período · Ticket promedio ${money(avgTicket)} · Conversión ${convRate}`

  // Chart data — daily for thismonth/prevmonth, monthly otherwise
  const barMonths = period === '3m' ? 3 : period === 'year' ? 12 : 6
  const isDaily = period === 'thismonth' || period === 'prevmonth'
  let chartData = []
  let prevChartData = []
  if (period === 'thismonth') {
    const cy = now.getFullYear(); const cmo = now.getMonth()
    const cymStr = `${cy}-${String(cmo + 1).padStart(2, '0')}`
    const [py, pmo] = cmo === 0 ? [cy - 1, 11] : [cy, cmo - 1]
    const pymStr = `${py}-${String(pmo + 1).padStart(2, '0')}`
    const daysInMonth = new Date(cy, cmo + 1, 0).getDate()
    const daysInPrev = new Date(py, pmo + 1, 0).getDate()
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = String(d).padStart(2, '0')
      chartData.push({ lbl: String(d), val: budgets.filter(b => b.date === `${cymStr}-${ds}`).reduce((s, b) => s + cobrado(b), 0) })
    }
    for (let d = 1; d <= daysInPrev; d++) {
      const ds = String(d).padStart(2, '0')
      prevChartData.push({ lbl: String(d), val: budgets.filter(b => b.date === `${pymStr}-${ds}`).reduce((s, b) => s + cobrado(b), 0) })
    }
  } else if (period === 'prevmonth') {
    const pmd = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const pymStr1 = `${pmd.getFullYear()}-${String(pmd.getMonth() + 1).padStart(2, '0')}`
    const pmd2 = new Date(now.getFullYear(), now.getMonth() - 2, 1)
    const pymStr2 = `${pmd2.getFullYear()}-${String(pmd2.getMonth() + 1).padStart(2, '0')}`
    const daysInMonth = new Date(pmd.getFullYear(), pmd.getMonth() + 1, 0).getDate()
    const daysInPrev = new Date(pmd2.getFullYear(), pmd2.getMonth() + 1, 0).getDate()
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = String(d).padStart(2, '0')
      chartData.push({ lbl: String(d), val: budgets.filter(b => b.date === `${pymStr1}-${ds}`).reduce((s, b) => s + cobrado(b), 0) })
    }
    for (let d = 1; d <= daysInPrev; d++) {
      const ds = String(d).padStart(2, '0')
      prevChartData.push({ lbl: String(d), val: budgets.filter(b => b.date === `${pymStr2}-${ds}`).reduce((s, b) => s + cobrado(b), 0) })
    }
  } else {
    for (let i = barMonths - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      chartData.push({ lbl: MONTHS[d.getMonth()], val: budgets.filter(b => b.date?.startsWith(key)).reduce((s, b) => s + cobrado(b), 0) })
      const pd = new Date(now.getFullYear(), now.getMonth() - i - barMonths, 1)
      const pkey = `${pd.getFullYear()}-${String(pd.getMonth() + 1).padStart(2, '0')}`
      prevChartData.push({ lbl: MONTHS[pd.getMonth()], val: budgets.filter(b => b.date?.startsWith(pkey)).reduce((s, b) => s + cobrado(b), 0) })
    }
  }

  const gainData = []
  for (let i = barMonths - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const val = budgets.filter(b => b.date?.startsWith(key)).reduce((s, b) => s + ganCobrada(b), 0)
    gainData.push({ lbl: MONTHS[d.getMonth()], val })
  }

  // Status
  const statuses = [
    { k: 'draft', l: 'Borrador', c: '#94A3B8' },
    { k: 'sent', l: 'Enviado', c: 'var(--blue)' },
    { k: 'negotiating', l: 'Negociando', c: 'var(--amber)' },
    { k: 'confirmed', l: 'Confirmado', c: 'var(--green)' },
    { k: 'lost', l: 'Perdido', c: 'var(--red)' },
  ]

  // Filtered budgets for list tab
  let filteredBudgets = [...periodBudgets]
  if (filter !== 'all') filteredBudgets = filteredBudgets.filter(b => b.status === filter)
  if (search) {
    const sq = search.toLowerCase()
    filteredBudgets = filteredBudgets.filter(b =>
      (b.company || '').toLowerCase().includes(sq) ||
      (b.contact || '').toLowerCase().includes(sq) ||
      (b.num || '').toLowerCase().includes(sq)
    )
  }
  // Ordenamiento dinámico
  filteredBudgets.sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1
    if (sortKey === 'date') return ((a.date || '') > (b.date || '') ? 1 : -1) * dir
    if (sortKey === 'total') return ((a.total || 0) - (b.total || 0)) * dir
    if (sortKey === 'gain') return ((a.totalGain || 0) - (b.totalGain || 0)) * dir
    return (a.id - b.id) * dir
  })

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }
  const sortArrow = (key) => sortKey !== key ? <i className="fa fa-sort" style={{ opacity: .3, marginLeft: 4, fontSize: 10 }} /> : <i className={`fa fa-sort-${sortDir === 'asc' ? 'up' : 'down'}`} style={{ marginLeft: 4, fontSize: 10 }} />

  // días hasta entrega
  const deliveryDays = (iso) => { if (!iso) return null; const t = new Date(); t.setHours(0,0,0,0); const d = new Date(iso + 'T00:00'); return Math.ceil((d - t) / 86400000) }
  if (quickFilter === 'atrasados') {
    filteredBudgets = filteredBudgets.filter(b => { const dd = deliveryDays(b.deliveryDate); return dd !== null && dd <= 0 && !['confirmed', 'lost'].includes(b.status) })
  } else if (quickFilter === 'sin_cobrar') {
    filteredBudgets = filteredBudgets.filter(b => b.status === 'confirmed' && (!b.payStatus || b.payStatus === 'pending'))
  } else if (quickFilter === 'alta_ganancia') {
    const gs = [...periodBudgets].filter(b => (b.totalGain || 0) > 0).sort((a, b) => (b.totalGain || 0) - (a.totalGain || 0))
    const cutoff = gs[Math.floor(gs.length / 3)]?.totalGain || 0
    if (cutoff > 0) filteredBudgets = filteredBudgets.filter(b => (b.totalGain || 0) >= cutoff)
  }

  // Seguimiento: ALL pending budgets (sent/negotiating), grouped by tier
  const seguimiento = useMemo(() => {
    return budgets
      .filter(b => ['sent', 'negotiating'].includes(b.status))
      .map(b => ({ ...b, days: b.date ? Math.floor((now - new Date(b.date)) / 86400000) : 0 }))
      .sort((a, b) => b.days - a.days)
  }, [budgets])

  const tierGroups = useMemo(() => {
    return TIERS.map(tier => ({
      ...tier,
      items: seguimiento.filter(b => b.days >= tier.min && b.days <= tier.max)
    }))
  }, [seguimiento])

  // Dashboard mini-timeline: top 3 most urgent
  const urgentTop3 = useMemo(() => {
    return seguimiento.slice(0, 3)
  }, [seguimiento])

  // Próximas entregas para carousel (regalos no maneja stock)
  const upcomingDeliveries = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    return budgets
      .filter(b => b.deliveryDate && !['lost', 'cancelled', 'delivered'].includes(b.status))
      .map(b => {
        const d = new Date(b.deliveryDate + 'T00:00')
        const diff = Math.ceil((d - today) / 86400000)
        return { ...b, daysToDeliv: diff }
      })
      .filter(b => b.daysToDeliv >= -1 && b.daysToDeliv <= 14)
      .sort((a, b) => a.daysToDeliv - b.daysToDeliv)
      .slice(0, 3)
  }, [budgets])

  // Stock crítico para carousel
  const lowStockProducts = useMemo(() => {
    return products
      .filter(p => p.minStock > 0 && (p.stock || 0) <= p.minStock)
      .sort((a, b) => ((a.stock || 0) / (a.minStock || 1)) - ((b.stock || 0) / (b.minStock || 1)))
      .slice(0, 3)
  }, [products])
  const lowStockInsumos = useMemo(() => {
    return insumos
      .filter(i => i.minStock > 0 && (i.stock || 0) <= i.minStock)
      .sort((a, b) => ((a.stock || 0) / (a.minStock || 1)) - ((b.stock || 0) / (b.minStock || 1)))
      .slice(0, 3)
  }, [insumos])

  // Auto-advance carousel cada 7s
  useEffect(() => {
    const t = setInterval(() => setCarouselSlide(s => (s + 1) % 3), 7000)
    return () => clearInterval(t)
  }, [])

  // Top clients
  const byClient = {}
  confirmed.forEach(b => { const k = b.company || b.contact || '—'; byClient[k] = (byClient[k] || 0) + (b.total || 0) })
  const topClients = Object.entries(byClient).sort((a, b) => b[1] - a[1]).slice(0, 3)

  // Analysis metrics
  const totGain = pagados.reduce((s, b) => s + ganCobrada(b), 0)

  const editB = (id) => nav(`/presupuesto/${id}`)
  const copyWA = (b) => {
    const text = `Hola ${b.contact || ''}! Te envío el presupuesto ${b.num} por ${fmt(b.total)}. Quedamos a disposición!`
    navigator.clipboard.writeText(text).then(() => toast('Mensaje WA copiado', 'ok'))
  }
  const handleDelete = (b) => {
    const label = b.num || `#${b.id}`
    confirm({
      body: `⚠ ELIMINAR ${label}\n\nCliente: ${b.contact || b.company || '—'}\nTotal: ${fmt(b.total)}\n\nEsta acción no se puede deshacer.`,
      danger: true,
      requireText: 'ELIMINAR',
      confirmLabel: 'Eliminar definitivamente',
    }, () => {
      deleteBudget(b.id)
      toast('Presupuesto eliminado', 'in')
      setSelectedIds(prev => { const n = new Set(prev); n.delete(b.id); return n })
    })
  }
  const STATUS_COLORS = {
    draft:       { bg: '#F1F5F9', color: '#475569', border: '#CBD5E1' },
    sent:        { bg: '#EFF6FF', color: '#1D4ED8', border: '#93C5FD' },
    negotiating: { bg: '#FFFBEB', color: '#D97706', border: '#FCD34D' },
    confirmed:   { bg: '#F0FDF4', color: '#16A34A', border: '#86EFAC' },
    lost:        { bg: '#FEF2F2', color: '#DC2626', border: '#FCA5A5' },
  }
  const PAY_STATUS_COLORS = {
    pending: { bg: '#FEF2F2', color: '#DC2626', border: '#FCA5A5' },
    partial: { bg: '#FFFBEB', color: '#D97706', border: '#FCD34D' },
    paid:    { bg: '#F0FDF4', color: '#16A34A', border: '#86EFAC' },
  }
  const handlePayStatusChange = (id, payStatus) => {
    const b = budgets.find(x => x.id === id)
    if (b) { saveBudget({ ...b, payStatus }); toast('Pago actualizado', 'ok') }
  }
  const REGALOS_QUALIFYING = new Set(['inprogress', 'delivered'])
  const handleStatusChange = (id, status) => {
    if (status === 'lost') {
      setPendingLossId(id)
      return
    }
    const b = budgets.find(x => x.id === id)
    if (b && REGALOS_QUALIFYING.has(status) && !b.stockDeducted) {
      const approvedAlt = (b.alternatives || []).find(a => a.approved) || (b.alternatives || [])[0]
      if (approvedAlt) deductKitStock(approvedAlt, b.num || '')
      const frozenCost = b.totalCost ?? (b.baseCost || 0)
      saveBudget({ ...b, status, stockDeducted: true, totalCost: frozenCost, totalGain: (b.total || 0) - frozenCost })
      toast('Estado actualizado', 'ok')
      return
    }
    updateBudgetStatus(id, status); toast('Estado actualizado', 'ok')
  }
  const confirmLoss = (reason) => {
    if (!pendingLossId) return
    const b = budgets.find(x => x.id === pendingLossId)
    if (b) {
      saveBudget({ ...b, status: 'lost', lossReason: reason, lossDate: new Date().toISOString().slice(0, 10) })
      toast(`Marcado como perdido · ${reason}`, 'in')
    }
    setPendingLossId(null)
  }
  const toggleSelect = (id) => setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleSelectAll = (list) => setSelectedIds(prev => {
    const allSel = list.every(b => prev.has(b.id))
    if (allSel) { const n = new Set(prev); list.forEach(b => n.delete(b.id)); return n }
    const n = new Set(prev); list.forEach(b => n.add(b.id)); return n
  })
  const applyBulkStatus = () => {
    if (!bulkStatus || !selectedIds.size) return
    if (bulkStatus === 'lost') {
      toast('Marcá los presupuestos como "Perdido" uno a uno para registrar el motivo', 'in')
      return
    }
    const isQualifying = REGALOS_QUALIFYING.has(bulkStatus)
    selectedIds.forEach(id => {
      const b = budgets.find(x => x.id === id)
      if (b && isQualifying && !b.stockDeducted) {
        const approvedAlt = (b.alternatives || []).find(a => a.approved) || (b.alternatives || [])[0]
        if (approvedAlt) deductKitStock(approvedAlt, b.num || '')
        const frozenCost = b.totalCost ?? (b.baseCost || 0)
        saveBudget({ ...b, status: bulkStatus, stockDeducted: true, totalCost: frozenCost, totalGain: (b.total || 0) - frozenCost })
      } else {
        updateBudgetStatus(id, bulkStatus)
      }
    })
    toast(`${selectedIds.size} presupuestos actualizados`, 'ok')
    setSelectedIds(new Set()); setBulkStatus('')
  }
  const csvEsc = (v) => { const s = String(v ?? ''); return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s }
  const CSV_HEADERS = ['N°','Fecha','Cliente','Empresa','Estado','Pago','Total','Costo','Ganancia','Margen%','Seña','Stock descontado','Fecha costo']
  const budgetToRow = (b) => [
    b.num, b.date,
    csvEsc(b.contact || ''), csvEsc(b.company || ''),
    csvEsc(STATUS_MAP[b.status] || b.status || ''),
    csvEsc(PAY_STATUS_MAP[b.payStatus] || b.payStatus || ''),
    b.total ?? '', b.totalCost ?? '', b.totalGain ?? '',
    b.marginBudgeted != null ? `${b.marginBudgeted}%` : '',
    b.depositAmt ?? '',
    b.stockDeducted ? 'Sí' : 'No',
    b.costSnapshot?.date || '',
  ].join(',')
  const downloadCSV = (rows, filename) => {
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = filename; a.click()
  }
  const bulkExportCSV = () => {
    if (!selectedIds.size) return
    const sel = budgets.filter(b => selectedIds.has(b.id))
    downloadCSV([CSV_HEADERS.join(','), ...sel.map(budgetToRow)], `presupuestos_sel_${new Date().toISOString().slice(0,10)}.csv`)
  }

  /* ── ESC cierra modales ── */
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        if (resendBudget) { setResendBudget(null); return }
        setOpenMenuId(null)
      }
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [resendBudget])

  // Cierra menu de 3 puntos al click fuera
  useEffect(() => {
    if (!openMenuId) return
    const h = () => setOpenMenuId(null)
    document.addEventListener('click', h)
    return () => document.removeEventListener('click', h)
  }, [openMenuId])

  const handleResend = (b) => setResendBudget(b)
  const handleResendSent = () => { toast('Mensaje copiado / enviado', 'ok'); setResendBudget(null) }

  const exportCSV = () => {
    downloadCSV([CSV_HEADERS.join(','), ...budgets.map(budgetToRow)], `presupuestos_${new Date().toISOString().slice(0,10)}.csv`)
  }

  // ── INSIGHTS auto-generados ──
  const insights = useMemo(() => {
    const out = []
    if (topClients.length > 0 && totBudgeted > 0) {
      const topPct = Math.round((topClients[0][1] / Math.max(1, confirmed.reduce((s, b) => s + (b.total || 0), 0))) * 100)
      if (topPct >= 60) {
        out.push({ tone: 'warning', icon: 'fa-triangle-exclamation', label: 'Concentración de ventas', value: `${topPct}%`, title: `Riesgo de concentración: ${topPct}% en una sola clienta`, desc: `${topClients[0][0]} concentra el ${topPct}% de tus ventas confirmadas. Si se va, te golpea fuerte. Pensá en diversificar.` })
      } else if (topPct >= 40) {
        out.push({ tone: 'info', icon: 'fa-circle-info', label: 'Cliente principal', value: `${topPct}%`, title: `${topClients[0][0]} es tu clienta más fuerte (${topPct}%)`, desc: `Cuidala bien — representa ${topPct}% de tus ventas confirmadas en el período.` })
      }
    }
    if (deltaBrutas !== null) {
      if (deltaBrutas >= 25) {
        out.push({ tone: 'success', icon: 'fa-rocket', label: 'Crecimiento del período', value: `+${deltaBrutas}%`, title: `Crecimiento fuerte: +${deltaBrutas}% vs período anterior`, desc: `Estás vendiendo ${deltaBrutas}% más. Identificá qué cambió y duplicá esa apuesta.` })
      } else if (deltaBrutas <= -20) {
        out.push({ tone: 'warning', icon: 'fa-arrow-trend-down', label: 'Caída de ventas', value: `-${Math.abs(deltaBrutas)}%`, title: `Caída de ${Math.abs(deltaBrutas)}% vs período anterior`, desc: `Las ventas bajaron ${Math.abs(deltaBrutas)}%. Revisá la cartera de seguimiento — puede haber leads tibios sin recordatorio.` })
      }
    }
    if (periodBudgets.length >= 5) {
      const cr = Math.round(confirmed.length / periodBudgets.length * 100)
      if (cr >= 60) {
        out.push({ tone: 'success', icon: 'fa-bullseye', label: 'Conversión excelente', value: `${cr}%`, title: `Conversión excelente: ${cr}%`, desc: `Cerrás ${cr} de cada 100 presupuestos enviados. Por encima del promedio (35–55%).` })
      } else if (cr <= 25) {
        out.push({ tone: 'warning', icon: 'fa-funnel-dollar', label: 'Conversión baja', value: `${cr}%`, title: `Conversión baja: ${cr}%`, desc: `Cerrás solo ${cr}% de los presupuestos. Considerá: precio competitivo, tiempos de respuesta, calidad del seguimiento.` })
      }
    }
    const lostWithReason = budgets.filter(b => b.status === 'lost' && b.lossReason)
    if (lostWithReason.length >= 3) {
      const reasonCount = {}
      lostWithReason.forEach(b => { reasonCount[b.lossReason] = (reasonCount[b.lossReason] || 0) + 1 })
      const top = Object.entries(reasonCount).sort((a, b) => b[1] - a[1])[0]
      const pct = Math.round(top[1] / lostWithReason.length * 100)
      if (pct >= 40) {
        out.push({ tone: 'info', icon: 'fa-magnifying-glass-chart', label: `Pérdidas: "${top[0]}"`, value: `${pct}%`, title: `${pct}% de las pérdidas: "${top[0]}"`, desc: `Es el motivo más frecuente. Atacarlo puede recuperar muchas oportunidades.` })
      }
    }
    if (cobrosVencidos.length >= 3) {
      out.push({ tone: 'warning', icon: 'fa-hand-holding-dollar', label: 'Cobros vencidos', value: money(cobrosVencidosMonto), title: `${cobrosVencidos.length} cobros vencidos · ${money(cobrosVencidosMonto)}`, desc: `Hay dinero pendiente que ya debería estar en caja. Empezá por los más antiguos.` })
    }
    if (period === 'thismonth' && prevPeriodBudgets.length > 0 && periodBudgets.length > 0) {
      const prevAvg = Math.round(prevTotBudgeted / prevPeriodBudgets.length)
      if (prevAvg > 0) {
        const ticketDelta = Math.round((avgTicket - prevAvg) / prevAvg * 100)
        if (ticketDelta >= 20) {
          out.push({ tone: 'success', icon: 'fa-arrow-up-right-dots', label: 'Ticket promedio', value: `+${ticketDelta}%`, title: `Ticket promedio creció ${ticketDelta}%`, desc: `Pasaste de ${money(prevAvg)} a ${money(avgTicket)}. Estás vendiendo más por venta.` })
        } else if (ticketDelta <= -20) {
          out.push({ tone: 'warning', icon: 'fa-arrow-trend-down', label: 'Ticket promedio', value: `-${Math.abs(ticketDelta)}%`, title: `Ticket promedio cayó ${Math.abs(ticketDelta)}%`, desc: `Estás vendiendo más chico (${money(avgTicket)} vs ${money(prevAvg)}). ¿Cambió el mix de productos?` })
        }
      }
    }
    return out
  }, [budgets, periodBudgets, prevPeriodBudgets, deltaBrutas, topClients, confirmed, cobrosVencidos, avgTicket, period, prevTotBudgeted, totBudgeted])

  const openWADirect = (b) => {
    if (!b.wa) { copyWA(b); return }
    const num = b.wa.replace(/\D/g, '')
    const text = `Hola ${b.contact || ''}! Te escribo por el presupuesto ${b.num} por ${fmt(b.total)}. ¿Pudiste revisarlo? Quedamos a disposición!`
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(text)}`, '_blank')
  }

  return (
    <div className="page active" style={{ animation: 'pgIn .25s ease both' }}>
      {/* Mobile: single combined period + tabs row */}
      <div className="dash-ctrl-bar">
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button className="dash-period-pill" onClick={() => setShowPeriodDrop(d => !d)}>
            <i className="fa fa-calendar" style={{ fontSize: 10 }} />
            <span>{PERIODS.find(p => p.key === period)?.label || 'Este mes'}</span>
            <i className="fa fa-chevron-down" style={{ fontSize: 8, marginLeft: 1 }} />
          </button>
          {showPeriodDrop && (
            <div className="dash-period-drop-m" onClick={e => e.stopPropagation()}>
              {PERIODS.map(p => (
                <button key={p.key} onClick={() => { setPeriod(p.key); setShowPeriodDrop(false) }}
                  style={{ display: 'block', width: '100%', padding: '9px 16px', border: 'none',
                    background: period === p.key ? 'var(--brand-xlt)' : 'transparent',
                    color: period === p.key ? 'var(--brand)' : 'var(--txt2)',
                    fontSize: 12, fontWeight: period === p.key ? 700 : 500,
                    cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
                  {p.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="dash-ctrl-divider" />
        <div className="dash-ctrl-tabs">
          {[
            { key: 'resumen',     lbl: 'Resumen' },
            { key: 'lista',       lbl: 'Presupuestos' },
            { key: 'analisis',    lbl: 'Análisis' },
            { key: 'seguimiento', lbl: seguimiento.length > 0 ? `Seguim. (${seguimiento.length})` : 'Seguimiento' },
          ].map(t => (
            <button key={t.key} className={`dash-ctrl-tab${tab === t.key ? ' active' : ''}`} onClick={() => setTab(t.key)}>
              {t.lbl}
            </button>
          ))}
        </div>
      </div>

      {/* Desktop: full header */}
      <div className="ph ph-hist">
        <div className="ph-right" style={{ gap: 8 }}>
          {/* Period dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              className="ph-period-btn"
              onClick={() => setShowPeriodDrop(d => !d)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--txt2)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
            >
              <i className="fa fa-calendar" style={{ fontSize: 11, color: 'var(--txt3)' }} />
              <span className="ph-period-lbl">{PERIODS.find(p => p.key === period)?.label || 'Período'}</span>
              <i className="fa fa-chevron-down ph-period-lbl" style={{ fontSize: 9, color: 'var(--txt4)', marginLeft: 2 }} />
            </button>
            {showPeriodDrop && (
              <div
                style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 100, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.12)', minWidth: 180, overflow: 'hidden' }}
                onMouseLeave={() => setShowPeriodDrop(false)}
              >
                {PERIODS.map(p => (
                  <button key={p.key} onClick={() => { setPeriod(p.key); setShowPeriodDrop(false) }}
                    style={{ display: 'block', width: '100%', padding: '9px 16px', border: 'none', background: period === p.key ? 'var(--brand-xlt)' : 'transparent', color: period === p.key ? 'var(--brand)' : 'var(--txt2)', fontSize: 12, fontWeight: period === p.key ? 700 : 500, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}
                    onMouseEnter={e => { if (period !== p.key) e.currentTarget.style.background = 'var(--surface2)' }}
                    onMouseLeave={e => { if (period !== p.key) e.currentTarget.style.background = 'transparent' }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {period === 'custom' && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                style={{ padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11, fontFamily: 'inherit', color: 'var(--txt)' }} />
              <span style={{ fontSize: 11, color: 'var(--txt3)' }}>→</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                style={{ padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11, fontFamily: 'inherit', color: 'var(--txt)' }} />
            </div>
          )}
          <button className="btn btn-ghost ph-export-btn" onClick={exportCSV} style={{minHeight:44}}><i className="fa fa-download" /><span>Exportar</span></button>
          <button className="btn btn-primary ph-fab" onClick={() => nav('/presupuesto')} style={{ minHeight:44, background: '#16A34A', borderColor: '#16A34A' }}><i className="fa fa-plus" /><span>Nuevo presupuesto</span></button>
        </div>
      </div>

      <div className="tab-bar tab-bar-dash" style={{ marginTop: 18, marginBottom: 20 }}>
        {[
          { key: 'resumen',     icon: 'fa-house',     lbl: 'Resumen',                           short: 'Inicio'   },
          { key: 'lista',       icon: 'fa-receipt',   lbl: 'Presupuestos',                      short: 'Presup.'  },
          { key: 'analisis',    icon: 'fa-chart-bar', lbl: 'Análisis',                          short: 'Stats'    },
          { key: 'seguimiento', icon: 'fa-bell',      lbl: `Seguimiento (${seguimiento.length})`, short: seguimiento.length > 0 ? `${seguimiento.length}` : 'Seguim.' },
        ].map(t => (
          <div key={t.key} className={`tab-btn ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            <i className={`fa ${t.icon} tab-btn-icon`} />
            <span className="tab-btn-lbl">{t.lbl}</span>
            <span className="tab-btn-short">{t.short}</span>
          </div>
        ))}
      </div>

      {/* ═══ RESUMEN / DASHBOARD ═══ */}
      {tab === 'resumen' && (
        <>
          {/* ── MODO HOY: 3 acciones inmediatas ── */}
          {!loading && !filterLoading && (cobrosVencidos.length + entregasHoy.length + aConfirmar.length) > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <i className="fa fa-bolt" style={{ color: '#F59E0B', fontSize: 13 }} />
                <h3 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: 'var(--txt)', letterSpacing: '-.2px', textTransform: 'uppercase', letterSpacing: '.06em' }}>Hoy importa</h3>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt4)', background: 'var(--surface2)', padding: '2px 8px', borderRadius: 10 }}>
                  {cobrosVencidos.length + entregasHoy.length + aConfirmar.length}
                </span>
                <button onClick={toggleTodayCollapsed}
                  title={todayCollapsed ? 'Mostrar' : 'Ocultar'}
                  style={{ marginLeft: 'auto', background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 10px', fontSize: 11, color: 'var(--txt3)', cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 5, transition: 'all .15s' }}>
                  <i className={`fa fa-chevron-${todayCollapsed ? 'down' : 'up'}`} style={{ fontSize: 9 }} />
                  {todayCollapsed ? 'Mostrar' : 'Ocultar'}
                </button>
              </div>
              {!todayCollapsed && (
            <div className="modo-hoy-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
              {cobrosVencidos.length > 0 && (
                <div onClick={() => { setQuickFilter('sin_cobrar'); setTab('lista') }}
                  style={{ cursor: 'pointer', background: 'linear-gradient(135deg, rgba(220,38,38,.06), rgba(220,38,38,.02))', border: '1.5px solid rgba(220,38,38,.25)', borderRadius: 14, padding: '14px 16px', transition: 'transform .15s, box-shadow .2s' }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 20px rgba(220,38,38,.12)' }}
                  onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 10, background: '#DC2626', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><i className="fa fa-hand-holding-dollar" /></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#DC2626', textTransform: 'uppercase', letterSpacing: '.06em' }}>Cobros vencidos</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--txt)', lineHeight: 1.1 }}>{cobrosVencidos.length} <span style={{ fontSize: 11, color: 'var(--txt3)', fontWeight: 500 }}>{cobrosVencidos.length === 1 ? 'pedido' : 'pedidos'}</span></div>
                    </div>
                    <i className="fa fa-arrow-right" style={{ color: '#DC2626', fontSize: 12 }} />
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--txt2)', lineHeight: 1.4 }}>
                    <b style={{ color: '#DC2626', fontVariantNumeric: 'tabular-nums' }}>{money(cobrosVencidosMonto)}</b> sin cobrar · entrega ya pasó
                  </div>
                </div>
              )}
              {entregasHoy.length > 0 && (
                <div onClick={() => setTab('lista')}
                  style={{ cursor: 'pointer', background: 'linear-gradient(135deg, rgba(217,119,6,.07), rgba(217,119,6,.02))', border: '1.5px solid rgba(217,119,6,.25)', borderRadius: 14, padding: '14px 16px', transition: 'transform .15s, box-shadow .2s' }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 20px rgba(217,119,6,.12)' }}
                  onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 10, background: '#D97706', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><i className="fa fa-truck-fast" /></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#D97706', textTransform: 'uppercase', letterSpacing: '.06em' }}>Entregas hoy</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--txt)', lineHeight: 1.1 }}>{entregasHoy.length} <span style={{ fontSize: 11, color: 'var(--txt3)', fontWeight: 500 }}>{entregasHoy.length === 1 ? 'pedido' : 'pedidos'}</span></div>
                    </div>
                    <i className="fa fa-arrow-right" style={{ color: '#D97706', fontSize: 12 }} />
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--txt2)', lineHeight: 1.4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {entregasHoy.slice(0, 2).map(b => b.contact || b.company || b.num).filter(Boolean).join(', ') || '—'}{entregasHoy.length > 2 ? ` +${entregasHoy.length - 2}` : ''}
                  </div>
                </div>
              )}
              {aConfirmar.length > 0 && (
                <div onClick={() => setTab('seguimiento')}
                  style={{ cursor: 'pointer', background: 'linear-gradient(135deg, rgba(219,39,119,.06), rgba(219,39,119,.02))', border: '1.5px solid var(--brand)', borderRadius: 14, padding: '14px 16px', transition: 'transform .15s, box-shadow .2s' }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 20px rgba(219,39,119,.15)' }}
                  onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--brand)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><i className="fa fa-comments" /></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--brand)', textTransform: 'uppercase', letterSpacing: '.06em' }}>A confirmar</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--txt)', lineHeight: 1.1 }}>{aConfirmar.length} <span style={{ fontSize: 11, color: 'var(--txt3)', fontWeight: 500 }}>seguimientos</span></div>
                    </div>
                    <i className="fa fa-arrow-right" style={{ color: 'var(--brand)', fontSize: 12 }} />
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--txt2)', lineHeight: 1.4 }}>
                    Enviados hace 3+ días — recordales antes de que se enfríen
                  </div>
                </div>
              )}
            </div>
              )}
            </div>
          )}

          {(loading || filterLoading) ? (
            <div className="bento">
              <div className="sk sk-kpi" /><div className="sk sk-kpi" /><div className="sk sk-kpi" /><div className="sk sk-kpi" />
              <div className="sk sk-kpi bento-wide" style={{ height: 220 }} />
              <div className="sk sk-kpi bento-wide" style={{ height: 180 }} />
            </div>
          ) : (
            <div className="bento sk-fade-in">
              {!opHideMetrics && <KpiCard label="Ventas Brutas" value={money(totBudgeted)} delta={hidden ? undefined : deltaBrutas} sparkData={hidden ? null : sparkBrutas} sparkColor="var(--brand)" />}
              {!opHideMetrics && <KpiCard label="Ingresos Caja" value={money(totCobrado)} delta={hidden ? undefined : deltaCaja} sparkData={hidden ? null : sparkCaja} sparkColor="var(--green)" isKey />}
              {!opHideMetrics && <KpiCard label="Ticket Promedio" value={avgTicket > 0 ? money(avgTicket) : '—'} sparkData={hidden ? null : sparkTicket} />}
              <KpiCard label="Presupuestos" value={String(periodBudgets.length)} />

              {/* ── Izquierda (gráfico + tabla) + Derecha (donut + seguimiento) ── */}
              {!opHideMetrics && <div className="bento-wide bento-chart-inner" style={{ display: 'flex', gap: 14, gridColumn: '1 / -1', flexWrap: 'wrap', alignItems: 'flex-start' }}>

                {/* COLUMNA IZQUIERDA: gráfico de barras + tabla de presupuestos */}
                <div style={{ flex: '1 1 55%', minWidth: 280, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div className="bento-chart bento-chart-bar" style={{ boxSizing: 'border-box', overflow: 'hidden' }}>
                    <div className="card-header">
                      <span className="card-title"><i className="fa fa-chart-bar" style={{ color: 'var(--brand)', marginRight: 7 }} />Ingresos cobrados — {isDaily ? 'día a día · ' : ''}{PERIODS.find(p => p.key === period)?.label}</span>
                    </div>
                    <BarChart data={chartData} prevData={prevChartData} />
                  </div>

                  {/* Tabla últimos presupuestos — DENTRO de la col izquierda para no pasar el cuadrante de Seg. Activo */}
                  <div className="bento-chart resumen-tbl" style={{ overflow: 'visible' }}>
                    <style>{`
                      .resumen-tbl table{width:100%;border-collapse:collapse;table-layout:auto}
                      .resumen-tbl th{padding:6px 10px;font-size:10px;font-weight:700;color:var(--txt3);text-transform:uppercase;letter-spacing:.06em;background:var(--surface2);border-bottom:1px solid var(--border)}
                      .resumen-tbl td{padding:7px 10px;font-size:12px;border-top:1px solid var(--border);color:var(--txt2)}
                      .resumen-tbl tbody tr:hover td{background:var(--surface2)}
                      .resumen-tbl th.c-num,.resumen-tbl td.c-num{width:70px;font-variant-numeric:tabular-nums}
                      .resumen-tbl th.c-cli,.resumen-tbl td.c-cli{width:auto;min-width:160px}
                      .resumen-tbl th.c-tot,.resumen-tbl td.c-tot{width:110px;text-align:right;font-variant-numeric:tabular-nums}
                      .resumen-tbl th.c-est,.resumen-tbl td.c-est{width:120px}
                      .resumen-tbl th.c-act,.resumen-tbl td.c-act{width:40px}
                    `}</style>
                    <div className="card-header">
                      <span className="card-title">Últimos presupuestos</span>
                      <span className="card-link" onClick={() => setTab('lista')}>Ver todos <i className="fa fa-arrow-right" /></span>
                    </div>
                    {budgets.length ? (
                      <table>
                        <thead><tr><th className="c-num">N°</th><th className="c-cli">Cliente</th><th className="c-tot">Total</th><th className="c-est">Estado</th><th className="c-act"></th></tr></thead>
                        <tbody>
                          {[...budgets].sort((a, b) => b.id - a.id).slice(0, 6).map(b => {
                            const cliName = b.company || b.contact || '—'
                            const matchedCli = (clients || []).find(c => (b.company && c.company === b.company) || (b.contact && c.contact === b.contact))
                            return (
                            <tr key={b.id} style={{ cursor: 'pointer' }} onClick={() => setPreviewBudget(b)}>
                              <td className="c-num"><b>{b.num || '—'}</b></td>
                              <td className="c-cli">
                                {matchedCli ? (
                                  <span
                                    onClick={() => { setSelectedCliente(matchedCli); setIsPreviewOpen(true) }}
                                    style={{ cursor: 'pointer', color: 'var(--brand)', fontWeight: 600, textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: 3 }}
                                    title="Ver perfil del cliente"
                                  >{cliName}</span>
                                ) : cliName}
                              </td>
                              <td className="c-tot" style={{ fontWeight: 700, color: 'var(--money)' }}>{money(b.total)}</td>
                              <td className="c-est"><DotBadge status={b.status} /></td>
                              <td className="c-act" style={{ position: 'relative' }}>
                                <button
                                  style={{ width:28,height:28,borderRadius:'50%',border:'1.5px solid var(--border2)',background:'var(--surface2)',color:'var(--txt2)',cursor:'pointer',fontSize:11,display:'inline-flex',alignItems:'center',justifyContent:'center',padding:0,flexShrink:0,transition:'all .15s' }}
                                  onClick={e => { e.stopPropagation(); setOpenMenuId(openMenuId === b.id ? null : b.id) }}
                                  title="Acciones"
                                >
                                  <i className="fa fa-ellipsis-vertical" />
                                </button>
                                {openMenuId === b.id && (
                                  <div
                                    style={{ position: 'absolute', right: 0, top: '100%', zIndex: 50, background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 10, padding: 6, minWidth: 148, boxShadow: '0 8px 24px rgba(0,0,0,.13)' }}
                                    onClick={e => e.stopPropagation()}
                                  >
                                    {[
                                      { icon: 'fa-pen', label: 'Editar', action: () => { editB(b.id); setOpenMenuId(null) } },
                                      { icon: 'fa-brands fa-whatsapp', label: 'WhatsApp', action: () => { copyWA(b); setOpenMenuId(null) } },
                                      { icon: 'fa-paper-plane', label: 'Re-enviar', action: () => { handleResend(b); setOpenMenuId(null) } },
                                    ].map((item, idx) => (
                                      <button key={idx} onClick={item.action}
                                        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', border: 'none', background: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', color: 'var(--txt)', textAlign: 'left' }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                      >
                                        <i className={`fa ${item.icon}`} style={{ width: 14, color: 'var(--brand)' }} />
                                        {item.label}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </td>
                            </tr>
                          )})}

                        </tbody>
                      </table>
                    ) : (
                      <div className="empty"><div className="ico"><i className="fa fa-file-invoice" /></div><h4>Sin presupuestos</h4><p>Creá el primero con el botón de arriba</p></div>
                    )}
                  </div>
                </div>

                {/* COLUMNA DERECHA: donut + seguimiento/entregas */}
                <div style={{ flex: '1 1 30%', minWidth: 220, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {/* Donut */}
                  <div className="bento-chart" style={{ padding: 12, paddingBottom: 8 }}>
                    <div className="card-header" style={{ marginBottom: 6 }}>
                      <span className="card-title"><i className="fa fa-chart-pie" style={{ color: 'var(--brand)', marginRight: 7 }} />Estado de presupuestos</span>
                    </div>
                    <StatusDonut statuses={statuses} budgets={periodBudgets} onSegmentClick={drillDownToStatus} />
                    <div style={{ fontSize: 9.5, color: 'var(--txt4)', textAlign: 'center', marginTop: 6 }}>Click en un estado para filtrar la lista</div>
                  </div>

                  {/* Carousel: Seguimiento / Próximas entregas */}
                  <div className="bento-chart bento-chart-noflex">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt2)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <i className={`fa ${carouselSlide === 0 ? 'fa-fire' : carouselSlide === 1 ? 'fa-truck-fast' : 'fa-triangle-exclamation'}`} style={{ color: carouselSlide === 0 ? 'var(--brand)' : carouselSlide === 1 ? 'var(--amber)' : 'var(--red)' }} />
                        {carouselSlide === 0 ? 'Seguimiento activo' : carouselSlide === 1 ? 'Próximas entregas' : 'Alertas de stock'}
                      </div>
                      <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                        {[0, 1, 2].map(i => (
                          <button key={i} onClick={() => setCarouselSlide(i)}
                            style={{ width: 6, height: 6, borderRadius: '50%', border: 'none', padding: 0, cursor: 'pointer',
                              background: carouselSlide === i ? 'var(--brand)' : 'var(--border)', transition: 'background .25s' }}
                          />
                        ))}
                      </div>
                    </div>

                    {carouselSlide === 0 && (urgentTop3.length ? (
                      <>
                        {urgentTop3.map(b => {
                          const urg = urgency(b.days)
                          return (
                            <div key={b.id} className="mini-seg-item" style={{ borderLeft: `3px solid ${urg.color}`, background: 'var(--surface)' }}>
                              <div className="mini-seg-header">
                                <div className={`seg-light ${urg.cls}`} style={{ width: 28, height: 28, fontSize: 11 }}>
                                  <i className={`fa ${urg.icon}`} />
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontWeight: 700, fontSize: 11, color: 'var(--txt)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {b.company || b.contact || '—'}
                                  </div>
                                  <div style={{ fontSize: 10, color: 'var(--txt3)' }}>
                                    {b.num} · {b.days}d · {money(b.total)}
                                  </div>
                                </div>
                                <div style={{ display: 'flex', gap: 4 }}>
                                  <button className="mini-seg-btn wa" onClick={() => openWADirect(b)} title="WhatsApp">
                                    <i className="fa-brands fa-whatsapp" />
                                  </button>
                                  <button className="mini-seg-btn resend" onClick={() => handleResend(b)} title="Re-enviar">
                                    <i className="fa fa-paper-plane" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                        {seguimiento.length > 3 && (
                          <div className="mini-seg-more" onClick={() => setTab('seguimiento')}>
                            Ver {seguimiento.length - 3} más <i className="fa fa-arrow-right" style={{ marginLeft: 4 }} />
                          </div>
                        )}
                      </>
                    ) : (
                      <div style={{ textAlign: 'center', padding: '18px 0' }}>
                        <i className="fa fa-circle-check" style={{ fontSize: 24, display: 'block', color: 'var(--green)', marginBottom: 8 }} />
                        <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--txt3)' }}>Sin pendientes activos</div>
                        <button className="btn btn-primary btn-sm" style={{ marginTop: 14, fontSize: 12 }} onClick={() => nav('/presupuesto')}>
                          <i className="fa fa-plus" /> Nuevo presupuesto
                        </button>
                      </div>
                    ))}

                    {carouselSlide === 1 && (upcomingDeliveries.length ? upcomingDeliveries.map(b => {
                      const d = b.daysToDeliv
                      const lbl = d < 0 ? `Vencida · ${Math.abs(d)}d` : d === 0 ? 'HOY' : d === 1 ? 'Mañana' : `En ${d} días`
                      const color = d < 0 ? 'var(--red)' : d <= 2 ? '#EA580C' : 'var(--amber)'
                      const bg = d < 0 ? '#FEF2F2' : d <= 2 ? '#FFF7ED' : '#FEF3C7'
                      return (
                        <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: `3px solid ${color}`, marginBottom: 7 }}>
                          <div style={{ width: 32, height: 32, borderRadius: 8, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color }}>
                            <i className="fa fa-truck-fast" style={{ fontSize: 13 }} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 11, color: 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {b.company || b.contact || '—'}
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--txt3)' }}>
                              {b.num} · {money(b.total)}
                            </div>
                          </div>
                          <span style={{ flexShrink: 0, background: bg, color, fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 6, textTransform: 'uppercase' }}>{lbl}</span>
                        </div>
                      )
                    }) : (
                      <div style={{ textAlign: 'center', padding: '18px 0' }}>
                        <i className="fa fa-calendar-check" style={{ fontSize: 24, display: 'block', color: 'var(--green)', marginBottom: 8 }} />
                        <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--txt3)' }}>Sin entregas próximas</div>
                        <div style={{ fontSize: 10, color: 'var(--txt4)', marginTop: 4 }}>No hay pedidos con entrega en los próximos 14 días</div>
                      </div>
                    ))}

                    {carouselSlide === 2 && (() => {
                      const alerts = [
                        ...lowStockProducts.map(p => ({ ...p, _type: 'product' })),
                        ...lowStockInsumos.map(i => ({ ...i, _type: 'insumo' })),
                      ]
                      if (!alerts.length) return (
                        <div style={{ textAlign: 'center', padding: '18px 0' }}>
                          <i className="fa fa-boxes-stacked" style={{ fontSize: 24, display: 'block', color: 'var(--green)', marginBottom: 8 }} />
                          <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--txt3)' }}>Stock saludable</div>
                          <div style={{ fontSize: 10, color: 'var(--txt4)', marginTop: 4 }}>No hay alertas de stock</div>
                        </div>
                      )
                      return alerts.map(item => (
                        <div key={`${item._type}-${item.id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)', marginBottom: 7 }}>
                          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#FFF7ED', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                            {item._type === 'product' && item.image
                              ? <img src={item.image} alt={item.name} style={{ width: 32, height: 32, objectFit: 'cover' }} />
                              : <i className={`fa ${item._type === 'product' ? 'fa-box-open' : 'fa-flask'}`} style={{ fontSize: 14, color: '#FB923C' }} />
                            }
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 11, color: 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                            <div style={{ fontSize: 10, color: 'var(--red)', fontWeight: 600 }}>Stock: {item.stock || 0} / mín {item.minStock}</div>
                          </div>
                          <span style={{ flexShrink: 0, background: '#FEF2F2', color: 'var(--red)', fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 6 }}>
                            {item._type === 'insumo' ? 'INSUMO' : 'PROD'}
                          </span>
                        </div>
                      ))
                    })()}
                  </div>
                </div>
              </div>}

            </div>
          )}
        </>
      )}

      {/* ═══ LISTA ═══ */}
      {tab === 'lista' && (
        <>
          <style>{`
            .hist-tbl{overflow-x:auto;-webkit-overflow-scrolling:touch}
            .hist-tbl table{border-collapse:collapse;min-width:860px}
            @media(max-width:640px){.hist-tbl table{min-width:520px}}
            .hist-tbl th{padding:8px 10px;font-size:10px;font-weight:700;color:var(--txt3);text-transform:uppercase;letter-spacing:.06em;border-bottom:1.5px solid var(--border);white-space:nowrap;background:var(--surface2)}
            .hist-tbl td{padding:9px 10px;border-bottom:1px solid var(--border);vertical-align:middle;background:var(--surface)}
            .hist-tbl tr:last-child td{border-bottom:none}
            .hist-tbl tbody tr:hover td{background:var(--surface2)}
            .hist-tbl tbody tr.selected td{background:var(--brand-xlt)}
            .hist-tbl thead th:nth-child(1){position:sticky;left:0;z-index:3}
            .hist-tbl thead th:nth-child(2){position:sticky;left:32px;z-index:3;box-shadow:2px 0 5px -2px rgba(0,0,0,.08)}
            .hist-tbl thead th:last-child{position:sticky;right:0;z-index:3;box-shadow:-2px 0 5px -2px rgba(0,0,0,.08)}
            .hist-tbl tbody td:nth-child(1){position:sticky;left:0;z-index:2}
            .hist-tbl tbody td:nth-child(2){position:sticky;left:32px;z-index:2;box-shadow:2px 0 5px -2px rgba(0,0,0,.08)}
            .hist-tbl tbody td:last-child{position:sticky;right:0;z-index:2;box-shadow:-2px 0 5px -2px rgba(0,0,0,.08)}
            .hist-act{color:var(--txt3);background:none;border:none;border-radius:6px;width:28px;height:28px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:color .15s ease,opacity .15s ease}
            .hist-act:hover{background:var(--surface2)}
            .hist-act i{opacity:.7;transition:opacity .15s ease}
            .hist-act:hover i{opacity:1}
          `}</style>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
            <div className="search-row" style={{ maxWidth: 300, flex: '0 0 auto' }}>
              <i className="fa fa-magnifying-glass" />
              <input type="text" placeholder="Buscar cliente, empresa..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div style={{ display: 'flex', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: 2, gap: 1 }}>
              {['all', 'draft', 'sent', 'negotiating', 'confirmed', 'lost'].map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  style={{ padding: '5px 11px', border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: filter === f ? 600 : 400, background: filter === f ? 'var(--surface)' : 'transparent', color: filter === f ? 'var(--txt)' : 'var(--txt3)', boxShadow: filter === f ? '0 1px 3px rgba(0,0,0,.1)' : 'none', transition: 'all .15s ease', whiteSpace: 'nowrap' }}>
                  {f === 'all' ? 'Todos' : STATUS_MAP[f]}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
            {[
              { key: 'atrasados', label: 'Atrasados', icon: 'fa-fire', color: '#DC2626' },
              { key: 'sin_cobrar', label: 'Sin cobrar', icon: 'fa-hourglass-half', color: '#D97706' },
              { key: 'alta_ganancia', label: 'Alta ganancia', icon: 'fa-trophy', color: '#16A34A' },
            ].map(chip => (
              <button key={chip.key}
                onClick={() => setQuickFilter(q => q === chip.key ? '' : chip.key)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 11px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s', border: `1.5px solid ${quickFilter === chip.key ? chip.color : 'var(--border)'}`, background: quickFilter === chip.key ? chip.color + '12' : 'transparent', color: quickFilter === chip.key ? chip.color : 'var(--txt3)' }}>
                <i className={`fa ${chip.icon}`} style={{ fontSize: 10 }} />
                {chip.label}
              </button>
            ))}
            {quickFilter && (
              <button onClick={() => setQuickFilter('')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 11px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--txt3)' }}
                title="Quitar filtro rápido">
                <i className="fa fa-xmark" style={{ fontSize: 10 }} />
                Quitar filtro
              </button>
            )}
            <button
              onClick={() => setShowLossReason(v => !v)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 11px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s', border: `1.5px solid ${showLossReason ? '#DC2626' : 'var(--border)'}`, background: showLossReason ? '#FEE2E2' : 'transparent', color: showLossReason ? '#DC2626' : 'var(--txt3)', marginLeft: 'auto' }}
              title={showLossReason ? 'Ocultar motivo de pérdida' : 'Mostrar motivo de pérdida'}>
              <i className="fa fa-circle-xmark" style={{ fontSize: 10 }} />
              {showLossReason ? 'Ocultar motivo' : 'Ver motivo pérdida'}
            </button>
          </div>
          {selectedIds.size > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--brand-xlt)', border: '1.5px solid var(--brand)', borderRadius: 10, marginBottom: 10, flexWrap: 'wrap' }}>
              <b style={{ color: 'var(--brand)', fontSize: 12 }}>{selectedIds.size} seleccionados</b>
              <select value={bulkStatus} onChange={e => setBulkStatus(e.target.value)} style={{ fontSize: 12, padding: '5px 8px' }}>
                <option value="">Cambiar estado a...</option>
                {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <button className="btn btn-primary btn-sm" onClick={applyBulkStatus} disabled={!bulkStatus}><i className="fa fa-check" /> Aplicar</button>
              <button className="btn btn-secondary btn-sm" onClick={bulkExportCSV}><i className="fa fa-download" /> Exportar CSV</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelectedIds(new Set())}><i className="fa fa-xmark" /> Quitar selección</button>
            </div>
          )}
          <div className="tbl-card hist-tbl" style={{ overflowX: 'auto' }}>
            <table>
              <thead><tr>
                <th style={{ width: 32 }}>
                  <input type="checkbox" checked={filteredBudgets.length > 0 && filteredBudgets.every(b => selectedIds.has(b.id))} onChange={() => toggleSelectAll(filteredBudgets)} />
                </th>
                <th>N°</th>
                <th className="col-hide-mobile" style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('date')}>Fecha{sortArrow('date')}</th>
                <th>Cliente / Empresa</th>
                <th className="col-hide-mobile">Entrega</th>
                <th style={{ cursor: 'pointer', userSelect: 'none', textAlign: 'right' }} onClick={() => toggleSort('total')}>Total{sortArrow('total')}</th>
                <th className="col-hide-mobile" style={{ cursor: 'pointer', userSelect: 'none', textAlign: 'right' }} onClick={() => toggleSort('gain')}>
                  Ganancia{sortArrow('gain')}
                  {hidden && <i className="fa fa-eye-slash" style={{ marginLeft: 4, fontSize: 9, color: 'var(--txt4)' }} />}
                </th>
                <th>Estado</th><th className="col-hide-mobile">Pago</th><th>Acciones</th>
              </tr></thead>
              <tbody>
                {filteredBudgets.length ? filteredBudgets.map(b => {
                  const dDays = deliveryDays(b.deliveryDate)
                  const overdue = dDays !== null && dDays <= 0 && !['confirmed', 'lost'].includes(b.status)
                  return (
                    <tr key={b.id} className={selectedIds.has(b.id) ? 'selected' : ''} style={selectedIds.has(b.id) ? { background: 'var(--brand-xlt)' } : undefined}>
                      <td><input type="checkbox" checked={selectedIds.has(b.id)} onChange={() => toggleSelect(b.id)} /></td>
                      <td style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '-.01em' }}><b>{b.num || '—'}</b></td>
                      <td className="col-hide-mobile">{fmtDate(b.date)}</td>
                      <td style={{ maxWidth: 200 }}>
                        <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.company || b.contact || '—'}</div>
                        {b.company && b.contact && <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.contact}</div>}
                      </td>
                      <td className="col-hide-mobile">
                        <div style={{ fontSize: 11 }}>{fmtDate(b.deliveryDate) || '—'}</div>
                        {dDays !== null && !['confirmed','lost'].includes(b.status) && (
                          <div style={{ fontSize: 10, fontWeight: 700, color: overdue ? 'var(--red)' : dDays <= 2 ? 'var(--amber)' : 'var(--green)', marginTop: 1 }}>
                            {overdue ? `⚠ ${dDays === 0 ? 'HOY' : Math.abs(dDays) + 'd atrás'}` : `${dDays}d`}
                          </div>
                        )}
                      </td>
                      <td style={{ fontWeight: 800, fontSize: 13, color: 'var(--txt)', textAlign: 'right', fontFamily: 'ui-monospace, SFMono-Regular, monospace', letterSpacing: '-.01em', fontVariantNumeric: 'tabular-nums' }}>{money(b.total)}</td>
                      <td className="col-hide-mobile" style={{ color: hidden ? 'var(--txt4)' : '#16A34A', fontWeight: 700, textAlign: 'right', fontFamily: 'ui-monospace, SFMono-Regular, monospace', letterSpacing: '-.01em', fontVariantNumeric: 'tabular-nums' }}>{money(b.totalGain)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: DOT_STATUS[b.status] || '#94A3B8', flexShrink: 0, display: 'inline-block' }} />
                          <div>
                            <select style={{ fontSize: 11, padding: '2px 2px', border: 'none', background: 'transparent', color: 'var(--txt2)', cursor: 'pointer', outline: 'none', fontFamily: 'inherit', fontWeight: 500 }}
                              value={b.status} onChange={e => handleStatusChange(b.id, e.target.value)}>
                              {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </select>
                            {showLossReason && b.status === 'lost' && b.lossReason && (
                              <div style={{ fontSize: 9, color: '#DC2626', background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: 6, padding: '1px 6px', marginTop: 3, display: 'inline-block', fontWeight: 700, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={b.lossReason}>
                                {b.lossReason}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="col-hide-mobile" style={{ whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: DOT_PAY[b.payStatus] || '#DC2626', flexShrink: 0, display: 'inline-block' }} />
                          <select style={{ fontSize: 11, padding: '2px 2px', border: 'none', background: 'transparent', color: 'var(--txt2)', cursor: 'pointer', outline: 'none', fontFamily: 'inherit', fontWeight: 500 }}
                            value={b.payStatus || 'pending'} onChange={e => handlePayStatusChange(b.id, e.target.value)}>
                            {Object.entries(PAY_STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                          </select>
                        </div>
                      </td>
                      <td>
                        <div className="acts" style={{ gap: 2 }}>
                          <button className="hist-act" onClick={() => editB(b.id)} title="Editar"
                            onMouseEnter={e => e.currentTarget.style.color = '#3B82F6'} onMouseLeave={e => e.currentTarget.style.color = '#D1D5DB'}><i className="fa fa-pen" /></button>
                          <button className="hist-act" onClick={() => copyWA(b)} title="WhatsApp"
                            onMouseEnter={e => e.currentTarget.style.color = '#25D366'} onMouseLeave={e => e.currentTarget.style.color = '#D1D5DB'}><i className="fa-brands fa-whatsapp" /></button>
                          <button className="hist-act" onClick={() => handleDelete(b)} title="Eliminar"
                            onMouseEnter={e => e.currentTarget.style.color = '#DC2626'} onMouseLeave={e => e.currentTarget.style.color = '#D1D5DB'}><i className="fa fa-trash" /></button>
                        </div>
                      </td>
                    </tr>
                  )
                }) : (
                  <tr><td colSpan={12}><div className="empty"><div className="ico"><i className="fa fa-file-invoice" /></div><p>No hay presupuestos con este filtro</p></div></td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--txt3)', textAlign: 'right', letterSpacing: '.02em' }}>
            {filteredBudgets.length} resultado{filteredBudgets.length !== 1 ? 's' : ''}
            {filter !== 'all' && <span style={{ marginLeft: 8, padding: '1px 7px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, fontWeight: 600, color: 'var(--txt3)' }}>{STATUS_MAP[filter]}</span>}
          </div>
        </>
      )}

      {/* ═══ ANÁLISIS ═══ */}
      {tab === 'analisis' && (
        <>
          {insights.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <style>{`.ins-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}@media(max-width:900px){.ins-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:520px){.ins-grid{grid-template-columns:1fr}}`}</style>
              <div className="card-header" style={{ marginBottom: 10 }}>
                <span className="card-title"><i className="fa fa-lightbulb" style={{ color: '#F59E0B', marginRight: 7 }} />Insights del período</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt4)', background: 'var(--surface2)', padding: '2px 8px', borderRadius: 10, marginLeft: 'auto' }}>{insights.length}</span>
              </div>
              <div className="ins-grid">
                {insights.map((ins, i) => {
                  const palette = ins.tone === 'success'
                    ? { bg: 'rgba(22,163,74,.06)', border: 'rgba(22,163,74,.25)', icon: '#16A34A', val: '#16A34A' }
                    : ins.tone === 'warning'
                      ? { bg: 'rgba(220,38,38,.05)', border: 'rgba(220,38,38,.25)', icon: '#DC2626', val: '#DC2626' }
                      : { bg: 'var(--brand-xlt)', border: 'var(--brand)', icon: 'var(--brand)', val: 'var(--brand)' }
                  return (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px', background: palette.bg, border: `1px solid ${palette.border}`, borderRadius: 12, boxSizing: 'border-box' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 22, height: 22, borderRadius: 6, background: palette.icon, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 10 }}>
                          <i className={`fa ${ins.icon}`} />
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt2)', lineHeight: 1.3, flex: 1 }}>{ins.label}</span>
                      </div>
                      <div style={{ fontSize: 24, fontWeight: 800, color: palette.val, lineHeight: 1, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{ins.value}</div>
                      <div style={{ fontSize: 11, color: 'var(--txt3)', lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{ins.desc}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        <div className="analysis-grid">
          <div className="card">
            <div className="card-header"><span className="card-title"><i className="fa fa-chart-pie" style={{ color: 'var(--brand)', marginRight: 6 }} />Métricas globales</span></div>
            {[
              ['Total presupuestado', money(totBudgeted), null],
              ['Total cobrado', money(totCobrado), 'Suma de pagos recibidos (totales + señas)'],
              ['Ganancia cobrada', money(totGain), 'Margen cobrado — no descuenta costos de insumos ni logística'],
              ['Ticket promedio', money(avgTicket), null],
              ['Tasa de conversión', convRate, null],
              ['N° de presupuestos', periodBudgets.length, null],
            ].map(([l, v, tip], i) => (
              <div key={i} className="metric-row">
                <span className="mr-label">
                  {l}
                  {tip && <i className="fa fa-circle-info" title={tip} style={{ marginLeft: 5, color: 'var(--txt4)', fontSize: 10, cursor: 'help' }} />}
                </span>
                <span className="mr-val">{v}</span>
              </div>
            ))}
          </div>
          <div className="card">
            <div className="card-header"><span className="card-title"><i className="fa fa-trophy" style={{ color: 'var(--amber)', marginRight: 6 }} />Clientes top</span></div>
            {topClients.length ? (() => {
              const totalTopSales = topClients.reduce((s, [, v]) => s + v, 0) || 1
              return topClients.map(([n, v], i) => (
                <div key={i} className="metric-row" style={{ alignItems: 'center', padding: '5px 0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                    <div style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0, background: 'var(--brand)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800 }}>{i + 1}</div>
                    <span className="mr-label" style={{ flex: 1, marginBottom: 0 }}>{n}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--brand)', background: 'var(--brand-xlt)', padding: '1px 6px', borderRadius: 10, flexShrink: 0 }}>{Math.round(v / totalTopSales * 100)}%</span>
                  </div>
                  <span className="mr-val" style={{ color: 'var(--money)' }}>{money(v)}</span>
                </div>
              ))
            })() : <div className="empty" style={{ padding: 20 }}><p>Sin datos</p></div>}
          </div>
          <div className="card">
            <div className="card-header"><span className="card-title"><i className="fa fa-funnel" style={{ color: 'var(--green)', marginRight: 6 }} />Conversión por estado</span></div>
            <StatusDonut statuses={statuses} budgets={periodBudgets} onSegmentClick={drillDownToStatus} />
          </div>
          <div className="card">
            <div className="card-header"><span className="card-title"><i className="fa fa-coins" style={{ color: 'var(--amber)', marginRight: 6 }} />Ganancia por mes</span></div>
            <BarChart data={gainData} type="gain" />
          </div>

          {/* ── Análisis de pedidos perdidos ── */}
          {(() => {
            const lostBudgets = budgets.filter(b => b.status === 'lost')
            const lostWithReason = lostBudgets.filter(b => b.lossReason)
            const lostValue = lostBudgets.reduce((s, b) => s + (b.total || 0), 0)
            const reasonCount = {}
            lostWithReason.forEach(b => { reasonCount[b.lossReason] = (reasonCount[b.lossReason] || 0) + 1 })
            const reasonEntries = Object.entries(reasonCount).sort((a, b) => b[1] - a[1])
            const maxCount = reasonEntries[0]?.[1] || 1
            return (
              <div className="card" style={{ gridColumn: '1 / -1' }}>
                <div className="card-header" style={{ marginBottom: 14 }}>
                  <span className="card-title"><i className="fa fa-circle-xmark" style={{ color: '#DC2626', marginRight: 6 }} />Análisis de pedidos perdidos</span>
                  <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#DC2626', background: '#FEE2E2', padding: '2px 10px', borderRadius: 20 }}>
                      {lostBudgets.length} perdido{lostBudgets.length !== 1 ? 's' : ''}
                    </span>
                    {lostValue > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#DC2626', background: '#FEE2E2', padding: '2px 10px', borderRadius: 20, fontFamily: 'ui-monospace,SFMono-Regular,monospace' }}>
                        {money(lostValue)}
                      </span>
                    )}
                  </div>
                </div>
                {reasonEntries.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '24px 16px', color: 'var(--txt4)' }}>
                    <i className="fa fa-circle-info" style={{ fontSize: 24, marginBottom: 8, display: 'block', opacity: 0.35 }} />
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt3)', marginBottom: 4 }}>Sin motivos registrados aún</div>
                    <div style={{ fontSize: 11, color: 'var(--txt4)', lineHeight: 1.5 }}>Cuando marcás un presupuesto como "Perdido", podés registrar el motivo para ver patrones acá.</div>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
                    {reasonEntries.map(([reason, count], i) => {
                      const pct = Math.round(count / lostWithReason.length * 100)
                      const barPct = Math.round(count / maxCount * 100)
                      return (
                        <div key={i} style={{ background: 'var(--surface2)', borderRadius: 10, padding: '10px 12px' }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt)', marginBottom: 6, lineHeight: 1.4 }}>{reason}</div>
                          <div style={{ height: 5, background: '#E5E7EB', borderRadius: 99, overflow: 'hidden', marginBottom: 6 }}>
                            <div style={{ height: '100%', width: `${barPct}%`, background: '#DC2626', borderRadius: 99, transition: 'width .5s ease' }} />
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 11, color: '#DC2626', fontWeight: 700 }}>{pct}%</span>
                            <span style={{ fontSize: 10, color: 'var(--txt4)', fontWeight: 600 }}>{count} caso{count !== 1 ? 's' : ''}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
                {lostBudgets.length > lostWithReason.length && (
                  <div style={{ marginTop: 10, fontSize: 11, color: 'var(--txt4)', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <i className="fa fa-circle-info" style={{ fontSize: 10 }} />
                    {lostBudgets.length - lostWithReason.length} pedido{lostBudgets.length - lostWithReason.length !== 1 ? 's' : ''} perdido{lostBudgets.length - lostWithReason.length !== 1 ? 's' : ''} sin motivo registrado
                  </div>
                )}
              </div>
            )
          })()}
        </div>
        </>
      )}

      {/* ═══ SEGUIMIENTO ACTIVO — Grouped by urgency tier ═══ */}
      {tab === 'seguimiento' && (
        <>
          <div className="seg-legend">
            <div className="seg-legend-item"><div className="seg-legend-dot" style={{ background: 'var(--red)' }} />15+ días — Crítico</div>
            <div className="seg-legend-item"><div className="seg-legend-dot" style={{ background: '#EA580C' }} />8–14 días — Urgente</div>
            <div className="seg-legend-item"><div className="seg-legend-dot" style={{ background: 'var(--amber)' }} />4–7 días — Atención</div>
            <div className="seg-legend-item"><div className="seg-legend-dot" style={{ background: 'var(--green)' }} />0–3 días — Reciente</div>
          </div>

          {seguimiento.length ? (
            tierGroups.map(tier => {
              if (!tier.items.length) return null
              return (
                <div key={tier.key} className="seg-tier-group">
                  <div className="seg-tier-header" style={{ borderLeftColor: tier.color }}>
                    <i className={`fa ${tier.icon}`} style={{ color: tier.color, marginRight: 8 }} />
                    <span style={{ color: tier.color, fontWeight: 700 }}>{tier.label}</span>
                    <span className="seg-tier-count" style={{ background: tier.color + '18', color: tier.color }}>{tier.items.length}</span>
                  </div>
                  {tier.items.map(b => (
                    <SeguimientoCard key={b.id} b={b} onEdit={editB} onWA={copyWA} onResend={handleResend} />
                  ))}
                </div>
              )
            })
          ) : (
            <div className="empty">
              <div className="ico"><i className="fa fa-check-circle" /></div>
              <h4>Sin presupuestos pendientes de respuesta</h4>
              <p>Los presupuestos enviados y en negociación aparecen acá agrupados por urgencia</p>
            </div>
          )}
        </>
      )}

      {/* ═══ Resend Modal ═══ */}
      {resendBudget && (
        <ResendModal budget={resendBudget} onClose={() => setResendBudget(null)} onSend={handleResendSent} />
      )}

      {/* ═══ Budget Preview Modal ═══ */}
      {previewBudget && (() => {
        const b = previewBudget
        const cfg = config()
        const brandColor = cfg.brandColor || '#7C3AED'
        const bName = cfg.businessName || 'ANMA'
        const numV = (v) => { const n = Number(v); return isNaN(n) ? 0 : n }
        const rows = (b.items || []).filter(i => i.name).map(i =>
          `<tr><td style="padding:6px 9px;border-bottom:1px solid #EEF0F7">${i.name}${i.variant ? ` <span style="color:#888;font-size:10px">· ${i.variant}</span>` : ''}</td><td style="padding:6px 9px;border-bottom:1px solid #EEF0F7;text-align:center">${numV(i.qty)}</td><td style="padding:6px 9px;border-bottom:1px solid #EEF0F7;text-align:right">${fmt(numV(i.priceUnit))}</td><td style="padding:6px 9px;border-bottom:1px solid #EEF0F7;text-align:right;font-weight:700">${fmt(numV(i.qty) * numV(i.priceUnit))}</td></tr>`
        ).join('')
        const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{box-sizing:border-box}body{font-family:system-ui,sans-serif;margin:28px;color:#1E1B4B;font-size:12px}table{width:100%;border-collapse:collapse}th{background:${brandColor};color:#fff;padding:7px 9px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.4px}@media print{body{margin:16px}}</style></head><body>
          <div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:10px;border-bottom:3px solid ${brandColor};margin-bottom:16px">
            <div>${cfg.logo ? `<img src="${cfg.logo}" style="height:36px">` : `<div style="font-size:20px;font-weight:800;color:${brandColor}">${bName}</div>`}</div>
            <div style="text-align:right"><div style="font-size:16px;font-weight:800">${b.num || '—'}</div><div style="font-size:11px;color:#666">Fecha: ${b.date || '—'}</div>${b.deliveryDate ? `<div style="font-size:11px;color:#666">Entrega: ${b.deliveryDate}</div>` : ''}</div>
          </div>
          <div style="background:#F8F9FC;border-radius:8px;padding:10px 14px;margin-bottom:14px">
            ${b.contact ? `<div style="font-weight:700">${b.contact}</div>` : ''}
            ${b.company ? `<div style="color:#666">${b.company}</div>` : ''}
            ${b.wa ? `<div style="color:#666">${b.wa}</div>` : ''}
          </div>
          <table><thead><tr><th>Producto</th><th style="width:55px;text-align:center">Cant.</th><th style="width:95px;text-align:right">P.unit</th><th style="width:100px;text-align:right">Subtotal</th></tr></thead><tbody>${rows}</tbody></table>
          <div style="display:flex;justify-content:flex-end;margin-top:12px"><div style="min-width:220px;padding:10px 14px;background:${brandColor}10;border-radius:8px;border:1px solid ${brandColor}30">
            <div style="display:flex;justify-content:space-between;font-size:16px;font-weight:800;color:${brandColor}"><span>Total</span><span>${fmt(numV(b.total))}</span></div>
            ${numV(b.depositAmt) > 0 ? `<div style="display:flex;justify-content:space-between;font-size:12px;color:${brandColor};font-weight:600;margin-top:4px"><span>Seña</span><span>${fmt(numV(b.depositAmt))}</span></div>` : ''}
          </div></div>
          ${b.noteCli ? `<div style="margin-top:14px;background:#F4F6FD;border-radius:8px;padding:10px 14px;font-size:11px;color:#4B5280">${b.noteCli}</div>` : ''}
        </body></html>`
        return (
          <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) setPreviewBudget(null) }}>
            <div className="modal modal-lg" style={{ maxWidth: 740, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
              <div className="mh">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <i className="fa fa-file-invoice-dollar" style={{ color: brandColor }} />
                  <span style={{ fontWeight: 700 }}>{b.num || '—'}</span>
                  <span className={`badge ${STATUS_CLS[b.status] || 'b-draft'}`}>{STATUS_MAP[b.status] || 'Borrador'}</span>
                </div>
                <button className="mclose" onClick={() => setPreviewBudget(null)}><i className="fa fa-xmark" /></button>
              </div>
              <iframe srcDoc={html} style={{ flex: 1, border: 'none', minHeight: 420, borderRadius: 8 }} title="Vista previa" />
              <div style={{ display: 'flex', gap: 8, padding: '12px 16px', borderTop: '1px solid var(--border)', justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setPreviewBudget(null)}>Cerrar</button>
                <button className="btn btn-primary btn-sm" onClick={() => { setPreviewBudget(null); nav(`/presupuesto/${b.id}`) }}>
                  <i className="fa fa-pen" /> Editar
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ═══ Loss Reason Modal ═══ */}
      {pendingLossId && (
        <LossReasonModal
          onSave={confirmLoss}
          onClose={() => setPendingLossId(null)}
        />
      )}

      {/* ═══ Cliente Preview Drawer / BottomSheet ═══ */}
      {isPreviewOpen && selectedCliente && (() => {
        const cli = selectedCliente
        const initials = ((cli.company || cli.contact || '?')[0] || '?').toUpperCase()
        const cliBudgets = budgets.filter(b => (cli.company && b.company === cli.company) || (cli.contact && b.contact === cli.contact))
        const closePreview = () => { setIsPreviewOpen(false); setSelectedCliente(null) }
        const waNum = (cli.whatsapp || cli.phone || '').replace(/\D/g, '')
        return (
          <>
            <style>{`
              @keyframes cliDrawerInH{from{transform:translateX(100%)}to{transform:translateX(0)}}
              @keyframes cliSheetUpH{from{transform:translateY(100%)}to{transform:translateY(0)}}
              .hst-cli-backdrop{position:fixed;inset:0;z-index:400;background:rgba(0,0,0,.32);backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px)}
              @media(min-width:641px){
                .hst-cli-drawer{position:fixed;right:0;top:0;bottom:0;width:min(440px,96vw);background:var(--surface);z-index:401;display:flex;flex-direction:column;box-shadow:-6px 0 32px rgba(0,0,0,.14);animation:cliDrawerInH .24s cubic-bezier(.22,1,.36,1) both;overflow:hidden;border-left:1px solid var(--border)}
              }
              @media(max-width:640px){
                .hst-cli-drawer{position:fixed;left:0;right:0;bottom:0;max-height:84vh;background:var(--surface);z-index:401;display:flex;flex-direction:column;border-radius:20px 20px 0 0;box-shadow:0 -4px 32px rgba(0,0,0,.14);animation:cliSheetUpH .28s cubic-bezier(.32,1.28,.58,1) both;overflow:hidden}
                .hst-cli-drawer::before{content:'';display:block;width:36px;height:4px;background:var(--border2,#D1D5DB);border-radius:2px;margin:10px auto 0;flex-shrink:0}
              }
            `}</style>
            <div className="hst-cli-backdrop" onClick={closePreview} />
            <div className="hst-cli-drawer" onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--brand)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, flexShrink: 0 }}>{initials}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cli.company || cli.contact || '—'}</div>
                  {cli.company && cli.contact && <div style={{ fontSize: 12, color: 'var(--txt3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cli.contact}</div>}
                </div>
                <button onClick={closePreview} style={{ width: 32, height: 32, border: 'none', background: 'var(--surface2)', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--txt3)', flexShrink: 0 }}>
                  <i className="fa fa-xmark" />
                </button>
              </div>
              {/* Scroll body */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
                {/* Contact pills */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                  {waNum && (
                    <a href={`https://wa.me/${waNum}`} target="_blank" rel="noreferrer"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 9999, background: 'rgba(37,211,102,.1)', border: '1px solid rgba(37,211,102,.28)', color: '#16A34A', textDecoration: 'none', fontSize: 12, fontWeight: 700 }}>
                      <i className="fa-brands fa-whatsapp" style={{ fontSize: 14 }} /> WhatsApp
                    </a>
                  )}
                  {cli.email && (
                    <a href={`mailto:${cli.email}`}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 9999, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--txt2)', textDecoration: 'none', fontSize: 12, fontWeight: 600 }}>
                      <i className="fa fa-envelope" style={{ fontSize: 12 }} /> {cli.email}
                    </a>
                  )}
                </div>
                {/* Mini info */}
                {(cli.address || cli.cuit) && (
                  <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: 'var(--txt2)', display: 'flex', flexDirection: 'column', gap: 4, border: '1px solid var(--border)' }}>
                    {cli.cuit && <div><b>CUIT:</b> {cli.cuit}</div>}
                    {cli.address && <div><b>Dirección:</b> {cli.address}</div>}
                  </div>
                )}
                {/* Budget history */}
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 8 }}>Presupuestos ({cliBudgets.length})</div>
                {cliBudgets.length ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {[...cliBudgets].sort((a, b) => b.id - a.id).slice(0, 8).map(b => (
                      <div key={b.id} onClick={() => { nav(`/presupuesto/${b.id}`); closePreview() }}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 9, cursor: 'pointer', transition: 'background .15s' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--surface3,var(--border))'}
                        onMouseLeave={e => e.currentTarget.style.background = 'var(--surface2)'}
                      >
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand)', minWidth: 40 }}>{b.num || '#—'}</span>
                        <span style={{ flex: 1, fontSize: 11, color: 'var(--txt3)' }}>{b.date || ''}</span>
                        <DotBadge status={b.status} />
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--money)', fontVariantNumeric: 'tabular-nums' }}>{money(b.total)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--txt4)', padding: '8px 0' }}>Sin presupuestos registrados.</div>
                )}
                {/* Go to Clientes */}
                <button onClick={() => { nav('/clientes'); closePreview() }}
                  style={{ marginTop: 20, width: '100%', padding: '10px 0', border: '1.5px solid var(--brand)', borderRadius: 9, background: 'var(--brand-xlt)', color: 'var(--brand)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                  <i className="fa fa-pen" /> Editar Perfil del Cliente
                </button>
              </div>
            </div>
          </>
        )
      })()}
    </div>
  )
}
