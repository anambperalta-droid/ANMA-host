import { useState, useMemo } from 'react'
import { useData } from '../../context/DataContext'
import { useToast } from '../../context/ToastContext'
import { fmt } from '../../lib/storage'

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
  const [tzForm, setTzForm] = useState({ zone: '', carrier: '', ppkg: '', min: '', days: '', notes: '' })
  const [calcZone, setCalcZone] = useState('')
  const [calcKg, setCalcKg] = useState('')
  const [lateAlertDismissed, setLateAlertDismissed] = useState(() => {
    try { return sessionStorage.getItem('logistica_late_dismissed') === '1' } catch { return false }
  })
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

  const addTariff = () => {
    if (!tzForm.zone) { toast('Ingresá la zona.', 'er'); return }
    saveEntity('tariffs', { ...tzForm, ppkg: Number(tzForm.ppkg), min: Number(tzForm.min), days: Number(tzForm.days) })
    setTzForm({ zone: '', carrier: '', ppkg: '', min: '', days: '', notes: '' })
    toast('Tarifa agregada', 'ok')
  }
  const delTariff = (id) => { deleteEntity('tariffs', id); toast('Tarifa eliminada', 'in') }

  const calcFrete = () => {
    const t = tariffs.find(x => x.zone === calcZone)
    if (!t || !calcKg) return null
    return Math.max(t.min || 0, (t.ppkg || 0) * Number(calcKg))
  }

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
        .logi-cli-pill-group{display:inline-flex;align-items:center;border:1px solid #E5E7EB;border-radius:9px;overflow:hidden;background:#F9FAFB}
        .logi-cli-pill{display:inline-flex;align-items:center;gap:4px;padding:5px 10px;background:transparent;border:none;cursor:pointer;font-family:inherit;font-size:11px;font-weight:500;color:#6B7280;line-height:1;transition:background .12s,color .12s;white-space:nowrap;-webkit-tap-highlight-color:transparent}
        .logi-cli-pill+.logi-cli-pill{border-left:1px solid #E5E7EB}
        .logi-cli-pill:hover{background:#F3F4F6;color:#374151}
        .logi-cli-pill.active{background:#F3F4F6!important;color:#111827!important;font-weight:700!important}
        .logi-cli-new{display:inline-flex;align-items:center;gap:5px;padding:6px 12px;background:var(--brand);border:none;border-radius:9px;cursor:pointer;font-family:inherit;font-size:11px;font-weight:700;color:#fff;line-height:1;transition:opacity .15s,transform .1s;white-space:nowrap;-webkit-tap-highlight-color:transparent}
        .logi-cli-new:hover{opacity:.88}
        .logi-cli-new:active{opacity:.76;transform:scale(.96)}
        .logi-cli-new i{font-size:11px}
        /* Tab bar — solo mobile */
        .logi-mob-tabs{display:none}
        /* Search row estilizado */
        .logi-search-row{background:#F9FAFB!important;border:1px solid #E5E7EB!important;box-shadow:none!important;border-radius:9999px!important;height:34px!important}
        .logi-pills-row{display:flex;gap:6px;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;align-items:center;padding-bottom:1px}
        .logi-pills-row::-webkit-scrollbar{display:none}
        /* Mobile cards */
        .logi-mob-list{display:none;flex-direction:column}
        .logi-card{display:flex;flex-direction:column;gap:4px;border-bottom:1px solid var(--border);padding:11px 0;-webkit-tap-highlight-color:transparent;transition:background .1s;cursor:pointer}
        .logi-card:last-child{border-bottom:none}
        .logi-card:active{background:rgba(0,0,0,.025)}
        /* Fila 1: identidad (remito + cliente) | acciones */
        .logi-card-row1{display:flex;align-items:flex-start;gap:6px}
        .logi-card-id{flex:1;min-width:0}
        .logi-card-remito{font-weight:800;font-size:13px;color:var(--txt);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.25}
        .logi-card-client{font-weight:600;font-size:12px;color:var(--txt2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.3;margin-top:1px}
        .logi-card-acts{flex-shrink:0;display:flex;gap:3px;align-items:center}
        .logi-card-act{width:28px;height:28px;border-radius:8px;border:none;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;font-size:11px;font-family:inherit;-webkit-tap-highlight-color:transparent;transition:transform .1s}
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
      `}</style>

      {/* Header desktop — hidden on mobile */}
      <div className="ph logi-ph" style={{ alignItems: 'center' }}>
        <div className="ph-left"><h2>Logística</h2></div>
        <div className="ph-right" style={{ gap: 6 }}>
          <div className="logi-cli-pill-group">
            {['envios', 'tarifas', 'resumen'].map(t => (
              <button key={t} className={`logi-cli-pill${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
                {t === 'envios' ? 'Envíos' : t === 'tarifas' ? 'Tarifas' : 'Resumen'}
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
        {['envios', 'tarifas', 'resumen'].map(t => (
          <div key={t} className={`tab-btn ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t === 'envios' ? 'Envíos' : t === 'tarifas' ? 'Tarifas' : 'Resumen'}
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
                  className="logi-card"
                  onClick={() => openShip(s)}
                  style={late ? { background: 'rgba(220,38,38,.03)' } : undefined}
                >
                  {/* Fila 1: Remito + Cliente | Acciones */}
                  <div className="logi-card-row1">
                    <div className="logi-card-id">
                      <div className="logi-card-remito">
                        {s.remito || <span style={{ color: 'var(--txt3)', fontWeight: 400 }}>Sin remito</span>}
                      </div>
                      {s.client && <div className="logi-card-client">{s.client}</div>}
                    </div>
                    <div className="logi-card-acts" onClick={e => e.stopPropagation()}>
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

                  {/* Fila 3: Specs técnicos | Estado + Alerta */}
                  <div className="logi-card-row3">
                    <div className="logi-card-specs">
                      {s.bulks > 0 && <span className="logi-card-spec">{s.bulks} bulto{s.bulks !== 1 ? 's' : ''}</span>}
                      {s.weight && <span className="logi-card-spec">{s.weight} kg</span>}
                      <span className="logi-card-spec logi-card-spec-price">{fmt(s.freight)}</span>
                      {payerChip && <span className="logi-card-spec">{payerChip}</span>}
                    </div>
                    <div className="logi-card-status-wrap">
                      {late && (
                        <span className="logi-card-late">
                          <i className="fa fa-triangle-exclamation" /> {days}d
                        </span>
                      )}
                      {statusBadge(s.status)}
                    </div>
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

          {/* ── DESKTOP TABLE (≥768px) ── */}
          <div className="logi-desk-only">
            <div className="tbl-card logistica-tbl">
              <table>
                <thead>
                  <tr>
                    <th>Remito</th><th>Fecha</th><th>Cliente</th><th>Ciudad</th>
                    <th>Presupuesto</th><th>Empresa</th><th>Servicio</th><th>Bultos</th><th>Peso</th>
                    <th>Costo</th><th>Paga</th><th>Estado</th><th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredShips.length ? filteredShips.map(s => {
                    const bud = budgets.find(b => b.id === s.budgetId)
                    const late = isLate(s)
                    const days = daysSince(s.date)
                    const notifyLink = notifyStatusChange(s, s.status)
                    return (
                      <tr key={s.id} style={late ? { background: 'rgba(220,38,38,.04)' } : undefined}>
                        <td><b>{s.remito || '—'}</b></td>
                        <td>
                          {s.date}
                          {['Despachado', 'En tránsito'].includes(s.status) && days > 0 && (
                            <div style={{ fontSize: 10, color: late ? '#DC2626' : 'var(--txt3)', fontWeight: late ? 700 : 500, marginTop: 1 }}>
                              {late && <i className="fa fa-triangle-exclamation" style={{ marginRight: 3 }} />}
                              hace {days}d{late ? ' · atrasado' : ''}
                            </div>
                          )}
                        </td>
                        <td>{s.client || '—'}</td>
                        <td>{s.city || '—'}</td>
                        <td>{bud?.num || '—'}</td>
                        <td>{s.carrier || '—'}</td>
                        <td>{s.service}</td>
                        <td>{s.bulks}</td>
                        <td>{s.weight ? `${s.weight} kg` : '—'}</td>
                        <td style={{ fontWeight: 700 }}>{fmt(s.freight)}</td>
                        <td>{s.payer}</td>
                        <td>{statusBadge(s.status)}</td>
                        <td>
                          <div className="acts">
                            {s.trackingUrl && (
                              <button className="act" style={{ color: '#3B82F6' }} onClick={() => window.open(getTrackingUrl(s.carrier, s.trackingUrl), '_blank')} title="Ver seguimiento"><i className="fa fa-location-arrow" /></button>
                            )}
                            {notifyLink && (
                              <button className="act" style={{ color: '#16A34A' }} onClick={() => window.open(notifyLink, '_blank')} title="Avisar al cliente por WhatsApp"><i className="fa-brands fa-whatsapp" /></button>
                            )}
                            <button className="act edit" onClick={() => openShip(s)} title="Editar"><i className="fa fa-pen" /></button>
                            <button className="act del" onClick={() => delShip(s.id)} title="Eliminar"><i className="fa fa-trash" /></button>
                          </div>
                        </td>
                      </tr>
                    )
                  }) : (
                    <tr>
                      <td colSpan={13}>
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

          {filteredShips.length > 0 && (
            <div style={{ fontSize: 11, color: 'var(--txt3)', textAlign: 'right', marginTop: 6 }}>
              {filteredShips.length} envío{filteredShips.length !== 1 ? 's' : ''} · Total flete: <b style={{ color: 'var(--money)' }}>{fmt(filteredShips.reduce((a, s) => a + (s.freight || 0), 0))}</b>
            </div>
          )}
        </>
      )}

      {/* ── TAB TARIFAS ────────────────────────────────────────────── */}
      {tab === 'tarifas' && (
        <>
          <div className="logi-tariff-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="card">
              <div className="card-header"><span className="card-title">Agregar tarifa / zona</span></div>
              <div className="grid2">
                <div className="fg">
                  <label>Zona / Destino</label>
                  <input type="text" value={tzForm.zone} onChange={e => setTzForm(f => ({ ...f, zone: e.target.value }))} placeholder="Córdoba Capital" />
                </div>
                <div className="fg">
                  <label>Empresa de envío</label>
                  <input type="text" list="carriers-list-tz" value={tzForm.carrier || ''} onChange={e => setTzForm(f => ({ ...f, carrier: e.target.value }))} placeholder="Vía Cargo…" autoComplete="off" />
                  <datalist id="carriers-list-tz">{CARRIERS.map(c => <option key={c} value={c} />)}</datalist>
                </div>
                <div className="fg">
                  <label>Precio por kg ($)</label>
                  <input type="number" value={tzForm.ppkg} onChange={e => setTzForm(f => ({ ...f, ppkg: e.target.value }))} placeholder="0" />
                </div>
                <div className="fg">
                  <label>Mínimo ($)</label>
                  <input type="number" value={tzForm.min} onChange={e => setTzForm(f => ({ ...f, min: e.target.value }))} placeholder="0" />
                </div>
                <div className="fg">
                  <label>Días hábiles</label>
                  <input type="number" value={tzForm.days} onChange={e => setTzForm(f => ({ ...f, days: e.target.value }))} placeholder="0" />
                </div>
              </div>
              <div className="fg">
                <label>Notas</label>
                <input type="text" value={tzForm.notes} onChange={e => setTzForm(f => ({ ...f, notes: e.target.value }))} placeholder="Observaciones…" />
              </div>
              <button className="btn btn-primary btn-sm" onClick={addTariff} style={{ marginTop: 4 }}>
                <i className="fa fa-plus" /> Agregar tarifa
              </button>
            </div>

            <div className="card">
              <div className="card-header"><span className="card-title">Tarifas configuradas</span></div>
              {tariffs.length ? tariffs.map(t => (
                <div key={t.id} className="metric-row">
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{t.zone}</div>
                    <div style={{ fontSize: 11, color: 'var(--txt3)' }}>
                      {t.carrier && <span style={{ fontWeight: 600, color: 'var(--txt2)' }}>{t.carrier} · </span>}
                      {fmt(t.ppkg)}/kg · mín {fmt(t.min)} · {t.days} día{t.days !== 1 ? 's' : ''}
                      {t.notes ? ` · ${t.notes}` : ''}
                    </div>
                  </div>
                  <button className="act del" onClick={() => delTariff(t.id)} style={{ flexShrink: 0 }}>
                    <i className="fa fa-trash" />
                  </button>
                </div>
              )) : (
                <div style={{ padding: '16px 12px', textAlign: 'center' }}>
                  <i className="fa fa-map-location-dot" style={{ fontSize: 24, color: 'var(--txt4)', marginBottom: 8, display: 'block' }} />
                  <div style={{ fontSize: 13, color: 'var(--txt3)', marginBottom: 10 }}>Sin tarifas configuradas</div>
                  <div style={{ fontSize: 11, color: 'var(--txt4)' }}>← Usá el formulario de la izquierda para agregar tu primera zona</div>
                </div>
              )}
            </div>
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-header">
              <span className="card-title"><i className="fa fa-calculator" style={{ color: 'var(--brand)', marginRight: 6 }} />Calculadora de flete</span>
            </div>
            <div className="grid2">
              <div className="fg">
                <label>Zona destino</label>
                <select value={calcZone} onChange={e => setCalcZone(e.target.value)}>
                  <option value="">Seleccioná zona</option>
                  {tariffs.map(t => <option key={t.id} value={t.zone}>{t.zone}</option>)}
                </select>
              </div>
              <div className="fg">
                <label>Peso total (kg)</label>
                <input type="number" value={calcKg} onChange={e => setCalcKg(e.target.value)} placeholder="1" min="0" step="0.1" />
              </div>
            </div>
            {calcZone && calcKg ? (
              <div style={{ background: 'var(--acento-xlt)', border: '1.5px solid var(--acento)', borderRadius: 8, padding: '12px 16px', marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, color: 'var(--txt2)' }}>Costo estimado</span>
                <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--acento)' }}>{fmt(calcFrete())}</span>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 8, padding: '8px 0' }}>Seleccioná zona y peso para calcular</div>
            )}
          </div>
        </>
      )}

      {/* ── TAB RESUMEN ────────────────────────────────────────────── */}
      {tab === 'resumen' && (
        <>
          <div className="kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
            {[
              { label: 'Costo total envíos', val: fmt(totalShipCost), color: 'var(--money)' },
              { label: 'Envíos este mes', val: thisMonth, color: 'var(--txt)' },
              { label: 'Promedio por envío', val: fmt(avgCost), color: 'var(--money)' },
              { label: 'Atrasados', val: lateShipments.length, color: lateShipments.length > 0 ? '#DC2626' : 'var(--txt)', sub: lateShipments.length > 0 ? 'Despachado/En tránsito > SLA' : 'Todo al día' },
              { label: 'Desvíos de flete', val: varianceCount, color: varianceCount > 0 ? '#D97706' : 'var(--txt)', sub: varianceCount > 0 ? 'Real ≠ cobrado al cliente' : 'Coincide con lo cobrado' },
            ].map(k => (
              <div key={k.label} className="card" style={{ padding: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>{k.label}</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: k.color }}>{k.val}</div>
                {k.sub && <div style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 3 }}>{k.sub}</div>}
              </div>
            ))}
          </div>

          <div className="logi-summary-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="card">
              <div className="card-header"><span className="card-title">Desglose por estado</span></div>
              {byStatus.filter(b => b.count > 0).length ? byStatus.filter(b => b.count > 0).map(b => (
                <div key={b.label} className="metric-row">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {statusBadge(b.label)}
                    <span style={{ fontSize: 12, color: 'var(--txt2)' }}>{b.count} envío{b.count !== 1 ? 's' : ''}</span>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--money)' }}>{fmt(b.cost)}</span>
                </div>
              )) : (
                <div style={{ fontSize: 13, color: 'var(--txt3)', padding: 12 }}>Sin envíos registrados</div>
              )}
            </div>

            <div className="card">
              <div className="card-header"><span className="card-title">Costo por mes (últimos 6 meses)</span></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                {monthlyData.map(m => (
                  <div key={m.ym}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                      <span style={{ color: 'var(--txt2)', textTransform: 'capitalize' }}>{m.label}</span>
                      <span style={{ fontWeight: 700, color: m.cost ? 'var(--money)' : 'var(--txt3)' }}>
                        {m.cost ? fmt(m.cost) : '—'} {m.count > 0 && <span style={{ fontWeight: 400, color: 'var(--txt3)' }}>({m.count})</span>}
                      </span>
                    </div>
                    <div style={{ height: 6, background: 'var(--surface2)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${(m.cost / maxCost) * 100}%`, background: 'var(--acento)', borderRadius: 4, transition: 'width .5s ease' }} />
                    </div>
                  </div>
                ))}
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
