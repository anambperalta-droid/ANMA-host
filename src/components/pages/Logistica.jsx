import { useState, useMemo } from 'react'
import { useData } from '../../context/DataContext'
import { useToast } from '../../context/ToastContext'
import { fmt, fmtDate } from '../../lib/storage'

const SERVICE_MULTIPLIER = {
  'Estándar': 1,
  'Urgente / Express': 1.6,
  'Puerta a puerta': 1.3,
  'Entrega en sucursal': 0.85,
}

const CARRIERS = ['Vía Cargo']

const CARRIER_TRACKING = {
  'Vía Cargo': c => `https://www.viacargo.com.ar/web/seguimiento?nro=${c}`,
}

const STATUS_SELECT_STYLE = {
  'Preparando':   { background: '#FEF3C7', color: '#92400E', border: '1.5px solid #FCD34D' },
  'Despachado':   { background: '#DBEAFE', color: '#1E40AF', border: '1.5px solid #93C5FD' },
  'En tránsito':  { background: '#EDE9FE', color: '#5B21B6', border: '1.5px solid #C4B5FD' },
  'Entregado':    { background: '#DCFCE7', color: '#14532D', border: '1.5px solid #86EFAC' },
  'Con problema': { background: '#FEF2F2', color: '#991B1B', border: '1.5px solid #FCA5A5' },
}

const DONUT_COLORS = {
  'Preparando':   '#FCD34D',
  'Despachado':   '#60A5FA',
  'En tránsito':  '#A78BFA',
  'Entregado':    '#34D399',
  'Con problema': '#F87171',
}

