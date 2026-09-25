import { useState, useMemo, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useData } from '../../context/DataContext'
import { useToast } from '../../context/ToastContext'
import { usePrivacy } from '../../context/PrivacyContext'
import { fmt } from '../../lib/storage'

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const PAY_OPTS = [
  { value: 'pending', label: 'Pendiente', icon: 'fa-clock',        color: '#64748b', bg: '#f1f5f9' },
  { value: 'partial', label: 'Señado',    icon: 'fa-hand-holding', color: '#b45309', bg: '#fef3c7' },
  { value: 'paid',    label: 'Cobrado',   icon: 'fa-circle-check', color: '#15803d', bg: '#dcfce7' },
]

function monthKey(y, m) { return `${y}-${String(m + 1).padStart(2, '0')}` }
function budgetMonth(b) {
  const d = b.date || new Date(b.updatedAt || Date.now()).toISOString().slice(0, 10)
  return d.slice(0, 7)
}
function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const CANAL_OPTS = [
  { value: 'whatsapp',   label: 'WhatsApp',   icon: 'fa-brands fa-whatsapp', color: '#25D366' },
  { value: 'presencial', label: 'Presencial',  icon: 'fa-store',              color: '#7C3AED' },
  { value: 'email',      label: 'Email',       icon: 'fa-envelope',           color: '#2563EB' },
  { value: 'telefono',   label: 'Telefono',    icon: 'fa-phone',              color: '#0891B2' },
  { value: 'otro',       label: 'Otro',        icon: 'fa-ellipsis',           color: '#64748b' },
]

function fmtLive(v) {
  if (!v) return ''
  const clean = String(v).replace(/[^\d]/g, '')
  if (!clean) return ''
  return Number(clean).toLocaleString('es-AR')
}
function parseFmtValue(v) {
  return Number(String(v).replace(/\./g, '').replace(',', '.')) || 0
}

const EMPTY = { cliente: '', producto: '', cantidad: '1', facturado: '', nota: '', fecha: todayISO(), payStatus: 'pending', incluyeIva: false, canal: '' }

