import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '../../context/DataContext'
import { useToast } from '../../context/ToastContext'
import { fmt, fmtDate, MONTHS, STATUS_MAP, STATUS_CLS, PAY_STATUS_MAP, PAY_STATUS_CLS } from '../../lib/storage'
import { usePrivacy } from '../../context/PrivacyContext'

function Badge({ status }) {
  return <span className={`badge ${STATUS_CLS[status] || 'b-draft'}`}>{STATUS_MAP[status] || 'Borrador'}</span>
}

function KpiCard({ label, value, delta, isKey }) {
  return (
    <div className="bento-kpi" style={isKey ? { borderLeft: '4px solid var(--green)', paddingLeft: 20 } : {}}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 29, fontWeight: 800, color: 'var(--txt)', letterSpacing: '-0.03em', lineHeight: 1 }}>{value}</div>
        {delta !== null && delta !== undefined && (
          <span style={{ fontSize: 12, fontWeight: 700, color: delta >= 0 ? 'var(--green)' : 'var(--red)' }}>
            {delta >= 0 ? '↑' : '↓'} {Math.abs(delta)}%
          </span>
        )}
      </div>
      {delta !== null && delta !== undefined && (
        <div style={{ fontSize: 9, color: '#9CA3AF', marginTop: 5, letterSpacing: '0.03em' }}>vs. periodo anterior</div>
      )}
    </div>
  )
}