function DonutChart({ data, hovered }) {
  const total = data.reduce((s, d) => s + d.count, 0)
  const R = 32, CX = 44, CY = 44
  const CIRC = 2 * Math.PI * R
  if (total === 0) return (
    <div style={{ width: 88, height: 88, borderRadius: '50%', background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <span style={{ fontSize: 9, color: 'var(--txt4)' }}>sin datos</span>
    </div>
  )
  let acc = 0
  const segments = data.filter(d => d.count > 0).map(d => {
    const len = (d.count / total) * CIRC
    const startDeg = (acc / CIRC) * 360 - 90
    acc += len
    return { ...d, len, startDeg }
  })
  return (
    <svg width={88} height={88} viewBox="0 0 88 88" style={{ flexShrink: 0 }}>
      <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--surface2)" strokeWidth={10} />
      {segments.map(seg => (
        <circle
          key={seg.label}
          cx={CX} cy={CY} r={R}
          fill="none"
          stroke={DONUT_COLORS[seg.label] || '#CBD5E1'}
          strokeWidth={hovered === seg.label ? 14 : 9}
          strokeDasharray={`${seg.len} ${CIRC - seg.len}`}
          transform={`rotate(${seg.startDeg} ${CX} ${CY})`}
          style={{ transition: 'stroke-width .15s', cursor: 'pointer' }}
        />
      ))}
      <text x={CX} y={CY - 5} textAnchor="middle" style={{ fontSize: 15, fontWeight: 800, fill: 'var(--txt)', fontFamily: 'inherit' }}>{total}</text>
      <text x={CX} y={CY + 10} textAnchor="middle" style={{ fontSize: 8, fill: '#9CA3AF', fontFamily: 'inherit' }}>envíos</text>
    </svg>
  )
}

const getTrackingUrl = (carrier, code) => {
  if (!code) return null
  if (code.startsWith('http')) return code
  const fn = CARRIER_TRACKING[carrier]
  return fn ? fn(encodeURIComponent(code)) : `https://www.google.com/search?q=${encodeURIComponent(`${carrier || ''} ${code} seguimiento envio`)}`
}

export default function Logistica() {
  const { get, saveEntity, deleteEntity } = useData()
  const toast = useToast()
  const [tab, setTab] = useState('envios')
  const [sFilter, setSFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({})
  const [lateAlertDismissed, setLateAlertDismissed] = useState(() => {
    try { return sessionStorage.getItem('logistica_late_dismissed') === '1' } catch { return false }
  })
  const [hoveredStatus, setHoveredStatus] = useState(null)
  const [cotizSearch, setCotizSearch] = useState('')
  const [cotizClient, setCotizClient] = useState(null)
  const [despachoDir, setDespachoDir] = useState(() => localStorage.getItem('anma_desp_dir') || '')
  const [despachoCUIT, setDespachoCUIT] = useState(() => localStorage.getItem('anma_desp_cuit') || '')
  const dismissLateAlert = () => {
    try { sessionStorage.setItem('logistica_late_dismissed', '1') } catch { }
    setLateAlertDismissed(true)
  }

  const shipments = get('shipments')
  const budgets = get('budgets')
  const tariffs = get('tariffs')
  const clients = get('clients') || []
  const statusList = ['Preparando', 'Despachado', 'En tránsito', 'Entregado', 'Con problema']

  const filteredShips = useMemo(() => {
    let s = shipments
    if (sFilter !== 'all') s = s.filter(x => x.status === sFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      s = s.filter(x =>
        (x.remito || '').toLowerCase().includes(q) ||
        (x.client || '').toLowerCase().includes(q) ||
        (x.city || '').toLowerCase().includes(q)
      )
    }
    return s
  }, [shipments, sFilter, search])

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const openShip = (s) => {
    setForm(s || {
      remito: '', date: new Date().toISOString().slice(0, 10),
      status: 'Preparando', budgetId: '', client: '', city: '', addr: '',
      bulks: 1, weight: '', carrier: '', service: 'Estándar', freight: 0,
      payer: 'Mi negocio', notes: '', trackingUrl: ''
    })
    setModal(true)
  }

  const onBudgetChange = (budgetId) => {
    if (!budgetId) { setF('budgetId', ''); return }
    const bud = budgets.find(b => b.id === Number(budgetId))
    if (!bud) { setF('budgetId', Number(budgetId)); return }
    setForm(f => ({
      ...f,
      budgetId: Number(budgetId),
      client: bud.contact || bud.company || f.client || '',
      city:   bud.city   || f.city   || '',
      addr:   bud.addr   || f.addr   || '',
    }))
  }

  const fleteEstimado = useMemo(() => {
    if (!form.city || !form.weight) return null
    const q = form.city.toLowerCase()
    const t = tariffs.find(x => x.zone.toLowerCase().includes(q) || q.includes(x.zone.toLowerCase()))
    if (!t) return null
    const base = Math.max(t.min || 0, (t.ppkg || 0) * Number(form.weight))
    const mult = SERVICE_MULTIPLIER[form.service] || 1
    return Math.round(base * mult)
  }, [form.city, form.weight, form.service, tariffs])

  const estimatedArrival = useMemo(() => {
    if (!form.city || !form.date) return null
    const q = form.city.toLowerCase()
    const t = tariffs.find(x => x.zone.toLowerCase().includes(q) || q.includes(x.zone.toLowerCase()))
    if (!t || !t.days) return null
    const d = new Date(form.date); d.setDate(d.getDate() + Number(t.days))
    return d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
  }, [form.city, form.date, tariffs])

  const trackingLink = useMemo(() => getTrackingUrl(form.carrier, form.trackingUrl), [form.carrier, form.trackingUrl])

  const marginImpact = useMemo(() => {
    if (form.payer !== 'Incluido en precio' || !form.budgetId || !form.freight) return null
    const bud = budgets.find(b => b.id === form.budgetId)
    if (!bud) return null
    return (bud.totalGain || 0) - (form.freight || 0)
  }, [form.payer, form.budgetId, form.freight, budgets])

  const sendTrackingWA = () => {
    const bud = budgets.find(b => b.id === form.budgetId)
    const phone = bud?.wa || ''
    if (!phone) { toast('El presupuesto no tiene número de WhatsApp cargado.', 'in'); return }
    const num = phone.replace(/\D/g, '')
    const msg = `Hola ${form.client || ''}! Tu pedido está en camino 🚚\n\nRemito: ${form.remito || '—'}\nEmpresa: ${form.carrier || form.service}${trackingLink ? `\n\nSeguí tu envío acá:\n${trackingLink}` : ''}\n\nCualquier consulta, estamos a disposición!`
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`, '_blank')
  }

  const saveShip = () => {
    if (!form.remito && !form.client) { toast('Completá remito o cliente.', 'er'); return }
    saveEntity('shipments', form); setModal(false); toast('Envío guardado', 'ok')
  }
  const delShip = (id) => {
    if (window.confirm('¿Eliminar envío?')) { deleteEntity('shipments', id); toast('Envío eliminado', 'in') }
  }

  const cotizFilteredClients = useMemo(() => {
    if (!cotizSearch.trim()) return []
    const q = cotizSearch.toLowerCase()
    return clients.filter(c =>
      (c.company || '').toLowerCase().includes(q) ||
      (c.contact || '').toLowerCase().includes(q)
    ).slice(0, 8)
  }, [cotizSearch, clients])

  const totalShipCost = shipments.reduce((s, x) => s + (x.freight || 0), 0)
  const nowYM = new Date().toISOString().slice(0, 7)
  const thisMonth = shipments.filter(s => s.date?.startsWith(nowYM)).length
  const avgCost = shipments.length ? Math.round(totalShipCost / shipments.length) : 0

  const SLA_DEFAULT = 7
  const daysSince = (iso) => iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : 0
  const isLate = (s) => {
    if (!['Despachado', 'En tránsito'].includes(s.status)) return false
    const limit = (() => {
      if (!s.city) return SLA_DEFAULT
      const t = tariffs.find(x => x.zone.toLowerCase().includes(s.city.toLowerCase()) || s.city.toLowerCase().includes(x.zone.toLowerCase()))
      return t?.days ? t.days + 2 : SLA_DEFAULT
    })()
    return daysSince(s.date) > limit
  }
  const lateShipments = useMemo(() => shipments.filter(isLate), [shipments, tariffs])

  const todayCount = useMemo(() => {
    const t = new Date().toISOString().slice(0, 10)
    return shipments.filter(s => s.date === t).length
  }, [shipments])
  const pendingCount = useMemo(() => shipments.filter(s => s.status === 'Preparando').length, [shipments])

  const varianceCount = useMemo(() => {
    return shipments.filter(s => {
      if (s.payer !== 'Incluido en precio' || !s.budgetId) return false
      const bud = budgets.find(b => b.id === s.budgetId)
      if (!bud) return false
      const cobrado = Number(bud.shipCost) || 0
      const real = Number(s.freight) || 0
      return Math.abs(cobrado - real) > 100
    }).length
  }, [shipments, budgets])

  const notifyStatusChange = (shipment, newStatus) => {
    const bud = budgets.find(b => b.id === shipment.budgetId)
    const phone = (bud?.wa || '').replace(/\D/g, '')
    if (!phone) return null
    const link = getTrackingUrl(shipment.carrier, shipment.trackingUrl)
    const msgs = {
      'Despachado': `Hola${shipment.client ? ' ' + shipment.client : ''}! Tu pedido fue despachado 🎁${link ? `\n\nSeguilo acá:\n${link}` : ''}\n\nGracias por tu compra!`,
      'En tránsito': `Hola${shipment.client ? ' ' + shipment.client : ''}! Tu regalo está en camino 🚚${link ? `\n\nSeguilo acá:\n${link}` : ''}`,
      'Entregado': `Hola${shipment.client ? ' ' + shipment.client : ''}! Tu pedido fue entregado ✨\n\n¡Gracias! Cualquier comentario, estamos a disposición.`,
      'Con problema': `Hola${shipment.client ? ' ' + shipment.client : ''}, hubo una novedad con tu envío. Te contacto para resolverlo cuanto antes.`,
    }
    const msg = msgs[newStatus]
    if (!msg) return null
    return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
  }

  const byStatus = useMemo(() => statusList.map(st => ({
    label: st,
    count: shipments.filter(s => s.status === st).length,
    cost:  shipments.filter(s => s.status === st).reduce((a, s) => a + (s.freight || 0), 0),
  })), [shipments])

  const monthlyData = useMemo(() => {
    const months = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i)
      const ym = d.toISOString().slice(0, 7)
      const label = d.toLocaleString('es-AR', { month: 'short', year: '2-digit' })
      const items = shipments.filter(s => s.date?.startsWith(ym))
      months.push({ ym, label, count: items.length, cost: items.reduce((a, s) => a + (s.freight || 0), 0) })
    }
    return months
  }, [shipments])
  const maxCost = Math.max(...monthlyData.map(m => m.cost), 1)
  const prevMonthCost = monthlyData.length >= 2 ? monthlyData[monthlyData.length - 2].cost : 0
  const currMonthCost = monthlyData.length >= 1 ? monthlyData[monthlyData.length - 1].cost : 0
  const trendPct = prevMonthCost > 0 ? Math.round(((currMonthCost - prevMonthCost) / prevMonthCost) * 100) : null

  const statusBadge = (s) => {
    const cls = { Preparando: 'b-amber', Despachado: 'b-blue', 'En tránsito': 'b-purple', Entregado: 'b-confirmed', 'Con problema': 'b-lost' }
    return <span className={`badge ${cls[s] || 'b-draft'}`}>{s}</span>
  }

  return (
    <div className="page active" style={{ animation: 'pgIn .25s ease both' }}>
      <style>{`
        .ship-modal .grid2{grid-template-columns:1fr!important;gap:0}
        /* ── ADAPTIVE LOGÍSTICA ── */
        .logi-tab-add{display:none;align-items:center;gap:4px;padding:6px 11px;background:var(--brand);border:none;border-radius:9px;cursor:pointer;font-family:inherit;font-size:11px;font-weight:700;color:#fff;line-height:1;white-space:nowrap;-webkit-tap-highlight-color:transparent;flex-shrink:0;transition:opacity .15s}
        .logi-tab-add:active{opacity:.76}
        .logi-tab-add i{font-size:11px}
        /* Micro-píldoras de tabs — espejo de cli-pill-group */
        .logi-cli-pill-group{display:inline-flex;align-items:center;gap:3px;background:var(--surface2);border:1px solid var(--border);border-radius:9999px;padding:3px}
        .logi-cli-pill{display:inline-flex;align-items:center;gap:4px;padding:6px 14px;background:transparent;border:1px solid transparent;border-radius:9999px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:600;color:var(--txt3);line-height:1;transition:all .15s;white-space:nowrap;-webkit-tap-highlight-color:transparent}
        .logi-cli-pill:hover{background:var(--brand-xlt);color:var(--brand)}
        .logi-cli-pill:active{transform:scale(.95)}
        .logi-cli-pill.active{background:var(--brand-xlt)!important;color:var(--brand)!important;font-weight:700!important;border-color:var(--brand-dim)!important}
        .logi-cli-new{display:inline-flex;align-items:center;gap:6px;padding:8px 18px;background:var(--color-principal);border:none;border-radius:9999px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:700;color:#fff;line-height:1;transition:all .18s;white-space:nowrap;-webkit-tap-highlight-color:transparent;box-shadow:0 4px 14px var(--brand-dim)}
        .logi-cli-new:hover{filter:brightness(1.08);transform:translateY(-1px)}
        .logi-cli-new:active{transform:scale(.95)}
        .logi-cli-new i{font-size:12px}
        /* Tab bar — solo mobile */
        .logi-mob-tabs{display:none}
        /* Search row estilizado */
        .logi-search-row{background:#F9FAFB!important;border:1px solid #E5E7EB!important;box-shadow:none!important;border-radius:9999px!important;height:34px!important}
        .logi-pills-row{display:flex;gap:6px;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;align-items:center;padding-bottom:1px}
        .logi-pills-row::-webkit-scrollbar{display:none}
        /* Mobile cards */
        .logi-mob-list{display:none;flex-direction:column;padding:4px 0 16px}
        .logi-card{display:flex;flex-direction:column;gap:4px;border-radius:24px;padding:13px 16px;border:1px solid var(--border);background:var(--surface);margin-bottom:8px;position:relative;-webkit-tap-highlight-color:transparent;transition:background .1s;cursor:pointer}
        .logi-card.late{border-color:#FECACA;border-left:4px solid #DC2626}
        .logi-card:active{background:rgba(0,0,0,.025)}
        /* Fila 1: identidad (remito + cliente) | acciones */
        .logi-card-row1{display:flex;align-items:flex-start;gap:6px}
        .logi-card-id{flex:1;min-width:0}
        .logi-card-remito{font-weight:800;font-size:13px;color:var(--txt);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.25}
        .logi-card-client{font-weight:600;font-size:12px;color:var(--txt2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.3;margin-top:1px}
        .logi-card-acts{flex-shrink:0;display:flex;gap:3px;align-items:center}
        .logi-card-act{width:28px;height:28px;border-radius:50%;border:none;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;font-size:11px;font-family:inherit;-webkit-tap-highlight-color:transparent;transition:transform .1s}
        .logi-card-act:active{transform:scale(.88)}
        .logi-card-act-wa{background:#DCFCE7;color:#16A34A}
        .logi-card-act-trk{background:#EFF6FF;color:#2563EB}
        .logi-card-act-edit{background:var(--surface2);color:var(--txt2)}
        .logi-card-act-del{background:#FEF2F2;color:#DC2626}
        /* Fila 2: metadatos tiny (presupuesto · ciudad · transporte) */
        .logi-card-meta{font-size:10px;color:#9CA3AF;font-weight:500;letter-spacing:.2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        /* Fila 3: specs técnicos | estado + alerta */
        .logi-card-row3{display:flex;align-items:center;gap:4px;min-width:0}
        .logi-card-specs{flex:1;min-width:0;display:flex;align-items:center;gap:0;font-size:11px;color:#6B7280;overflow:hidden}
        .logi-card-spec{flex-shrink:0;white-space:nowrap}
        .logi-card-spec+.logi-card-spec::before{content:'·';margin:0 4px;color:#D1D5DB;font-weight:400}
        .logi-card-spec-price{font-weight:700;color:var(--txt)!important}
        .logi-card-status-wrap{flex-shrink:0;display:flex;align-items:center;gap:5px;margin-left:auto}
        .logi-card-late{font-size:10px;color:#DC2626;font-weight:700;white-space:nowrap;display:flex;align-items:center;gap:2px}
        @media(max-width:767px){
          .logi-ph{display:none!important}
          .logi-mob-tabs{display:flex!important}
          .logi-tab-add{display:inline-flex}
          .logi-tab-bar-scroll{overflow-x:auto;white-space:nowrap;scrollbar-width:none;-webkit-overflow-scrolling:touch}
          .logi-tab-bar-scroll::-webkit-scrollbar{display:none}
          .logi-tab-bar-scroll .tab-btn{flex-shrink:0;font-size:11px!important;white-space:nowrap}
          .logi-desk-only{display:none!important}
          .logi-mob-list{display:flex}
          .logi-tariff-grid{grid-template-columns:1fr!important}
          .logi-summary-grid{grid-template-columns:1fr!important}
        }
        @media(min-width:768px){
          .logi-mob-list{display:none!important}
          .logi-mob-tabs{display:none!important}
        }
        /* Circular action buttons — desktop table */
        .logi-act-circ{width:28px;height:28px;border-radius:50%;border:none;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;font-size:11px;font-family:inherit;background:var(--surface2);color:var(--txt2);transition:box-shadow .15s,transform .1s;flex-shrink:0}
        .logi-act-circ:hover{box-shadow:0 2px 8px rgba(0,0,0,.14)}
        .logi-act-circ:active{transform:scale(.88)}
        .logi-act-circ.wa{background:#DCFCE7;color:#16A34A}
        .logi-act-circ.trk{background:#EFF6FF;color:#2563EB}
        .logi-act-circ.del{background:#FEF2F2;color:#DC2626}
        /* Status quick-select */
        .logi-status-sel{border-radius:20px;padding:3px 22px 3px 9px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;outline:none;appearance:none;-webkit-appearance:none;background-repeat:no-repeat;background-position:right 7px center;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5' viewBox='0 0 8 5'%3E%3Cpath fill='%236B7280' d='M0 0l4 5 4-5z'/%3E%3C/svg%3E")}
      `}</style>

      {/* Header desktop — hidden on mobile */}
      <div className="ph logi-ph" style={{ alignItems: 'center' }}>
        <div className="ph-right" style={{ gap: 6 }}>
          <div className="logi-cli-pill-group">
            {['envios', 'cotizar', 'resumen'].map(t => (
              <button key={t} className={`logi-cli-pill${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
                {t === 'envios' ? 'Envíos' : t === 'cotizar' ? 'Cotizar' : 'Resumen'}
              </button>
            ))}
          </div>
          <button className="logi-cli-new" onClick={() => openShip()}>
            <i className="fa fa-plus" /><span>Registrar envío</span>
          </button>
        </div>
      </div>

      {/* Tab bar — solo mobile: scrollable con "+ Envío" al final */}
      <div className="tab-bar logi-tab-bar-scroll logi-mob-tabs" style={{ gap: 0 }}>
        {['envios', 'cotizar', 'resumen'].map(t => (
          <div key={t} className={`tab-btn ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t === 'envios' ? 'Envíos' : t === 'cotizar' ? 'Cotizar' : 'Resumen'}
          </div>
        ))}
        <button className="logi-tab-add" onClick={() => openShip()}>
          <i className="fa fa-plus" /> Envío
        </button>
      </div>

      {/* ── TAB ENVÍOS ─────────────────────────────────────────────── */}
      {tab === 'envios' && (
        <>
          {lateShipments.length > 0 && !lateAlertDismissed && (
            <div style={{ background: 'rgba(220,38,38,.08)', border: '1.5px solid rgba(220,38,38,.3)', borderRadius: 10, padding: '10px 14px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <i className="fa fa-triangle-exclamation" style={{ color: '#DC2626', fontSize: 14 }} />
              <div style={{ flex: 1, fontSize: 12 }}>
                <b style={{ color: '#DC2626' }}>{lateShipments.length} envío{lateShipments.length !== 1 ? 's' : ''} atrasado{lateShipments.length !== 1 ? 's' : ''}</b>
                <span style={{ color: 'var(--txt3)', marginLeft: 6 }}>· Despachado/En tránsito hace más de lo esperado</span>
              </div>
              <button className="btn btn-secondary btn-xs" onClick={() => setSFilter('Despachado')}>Ver atrasados</button>
              <button onClick={dismissLateAlert} title="Cerrar alerta" style={{ background: 'none', border: 'none', color: '#DC2626', cursor: 'pointer', padding: '2px 6px', borderRadius: 4, fontSize: 14, opacity: 0.7 }}><i className="fa fa-xmark" /></button>
            </div>
          )}

          {/* Search */}
          <div style={{ marginBottom: 6 }}>
            <div className="search-row logi-search-row" style={{ maxWidth: 400 }}>
              <i className="fa fa-magnifying-glass" style={{ color: 'var(--txt3)', fontSize: 13 }} />
              <input
                type="text" placeholder="Buscar remito, cliente, ciudad…"
                value={search} onChange={e => setSearch(e.target.value)}
                style={{ border: 'none', outline: 'none', background: 'transparent', flex: 1, fontSize: 13 }}
              />
              {search && <i className="fa fa-xmark" style={{ cursor: 'pointer', color: 'var(--txt3)' }} onClick={() => setSearch('')} />}
            </div>
          </div>
          {/* Status pills — fila única con scroll */}
          <div className="logi-pills-row" style={{ marginBottom: 10 }}>
            <div className={`pill ${sFilter === 'all' ? 'active' : ''}`} onClick={() => setSFilter('all')}>Todos</div>
            {statusList.map(s => (
              <div key={s} className={`pill ${sFilter === s ? 'active' : ''}`} onClick={() => setSFilter(s)}>{s}</div>
            ))}
          </div>

          {/* ── KPI strip ── */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            {[
              { label: 'Envíos hoy',  val: todayCount,          icon: 'fa-truck-fast',           color: 'var(--brand)' },
              { label: 'Pendientes',  val: pendingCount,         icon: 'fa-box',                  color: '#D97706' },
              { label: 'Atrasados',   val: lateShipments.length, icon: 'fa-triangle-exclamation',  color: '#DC2626' },
            ].map(k => (
              <div key={k.label} className="card" style={{ flex: 1, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <i className={`fa ${k.icon}`} style={{ color: k.val > 0 ? k.color : 'var(--txt4)', fontSize: 16, flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{k.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: k.val > 0 ? k.color : 'var(--txt)', lineHeight: 1.2 }}>{k.val}</div>
                </div>
              </div>
            ))}
          </div>

          {/* ── MOBILE CARD LIST (≤767px) ── */}
          <div className="logi-mob-list">
            {filteredShips.length ? filteredShips.map(s => {
              const bud = budgets.find(b => b.id === s.budgetId)
              const late = isLate(s)
              const days = daysSince(s.date)
              const notifyLink = notifyStatusChange(s, s.status)
              const payerChip = s.payer === 'El cliente' ? 'Cliente paga' : s.payer === 'Incluido en precio' ? 'Incluido' : null
              return (
                <div
                  key={s.id}
                  className={`logi-card${late ? ' late' : ''}`}
                  onClick={() => openShip(s)}
                >
                  {/* Badge estado — esquina superior derecha */}
                  <div style={{ position: 'absolute', top: 12, right: 12 }} onClick={e => e.stopPropagation()}>
                    {statusBadge(s.status)}
                  </div>

                  {/* Fila 1: Remito + Cliente | Acciones */}
                  <div className="logi-card-row1">
                    <div className="logi-card-id">
                      <div className="logi-card-remito">
                        {s.remito || <span style={{ color: 'var(--txt3)', fontWeight: 400 }}>Sin remito</span>}
                      </div>
                      {s.client && <div className="logi-card-client">{s.client}</div>}
                    </div>
                    <div className="logi-card-acts" onClick={e => e.stopPropagation()} style={{ marginRight: 72 }}>
                      {notifyLink && (
                        <button className="logi-card-act logi-card-act-wa" title="Avisar al cliente" onClick={() => window.open(notifyLink, '_blank')}>
                          <i className="fa-brands fa-whatsapp" />
                        </button>
                      )}
                      {s.trackingUrl && (
                        <button className="logi-card-act logi-card-act-trk" title="Ver seguimiento" onClick={() => window.open(getTrackingUrl(s.carrier, s.trackingUrl), '_blank')}>
                          <i className="fa fa-location-arrow" />
                        </button>
                      )}
                      <button className="logi-card-act logi-card-act-edit" title="Editar" onClick={() => openShip(s)}>
                        <i className="fa fa-pen" />
                      </button>
                      <button className="logi-card-act logi-card-act-del" title="Eliminar" onClick={() => delShip(s.id)}>
                        <i className="fa fa-trash" />
                      </button>
                    </div>
                  </div>

                  {/* Fila 2: Metadatos tiny — presupuesto · ciudad · transporte */}
                  {[bud?.num, s.city, s.carrier || s.service].some(Boolean) && (
                    <div className="logi-card-meta">
                      {[bud?.num, s.city, s.carrier || s.service].filter(Boolean).join(' · ')}
                    </div>
                  )}

                  {/* Fila 3: Specs técnicos | Alerta atrasado */}
                  <div className="logi-card-row3">
                    <div className="logi-card-specs">
                      {s.bulks > 0 && <span className="logi-card-spec">{s.bulks} bulto{s.bulks !== 1 ? 's' : ''}</span>}
                      {s.weight && <span className="logi-card-spec">{s.weight} kg</span>}
                      <span className="logi-card-spec logi-card-spec-price">{fmt(s.freight)}</span>
                      {payerChip && <span className="logi-card-spec">{payerChip}</span>}
                    </div>
                    {late && (
                      <span className="logi-card-late">
                        <span className="ins-led-pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: '#DC2626', display: 'inline-block', flexShrink: 0 }} />
                        <i className="fa fa-triangle-exclamation" /> {days}d
                      </span>
                    )}
                  </div>
                </div>
              )
            }) : (
              <div className="empty">
                <div className="ico"><i className="fa fa-truck-fast" /></div>
                <p>{search || sFilter !== 'all' ? 'Sin resultados para el filtro aplicado' : 'Sin envíos registrados'}</p>
              </div>
            )}
          </div>

          {/* ── DESKTOP TABLE (≥768px) — 7 columnas ── */}
          <div className="logi-desk-only">
            <div className="tbl-card logistica-tbl">
              <table>
                <thead>
                  <tr>
                    <th>Envío</th>
                    <th>Destinatario</th>
                    <th>Carga</th>
                    <th>Estado</th>
                    <th style={{ textAlign: 'right' }}>Costo</th>
                    <th>Paga</th>
                    <th style={{ textAlign: 'right' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredShips.length ? filteredShips.map(s => {
                    const late = isLate(s)
                    const days = daysSince(s.date)
                    const notifyLink = notifyStatusChange(s, s.status)
                    const cargaTxt = [
                      s.bulks > 0 ? `${s.bulks} bulto${s.bulks !== 1 ? 's' : ''}` : null,
                      s.weight ? `${s.weight} kg` : null,
                    ].filter(Boolean).join(' / ')
                    return (
                      <tr key={s.id} style={{ verticalAlign: 'middle', ...(late ? { background: 'rgba(220,38,38,.03)' } : {}) }}>

                        {/* ENVÍO */}
                        <td style={{ paddingTop: 10, paddingBottom: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
                            <span style={{ fontWeight: 700, fontSize: 13, fontFamily: 'ui-monospace,SFMono-Regular,monospace', letterSpacing: '-.01em' }}>
                              {s.remito || <span style={{ color: 'var(--txt4)', fontWeight: 400, fontFamily: 'inherit' }}>Sin remito</span>}
                            </span>
                            <span style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 400 }}>{fmtDate(s.date)}</span>
                          </div>
                          {['Despachado', 'En tránsito'].includes(s.status) && days > 0 && (
                            <div style={{ marginTop: 3, display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: late ? '#DC2626' : '#9CA3AF', fontWeight: late ? 700 : 400 }}>
                              {late && <span className="ins-led-pulse" style={{ width: 5, height: 5, borderRadius: '50%', background: '#DC2626', display: 'inline-block', flexShrink: 0 }} />}
                              hace {days}d{late ? ' · atrasado' : ''}
                            </div>
                          )}
                        </td>

                        {/* DESTINATARIO */}
                        <td style={{ paddingTop: 10, paddingBottom: 10 }}>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{s.client || '—'}</div>
                          {(s.city || s.carrier) && (
                            <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                              {[s.city, s.carrier].filter(Boolean).join(' · ')}
                            </div>
                          )}
                        </td>

                        {/* CARGA */}
                        <td style={{ fontSize: 12, color: 'var(--txt2)', whiteSpace: 'nowrap' }}>
                          {cargaTxt || '—'}
                        </td>

                        {/* ESTADO — quick-change select */}
                        <td onClick={e => e.stopPropagation()}>
                          <select
                            className="logi-status-sel"
                            value={s.status}
                            onChange={e => { saveEntity('shipments', { ...s, status: e.target.value }); toast('Estado actualizado', 'ok') }}
                            style={STATUS_SELECT_STYLE[s.status] || { background: '#F9FAFB', color: '#374151', border: '1.5px solid #E5E7EB' }}
                          >
                            {statusList.map(st => <option key={st} value={st}>{st}</option>)}
                          </select>
                        </td>

                        {/* COSTO */}
                        <td style={{ textAlign: 'right', fontWeight: 700, fontSize: 13, fontFamily: 'ui-monospace,SFMono-Regular,monospace' }}>{fmt(s.freight)}</td>

                        {/* PAGA */}
                        <td style={{ fontSize: 11, color: 'var(--txt3)', whiteSpace: 'nowrap' }}>{s.payer || '—'}</td>

                        {/* ACCIONES */}
                        <td>
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                            {s.trackingUrl && (
                              <button className="logi-act-circ trk" onClick={() => window.open(getTrackingUrl(s.carrier, s.trackingUrl), '_blank')} title="Ver seguimiento"><i className="fa fa-location-arrow" /></button>
                            )}
                            {notifyLink && (
                              <button className="logi-act-circ wa" onClick={() => window.open(notifyLink, '_blank')} title="WhatsApp"><i className="fa-brands fa-whatsapp" /></button>
                            )}
                            <button className="logi-act-circ" onClick={() => openShip(s)} title="Editar"><i className="fa fa-pen" /></button>
                            <button className="logi-act-circ del" onClick={() => delShip(s.id)} title="Eliminar"><i className="fa fa-trash" /></button>
                          </div>
                        </td>
                      </tr>
                    )
                  }) : (
                    <tr>
                      <td colSpan={7}>
                        <div className="empty">
                          <div className="ico"><i className="fa fa-truck-fast" /></div>
                          <p>{search || sFilter !== 'all' ? 'Sin resultados para el filtro aplicado' : 'Sin envíos registrados'}</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── TAB COTIZAR ────────────────────────────────────────────── */}
      {tab === 'cotizar' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 16, alignItems: 'start' }}>

            {/* ── Panel izquierdo: Selector de cliente ── */}
            <div className="card" style={{ borderRadius: 24, padding: '18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                <i className="fa fa-user" style={{ color: 'var(--brand)', marginRight: 6 }} />Cliente a cotizar
              </div>

              {/* Buscador */}
              <div style={{ position: 'relative' }}>
                <i className="fa fa-magnifying-glass" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--txt4)', fontSize: 11, pointerEvents: 'none', zIndex: 1 }} />
                <input
                  type="text"
                  value={cotizSearch}
                  onChange={e => { setCotizSearch(e.target.value); setCotizClient(null) }}
                  placeholder="Buscar empresa o contacto…"
                  style={{ paddingLeft: 30 }}
                />
              </div>

              {/* Resultados del buscador */}
              {cotizSearch && !cotizClient && cotizFilteredClients.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflowY: 'auto' }}>
                  {cotizFilteredClients.map(c => (
                    <button
                      key={c.id}
                      onClick={() => { setCotizClient(c); setCotizSearch(c.company || c.contact || '') }}
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 12px', cursor: 'pointer', textAlign: 'left', transition: 'border-color .15s, background .15s' }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--brand-xlt)'; e.currentTarget.style.borderColor = 'var(--brand)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface2)'; e.currentTarget.style.borderColor = 'var(--border)' }}>
                      <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--txt)' }}>{c.company || c.contact}</span>
                      {c.company && c.contact && <span style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 1 }}>{c.contact}</span>}
                      {c.wa && <span style={{ fontSize: 11, color: '#16A34A', marginTop: 2 }}><i className="fa-brands fa-whatsapp" style={{ marginRight: 4 }} />{c.wa}</span>}
                    </button>
                  ))}
                </div>
              )}
              {cotizSearch && !cotizClient && cotizFilteredClients.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--txt4)', textAlign: 'center', padding: '12px 0' }}>Sin resultados</div>
              )}

              {/* Cliente seleccionado */}
              {cotizClient && (
                <div style={{ background: '#F0FDF4', border: '1.5px solid #86EFAC', borderRadius: 16, padding: '14px 16px' }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--txt)' }}>{cotizClient.company || cotizClient.contact}</div>
                  {cotizClient.company && cotizClient.contact && <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 2 }}>{cotizClient.contact}</div>}
                  {cotizClient.wa ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 13, fontWeight: 700, color: '#15803D' }}>
                      <i className="fa-brands fa-whatsapp" />
                      <span>{cotizClient.wa}</span>
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: 'var(--amber)', marginTop: 6 }}><i className="fa fa-triangle-exclamation" style={{ marginRight: 4 }} />Sin número de WhatsApp</div>
                  )}
                  <button
                    onClick={() => { setCotizClient(null); setCotizSearch('') }}
                    style={{ marginTop: 10, fontSize: 11, color: 'var(--txt3)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <i className="fa fa-xmark" />Cambiar cliente
                  </button>
                </div>
              )}

              {!cotizClient && !cotizSearch && (
                <div style={{ fontSize: 12, color: 'var(--txt4)', textAlign: 'center', padding: '16px 0', lineHeight: 1.6 }}>
                  Buscá un cliente para activar el envío directo por WhatsApp
                </div>
              )}
            </div>

            {/* ── Panel derecho: Herramientas ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* Cotizadores oficiales */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '1px', flexShrink: 0 }}>
                  <i className="fa fa-arrow-up-right-from-square" style={{ marginRight: 6 }} />Cotizar en:
                </span>
                {[
                  { name: 'OCA', url: 'https://www.oca.com.ar', cls: 'b-blue' },
                  { name: 'Vía Cargo', url: 'https://www.viacargo.com.ar', cls: 'b-confirmed' },
                  { name: 'Andreani', url: 'https://www.andreani.com', cls: 'b-purple' },
                  { name: 'Correo Argentino', url: 'https://www.correoargentino.com.ar', cls: 'b-amber' },
                ].map(c => (
                  <a key={c.name} href={c.url} target="_blank" rel="noreferrer"
                    className={`badge ${c.cls}`}
                    style={{ fontSize: 12, padding: '6px 14px', borderRadius: 12, fontWeight: 700, textDecoration: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <i className="fa fa-globe" style={{ fontSize: 10 }} />
                    {c.name}
                  </a>
                ))}
              </div>

              {/* Botón WhatsApp dinámico */}
              <button
                onClick={() => {
                  const msg = '¡Hola! El costo de envío para tu pedido es de $________ a través de ________. Recordá que el flete se abona al recibir / en origen. ¡Cualquier duda me avisás!'
                  if (cotizClient?.wa) {
                    const num = cotizClient.wa.replace(/\D/g, '')
                    window.open(`https://api.whatsapp.com/send?phone=${num}&text=${encodeURIComponent(msg)}`, '_blank')
                  } else {
                    navigator.clipboard.writeText(msg)
                    window.open('https://web.whatsapp.com/', '_blank')
                    toast('Texto copiado. Seleccioná el contacto en WhatsApp Web.', 'ok')
                  }
                }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  background: cotizClient?.wa ? '#16A34A' : '#F0FDF4',
                  border: `2px solid ${cotizClient?.wa ? '#15803D' : '#86EFAC'}`,
                  color: cotizClient?.wa ? '#fff' : '#15803D',
                  borderRadius: 20, padding: '16px 24px', fontSize: 15, fontWeight: 800,
                  cursor: 'pointer', width: '100%', transition: 'all .2s',
                }}>
                <i className="fa-brands fa-whatsapp" style={{ fontSize: 18 }} />
                {cotizClient?.wa
                  ? `Enviar cotización a ${cotizClient.company || cotizClient.contact}`
                  : 'Abrir WhatsApp Web + Copiar texto'}
              </button>

              {/* Vista previa del mensaje */}
              <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 16, padding: '12px 16px' }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--txt4)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 6 }}>
                  <i className="fa fa-eye" style={{ marginRight: 5 }} />Vista previa del mensaje
                </div>
                <p style={{ fontSize: 12, color: 'var(--txt2)', lineHeight: 1.65, margin: 0, fontStyle: 'italic' }}>
                  "¡Hola! El costo de envío para tu pedido es de $________ a través de ________. Recordá que el flete se abona al recibir / en origen. ¡Cualquier duda me avisás!"
                </p>
              </div>

            </div>
          </div>

          {/* ── Mis Datos de Despacho ── */}
          <div style={{ marginTop: 12, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: '14px 18px' }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 12 }}>
              <i className="fa fa-box-archive" style={{ marginRight: 6, color: 'var(--brand)' }} />Mis Datos de Despacho
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200, display: 'flex', gap: 8, alignItems: 'center' }}>
                <i className="fa fa-location-dot" style={{ color: 'var(--txt4)', fontSize: 12, flexShrink: 0 }} />
                <input
                  type="text"
                  value={despachoDir}
                  onChange={e => { setDespachoDir(e.target.value); localStorage.setItem('anma_desp_dir', e.target.value) }}
                  placeholder="Dirección de retiro…"
                  style={{ flex: 1, fontSize: 12 }}
                />
                <button
                  onClick={() => { if (despachoDir) { navigator.clipboard.writeText(despachoDir); toast('Dirección copiada ✓', 'ok') } }}
                  title="Copiar dirección"
                  style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--txt3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <i className="fa fa-copy" style={{ fontSize: 11 }} />
                </button>
              </div>
              <div style={{ flex: '0 0 220px', display: 'flex', gap: 8, alignItems: 'center' }}>
                <i className="fa fa-id-card" style={{ color: 'var(--txt4)', fontSize: 12, flexShrink: 0 }} />
                <input
                  type="text"
                  value={despachoCUIT}
                  onChange={e => { setDespachoCUIT(e.target.value); localStorage.setItem('anma_desp_cuit', e.target.value) }}
                  placeholder="CUIT…"
                  style={{ flex: 1, fontSize: 12 }}
                />
                <button
                  onClick={() => { if (despachoCUIT) { navigator.clipboard.writeText(despachoCUIT); toast('CUIT copiado ✓', 'ok') } }}
                  title="Copiar CUIT"
                  style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--txt3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <i className="fa fa-copy" style={{ fontSize: 11 }} />
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── TAB RESUMEN ────────────────────────────────────────────── */}
      {tab === 'resumen' && (
        <>
          {/* Export button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button className="btn btn-sm" onClick={() => window.print()}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface2)', border: '1.5px solid var(--border)', color: 'var(--txt2)', borderRadius: 10, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              <i className="fa fa-file-arrow-down" style={{ fontSize: 13 }} />
              Descargar reporte
            </button>
          </div>

          {/* KPI cards */}
          <div className="kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
            {/* Costo total — with trend */}
            <div className="card" style={{ padding: 16, borderRadius: 24, boxShadow: '0 1px 4px rgba(0,0,0,.07)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Costo total envíos</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--money)' }}>{fmt(totalShipCost)}</div>
              {trendPct !== null && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 5, fontSize: 11, fontWeight: 700, color: trendPct > 0 ? '#DC2626' : '#10B981' }}>
                  <i className={`fa fa-arrow-${trendPct > 0 ? 'up' : 'down'}`} style={{ fontSize: 9 }} />
                  {Math.abs(trendPct)}% vs mes pasado
                </div>
              )}
              {trendPct === null && <div style={{ fontSize: 10, color: 'var(--txt4)', marginTop: 5 }}>Sin datos previos</div>}
            </div>

            {/* Envíos este mes */}
            <div className="card" style={{ padding: 16, borderRadius: 24, boxShadow: '0 1px 4px rgba(0,0,0,.07)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Envíos este mes</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--txt)' }}>{thisMonth}</div>
            </div>

            {/* Promedio por envío */}
            <div className="card" style={{ padding: 16, borderRadius: 24, boxShadow: '0 1px 4px rgba(0,0,0,.07)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Promedio por envío</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--money)' }}>{fmt(avgCost)}</div>
            </div>

            {/* Atrasados */}
            <div className="card" style={{ padding: 16, borderRadius: 24, boxShadow: '0 1px 4px rgba(0,0,0,.07)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Atrasados</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: lateShipments.length > 0 ? '#DC2626' : 'var(--txt)' }}>{lateShipments.length}</div>
              <div style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 3 }}>{lateShipments.length > 0 ? 'Despachado/En tránsito > SLA' : 'Todo al día'}</div>
            </div>

            {/* Desvíos de flete — red bg when > 0 */}
            <div className="card" style={{ padding: 16, borderRadius: 24, boxShadow: '0 1px 4px rgba(0,0,0,.07)', background: varianceCount > 0 ? '#FEF2F2' : undefined, border: varianceCount > 0 ? '1.5px solid #FCA5A5' : undefined }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: varianceCount > 0 ? '#991B1B' : 'var(--txt3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Desvíos de flete</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: varianceCount > 0 ? '#DC2626' : 'var(--txt)' }}>{varianceCount}</div>
              <div style={{ fontSize: 10, color: varianceCount > 0 ? '#B91C1C' : 'var(--txt3)', marginTop: 3 }}>{varianceCount > 0 ? 'Real ≠ cobrado al cliente' : 'Coincide con lo cobrado'}</div>
            </div>
          </div>

          <div className="logi-summary-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* Desglose por estado — donut + legend */}
            <div className="card" style={{ borderRadius: 24, boxShadow: '0 1px 4px rgba(0,0,0,.07)', padding: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt2)', textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: 14 }}>Desglose por estado</div>
              {byStatus.filter(b => b.count > 0).length ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                  <DonutChart data={byStatus.filter(b => b.count > 0)} hovered={hoveredStatus} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7, flex: 1, minWidth: 0 }}>
                    {byStatus.filter(b => b.count > 0).map(b => (
                      <div key={b.label} onMouseEnter={() => setHoveredStatus(b.label)} onMouseLeave={() => setHoveredStatus(null)}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 8px', borderRadius: 10, cursor: 'default', transition: 'background .12s', background: hoveredStatus === b.label ? 'var(--surface2)' : 'transparent' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: DONUT_COLORS[b.label] || '#CBD5E1', flexShrink: 0, display: 'inline-block' }} />
                          <span style={{ fontSize: 11, color: 'var(--txt2)', fontWeight: hoveredStatus === b.label ? 700 : 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.label}</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--money)' }}>{fmt(b.cost)}</span>
                          <span style={{ fontSize: 10, color: 'var(--txt4)' }}>{b.count} env.</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--txt3)', padding: '12px 0', textAlign: 'center' }}>Sin envíos registrados</div>
              )}
            </div>

            {/* Costo por mes — taller bars */}
            <div className="card" style={{ borderRadius: 24, boxShadow: '0 1px 4px rgba(0,0,0,.07)', padding: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt2)', textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: 14 }}>Costo por mes (últimos 6 meses)</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {monthlyData.map((m, idx) => {
                  const isLast = idx === monthlyData.length - 1
                  const pct = maxCost > 0 ? Math.min(100, Math.max(0, (m.cost / maxCost) * 100)) : 0
                  return (
                    <div key={m.ym}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, marginBottom: 4 }}>
                        <span style={{ color: isLast ? 'var(--txt)' : 'var(--txt2)', fontWeight: isLast ? 700 : 500, textTransform: 'capitalize' }}>{m.label}</span>
                        <span style={{ fontWeight: 700, color: m.cost ? 'var(--money)' : 'var(--txt4)', fontFamily: 'ui-monospace,SFMono-Regular,monospace', fontSize: 12 }}>
                          {m.cost ? fmt(m.cost) : '—'}
                          {m.count > 0 && <span style={{ fontWeight: 400, color: 'var(--txt4)', fontSize: 10, marginLeft: 4 }}>({m.count})</span>}
                        </span>
                      </div>
                      <div style={{ height: 10, background: 'var(--surface2)', borderRadius: 6, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: isLast ? 'var(--brand)' : 'var(--acento)', borderRadius: 6, transition: 'width .5s ease', minWidth: pct > 0 ? 6 : 0 }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── MODAL ──────────────────────────────────────────────────── */}
      {modal && (
        <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) setModal(false) }}>
          <div className="modal ship-modal" style={{ maxWidth: 600, maxHeight: 'calc(100vh - 48px)', display: 'flex', flexDirection: 'column', padding: 0 }}
               onKeyDown={e => { if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && (form.remito || form.client)) saveShip() }}>
            <div className="mh" style={{ padding: '18px 22px 12px', borderBottom: '1px solid var(--border)', margin: 0, flexShrink: 0 }}>
              <h3>{form.id ? 'Editar envío' : 'Registrar envío'}</h3>
              <button className="mclose" onClick={() => setModal(false)}><i className="fa fa-xmark" /></button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 22px' }}>

            <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '14px 16px', marginBottom: 10, border: '1.5px solid var(--border)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: 10 }}>
                <i className="fa fa-file-lines" style={{ marginRight: 6, color: 'var(--brand)' }} />Datos del envío
              </div>
              <div className="grid2">
                <div className="fg" style={{ marginBottom: 10 }}>
                  <label>Presupuesto asociado</label>
                  <select value={form.budgetId || ''} onChange={e => onBudgetChange(e.target.value)}>
                    <option value="">Sin asociar</option>
                    {budgets.map(b => <option key={b.id} value={b.id}>{b.num} — {b.company || b.contact}</option>)}
                  </select>
                </div>
                <div className="fg" style={{ marginBottom: 10 }}>
                  <label>N° Remito</label>
                  <input type="text" value={form.remito || ''} onChange={e => setF('remito', e.target.value)} placeholder="VC-001234" />
                </div>
                <div className="fg" style={{ marginBottom: 10 }}>
                  <label>Fecha</label>
                  <input type="date" value={form.date || ''} onChange={e => setF('date', e.target.value)} />
                </div>
                <div className="fg" style={{ marginBottom: 10 }}>
                  <label>Estado</label>
                  <select value={form.status || 'Preparando'} onChange={e => setF('status', e.target.value)}>
                    {statusList.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div className="fg" style={{ marginBottom: 10 }}>
                  <label>Servicio</label>
                  <select value={form.service || 'Estándar'} onChange={e => setF('service', e.target.value)}>
                    {Object.keys(SERVICE_MULTIPLIER).map(s => (
                      <option key={s}>{s}{SERVICE_MULTIPLIER[s] !== 1 ? ` (×${SERVICE_MULTIPLIER[s]})` : ''}</option>
                    ))}
                  </select>
                </div>
                <div className="fg" style={{ marginBottom: 10 }}>
                  <label>Empresa de envío</label>
                  <input type="text" list="carriers-list" value={form.carrier || ''} onChange={e => setF('carrier', e.target.value)} placeholder="Vía Cargo…" autoComplete="off" />
                  <datalist id="carriers-list">{CARRIERS.map(c => <option key={c} value={c} />)}</datalist>
                </div>
                <div className="fg" style={{ marginBottom: 0 }}>
                  <label>N° Seguimiento / URL</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input type="text" value={form.trackingUrl || ''} onChange={e => setF('trackingUrl', e.target.value)} placeholder="Código o URL de tracking…" style={{ flex: 1 }} />
                    {trackingLink && (
                      <button className="btn btn-secondary btn-sm" style={{ flexShrink: 0, padding: '0 10px' }} onClick={() => window.open(trackingLink, '_blank')} title="Abrir seguimiento en línea">
                        <i className="fa fa-arrow-up-right-from-square" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '14px 16px', marginBottom: 10, border: '1.5px solid var(--border)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                <i className="fa fa-location-dot" style={{ color: 'var(--brand)' }} />Destinatario
                {form.budgetId && <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--green)', background: '#F0FDF4', padding: '1px 8px', borderRadius: 10 }}>Auto-completado del presupuesto</span>}
              </div>
              <div className="grid2">
                <div className="fg" style={{ marginBottom: 10 }}>
                  <label>Cliente</label>
                  <input type="text" value={form.client || ''} onChange={e => setF('client', e.target.value)} placeholder="Nombre del cliente" />
                </div>
                <div className="fg" style={{ marginBottom: 10 }}>
                  <label>Ciudad destino</label>
                  <input type="text" value={form.city || ''} onChange={e => setF('city', e.target.value)} placeholder="Córdoba Capital" />
                </div>
              </div>
              <div className="fg" style={{ marginBottom: 0 }}>
                <label>Dirección de entrega</label>
                <input type="text" value={form.addr || ''} onChange={e => setF('addr', e.target.value)} placeholder="Av. Colón 1234, B° Centro" />
              </div>
              {estimatedArrival && (
                <div style={{ marginTop: 10, background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#065F46', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <i className="fa fa-calendar-check" style={{ color: '#16A34A' }} />
                  Llegada estimada: <b style={{ textTransform: 'capitalize' }}>{estimatedArrival}</b>
                </div>
              )}
            </div>

            <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '14px 16px', marginBottom: 10, border: '1.5px solid var(--border)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: 10 }}>
                <i className="fa fa-box" style={{ marginRight: 6, color: 'var(--brand)' }} />Paquete
              </div>
              <div className="grid2">
                <div className="fg" style={{ marginBottom: 0 }}>
                  <label>Bultos</label>
                  <input type="number" value={form.bulks || 1} onChange={e => setF('bulks', Number(e.target.value))} min="1" />
                </div>
                <div className="fg" style={{ marginBottom: 0 }}>
                  <label>Peso (kg)</label>
                  <input type="number" value={form.weight || ''} onChange={e => setF('weight', e.target.value)} placeholder="0" step="0.1" />
                </div>
              </div>
            </div>

            <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '14px 16px', marginBottom: 10, border: '1.5px solid var(--border)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: 10 }}>
                <i className="fa fa-dollar-sign" style={{ marginRight: 6, color: 'var(--brand)' }} />Finanzas
              </div>
              {fleteEstimado !== null && (
                <div style={{ background: '#EFF6FF', border: '1.5px solid #93C5FD', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontSize: 12, color: 'var(--txt2)' }}>
                    <i className="fa fa-calculator" style={{ marginRight: 6, color: '#3B82F6' }} />
                    Flete estimado · <b>{form.service}</b>
                    {(SERVICE_MULTIPLIER[form.service] || 1) !== 1 && (
                      <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: '#3B82F6', background: '#DBEAFE', padding: '1px 6px', borderRadius: 8 }}>
                        ×{SERVICE_MULTIPLIER[form.service]}
                      </span>
                    )}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 18, fontWeight: 800, color: '#1D4ED8' }}>{fmt(fleteEstimado)}</span>
                    <button className="btn btn-primary btn-sm" style={{ padding: '3px 10px', fontSize: 11 }} onClick={() => setF('freight', fleteEstimado)}>
                      Usar
                    </button>
                  </div>
                </div>
              )}
              <div className="grid2">
                <div className="fg" style={{ marginBottom: marginImpact !== null ? 10 : 0 }}>
                  <label>Costo flete ($)</label>
                  <input type="number" value={form.freight || 0} onChange={e => setF('freight', Number(e.target.value))} />
                </div>
                <div className="fg" style={{ marginBottom: marginImpact !== null ? 10 : 0 }}>
                  <label>¿Quién paga el flete?</label>
                  <select value={form.payer || 'Mi negocio'} onChange={e => setF('payer', e.target.value)}>
                    <option>Mi negocio</option>
                    <option>El cliente</option>
                    <option>Incluido en precio</option>
                  </select>
                </div>
              </div>
              {marginImpact !== null && (
                <div style={{ background: marginImpact >= 0 ? '#F0FDF4' : '#FFF1F2', border: `1.5px solid ${marginImpact >= 0 ? '#86EFAC' : '#FCA5A5'}`, borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: 'var(--txt2)' }}>
                    <i className="fa fa-chart-line" style={{ marginRight: 6, color: marginImpact >= 0 ? '#16A34A' : '#DC2626' }} />
                    Ganancia neta del presupuesto <span style={{ fontSize: 10, color: 'var(--txt3)' }}>(después del flete)</span>
                  </span>
                  <span style={{ fontSize: 18, fontWeight: 800, color: marginImpact >= 0 ? '#16A34A' : '#DC2626' }}>
                    {fmt(marginImpact)}
                  </span>
                </div>
              )}
            </div>

            <div className="fg" style={{ marginBottom: 0 }}>
              <label>Notas</label>
              <textarea value={form.notes || ''} onChange={e => setF('notes', e.target.value)} rows={2} placeholder="Observaciones, instrucciones de entrega…" />
            </div>
            </div>

            <div className="mfooter" style={{ padding: '12px 22px 16px', borderTop: '1px solid var(--border)', margin: 0, flexShrink: 0, background: 'var(--surface)' }}>
              <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancelar</button>
              {trackingLink && (
                <button
                  className="btn btn-secondary"
                  style={{ background: '#25D366', color: '#fff', border: 'none' }}
                  onClick={sendTrackingWA}
                  title="Enviar link de seguimiento al cliente por WhatsApp"
                >
                  <i className="fa-brands fa-whatsapp" /> Enviar seguimiento
                </button>
              )}
              <button className="btn btn-primary" onClick={saveShip}>
                <i className="fa fa-floppy-disk" /> Guardar envío
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
