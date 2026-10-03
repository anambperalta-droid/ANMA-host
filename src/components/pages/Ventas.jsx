import { useState, useMemo, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useData } from '../../context/DataContext'
import { useToast } from '../../context/ToastContext'
import { usePrivacy } from '../../context/PrivacyContext'
import { fmt } from '../../lib/storage'
import { gananciaBudget } from '../../lib/pedido'
import { buildWAMsg } from '../../lib/waMsg'

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

// Canal atribucion (02/10/26 auditoria) — Instagram/Web reemplazan Email/Telefono.
const CANAL_OPTS = [
  { value: 'whatsapp',   label: 'WhatsApp',   icon: 'fa-brands fa-whatsapp',  color: '#25D366' },
  { value: 'presencial', label: 'Presencial', icon: 'fa-store',               color: '#7C3AED' },
  { value: 'instagram',  label: 'Instagram',  icon: 'fa-brands fa-instagram', color: '#E1306C' },
  { value: 'web',        label: 'Web',        icon: 'fa-globe',               color: '#2563EB' },
  { value: 'otro',       label: 'Otro',       icon: 'fa-ellipsis',            color: '#64748b' },
]

// Medio de pago — Fase 1 auditoria 02/10/26. Separado del canal de venta.
const PAY_METHOD_OPTS = [
  { value: 'efectivo',       label: 'Efectivo',       icon: 'fa-money-bill-wave' },
  { value: 'transferencia',  label: 'Transferencia',  icon: 'fa-building-columns' },
  { value: 'mp',             label: 'Mercado Pago',   icon: 'fa-wallet' },
  { value: 'tarjeta',        label: 'Tarjeta',        icon: 'fa-credit-card' },
  { value: 'cheque',         label: 'Cheque',         icon: 'fa-money-check' },
  { value: 'otro',           label: 'Otro',           icon: 'fa-ellipsis' },
]
const PAY_METHOD_LABEL = Object.fromEntries(PAY_METHOD_OPTS.map(o => [o.value, o.label]))

function payMethodOf(b) {
  const pays = Array.isArray(b.payments) ? b.payments : []
  if (pays.length > 0) {
    const last = pays[pays.length - 1]
    if (last.method) return last.method
  }
  return b.payMethod || null
}

function capitalizeName(s) {
  if (!s) return s
  return String(s).trim().split(/\s+/).map(w => {
    if (/^[A-Z]{2,4}$/.test(w)) return w
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
  }).join(' ')
}

function fmtDateShort(iso) {
  if (!iso) return ''
  const parts = iso.split('-')
  if (parts.length < 3) return iso
  return `${parts[2]}-${parts[1]}`
}

// Mediana — Fase 2 auditoria 02/10/26 (robusta a outliers).
function median(nums) {
  const arr = nums.filter(n => Number.isFinite(n) && n > 0).sort((a, b) => a - b)
  if (!arr.length) return 0
  const mid = Math.floor(arr.length / 2)
  return arr.length % 2 ? arr[mid] : Math.round((arr[mid - 1] + arr[mid]) / 2)
}

// Condicion fiscal — Fase 2 auditoria 02/10/26.
const FISCAL_OPTS = [
  { value: 'consumidor',   label: 'Consumidor final', badge: 'CF', iva: false, color: '#64748b' },
  { value: 'respInscripto',label: 'Responsable Inscripto', badge: 'A',  iva: true,  color: '#7C3AED' },
  { value: 'monotributo',  label: 'Monotributo',      badge: 'M',  iva: false, color: '#0891B2' },
  { value: 'exento',       label: 'Exento',           badge: 'E',  iva: false, color: '#94a3b8' },
]
const FISCAL_MAP = Object.fromEntries(FISCAL_OPTS.map(o => [o.value, o]))

function fmtLive(v) {
  if (!v) return ''
  const clean = String(v).replace(/[^\d]/g, '')
  if (!clean) return ''
  return Number(clean).toLocaleString('es-AR')
}
function parseFmtValue(v) {
  return Number(String(v).replace(/\./g, '').replace(',', '.')) || 0
}

// Multi-item (02/10/26) — ver anma-app para rationale.
const newLine = () => ({ id: Math.random().toString(36).slice(2, 9), name: '', productId: null, qty: '1', pu: 0, cost: 0 })
// IVA siempre sumado (regla ANMA 02/10/26) — sin modos.
const EMPTY = { cliente: '', producto: '', cantidad: '1', facturado: '', nota: '', fecha: todayISO(), payStatus: 'pending', cobradoHoy: '', canal: '', payMethod: '', fiscalCondition: 'consumidor', lines: [newLine()], ajuste: false }

function sumLines(lines) {
  return (lines || []).reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.pu) || 0), 0)
}