function BarChart({ data, type = 'income' }) {
  const maxV = Math.max(...data.map(m => m.val), 1)
  const hasData = data.some(m => m.val > 0)
  if (!hasData) return (
    <div style={{ textAlign: 'center', padding: '28px 0 8px', color: 'var(--txt4)', fontSize: 12 }}>
      <i className="fa fa-chart-bar" style={{ fontSize: 28, opacity: .2, display: 'block', marginBottom: 8 }} />
      <div style={{ fontWeight: 600, color: 'var(--txt3)' }}>Sin datos aún</div>
      <div style={{ fontSize: 11, marginTop: 3 }}>Los ingresos cobrados aparecerán acá mes a mes</div>
    </div>
  )
  // Monocromático: mismo brand-color para todas las barras, sin gradient
  return (
    <div>
      <div className="bar-chart" style={{ height: 130 }}>
        {data.map((m, i) => {
          const pct = m.val / maxV
          // Opacidad plena variable según altura relativa (mín .35, máx 1)
          const opacity = pct === 0 ? 0.15 : 0.35 + pct * 0.65
          return (
            <div key={i} className="bc">
              <div
                className="bb"
                style={{
                  height: Math.max(4, pct * 120),
                  background: 'var(--brand)',
                  opacity,
                }}
                title={fmt(m.val)}
              />
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        {data.map((m, i) => <div key={i} className="bl" style={{ flex: 1, textAlign: 'center' }}>{m.lbl}</div>)}
      </div>
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
          <Badge status={b.status} />
          <span style={{ fontSize: 11, fontWeight: 600, color: urg.color, background: urg.color + '15', padding: '2px 8px', borderRadius: 12 }}>{urg.label}</span>
        </div>
        <div className="seg-cli"><b>{b.contact || 'Sin contacto'}</b> — {b.company || 'Sin empresa'}</div>
        <div className="seg-co">
          {b.ocasion && <><i className="fa fa-calendar-day" style={{ marginRight: 4 }} />{b.ocasion}  ·  </>}
          <i className="fa fa-calendar" style={{ marginRight: 4 }} />Enviado: {fmtDate(b.date)}
          {b.deliveryDate && ` · Entrega: ${fmtDate(b.deliveryDate)}`}
        </div>
        {b.date && b.deliveryDate && (() => {
          const sentDate = new Date(b.date)
          const delivDate = new Date(b.deliveryDate + 'T00:00')
          const nowD = new Date()
          const total = delivDate - sentDate
          const elapsed = nowD - sentDate
          const progress = total > 0 ? Math.min(100, Math.max(0, (elapsed / total) * 100)) : 50
          const overdue = progress >= 100
          return (
            <div style={{ marginTop: 6, fontSize: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--txt4)', marginBottom: 3 }}>
                <span>Enviado</span>
                <span style={{ color: overdue ? 'var(--red)' : 'var(--amber)', fontWeight: 700 }}>Hoy</span>
                <span>Entrega</span>
              </div>
              <div style={{ position: 'relative', height: 6, background: 'var(--surface2)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{
                  position: 'absolute', left: 0, top: 0, height: '100%',
                  width: `${progress}%`,
                  background: overdue ? 'var(--red)' : progress > 70 ? '#EA580C' : 'var(--amber)',
                  borderRadius: 4,
                  transition: 'width .5s ease'
                }} />
              </div>
            </div>
          )
        })()}
      </div>
      <div className="seg-meta">
        <div className="seg-days">
          <div className="num" style={{ color: urg.color }}>{days}</div>
          <div className="lbl" style={{ color: urg.color }}>días</div>
        </div>
        <div className="seg-total">{money(b.total)}</div>
        <div className="seg-actions">
          <button className="act edit" onClick={() => onEdit(b.id)} title="Editar"><i className="fa fa-pen" /></button>
          <button className="act wa" onClick={() => onWA(b)} title="WhatsApp"><i className="fa-brands fa-whatsapp" /></button>
          <button className="act resend" onClick={() => onResend(b)} title="Re-enviar presupuesto"><i className="fa fa-paper-plane" /></button>
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
function StatusDonut({ statuses, budgets }) {
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

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
      <svg width="90" height="90" viewBox="0 0 90 90" style={{ flexShrink: 0 }}>
        <circle cx="45" cy="45" r={radius} fill="none" stroke="var(--surface2)" strokeWidth="10" />
        {segments.map((s, i) => (
          <circle key={i} cx="45" cy="45" r={radius} fill="none" stroke={s.c} strokeWidth="10"
            strokeDasharray={`${s.pct / 100 * circumference} ${circumference}`}
            strokeDashoffset={-s.start / 100 * circumference}
            transform="rotate(-90 45 45)" strokeLinecap="round" style={{ transition: 'all .6s ease' }} />
        ))}
        <text x="45" y="43" textAnchor="middle" fontSize="16" fontWeight="800" fill="var(--txt)">{budgets.length}</text>
        <text x="45" y="55" textAnchor="middle" fontSize="8" fill="var(--txt3)" fontWeight="600">TOTAL</text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
        {statuses.filter(s => budgets.filter(b => b.status === s.k).length > 0).length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--txt4)', textAlign: 'center', padding: 8 }}>Sin presupuestos aún</div>
        ) : statuses.filter(s => budgets.filter(b => b.status === s.k).length > 0).map(s => {
          const n = budgets.filter(b => b.status === s.k).length
          return (
            <div key={s.k} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.c, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: 'var(--txt2)', flex: 1 }}>{s.l}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt)' }}>{n}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function Historial() {
  const { get, config, updateBudgetStatus, deleteBudget, saveBudget } = useData()
  const toast = useToast()
  const nav = useNavigate()
  const [tab, setTab] = useState('resumen')
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [resendBudget, setResendBudget] = useState(null)
  const [period, setPeriod] = useState('6m')
  const [showPeriodDrop, setShowPeriodDrop] = useState(false)
  const [sortKey, setSortKey] = useState('id')
  const [sortDir, setSortDir] = useState('desc')
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [bulkStatus, setBulkStatus] = useState('')
  const [openMenuId, setOpenMenuId] = useState(null)
  const { hidden, money } = usePrivacy()
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [filterLoading, setFilterLoading] = useState(false)

  const budgets = get('budgets')
  const c = config()
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

  // KPI calculations — basados en dinero COBRADO
  const monthBudgets = periodBudgets.filter(b => b.date?.startsWith(ym))
  const confirmed = periodBudgets.filter(b => b.status === 'confirmed')
  const pagados = periodBudgets.filter(b => b.payStatus === 'paid' || b.payStatus === 'partial')
  const totCobrado = pagados.reduce((s, b) => s + cobrado(b), 0)
  const mInc = monthBudgets.reduce((s, b) => s + cobrado(b), 0)
  const mGain = monthBudgets.reduce((s, b) => s + ganCobrada(b), 0)
  const convRate = periodBudgets.length ? Math.round(confirmed.length / periodBudgets.length * 100) + '%' : '—'

  // Delta vs mes anterior
  const prevYM = (() => { const d = new Date(now.getFullYear(), now.getMonth() - 1, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` })()
  const prevMonthBudgets = budgets.filter(b => b.date?.startsWith(prevYM))
  const prevInc = prevMonthBudgets.reduce((s, b) => s + cobrado(b), 0)
  const prevGain = prevMonthBudgets.reduce((s, b) => s + ganCobrada(b), 0)
  const deltaInc = prevInc > 0 ? Math.round((mInc - prevInc) / prevInc * 100) : null
  const deltaGain = prevGain > 0 ? Math.round((mGain - prevGain) / prevGain * 100) : null

  // Income bars (last N months based on period) — dinero cobrado
  const barMonths = period === '3m' ? 3 : period === 'year' ? 12 : 6
  const incomeData = []
  for (let i = barMonths - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const val = budgets.filter(b => b.date?.startsWith(key)).reduce((s, b) => s + cobrado(b), 0)
    incomeData.push({ lbl: MONTHS[d.getMonth()], val })
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

  // Top clients
  const byClient = {}
  confirmed.forEach(b => { const k = b.company || b.contact || '—'; byClient[k] = (byClient[k] || 0) + (b.total || 0) })
  const topClients = Object.entries(byClient).sort((a, b) => b[1] - a[1]).slice(0, 3)

  // Analysis metrics
  const totBudgeted = periodBudgets.reduce((s, b) => s + (b.total || 0), 0)
  const totGain = pagados.reduce((s, b) => s + ganCobrada(b), 0)
  const avgTicket = pagados.length ? Math.round(totCobrado / pagados.length) : 0

  const editB = (id) => nav(`/presupuesto/${id}`)
  const copyWA = (b) => {
    const text = `Hola ${b.contact || ''}! Te envío el presupuesto ${b.num} por ${fmt(b.total)}. Quedamos a disposición!`
    navigator.clipboard.writeText(text).then(() => toast('Mensaje WA copiado', 'ok'))
  }
  const handleDelete = (b) => {
    const label = b.num || `#${b.id}`
    if (!window.confirm(`⚠ ELIMINAR ${label}?\n\nCliente: ${b.contact || b.company || '—'}\nTotal: ${fmt(b.total)}\n\nEsta acción no se puede deshacer.`)) return
    const confirm2 = window.prompt(`Para confirmar, escribí ELIMINAR (en mayúsculas):`)
    if (confirm2 !== 'ELIMINAR') { toast('Eliminación cancelada', 'in'); return }
    deleteBudget(b.id); toast('Presupuesto eliminado', 'in')
    setSelectedIds(prev => { const n = new Set(prev); n.delete(b.id); return n })
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
  const handleStatusChange = (id, status) => { updateBudgetStatus(id, status); toast('Estado actualizado', 'ok') }
  const toggleSelect = (id) => setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleSelectAll = (list) => setSelectedIds(prev => {
    const allSel = list.every(b => prev.has(b.id))
    if (allSel) { const n = new Set(prev); list.forEach(b => n.delete(b.id)); return n }
    const n = new Set(prev); list.forEach(b => n.add(b.id)); return n
  })
  const applyBulkStatus = () => {
    if (!bulkStatus || !selectedIds.size) return
    selectedIds.forEach(id => updateBudgetStatus(id, bulkStatus))
    toast(`${selectedIds.size} presupuestos actualizados`, 'ok')
    setSelectedIds(new Set()); setBulkStatus('')
  }
  const bulkExportCSV = () => {
    if (!selectedIds.size) return
    const sel = budgets.filter(b => selectedIds.has(b.id))
    const rows = [['N°', 'Fecha', 'Cliente', 'Empresa', 'Total', 'Ganancia', 'Estado'].join(',')]
    sel.forEach(b => rows.push([b.num, b.date, b.contact, b.company, b.total, b.totalGain, STATUS_MAP[b.status]].join(',')))
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = `presupuestos_sel_${new Date().toISOString().slice(0,10)}.csv`; a.click()
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
    const rows = [['N°', 'Fecha', 'Cliente', 'Empresa', 'Total', 'Ganancia', 'Estado'].join(',')]
    budgets.forEach(b => rows.push([b.num, b.date, b.contact, b.company, b.total, b.totalGain, STATUS_MAP[b.status]].join(',')))
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = `presupuestos_${new Date().toISOString().slice(0, 10)}.csv`; a.click()
  }

  const openWADirect = (b) => {
    if (!b.wa) { copyWA(b); return }
    const num = b.wa.replace(/\D/g, '')
    const text = `Hola ${b.contact || ''}! Te escribo por el presupuesto ${b.num} por ${fmt(b.total)}. ¿Pudiste revisarlo? Quedamos a disposición!`
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(text)}`, '_blank')
  }

  return (
    <div className="page active" style={{ animation: 'pgIn .25s ease both' }}>
      <div className="ph">
        <div className="ph-left"><h2>Historial</h2><p>Registro de presupuestos y análisis del negocio</p></div>
        <div className="ph-right" style={{ gap: 8 }}>
          {/* Period dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowPeriodDrop(d => !d)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--txt2)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
            >
              <i className="fa fa-calendar" style={{ fontSize: 11, color: 'var(--txt3)' }} />
              {PERIODS.find(p => p.key === period)?.label || 'Período'}
              <i className="fa fa-chevron-down" style={{ fontSize: 9, color: 'var(--txt4)', marginLeft: 2 }} />
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
          <button className="btn btn-ghost btn-sm" onClick={exportCSV}><i className="fa fa-download" /> Exportar</button>
          <button className="btn btn-primary btn-sm" onClick={() => nav('/presupuesto')} style={{ background: '#16A34A', borderColor: '#16A34A' }}><i className="fa fa-plus" /> Nuevo presupuesto</button>
        </div>
      </div>

      <div className="tab-bar">
        {['resumen', 'lista', 'analisis', 'seguimiento'].map(t => (
          <div key={t} className={`tab-btn ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t === 'resumen' ? 'Resumen' : t === 'lista' ? 'Presupuestos' : t === 'analisis' ? 'Análisis' : `Seguimiento (${seguimiento.length})`}
          </div>
        ))}
      </div>

      {/* ═══ RESUMEN / DASHBOARD ═══ */}
      {tab === 'resumen' && (
        <>
          {(loading || filterLoading) ? (
            <div className="bento">
              <div className="sk sk-kpi" /><div className="sk sk-kpi" /><div className="sk sk-kpi" /><div className="sk sk-kpi" />
              <div className="sk sk-kpi bento-wide" style={{ height: 180 }} />
              <div className="sk sk-kpi bento-wide" style={{ height: 180 }} />
            </div>
          ) : (
            <div className="bento sk-fade-in">
              <KpiCard label="Ingresos" value={money(totCobrado)} />
              <KpiCard label="Ventas Mes" value={money(mInc)} delta={deltaInc} />
              <KpiCard label="Rentabilidad" value={money(mGain)} delta={hidden ? undefined : deltaGain} isKey />
              <KpiCard label="Conversión" value={convRate} />

              <div className="bento-chart bento-wide">
                <div className="card-header">
                  <span className="card-title"><i className="fa fa-chart-bar" style={{ color: 'var(--brand)', marginRight: 7 }} />Ingresos cobrados — {PERIODS.find(p => p.key === period)?.label}</span>
                </div>
                <BarChart data={incomeData} />
              </div>

              {/* ── Estado de presupuestos: Donut compacto ── */}
              <div className="bento-chart">
                <div className="card-header"><span className="card-title">Estado de presupuestos</span></div>
                <StatusDonut statuses={statuses} budgets={periodBudgets} />
              </div>

              {/* ── Mini-Timeline seguimiento: compacto ── */}
              <div className="bento-chart" style={{ background: 'var(--surface2)', border: '1.5px solid var(--brand)', borderColor: 'var(--brand)' }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--brand)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 7 }}>
                  <i className="fa fa-fire" />Seguimiento activo
                </div>
                {urgentTop3.length ? (
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
                  <div style={{ textAlign: 'center', padding: 20, color: 'var(--txt4)', fontSize: 12 }}>
                    <i className="fa fa-check-circle" style={{ fontSize: 18, marginBottom: 6, display: 'block', color: 'var(--green)' }} />
                    Sin presupuestos pendientes
                  </div>
                )}
              </div>

              <div className="bento-chart bento-wide">
                <div className="card-header">
                  <span className="card-title">Últimos presupuestos</span>
                  <span className="card-link" onClick={() => setTab('lista')}>Ver todos <i className="fa fa-arrow-right" /></span>
                </div>
                {budgets.length ? (
                  <table>
                    <thead><tr><th>N°</th><th>Cliente</th><th>Total</th><th>Estado</th><th></th></tr></thead>
                    <tbody>
                      {[...budgets].sort((a, b) => b.id - a.id).slice(0, 6).map(b => (
                        <tr key={b.id}>
                          <td><b>{b.num || '—'}</b></td>
                          <td>{b.company || b.contact || '—'}</td>
                          <td style={{ fontWeight: 700, color: 'var(--money)' }}>{money(b.total)}</td>
                          <td><Badge status={b.status} /></td>
                          <td style={{ position: 'relative' }}>
                            <button
                              className="act"
                              style={{ width: 30, height: 30 }}
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
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="empty"><div className="ico"><i className="fa fa-file-invoice" /></div><h4>Sin presupuestos</h4><p>Creá el primero con el botón de arriba</p></div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══ LISTA ═══ */}
      {tab === 'lista' && (
        <>
          <div className="pill-row">
            <div className="search-row" style={{ maxWidth: 300 }}>
              <i className="fa fa-magnifying-glass" />
              <input type="text" placeholder="Buscar cliente, empresa..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            {['all', 'draft', 'sent', 'negotiating', 'confirmed', 'lost'].map(f => (
              <div key={f} className={`pill ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
                {f === 'all' ? 'Todos' : STATUS_MAP[f]}
              </div>
            ))}
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
          <div className="tbl-card">
            <table>
              <thead><tr>
                <th style={{ width: 32 }}>
                  <input type="checkbox" checked={filteredBudgets.length > 0 && filteredBudgets.every(b => selectedIds.has(b.id))} onChange={() => toggleSelectAll(filteredBudgets)} />
                </th>
                <th>N°</th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('date')}>Fecha{sortArrow('date')}</th>
                <th>Cliente</th><th>Empresa</th>
                <th>Entrega</th>
                <th>Días rest.</th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('total')}>Total{sortArrow('total')}</th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('gain')}>
                  Ganancia{sortArrow('gain')}
                  {hidden && <i className="fa fa-eye-slash" style={{ marginLeft: 4, fontSize: 9, color: 'var(--txt4)' }} />}
                </th>
                <th>Estado</th><th>Pago</th><th>Acciones</th>
              </tr></thead>
              <tbody>
                {filteredBudgets.length ? filteredBudgets.map(b => {
                  const dDays = deliveryDays(b.deliveryDate)
                  const overdue = dDays !== null && dDays <= 0 && !['confirmed', 'lost'].includes(b.status)
                  return (
                    <tr key={b.id} style={selectedIds.has(b.id) ? { background: 'var(--brand-xlt)' } : undefined}>
                      <td><input type="checkbox" checked={selectedIds.has(b.id)} onChange={() => toggleSelect(b.id)} /></td>
                      <td><b>{b.num || '—'}</b></td>
                      <td>{fmtDate(b.date)}</td>
                      <td>{b.contact || '—'}</td>
                      <td style={{ color: 'var(--blue)', cursor: 'pointer' }} onClick={() => { setSearch(b.company || ''); setFilter('all') }}>{b.company || '—'}</td>
                      <td>{fmtDate(b.deliveryDate)}</td>
                      <td style={{ fontWeight: 700, fontSize: 11, color: overdue ? 'var(--red)' : dDays !== null && dDays <= 3 ? 'var(--amber)' : 'var(--txt3)' }}>
                        {dDays === null ? '—' : overdue ? `⚠ ${dDays <= 0 ? (dDays === 0 ? 'HOY' : Math.abs(dDays) + 'd pasó') : dDays + 'd'}` : `${dDays}d`}
                      </td>
                      <td style={{ fontWeight: 700, color: 'var(--money)' }}>{money(b.total)}</td>
                      <td style={{ color: hidden ? 'var(--txt4)' : 'var(--money)', fontWeight: 600 }}>{money(b.totalGain)}</td>
                      <td>
                        {(() => {
                          const sc = STATUS_COLORS[b.status] || { bg: '#F1F5F9', color: '#475569', border: '#CBD5E1' }
                          return (
                            <select
                              style={{ fontSize: 11, padding: '4px 8px', border: `2px solid ${sc.border}`, borderRadius: 8, fontFamily: 'inherit', background: sc.bg, color: sc.color, cursor: 'pointer', outline: 'none', fontWeight: 700 }}
                              value={b.status}
                              onChange={e => handleStatusChange(b.id, e.target.value)}
                            >
                              {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </select>
                          )
                        })()}
                      </td>
                      <td>{(() => {
                        const pc = PAY_STATUS_COLORS[b.payStatus] || PAY_STATUS_COLORS.pending
                        return (
                          <select
                            style={{ fontSize: 11, padding: '4px 8px', border: `2px solid ${pc.border}`, borderRadius: 8, fontFamily: 'inherit', background: pc.bg, color: pc.color, cursor: 'pointer', outline: 'none', fontWeight: 700 }}
                            value={b.payStatus || 'pending'}
                            onChange={e => handlePayStatusChange(b.id, e.target.value)}
                          >
                            {Object.entries(PAY_STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                          </select>
                        )
                      })()}</td>
                      <td>
                        <div className="acts" style={{ gap: 4 }}>
                          <button className="act edit" onClick={() => editB(b.id)} title="Editar"><i className="fa fa-pen" /></button>
                          <button className="act wa" onClick={() => copyWA(b)} title="WA"><i className="fa-brands fa-whatsapp" /></button>
                          <div style={{ width: 20 }} />
                          <button className="act del" onClick={() => handleDelete(b)} title="Eliminar (pedirá confirmación)" style={{ background: 'var(--red)15', color: 'var(--red)' }}><i className="fa fa-trash" /></button>
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
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--txt3)' }}>{filteredBudgets.length} presupuesto{filteredBudgets.length !== 1 ? 's' : ''}</div>
        </>
      )}

      {/* ═══ ANÁLISIS ═══ */}
      {tab === 'analisis' && (
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
          <div className="card" style={{ maxHeight: 220, overflow: 'hidden' }}>
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
            <StatusDonut statuses={statuses} budgets={periodBudgets} />
          </div>
          <div className="card">
            <div className="card-header"><span className="card-title"><i className="fa fa-coins" style={{ color: 'var(--amber)', marginRight: 6 }} />Ganancia por mes</span></div>
            <BarChart data={gainData} type="gain" />
          </div>
        </div>
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
    </div>
  )
}
