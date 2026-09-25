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

  return (
    <div style={{ padding: '20px 20px 80px', maxWidth: 1000, margin: '0 auto' }}>
      <style>{`
        .vt-row{display:grid;grid-template-columns:1fr .7fr .4fr .7fr .5fr .35fr;gap:0;align-items:center;padding:10px 14px;border-bottom:1px solid var(--border);font-size:13px;transition:background .1s}
        .vt-row:hover{background:var(--surface2)}
        .vt-hdr{font-size:10px;font-weight:700;color:var(--txt3);text-transform:uppercase;letter-spacing:.06em;padding:8px 14px;background:var(--surface2);border-radius:10px 10px 0 0;border:none}
        .vt-hdr:hover{background:var(--surface2)}
        .vt-cell{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .vt-cell-r{text-align:right;font-variant-numeric:tabular-nums}
        .vt-pay-chip{font-size:10px;font-weight:700;padding:3px 9px;border-radius:99px;cursor:pointer;border:none;font-family:inherit;transition:filter .15s;display:inline-flex;align-items:center;gap:4px}
        .vt-pay-chip:hover{filter:brightness(.92)}
        @media(max-width:700px){
          .vt-row,.vt-hdr{grid-template-columns:1fr .6fr .5fr .3fr;font-size:12px}
          .vt-hide-m{display:none}
        }
      `}</style>

      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: 'var(--txt)', margin: 0, letterSpacing: '-.4px' }}>Registro de ventas</h1>
        <button onClick={openDrawer} style={{
          padding: '10px 18px', borderRadius: 10, border: 'none',
          background: 'var(--grad)', color: '#fff', fontSize: 13, fontWeight: 700,
          cursor: 'pointer', fontFamily: 'inherit',
          display: 'inline-flex', alignItems: 'center', gap: 7,
          boxShadow: '0 4px 12px rgba(124,58,237,.25)',
        }}>
          <i className="fa fa-plus" /> Nueva venta
        </button>
      </div>

      {/* NAV MESES */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 14, padding: '10px 16px', marginBottom: 16 }}>
        <button onClick={prevMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt2)', fontSize: 14, padding: '4px 8px' }}><i className="fa fa-chevron-left" /></button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--txt)', letterSpacing: '-.3px' }}>{MESES[month]} {year}</div>
          <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 1 }}>{totals.count} {totals.count === 1 ? 'venta' : 'ventas'}</div>
        </div>
        <button onClick={nextMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt2)', fontSize: 14, padding: '4px 8px' }}><i className="fa fa-chevron-right" /></button>
      </div>

      {/* RESUMEN */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 18 }}>
        {[
          { label: 'Facturado', value: totals.facturado, icon: 'fa-file-invoice-dollar', color: '#7C3AED' },
          { label: 'IVA', value: totals.iva, icon: 'fa-percent', color: '#6366f1' },
          { label: 'Cobrado', value: totals.cobrado, icon: 'fa-circle-check', color: '#15803d' },
          { label: 'Pendiente', value: totals.pendiente, icon: 'fa-clock', color: '#b45309' },
        ].map(c => (
          <div key={c.label} style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
              <i className={`fa ${c.icon}`} style={{ color: c.color, fontSize: 12 }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>{c.label}</span>
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--txt)', fontVariantNumeric: 'tabular-nums' }}>{hidden ? '***' : fmt(c.value)}</div>
          </div>
        ))}
      </div>

      {/* TABLA */}
      <div style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
        <div className="vt-row vt-hdr">
          <span>Cliente</span><span>Producto</span>
          <span className="vt-cell-r">Cant</span><span className="vt-cell-r">Facturado</span>
          <span className="vt-cell-r vt-hide-m">IVA</span><span style={{ textAlign: 'center' }}>Cobro</span>
        </div>

        {monthBudgets.length === 0 && (
          <div style={{ padding: '40px 20px', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(124,58,237,.08)', color: '#7C3AED', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, marginBottom: 10 }}><i className="fa fa-receipt" /></div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--txt2)', marginBottom: 4 }}>Sin ventas en {MESES[month].toLowerCase()}</div>
            <div style={{ fontSize: 12, color: 'var(--txt3)' }}>Hacé click en <strong>Nueva venta</strong> para agregar la primera</div>
          </div>
        )}

        {monthBudgets.map(b => {
          const pi = payInfo(b)
          return (
            <div key={b.id} className="vt-row" style={{ cursor: 'pointer' }} onClick={() => nav(`/pedido/${b.id}`)}>
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
      <PendientesCobro budgets={allBudgets} hidden={hidden} nav={nav} />

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
        .sd-panel{position:fixed;top:0;right:0;bottom:0;z-index:9999;width:420px;max-width:100vw;background:var(--surface);border-left:1.5px solid var(--border);display:flex;flex-direction:column;animation:sd-slide-in .25s cubic-bezier(.4,0,.2,1);box-shadow:-8px 0 40px rgba(0,0,0,.2)}
        @keyframes sd-slide-in{from{transform:translateX(100%)}to{transform:translateX(0)}}
        .sd-header{padding:20px 22px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
        .sd-body{flex:1;overflow-y:auto;padding:20px 22px}
        .sd-footer{padding:14px 22px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:8px;flex-shrink:0;background:var(--surface);transition:background .3s}
        .sd-footer-flash{background:rgba(5,150,105,.08)}
        .sd-section{margin-bottom:20px}
        .sd-section-title{font-size:10px;font-weight:700;color:var(--txt3);text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px;display:flex;align-items:center;gap:6px}
        .sd-section-title i{font-size:11px;color:var(--brand);opacity:.7}
        .sd-fg{margin-bottom:14px}
        .sd-lbl{font-size:11px;font-weight:700;color:var(--txt3);margin-bottom:5px;display:block}
        .sd-inp{width:100%;padding:11px 14px;border:1.5px solid var(--border);border-radius:10px;font-size:14px;font-family:inherit;color:var(--txt);background:var(--bg);outline:none;box-sizing:border-box;transition:border-color .15s,box-shadow .15s}
        .sd-inp:focus{border-color:var(--brand);box-shadow:0 0 0 3px rgba(124,58,237,.1)}
        .sd-inp::placeholder{color:var(--txt4)}
        .sd-inp-icon{position:relative}
        .sd-inp-icon i{position:absolute;left:14px;top:50%;transform:translateY(-50%);color:var(--txt4);font-size:13px;pointer-events:none}
        .sd-inp-icon .sd-inp{padding-left:38px}
        .sd-sug{position:absolute;top:100%;left:0;right:0;z-index:100;background:var(--surface);border:1.5px solid var(--border);border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,.2);max-height:200px;overflow-y:auto;margin-top:4px}
        .sd-sug-item{padding:10px 14px;cursor:pointer;font-size:13px;color:var(--txt2);transition:background .1s;display:flex;align-items:center;justify-content:space-between;gap:8px}
        .sd-sug-item:hover{background:var(--surface2)}
        .sd-sug-item:first-child{border-radius:8px 8px 0 0}
        .sd-sug-item:last-child{border-radius:0 0 8px 8px}
        .sd-row{display:flex;gap:10px}
        .sd-row>*{flex:1;min-width:0}
        .sd-chips{display:flex;gap:6px;flex-wrap:wrap}
        .sd-chip{padding:7px 12px;border-radius:10px;font-size:11px;font-weight:700;border:1.5px solid var(--border);background:var(--bg);color:var(--txt3);cursor:pointer;font-family:inherit;transition:all .15s;display:inline-flex;align-items:center;gap:5px}
        .sd-chip:hover{border-color:var(--txt2);background:var(--surface2)}
        .sd-chip-on{border-width:2px}
        .sd-canal-chips{display:flex;gap:5px;flex-wrap:wrap}
        .sd-canal{padding:6px 10px;border-radius:8px;font-size:10px;font-weight:700;border:1.5px solid var(--border);background:var(--bg);color:var(--txt4);cursor:pointer;font-family:inherit;transition:all .15s;display:inline-flex;align-items:center;gap:4px}
        .sd-canal:hover{border-color:var(--txt3)}
        .sd-toggle{display:flex;align-items:center;gap:10px;cursor:pointer;user-select:none;padding:10px 14px;border:1.5px solid var(--border);border-radius:10px;background:var(--bg);transition:border-color .15s}
        .sd-toggle:hover{border-color:var(--txt3)}
        .sd-switch{width:38px;height:22px;border-radius:99px;position:relative;transition:background .2s;flex-shrink:0}
        .sd-switch::after{content:'';position:absolute;width:18px;height:18px;border-radius:50%;background:#fff;top:2px;left:2px;transition:transform .2s;box-shadow:0 1px 4px rgba(0,0,0,.2)}
        .sd-switch-on{background:var(--brand)}
        .sd-switch-on::after{transform:translateX(16px)}
        .sd-switch-off{background:var(--border)}
        .sd-btn{padding:11px 22px;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;justify-content:center;gap:7px;transition:filter .15s,transform .1s}
        .sd-btn:active{transform:scale(.97)}
        .sd-btn-pri{border:none;background:var(--grad);color:#fff;box-shadow:0 4px 12px rgba(124,58,237,.25);width:100%}
        .sd-btn-pri:hover{filter:brightness(1.05)}
        .sd-btn-sec{border:1.5px solid var(--border);background:var(--surface);color:var(--txt2);width:100%}
        .sd-btn-sec:hover{border-color:var(--txt3)}
        .sd-badge{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:8px;font-size:11px;font-weight:700;background:rgba(124,58,237,.1);color:var(--brand)}
        .sd-nota-link{font-size:12px;color:var(--txt3);cursor:pointer;border:none;background:none;font-family:inherit;padding:0;transition:color .15s;display:inline-flex;align-items:center;gap:5px}
        .sd-nota-link:hover{color:var(--txt2)}
        .sd-breakdown{display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:8px;background:rgba(124,58,237,.06);border:1px solid rgba(124,58,237,.15);margin-top:6px;font-size:11px;color:var(--txt2);font-weight:600;animation:sd-fade-in .2s ease}
        .sd-breakdown i{color:var(--brand);font-size:10px}
        .sd-saved-flash{display:flex;align-items:center;justify-content:center;gap:7px;padding:10px;border-radius:10px;background:rgba(5,150,105,.1);border:1.5px solid rgba(5,150,105,.25);color:#059669;font-size:12px;font-weight:700;animation:sd-pop .3s cubic-bezier(.17,.67,.25,1.3)}
        @keyframes sd-pop{0%{transform:scale(.9);opacity:0}100%{transform:scale(1);opacity:1}}
        @media(max-width:500px){.sd-panel{width:100vw;border-left:none}.sd-row{flex-direction:column}}
      `}</style>

      <div className="sd-overlay" onClick={onClose} />
      <div className="sd-panel">
        {/* Header */}
        <div className="sd-header">
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--txt)', letterSpacing: '-.3px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="fa fa-receipt" style={{ color: 'var(--brand)', fontSize: 15 }} />
              Nueva venta
            </div>
            {savedCount > 0 && (
              <div className="sd-badge" style={{ marginTop: 6 }}>
                <i className="fa fa-check" style={{ fontSize: 10 }} /> {savedCount} guardada{savedCount > 1 ? 's' : ''}
              </div>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--txt3)', fontSize: 18, cursor: 'pointer', padding: '4px 8px', borderRadius: 8 }}>
            <i className="fa fa-xmark" />
          </button>
        </div>

        {/* Body */}
        <div className="sd-body">
          {/* Seccion: Cliente */}
          <div className="sd-section">
            <div className="sd-section-title"><i className="fa fa-user" /> Cliente</div>
            <div className="sd-fg" style={{ marginBottom: 0 }}>
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
          </div>

          {/* Seccion: Producto y monto */}
          <div className="sd-section">
            <div className="sd-section-title"><i className="fa fa-tag" /> Detalle</div>
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
              <div className="sd-fg" style={{ marginBottom: showBreakdown ? 0 : 14 }}>
                <label className="sd-lbl">Cantidad</label>
                <input className="sd-inp" type="number" min="1" value={draft.cantidad}
                  onChange={e => setDraft(d => ({ ...d, cantidad: e.target.value }))}
                  style={{ textAlign: 'center', fontWeight: 700 }}
                />
              </div>
              <div className="sd-fg" style={{ marginBottom: showBreakdown ? 0 : 14 }}>
                <label className="sd-lbl">Monto facturado</label>
                <input className="sd-inp" placeholder="$0"
                  value={draft.facturado ? `$${draft.facturado}` : ''}
                  onChange={handleFacturadoChange}
                  style={{ textAlign: 'right', fontWeight: 700, fontSize: 16 }}
                />
              </div>
            </div>
            {/* Mejora 2: Chip desglose precio unitario */}
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

          {/* Seccion: Cobro y fecha */}
          <div className="sd-section">
            <div className="sd-section-title"><i className="fa fa-wallet" /> Cobro</div>
            <div className="sd-fg">
              <label className="sd-lbl">Estado</label>
              <div className="sd-chips">
                {PAY_OPTS.map(opt => (
                  <button key={opt.value}
                    className={`sd-chip ${draft.payStatus === opt.value ? 'sd-chip-on' : ''}`}
                    style={draft.payStatus === opt.value ? { background: opt.bg, color: opt.color, borderColor: opt.color } : {}}
                    onClick={() => setDraft(d => ({ ...d, payStatus: opt.value }))}>
                    <i className={`fa ${opt.icon}`} style={{ fontSize: 11 }} /> {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="sd-row">
              <div className="sd-fg">
                <label className="sd-lbl">Fecha</label>
                <input className="sd-inp" type="date" value={draft.fecha}
                  onChange={e => setDraft(d => ({ ...d, fecha: e.target.value }))}
                />
              </div>
              <div className="sd-fg">
                <label className="sd-lbl">IVA</label>
                <div className="sd-toggle" onClick={() => setDraft(d => ({ ...d, incluyeIva: !d.incluyeIva }))}>
                  <div className={`sd-switch ${draft.incluyeIva ? 'sd-switch-on' : 'sd-switch-off'}`} />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--txt2)' }}>{draft.incluyeIva ? 'Incluye 21%' : 'Sin IVA'}</div>
                    {draft.incluyeIva && ivaCalc() > 0 && <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 1 }}>IVA: {fmt(ivaCalc())}</div>}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Mejora 4: Canal de venta */}
          <div className="sd-section">
            <div className="sd-section-title"><i className="fa fa-bullhorn" /> Canal</div>
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

          {/* Nota opcional */}
          <div className="sd-section" style={{ marginBottom: 0 }}>
            {!showNota ? (
              <button className="sd-nota-link" onClick={() => setShowNota(true)}>
                <i className="fa fa-plus" style={{ fontSize: 10 }} /> Agregar nota interna
              </button>
            ) : (
              <div className="sd-fg" style={{ marginBottom: 0 }}>
                <label className="sd-lbl">Nota interna</label>
                <input className="sd-inp" placeholder="Ej: falta entregar, paga la semana que viene..."
                  value={draft.nota}
                  onChange={e => setDraft(d => ({ ...d, nota: e.target.value }))}
                />
              </div>
            )}
          </div>
        </div>

        {/* Footer con success flash */}
        <div className={`sd-footer ${justSaved ? 'sd-footer-flash' : ''}`}>
          {justSaved && (
            <div className="sd-saved-flash">
              <i className="fa fa-circle-check" /> Venta guardada — carga otra
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="sd-btn sd-btn-sec" onClick={() => saveEntry(true)} style={{ flex: 1 }}>
              <i className="fa fa-rotate" style={{ fontSize: 11 }} /> Guardar y otra
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

function PendientesCobro({ budgets, hidden, nav }) {
  const pendientes = useMemo(() =>
    budgets.filter(b => b.payStatus !== 'paid' && (Number(b.total) || 0) > 0).sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0)),
    [budgets]
  )
  if (pendientes.length === 0) return null
  const totalPend = pendientes.reduce((s, b) => { const t = Number(b.total) || 0; const d = Number(b.depositAmt) || 0; return s + (b.payStatus === 'partial' ? t - d : t) }, 0)

  return (
    <div style={{ marginTop: 20, background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <i className="fa fa-clock" style={{ color: '#b45309', fontSize: 13 }} />
          <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--txt)', letterSpacing: '-.2px' }}>Pendientes de cobro</span>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: '#fef3c7', color: '#92400e' }}>{pendientes.length}</span>
        </div>
        <span style={{ fontSize: 14, fontWeight: 800, color: '#b45309', fontVariantNumeric: 'tabular-nums' }}>{hidden ? '***' : fmt(totalPend)}</span>
      </div>
      {pendientes.slice(0, 8).map(b => {
        const days = Math.floor((Date.now() - (b.updatedAt || Date.now())) / 86400000)
        const owed = b.payStatus === 'partial' ? (Number(b.total) || 0) - (Number(b.depositAmt) || 0) : Number(b.total) || 0
        return (
          <div key={b.id} onClick={() => nav(`/pedido/${b.id}`)} style={{ padding: '10px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background .1s', gap: 8 }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface2)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.company || b.contact || '—'}</div>
              <div style={{ fontSize: 11, color: 'var(--txt3)' }}>
                {b.payStatus === 'partial' ? 'Señado' : 'Pendiente'}
                {days > 0 && <> · hace {days}d</>}
                {days > 30 && <span style={{ color: '#DC2626', fontWeight: 700 }}> — revisar</span>}
              </div>
            </div>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#b45309', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{hidden ? '***' : fmt(owed)}</span>
          </div>
        )
      })}
      {pendientes.length > 8 && <div style={{ padding: '10px 18px', textAlign: 'center', fontSize: 12, color: 'var(--txt3)' }}>y {pendientes.length - 8} mas...</div>}
    </div>
  )
}