export default function Ventas() {
  const { get, saveBudget, saveEntity } = useData()
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
  const [tab, setTab] = useState('all')  // Smart Tab filter 02/10/26
  const [viewMode, setViewMode] = useState('cliente') // 'cliente' | 'producto'
  const inputRef = useRef(null)

  const clients = get('clients') || []
  const products = get('products') || []
  const allBudgets = get('budgets') || []
  const allCompras = get('compras') || []
  const mk = monthKey(year, month)

  const monthBudgets = useMemo(() =>
    allBudgets.filter(b => budgetMonth(b) === mk).sort((a, b) => {
      const da = a.date || ''
      const db = b.date || ''
      if (da !== db) return db.localeCompare(da)
      return (b.updatedAt || 0) - (a.updatedAt || 0)
    }),
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
  // Mediana vs promedio — Fase 2 auditoria 02/10/26.
  const medianTicket = useMemo(() => median(monthBudgets.map(b => Number(b.total) || 0)), [monthBudgets])
  const maxTicket    = monthBudgets.reduce((m, b) => Math.max(m, Number(b.total) || 0), 0)
  const hasOutlier   = totals.count >= 3 && avgTicket > 0 && maxTicket > avgTicket * 3

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

  // Pivot analitico: agrupar ventas del mes por producto
  const productoRollup = useMemo(() => {
    const map = new Map()
    monthBudgets.forEach(b => {
      // Preferimos items[0] (que es donde vive el producto principal en quickEntry
      // y en la tabla actual). Si no hay items, usamos '(sin producto)'.
      const name = (b.items?.[0]?.name || '').trim() || '(sin producto)'
      const qty = Number(b.items?.[0]?.qty) || 1
      const total = Number(b.total) || 0
      const cobrado = b.payStatus === 'paid' ? total : (b.payStatus === 'partial' ? (Number(b.depositAmt) || 0) : 0)
      const cur = map.get(name) || { name, unidades: 0, facturado: 0, cobrado: 0, ventas: 0 }
      cur.unidades += qty
      cur.facturado += total
      cur.cobrado += cobrado
      cur.ventas += 1
      map.set(name, cur)
    })
    const arr = Array.from(map.values())
    arr.sort((a, b) => b.facturado - a.facturado) // default: mas facturado arriba
    return arr
  }, [monthBudgets])

  const [sortColProd, setSortColProd] = useState('facturado')
  const [sortDirProd, setSortDirProd] = useState('desc')
  const toggleSortProd = (col) => {
    if (sortColProd === col) setSortDirProd(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortColProd(col); setSortDirProd('desc') }
  }
  const sortedProducto = useMemo(() => {
    const dir = sortDirProd === 'asc' ? 1 : -1
    const arr = [...productoRollup]
    arr.sort((a, b) => {
      if (sortColProd === 'producto') return dir * a.name.localeCompare(b.name)
      if (sortColProd === 'unidades') return dir * (a.unidades - b.unidades)
      if (sortColProd === 'ventas') return dir * (a.ventas - b.ventas)
      return dir * (a.facturado - b.facturado)
    })
    return arr
  }, [productoRollup, sortColProd, sortDirProd])

  // Cross-KPI Ventas <-> Compras: resultado operativo del mes = ganancia cobrada - compras
  const gastadoDelMes = useMemo(() => {
    return allCompras.reduce((s, c) => {
      const d = c.fecha || new Date(c.updatedAt || Date.now()).toISOString().slice(0, 10)
      if (d.slice(0, 7) !== mk) return s
      return s + (Number(c.monto) || 0)
    }, 0)
  }, [allCompras, mk])
  const gananciaCobradaMes = useMemo(() => {
    return monthBudgets.reduce((s, b) => {
      if (b.payStatus !== 'paid' && b.payStatus !== 'partial') return s
      const g = gananciaBudget(b) || 0
      if (b.payStatus === 'paid') return s + g
      const pct = (Number(b.depositAmt) || 0) / (Number(b.total) || 1)
      return s + Math.round(g * pct)
    }, 0)
  }, [monthBudgets])
  const resultadoOperativo = gananciaCobradaMes - gastadoDelMes
  const hayCompras = gastadoDelMes > 0

  const capDelta = (v) => v === null ? null : Math.max(-999, Math.min(999, v))
  const deltaCount = prevMonthData.count >= 3 ? capDelta(Math.round(((totals.count - prevMonthData.count) / prevMonthData.count) * 100)) : null
  const prevAvgTicket = prevMonthData.count > 0 ? Math.round(prevMonthData.facturado / prevMonthData.count) : 0
  const deltaTicket = prevMonthData.count >= 3 && prevAvgTicket > 0 ? capDelta(Math.round(((avgTicket - prevAvgTicket) / prevAvgTicket) * 100)) : null

  const sortedBudgets = useMemo(() => {
    if (!sortCol) return monthBudgets
    const dir = sortDir === 'asc' ? 1 : -1
    return [...monthBudgets].sort((a, b) => {
      if (sortCol === 'cliente') return dir * (a.company || a.contact || '').localeCompare(b.company || b.contact || '')
      if (sortCol === 'producto') return dir * ((a.items?.[0]?.name || '').localeCompare(b.items?.[0]?.name || ''))
      if (sortCol === 'cant') return dir * ((a.items?.[0]?.qty || 1) - (b.items?.[0]?.qty || 1))
      if (sortCol === 'facturado') return dir * ((Number(a.total) || 0) - (Number(b.total) || 0))
      if (sortCol === 'fecha') return dir * ((a.date || '').localeCompare(b.date || ''))
      if (sortCol === 'num')   return dir * ((a.num || '').localeCompare(b.num || '', undefined, { numeric: true }))
      if (sortCol === 'cobro') {
        const ord = { pending: 0, partial: 1, paid: 2 }
        return dir * ((ord[a.payStatus] || 0) - (ord[b.payStatus] || 0))
      }
      return 0
    })
  }, [monthBudgets, sortCol, sortDir])

  // Smart Tabs: Todas / Cobradas / Pendientes.
  const tabCounts = useMemo(() => ({
    all:     monthBudgets.length,
    paid:    monthBudgets.filter(b => b.payStatus === 'paid').length,
    pending: monthBudgets.filter(b => b.payStatus !== 'paid').length,
  }), [monthBudgets])
  const filteredBudgets = useMemo(() => {
    if (tab === 'paid')    return sortedBudgets.filter(b => b.payStatus === 'paid')
    if (tab === 'pending') return sortedBudgets.filter(b => b.payStatus !== 'paid')
    return sortedBudgets
  }, [sortedBudgets, tab])

  const toggleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y - 1) } else setMonth(m => m - 1) }
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y + 1) } else setMonth(m => m + 1) }

  useEffect(() => { if (drawerOpen) setTimeout(() => inputRef.current?.focus(), 250) }, [drawerOpen])

  const [showClientSug, setShowClientSug] = useState(false)

  const clientSuggestions = useMemo(() => {
    if (!draft.cliente || draft.cliente.length < 1) return []
    const q = draft.cliente.toLowerCase()
    return clients.filter(cl => (cl.company || cl.contact || '').toLowerCase().includes(q)).slice(0, 6)
  }, [draft.cliente, clients])

  // Multi-item helpers — 02/10/26.
  const setLine = (lineId, patch) => {
    setDraft(d => ({ ...d, lines: (d.lines || []).map(l => l.id === lineId ? { ...l, ...patch } : l) }))
  }
  const addLine = () => setDraft(d => ({ ...d, lines: [...(d.lines || []), newLine()] }))
  const removeLine = (lineId) => setDraft(d => {
    const next = (d.lines || []).filter(l => l.id !== lineId)
    return { ...d, lines: next.length ? next : [newLine()] }
  })
  const selectProductInLine = (lineId, p) => {
    const price = Number(p.price) || Number(p.priceUnit) || 0
    const cost  = Number(p.costUnit) || Number(p.cost) || 0
    setLine(lineId, { name: p.name, productId: p.id || null, pu: price, cost })
  }

  // Fecha default heredando contexto del mes activo (02/10/26).
  const defaultFecha = () => {
    const now = new Date()
    if (year === now.getFullYear() && month === now.getMonth()) return todayISO()
    const last = new Date(year, month + 1, 0)
    return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`
  }
  const openDrawer = () => { setDraft({ ...EMPTY, lines: [newLine()], fecha: defaultFecha() }); setShowNota(false); setSavedCount(0); setDrawerOpen(true) }
  const closeDrawer = () => { setDrawerOpen(false) }

  const [justSaved, setJustSaved] = useState(false)

  const saveEntry = (keepOpen) => {
    const cliente = capitalizeName(draft.cliente)
    const validLines = (draft.lines || []).filter(l => (l.name && l.name.trim()) || Number(l.pu) > 0)
    const useMulti = validLines.length > 0
    const computed = sumLines(validLines)
    const rawFact = draft.ajuste && Number(parseFmtValue(draft.facturado)) > 0
      ? parseFmtValue(draft.facturado)
      : (useMulti ? computed : parseFmtValue(draft.facturado))

    if (!cliente) { toast('Completa el cliente', 'er'); return }
    if (!rawFact && !useMulti) { toast('Completa al menos producto o monto', 'er'); return }
    // Parcial: monto cobrado hoy obligatorio.
    if (draft.payStatus === 'partial') {
      const cHoy = parseFmtValue(draft.cobradoHoy)
      if (!cHoy || cHoy <= 0) { toast('Indica cuanto cobraste hoy', 'er'); return }
      if (cHoy >= rawFact)    { toast('Lo cobrado es mayor o igual al total: marca como Cobrado', 'er'); return }
    }

    // IVA siempre sumado (regla ANMA 02/10/26).
    let facturado = rawFact, ivaAmt = 0
    if (rawFact > 0) {
      ivaAmt = Math.round(rawFact * 0.21)
      facturado = rawFact + ivaAmt
    }

    const matchClient = clients.find(cl =>
      (cl.company || '').toLowerCase() === cliente.toLowerCase() ||
      (cl.contact || '').toLowerCase() === cliente.toLowerCase()
    )

    // Snapshot fiscal — Fase 2 auditoria 02/10/26.
    const fcSnap = draft.fiscalCondition || 'consumidor'
    if (matchClient && saveEntity && matchClient.fiscalCondition !== fcSnap) {
      saveEntity('clients', { ...matchClient, fiscalCondition: fcSnap })
    }
    saveBudget({
      contact: matchClient?.contact || cliente,
      company: matchClient?.company || cliente,
      clientId: matchClient?.id || null,
      wa: matchClient?.wa || '',
      clientEmail: matchClient?.email || '',
      status: 'confirmed', estado: 'confirmado',
      payStatus: draft.payStatus,
      canal: draft.canal || '',
      payMethod: draft.payMethod || '',   // Medio de pago — Fase 1
      fiscalCondition: fcSnap,            // Condicion fiscal — Fase 2
      total: facturado, aplicaIva: ivaAmt > 0, _quickIva: ivaAmt, _quickEntry: true,
      items: useMulti
        ? validLines.map(l => ({ name: l.name.trim(), qty: Number(l.qty) || 1, priceUnit: Number(l.pu) || 0, cost: Number(l.cost) || 0, productId: l.productId || null }))
        : (draft.producto.trim() ? [{ name: draft.producto.trim(), qty: Number(draft.cantidad) || 1 }] : []),
      alternatives: [{ id: 1, label: 'Principal', approved: true, kits: [{
        id: 1, name: 'Pedido', qty: 1, priceUnit: 0, costUnit: 0, packaging: [],
        products: useMulti
          ? validLines.map(l => ({ name: l.name.trim(), qty: Number(l.qty) || 1, costUnit: Number(l.cost) || 0, priceUnit: Number(l.pu) || 0 }))
          : (draft.producto.trim() ? [{ name: draft.producto.trim(), qty: Number(draft.cantidad) || 1, costUnit: 0, priceUnit: facturado / (Number(draft.cantidad) || 1) }] : []),
        personalizacion: { desc: '', costUnit: 0 },
      }] }],
      approvedAltId: 1, date: draft.fecha, noteInt: draft.nota.trim(),
      deliveryDate: '',
      depositAmt: draft.payStatus === 'partial' ? (parseFmtValue(draft.cobradoHoy) || 0) : 0,
      deposit: 0, margin: 0, margenObjetivo: 0, discount: 0,
      payments: draft.payStatus === 'partial' && parseFmtValue(draft.cobradoHoy) > 0
        ? [{ id: Date.now(), amount: parseFmtValue(draft.cobradoHoy), date: draft.fecha, method: draft.payMethod || 'otro', notes: 'Cobro al registrar venta' }]
        : (draft.payStatus === 'paid' && facturado > 0
            ? [{ id: Date.now(), amount: facturado, date: draft.fecha, method: draft.payMethod || 'otro', notes: 'Cobro al registrar venta' }]
            : []),
    })

    setSavedCount(c => c + 1)

    const dm = (draft.fecha || '').slice(0, 7)
    const offMonth = dm && dm !== mk
    const draftY = offMonth ? Number(dm.slice(0, 4)) : null
    const draftM = offMonth ? Number(dm.slice(5, 7)) - 1 : null
    const offLabel = offMonth ? `${MESES[draftM]} ${draftY}` : ''

    if (keepOpen) {
      setJustSaved(true)
      setTimeout(() => setJustSaved(false), 1200)
      if (offMonth) toast(`Cargada en ${offLabel}`, 'ok')
      setDraft({ ...EMPTY, fecha: draft.fecha, canal: draft.canal, lines: [newLine()] })
      setShowNota(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    } else {
      if (offMonth) {
        setYear(draftY); setMonth(draftM)
        toast(`Cargada en ${offLabel}`, 'ok')
      } else {
        toast('Venta registrada', 'ok')
      }
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
        .vt-row{display:grid;grid-template-columns:.4fr .4fr 1fr .7fr .3fr .7fr .4fr .55fr .5fr;gap:0;align-items:center;padding:10px 14px;border-bottom:1px solid var(--border);font-size:13px;transition:background .1s}
        /* Smart Tabs — Fase 1 auditoria 02/10/26 */
        .vt-smarttabs{display:flex;gap:0;padding:0 14px;border-bottom:1px solid var(--border);background:var(--surface2)}
        .vt-stab{background:none;border:none;border-bottom:2px solid transparent;padding:10px 14px;font-size:12px;font-weight:700;color:var(--txt3);cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:6px;transition:color .15s,border-color .15s;-webkit-tap-highlight-color:transparent}
        .vt-stab:hover{color:var(--txt2)}
        .vt-stab-on{color:var(--brand)}
        .vt-stab-ct{font-size:10px;font-weight:800;padding:1px 7px;border-radius:99px;background:var(--surface);color:var(--txt3)}
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
          .vt-row,.vt-hdr{grid-template-columns:1fr .7fr .6fr .35fr;font-size:12px}
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
                {hasOutlier && !hidden && (
                  <div title="Hay un ticket mucho mayor al resto. La mediana representa mejor lo típico." style={{ fontSize: 9.5, color: 'var(--txt4)', fontWeight: 600, marginTop: 1, letterSpacing: '.02em' }}>
                    mediana <b style={{ color: 'var(--txt3)' }}>{fmt(medianTicket)}</b>
                  </div>
                )}
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
            {/* Resultado Operativo removido del hero 02/10/26 (Fase 3 auditoria).
                Mezcla datos de Ventas y Compras — pertenece al Dashboard /
                modulo P&L, no al registro de ventas. */}
          </div>
        </div>
      </div>

      {/* TABS Por cliente / Por producto
          Nota 02/10/26: el bloque <PendientesCobro> se eliminó aquí
          (duplicaba lo que ahora se filtra con los Smart Tabs encima
          de la tabla "Por cliente"). */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 14, marginBottom: 0, padding: '0 2px' }}>
        {[
          { key: 'cliente', label: 'Por cliente', icon: 'fa-users' },
          { key: 'producto', label: 'Por producto', icon: 'fa-box' },
        ].map(t => {
          const active = viewMode === t.key
          return (
            <button key={t.key} onClick={() => setViewMode(t.key)}
              style={{
                padding: '7px 14px', border: 'none', background: 'transparent', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
                color: active ? 'var(--brand)' : 'var(--txt3)',
                borderBottom: active ? '2px solid var(--brand)' : '2px solid transparent',
                display: 'inline-flex', alignItems: 'center', gap: 6,
                transition: 'color .15s, border-color .15s',
              }}>
              <i className={`fa ${t.icon}`} style={{ fontSize: 11 }} />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* TABLA — Por cliente (default) */}
      {viewMode === 'cliente' && (
        <div style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 14, overflow: 'hidden', marginTop: 6 }}>
          {/* Smart Tabs (Todas / Cobradas / Pendientes) — reemplaza al bloque Pendientes de cobro separado */}
          <div className="vt-smarttabs">
            {[
              { k: 'all',     label: 'Todas',      count: tabCounts.all,     color: 'var(--brand)' },
              { k: 'paid',    label: 'Cobradas',   count: tabCounts.paid,    color: '#15803d' },
              { k: 'pending', label: 'Pendientes', count: tabCounts.pending, color: '#b45309' },
            ].map(t => (
              <button key={t.k} className={`vt-stab ${tab === t.k ? 'vt-stab-on' : ''}`}
                onClick={() => setTab(t.k)}
                style={tab === t.k ? { color: t.color, borderBottomColor: t.color } : undefined}>
                {t.label}
                <span className="vt-stab-ct" style={tab === t.k ? { background: t.color + '20', color: t.color } : undefined}>{t.count}</span>
              </button>
            ))}
          </div>
          <div className="vt-row vt-hdr">
            <span className="vt-hide-m" onClick={() => toggleSort('num')} style={{ cursor: 'pointer', userSelect: 'none' }}>
              N° {sortCol === 'num' && <i className={`fa fa-caret-${sortDir === 'asc' ? 'up' : 'down'}`} style={{ fontSize: 9, opacity: .7 }} />}
            </span>
            <span className="vt-hide-m" onClick={() => toggleSort('fecha')} style={{ cursor: 'pointer', userSelect: 'none' }}>
              Fecha {sortCol === 'fecha' && <i className={`fa fa-caret-${sortDir === 'asc' ? 'up' : 'down'}`} style={{ fontSize: 9, opacity: .7 }} />}
            </span>
            {[
              { key: 'cliente', label: 'Cliente', cls: '' },
              { key: 'producto', label: 'Producto', cls: '' },
              { key: 'cant', label: 'Cant', cls: 'vt-cell-r vt-hide-m' },
              { key: 'facturado', label: 'Facturado', cls: 'vt-cell-r' },
            ].map(h => (
              <span key={h.key} className={h.cls} onClick={() => toggleSort(h.key)} style={{ cursor: 'pointer', userSelect: 'none', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                {h.label}
                {sortCol === h.key && <i className={`fa fa-caret-${sortDir === 'asc' ? 'up' : 'down'}`} style={{ fontSize: 9, opacity: .7 }} />}
              </span>
            ))}
            <span className="vt-cell-r vt-hide-m">IVA</span>
            <span className="vt-hide-m" style={{ textAlign: 'center' }}>Medio pago</span>
            <span onClick={() => toggleSort('cobro')} style={{ textAlign: 'center', cursor: 'pointer', userSelect: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
              Cobro
              {sortCol === 'cobro' && <i className={`fa fa-caret-${sortDir === 'asc' ? 'up' : 'down'}`} style={{ fontSize: 9, opacity: .7 }} />}
            </span>
          </div>

          {filteredBudgets.length === 0 && monthBudgets.length === 0 && (
            <div style={{ padding: '40px 20px', textAlign: 'center' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(124,58,237,.08)', color: '#7C3AED', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, marginBottom: 10 }}><i className="fa fa-receipt" /></div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--txt2)', marginBottom: 4 }}>Sin ventas en {MESES[month].toLowerCase()}</div>
              <div style={{ fontSize: 12, color: 'var(--txt3)' }}>Hacé click en <strong>Nueva venta</strong> para agregar la primera</div>
            </div>
          )}
          {filteredBudgets.length === 0 && monthBudgets.length > 0 && (
            <div style={{ padding: '32px 24px', textAlign: 'center', fontSize: 12, color: 'var(--txt3)' }}>Sin ventas en esta pestaña.</div>
          )}

          {filteredBudgets.map(b => {
            const pi = payInfo(b)
            const isPending = b.payStatus === 'pending'
            const isPartial = b.payStatus === 'partial'
            // Desglose parcial — Fase 1 auditoria 02/10/26.
            const totalDue = Number(b.total) || 0
            const paid = b.payStatus === 'paid' ? totalDue
                       : isPartial ? (Number(b.depositAmt) || 0)
                       : 0
            const owed = Math.max(0, totalDue - paid)
            const method = payMethodOf(b)
            return (
              <div key={b.id} className="vt-row" style={{ cursor: 'pointer', borderLeft: isPending ? '3px solid #DC2626' : isPartial ? '3px solid #b45309' : '3px solid transparent' }} onClick={() => nav(`/pedido/${b.id}`)}>
                <span className="vt-cell vt-hide-m" style={{ color: 'var(--txt2)', fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: '.02em' }}>{b.num || '—'}</span>
                <span className="vt-cell vt-hide-m" style={{ color: 'var(--txt3)', fontSize: 11.5, fontVariantNumeric: 'tabular-nums' }}>{fmtDateShort(b.date) || '—'}</span>
                <span className="vt-cell" style={{ fontWeight: 600, color: 'var(--txt)', display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  {(() => {
                    const fc = b.fiscalCondition || (b.clientId ? clients.find(c => c.id === b.clientId)?.fiscalCondition : null) || 'consumidor'
                    const op = FISCAL_MAP[fc] || FISCAL_MAP.consumidor
                    return <span title={op.label} style={{ fontSize: 8.5, fontWeight: 800, background: op.color + '20', color: op.color, padding: '1px 4px', borderRadius: 3, flexShrink: 0, letterSpacing: '.02em' }}>{op.badge}</span>
                  })()}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.company || b.contact || '—'}</span>
                </span>
                <span className="vt-cell" style={{ color: 'var(--txt2)' }}>{b.items?.[0]?.name || '—'}</span>
                <span className="vt-cell vt-cell-r vt-hide-m" style={{ color: 'var(--txt3)' }}>{b.items?.[0]?.qty || 1}</span>
                <span className="vt-cell vt-cell-r" style={{ fontWeight: 700, color: 'var(--txt)' }}>{hidden ? '***' : fmt(b.total || 0)}</span>
                <span className="vt-cell vt-cell-r vt-hide-m" style={{ color: 'var(--txt3)', fontSize: 12 }}>{hidden ? '***' : (b._quickIva ? fmt(b._quickIva) : '—')}</span>
                <span className="vt-cell vt-hide-m" style={{ textAlign: 'center', color: 'var(--txt3)', fontSize: 11 }}>
                  {method ? PAY_METHOD_LABEL[method] || method : '—'}
                </span>
                <span style={{ textAlign: 'center' }} onClick={e => { e.stopPropagation(); const nx = b.payStatus === 'pending' ? 'partial' : b.payStatus === 'partial' ? 'paid' : 'pending'; updatePayStatus(b.id, nx) }}>
                  <span className="vt-pay-chip" style={{ background: pi.bg, color: pi.color }}>{pi.label}</span>
                  {isPartial && !hidden && (
                    <div style={{ fontSize: 9.5, color: 'var(--txt4)', marginTop: 3, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
                      {fmt(paid)} / <span style={{ color: '#b45309', fontWeight: 700 }}>{fmt(owed)}</span>
                    </div>
                  )}
                </span>
              </div>
            )
          })}

          {filteredBudgets.length > 0 && (
            <div className="vt-row" style={{ background: 'var(--surface2)', fontWeight: 800, borderBottom: 'none', borderRadius: '0 0 12px 12px' }}>
              <span className="vt-hide-m" />
              <span className="vt-hide-m" />
              <span style={{ color: 'var(--txt3)', fontSize: 11, textTransform: 'uppercase' }}>Total</span>
              <span />
              <span className="vt-hide-m" />
              <span className="vt-cell-r" style={{ color: 'var(--txt)', fontSize: 15, fontVariantNumeric: 'tabular-nums' }}>{hidden ? '***' : fmt(filteredBudgets.reduce((s, b) => s + (Number(b.total) || 0), 0))}</span>
              <span className="vt-cell-r vt-hide-m" style={{ color: 'var(--txt3)', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>{hidden ? '***' : fmt(filteredBudgets.reduce((s, b) => s + (Number(b._quickIva) || 0), 0))}</span>
              <span className="vt-hide-m" />
              <span />
            </div>
          )}
        </div>
      )}

      {/* TABLA — Por producto (pivot analitico) */}
      {viewMode === 'producto' && (
        <div style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 14, overflow: 'hidden', marginTop: 6 }}>
          <style>{`
            .vpr-row{display:grid;grid-template-columns:1.8fr .5fr .5fr .9fr .5fr;gap:0;align-items:center;padding:10px 14px;border-bottom:1px solid var(--border);font-size:13px;transition:background .1s}
            .vpr-row:hover{background:var(--surface2)}
            .vpr-hdr{font-size:10px;font-weight:700;color:var(--txt3);text-transform:uppercase;letter-spacing:.06em;padding:8px 14px;background:var(--surface2)}
            .vpr-hdr:hover{background:var(--surface2)}
            .vpr-cell-r{text-align:right;font-variant-numeric:tabular-nums}
            .vpr-bar{position:relative;height:6px;background:var(--surface2);border-radius:3px;overflow:hidden;margin-top:2px}
            .vpr-bar-fill{position:absolute;left:0;top:0;bottom:0;background:linear-gradient(90deg,#7C3AED,#a78bfa);border-radius:3px;transition:width .3s}
            @media(max-width:600px){
              .vpr-row,.vpr-hdr{grid-template-columns:1.5fr .5fr .8fr .3fr;font-size:12px}
              .vpr-hide-m{display:none}
            }
          `}</style>
          <div className="vpr-row vpr-hdr">
            <span onClick={() => toggleSortProd('producto')} style={{ cursor: 'pointer', userSelect: 'none', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              Producto {sortColProd === 'producto' && <i className={`fa fa-caret-${sortDirProd === 'asc' ? 'up' : 'down'}`} style={{ fontSize: 9, opacity: .7 }} />}
            </span>
            <span className="vpr-cell-r vpr-hide-m" onClick={() => toggleSortProd('ventas')} style={{ cursor: 'pointer' }}>
              Ventas {sortColProd === 'ventas' && <i className={`fa fa-caret-${sortDirProd === 'asc' ? 'up' : 'down'}`} style={{ fontSize: 9, opacity: .7 }} />}
            </span>
            <span className="vpr-cell-r" onClick={() => toggleSortProd('unidades')} style={{ cursor: 'pointer' }}>
              Unid {sortColProd === 'unidades' && <i className={`fa fa-caret-${sortDirProd === 'asc' ? 'up' : 'down'}`} style={{ fontSize: 9, opacity: .7 }} />}
            </span>
            <span className="vpr-cell-r" onClick={() => toggleSortProd('facturado')} style={{ cursor: 'pointer' }}>
              Facturado {sortColProd === 'facturado' && <i className={`fa fa-caret-${sortDirProd === 'asc' ? 'up' : 'down'}`} style={{ fontSize: 9, opacity: .7 }} />}
            </span>
            <span className="vpr-cell-r">% mes</span>
          </div>

          {productoRollup.length === 0 && (
            <div style={{ padding: '40px 20px', textAlign: 'center' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(124,58,237,.08)', color: '#7C3AED', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, marginBottom: 10 }}><i className="fa fa-box" /></div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--txt2)', marginBottom: 4 }}>Sin ventas para agrupar</div>
              <div style={{ fontSize: 12, color: 'var(--txt3)' }}>Cargá ventas del mes para ver el desglose por producto</div>
            </div>
          )}

          {sortedProducto.map(p => {
            const pct = totals.facturado > 0 ? Math.round((p.facturado / totals.facturado) * 100) : 0
            return (
              <div key={p.name} className="vpr-row">
                <span style={{ fontWeight: 600, color: 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                <span className="vpr-cell-r vpr-hide-m" style={{ color: 'var(--txt3)' }}>{p.ventas}</span>
                <span className="vpr-cell-r" style={{ color: 'var(--txt3)' }}>{p.unidades}</span>
                <span className="vpr-cell-r" style={{ fontWeight: 700, color: 'var(--txt)' }}>{hidden ? '***' : fmt(p.facturado)}</span>
                <span className="vpr-cell-r" style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand)' }}>{pct}%</div>
                  <div className="vpr-bar"><div className="vpr-bar-fill" style={{ width: `${Math.min(100, pct)}%` }} /></div>
                </span>
              </div>
            )
          })}

          {sortedProducto.length > 0 && (
            <div className="vpr-row" style={{ background: 'var(--surface2)', fontWeight: 800, borderBottom: 'none', borderRadius: '0 0 12px 12px' }}>
              <span style={{ color: 'var(--txt3)', fontSize: 11, textTransform: 'uppercase' }}>Total</span>
              <span className="vpr-cell-r vpr-hide-m" style={{ color: 'var(--txt3)', fontSize: 12 }}>{totals.count}</span>
              <span className="vpr-cell-r" style={{ color: 'var(--txt3)', fontSize: 12 }}>
                {sortedProducto.reduce((s, p) => s + p.unidades, 0)}
              </span>
              <span className="vpr-cell-r" style={{ color: 'var(--txt)', fontSize: 15 }}>{hidden ? '***' : fmt(totals.facturado)}</span>
              <span className="vpr-cell-r" style={{ color: 'var(--brand)', fontSize: 11 }}>100%</span>
            </div>
          )}
        </div>
      )}


      {/* DRAWER */}
      <SaleDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        draft={draft} setDraft={setDraft}
        inputRef={inputRef}
        clientSuggestions={clientSuggestions} showClientSug={showClientSug} setShowClientSug={setShowClientSug}
        products={products}
        setLine={setLine} addLine={addLine} removeLine={removeLine} selectProductInLine={selectProductInLine}
        showNota={showNota} setShowNota={setShowNota}
        saveEntry={saveEntry}
        savedCount={savedCount}
        justSaved={justSaved}
        visibleMk={mk}
        meses={MESES}
      />
    </div>
  )
}

/* ════════════════════════════════════════════════════════════
   DRAWER — Panel lateral de carga rapida (v3)
   ════════════════════════════════════════════════════════════ */
function SaleDrawer({ open, onClose, draft, setDraft, inputRef, clientSuggestions, showClientSug, setShowClientSug, products, setLine, addLine, removeLine, selectProductInLine, showNota, setShowNota, saveEntry, savedCount, justSaved, visibleMk, meses }) {
  if (!open) return null

  const lines = draft.lines || []
  const computedTotal = sumLines(lines)
  const rawTotal = draft.ajuste && draft.facturado ? parseFmtValue(draft.facturado) : computedTotal

  const draftMk = (draft.fecha || '').slice(0, 7)
  const offMonth = draftMk && visibleMk && draftMk !== visibleMk
  const offLabel = offMonth ? `${meses[Number(draftMk.slice(5, 7)) - 1]} ${draftMk.slice(0, 4)}` : ''

  // IVA siempre sumado (02/10/26). Desglose informativo.
  const ivaInfo = () => {
    if (!rawTotal) return { subtotal: 0, iva: 0, total: 0 }
    const iva = Math.round(rawTotal * 0.21)
    return { subtotal: rawTotal, iva, total: rawTotal + iva }
  }

  const handleFacturadoChange = (e) => {
    const raw = e.target.value.replace(/[^\d]/g, '')
    setDraft(d => ({ ...d, facturado: raw ? fmtLive(raw) : '', ajuste: !!raw }))
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
                      onMouseDown={() => {
                        const fc = cl.fiscalCondition || 'consumidor'
                        const op = FISCAL_MAP[fc] || FISCAL_MAP.consumidor
                        setDraft(d => ({ ...d, cliente: cl.company || cl.contact, fiscalCondition: fc }))
                        setShowClientSug(false)
                      }}>
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
            {/* Condicion fiscal — Fase 2 auditoria 02/10/26 */}
            <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
              {FISCAL_OPTS.map(f => {
                const on = draft.fiscalCondition === f.value
                return (
                  <button key={f.value}
                    onClick={() => setDraft(d => ({ ...d, fiscalCondition: f.value }))}
                    style={{
                      padding: '4px 9px', borderRadius: 7, fontSize: 10.5, fontWeight: 700,
                      border: `1.5px solid ${on ? f.color : 'var(--border)'}`,
                      background: on ? f.color + '18' : 'var(--bg)',
                      color: on ? f.color : 'var(--txt3)',
                      cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 4,
                    }}>
                    <span style={{ fontSize: 9, fontWeight: 800, background: on ? f.color : 'var(--surface2)', color: on ? '#fff' : 'var(--txt3)', padding: '1px 5px', borderRadius: 4 }}>{f.badge}</span>
                    {f.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="sd-sep" />

          {/* Multi-item (02/10/26) — ver anma-app para rationale */}
          <div className="sd-group">
            <label className="sd-lbl" style={{ marginBottom: 8, display: 'block' }}>
              Productos
              {lines.length > 1 && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: 'var(--surface2)', color: 'var(--txt3)' }}>{lines.length}</span>}
            </label>
            {lines.map((line, idx) => (
              <LineRow key={line.id} line={line} idx={idx} products={products}
                onSelectProduct={(p) => selectProductInLine(line.id, p)}
                onChange={(patch) => setLine(line.id, patch)}
                onRemove={() => removeLine(line.id)}
                canRemove={lines.length > 1}
              />
            ))}
            <button type="button" onClick={addLine}
              style={{
                marginTop: 4, padding: '7px 10px', width: '100%',
                border: '1.5px dashed var(--border)', background: 'transparent',
                borderRadius: 10, color: 'var(--brand)', fontSize: 12, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
              <i className="fa fa-plus" style={{ fontSize: 10 }} /> Agregar producto
            </button>
            <div style={{
              marginTop: 12, padding: '10px 12px', borderRadius: 10,
              background: 'var(--surface2)', border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                Total
                {draft.ajuste && <span style={{ marginLeft: 6, fontSize: 9.5, padding: '1px 6px', borderRadius: 4, background: '#FEF3C7', color: '#78350F' }}>ajuste manual</span>}
              </div>
              <input
                className="sd-inp"
                value={draft.facturado ? `$${draft.facturado}` : (computedTotal > 0 ? `$${fmtLive(String(computedTotal))}` : '')}
                onChange={handleFacturadoChange}
                placeholder="$0"
                style={{ textAlign: 'right', fontWeight: 800, fontSize: 16, maxWidth: 160, border: 'none', background: 'transparent', padding: '2px 0' }}
              />
            </div>
            {draft.ajuste && computedTotal > 0 && Math.abs(parseFmtValue(draft.facturado) - computedTotal) > 1 && (
              <button type="button"
                onClick={() => setDraft(d => ({ ...d, ajuste: false, facturado: '' }))}
                style={{
                  marginTop: 6, background: 'none', border: 'none', fontSize: 10.5, color: 'var(--txt3)',
                  cursor: 'pointer', fontFamily: 'inherit', padding: 0, textDecoration: 'underline',
                }}>
                Volver al total calculado ({fmt(computedTotal)})
              </button>
            )}
          </div>

          <div className="sd-sep" />

          {/* Estado de cobro + fecha/IVA (02/10/26) */}
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
              {draft.payStatus === 'partial' && (
                <div style={{ marginTop: 10, padding: '10px 12px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10 }}>
                  <label className="sd-lbl" style={{ color: '#78350F' }}>
                    Monto cobrado hoy <span style={{ color: '#DC2626' }}>*</span>
                  </label>
                  <input className="sd-inp"
                    placeholder="$0"
                    value={draft.cobradoHoy ? `$${draft.cobradoHoy}` : ''}
                    onChange={e => {
                      const raw = e.target.value.replace(/[^\d]/g, '')
                      setDraft(d => ({ ...d, cobradoHoy: raw ? fmtLive(raw) : '' }))
                    }}
                    style={{ textAlign: 'right', fontWeight: 700, background: '#fff' }}
                  />
                  {parseFmtValue(draft.cobradoHoy) > 0 && rawTotal > 0 && (
                    <div style={{ marginTop: 6, fontSize: 10.5, color: '#78350F', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                      Saldo pendiente: <b>{fmt(Math.max(0, rawTotal - parseFmtValue(draft.cobradoHoy)))}</b>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="sd-row">
              <div className="sd-fg" style={{ marginBottom: 0 }}>
                <label className="sd-lbl">Fecha</label>
                <input className="sd-inp" type="date" value={draft.fecha}
                  onChange={e => setDraft(d => ({ ...d, fecha: e.target.value }))}
                  style={offMonth ? { borderColor: '#7C3AED' } : {}}
                />
                {offMonth && (
                  <div style={{ marginTop: 5, fontSize: 10.5, fontWeight: 600, color: '#7C3AED', display: 'flex', alignItems: 'center', gap: 5, lineHeight: 1.3 }}>
                    <i className="fa fa-arrow-turn-up" style={{ transform: 'rotate(90deg)', fontSize: 9 }} />
                    Se guarda en {offLabel}
                  </div>
                )}
              </div>
            </div>
            {/* IVA siempre +21% (regla ANMA). Desglose informativo. */}
            {rawTotal > 0 && (() => {
              const info = ivaInfo()
              return (
                <div style={{
                  marginTop: 10, padding: '8px 11px', borderRadius: 8,
                  background: 'rgba(124,58,237,.06)', border: '1px solid rgba(124,58,237,.15)',
                  fontSize: 11, color: 'var(--txt2)', fontWeight: 600, display: 'flex',
                  justifyContent: 'space-between', gap: 8, alignItems: 'center',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  <span>Subtotal <b>{fmt(info.subtotal)}</b></span>
                  <span>+ IVA 21% <b style={{ color: 'var(--brand)' }}>{fmt(info.iva)}</b></span>
                  <span>= Total <b style={{ color: 'var(--txt)' }}>{fmt(info.total)}</b></span>
                </div>
              )
            })()}
          </div>

          <div className="sd-sep" />

          {/* Medio de pago — Fase 1 auditoria 02/10/26 */}
          <div className="sd-group" style={{ marginBottom: 10 }}>
            <div className="sd-fg" style={{ marginBottom: 0 }}>
              <label className="sd-lbl">Medio de pago</label>
              <div className="sd-canal-chips">
                {PAY_METHOD_OPTS.map(m => (
                  <button key={m.value}
                    className="sd-canal"
                    style={draft.payMethod === m.value ? { borderColor: 'var(--brand)', color: 'var(--brand)', borderWidth: 2 } : {}}
                    onClick={() => setDraft(d => ({ ...d, payMethod: d.payMethod === m.value ? '' : m.value }))}>
                    <i className={`fa ${m.icon}`} style={{ fontSize: 10 }} /> {m.label}
                  </button>
                ))}
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
function PendientesCobro({ budgets, hidden, nav, saveBudget, toast, mesLabel }) {
  const [justPaidId, setJustPaidId] = useState(null)
  const ageDays = (b) => {
    const ref = b.date ? new Date(b.date + 'T00:00:00').getTime() : (b.updatedAt || Date.now())
    return Math.floor((Date.now() - ref) / 86400000)
  }
  const pendientes = useMemo(() =>
    budgets.filter(b => b.payStatus !== 'paid' && (Number(b.total) || 0) > 0).sort((a, b) => {
      const da = ageDays(a)
      const db = ageDays(b)
      return db - da
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
    const text = buildWAMsg(b)
    const phone = (b.wa || '').replace(/\D/g, '')
    const encoded = encodeURIComponent(text)
    const url = phone ? `https://wa.me/${phone}?text=${encoded}` : `https://wa.me/?text=${encoded}`
    const w = window.open(url, '_blank', 'noopener')
    if (!w) window.location.href = url
    // Registramos lastContact para el seguimiento (hace Xd / sin contactar en N días).
    if (saveBudget) saveBudget({ ...b, lastContactAt: Date.now(), lastContactChannel: 'wa' })
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
          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--txt)', letterSpacing: '-.2px' }}>Pendientes de cobro{mesLabel ? ` · ${mesLabel}` : ''}</span>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 99, background: '#fef3c7', color: '#92400e' }}>{pendientes.length}</span>
        </div>
        <span style={{ fontSize: 13, fontWeight: 800, color: '#b45309', fontVariantNumeric: 'tabular-nums' }}>{hidden ? '***' : fmt(totalPend)}</span>
      </div>
      {pendientes.slice(0, 15).map(b => {
        const days = ageDays(b)
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

// LineRow — multi-item (02/10/26, paridad con anma-app).
function LineRow({ line, idx, products, onSelectProduct, onChange, onRemove, canRemove }) {
  const [showSug, setShowSug] = useState(false)
  const sugs = useMemo(() => {
    if (!line.name || line.name.length < 1) return []
    const q = line.name.toLowerCase()
    return products.filter(p => (p.name || '').toLowerCase().includes(q)).slice(0, 6)
  }, [line.name, products])

  const qty = Number(line.qty) || 0
  const pu  = Number(line.pu)  || 0
  const sub = qty * pu

  const match = line.productId
    ? products.find(p => p.id === line.productId)
    : products.find(p => (p.name || '').toLowerCase() === (line.name || '').toLowerCase())
  const matchedPrice = match ? (Number(match.price) || Number(match.priceUnit) || 0) : 0
  const diff = matchedPrice > 0 && pu > 0 ? (pu - matchedPrice) / matchedPrice : 0
  const warn = matchedPrice > 0 && pu > 0 && Math.abs(diff) > 0.05

  return (
    <div style={{
      padding: '8px 10px', marginBottom: 6,
      border: '1.5px solid var(--border)', borderRadius: 10, background: 'var(--bg)',
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 110px 28px', gap: 6, alignItems: 'center' }}>
        <div style={{ position: 'relative', minWidth: 0 }}>
          <input className="sd-inp" placeholder={`Producto ${idx + 1}`}
            value={line.name}
            onChange={e => { onChange({ name: e.target.value, productId: null }); setShowSug(true) }}
            onFocus={() => line.name.length >= 1 && setShowSug(true)}
            onBlur={() => setTimeout(() => setShowSug(false), 150)}
            style={{ padding: '7px 10px', fontSize: 12.5 }}
          />
          {showSug && sugs.length > 0 && (
            <div className="sd-sug">
              {sugs.map(p => {
                const price = Number(p.price) || Number(p.priceUnit) || 0
                return (
                  <div key={p.id} className="sd-sug-item"
                    onMouseDown={() => { onSelectProduct(p); setShowSug(false) }}>
                    <span style={{ fontWeight: 600, color: 'var(--txt)' }}>{p.name}</span>
                    {price > 0 && <span style={{ color: 'var(--brand)', fontSize: 11.5, fontWeight: 700 }}>{fmt(price)}</span>}
                  </div>
                )
              })}
            </div>
          )}
        </div>
        <input className="sd-inp" type="number" min="1"
          value={line.qty}
          onChange={e => onChange({ qty: e.target.value })}
          style={{ textAlign: 'center', fontWeight: 700, padding: '7px 4px', fontSize: 12.5 }}
        />
        <input className="sd-inp" placeholder="$0"
          value={pu > 0 ? `$${fmtLive(String(pu))}` : ''}
          onChange={e => {
            const raw = e.target.value.replace(/[^\d]/g, '')
            onChange({ pu: raw ? Number(raw) : 0 })
          }}
          style={{ textAlign: 'right', fontWeight: 700, padding: '7px 8px', fontSize: 12.5 }}
        />
        <button type="button" onClick={onRemove}
          disabled={!canRemove}
          title={canRemove ? 'Quitar linea' : 'Minimo una linea'}
          style={{
            width: 28, height: 28, borderRadius: 7, border: 'none',
            background: canRemove ? 'var(--surface2)' : 'transparent',
            color: canRemove ? 'var(--txt3)' : 'var(--txt4)',
            cursor: canRemove ? 'pointer' : 'not-allowed', fontSize: 11, fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
          <i className="fa fa-xmark" />
        </button>
      </div>
      {(sub > 0 || warn) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 5, gap: 6 }}>
          {warn ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#78350F', fontWeight: 600, background: '#FEF3C7', border: '1px solid #FDE68A', padding: '2px 7px', borderRadius: 5 }}>
              <i className="fa fa-triangle-exclamation" style={{ fontSize: 9 }} />
              Lista <b>{fmt(matchedPrice)}</b>
              <span style={{ color: diff > 0 ? '#15803d' : '#dc2626', fontWeight: 800 }}>{diff > 0 ? '+' : ''}{Math.round(diff * 100)}%</span>
            </div>
          ) : <span />}
          <span style={{ fontSize: 11.5, color: 'var(--txt3)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {qty} × {fmt(pu)} = <b style={{ color: 'var(--txt)' }}>{fmt(sub)}</b>
          </span>
        </div>
      )}
    </div>
  )
}
