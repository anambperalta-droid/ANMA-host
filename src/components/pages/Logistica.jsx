import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useData } from '../../context/DataContext'
import { useToast } from '../../context/ToastContext'
import { useConfirm } from '../../context/ConfirmContext'
import { fmt, fmtDate, db, dbW } from '../../lib/storage'

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
  'En tránsito':  { background: '#F7E8F0', color: '#5B21B6', border: '1.5px solid #C4B5FD' },
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
  const R = 64, CX = 80, CY = 80
  const CIRC = 2 * Math.PI * R
  if (total === 0) return (
    <div style={{ width: 160, height: 160, borderRadius: '50%', background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <span style={{ fontSize: 11, color: 'var(--txt4)' }}>sin datos</span>
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
    <svg width={160} height={160} viewBox="0 0 160 160" style={{ flexShrink: 0 }}>
      <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--surface2)" strokeWidth={13} />
      {segments.map(seg => (
        <circle
          key={seg.label}
          cx={CX} cy={CY} r={R}
          fill="none"
          stroke={DONUT_COLORS[seg.label] || '#CBD5E1'}
          strokeWidth={hovered === seg.label ? 18 : 13}
          strokeDasharray={`${seg.len} ${CIRC - seg.len}`}
          transform={`rotate(${seg.startDeg} ${CX} ${CY})`}
          style={{ transition: 'stroke-width .15s', cursor: 'pointer' }}
        />
      ))}
      <text x={CX} y={CY - 8} textAnchor="middle" style={{ fontSize: 26, fontWeight: 800, fill: 'var(--txt)', fontFamily: 'inherit' }}>{total}</text>
      <text x={CX} y={CY + 13} textAnchor="middle" style={{ fontSize: 11, fill: '#9CA3AF', fontFamily: 'inherit' }}>envíos</text>
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
  const { get, saveEntity, deleteEntity, config } = useData()
  const cfg = config()
  const feats = cfg.features || {}
  const companyName = cfg.companyName || cfg.company || ''
  const viaMsg = companyName
    ? `¡Hola! El costo de envío para tu pedido de ${companyName} es de $_______ a través de Vía Cargo. Recordá que el flete se abona al recibir / en origen. ¡Cualquier duda me avisás!`
    : `¡Hola! El costo de envío para tu pedido es de $_______ a través de Vía Cargo. Recordá que el flete se abona al recibir / en origen. ¡Cualquier duda me avisás!`
  const andreaniMsg = companyName
    ? `¡Hola! El costo de envío para tu pedido de ${companyName} es de $_______ a través de Andreani. Recordá que el flete se abona al recibir / en origen. ¡Cualquier duda me avisás!`
    : `¡Hola! El costo de envío para tu pedido es de $_______ a través de Andreani. Recordá que el flete se abona al recibir / en origen. ¡Cualquier duda me avisás!`
  const toast   = useToast()
  const confirm = useConfirm()

  // ── Pestañas: Control de Viajes | Cotizador | Resumen ──
  const [tab, setTab] = useState('viajes')
  const [sFilter, setSFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({})
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [lateAlertDismissed, setLateAlertDismissed] = useState(() => {
    try { return sessionStorage.getItem('logistica_late_dismissed') === '1' } catch { return false }
  })
  const [hoveredStatus, setHoveredStatus] = useState(null)
  const [cotizSearch, setCotizSearch] = useState('')
  const [cotizClient, setCotizClient] = useState(null)
  const [carrier, setCarrier] = useState('viacargo') // 'viacargo' | 'andreani'
  const [despachoDir, setDespachoDir] = useState(() => db('despDir', ''))
  const [despachoCUIT, setDespachoCUIT] = useState(() => db('despCuit', ''))

  // ── Control de Viajes: estado persistido ──
  const [viajes, setViajes] = useState(() => db('viajes', []))
  const [activeViajeId, setActiveViajeId] = useState(() => {
    const list = db('viajes', [])
    return list.length ? list[list.length - 1].id : null
  })
  // ── Filtros de la lista de viajes ──
  const [editViajeId, setEditViajeId] = useState(null)
  const [viajeSearch, setViajeSearch] = useState('')
  const [viajeStateFilter, setViajeStateFilter] = useState('all')
  const [viajeTimeFilter, setViajeTimeFilter] = useState('all') // all | thisMonth | lastMonth | last90

  const dismissLateAlert = () => {
    try { sessionStorage.setItem('logistica_late_dismissed', '1') } catch { }
    setLateAlertDismissed(true)
  }

  // ── Helpers de Viaje ──
  const _saveViaje = (v) => {
    const list = [...viajes.filter(x => x.id !== v.id), v]
    dbW('viajes', list); setViajes(list)
  }
  const createViaje = () => {
    const v = {
      id: Date.now(),
      date: new Date().toISOString().slice(0, 10),
      time: new Date().toTimeString().slice(0, 5),
      cost: '', status: 'Planificado', tasks: []
    }
    _saveViaje(v); setActiveViajeId(v.id)
  }
  const patchViaje = (id, patch) => {
    const v = viajes.find(x => x.id === id)
    if (v) _saveViaje({ ...v, ...patch })
  }
  const delViaje = (id) => confirm('¿Eliminar este viaje?', () => {
    const list = viajes.filter(x => x.id !== id)
    dbW('viajes', list); setViajes(list)
    if (activeViajeId === id) setActiveViajeId(list.length ? list[list.length - 1].id : null)
  })
  const addTask = (viajeId) => {
    const v = viajes.find(x => x.id === viajeId)
    if (!v) return
    _saveViaje({ ...v, tasks: [...(v.tasks||[]), { id: Date.now(), category: 'Insumos', detail: '', cost: '', done: false }] })
  }
  // Total de una parada/viaje calculado desde las paradas
  const viajeTotal = (v) => (v.tasks || []).reduce((s, t) => s + (Number(t.cost) || 0), 0)
  // Conteo histórico por categoría (todas las paradas de todos los viajes)
  const categoryStats = useMemo(() => {
    const stats = { 'Insumos': { count: 0, total: 0 }, 'Mercadería': { count: 0, total: 0 }, 'Entrega Pedido': { count: 0, total: 0 } }
    viajes.forEach(v => (v.tasks || []).forEach(t => {
      const k = t.category || 'Insumos'
      if (!stats[k]) stats[k] = { count: 0, total: 0 }
      stats[k].count += 1
      stats[k].total += Number(t.cost) || 0
    }))
    return stats
  }, [viajes])
  const gastoLogisticoTotal = useMemo(() => viajes.reduce((s, v) => s + viajeTotal(v), 0), [viajes])

  // ── Lista de viajes con filtros aplicados (mas reciente primero) ──
  const viajesFiltered = useMemo(() => {
    let list = viajes.slice().reverse()
    if (viajeStateFilter !== 'all') {
      list = list.filter(v => v.status === viajeStateFilter)
    }
    // Filtro por tiempo — recorta viajes segun periodo elegido
    if (viajeTimeFilter !== 'all') {
      const now = new Date()
      const y = now.getFullYear(), m = now.getMonth()
      let from = null, to = null
      if (viajeTimeFilter === 'thisMonth') {
        from = new Date(y, m, 1); to = new Date(y, m + 1, 1)
      } else if (viajeTimeFilter === 'lastMonth') {
        from = new Date(y, m - 1, 1); to = new Date(y, m, 1)
      } else if (viajeTimeFilter === 'last90') {
        from = new Date(now.getTime() - 90 * 86400000); to = new Date(y, m + 1, 1)
      }
      if (from && to) {
        list = list.filter(v => {
          const d = new Date(v.date + 'T12:00:00')
          return d >= from && d < to
        })
      }
    }
    if (viajeSearch.trim()) {
      const q = viajeSearch.toLowerCase()
      const budgetsAll = db('budgets', [])
      list = list.filter(v => {
        // Busca en cliente asociado, num pedido y descripciones de tasks
        const bud = v.budgetId ? budgetsAll.find(b => b.id === v.budgetId) : null
        const inClient = ((bud?.contact || '') + ' ' + (bud?.company || '')).toLowerCase().includes(q)
        const inNum = (bud?.num || '').toLowerCase().includes(q)
        const inTasks = (v.tasks || []).some(t => (t.detail || '').toLowerCase().includes(q))
        return inClient || inNum || inTasks
      })
    }
    return list
  }, [viajes, viajeStateFilter, viajeTimeFilter, viajeSearch])

  // ── Agrupacion por mes para separadores visuales ──
  const viajesGrouped = useMemo(() => {
    const groups = new Map()
    viajesFiltered.forEach(v => {
      const d = new Date(v.date + 'T12:00:00')
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const label = d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
      if (!groups.has(key)) groups.set(key, { label, items: [] })
      groups.get(key).items.push(v)
    })
    return Array.from(groups.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  }, [viajesFiltered])
  const patchTask = (viajeId, taskId, patch) => {
    const v = viajes.find(x => x.id === viajeId)
    if (!v) return
    _saveViaje({ ...v, tasks: (v.tasks||[]).map(t => t.id === taskId ? { ...t, ...patch } : t) })
  }
  const removeTask = (viajeId, taskId) => {
    const v = viajes.find(x => x.id === viajeId)
    if (!v) return
    _saveViaje({ ...v, tasks: (v.tasks||[]).filter(t => t.id !== taskId) })
  }

  // Mensaje según carrier seleccionado
  const cotizMsg = carrier === 'andreani' ? andreaniMsg : viaMsg

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
  const delShip = (id) => confirm('¿Eliminar envío?', () => { deleteEntity('shipments', id); toast('Envío eliminado', 'in') })

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
        .logi-search-row{background:#FBF7F0!important;border:1px solid #ECE3D6!important;box-shadow:none!important;border-radius:9999px!important;height:34px!important}
        .logi-pills-row{display:flex;gap:6px;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;align-items:center;padding-bottom:1px}
        .logi-pills-row::-webkit-scrollbar{display:none}
        /* Mobile cards */
        .logi-mob-list{display:none;flex-direction:column;padding:4px 0 16px}
        .logi-card{display:flex;flex-direction:column;gap:6px;border-radius:18px;padding:12px 14px;border:1px solid var(--border);background:var(--surface);margin-bottom:8px;-webkit-tap-highlight-color:transparent;transition:background .1s,border-color .1s;cursor:pointer;box-shadow:0 1px 2px rgba(15,23,42,.04)}
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
        .logi-card-act-trk{background:#FBF4EC;color:#2563EB}
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
        .logi-card-status-wrap{flex-shrink:0;display:flex;align-items:center;gap:6px;margin-left:auto}
        .logi-card-status-wrap .badge{font-size:10.5px!important;padding:3px 9px!important;border-radius:99px!important;font-weight:700!important;line-height:1.3!important}
        .logi-card-late{font-size:10.5px;color:#DC2626;font-weight:700;white-space:nowrap;display:flex;align-items:center;gap:3px;background:#FEF2F2;border:1px solid #FCA5A5;padding:3px 8px;border-radius:99px}
        .logi-card-late i{font-size:9px}
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
        .logi-act-circ.trk{background:#FBF4EC;color:#2563EB}
        .logi-act-circ.del{background:#FEF2F2;color:#DC2626}
        /* Status quick-select */
        .logi-status-sel{border-radius:20px;padding:3px 22px 3px 9px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;outline:none;appearance:none;-webkit-appearance:none;background-repeat:no-repeat;background-position:right 7px center;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5' viewBox='0 0 8 5'%3E%3Cpath fill='%236B7280' d='M0 0l4 5 4-5z'/%3E%3C/svg%3E")}
        /* ── Filtros de la lista de Viajes: buscador + pills estado ── */
        .viaje-filters{display:flex;flex-direction:column;gap:8px;margin-bottom:14px}
        .viaje-search{position:relative;display:flex;align-items:center;background:var(--surface2);border:1px solid var(--border);border-radius:99px;padding:0 40px 0 14px;height:40px;transition:border-color .15s}
        .viaje-search:focus-within{border-color:var(--brand);background:var(--surface)}
        .viaje-search > i:first-child{color:var(--txt3);font-size:12px;margin-right:8px;flex-shrink:0}
        .viaje-search input{flex:1;min-width:0;border:none;background:transparent;outline:none;font-family:inherit;font-size:13.5px;color:var(--txt)}
        .viaje-search input::placeholder{color:var(--txt4)}
        .viaje-search-clear{position:absolute;right:12px;top:50%;transform:translateY(-50%);color:var(--txt4);cursor:pointer;font-size:12px;padding:6px;border-radius:6px;transition:background .12s,color .12s}
        .viaje-search-clear:hover{background:var(--surface);color:var(--txt2)}
        .viaje-state-pills{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;padding:1px}
        .viaje-state-pills::-webkit-scrollbar{display:none}
        .viaje-pill{flex-shrink:0;white-space:nowrap;background:var(--surface);border:1px solid var(--border);color:var(--txt2);font-family:inherit;font-size:12px;font-weight:600;padding:7px 14px;border-radius:99px;cursor:pointer;transition:background .12s,color .12s,border-color .12s;-webkit-tap-highlight-color:transparent}
        .viaje-pill:hover{background:var(--surface2)}
        .viaje-pill.active{background:var(--brand-xlt);border-color:var(--brand-dim,rgba(244,63,94,.25));color:var(--brand);font-weight:700}
        /* Filtro tiempo: mas discreto, con icono calendario prefijo */
        .viaje-time-pills{display:flex;align-items:center;gap:5px;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;padding:1px;margin-top:2px}
        .viaje-time-pills::-webkit-scrollbar{display:none}
        .viaje-time-ic{color:var(--txt4);font-size:11px;margin-right:2px;flex-shrink:0}
        .viaje-pill-time{padding:5px 11px!important;font-size:11px!important;border-color:transparent!important;background:transparent!important;color:var(--txt3)!important}
        .viaje-pill-time:hover{background:var(--surface2)!important}
        .viaje-pill-time.active{background:var(--surface)!important;border-color:var(--border)!important;color:var(--txt)!important;font-weight:700!important;box-shadow:0 1px 2px rgba(15,23,42,.05)}
        /* ── Empty state con filtro aplicado ── */
        .viaje-empty-filter{text-align:center;padding:32px 20px;background:var(--surface2);border:1px dashed var(--border);border-radius:14px;color:var(--txt3);margin-bottom:12px}
        .viaje-empty-filter > i{font-size:22px;opacity:.4;margin-bottom:8px;display:block}
        .viaje-empty-filter > div{font-size:13px;font-weight:600;color:var(--txt2);margin-bottom:12px}
        .viaje-empty-filter > button{background:var(--brand);color:#fff;border:none;font-family:inherit;font-size:12px;font-weight:700;padding:8px 16px;border-radius:99px;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:opacity .12s}
        .viaje-empty-filter > button:active{opacity:.85}
        /* ── Separador por mes (sticky en scroll) ── */
        .viaje-month-sep{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 4px 8px;margin-top:14px;position:sticky;top:0;background:linear-gradient(180deg,var(--bg,#fdf7f4) 60%,rgba(253,247,244,0));z-index:5}
        .viaje-month-sep:first-child{margin-top:0}
        .viaje-month-lbl{font-size:10.5px;font-weight:800;color:var(--txt3);text-transform:uppercase;letter-spacing:.8px;font-family:'Space Grotesk','Inter',sans-serif}
        .viaje-month-count{font-size:10px;color:var(--txt4);font-weight:600;background:var(--surface2);border:1px solid var(--border);padding:3px 10px;border-radius:99px}
        /* ── Registro del viaje: linea de datos y paradas ──────────────
           El panel desplegado era un formulario: tres campos a ancho completo
           que repetian la cabecera, y cada parada con cinco cajas con borde.
           Ahora el viaje se lee y los campos aparecen cuando se los pide. */
        .viaje-meta{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:14px;
          padding:9px 12px;border-radius:12px;background:var(--surface2);border:1px solid var(--border)}
        .viaje-meta-item{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--txt2)}
        .viaje-meta-item i{font-size:11px;color:var(--txt4)}
        .viaje-meta-item b{color:var(--txt);font-weight:700}
        .viaje-meta-soft{color:var(--txt4)}
        .viaje-meta-edit{margin-left:auto;display:inline-flex;align-items:center;gap:6px;
          background:transparent;border:1.5px solid var(--border2);border-radius:9999px;
          padding:5px 13px;font-family:inherit;font-size:11.5px;font-weight:700;color:var(--txt2);
          cursor:pointer;transition:all .15s;white-space:nowrap}
        .viaje-meta-edit:hover{border-color:var(--brand);color:var(--brand);background:var(--brand-xlt)}
        .viaje-meta-edit i{font-size:10px}

        /* Una parada: numero, categoria, detalle y monto. Los campos son planos
           (se leen como texto) y muestran el borde al pasar por encima o al
           enfocarlos — mismo patron que las lineas de PedidoNuevo. */
        /* Tope de ancho: en una pantalla grande el detalle se estiraba y el
           monto quedaba a media cuadra del texto al que pertenece. */
        .lg-stop{display:grid;grid-template-columns:26px 124px minmax(0,1fr) 92px 28px;max-width:860px;
          align-items:center;gap:8px;padding:5px 8px;border-radius:10px;
          border-bottom:1px solid var(--border);transition:background .12s}
        .lg-stop:last-of-type{border-bottom:none}
        .lg-stop:hover{background:var(--surface2)}
        .lg-stop.is-done{opacity:.62}
        .lg-stop-n{width:26px;height:26px;border-radius:50%;flex-shrink:0;padding:0;
          border:1.5px solid var(--border2);background:var(--surface);color:var(--txt3);
          font-family:inherit;font-size:11px;font-weight:800;cursor:pointer;
          display:inline-flex;align-items:center;justify-content:center;transition:all .15s}
        .lg-stop-n:hover{border-color:#059669;color:#059669}
        .lg-stop.is-done .lg-stop-n{background:#DCFCE7;border-color:#86EFAC;color:#059669}
        .lg-flat{width:100%;min-width:0;box-sizing:border-box;font-family:inherit;
          border:1.5px solid transparent;background:transparent;border-radius:8px;
          padding:6px 8px;color:var(--txt);outline:none;transition:border-color .12s,background .12s}
        .lg-flat:hover{background:var(--surface);border-color:var(--border)}
        .lg-flat:focus{background:var(--surface);border-color:var(--brand);box-shadow:0 0 0 3px var(--brand-xlt)}
        .lg-flat::placeholder{color:var(--txt4);font-weight:400}
        .lg-stop-cat{font-size:11.5px;font-weight:700;color:var(--txt2);cursor:pointer}
        .lg-stop-det{font-size:12.5px}
        /* Sin tachado: el tilde verde y la fila apagada ya dicen que esta
           hecha, y tachar un campo que se puede editar se lee raro. */
        .lg-stop-cost{position:relative;display:flex;align-items:center}
        .lg-stop-cost > span{position:absolute;left:6px;font-size:11px;font-weight:700;color:var(--txt4);pointer-events:none}
        .lg-stop-cost .lg-flat{padding-left:16px;padding-right:6px;text-align:right;font-size:12.5px;font-weight:700;
          font-variant-numeric:tabular-nums}
        .lg-stop-del{width:26px;height:26px;border-radius:50%;padding:0;border:none;background:transparent;
          color:var(--txt4);font-size:12px;cursor:pointer;opacity:0;transition:opacity .12s,color .12s}
        .lg-stop:hover .lg-stop-del{opacity:1}
        .lg-stop-del:hover{color:var(--red);background:var(--red-lt)}

        /* En el celular la parada se parte en dos filas: detalle arriba a lo
           ancho, categoria y monto abajo. Con cinco columnas el detalle se
           quedaba sin lugar. */
        @media(max-width:640px){
          .lg-stop{grid-template-columns:26px minmax(0,1fr) 84px 26px;
            grid-template-areas:'n det det del' 'n cat costo .';row-gap:2px}
          .lg-stop-n{grid-area:n;align-self:start;margin-top:4px}
          .lg-stop-det{grid-area:det}
          .lg-stop-cat{grid-area:cat}
          .lg-stop-cost{grid-area:costo}
          .lg-stop-del{grid-area:del;opacity:1}
          .viaje-meta{gap:8px;padding:8px 10px}
          .viaje-meta-edit{margin-left:0;width:100%;justify-content:center}
        }

        /* ── CONTROL DE VIAJES: grilla de campos en mobile → 1 col ── */
        @media(max-width:640px){
          .viaje-header-grid{grid-template-columns:1fr 1fr!important}
          .viaje-stats-grid{grid-template-columns:1fr 1fr!important}
          /* Resumen KPIs mobile: 2 cols + Desvíos span 2 (mismo patron Hub) */
          .logi-resumen-kpis{grid-template-columns:1fr 1fr!important;gap:8px!important;margin-bottom:12px!important}
          .logi-resumen-kpis .card{padding:9px 11px!important;border-radius:12px!important;box-shadow:0 1px 2px rgba(15,23,42,.04)!important}
          .logi-resumen-kpis .card > div:first-child{font-size:8.5px!important;letter-spacing:.6px!important;margin-bottom:3px!important;font-weight:800!important}
          .logi-resumen-kpis .card > div:nth-child(2){font-size:17px!important;line-height:1.05!important;letter-spacing:-.02em!important}
          .logi-resumen-kpis .card > div:nth-child(3),
          .logi-resumen-kpis .card > div:nth-child(4){font-size:9px!important;line-height:1.3!important;margin-top:2px!important}
          .logi-resumen-variance{grid-column:1 / -1!important}
        }
        /* Una columna recien abajo de 375: a 390 y a 375 las dos entran
           (la fecha pide ~141px y hay ~152 por columna) y se ahorra una fila
           entera de alto en la pantalla donde mas se nota. */
        @media(max-width:374px){
          .viaje-header-grid{grid-template-columns:1fr!important}
        }
        /* ── COTIZAR TAB ── */
        /* Dos niveles de rotulo para toda la pantalla. Antes cada seccion
           elegia su propio tamaño, peso e interletrado: cinco variantes del
           mismo elemento. */
        .lg-lbl{font-size:10px;font-weight:800;color:var(--txt3);text-transform:uppercase;
          letter-spacing:.09em;display:flex;align-items:center;gap:6px}
        .lg-title{font-size:12px;font-weight:800;color:var(--txt2);text-transform:uppercase;
          letter-spacing:.06em}
        /* ── Fila de viaje ────────────────────────────────────────────
           Ocupaba ~88px para decir una fecha y dos chips, con la mitad
           derecha vacia. Ahora usa el ancho: identidad a la izquierda,
           plata en columna a la derecha. */
        .lg-row{display:flex;align-items:center;gap:12px;padding:11px 16px;cursor:pointer;transition:background .14s}
        .lg-row:hover{background:var(--surface2)}
        .lg-row-ico{width:32px;height:32px;border-radius:10px;flex-shrink:0;
          display:flex;align-items:center;justify-content:center;font-size:13px}
        .lg-row-main{flex:1;min-width:0}
        .lg-row-top{display:flex;align-items:baseline;gap:8px;min-width:0}
        /* Solo la primera letra: capitalize ponia mayuscula en cada palabra
           y daba "Jueves, 3 De Septiembre". */
        .lg-row-date{font-size:13px;font-weight:800;color:var(--txt);white-space:nowrap}
        .lg-row-date::first-letter{text-transform:uppercase}
        .lg-row-que{font-size:11.5px;color:var(--txt3);min-width:0;overflow:hidden;
          text-overflow:ellipsis;white-space:nowrap}
        .lg-row-chips{display:flex;align-items:center;gap:8px;margin-top:3px;flex-wrap:wrap;
          font-size:10px;color:var(--txt3);font-weight:600}
        .lg-row-chips i{margin-right:3px;font-size:9px}
        .lg-row-state{font-size:10px;font-weight:700;padding:2px 9px;border-radius:20px}
        .lg-row-done{color:#059669}
        .lg-row-done i{color:#059669}
        .lg-row-ped{color:var(--brand)}
        .lg-row-total{flex-shrink:0;font-size:13.5px;font-weight:800;color:var(--money);
          font-variant-numeric:tabular-nums;font-family:'Space Grotesk','Inter',sans-serif;
          min-width:92px;text-align:right}
        .lg-row-chev{font-size:11px;color:var(--txt4);flex-shrink:0;margin-left:2px}
        @media(max-width:640px){
          .lg-row{padding:10px 12px;gap:10px}
          .lg-row-ico{width:28px;height:28px;font-size:12px}
          /* En el celular no se oculta: es justo lo que distingue dos viajes
             del mismo dia. Pasa a su propio renglon, cortado con puntos. */
          .lg-row-top{flex-wrap:wrap}
          .lg-row-que{width:100%;font-size:11px}
          .lg-row-total{min-width:auto;font-size:12.5px}
        }
        /* ── Cajon del viaje ──────────────────────────────────────────
           Antes el detalle se abria dentro de la lista: los viajes de abajo
           se iban cientos de px y se perdia el lugar. Mismo patron que los
           cajones de Pedidos, Ventas y Compras: lateral en escritorio, hoja
           desde abajo en el celular, y la lista queda quieta atras. */
        .lg-drawer-bg{position:fixed;inset:0;z-index:9998;background:rgba(42,33,24,.45);
          backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);animation:pgIn .18s ease both}
        .lg-drawer{position:fixed;top:0;right:0;bottom:0;z-index:9999;width:560px;max-width:100vw;
          background:var(--surface);border-left:1.5px solid var(--border);
          display:flex;flex-direction:column;box-shadow:-12px 0 40px rgba(42,33,24,.18);
          animation:lgDrawerIn .26s cubic-bezier(.16,1,.3,1) both}
        @keyframes lgDrawerIn{from{transform:translateX(26px);opacity:.6}to{transform:none;opacity:1}}
        .lg-drawer-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;
          padding:16px 20px 12px;border-bottom:1px solid var(--border);flex-shrink:0}
        .lg-drawer-date{font-size:15px;font-weight:800;color:var(--txt);letter-spacing:-.3px;line-height:1.2}
        .lg-drawer-date::first-letter{text-transform:uppercase}
        .lg-drawer-sub{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:5px;
          font-size:11px;color:var(--txt3);font-weight:600}
        .lg-drawer-state{font-size:10px;font-weight:700;padding:2px 9px;border-radius:20px}
        .lg-drawer-total{font-weight:800;color:var(--money);font-variant-numeric:tabular-nums}
        .lg-drawer-body{flex:1;overflow-y:auto;min-height:0;padding:16px 20px 24px;-webkit-overflow-scrolling:touch}
        @media(max-width:640px){
          .lg-drawer{top:auto;left:0;right:0;bottom:0;width:100vw;max-height:92vh;
            border-left:none;border-radius:20px 20px 0 0;animation:lgSheetUp .28s cubic-bezier(.16,1,.3,1) both}
          @keyframes lgSheetUp{from{transform:translateY(100%)}to{transform:none}}
          .lg-drawer::before{content:'';display:block;width:36px;height:4px;border-radius:4px;
            background:var(--border2);margin:10px auto 0;flex-shrink:0}
          .lg-drawer-head{padding:10px 16px}
          .lg-drawer-body{padding:12px 16px calc(20px + env(safe-area-inset-bottom))}
        }
        .cotiz-layout{display:grid;grid-template-columns:1fr;gap:12px;grid-template-areas:"cliente" "tools" "despacho"}
        .cotiz-area-cliente{grid-area:cliente}
        .cotiz-area-tools{grid-area:tools}
        .cotiz-area-despacho{grid-area:despacho}
        @media(min-width:768px){.cotiz-layout{grid-template-columns:1fr 1.2fr;gap:16px;grid-template-areas:"cliente tools" "despacho tools"}}
        .cotiz-search-input{width:100%;box-sizing:border-box;padding:0 36px 0 38px;height:44px;font-size:14px;border-radius:12px;border:1.5px solid var(--border);background:var(--surface2);color:var(--txt);outline:none;font-family:inherit;transition:border-color .15s}
        .cotiz-search-input:focus{border-color:var(--brand)}
        /* Link al sitio del transportista. Reemplaza a .cotiz-vc-badge, que era
           una tarjeta de 60px cuyo unico contenido propio era este link. */
        .cotiz-sitio{display:inline-flex;align-items:center;gap:7px;align-self:flex-start;
          font-size:12px;font-weight:700;color:var(--txt2);text-decoration:none;
          padding:7px 14px;border-radius:9999px;border:1.5px solid var(--border2);
          transition:all .15s}
        .cotiz-sitio:hover{border-color:var(--brand);color:var(--brand);background:var(--brand-xlt)}
        .cotiz-sitio i{font-size:10px;opacity:.8}
        .cotiz-preview{margin:0;background:var(--surface2);border:1.5px solid var(--border);border-radius:12px;padding:14px 16px;font-size:13px;color:var(--txt2);line-height:1.7;font-style:italic}
        .cotiz-wa-btn{display:flex;align-items:center;justify-content:center;gap:8px;border-radius:14px;padding:13px 24px;font-size:14px;font-weight:700;cursor:pointer;transition:all .2s;width:100%;font-family:inherit}
        .cotiz-wa-btn:hover{filter:brightness(1.06)}
        .cotiz-wa-btn:active{transform:scale(.97)}
        .cotiz-desp-field{position:relative}
        /* Estos dos inputs no tenian clase: salian con el estilo por defecto
           del navegador, al lado de un buscador con el de la app. */
        .cotiz-desp-input{width:100%;box-sizing:border-box;height:42px;padding:0 44px 0 12px;
          font-family:inherit;font-size:13.5px;color:var(--txt);
          border:1.5px solid var(--border);border-radius:12px;background:var(--surface2);
          outline:none;transition:border-color .15s,background .15s}
        .cotiz-desp-input:hover{background:var(--surface3)}
        .cotiz-desp-input:focus{background:var(--surface);border-color:var(--brand);box-shadow:0 0 0 3px var(--brand-xlt)}
        .cotiz-desp-input::placeholder{color:var(--txt4)}
        .cotiz-desp-copy{position:absolute;right:6px;top:50%;transform:translateY(-50%);width:30px;height:30px;border-radius:8px;background:transparent;border:1px solid transparent;color:var(--txt4);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px;transition:all .15s}
        .cotiz-desp-copy:hover{background:var(--brand-xlt);color:var(--brand);border-color:var(--brand-dim)}
      `}</style>

      {/* Header desktop — hidden on mobile */}
      <div className="ph logi-ph" style={{ alignItems: 'center' }}>
        <div className="ph-right" style={{ gap: 6 }}>
          <div className="logi-cli-pill-group">
            {[
              { key: 'viajes',  label: 'Control de Viajes' },
              { key: 'cotizar', label: 'Cotizador de Envíos' },
              { key: 'resumen', label: 'Resumen' },
            ].map(({ key, label }) => (
              <button key={key} className={`logi-cli-pill${tab === key ? ' active' : ''}`} onClick={() => setTab(key)}>
                {label}
              </button>
            ))}
          </div>
          <button className="logi-cli-new" onClick={() => openShip()}>
            <i className="fa fa-plus" /><span>Registrar envío</span>
          </button>
        </div>
      </div>

      {/* Tab bar — solo mobile */}
      <div className="tab-bar logi-tab-bar-scroll logi-mob-tabs" style={{ gap: 0 }}>
        {[
          { key: 'viajes',  label: 'Control de Viajes' },
          { key: 'cotizar', label: 'Cotizador' },
          { key: 'resumen', label: 'Resumen' },
        ].map(({ key, label }) => (
          <div key={key} className={`tab-btn ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>
            {label}
          </div>
        ))}
        <button className="logi-tab-add" onClick={() => openShip()}>
          <i className="fa fa-plus" /> Envío
        </button>
      </div>

      {/* ── TAB CONTROL DE VIAJES ──────────────────────────────────── */}
      {tab === 'viajes' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

          {/* ── Barra superior ── */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--txt)', letterSpacing: '-.2px' }}>
              Registro de recorridos
            </div>
            <button className="btn btn-primary btn-sm" onClick={createViaje} style={{ gap: 5 }}>
              <i className="fa fa-plus" style={{ fontSize: 11 }} /> Nuevo viaje
            </button>
          </div>

          {/* ── Conteo general por categoría ── */}
          {viajes.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }} className="viaje-stats-grid">
              {[
                { key: 'Insumos',        icon: 'fa-box',          color: '#D97706', bg: '#FFFBEB' },
                { key: 'Mercadería',     icon: 'fa-cart-shopping', color: '#2563EB', bg: '#FBF4EC' },
                { key: 'Entrega Pedido', icon: 'fa-truck-fast',   color: '#7C3AED', bg: '#FBF4F7' },
              ].map(c => {
                const st = categoryStats[c.key] || { count: 0, total: 0 }
                return (
                  <div key={c.key} style={{ background: c.bg, borderRadius: 14, padding: '10px 12px', border: `1px solid ${c.color}22` }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: c.color, marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><i className={`fa ${c.icon}`} style={{ marginRight: 5 }} />{c.key}</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--txt)', lineHeight: 1, fontFamily: "'Space Grotesk','Inter',sans-serif", fontVariantNumeric: 'tabular-nums' }}>{st.count}<span style={{ fontSize: 10, fontWeight: 600, color: 'var(--txt3)', marginLeft: 3, fontFamily: "'Inter',sans-serif" }}>parada{st.count !== 1 ? 's' : ''}</span></div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: c.color, marginTop: 2, fontFamily: "'Space Grotesk','Inter',sans-serif", fontVariantNumeric: 'tabular-nums' }}>{fmt(st.total)}</div>
                  </div>
                )
              })}
              {/* Gasto total */}
              <div style={{ background: 'var(--panel-grad, #1E1B4B)', borderRadius: 14, padding: '10px 12px', color: '#fff' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,.6)', marginBottom: 3, whiteSpace: 'nowrap' }}><i className="fa fa-wallet" style={{ marginRight: 5 }} />Gasto total</div>
                <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1, fontFamily: "'Space Grotesk','Inter',sans-serif", fontVariantNumeric: 'tabular-nums' }}>{fmt(gastoLogisticoTotal)}</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,.5)', marginTop: 4 }}>{viajes.length} viaje{viajes.length !== 1 ? 's' : ''} · {viajes.reduce((n, v) => n + (v.tasks || []).length, 0)} paradas</div>
              </div>
            </div>
          )}

          {/* ── Empty state ── */}
          {viajes.length === 0 && (
            <div style={{ textAlign: 'center', padding: '56px 20px', borderRadius: 20, border: '1.5px dashed var(--border)', background: 'var(--surface2)' }}>
              <div style={{ fontSize: 40, marginBottom: 12, color: 'var(--brand)' }}><i className="fa fa-route" /></div>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--txt)', marginBottom: 6 }}>Sin viajes registrados</div>
              <div style={{ fontSize: 13, color: 'var(--txt3)', marginBottom: 20, lineHeight: 1.6, maxWidth: 300, margin: '0 auto 20px' }}>
                Registrá el viaje del día para organizar el recorrido del comisionista
              </div>
              <button className="btn btn-primary" onClick={createViaje}>
                <i className="fa fa-route" /> Registrar primer viaje
              </button>
            </div>
          )}

          {/* ── Filtros: buscador + pills por estado ── */}
          {viajes.length > 0 && (
            <div className="viaje-filters">
              <div className="viaje-search">
                <i className="fa fa-magnifying-glass" />
                <input
                  type="text" placeholder="Buscar por cliente, pedido o parada…"
                  value={viajeSearch} onChange={e => setViajeSearch(e.target.value)}
                />
                {viajeSearch && <i className="fa fa-xmark viaje-search-clear" onClick={() => setViajeSearch('')} />}
              </div>
              <div className="viaje-state-pills">
                {[
                  { key: 'all',         label: 'Todos' },
                  { key: 'Planificado', label: 'Planificados' },
                  { key: 'En Curso',    label: 'En curso' },
                  { key: 'Finalizado',  label: 'Finalizados' },
                ].map(f => (
                  <button key={f.key}
                    className={`viaje-pill${viajeStateFilter === f.key ? ' active' : ''}`}
                    onClick={() => setViajeStateFilter(f.key)}>
                    {f.label}
                  </button>
                ))}
              </div>
              {/* Filtro de tiempo (fila propia mas discreta, con icono) */}
              <div className="viaje-time-pills">
                <i className="fa fa-calendar viaje-time-ic" />
                {[
                  { key: 'all',       label: 'Todos los meses' },
                  { key: 'thisMonth', label: 'Este mes' },
                  { key: 'lastMonth', label: 'Mes pasado' },
                  { key: 'last90',    label: 'Últimos 3 meses' },
                ].map(f => (
                  <button key={f.key}
                    className={`viaje-pill viaje-pill-time${viajeTimeFilter === f.key ? ' active' : ''}`}
                    onClick={() => setViajeTimeFilter(f.key)}>
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Sin resultados por filtro ── */}
          {viajes.length > 0 && viajesFiltered.length === 0 && (
            <div className="viaje-empty-filter">
              <i className="fa fa-magnifying-glass" />
              <div>Sin viajes que coincidan con los filtros</div>
              <button onClick={() => { setViajeSearch(''); setViajeStateFilter('all'); setViajeTimeFilter('all') }}>Limpiar filtros</button>
            </div>
          )}

          {/* ── Lista de viajes agrupados por mes ── */}
          {viajesGrouped.map(([groupKey, group]) => (
            <div key={groupKey}>
              <div className="viaje-month-sep">
                <span className="viaje-month-lbl">{group.label}</span>
                <span className="viaje-month-count">{group.items.length} viaje{group.items.length !== 1 ? 's' : ''}</span>
              </div>
              {group.items.map(viaje => {
            const isOpen = viaje.id === activeViajeId
            const tasks = viaje.tasks || []
            const doneTasks = tasks.filter(t => t.done).length
            const stateColor = { Planificado: '#D97706', 'En Curso': '#2563EB', Finalizado: '#059669' }[viaje.status] || 'var(--txt3)'
            const stateBg = { Planificado: '#FFFBEB', 'En Curso': '#FBF4EC', Finalizado: '#DCFCE7' }[viaje.status] || 'var(--surface2)'

            return (
              <div key={viaje.id} style={{ background: 'var(--surface)', border: `1.5px solid ${isOpen ? 'var(--brand)' : 'var(--border)'}`, borderRadius: 20, marginBottom: 10, overflow: 'hidden', transition: 'border-color .15s', boxShadow: isOpen ? '0 4px 20px rgba(124,58,237,.1)' : 'var(--sh)' }}>

                {/* ── Cabecera del viaje (siempre visible) ── */}
                <div
                  onClick={() => setActiveViajeId(isOpen ? null : viaje.id)}
                  className="lg-row">
                  <div className="lg-row-ico" style={{ background: stateBg }}>
                    <i className={`fa ${ viaje.status === 'Finalizado' ? 'fa-check' : viaje.status === 'En Curso' ? 'fa-truck-fast' : 'fa-clock' }`} style={{ color: stateColor }} />
                  </div>
                  <div className="lg-row-main">
                    <div className="lg-row-top">
                      <span className="lg-row-date">
                        {new Date(viaje.date + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
                      </span>
                      {/* Lo que distingue un viaje de otro del mismo dia: a que fue.
                          La fecha sola no alcanza cuando se hacen varios. */}
                      {tasks.length > 0 && (
                        <span className="lg-row-que">
                          {tasks.map(t => t.detail || t.category).filter(Boolean).join(' · ') || `${tasks.length} parada${tasks.length !== 1 ? 's' : ''}`}
                        </span>
                      )}
                    </div>
                    <div className="lg-row-chips">
                      <span className="lg-row-state" style={{ background: stateBg, color: stateColor }}>{viaje.status}</span>
                      {tasks.length > 0 && (
                        <span className={doneTasks === tasks.length ? 'lg-row-done' : undefined}>
                          <i className="fa fa-check" />{doneTasks}/{tasks.length} paradas
                        </span>
                      )}
                      {viaje.budgetId && (() => {
                        const b = budgets.find(x => String(x.id) === String(viaje.budgetId))
                        return b ? (
                          <span className="lg-row-ped">
                            <i className="fa fa-gift" />{b.company || b.contact || b.num}
                          </span>
                        ) : null
                      })()}
                    </div>
                  </div>
                  <div className="lg-row-total">{viajeTotal(viaje) > 0 ? fmt(viajeTotal(viaje)) : ''}</div>
                  <i className={`fa fa-chevron-${isOpen ? 'up' : 'right'} lg-row-chev`} />
                </div>

                {/* ── Contenido expandido ── */}
                {isOpen && createPortal(
                  <>
                    <div className="lg-drawer-bg" onClick={() => setActiveViajeId(null)} />
                    <aside className="lg-drawer">
                      <header className="lg-drawer-head">
                        <div style={{ minWidth: 0 }}>
                          <div className="lg-drawer-date">
                            {new Date(viaje.date + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
                          </div>
                          <div className="lg-drawer-sub">
                            <span className="lg-drawer-state" style={{ color: stateColor, background: stateBg }}>{viaje.status}</span>
                            {tasks.length > 0 && <span>{doneTasks}/{tasks.length} paradas</span>}
                            {viajeTotal(viaje) > 0 && <span className="lg-drawer-total">{fmt(viajeTotal(viaje))}</span>}
                          </div>
                        </div>
                        <button className="mclose" onClick={() => setActiveViajeId(null)} aria-label="Cerrar">
                          <i className="fa fa-xmark" />
                        </button>
                      </header>
                      <div className="lg-drawer-body">

                    {/* Linea de datos del viaje. Antes eran tres campos de
                        formulario a ancho completo que repetian la cabecera:
                        fecha, estado y pedido ya estan arriba. Ahora se leen de
                        corrido y los campos aparecen al tocar "Editar datos". */}
                    {editViajeId !== viaje.id ? (
                      <div className="viaje-meta">
                        <span className="viaje-meta-item">
                          <i className="fa fa-calendar-day" />
                          Sale el <b>{fmtDate(viaje.date)}</b>
                        </span>
                        {(() => {
                          const b = viaje.budgetId ? budgets.find(x => String(x.id) === String(viaje.budgetId)) : null
                          return b ? (
                            <span className="viaje-meta-item">
                              <i className="fa fa-gift" style={{ color: 'var(--brand)' }} />
                              Para <b>{b.num || ''} {b.company || b.contact || ''}</b>
                            </span>
                          ) : (
                            <span className="viaje-meta-item viaje-meta-soft">
                              <i className="fa fa-gift" />
                              Viaje general, sin pedido asociado
                            </span>
                          )
                        })()}
                        <button className="viaje-meta-edit" onClick={() => setEditViajeId(viaje.id)}>
                          <i className="fa fa-pen" /> Editar datos
                        </button>
                      </div>
                    ) : (
                      <div className="viaje-header-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                        <div className="fg" style={{ marginBottom: 0 }}>
                          <label>Fecha de salida</label>
                          <input type="date" value={viaje.date}
                            onChange={e => patchViaje(viaje.id, { date: e.target.value })} />
                        </div>
                        <div className="fg" style={{ marginBottom: 0 }}>
                          <label>Estado general</label>
                          <select value={viaje.status}
                            onChange={e => patchViaje(viaje.id, { status: e.target.value })}
                            style={{ borderRadius: 10, fontWeight: 700, color: stateColor, borderColor: stateColor, background: stateBg }}>
                            {['Planificado', 'En Curso', 'Finalizado'].map(st => <option key={st}>{st}</option>)}
                          </select>
                        </div>
                        <div className="fg" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
                          <label><i className="fa fa-gift" style={{ marginRight: 5, color: 'var(--brand)', fontSize: 10 }} />Pedido / Cliente asociado (opcional)</label>
                          <select value={viaje.budgetId || ''}
                            onChange={e => patchViaje(viaje.id, { budgetId: e.target.value })}>
                            <option value="">Sin asociar — viaje general</option>
                            {budgets.map(b => (
                              <option key={b.id} value={b.id}>{b.num || `#${b.id}`} — {b.company || b.contact || 'Cliente'}</option>
                            ))}
                          </select>
                        </div>
                        <button className="btn btn-secondary btn-sm" style={{ gridColumn: '1 / -1', justifySelf: 'start' }}
                          onClick={() => setEditViajeId(null)}>
                          <i className="fa fa-check" /> Listo
                        </button>
                      </div>
                    )}

                    {/* Bloque de tareas/paradas */}
                    <div>
                      <div className="lg-lbl" style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <i className="fa fa-map-pin" style={{ color: 'var(--brand)', fontSize: 10 }} />
                        Recorrido
                        {/* El conteo ya esta en la cabecera del viaje, que se ve
                            tanto plegada como desplegada: repetirlo aca no sumaba. */}
                      </div>

                      {tasks.length === 0 && (
                        <div style={{ fontSize: 12, color: 'var(--txt4)', fontStyle: 'italic', padding: '8px 0 4px' }}>
                          Sin paradas registradas. Añadí la primera tarea del recorrido.
                        </div>
                      )}

                      {tasks.map((task, idx) => (
                        <div key={task.id} className={`lg-stop${task.done ? ' is-done' : ''}`}>
                          {/* El numero dice si la parada esta hecha: tilde verde
                              cuando si, numero cuando no. Antes lo decian tres
                              cosas a la vez (tachado, color y un boton aparte). */}
                          <button
                            className="lg-stop-n"
                            onClick={() => patchTask(viaje.id, task.id, { done: !task.done })}
                            title={task.done ? 'Marcar como pendiente' : 'Marcar como hecha'}>
                            {task.done ? <i className="fa fa-check" /> : idx + 1}
                          </button>
                          <select
                            className="lg-flat lg-stop-cat"
                            value={task.category}
                            onChange={e => patchTask(viaje.id, task.id, { category: e.target.value })}>
                            <option value="Insumos">Insumos</option>
                            <option value="Mercadería">Mercadería</option>
                            <option value="Entrega Pedido">Entrega Pedido</option>
                          </select>
                          <input
                            type="text"
                            className="lg-flat lg-stop-det"
                            value={task.detail}
                            onChange={e => patchTask(viaje.id, task.id, { detail: e.target.value })}
                            placeholder={task.category === 'Entrega Pedido' ? 'Ej: dejar el pedido en Saavedra' : task.category === 'Mercadería' ? 'Ej: retirar en el mayorista' : 'Ej: comprar cintas'}
                          />
                          <div className="lg-stop-cost">
                            <span>$</span>
                            <input
                              type="number" min="0" inputMode="numeric"
                              className="lg-flat"
                              value={task.cost ?? ''}
                              onChange={e => patchTask(viaje.id, task.id, { cost: e.target.value })}
                              placeholder="0"
                              title="Costo de esta parada"
                            />
                          </div>
                          <button
                            className="lg-stop-del"
                            onClick={() => removeTask(viaje.id, task.id)}
                            title="Eliminar parada">
                            <i className="fa fa-xmark" />
                          </button>
                        </div>
                      ))}

                      {/* Botón añadir tarea */}
                      <button
                        onClick={() => addTask(viaje.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, padding: '8px 14px', borderRadius: 12, border: '1.5px dashed var(--brand-dim)', background: 'var(--brand-xlt)', color: 'var(--brand)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s', WebkitTapHighlightColor: 'transparent' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--brand-dim)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'var(--brand-xlt)'}>
                        <i className="fa fa-plus" style={{ fontSize: 10 }} />
                        Añadir Parada / Tarea
                      </button>
                    </div>

                    {/* ── Resumen de costos del viaje ── */}
                    {tasks.length > 0 && (() => {
                      const cats = ['Insumos', 'Mercadería', 'Entrega Pedido']
                      const catColors = { 'Insumos': '#D97706', 'Mercadería': '#2563EB', 'Entrega Pedido': '#7C3AED' }
                      const catIcons = { 'Insumos': 'fa-box', 'Mercadería': 'fa-cart-shopping', 'Entrega Pedido': 'fa-truck-fast' }
                      const byCat = cats.map(c => {
                        const items = tasks.filter(t => t.category === c)
                        return { cat: c, count: items.length, total: items.reduce((s, t) => s + (Number(t.cost) || 0), 0) }
                      }).filter(c => c.count > 0)
                      const assocBudget = viaje.budgetId ? budgets.find(b => String(b.id) === String(viaje.budgetId)) : null
                      return (
                        <div style={{ marginTop: 14, padding: '14px 16px', borderRadius: 14, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                          <div className="lg-lbl" style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <i className="fa fa-calculator" style={{ color: 'var(--brand)', fontSize: 10 }} />Resumen de costos
                          </div>
                          {/* Desglose por categoría */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                            {byCat.map(c => (
                              <div key={c.cat} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
                                <span style={{ color: 'var(--txt2)', fontWeight: 600 }}>
                                  <i className={`fa ${catIcons[c.cat]}`} style={{ color: catColors[c.cat], marginRight: 5, fontSize: 11 }} />{c.cat}
                                  <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: catColors[c.cat], background: 'var(--surface)', padding: '1px 7px', borderRadius: 10 }}>×{c.count}</span>
                                </span>
                                <span style={{ fontWeight: 700, color: 'var(--money)', fontVariantNumeric: 'tabular-nums' }}>{fmt(c.total)}</span>
                              </div>
                            ))}
                          </div>
                          {/* Total del viaje */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10, borderTop: '1.5px dashed var(--border2)' }}>
                            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--txt)' }}>Costo total del viaje</span>
                            <span style={{ fontSize: 18, fontWeight: 700, color: '#059669', fontVariantNumeric: 'tabular-nums', fontFamily: "'Space Grotesk','Inter',sans-serif" }}>{fmt(viajeTotal(viaje))}</span>
                          </div>
                          {/* Costo logístico de 1 pedido */}
                          {assocBudget && (
                            <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 10, background: 'var(--brand-xlt)', border: '1px solid var(--brand-dim)', display: 'flex', alignItems: 'center', gap: 8 }}>
                              <i className="fa fa-gift" style={{ color: 'var(--brand)', fontSize: 13, flexShrink: 0 }} />
                              <div style={{ fontSize: 11, color: 'var(--txt2)', lineHeight: 1.4 }}>
                                Costo logístico del pedido <b style={{ color: 'var(--brand)' }}>{assocBudget.num || assocBudget.company || assocBudget.contact}</b>: <b style={{ color: '#059669' }}>{fmt(viajeTotal(viaje))}</b>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })()}

                    {/* Acciones del viaje */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => delViaje(viaje.id)} style={{ color: 'var(--red)', borderColor: '#FECACA' }}>
                        <i className="fa fa-trash" /> Eliminar viaje
                      </button>
                    </div>
                      </div>
                    </aside>
                  </>,
                  document.body
                )}
              </div>
            )
          })}
            </div>
          ))}
        </div>
      )}

      {/* ── TAB ENVÍOS (oculto — accesible via + Registrar envío) ── */}
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
                  <div className="lg-lbl" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{k.label}</div>
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
                  {/* Fila 1: Remito + Cliente | Acciones (badge se movio a fila 3
                      para evitar que se superponga con los botones — patron
                      identico al de Hub, mismo fix). */}
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

                  {/* Fila 3: Specs técnicos | Badge de estado + alerta atrasado */}
                  <div className="logi-card-row3">
                    <div className="logi-card-specs">
                      {s.bulks > 0 && <span className="logi-card-spec">{s.bulks} bulto{s.bulks !== 1 ? 's' : ''}</span>}
                      {s.weight && <span className="logi-card-spec">{s.weight} kg</span>}
                      {feats.costoInterno && <span className="logi-card-spec logi-card-spec-price">{fmt(s.freight)}</span>}
                      {payerChip && <span className="logi-card-spec">{payerChip}</span>}
                    </div>
                    <div className="logi-card-status-wrap" onClick={e => e.stopPropagation()}>
                      {late && (
                        <span className="logi-card-late">
                          <span className="ins-led-pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: '#DC2626', display: 'inline-block', flexShrink: 0 }} />
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
                    {feats.costoInterno && <th style={{ textAlign: 'right' }}>Costo</th>}
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
                            <div style={{ fontSize: 10, color: '#A89A86', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
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
                            style={STATUS_SELECT_STYLE[s.status] || { background: '#FBF7F0', color: '#374151', border: '1.5px solid #ECE3D6' }}
                          >
                            {statusList.map(st => <option key={st} value={st}>{st}</option>)}
                          </select>
                        </td>

                        {/* COSTO */}
                        {feats.costoInterno && <td style={{ textAlign: 'right', fontWeight: 700, fontSize: 13, fontFamily: 'ui-monospace,SFMono-Regular,monospace' }}>{fmt(s.freight)}</td>}

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

      {/* ── TAB COTIZADOR DE ENVÍOS ────────────────────────────────── */}
      {tab === 'cotizar' && (
        <div className="cotiz-layout">

          {/* ── ÁREA: Cliente a cotizar ── */}
          <div className="cotiz-area-cliente card" style={{ borderRadius: 20, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="lg-lbl" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <i className="fa fa-user" style={{ color: 'var(--brand)', fontSize: 11 }} />Cliente a cotizar
            </div>

            {/* Buscador */}
            <div style={{ position: 'relative' }}>
              <i className="fa fa-magnifying-glass" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--txt4)', fontSize: 12, pointerEvents: 'none', zIndex: 1 }} />
              <input
                type="text"
                value={cotizSearch}
                onChange={e => { setCotizSearch(e.target.value); setCotizClient(null) }}
                placeholder="Buscar empresa o contacto…"
                className="cotiz-search-input"
              />
              {cotizSearch && (
                <button onClick={() => { setCotizSearch(''); setCotizClient(null) }}
                  style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--txt4)', cursor: 'pointer', fontSize: 13, padding: 4, lineHeight: 1 }}>
                  <i className="fa fa-xmark" />
                </button>
              )}
            </div>

            {/* Resultados */}
            {cotizSearch && !cotizClient && cotizFilteredClients.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflowY: 'auto' }}>
                {cotizFilteredClients.map(c => (
                  <button key={c.id}
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
              <div style={{ background: '#F2F8EB', border: '1.5px solid #86EFAC', borderRadius: 14, padding: '14px 16px' }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--txt)', marginBottom: 2 }}>{cotizClient.company || cotizClient.contact}</div>
                {cotizClient.company && cotizClient.contact && (
                  <div style={{ fontSize: 12, color: 'var(--txt3)', marginBottom: 8 }}>{cotizClient.contact}</div>
                )}
                {cotizClient.wa ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: '#15803D' }}>
                    <i className="fa-brands fa-whatsapp" /><span>{cotizClient.wa}</span>
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: 'var(--amber)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                    <i className="fa fa-triangle-exclamation" />Sin número de WhatsApp
                  </div>
                )}
                <button onClick={() => { setCotizClient(null); setCotizSearch('') }}
                  style={{ marginTop: 10, fontSize: 11, color: 'var(--txt3)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <i className="fa fa-xmark" />Cambiar cliente
                </button>
              </div>
            )}

            {!cotizClient && !cotizSearch && (
              <div style={{ fontSize: 12, color: 'var(--txt4)', textAlign: 'center', padding: '16px 0', lineHeight: 1.6 }}>
                Buscá un cliente para enviarle el costo por WhatsApp
              </div>
            )}
          </div>

          {/* ── ÁREA: el mensaje que se manda ── */}
          <div className="cotiz-area-tools card" style={{ borderRadius: 20, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Selector de transportista + Badge dinámico */}
            <div>
              <div className="lg-lbl" style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <i className="fa fa-truck" style={{ fontSize: 10 }} />Mensaje para la clienta · transportista
              </div>

              {/* Toggle Vía Cargo / Andreani */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                {[
                  { key: 'viacargo',  label: 'Vía Cargo',  color: '#059669', bg: '#DCFCE7',  border: '#A7F3D0' },
                  { key: 'andreani',  label: 'Andreani',   color: '#DC2626', bg: '#FEF2F2',  border: '#FECACA' },
                ].map(c => (
                  <button key={c.key} onClick={() => setCarrier(c.key)}
                    style={{ flex: 1, padding: '8px 12px', borderRadius: 12, border: `2px solid ${carrier === c.key ? c.border : 'var(--border)'}`, background: carrier === c.key ? c.bg : 'var(--surface2)', color: carrier === c.key ? c.color : 'var(--txt3)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <i className="fa fa-truck" style={{ fontSize: 11 }} />
                    {c.label}
                    {carrier === c.key && <i className="fa fa-check-circle" style={{ fontSize: 11 }} />}
                  </button>
                ))}
              </div>

              {/* El nombre del transportista ya lo dicen las pastillas de
                  arriba: la tarjeta que lo repetia en grande existia solo para
                  alojar este link. Queda el link. */}
              <a href={carrier === 'andreani' ? 'https://www.andreani.com' : 'https://www.viacargo.com.ar'}
                target="_blank" rel="noreferrer" className="cotiz-sitio">
                <i className="fa fa-arrow-up-right-from-square" />
                Cotizar en el sitio de {carrier === 'andreani' ? 'Andreani' : 'Vía Cargo'}
              </a>
            </div>

            {/* Vista previa del mensaje — se actualiza según carrier */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--txt4)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                <i className="fa fa-eye" style={{ fontSize: 10 }} />Vista previa del mensaje
              </div>
              <p className="cotiz-preview">"{cotizMsg}"</p>
            </div>

            {/* Botón WA */}
            <button className="cotiz-wa-btn"
              onClick={() => {
                if (cotizClient?.wa) {
                  window.open(`https://api.whatsapp.com/send?phone=${cotizClient.wa.replace(/\D/g, '')}&text=${encodeURIComponent(cotizMsg)}`, '_blank')
                } else {
                  navigator.clipboard.writeText(cotizMsg)
                  window.open('https://web.whatsapp.com/', '_blank')
                  toast('Texto copiado. Seleccioná el contacto en WhatsApp.', 'ok')
                }
              }}
              style={{
                background: cotizClient?.wa ? '#16A34A' : '#F2F8EB',
                border: `1.5px solid ${cotizClient?.wa ? '#15803D' : '#86EFAC'}`,
                color: cotizClient?.wa ? '#fff' : '#15803D',
              }}>
              <i className="fa-brands fa-whatsapp" style={{ fontSize: 17 }} />
              {cotizClient?.wa
                ? `Enviar a ${cotizClient.company || cotizClient.contact}`
                : 'Copiar texto + Abrir WhatsApp'}
            </button>
          </div>

          {/* ── ÁREA: Mis Datos de Despacho ── */}
          <div className="cotiz-area-despacho card" style={{ borderRadius: 20, padding: '16px 18px' }}>
            <div className="lg-lbl" style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
              <i className="fa fa-box-archive" style={{ color: 'var(--brand)', fontSize: 11 }} />Mis Datos de Despacho
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* Dirección */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt3)', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
                  <i className="fa fa-location-dot" style={{ color: 'var(--txt4)', fontSize: 11 }} />Dirección de retiro
                </label>
                <div className="cotiz-desp-field">
                  <input
                    type="text"
                    value={despachoDir}
                    onChange={e => { setDespachoDir(e.target.value); dbW('despDir', e.target.value) }}
                    placeholder="Av. Ejemplo 1234, Localidad…"
                    className="cotiz-desp-input"
                  />
                  <button className="cotiz-desp-copy" title="Copiar dirección"
                    onClick={() => { if (despachoDir) { navigator.clipboard.writeText(despachoDir); toast('Dirección copiada ✓', 'ok') } }}>
                    <i className="fa fa-copy" />
                  </button>
                </div>
              </div>

              {/* CUIT */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt3)', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
                  <i className="fa fa-id-card" style={{ color: 'var(--txt4)', fontSize: 11 }} />CUIT
                </label>
                <div className="cotiz-desp-field">
                  <input
                    type="text"
                    value={despachoCUIT}
                    onChange={e => { setDespachoCUIT(e.target.value); dbW('despCuit', e.target.value) }}
                    placeholder="20-12345678-9"
                    className="cotiz-desp-input"
                  />
                  <button className="cotiz-desp-copy" title="Copiar CUIT"
                    onClick={() => { if (despachoCUIT) { navigator.clipboard.writeText(despachoCUIT); toast('CUIT copiado ✓', 'ok') } }}>
                    <i className="fa fa-copy" />
                  </button>
                </div>
              </div>

            </div>
          </div>

        </div>
      )}

      {/* ── TAB RESUMEN ────────────────────────────────────────────── */}
      {tab === 'resumen' && (
        <>
          {/* Export button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button className="btn btn-sm" onClick={() => window.print()}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface2)', border: '1.5px solid var(--border)', color: 'var(--txt2)', borderRadius: 10, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              {/* window.print(): abre el dialogo de impresion, no descarga. */}
              <i className="fa fa-print" style={{ fontSize: 13 }} />
              Imprimir resumen
            </button>
          </div>

          {/* KPI cards — mismo patron que Hub: grid 2 cols en mobile con
             "Desvíos de flete" span 2 para no dejar hueco. Auto-fit dejaba
             el 5to KPI solo abajo (feo). */}
          <div className="kpis logi-resumen-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
            {/* Costo total — with trend */}
            <div className="card" style={{ padding: 16 }}>
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
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Envíos este mes</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--txt)' }}>{thisMonth}</div>
            </div>

            {/* Promedio por envío */}
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Promedio por envío</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--money)' }}>{fmt(avgCost)}</div>
            </div>

            {/* Atrasados */}
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Atrasados</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: lateShipments.length > 0 ? '#DC2626' : 'var(--txt)' }}>{lateShipments.length}</div>
              <div style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 3 }}>{lateShipments.length > 0 ? 'Despachado/En tránsito > SLA' : 'Todo al día'}</div>
            </div>

            {/* Desvíos de flete — red bg when > 0. En mobile span 2 col
                para no dejar hueco a la derecha. */}
            <div className="card logi-resumen-variance" style={{ padding: 16, background: varianceCount > 0 ? '#FEF2F2' : undefined, border: varianceCount > 0 ? '1.5px solid #FCA5A5' : undefined }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: varianceCount > 0 ? '#991B1B' : 'var(--txt3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Desvíos de flete</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: varianceCount > 0 ? '#DC2626' : 'var(--txt)' }}>{varianceCount}</div>
              <div style={{ fontSize: 10, color: varianceCount > 0 ? '#B91C1C' : 'var(--txt3)', marginTop: 3 }}>{varianceCount > 0 ? 'Real ≠ cobrado al cliente' : 'Coincide con lo cobrado'}</div>
            </div>
          </div>

          <div className="logi-summary-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* Desglose por estado — donut centrado + leyenda */}
            <div className="card" style={{ padding: '18px 20px' }}>
              <div className="lg-title" style={{ marginBottom: 18 }}>Desglose por estado</div>
              {byStatus.filter(b => b.count > 0).length ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
                  <DonutChart data={byStatus.filter(b => b.count > 0)} hovered={hoveredStatus} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, width: '100%' }}>
                    {byStatus.filter(b => b.count > 0).map(b => (
                      <div key={b.label} onMouseEnter={() => setHoveredStatus(b.label)} onMouseLeave={() => setHoveredStatus(null)}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 12, cursor: 'default', transition: 'background .12s', background: hoveredStatus === b.label ? 'var(--surface2)' : 'transparent' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                          <span style={{ width: 10, height: 10, borderRadius: '50%', background: DONUT_COLORS[b.label] || '#DCD1C0', flexShrink: 0, display: 'inline-block', boxShadow: hoveredStatus === b.label ? `0 0 0 3px ${(DONUT_COLORS[b.label] || '#DCD1C0')}30` : 'none', transition: 'box-shadow .15s' }} />
                          <span style={{ fontSize: 12.5, color: 'var(--txt)', fontWeight: hoveredStatus === b.label ? 700 : 500 }}>{b.label}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                          <span style={{ fontSize: 11, color: 'var(--txt3)', fontWeight: 600, background: 'var(--surface2)', padding: '2px 8px', borderRadius: 20 }}>{b.count} env.</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--money)', minWidth: 64, textAlign: 'right' }}>{fmt(b.cost)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--txt3)', padding: '24px 0', textAlign: 'center' }}>Sin envíos registrados</div>
              )}
            </div>

            {/* Costo por mes — taller bars */}
            <div className="card" style={{ padding: 16 }}>
              <div className="lg-title" style={{ marginBottom: 14 }}>Costo por mes (últimos 6 meses)</div>
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
                          {m.count > 0 && <span style={{ fontWeight: 400, color: 'var(--txt4)', fontSize: 10, marginLeft: 5 }}>{m.count} env.</span>}
                        </span>
                      </div>
                      <div style={{ height: 10, background: 'var(--surface2)', borderRadius: 6, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: isLast ? 'var(--brand)' : 'var(--acento)', borderRadius: 6, transition: 'width .5s ease', minWidth: pct > 0 ? 6 : 0 }} />
                      </div>
                    </div>
                  )
                })}
              </div>
              {/* Seis barras vacias debajo de un KPI que dice $67.178 parecen
                  un error del sistema. No lo es: los envios con flete cargado
                  son anteriores a esta ventana. Conviene decirlo. */}
              {maxCost <= 1 && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', fontSize: 11.5, color: 'var(--txt3)', lineHeight: 1.5 }}>
                  Sin flete cargado en estos seis meses. El costo total de arriba incluye envíos anteriores.
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── MODAL ──────────────────────────────────────────────────── */}
      {modal && (
        <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) setModal(false) }}>
          <div className="modal-form-card" style={{ maxWidth: 600 }}
               onKeyDown={e => { if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && (form.remito || form.client)) saveShip() }}>
            <div className="mh" style={{ padding: '18px 22px 12px', borderBottom: '1px solid var(--border)', margin: 0 }}>
              <h3>{form.id ? 'Editar envío' : 'Registrar envío'}</h3>
              <button className="mclose" onClick={() => setModal(false)}><i className="fa fa-xmark" /></button>
            </div>
            <div style={{ padding: '14px 22px' }}>

            {/* ── 1. ENVÍO — datos esenciales ─────────────────────────── */}
            <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '14px 16px', marginBottom: 10, border: '1.5px solid var(--border)' }}>
              <div className="lg-lbl" style={{ marginBottom: 10 }}>
                <i className="fa fa-truck-fast" style={{ marginRight: 6, color: 'var(--brand)' }} />Envío
              </div>
              <div className="fg" style={{ marginBottom: 10 }}>
                <label>Presupuesto asociado</label>
                <select value={form.budgetId || ''} onChange={e => onBudgetChange(e.target.value)}>
                  <option value="">Sin asociar</option>
                  {budgets.map(b => <option key={b.id} value={b.id}>{b.num} — {b.company || b.contact}</option>)}
                </select>
              </div>
              <div className="grid2">
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
              </div>
              <div className="fg" style={{ marginBottom: 0 }}>
                <label>Empresa de envío</label>
                <input type="text" list="carriers-list" value={form.carrier || ''} onChange={e => setF('carrier', e.target.value)} placeholder="Vía Cargo…" autoComplete="off" />
                <datalist id="carriers-list">{CARRIERS.map(c => <option key={c} value={c} />)}</datalist>
              </div>
            </div>

            {/* ── 2. DESTINATARIO ──────────────────────────────────────── */}
            <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '14px 16px', marginBottom: 10, border: '1.5px solid var(--border)' }}>
              <div className="lg-lbl" style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                <i className="fa fa-location-dot" style={{ color: 'var(--brand)' }} />Destinatario
                {form.budgetId && <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--green)', background: '#F2F8EB', padding: '1px 8px', borderRadius: 10 }}>Auto-completado</span>}
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
                <div style={{ marginTop: 10, background: '#F2F8EB', border: '1px solid #86EFAC', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#065F46', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <i className="fa fa-calendar-check" style={{ color: '#16A34A' }} />
                  Llegada estimada: <b style={{ textTransform: 'capitalize' }}>{estimatedArrival}</b>
                </div>
              )}
            </div>

            {/* ── 3. FLETE — solo "quién paga" arriba; el resto en detalles ── */}
            <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '14px 16px', marginBottom: 10, border: '1.5px solid var(--border)' }}>
              <div className="fg" style={{ marginBottom: marginImpact !== null ? 10 : 0 }}>
                <label>¿Quién paga el flete?</label>
                <select value={form.payer || 'Mi negocio'} onChange={e => setF('payer', e.target.value)}>
                  <option>Mi negocio</option>
                  <option>El cliente</option>
                  <option>Incluido en precio</option>
                </select>
              </div>
              {marginImpact !== null && (
                <div style={{ background: marginImpact >= 0 ? '#F2F8EB' : '#FFF1F2', border: `1.5px solid ${marginImpact >= 0 ? '#86EFAC' : '#FCA5A5'}`, borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: 'var(--txt2)' }}>
                    <i className="fa fa-chart-line" style={{ marginRight: 6, color: marginImpact >= 0 ? '#16A34A' : '#DC2626' }} />
                    Ganancia neta <span style={{ fontSize: 10, color: 'var(--txt3)' }}>(después del flete)</span>
                  </span>
                  <span style={{ fontSize: 18, fontWeight: 800, color: marginImpact >= 0 ? '#16A34A' : '#DC2626' }}>
                    {fmt(marginImpact)}
                  </span>
                </div>
              )}
            </div>

            {/* ── 4. DETALLES AVANZADOS — colapsable ─────────────────── */}
            {(() => {
              const hasAdv = !!(form.remito || form.trackingUrl || form.bulks > 1 || form.weight || form.freight || (form.service && form.service !== 'Estándar'))
              const open = showAdvanced || hasAdv
              return (
                <div style={{ marginBottom: 10 }}>
                  <button
                    type="button"
                    onClick={() => setShowAdvanced(s => !s)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      background: 'transparent', border: '1px dashed var(--border)', borderRadius: 8,
                      padding: '8px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--txt2)',
                    }}>
                    <span><i className="fa fa-sliders" style={{ marginRight: 8, color: 'var(--brand)' }} />Detalles avanzados</span>
                    <i className={`fa fa-chevron-${open ? 'up' : 'down'}`} style={{ color: 'var(--txt3)' }} />
                  </button>
                  {open && (
                    <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '14px 16px', marginTop: 8, border: '1.5px solid var(--border)' }}>
                      <div className="grid2">
                        <div className="fg" style={{ marginBottom: 10 }}>
                          <label>N° Remito</label>
                          <input type="text" value={form.remito || ''} onChange={e => setF('remito', e.target.value)} placeholder="VC-001234" />
                        </div>
                        <div className="fg" style={{ marginBottom: 10 }}>
                          <label>Servicio</label>
                          <select value={form.service || 'Estándar'} onChange={e => setF('service', e.target.value)}>
                            {Object.keys(SERVICE_MULTIPLIER).map(s => (
                              <option key={s}>{s}{SERVICE_MULTIPLIER[s] !== 1 ? ` (×${SERVICE_MULTIPLIER[s]})` : ''}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="fg" style={{ marginBottom: 10 }}>
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
                      <div className="grid2">
                        <div className="fg" style={{ marginBottom: feats.costoInterno ? 10 : 0 }}>
                          <label>Bultos</label>
                          <input type="number" value={form.bulks || 1} onChange={e => setF('bulks', Number(e.target.value))} min="1" />
                        </div>
                        <div className="fg" style={{ marginBottom: feats.costoInterno ? 10 : 0 }}>
                          <label>Peso (kg)</label>
                          <input type="number" value={form.weight || ''} onChange={e => setF('weight', e.target.value)} placeholder="0" step="0.1" />
                        </div>
                      </div>
                      {fleteEstimado !== null && (
                        <div style={{ background: '#FBF4EC', border: '1.5px solid #93C5FD', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: feats.costoInterno ? 10 : 0 }}>
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
                      {feats.costoInterno && (
                        <div className="fg" style={{ marginBottom: 0 }}>
                          <label>Costo flete ($)</label>
                          <input type="number" value={form.freight || 0} onChange={e => setF('freight', Number(e.target.value))} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })()}

            <div className="fg" style={{ marginBottom: 0 }}>
              <label>Notas</label>
              <textarea value={form.notes || ''} onChange={e => setF('notes', e.target.value)} rows={2} placeholder="Observaciones, instrucciones de entrega…" />
            </div>
            </div>

            <div className="mfooter" style={{ padding: '12px 22px 16px', borderTop: '1px solid var(--border)', margin: 0, flexShrink: 0, position: 'sticky', bottom: 0, background: 'var(--surface)', zIndex: 5 }}>
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