export default function Ventas() {
  const { get, saveBudget } = useData()
  const toast = useToast()
  const nav = useNavigate()
  const { hidden } = usePrivacy()

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [draft, setDraft] = useState({ ...EMPTY })
  const [showNota, setShowNota] = useState(false)
  const [savedCount, setSavedCount] = useState(0)
  const [sortCol, setSortCol] = useState(null)
  const [sortDir, setSortDir] = useState('desc')
  const inputRef = useRef(null)

  const clients = get('clients') || []
  const products = get('products') || []
  const allBudgets = get('budgets') || []
  const mk = monthKey(year, month)

  const monthBudgets = useMemo(() =>
    allBudgets.filter(b => budgetMonth(b) === mk).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)),
    [allBudgets, mk]
  )

  const totals = useMemo(() => {
    let facturado = 0, iva = 0, cobrado = 0, pendiente = 0
    monthBudgets.forEach(b => {
      const t = Number(b.total) || 0
      const ivaAmt = Number(b._quickIva) || 0
      facturado += t; iva += ivaAmt
      if (b.payStatus === 'paid') cobrado += t
      else if (b.payStatus === 'partial') { cobrado += Number(b.depositAmt) || 0; pendiente += t - (Number(b.depositAmt) || 0) }
      else pendiente += t
    })
    return { facturado, iva, cobrado, pendiente, count: monthBudgets.length }
  }, [monthBudgets])

  const prevMonthData = useMemo(() => {
    const pm = month === 0 ? 11 : month - 1
    const py = month === 0 ? year - 1 : year
    const pmk = monthKey(py, pm)
    const pmBudgets = allBudgets.filter(b => budgetMonth(b) === pmk)
    const facturado = pmBudgets.reduce((s, b) => s + (Number(b.total) || 0), 0)
    return { count: pmBudgets.length, facturado }
  }, [allBudgets, month, year])

  const pctCobrado = totals.facturado > 0 ? Math.round(totals.cobrado / totals.facturado * 100) : 0

  const avgTicket = totals.count > 0 ? Math.round(totals.facturado / totals.count) : 0

  const topClient = useMemo(() => {
    const rev = {}
    monthBudgets.forEach(b => {
      const n = b.company || b.contact || ''
      if (n) rev[n] = (rev[n] || 0) + (Number(b.total) || 0)
    })
    const e = Object.entries(rev)
    if (!e.length) return null
    e.sort((a, b) => b[1] - a[1])
    return { name: e[0][0], total: e[0][1] }
  }, [monthBudgets])

  const deltaCount = prevMonthData.count > 0 ? Math.round(((totals.count - prevMonthData.count) / prevMonthData.count) * 100) : null
  const prevAvgTicket = prevMonthData.count > 0 ? Math.round(prevMonthData.facturado / prevMonthData.count) : 0
  const deltaTicket = prevAvgTicket > 0 ? Math.round(((avgTicket - prevAvgTicket) / prevAvgTicket) * 100) : null

  const sortedBudgets = useMemo(() => {
    if (!sortCol) return monthBudgets
    const dir = sortDir === 'asc' ? 1 : -1
    return [...monthBudgets].sort((a, b) => {
      if (sortCol === 'cliente') return dir * (a.company || a.contact || '').localeCompare(b.company || b.contact || '')
      if (sortCol === 'producto') return dir * ((a.items?.[0]?.name || '').localeCompare(b.items?.[0]?.name || ''))
      if (sortCol === 'cant') return dir * ((a.items?.[0]?.qty || 1) - (b.items?.[0]?.qty || 1))
      if (sortCol === 'facturado') return dir * ((Number(a.total) || 0) - (Number(b.total) || 0))
      if (sortCol === 'cobro') {
        const ord = { pending: 0, partial: 1, paid: 2 }
        return dir * ((ord[a.payStatus] || 0) - (ord[b.payStatus] || 0))
      }
      return 0
    })
  }, [monthBudgets, sortCol, sortDir])

  const toggleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y - 1) } else setMonth(m => m - 1) }
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y + 1) } else setMonth(m => m + 1) }

  useEffect(() => { if (drawerOpen) setTimeout(() => inputRef.current?.focus(), 250) }, [drawerOpen])

  const [showClientSug, setShowClientSug] = useState(false)
  const [showProdSug, setShowProdSug] = useState(false)

  const clientSuggestions = useMemo(() => {
    if (!draft.cliente || draft.cliente.length < 1) return []
    const q = draft.cliente.toLowerCase()
    return clients.filter(cl => (cl.company || cl.contact || '').toLowerCase().includes(q)).slice(0, 6)
  }, [draft.cliente, clients])

  const productSuggestions = useMemo(() => {
    if (!draft.producto || draft.producto.length < 1) return []
    const q = draft.producto.toLowerCase()
    return products.filter(p => (p.name || '').toLowerCase().includes(q)).slice(0, 6)
  }, [draft.producto, products])

  const [matchedPrice, setMatchedPrice] = useState(0)

  const selectProduct = (p) => {
    const price = Number(p.price) || Number(p.priceUnit) || 0
    const qty = Number(draft.cantidad) || 1
    setMatchedPrice(price)
    setDraft(d => ({ ...d, producto: p.name, facturado: price > 0 ? fmtLive(String(price * qty)) : d.facturado }))
    setShowProdSug(false)
  }

  useEffect(() => {
    if (!draft.producto) return
    const match = products.find(p => p.name === draft.producto)
    if (!match) return
    const price = Number(match.price) || Number(match.priceUnit) || 0
    if (price <= 0) return
    const qty = Number(draft.cantidad) || 1
    setMatchedPrice(price)
    setDraft(d => ({ ...d, facturado: fmtLive(String(price * qty)) }))
  }, [draft.cantidad])

  const openDrawer = () => { setDraft({ ...EMPTY }); setShowNota(false); setSavedCount(0); setMatchedPrice(0); setDrawerOpen(true) }
  const closeDrawer = () => { setDrawerOpen(false) }

  const [justSaved, setJustSaved] = useState(false)

  const saveEntry = (keepOpen) => {
    const cliente = draft.cliente.trim()
    const producto = draft.producto.trim()
    const cantidad = Number(draft.cantidad) || 1
    const rawFact = parseFmtValue(draft.facturado)

    if (!cliente) { toast('Completa el cliente', 'er'); return }
    if (!rawFact && !producto) { toast('Completa al menos producto o monto', 'er'); return }

    let facturado = rawFact, ivaAmt = 0
    if (draft.incluyeIva && rawFact > 0) ivaAmt = Math.round(rawFact - rawFact / 1.21)

    const matchClient = clients.find(cl =>
      (cl.company || '').toLowerCase() === cliente.toLowerCase() ||
      (cl.contact || '').toLowerCase() === cliente.toLowerCase()
    )

    saveBudget({
      contact: matchClient?.contact || cliente,
      company: matchClient?.company || cliente,
      clientId: matchClient?.id || null,
      wa: matchClient?.wa || '',
      clientEmail: matchClient?.email || '',
      status: 'confirmed', estado: 'confirmado',
      payStatus: draft.payStatus,
      canal: draft.canal || '',
      total: facturado, aplicaIva: ivaAmt > 0, _quickIva: ivaAmt, _quickEntry: true,
      items: producto ? [{ name: producto, qty: cantidad }] : [],
      alternatives: [{ id: 1, label: 'Principal', approved: true, kits: [{ id: 1, name: 'Pedido', qty: 1, priceUnit: 0, costUnit: 0, packaging: [], products: producto ? [{ name: producto, qty: cantidad, costUnit: 0, priceUnit: facturado / (cantidad || 1) }] : [], personalizacion: { desc: '', costUnit: 0 } }] }],
      approvedAltId: 1, date: draft.fecha, noteInt: draft.nota.trim(),
      deliveryDate: '', depositAmt: 0, deposit: 0, margin: 0, margenObjetivo: 0, discount: 0,
    })

    setSavedCount(c => c + 1)

    if (keepOpen) {
      setJustSaved(true)
      setTimeout(() => setJustSaved(false), 1200)
      setDraft({ ...EMPTY, fecha: draft.fecha, canal: draft.canal })
      setShowNota(false)
      setMatchedPrice(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    } else {
      toast('Venta registrada', 'ok')
      closeDrawer()
    }
  }

  const updatePayStatus = (id, s) => {
    const b = allBudgets.find(x => x.id === id)
    if (b) saveBudget({ ...b, payStatus: s })
  }

  const payInfo = (b) => PAY_OPTS.find(o => o.value === b.payStatus) || PAY_OPTS[0]

  const CobroRing = ({ percent, size = 52, stroke = 5 }) => {
    const r = (size - stroke) / 2
    const circ = 2 * Math.PI * r
    const offset = circ - (Math.min(percent, 100) / 100) * circ
    const ringColor = percent >= 100 ? '#15803d' : percent >= 50 ? '#7C3AED' : '#b45309'
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block', flexShrink: 0 }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={ringColor} strokeWidth={stroke}
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round" transform={`rotate(-90 ${size/2} ${size/2})`}
          style={{ transition: 'stroke-dashoffset .6s ease' }} />
        <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central"
          style={{ fontSize: size * 0.24, fontWeight: 800, fill: 'var(--txt)', fontFamily: "'Space Grotesk','Inter',sans-serif" }}>
          {percent}%
        </text>
      </svg>
    )
  }

  const Delta = ({ value }) => {
    if (value === null || value === undefined) return null
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 2,
        fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 6,
        color: value >= 0 ? '#15803d' : '#DC2626',
        background: value >= 0 ? 'rgba(34,197,94,.1)' : 'rgba(220,38,38,.1)',
      }}>
        <i className={`fa fa-arrow-${value >= 0 ? 'up' : 'down'}`} style={{ fontSize: 7 }} />
        {Math.abs(value)}%
      </span>
    )
  }

  return (
    <div style={{ padding: '10px 20px 80px', maxWidth: 1000, margin: '0 auto' }}>
      <style>{`
        .vt-row{display:grid;grid-template-columns:1fr .7fr .4fr .7fr .5fr .35fr;gap:0;align-items:center;padding:10px 14px;border-bottom:1px solid var(--border);font-size:13px;transition:background .1s}
        .vt-row:hover{background:var(--surface2)}
        .vt-hdr{font-size:10px;font-weight:700;color:var(--txt3);text-transform:uppercase;letter-spacing:.06em;padding:8px 14px;background:var(--surface2);border-radius:10px 10px 0 0;border:none}
        .vt-hdr:hover{background:var(--surface2)}
        .vt-cell{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .vt-cell-r{text-align:right;font-variant-numeric:tabular-nums}
        .vt-pay-chip{font-size:10px;font-weight:700;padding:3px 9px;border-radius:99px;cursor:pointer;border:none;font-family:inherit;transition:filter .15s;display:inline-flex;align-items:center;gap:4px}
        .vt-pay-chip:hover{filter:brightness(.92)}
        .vt-nav-btn{background:none;border:1px solid var(--border);cursor:pointer;color:var(--txt2);font-size:13px;width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;transition:background .15s;font-family:inherit;-webkit-tap-highlight-color:transparent;padding:0;flex-shrink:0}
        .vt-nav-btn:active{background:var(--surface2);transform:scale(.94)}
        .vt-hero{margin-bottom:12px}
        .vt-hero-main{background:var(--surface);border:1.5px solid var(--border);border-radius:14px;padding:16px;display:flex;align-items:center;gap:14px;flex-wrap:wrap}
        .vt-hero-stats{flex:1 0 100%;border-top:1px solid var(--border);margin-top:4px;padding-top:12px;display:flex;gap:0}
        .vt-hero-stat{flex:1;display:flex;align-items:center;gap:10px}
        .vt-hero-stat-icon{width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:12px;flex-shrink:0}
        .vt-hero-stat-val{font-size:16px;font-weight:800;font-variant-numeric:tabular-nums;color:var(--txt);letter-spacing:-.02em}
        .vt-hero-stat-lbl{font-size:9px;font-weight:700;color:var(--txt4);text-transform:uppercase;letter-spacing:.06em}
        .vt-hero-divider{width:1px;background:var(--border);margin:0 4px;align-self:stretch}
        @media(max-width:700px){
          .vt-row,.vt-hdr{grid-template-columns:1fr .6fr .5fr .3fr;font-size:12px}
          .vt-hide-m{display:none}
        }
        @media(max-width:600px){
          .vt-hero{padding:0 14px!important}
          .vt-hero-main{padding:14px;gap:12px}
          .vt-hero-main .vt-new-btn{width:100%!important;flex:1 0 100%;order:10;justify-content:center}
          .vt-hero-stats{padding-top:10px;margin-top:2px}
          .vt-hero-stat-icon{width:26px;height:26px;font-size:11px}
          .vt-hero-stat-val{font-size:14px}
          .vt-month-nav{margin:0 14px 10px!important;padding:6px 10px!important;border-radius:10px!important}
        }
      `}</style>

      {/* NAV MESES */}
      <div className="vt-month-nav" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 12, padding: '8px 14px', marginBottom: 10 }}>
        <button className="vt-nav-btn" onClick={prevMonth}><i className="fa fa-chevron-left" /></button>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--txt)', letterSpacing: '-.3px' }}>{MESES[month]} {year}</div>
          <div style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            {totals.count} {totals.count === 1 ? 'venta' : 'ventas'}
            {deltaCount !== null && <Delta value={deltaCount} />}
          </div>
        </div>
        <button className="vt-nav-btn" onClick={nextMonth}><i className="fa fa-chevron-right" /></button>
      </div>

      {/* HERO — cobro + stats */}
      <div className="vt-hero">
        <div className="vt-hero-main">
          <CobroRing percent={pctCobrado} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>
              Cobrado del mes
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--txt)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-.03em', lineHeight: 1.1 }}>
              {hidden ? '***' : fmt(totals.cobrado)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 3 }}>
              {hidden ? '***' : <>de {fmt(totals.facturado)} facturado</>}
              {totals.pendiente > 0 && !hidden && <> · <span style={{ color: '#b45309', fontWeight: 600 }}>{fmt(totals.pendiente)} pendiente</span></>}
            </div>
          </div>
          <button className="vt-new-btn" onClick={openDrawer} style={{
            padding: '9px 16px', borderRadius: 10, border: 'none',
            background: 'var(--grad)', color: '#fff', fontSize: 12.5, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit',
            display: 'inline-flex', alignItems: 'center', gap: 6,
            boxShadow: '0 4px 12px rgba(124,58,237,.25)', flexShrink: 0,
          }}>
            <i className="fa fa-plus" style={{ fontSize: 10 }} /> Nueva venta
          </button>
          <div className="vt-hero-stats">
            <div className="vt-hero-stat">
              <div className="vt-hero-stat-icon" style={{ background: 'rgba(99,102,241,.1)', color: '#6366f1' }}>
                <i className="fa fa-receipt" />
              </div>
              <div>
                <div className="vt-hero-stat-lbl">Ticket promedio</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="vt-hero-stat-val">{hidden ? '***' : fmt(avgTicket)}</span>
                  {deltaTicket !== null && <Delta value={deltaTicket} />}
                </div>
              </div>
            </div>
            <div className="vt-hero-divider" />
            <div className="vt-hero-stat">
              <div className="vt-hero-stat-icon" style={{ background: 'rgba(124,58,237,.1)', color: '#7C3AED' }}>
                <i className="fa fa-crown" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="vt-hero-stat-lbl">Mejor cliente</div>
                {topClient ? (
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{topClient.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--txt3)', fontWeight: 600, flexShrink: 0 }}>{hidden ? '' : fmt(topClient.total)}</span>
                  </div>
                ) : (
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--txt4)' }}>—</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <PendientesCobro budgets={allBudgets} hidden={hidden} nav={nav} saveBudget={saveBudget} toast={toast} />

      {/* TABLA */}
      <div style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 14, overflow: 'hidden', marginTop: 14 }}>
        <div className="vt-row vt-hdr">
          {[
            { key: 'cliente', label: 'Cliente', cls: '' },
            { key: 'producto', label: 'Producto', cls: '' },
            { key: 'cant', label: 'Cant', cls: 'vt-cell-r' },
            { key: 'facturado', label: 'Facturado', cls: 'vt-cell-r' },
          ].map(h => (
            <span key={h.key} className={h.cls} onClick={() => toggleSort(h.key)} style={{ cursor: 'pointer', userSelect: 'none', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              {h.label}
              {sortCol === h.key && <i className={`fa fa-caret-${sortDir === 'asc' ? 'up' : 'down'}`} style={{ fontSize: 9, opacity: .7 }} />}
            </span>
          ))}
          <span className="vt-cell-r vt-hide-m">IVA</span>
          <span onClick={() => toggleSort('cobro')} style={{ textAlign: 'center', cursor: 'pointer', userSelect: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
            Cobro
            {sortCol === 'cobro' && <i className={`fa fa-caret-${sortDir === 'asc' ? 'up' : 'down'}`} style={{ fontSize: 9, opacity: .7 }} />}
          </span>
        </div>

        {monthBudgets.length === 0 && (
          <div style={{ padding: '40px 20px', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(124,58,237,.08)', color: '#7C3AED', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, marginBottom: 10 }}><i className="fa fa-receipt" /></div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--txt2)', marginBottom: 4 }}>Sin ventas en {MESES[month].toLowerCase()}</div>
            <div style={{ fontSize: 12, color: 'var(--txt3)' }}>Hacé click en <strong>Nueva venta</strong> para agregar la primera</div>
          </div>
        )}

        {sortedBudgets.map(b => {
          const pi = payInfo(b)
          const isPending = b.payStatus === 'pending'
          const isPartial = b.payStatus === 'partial'
          return (
            <div key={b.id} className="vt-row" style={{ cursor: 'pointer', borderLeft: isPending ? '3px solid #DC2626' : isPartial ? '3px solid #b45309' : '3px solid transparent' }} onClick={() => nav(`/pedido/${b.id}`)}>
              <span className="vt-cell" style={{ fontWeight: 600, color: 'var(--txt)' }}>{b.company || b.contact || '—'}</span>
              <span className="vt-cell" style={{ color: 'var(--txt2)' }}>{b.items?.[0]?.name || '—'}</span>
              <span className="vt-cell vt-cell-r" style={{ color: 'var(--txt3)' }}>{b.items?.[0]?.qty || 1}</span>
              <span className="vt-cell vt-cell-r" style={{ fontWeight: 700, color: 'var(--txt)' }}>{hidden ? '***' : fmt(b.total || 0)}</span>
              <span className="vt-cell vt-cell-r vt-hide-m" style={{ color: 'var(--txt3)', fontSize: 12 }}>{hidden ? '***' : (b._quickIva ? fmt(b._quickIva) : '—')}</span>
              <span style={{ textAlign: 'center' }} onClick={e => { e.stopPropagation(); const nx = b.payStatus === 'pending' ? 'partial' : b.payStatus === 'partial' ? 'paid' : 'pending'; updatePayStatus(b.id, nx) }}>
                <span className="vt-pay-chip" style={{ background: pi.bg, color: pi.color }}>{pi.label}</span>
              </span>
            </div>
          )
        })}

        {monthBudgets.length > 0 && (
          <div className="vt-row" style={{ background: 'var(--surface2)', fontWeight: 800, borderBottom: 'none', borderRadius: '0 0 12px 12px' }}>
            <span style={{ color: 'var(--txt3)', fontSize: 11, textTransform: 'uppercase' }}>Total</span>
            <span /><span />
            <span className="vt-cell-r" style={{ color: 'var(--txt)', fontSize: 15 }}>{hidden ? '***' : fmt(totals.facturado)}</span>
            <span className="vt-cell-r vt-hide-m" style={{ color: 'var(--txt3)', fontSize: 12 }}>{hidden ? '***' : fmt(totals.iva)}</span>
            <span />
          </div>
        )}
      </div>

      {monthBudgets.length >= 2 && <InsightCard budgets={monthBudgets} month={MESES[month]} hidden={hidden} />}

      {/* DRAWER */}
      <SaleDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        draft={draft} setDraft={setDraft}
        inputRef={inputRef}
        clientSuggestions={clientSuggestions} showClientSug={showClientSug} setShowClientSug={setShowClientSug}
        productSuggestions={productSuggestions} showProdSug={showProdSug} setShowProdSug={setShowProdSug}
        selectProduct={selectProduct}
        showNota={showNota} setShowNota={setShowNota}
        saveEntry={saveEntry}
        savedCount={savedCount}
        matchedPrice={matchedPrice}
        justSaved={justSaved}
      />
    </div>
  )
}

/* ════════════════════════════════════════════════════════════
   DRAWER — Panel lateral de carga rapida (v3)
   ════════════════════════════════════════════════════════════ */
function SaleDrawer({ open, onClose, draft, setDraft, inputRef, clientSuggestions, showClientSug, setShowClientSug, productSuggestions, showProdSug, setShowProdSug, selectProduct, showNota, setShowNota, saveEntry, savedCount, matchedPrice, justSaved }) {
  if (!open) return null

  const qty = Number(draft.cantidad) || 1
  const rawTotal = parseFmtValue(draft.facturado)
  const showBreakdown = matchedPrice > 0 && qty > 0 && rawTotal > 0

  const ivaCalc = () => {
    if (!draft.incluyeIva || !rawTotal) return 0
    return Math.round(rawTotal - rawTotal / 1.21)
  }

  const handleFacturadoChange = (e) => {
    const raw = e.target.value.replace(/[^\d]/g, '')
    setDraft(d => ({ ...d, facturado: raw ? fmtLive(raw) : '' }))
  }

  return createPortal(
    <>
      <style>{`
        .sd-overlay{position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,.45);backdrop-filter:blur(4px);animation:sd-fade-in .2s ease}
        @keyframes sd-fade-in{from{opacity:0}to{opacity:1}}
        .sd-panel{position:fixed;top:0;right:0;bottom:0;z-index:9999;width:400px;max-width:100vw;background:var(--surface);border-left:1.5px solid var(--border);display:flex;flex-direction:column;animation:sd-slide-in .25s cubic-bezier(.4,0,.2,1);box-shadow:-8px 0 40px rgba(0,0,0,.2)}
        @keyframes sd-slide-in{from{transform:translateX(100%)}to{transform:translateX(0)}}
        .sd-header{padding:16px 20px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
        .sd-body{flex:1;overflow-y:auto;padding:20px 22px 24px}
        .sd-footer{padding:12px 20px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:8px;flex-shrink:0;background:var(--surface);transition:background .3s}
        .sd-footer-flash{background:rgba(5,150,105,.08)}
        .sd-group{margin-bottom:22px}
        .sd-fg{margin-bottom:14px}
        .sd-lbl{font-size:11px;font-weight:600;color:var(--txt3);margin-bottom:5px;display:block}
        .sd-inp{width:100%;padding:10px 12px;border:1.5px solid var(--border);border-radius:10px;font-size:14px;font-family:inherit;color:var(--txt);background:var(--bg);outline:none;box-sizing:border-box;transition:border-color .15s,box-shadow .15s}
        .sd-inp:focus{border-color:var(--brand);box-shadow:0 0 0 3px rgba(124,58,237,.1)}
        .sd-inp::placeholder{color:var(--txt4)}
        .sd-inp-icon{position:relative}
        .sd-inp-icon i{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--txt4);font-size:12px;pointer-events:none}
        .sd-inp-icon .sd-inp{padding-left:36px}
        .sd-sug{position:absolute;top:100%;left:0;right:0;z-index:100;background:var(--surface);border:1.5px solid var(--border);border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,.2);max-height:180px;overflow-y:auto;margin-top:4px}
        .sd-sug-item{padding:9px 12px;cursor:pointer;font-size:13px;color:var(--txt2);transition:background .1s;display:flex;align-items:center;justify-content:space-between;gap:8px}
        .sd-sug-item:hover{background:var(--surface2)}
        .sd-sug-item:first-child{border-radius:8px 8px 0 0}
        .sd-sug-item:last-child{border-radius:0 0 8px 8px}
        .sd-row{display:flex;gap:10px}
        .sd-row>*{flex:1;min-width:0}
        .sd-sep{height:1px;background:var(--border);margin:0 0 22px}
        .sd-chips{display:flex;gap:5px;flex-wrap:wrap}
        .sd-chip{padding:6px 11px;border-radius:8px;font-size:11px;font-weight:700;border:1.5px solid var(--border);background:var(--bg);color:var(--txt3);cursor:pointer;font-family:inherit;transition:all .15s;display:inline-flex;align-items:center;gap:4px}
        .sd-chip:hover{border-color:var(--txt2);background:var(--surface2)}
        .sd-chip-on{border-width:2px}
        .sd-canal-chips{display:flex;gap:6px;flex-wrap:wrap}
        .sd-canal{padding:7px 12px;border-radius:8px;font-size:11px;font-weight:700;border:1.5px solid var(--border);background:var(--bg);color:var(--txt2);cursor:pointer;font-family:inherit;transition:all .15s;display:inline-flex;align-items:center;gap:5px}
        .sd-canal:hover{border-color:var(--txt3);background:var(--surface2)}
        .sd-toggle{display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none;padding:10px 12px;border:1.5px solid var(--border);border-radius:10px;background:var(--bg);transition:border-color .15s}
        .sd-toggle:hover{border-color:var(--txt3)}
        .sd-switch{width:36px;height:20px;border-radius:99px;position:relative;transition:background .2s;flex-shrink:0}
        .sd-switch::after{content:'';position:absolute;width:16px;height:16px;border-radius:50%;background:#fff;top:2px;left:2px;transition:transform .2s;box-shadow:0 1px 4px rgba(0,0,0,.2)}
        .sd-switch-on{background:var(--brand)}
        .sd-switch-on::after{transform:translateX(16px)}
        .sd-switch-off{background:var(--border)}
        .sd-btn{padding:10px 20px;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;justify-content:center;gap:7px;transition:filter .15s,transform .1s}
        .sd-btn:active{transform:scale(.97)}
        .sd-btn-pri{border:none;background:var(--grad);color:#fff;box-shadow:0 4px 12px rgba(124,58,237,.25);width:100%}
        .sd-btn-pri:hover{filter:brightness(1.05)}
        .sd-btn-sec{border:1.5px solid var(--border);background:var(--surface);color:var(--txt2);width:100%}
        .sd-btn-sec:hover{border-color:var(--txt3)}
        .sd-badge{display:inline-flex;align-items:center;gap:5px;padding:3px 8px;border-radius:6px;font-size:10px;font-weight:700;background:rgba(124,58,237,.1);color:var(--brand)}
        .sd-nota-link{font-size:11px;color:var(--txt4);cursor:pointer;border:none;background:none;font-family:inherit;padding:0;transition:color .15s;display:inline-flex;align-items:center;gap:4px}
        .sd-nota-link:hover{color:var(--txt2)}
        .sd-breakdown{display:flex;align-items:center;gap:5px;padding:5px 10px;border-radius:7px;background:rgba(124,58,237,.06);border:1px solid rgba(124,58,237,.12);margin-top:4px;font-size:11px;color:var(--txt2);font-weight:600;animation:sd-fade-in .2s ease}
        .sd-breakdown i{color:var(--brand);font-size:10px}
        .sd-saved-flash{display:flex;align-items:center;justify-content:center;gap:6px;padding:8px;border-radius:8px;background:rgba(5,150,105,.08);border:1px solid rgba(5,150,105,.2);color:#059669;font-size:12px;font-weight:700;animation:sd-pop .3s cubic-bezier(.17,.67,.25,1.3)}
        @keyframes sd-pop{0%{transform:scale(.9);opacity:0}100%{transform:scale(1);opacity:1}}
        @keyframes sd-sheet-up{from{transform:translateY(100%)}to{transform:translateY(0)}}
        @media(max-width:640px){
          .sd-panel{top:auto;left:0;right:0;bottom:0;width:100vw;max-height:92vh;border-left:none;border-radius:20px 20px 0 0;animation:sd-sheet-up .28s cubic-bezier(.4,0,.2,1);box-shadow:0 -8px 40px rgba(0,0,0,.18)}
          .sd-panel::before{content:'';display:block;width:36px;height:4px;border-radius:4px;background:var(--border);margin:10px auto 0;flex-shrink:0}
          .sd-header{padding:6px 16px 8px}
          .sd-body{padding:6px 16px 16px}
          .sd-footer{padding:10px 16px max(12px,env(safe-area-inset-bottom))}
          .sd-group{margin-bottom:16px}
          .sd-fg{margin-bottom:10px}
          .sd-lbl{font-size:10px;margin-bottom:3px}
          .sd-row{gap:8px}
          .sd-sep{margin:0 0 16px}
          .sd-inp{min-height:42px;font-size:14px;padding:9px 12px}
          .sd-chip{padding:6px 10px;font-size:11px;min-height:32px}
          .sd-canal{padding:6px 10px;font-size:11px;min-height:30px}
          .sd-btn{min-height:44px;font-size:13px}
          .sd-toggle{padding:8px 10px;min-height:36px}
          .sd-sug{max-height:150px}
          .sd-sug-item{padding:8px 12px;font-size:12px}
        }
      `}</style>

      <div className="sd-overlay" onClick={onClose} />
      <div className="sd-panel">
        <div className="sd-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--txt)', letterSpacing: '-.3px' }}>Nueva venta</div>
            {savedCount > 0 && (
              <div className="sd-badge">
                <i className="fa fa-check" style={{ fontSize: 9 }} /> {savedCount}
              </div>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--txt3)', fontSize: 16, cursor: 'pointer', padding: '4px 8px', borderRadius: 8 }}>
            <i className="fa fa-xmark" />
          </button>
        </div>

        <div className="sd-body">
          {/* Cliente */}
          <div className="sd-group">
            <label className="sd-lbl">Cliente</label>
            <div className="sd-inp-icon" style={{ position: 'relative' }}>
              <i className="fa fa-search" />
              <input ref={inputRef} className="sd-inp" placeholder="Buscar o escribir nombre..."
                value={draft.cliente}
                onChange={e => { setDraft(d => ({ ...d, cliente: e.target.value })); setShowClientSug(true) }}
                onFocus={() => draft.cliente.length >= 1 && setShowClientSug(true)}
                onBlur={() => setTimeout(() => setShowClientSug(false), 150)}
              />
              {showClientSug && clientSuggestions.length > 0 && (
                <div className="sd-sug">
                  {clientSuggestions.map(cl => (
                    <div key={cl.id} className="sd-sug-item"
                      onMouseDown={() => { setDraft(d => ({ ...d, cliente: cl.company || cl.contact })); setShowClientSug(false) }}>
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--txt)' }}>{cl.company || cl.contact}</div>
                        {cl.company && cl.contact && <div style={{ fontSize: 11, color: 'var(--txt4)', marginTop: 1 }}>{cl.contact}</div>}
                      </div>
                      {cl.wa && <span style={{ fontSize: 10, color: 'var(--txt4)' }}><i className="fa-brands fa-whatsapp" style={{ marginRight: 3 }} />{cl.wa.slice(-4)}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="sd-sep" />

          {/* Producto + monto */}
          <div className="sd-group">
            <div className="sd-fg">
              <label className="sd-lbl">Producto</label>
              <div style={{ position: 'relative' }}>
                <input className="sd-inp" placeholder="Nombre del producto"
                  value={draft.producto}
                  onChange={e => { setDraft(d => ({ ...d, producto: e.target.value })); setShowProdSug(true) }}
                  onFocus={() => draft.producto.length >= 1 && setShowProdSug(true)}
                  onBlur={() => setTimeout(() => setShowProdSug(false), 150)}
                />
                {showProdSug && productSuggestions.length > 0 && (
                  <div className="sd-sug">
                    {productSuggestions.map(p => {
                      const price = Number(p.price) || Number(p.priceUnit) || 0
                      return (
                        <div key={p.id} className="sd-sug-item" onMouseDown={() => selectProduct(p)}>
                          <span style={{ fontWeight: 600, color: 'var(--txt)' }}>{p.name}</span>
                          {price > 0 && <span style={{ color: 'var(--brand)', fontSize: 12, fontWeight: 700 }}>{fmt(price)}</span>}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
            <div className="sd-row">
              <div className="sd-fg" style={{ flex: '.6', marginBottom: 0 }}>
                <label className="sd-lbl">Cant.</label>
                <input className="sd-inp" type="number" min="1" value={draft.cantidad}
                  onChange={e => setDraft(d => ({ ...d, cantidad: e.target.value }))}
                  style={{ textAlign: 'center', fontWeight: 700 }}
                />
              </div>
              <div className="sd-fg" style={{ marginBottom: 0 }}>
                <label className="sd-lbl">Monto</label>
                <input className="sd-inp" placeholder="$0"
                  value={draft.facturado ? `$${draft.facturado}` : ''}
                  onChange={handleFacturadoChange}
                  style={{ textAlign: 'right', fontWeight: 700, fontSize: 16 }}
                />
              </div>
            </div>
            {showBreakdown && (
              <div className="sd-breakdown">
                <i className="fa fa-calculator" />
                <span>{fmt(matchedPrice)}/u</span>
                <span style={{ color: 'var(--txt4)' }}>x</span>
                <span>{qty}</span>
                <span style={{ color: 'var(--txt4)' }}>=</span>
                <span style={{ color: 'var(--brand)', fontWeight: 800 }}>{fmt(rawTotal)}</span>
              </div>
            )}
          </div>

          <div className="sd-sep" />

          {/* Estado de cobro + fecha/IVA */}
          <div className="sd-group">
            <div className="sd-fg">
              <div className="sd-chips">
                {PAY_OPTS.map(opt => (
                  <button key={opt.value}
                    className={`sd-chip ${draft.payStatus === opt.value ? 'sd-chip-on' : ''}`}
                    style={draft.payStatus === opt.value ? { background: opt.bg, color: opt.color, borderColor: opt.color } : {}}
                    onClick={() => setDraft(d => ({ ...d, payStatus: opt.value }))}>
                    <i className={`fa ${opt.icon}`} style={{ fontSize: 10 }} /> {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="sd-row">
              <div className="sd-fg" style={{ marginBottom: 0 }}>
                <label className="sd-lbl">Fecha</label>
                <input className="sd-inp" type="date" value={draft.fecha}
                  onChange={e => setDraft(d => ({ ...d, fecha: e.target.value }))}
                />
              </div>
              <div className="sd-fg" style={{ marginBottom: 0 }}>
                <label className="sd-lbl">IVA</label>
                <div className="sd-toggle" onClick={() => setDraft(d => ({ ...d, incluyeIva: !d.incluyeIva }))}>
                  <div className={`sd-switch ${draft.incluyeIva ? 'sd-switch-on' : 'sd-switch-off'}`} />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--txt2)' }}>{draft.incluyeIva ? '21%' : 'Sin IVA'}</div>
                    {draft.incluyeIva && ivaCalc() > 0 && <div style={{ fontSize: 10, color: 'var(--brand)', marginTop: 1 }}>{fmt(ivaCalc())}</div>}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="sd-sep" />

          {/* Canal + nota */}
          <div className="sd-group" style={{ marginBottom: 0 }}>
            <div className="sd-fg" style={{ marginBottom: 8 }}>
              <label className="sd-lbl">Canal</label>
              <div className="sd-canal-chips">
                {CANAL_OPTS.map(c => (
                  <button key={c.value}
                    className="sd-canal"
                    style={draft.canal === c.value ? { background: c.color + '18', color: c.color, borderColor: c.color + '60', borderWidth: 2 } : {}}
                    onClick={() => setDraft(d => ({ ...d, canal: d.canal === c.value ? '' : c.value }))}>
                    <i className={c.icon.startsWith('fa-brands') ? c.icon : `fa ${c.icon}`} style={{ fontSize: 10 }} /> {c.label}
                  </button>
                ))}
              </div>
            </div>
            {!showNota ? (
              <button className="sd-nota-link" onClick={() => setShowNota(true)}>
                <i className="fa fa-plus" style={{ fontSize: 9 }} /> Nota interna
              </button>
            ) : (
              <div className="sd-fg" style={{ marginBottom: 0 }}>
                <label className="sd-lbl">Nota</label>
                <input className="sd-inp" placeholder="Ej: paga la semana que viene..."
                  value={draft.nota}
                  onChange={e => setDraft(d => ({ ...d, nota: e.target.value }))}
                />
              </div>
            )}
          </div>
        </div>

        <div className={`sd-footer ${justSaved ? 'sd-footer-flash' : ''}`}>
          {justSaved && (
            <div className="sd-saved-flash">
              <i className="fa fa-circle-check" /> Guardada — carga otra
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="sd-btn sd-btn-sec" onClick={() => saveEntry(true)} style={{ flex: 1 }}>
              <i className="fa fa-rotate" style={{ fontSize: 11 }} /> Otra mas
            </button>
            <button className="sd-btn sd-btn-pri" onClick={() => saveEntry(false)} style={{ flex: 1 }}>
              <i className="fa fa-check" /> Guardar
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body
  )
}

/* ════════════════════════════════════════════════════════════ */
function InsightCard({ budgets, month, hidden }) {
  const clientCounts = {}
  budgets.forEach(b => { const n = b.company || b.contact || 'Sin nombre'; clientCounts[n] = (clientCounts[n] || 0) + 1 })
  const topClient = Object.entries(clientCounts).sort((a, b) => b[1] - a[1])[0]
  const totalFact = budgets.reduce((s, b) => s + (Number(b.total) || 0), 0)
  const avgTicket = totalFact / budgets.length

  return (
    <div style={{ marginTop: 16, padding: '16px 20px', background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 14, display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(124,58,237,.1)', color: '#7C3AED', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
        <i className="fa fa-lightbulb" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#7C3AED', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 }}>Inteligencia de {month}</div>
        <div style={{ fontSize: 13, color: 'var(--txt2)', lineHeight: 1.5 }}>
          {topClient && <><strong>{topClient[0]}</strong> es tu cliente mas activo ({topClient[1]} {topClient[1] === 1 ? 'venta' : 'ventas'}).</>}
          {' '}Ticket promedio: <strong>{hidden ? '***' : fmt(avgTicket)}</strong>.
        </div>
      </div>
    </div>
  )
}

function PendientesCobro({ budgets, hidden, nav, saveBudget, toast }) {
  const [justPaidId, setJustPaidId] = useState(null)
  const pendientes = useMemo(() =>
    budgets.filter(b => b.payStatus !== 'paid' && (Number(b.total) || 0) > 0).sort((a, b) => {
      const da = Math.floor((Date.now() - (a.updatedAt || Date.now())) / 86400000)
      const db = Math.floor((Date.now() - (b.updatedAt || Date.now())) / 86400000)
      if (da > 30 && db <= 30) return -1
      if (db > 30 && da <= 30) return 1
      return (a.updatedAt || 0) - (b.updatedAt || 0)
    }),
    [budgets]
  )
  if (pendientes.length === 0) return null
  const totalPend = pendientes.reduce((s, b) => { const t = Number(b.total) || 0; const d = Number(b.depositAmt) || 0; return s + (b.payStatus === 'partial' ? t - d : t) }, 0)

  const markPaid = (b) => {
    if (saveBudget) saveBudget({ ...b, payStatus: 'paid' })
    setJustPaidId(b.id)
    setTimeout(() => setJustPaidId(null), 1400)
    if (toast) toast('Cobro registrado', 'ok')
  }

  const sendWA = (b) => {
    const name = b.company || b.contact || ''
    const owed = b.payStatus === 'partial' ? (Number(b.total) || 0) - (Number(b.depositAmt) || 0) : Number(b.total) || 0
    const phone = (b.wa || '').replace(/\D/g, '')
    const msg = `Hola${name ? ` ${name}` : ''}, te escribo por el saldo pendiente de $${owed.toLocaleString('es-AR')}. Quedo atenta, gracias.`
    const url = phone
      ? `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(msg)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`
    window.open(url, '_blank', 'noopener')
  }

  return (
    <div style={{ marginTop: 16, background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
      <style>{`
        .pc-row{display:flex;align-items:center;gap:10px;padding:8px 14px;border-bottom:1px solid var(--border);cursor:pointer;transition:background .12s;-webkit-tap-highlight-color:transparent}
        .pc-row:hover{background:var(--surface2)}
        .pc-row:last-child{border-bottom:none}
        .pc-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
        .pc-name{flex:1;min-width:0;font-size:13px;font-weight:600;color:var(--txt);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .pc-days{font-size:10px;color:var(--txt4);flex-shrink:0;font-weight:600;min-width:24px;text-align:right}
        .pc-amt{font-size:13px;font-weight:800;font-variant-numeric:tabular-nums;flex-shrink:0;letter-spacing:-.02em;min-width:70px;text-align:right}
        .pc-ib{width:28px;height:28px;border-radius:8px;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px;flex-shrink:0;transition:all .12s;-webkit-tap-highlight-color:transparent;font-family:inherit;padding:0}
        .pc-ib:active{transform:scale(.9)}
        .pc-ib-pay{background:#dcfce7;color:#15803d}
        .pc-ib-pay:hover{background:#bbf7d0}
        .pc-ib-wa{background:rgba(37,211,102,.08);color:#128C7E}
        .pc-ib-wa:hover{background:rgba(37,211,102,.18)}
        .pc-flash{animation:pc-done .6s ease}
        @keyframes pc-done{0%{background:rgba(5,150,105,.15)}100%{background:transparent}}
        .pc-tag{font-size:9px;font-weight:700;padding:1px 6px;border-radius:4px;flex-shrink:0;white-space:nowrap}
        @media(max-width:600px){
          .pc-row{padding:8px 12px;gap:8px}
          .pc-name{font-size:12px}
          .pc-amt{font-size:12px;min-width:60px}
          .pc-ib{width:32px;height:32px}
        }
      `}</style>
      <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <i className="fa fa-clock" style={{ color: '#b45309', fontSize: 12 }} />
          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--txt)', letterSpacing: '-.2px' }}>Pendientes de cobro</span>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 99, background: '#fef3c7', color: '#92400e' }}>{pendientes.length}</span>
        </div>
        <span style={{ fontSize: 13, fontWeight: 800, color: '#b45309', fontVariantNumeric: 'tabular-nums' }}>{hidden ? '***' : fmt(totalPend)}</span>
      </div>
      {pendientes.slice(0, 15).map(b => {
        const days = Math.floor((Date.now() - (b.updatedAt || Date.now())) / 86400000)
        const owed = b.payStatus === 'partial' ? (Number(b.total) || 0) - (Number(b.depositAmt) || 0) : Number(b.total) || 0
        const isFlash = justPaidId === b.id
        const urgency = days > 30 ? 'critical' : days > 7 ? 'warn' : 'normal'
        const dotColor = urgency === 'critical' ? '#DC2626' : urgency === 'warn' ? '#D97706' : b.payStatus === 'partial' ? '#D97706' : '#94A3B8'
        return (
          <div key={b.id} className={`pc-row ${isFlash ? 'pc-flash' : ''}`} onClick={() => nav(`/pedido/${b.id}`)}>
            <div className="pc-dot" style={{ background: dotColor }} />
            <span className="pc-name">{b.company || b.contact || '---'}</span>
            {b.payStatus === 'partial' && <span className="pc-tag" style={{ background: '#fef3c7', color: '#92400e' }}>Señado</span>}
            {days > 0 && <span className="pc-days" style={{ color: urgency === 'critical' ? '#DC2626' : undefined, fontWeight: urgency === 'critical' ? 700 : undefined }}>{days}d</span>}
            <span className="pc-amt" style={{ color: urgency === 'critical' ? '#DC2626' : '#b45309' }}>{hidden ? '***' : fmt(owed)}</span>
            <button className="pc-ib pc-ib-pay" title="Marcar cobrado" onClick={e => { e.stopPropagation(); markPaid(b) }}>
              <i className="fa fa-check" />
            </button>
            <button className="pc-ib pc-ib-wa" title="Recordar por WhatsApp" onClick={e => { e.stopPropagation(); sendWA(b) }}>
              <i className="fa-brands fa-whatsapp" />
            </button>
          </div>
        )
      })}
      {pendientes.length > 15 && <div style={{ padding: '8px 14px', textAlign: 'center', fontSize: 11, color: 'var(--txt3)' }}>y {pendientes.length - 15} mas...</div>}
    </div>
  )
}
