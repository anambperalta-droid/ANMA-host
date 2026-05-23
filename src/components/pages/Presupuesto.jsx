import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useData } from '../../context/DataContext'
import { useToast } from '../../context/ToastContext'
import { fmt } from '../../lib/storage'
import { getMPConfig, createPaymentLink, getBankConfig, buildBankInfoText } from '../../lib/mercadopago'
import { pushBudget, getSheetsConfig } from '../../lib/sheets'

/* ── Items legacy (backward compat) ── */
const emptyItem = () => ({ name: '', qty: 1, costUnit: '', priceUnit: '' })

/* ── Estructura Kit/Box modular ── */
const emptyPackComp = () => ({ id: '', name: '', costUnit: 0, qty: 1 })
const emptyProdComp = () => ({ id: '', name: '', costUnit: 0, qty: 1 })
const emptyKit = () => ({
  type: 'kit',
  name: '',
  qty: 1,
  priceUnit: 0,
  packaging: [],
  products: [],
  personalizacion: { desc: '', costUnit: 0 },
})

/* ── Alternativa de cotización ── */
const emptyAlt = (label = 'Alternativa 1') => ({ label, kits: [emptyKit()] })

/* ── Selector de producto (BottomSheet / modal) ── */
function ProductPicker({ open, onClose, products, onSelect }) {
  const [q, setQ] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (open) { setQ(''); setTimeout(() => inputRef.current?.focus(), 120) }
  }, [open])

  useEffect(() => {
    if (!open) return
    const h = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])

  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  const sq = q.toLowerCase()
  const filtered = q
    ? products.filter(p => (p.name || '').toLowerCase().includes(sq) || (p.cat || '').toLowerCase().includes(sq))
    : products

  return (
    <>
      <div className={`bsheet-overlay${open ? ' open' : ''}`} onClick={onClose} />
      <div className={`bsheet${open ? ' open' : ''}`} style={{ maxHeight: '70vh' }}>
        <div className="bsheet-handle" />
        <div style={{ padding: '6px 16px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 12, padding: '0 12px', height: 44 }}>
            <i className="fa fa-magnifying-glass" style={{ color: 'var(--txt4)', fontSize: 13 }} />
            <input ref={inputRef} type="text" value={q} onChange={e => setQ(e.target.value)}
              placeholder="Buscar producto..."
              style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: 14, color: 'var(--txt)', width: '100%', fontFamily: 'inherit' }} />
            {q && <button onClick={() => setQ('')} style={{ background: 'none', border: 'none', color: 'var(--txt4)', cursor: 'pointer', fontSize: 13, padding: 4 }}><i className="fa fa-xmark" /></button>}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px 16px' }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--txt3)', fontSize: 13 }}>
              <i className="fa fa-box-open" style={{ fontSize: 24, display: 'block', marginBottom: 8, opacity: .4 }} />
              {q ? 'Sin resultados' : 'No hay productos cargados'}
            </div>
          ) : filtered.map(p => (
            <button key={p.id} className="bsheet-item" onClick={() => { onSelect(p); onClose() }}>
              <div className="bsheet-item-ico" style={{ width: 36, height: 36, borderRadius: 10, fontSize: 15 }}>
                <i className="fa fa-box-open" />
              </div>
              <div className="bsheet-item-body">
                <div className="bsheet-item-title" style={{ fontSize: 13 }}>{p.name}</div>
                <div className="bsheet-item-sub">
                  {p.cat && <span>{p.cat} · </span>}
                  Costo: {fmt(p.cost || 0)}
                </div>
              </div>
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--money)', flexShrink: 0 }}>
                {fmt(Math.round((p.cost || 0) * 1.4))}
              </span>
            </button>
          ))}
        </div>
      </div>
    </>
  )
}

/* Utilidades de fecha */
const todayISO = () => new Date().toISOString().slice(0, 10)
const isWeekend = (iso) => { if (!iso) return false; const d = new Date(iso + 'T00:00'); const w = d.getDay(); return w === 0 || w === 6 }
const fmtDate = (iso) => { if (!iso) return ''; const [y,m,d] = String(iso).slice(0,10).split('-'); return `${d}/${m}/${y.slice(2)}` }

/* ── Helpers para inputs numéricos sin NaN ── */
const num = (v) => { const n = Number(v); return isNaN(n) ? 0 : n }
const selectOnFocus = (e) => e.target.select()
// Formato visual de inputs numéricos de tabla: "10000" → "10.000" (es-AR), sin signo $
const fmtTbl = (v) => (v === '' || v === undefined || v === null) ? '' : (Number(v) || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })
const parseTbl = (s) => s.replace(/\./g, '').replace(/[^\d]/g, '')

/* ── Validación WhatsApp ── */
const isValidWA = (v) => { if (!v) return true; const cleaned = v.replace(/[\s\-()]/g, ''); return /^[+]?\d{8,15}$/.test(cleaned) }

/* ── Pasos del wizard ── */
const WIZARD_STEPS = [
  { id: 1, icon: 'fa-user-tie', label: 'Cliente', desc: 'Contacto y datos' },
  { id: 2, icon: 'fa-box-open', label: 'Productos', desc: 'Items del pedido' },
  { id: 3, icon: 'fa-truck', label: 'Entrega', desc: 'Envío y precio' },
  { id: 4, icon: 'fa-check-double', label: 'Confirmar', desc: 'Revisar y enviar' },
]

/* ── Encabezado de panel ── */
function PaneHeader({ icon, title, subtitle }) {
  return (
    <div className="wiz-pane-head">
      <div className="wiz-pane-ico"><i className={`fa ${icon}`} /></div>
      <div>
        <div className="wiz-pane-title">{title}</div>
        {subtitle && <div className="wiz-pane-sub">{subtitle}</div>}
      </div>
    </div>
  )
}

/* ── Combobox buscador de clientes ── */
function ClientCombo({ clients, value, onSelect, onChange }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState(value)
  const ref = useRef()

  useEffect(() => { setQ(value) }, [value])

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const lq = q.toLowerCase()
  const filtered = q
    ? clients.filter(c => (c.contact || '').toLowerCase().includes(lq) || (c.company || '').toLowerCase().includes(lq)).slice(0, 8)
    : clients.slice(0, 8)

  const pick = (c) => { setQ(c.contact || c.company); onSelect(c); setOpen(false) }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input type="text" value={q}
        onChange={e => { setQ(e.target.value); onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder="Buscar cliente por nombre o empresa..."
        autoComplete="off" />
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
          background: 'var(--surface)', border: '1.5px solid var(--brand)', borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,.1)', maxHeight: 220, overflowY: 'auto', marginTop: 3
        }}>
          {filtered.map(c => (
            <div key={c.id} onClick={() => pick(c)} style={{
              padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
              borderBottom: '1px solid var(--border)', transition: 'background .1s',
            }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--brand-xlt)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--grad)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                {(c.company || c.contact || '?')[0].toUpperCase()}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--txt)' }}>{c.contact || '—'}</div>
                <div style={{ fontSize: 10, color: 'var(--txt3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.company}{c.wa ? ` · ${c.wa}` : ''}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Presupuesto() {
  const { id } = useParams()
  const nav = useNavigate()
  const { get, set, config, saveBudget } = useData()
  const toast = useToast()
  const c = config()
  const feats = c.features || {}

  const [form, setForm] = useState({
    contact: '', company: '', wa: '', clientEmail: '', ocasion: '', delivery: '', deliveryDate: '',
    shipCost: 0, shipCharged: false, envioACotizar: true, status: 'draft', payStatus: 'pending', noteInt: '', noteCli: '',
    margin: c.defaultMargin || 40, deposit: c.defaultDeposit || 50, logoCost: 0, discount: 0,
  })
  const [alternatives, setAlternatives] = useState([emptyAlt()])
  const [activeAltIdx, setActiveAltIdx] = useState(0)
  // Vista derivada: todo el código que LEE `items` funciona sin cambios
  const items = alternatives[activeAltIdx]?.kits ?? [emptyKit()]
  // Adaptador: todo el código que ESCRIBE con setItems opera sobre la alt activa
  const setItems = (fn) => setAlternatives(prev => prev.map((alt, i) =>
    i !== activeAltIdx ? alt : { ...alt, kits: typeof fn === 'function' ? fn(alt.kits) : fn }
  ))
  const [editId, setEditId] = useState(null)
  const [marginBudgetedSaved, setMarginBudgetedSaved] = useState(null)
  const [mpResult, setMpResult] = useState('')
  const [mpLoading, setMpLoading] = useState(false)
  const [previewHtml, setPreviewHtml] = useState('')
  const [waTouched, setWaTouched] = useState(false)
  const [currentStep, setCurrentStep] = useState(1)
  const [draftRestored, setDraftRestored] = useState(false)

  const clients = get('clients')
  const products = get('products')
  const insumos = get('insumos', [])
  const marginPct = c.defaultMargin || 40

  /* ── Draft persistence ── */
  const DRAFT_KEY = 'anma_rg_presup_draft'

  useEffect(() => {
    if (id) {
      const b = get('budgets').find(x => x.id === Number(id))
      if (b) {
        setForm({
          contact: b.contact || '', company: b.company || '', wa: b.wa || '', clientEmail: b.clientEmail || '',
          ocasion: b.ocasion || '', delivery: b.delivery || '', deliveryDate: b.deliveryDate || '',
          shipCost: b.shipCost || 0, shipCharged: b.shipCharged !== false,
          status: b.status || 'draft',
          noteInt: b.noteInt || '', noteCli: b.noteCli || '',
          payStatus: b.payStatus || 'pending',
          margin: b.margin ?? c.defaultMargin ?? 40,
          deposit: b.deposit ?? c.defaultDeposit ?? 50,
          logoCost: b.logoCost || 0,
          discount: b.discount || 0,
        })
        // Backward compat: si ya tiene alternatives las carga; si no, envuelve items en Alternativa 1
        if (b.alternatives?.length) {
          setAlternatives(b.alternatives)
        } else {
          setAlternatives([{ label: 'Alternativa 1', kits: b.items?.length ? b.items : [emptyKit()] }])
        }
        setEditId(b.id)
        setMarginBudgetedSaved(typeof b.marginBudgeted === 'number' ? b.marginBudgeted : null)
      }
    } else {
      try {
        const saved = localStorage.getItem(DRAFT_KEY)
        if (saved) {
          const { f, it, step } = JSON.parse(saved)
          if (f) setForm(prev => ({ ...prev, ...f }))
          if (it?.length) {
            // it puede ser formato nuevo (array de alternatives) o viejo (array plano de kits)
            if (it[0]?.kits) {
              setAlternatives(it)
            } else {
              setAlternatives([{ label: 'Alternativa 1', kits: it }])
            }
          }
          if (step) setCurrentStep(step)
          setDraftRestored(true)
          toast('Borrador restaurado — tus datos anteriores están cargados', 'ok')
        }
      } catch {}
    }
  }, [id]) // eslint-disable-line

  useEffect(() => {
    if (id) return
    const hasSomeData = form.contact || form.company || alternatives.some(a => a.kits.some(i => i.name))
    if (hasSomeData) {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ f: form, it: alternatives, step: currentStep }))
    }
  }, [form, items, currentStep]) // eslint-disable-line

  const setF = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const handleClientSelect = (client) => {
    setForm(f => ({ ...f, contact: client.contact || '', company: client.company || '', wa: client.wa || '', clientEmail: client.email || '' }))
  }

  const updateItem = (idx, key, val) => {
    setItems(prev => prev.map((it, i) => {
      if (i !== idx) return it
      const updated = { ...it, [key]: val }
      if (key === 'name') {
        const match = products.find(p => p.name === val)
        if (match) {
          updated.costUnit = match.cost || 0
          updated.priceUnit = Math.round(num(match.cost) * (1 + marginPct / 100))
        }
      }
      return updated
    }))
  }
  const addItem = () => setItems(prev => [...prev, emptyItem()])
  const removeItem = (idx) => setItems(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev)

  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerIdx, setPickerIdx] = useState(null)
  const openPicker = (idx) => { setPickerIdx(idx); setPickerOpen(true) }
  const handlePickProduct = useCallback((p) => {
    if (pickerIdx === null) return
    setAlternatives(prev => prev.map((alt, ai) => {
      if (ai !== activeAltIdx) return alt
      return {
        ...alt,
        kits: alt.kits.map((it, i) => {
          if (i !== pickerIdx) return it
          return { ...it, name: p.name, costUnit: p.cost || 0, priceUnit: Math.round(num(p.cost) * (1 + marginPct / 100)) }
        })
      }
    }))
  }, [pickerIdx, marginPct, activeAltIdx])

  /* ── Gestión de alternativas ── */
  const addAlt = () => {
    const label = `Alternativa ${alternatives.length + 1}`
    setAlternatives(prev => [...prev, emptyAlt(label)])
    setActiveAltIdx(alternatives.length)
  }
  const removeAlt = (altIdx) => {
    if (alternatives.length <= 1) return
    setAlternatives(prev => prev.filter((_, i) => i !== altIdx))
    setActiveAltIdx(prev => Math.min(prev, alternatives.length - 2))
  }
  const updateAltLabel = (altIdx, label) =>
    setAlternatives(prev => prev.map((a, i) => i !== altIdx ? a : { ...a, label }))
  // Aprobación exclusiva: solo una alt puede estar aprobada; click en la aprobada la desaprueba
  const approveAlt = (altIdx) =>
    setAlternatives(prev => prev.map((a, i) => ({ ...a, approved: i === altIdx ? !a.approved : false })))

  /* ── Kit builder — state para pickers ── */
  const [kitProdPickerOpen, setKitProdPickerOpen] = useState(false)
  const [kitProdPickerTarget, setKitProdPickerTarget] = useState(null) // { kitIdx, cIdx }
  const [insPickerOpen, setInsPickerOpen] = useState(false)
  const [insPickerTarget, setInsPickerTarget] = useState(null) // { kitIdx, cIdx }

  /* ── Kit builder — funciones de manipulación ── */
  const addKit = () => setItems(prev => [...prev, emptyKit()])
  const removeKit = (kitIdx) => setItems(prev => prev.length > 1 ? prev.filter((_, i) => i !== kitIdx) : prev)
  const updateKit = (kitIdx, key, val) => setItems(prev => prev.map((k, i) => i !== kitIdx ? k : { ...k, [key]: val }))

  // Componente A — Packaging / Insumos
  const addPackComp = (kitIdx) => setItems(prev => prev.map((k, i) => i !== kitIdx ? k : { ...k, packaging: [...(k.packaging || []), emptyPackComp()] }))
  const removePackComp = (kitIdx, cIdx) => setItems(prev => prev.map((k, i) => i !== kitIdx ? k : { ...k, packaging: (k.packaging || []).filter((_, j) => j !== cIdx) }))
  const updatePackComp = (kitIdx, cIdx, key, val) => setItems(prev => prev.map((k, i) => {
    if (i !== kitIdx) return k
    return { ...k, packaging: (k.packaging || []).map((c, j) => j !== cIdx ? c : { ...c, [key]: val }) }
  }))

  // Componente B — Productos del kit
  const addProdComp = (kitIdx) => setItems(prev => prev.map((k, i) => i !== kitIdx ? k : { ...k, products: [...(k.products || []), emptyProdComp()] }))
  const removeProdComp = (kitIdx, cIdx) => setItems(prev => prev.map((k, i) => i !== kitIdx ? k : { ...k, products: (k.products || []).filter((_, j) => j !== cIdx) }))
  const updateProdComp = (kitIdx, cIdx, key, val) => setItems(prev => prev.map((k, i) => {
    if (i !== kitIdx) return k
    return { ...k, products: (k.products || []).map((c, j) => j !== cIdx ? c : { ...c, [key]: val }) }
  }))

  // Componente C — Personalización
  const updatePersonalizacion = (kitIdx, key, val) => setItems(prev => prev.map((k, i) => {
    if (i !== kitIdx) return k
    return { ...k, personalizacion: { ...(k.personalizacion || {}), [key]: val } }
  }))

  /* ── Drag & drop de filas ── */
  const dragIdxRef = useRef(null)
  const [dragOver, setDragOver] = useState(null)
  const handleDragStart = (idx) => (e) => { dragIdxRef.current = idx; e.dataTransfer.effectAllowed = 'move' }
  const handleDragOver = (idx) => (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dragOver !== idx) setDragOver(idx) }
  const handleDragLeave = () => setDragOver(null)
  const handleDrop = (idx) => (e) => {
    e.preventDefault()
    const from = dragIdxRef.current
    setDragOver(null)
    dragIdxRef.current = null
    if (from == null || from === idx) return
    setItems(prev => {
      const copy = [...prev]
      const [moved] = copy.splice(from, 1)
      copy.splice(idx, 0, moved)
      return copy
    })
  }

  /* ── Helper: costo unitario de un kit ── */
  const kitCostUnit = (kit) => {
    let cu = num(kit.personalizacion?.costUnit)
    ;(kit.packaging || []).forEach(p => { cu += num(p.costUnit) * num(p.qty) })
    ;(kit.products || []).forEach(p => { cu += num(p.costUnit) * num(p.qty) })
    return cu
  }

  const calc = useMemo(() => {
    let totalCost = 0, totalRevenue = 0, totalQty = 0
    items.forEach(item => {
      if (item.type === 'kit') {
        const q = num(item.qty)
        const cu = (() => {
          let c2 = num(item.personalizacion?.costUnit)
          ;(item.packaging || []).forEach(p => { c2 += num(p.costUnit) * num(p.qty) })
          ;(item.products || []).forEach(p => { c2 += num(p.costUnit) * num(p.qty) })
          return c2
        })()
        totalCost += q * cu
        totalRevenue += q * num(item.priceUnit)
        totalQty += q
      } else {
        const q = num(item.qty), c2 = num(item.costUnit), p = num(item.priceUnit)
        totalCost += q * c2; totalRevenue += q * p; totalQty += q
      }
    })
    const logTotal = num(form.logoCost) * totalQty
    const ship = num(form.shipCost)
    const shipCharged = form.shipCharged !== false
    const baseCost = totalCost + logTotal + ship
    const discountPct = Math.min(Math.max(num(form.discount), 0), 100)
    const discountAmt = Math.round(totalRevenue * discountPct / 100)
    const total = totalRevenue - discountAmt + (shipCharged ? ship : 0)
    const gain = total - baseCost
    const marginReal = total > 0 ? ((gain / total) * 100).toFixed(1) : '0.0'
    const marginThreshold = num(c.marginLowThreshold) || 10
    const marginLow = total > 0 && Number(marginReal) < marginThreshold
    const depositAmt = Math.round(total * num(form.deposit) / 100)
    return { totalCost, totalRevenue, logTotal, baseCost, total, gain, marginReal, marginLow, marginThreshold, depositAmt, totalQty, discountAmt, discountPct }
  }, [items, form.shipCost, form.shipCharged, form.logoCost, form.deposit, form.discount, c.marginLowThreshold])

  /* ── Lógica de flujo: venta directa vs. cotización ──
     showPaymentDetails = true  → 1 sola opción  O  hay una opción aprobada
     showPaymentDetails = false → múltiples opciones sin aprobar (modo cotización)          */
  const isMultiAlt = alternatives.length > 1
  const approvedAlt = alternatives.find(a => a.approved) || null
  const showPaymentDetails = !isMultiAlt || approvedAlt !== null

  const budgetNum = useMemo(() => {
    if (editId) { const b = get('budgets').find(x => x.id === editId); return b?.num || '#—' }
    const num = c.nextNum || 1
    return `${c.budgetPrefix || 'AN'}-${String(num).padStart(4, '0')}`
  }, [editId, c.nextNum, c.budgetPrefix])

  /* ── Descuento de stock para la alternativa aprobada ── */
  const deductStockForApprovedAlt = () => {
    // Si ninguna alt está marcada como aprobada, usa la primera
    const approvedAlt = alternatives.find(a => a.approved) || alternatives[0]
    if (!approvedAlt?.kits?.length) return
    const allInsumos = [...get('insumos', [])]
    const allProducts = [...get('products', [])]
    approvedAlt.kits.forEach(kit => {
      const kitQty = num(kit.qty)
      // Packaging / Insumos (componente A)
      ;(kit.packaging || []).forEach(comp => {
        if (!comp.name) return
        const i = allInsumos.findIndex(x => (comp.id && x.id === comp.id) || x.name === comp.name)
        if (i > -1 && typeof allInsumos[i].stock === 'number') {
          allInsumos[i] = { ...allInsumos[i], stock: Math.max(0, allInsumos[i].stock - num(comp.qty) * kitQty) }
        }
      })
      // Productos del kit (componente B)
      ;(kit.products || []).forEach(comp => {
        if (!comp.name) return
        const i = allProducts.findIndex(x => (comp.id && x.id === comp.id) || x.name === comp.name)
        if (i > -1 && typeof allProducts[i].stock === 'number') {
          allProducts[i] = { ...allProducts[i], stock: Math.max(0, allProducts[i].stock - num(comp.qty) * kitQty) }
        }
      })
    })
    set('insumos', allInsumos)
    set('products', allProducts)
  }

  const handleSave = () => {
    if (!form.contact && !form.company) { toast('Falta el cliente. Cargá un nombre de contacto o empresa.', 'er'); return }
    if (form.wa && !isValidWA(form.wa)) { toast('El WhatsApp no tiene un formato válido. Ej: +54 351 1234567', 'er'); setWaTouched(true); return }
    const validItems = items.filter(i => i.type === 'kit'
      ? (i.name || (i.packaging?.length > 0) || (i.products?.length > 0))
      : i.name
    ).map(i => i.type === 'kit'
      ? { ...i, qty: num(i.qty), priceUnit: num(i.priceUnit) }
      : { ...i, qty: num(i.qty), costUnit: num(i.costUnit), priceUnit: num(i.priceUnit) }
    )
    if (!validItems.length) { toast('Completá al menos un Kit o producto en el Paso 2.', 'er'); return }
    const saveForm = { ...form, shipCost: 0, shipCharged: false, envioACotizar: form.envioACotizar !== false, logoCost: num(form.logoCost), margin: num(form.margin), deposit: num(form.deposit), payStatus: form.payStatus || 'pending' }
    const marginBudgeted = marginBudgetedSaved !== null ? marginBudgetedSaved : Number(calc.marginReal)
    // Descuento de stock: solo al pasar a "En preparación" y solo una vez
    const wasStockDeducted = editId ? (get('budgets').find(b => b.id === editId)?.stockDeducted === true) : false
    const willDeductStock = form.status === 'inprogress' && !wasStockDeducted
    if (willDeductStock) {
      deductStockForApprovedAlt()
      const approvedLabel = (alternatives.find(a => a.approved) || alternatives[0])?.label || 'Alternativa 1'
      toast(`Stock descontado — ${approvedLabel}`, 'ok')
    }
    const savedBudget = saveBudget({ ...(editId ? { id: editId } : {}), ...saveForm, items: validItems, alternatives, stockDeducted: wasStockDeducted || willDeductStock, totalCost: calc.baseCost, totalGain: calc.gain, total: calc.total, depositAmt: calc.depositAmt, marginBudgeted })
    if (!editId) setMarginBudgetedSaved(marginBudgeted)
    setDraftRestored(false)
    localStorage.removeItem(DRAFT_KEY)
    toast('Presupuesto guardado', 'ok')
    const gs = getSheetsConfig()
    if (gs.enabled && gs.autoSync && gs.url && savedBudget) {
      pushBudget(savedBudget).then(r => {
        if (r.ok) toast('Sincronizado con Google Sheets', 'ok')
      }).catch(() => {})
    }
    nav('/')
  }

  /* ── Validación por paso ── */
  const stepError = (step) => {
    if (step === 1) {
      if (!form.contact && !form.company) return 'Cargá un contacto o nombre de empresa para continuar.'
      if (form.wa && !isValidWA(form.wa)) return 'El WhatsApp no tiene un formato válido. Ej: +54 351 1234567'
      return null
    }
    if (step === 2) {
      const hasItem = alternatives.some(a => a.kits.some(i => i.type === 'kit'
        ? (i.name || (i.packaging?.length > 0) || (i.products?.length > 0))
        : i.name))
      if (!hasItem) return 'Agregá al menos un Kit con nombre, insumos o productos.'
      return null
    }
    return null
  }
  const goNext = () => {
    const err = stepError(currentStep)
    if (err) { toast(err, 'er'); if (currentStep === 1 && form.wa) setWaTouched(true); return }
    setCurrentStep(s => Math.min(WIZARD_STEPS.length, s + 1))
  }
  const goPrev = () => setCurrentStep(s => Math.max(1, s - 1))
  const goStep = (id) => {
    if (id <= currentStep) { setCurrentStep(id); return }
    for (let s = currentStep; s < id; s++) {
      const err = stepError(s)
      if (err) { toast(err, 'er'); return }
    }
    setCurrentStep(id)
  }

  const waText = useMemo(() => {
    const bName = c.businessName || 'ANMA'
    const discPct = Math.min(Math.max(num(form.discount), 0), 100)
    const multiAlt = alternatives.length > 1

    const altBlocks = alternatives.map((alt, ai) => {
      const validKits = alt.kits.filter(k => k.type === 'kit'
        ? (k.name || k.packaging?.length || k.products?.length) : k.name)
      if (!validKits.length) return null
      const altLabel = alt.label || `Alternativa ${ai + 1}`
      const lines = []
      let altRev = 0

      validKits.forEach(kit => {
        const kQty = num(kit.qty)
        altRev += kQty * num(kit.priceUnit)
        lines.push(`\n*🎁 ${kit.name || 'Kit sin nombre'}* ×${kQty}  →  ${fmt(kQty * num(kit.priceUnit))}`)

        const packItems = (kit.packaging || []).filter(c => c.name)
        if (packItems.length) {
          lines.push('  📦 *Packaging / Insumos:*')
          packItems.forEach(c => {
            const totalU = num(c.qty || 1) * kQty
            lines.push(`    • ${totalU}x ${c.name}${num(c.costUnit) > 0 ? ` — ${fmt(num(c.costUnit))} u. — ${fmt(num(c.costUnit) * totalU)}` : ''}`)
          })
        }

        const prodItems = (kit.products || []).filter(c => c.name)
        if (prodItems.length) {
          lines.push('  ✨ *Contenido del Kit:*')
          prodItems.forEach(c => {
            const totalU = num(c.qty || 1) * kQty
            lines.push(`    • ${totalU}x ${c.name}${num(c.costUnit) > 0 ? ` — ${fmt(num(c.costUnit))} u. — ${fmt(num(c.costUnit) * totalU)}` : ''}`)
          })
        }

        const hasPers = kit.personalizacion?.desc || num(kit.personalizacion?.costUnit) > 0
        if (hasPers) {
          const persTotal = num(kit.personalizacion?.costUnit) * kQty
          lines.push(`  🎨 *Personalización:* ${kit.personalizacion?.desc || ''}${persTotal > 0 ? ` — ${fmt(persTotal)}` : ''}`)
        }
      })

      const discAmt = Math.round(altRev * discPct / 100)
      const altTotal = altRev - discAmt
      const isApproved = multiAlt && alt.approved
      return [
        `*${multiAlt ? `${ai + 1}. ` : ''}${altLabel}*${isApproved ? ' ✅' : ''}`,
        ...lines,
        ``,
        `💰 *Total: ${fmt(altTotal)}*${discAmt > 0 ? ` _(descuento ${discPct}%)_` : ''}`,
      ].join('\n')
    }).filter(Boolean)

    const intro = `Hola ${form.contact || '[NOMBRE]'}! Te envío el presupuesto de *${bName}* para ${form.company || '[EMPRESA]'}.`
    const body = multiAlt
      ? `\n\nTe mando *${altBlocks.length} opciones* para que elijas la que mejor te quede:\n\n${altBlocks.join('\n\n────────────────────\n\n')}`
      : `\n\n${altBlocks[0] || ''}`
    const footer = `\n\n*Entrega estimada:* ${form.deliveryDate ? fmtDate(form.deliveryDate) : 'A coordinar'}${form.noteCli ? '\n*Nota:* ' + form.noteCli : ''}\n\n¿Te quedó alguna duda? ¡Quedamos a disposición!`
    return intro + body + footer
  }, [form, alternatives, c.businessName])

  const mpCfg = getMPConfig()
  const bankCfg = getBankConfig()

  const generateMP = async () => {
    const mp = getMPConfig()
    if (!mp.enabled || !mp.token) { toast('Activá y configurá Mercado Pago en Configuración > Pagos.', 'er'); return }
    setMpLoading(true)
    try {
      const budget = { num: budgetNum, contact: form.contact, company: form.company, items, shipCost: form.shipCost }
      const result = await createPaymentLink({ budget, mp, depositPct: form.deposit })
      if (result.ok) {
        setMpResult(`<a href="${result.link}" target="_blank" style="color:#009EE3;word-break:break-all">${result.amountLabel}: ${fmt(result.amount)} — Abrir link</a>`)
        toast('Link de pago creado', 'ok')
      } else {
        setMpResult(`<span style="color:var(--red)">Error: ${result.message}</span>`)
      }
    } catch { setMpResult('<span style="color:var(--red)">Error de conexión</span>') }
    setMpLoading(false)
  }

  const waPhone = () => form.wa.replace(/[^\d]/g, '')

  const sendWhatsApp = () => {
    const phone = waPhone()
    if (!phone) { toast('El cliente no tiene número de WhatsApp cargado.', 'er'); return }
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(waText)}`, '_blank')
  }

  const sendPaymentByWA = () => {
    const bank = getBankConfig()
    if (!bank.enabled) { toast('Activá la transferencia bancaria en Configuración > Pagos.', 'er'); return }
    const phone = waPhone()
    if (!phone) { toast('El cliente no tiene número de WhatsApp cargado.', 'er'); return }
    const fullText = `${waText}\n\n${buildBankInfoText(bank, c.businessName || 'ANMA')}`
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(fullText)}`, '_blank')
  }

  const sendBankDataByWA = () => {
    const bank = getBankConfig()
    if (!bank.enabled) { toast('Activá la transferencia bancaria en Configuración > Pagos.', 'er'); return }
    if (!bank.cbu && !bank.alias) { toast('Cargá al menos CBU o Alias en Configuración > Pagos.', 'er'); return }
    const phone = waPhone()
    if (!phone) { toast('El cliente no tiene número de WhatsApp cargado.', 'er'); return }
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(buildBankInfoText(bank, c.businessName || 'ANMA'))}`, '_blank')
  }

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        if (previewHtml) { setPreviewHtml(''); return }
      }
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [previewHtml])

  const buildPdfHtml = () => {
    const fmtD = iso => { if (!iso) return ''; const p = String(iso).slice(0,10).split('-'); return p.length===3 ? `${p[2]}/${p[1]}/${p[0]}` : iso }
    const brandColor = c.brandColor || '#7C3AED'
    const bName = c.businessName || 'ANMA'
    /* ── Colores de marca ── */
    const bc  = brandColor
    const bg  = bc + '0e'
    const bg2 = bc + '07'
    const bdr = bc + '28'

    /* ── Helper: sub-fila — qty y precio por kit individual (sin multiplicar por pedido) ── */
    const subRow = (label, qtyPerKit, unitCost, isLast = false) => {
      const qty       = num(qtyPerKit || 1)
      const lineTotal = num(unitCost) * qty
      const botBdr    = isLast ? `2px solid ${bdr}` : `1px solid #EBEBF2`
      return `
        <tr>
          <td style="background:${bg2};border-left:3px solid ${bc};border-bottom:${botBdr};padding:4px 9px 4px 30px">
            <span style="color:${bc};opacity:.35;font-size:10px;margin-right:5px">↳</span>
            <span style="color:#374151;font-size:9.5px">${label}</span>
          </td>
          <td style="background:${bg2};border-bottom:${botBdr};text-align:center;font-size:9px;color:#6B7280">${qty}</td>
          <td style="background:${bg2};border-bottom:${botBdr};text-align:right;font-size:9px;color:#6B7280;font-variant-numeric:tabular-nums">${unitCost > 0 ? fmt(unitCost) : ''}</td>
          <td style="background:${bg2};border-bottom:${botBdr};text-align:right;font-size:9px;color:#6B7280;font-variant-numeric:tabular-nums;font-weight:${lineTotal > 0 ? 600 : 400}">${lineTotal > 0 ? fmt(lineTotal) : ''}</td>
        </tr>`
    }

    /* ── Helper: fila de encabezado de bloque A / B / C ── */
    const blockHdrRow = (emoji, label, blockBg) => `
      <tr>
        <td colspan="4" style="background:${blockBg};border-left:3px solid ${bc};padding:4px 9px 3px 20px;font-size:8px;font-weight:700;color:#374151;letter-spacing:.35px;text-transform:uppercase;border-bottom:1px solid #EBEBF2">
          ${emoji}&nbsp; ${label}
        </td>
      </tr>`

    /* ── Helper: cálculo de totales para una lista de kits ── */
    const calcAltTotals = (kits) => {
      let rev = 0
      kits.forEach(k => { rev += num(k.qty) * num(k.priceUnit) })
      const dp = Math.min(Math.max(num(form.discount), 0), 100)
      const da = Math.round(rev * dp / 100)
      const tot = rev - da
      return { revenue: rev, total: tot, discAmt: da, discPct: dp, depositAmt: Math.round(tot * num(form.deposit) / 100) }
    }

    const isMultiAlt = alternatives.length > 1
    const approvedAltPdf = alternatives.find(a => a.approved) || null
    /* showPayPdf: muestra seña, saldo e IVA solo en venta directa o con opción aprobada */
    const showPayPdf = !isMultiAlt || approvedAltPdf !== null

    /* ── Generar filas de todas las alternativas ── */
    const allAltRows = alternatives.map((alt, altIdx) => {
      const altKits = alt.kits.filter(i => i.type === 'kit'
        ? (i.name || i.packaging?.length || i.products?.length) : i.name)
      if (!altKits.length) return ''
      const altLabel  = alt.label || `Alternativa ${altIdx + 1}`
      const altTotals = calcAltTotals(altKits)

      /* Separador entre alternativas */
      const altSep = (altIdx > 0 && isMultiAlt)
        ? `<tr><td colspan="4" style="height:16px;padding:0;background:#fff;border:none"></td></tr>` : ''

      /* Encabezado de alternativa (solo si hay más de una) */
      const altHdr = isMultiAlt ? `
        <tr>
          <td colspan="4" style="background:${bc};padding:8px 12px;border:none">
            <table width="100%" cellpadding="0" cellspacing="0"><tr>
              <td style="vertical-align:middle">
                <span style="display:inline-block;text-align:center;width:18px;height:18px;line-height:18px;background:rgba(255,255,255,.2);color:#fff;border-radius:4px;font-size:9px;font-weight:800">${altIdx + 1}</span>
                <span style="font-size:12px;font-weight:800;color:#fff;letter-spacing:-.1px">${altLabel}</span>
                ${alt.approved ? '<span style="font-size:8px;font-weight:700;background:rgba(255,255,255,.25);color:#fff;padding:2px 8px;border-radius:3px;text-transform:uppercase;letter-spacing:.3px">✓ Aprobada</span>' : ''}
              </td>
              <td style="text-align:right;vertical-align:middle">
                <span style="font-size:13px;font-weight:800;color:rgba(255,255,255,.9)">${fmt(altTotals.total)}</span>
              </td>
            </tr></table>
          </td>
        </tr>` : ''

      /* Filas de kits dentro de la alternativa */
      const kitRows = altKits.flatMap((i, kitN) => {
        /* Separador entre kits */
        const kitSep = kitN > 0
          ? `<tr><td colspan="4" style="height:10px;padding:0;background:${isMultiAlt ? '#FAFAFA' : '#fff'};border:none"></td></tr>` : ''

        /* Fila principal del kit */
        const kitRow = `
          <tr>
            <td style="background:${bg};border-left:3px solid ${bc};border-bottom:none;padding:9px 9px 5px">
              <span style="display:inline-block;text-align:center;width:17px;height:17px;line-height:17px;background:${bc};color:#fff;border-radius:4px;font-size:8px;font-weight:800;letter-spacing:-.2px">K</span>
              <strong style="font-size:12px;color:#1E1B4B;letter-spacing:-.2px">${i.name || 'Kit sin nombre'}</strong>
            </td>
            <td style="background:${bg};border-bottom:none;text-align:center;font-weight:700;font-size:12px;padding:9px 9px 5px">${i.qty}</td>
            <td style="background:${bg};border-bottom:none;text-align:right;padding:9px 9px 5px">${fmt(i.priceUnit)}</td>
            <td style="background:${bg};border-bottom:none;text-align:right;font-weight:800;font-size:13px;color:${bc};padding:9px 9px 5px">${fmt(num(i.qty) * num(i.priceUnit))}</td>
          </tr>`

        /* ── Bloque A: Packaging / Insumos ── */
        const packItems = (i.packaging || []).filter(c => c.name)
        const packHdr   = packItems.length ? blockHdrRow('📦', 'A. Packaging / Insumos', '#F5F3FF') : ''
        const packRowsHtml = packItems.map((c, ci, arr) => {
          const isLast = ci === arr.length - 1 && !(i.products || []).some(p => p.name) && !i.personalizacion?.desc && !num(i.personalizacion?.costUnit)
          return subRow(c.name, num(c.qty || 1), num(c.costUnit), isLast)
        })

        /* ── Bloque B: Contenido del Kit ── */
        const prodItems = (i.products || []).filter(c => c.name)
        const prodHdr   = prodItems.length ? blockHdrRow('✨', 'B. Contenido del Kit', '#F0FDF4') : ''
        const prodRowsHtml = prodItems.map((c, ci, arr) => {
          const isLast = ci === arr.length - 1 && !i.personalizacion?.desc && !num(i.personalizacion?.costUnit)
          return subRow(c.name, num(c.qty || 1), num(c.costUnit), isLast)
        })

        /* ── Bloque C: Personalización ── */
        const hasPers = i.personalizacion?.desc || num(i.personalizacion?.costUnit) > 0
        const persHdr = hasPers ? blockHdrRow('🎨', 'C. Personalización', '#FFFBEB') : ''
        const persRow = hasPers ? subRow(
          i.personalizacion?.desc || 'Personalización / Logo',
          1, num(i.personalizacion?.costUnit), true
        ) : ''

        /* Fila de cierre si no hay sub-filas */
        const closingRow = (!packItems.length && !prodItems.length && !hasPers)
          ? `<tr><td style="background:${bg2};border-left:3px solid ${bc};border-bottom:2px solid ${bdr};padding:3px 0"></td><td style="background:${bg2};border-bottom:2px solid ${bdr}"></td><td style="background:${bg2};border-bottom:2px solid ${bdr}"></td><td style="background:${bg2};border-bottom:2px solid ${bdr}"></td></tr>` : ''

        return [kitSep, kitRow, packHdr, ...packRowsHtml, prodHdr, ...prodRowsHtml, persHdr, persRow, closingRow].filter(Boolean)
      }).join('')

      /* Fila de total por alternativa (solo si hay más de una) */
      const altTotalRow = isMultiAlt ? `
        <tr>
          <td colspan="2" style="padding:7px 12px;background:${bc}1a;font-size:10px;color:#6B7280;font-style:italic">
            ${alt.approved ? '✓ Opción aprobada para producción' : `Opción ${altIdx + 1} de ${alternatives.length}`}
          </td>
          <td style="text-align:right;padding:7px 12px;background:${bc}1a;font-weight:700;font-size:11px;color:#1E1B4B">Total ${altLabel}</td>
          <td style="text-align:right;padding:7px 12px;background:${bc}1a;font-weight:800;font-size:14px;color:${bc};font-variant-numeric:tabular-nums">${fmt(altTotals.total)}</td>
        </tr>` : ''

      return altSep + altHdr + kitRows + altTotalRow
    }).join('')

    /* ── Totales del footer: usar alt aprobada (o primera) ── */
    const mainAlt    = alternatives.find(a => a.approved) || alternatives[0]
    const mainKits   = (mainAlt?.kits || []).filter(i => i.type === 'kit' ? (i.name || i.packaging?.length || i.products?.length) : i.name)
    const mainTotals = calcAltTotals(mainKits)
    const pdfRevenue = isMultiAlt ? mainTotals.revenue    : calc.totalRevenue
    const pdfTotal   = isMultiAlt ? mainTotals.total      : calc.total
    const pdfDiscAmt = isMultiAlt ? mainTotals.discAmt    : calc.discountAmt
    const pdfDiscPct = isMultiAlt ? mainTotals.discPct    : calc.discountPct
    const pdfDeposit = isMultiAlt ? mainTotals.depositAmt : calc.depositAmt
    const validDays = num(c.budgetValidityDays) || 7
    const validUntil = new Date(); validUntil.setDate(validUntil.getDate() + validDays)
    const vigenciaISO = validUntil.toISOString().slice(0, 10)
    const ownerWA = (c.ownerWA || c.businessWA || '').replace(/[^\d+]/g, '')
    const acceptMsg = encodeURIComponent(`Hola! Acepto el presupuesto ${budgetNum} de ${bName}. Cliente: ${form.contact || form.company || ''}. Total: ${fmt(calc.total)}.`)
    const waLink = ownerWA ? `https://wa.me/${ownerWA.replace('+','')}?text=${acceptMsg}` : ''
    const showEnvioLeyenda = form.envioACotizar !== false
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${budgetNum}</title>
    <style>
      *{box-sizing:border-box}
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;margin:0;padding:18px 26px 70px;color:#1E1B4B;font-size:11.5px;line-height:1.45;background:#fff;print-color-adjust:exact;-webkit-print-color-adjust:exact}
      .pdf-hd{width:100%;border-collapse:collapse;margin-bottom:0}
      .pdf-hd td{padding-bottom:9px;vertical-align:top}
      .pdf-brand .bname{font-size:22px;font-weight:800;color:${brandColor};letter-spacing:-.5px;line-height:1.1}
      .pdf-brand img{height:34px;display:block}
      .pdf-brand .bsub{font-size:9px;font-weight:700;color:#b45309;text-transform:uppercase;letter-spacing:.7px;margin-top:3px}
      .pdf-meta{text-align:right;font-size:10.5px;color:#555;line-height:1.7}
      .pdf-meta b{color:#1E1B4B;font-weight:700}
      .pdf-div{height:1.5px;background:#b45309;opacity:.3;margin:8px 0 12px}
      .vig{display:inline-block;margin-top:2px;padding:2px 7px;background:#FEF3C7;color:#92400E;font-size:9px;font-weight:700;border-radius:3px;letter-spacing:.2px}
      table{width:100%;border-collapse:collapse;margin:4px 0 0}
      th{background:${brandColor};color:#fff;padding:7px 9px;text-align:left;font-size:9.5px;text-transform:uppercase;letter-spacing:.4px;font-weight:700}
      td{padding:6px 9px;border-bottom:1px solid #EEF0F7;font-size:11px}
      tr:last-child td{border-bottom:none}
      .totals{margin-top:6px}
      .totals-box{width:260px;margin-left:auto;padding:10px 14px;background:linear-gradient(135deg,${brandColor}0d,${brandColor}1a);border-radius:8px;border:1px solid ${brandColor}33}
      .totals-row{width:100%;border-collapse:collapse;font-size:11px;color:#555;margin:2px 0}
      .totals-row td{padding:2px 0}
      .totals-row .tv{text-align:right;font-family:monospace;font-weight:600;white-space:nowrap}
      .tr-big td{font-size:16px;font-weight:800;color:${brandColor};padding-top:6px;border-top:1px solid ${brandColor}33}
      .tr-big .tv{font-size:16px;font-weight:800}
      .tr-senia td{font-size:11.5px;font-weight:700;color:${brandColor}}
      .note{margin-top:12px;padding:9px 12px;background:#F4F6FD;border-left:3px solid ${brandColor};border-radius:4px;font-size:11px;color:#333}
      .footer{margin-top:14px;padding-top:8px;border-top:1px solid #E5E7F0;font-size:9.5px;color:#999;line-height:1.5}
      .cobro-block{margin-top:12px;padding:10px 14px;background:#F0FDF4;border:1.5px solid #86EFAC;border-radius:8px}
      .cobro-title{font-size:10px;font-weight:700;color:#065F46;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px}
      .cobro-tbl{width:100%;border-collapse:collapse;font-size:11px}
      .cobro-tbl td{padding:3px 0}
      .cobro-lbl{color:#666;font-weight:500}
      .cobro-val{font-weight:700;color:#1E1B4B;font-family:monospace;text-align:right}
      .copy-cbu{background:#fff;border:1px solid #86EFAC;border-radius:5px;padding:2px 8px;font-size:9.5px;color:#065F46;cursor:pointer;margin-left:8px;font-family:inherit}
      .copy-cbu:hover{background:#DCFCE7}
      @media print{.copy-cbu{display:none}}
      .iva-box{margin-top:10px;padding:10px 14px;background:#FAFBFD;border:1px solid #E5E7F0;border-radius:6px;font-size:10.5px;color:#374151}
      .iva-title{font-weight:700;margin-bottom:5px;font-size:10px;color:#1E1B4B;text-transform:uppercase;letter-spacing:.3px}
      .iva-tbl{width:100%;border-collapse:collapse}
      .iva-tbl td{padding:1.5px 0}
      .iva-tbl .iv{text-align:right;font-family:monospace;font-weight:600}
      .accept-fab{position:fixed;bottom:18px;right:18px;background:#25D366;color:#fff;padding:13px 20px;border-radius:999px;font-weight:700;text-decoration:none;box-shadow:0 6px 20px rgba(37,211,102,.4);font-size:12.5px;display:inline-flex;align-items:center;gap:7px}
      .accept-fab:hover{background:#1da851}
      @media print{.accept-fab{display:none}body{padding:18px 22px}}
    </style></head><body>
    <table class="pdf-hd" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td class="pdf-brand">
        ${c.logo ? '<img src="' + c.logo + '" alt="' + bName + '">' : '<div class="bname">' + bName + '</div>'}
        <div class="bsub">Regalos Corporativos</div>
      </td>
      <td class="pdf-meta" style="text-align:right">
        <div><b>Presupuesto:</b> ${budgetNum}</div>
        <div><b>Fecha:</b> ${fmtD(new Date().toISOString().slice(0, 10))}</div>
        ${(form.contact || form.company) ? '<div><b>Cliente:</b> ' + [form.contact, form.company].filter(Boolean).join(' / ') + '</div>' : ''}
        ${form.deliveryDate ? '<div><b>Entrega:</b> ' + fmtD(form.deliveryDate) + '</div>' : ''}
        ${c.razonSocial ? '<div style="font-size:9.5px;color:#888">' + c.razonSocial + (c.cuit ? ' · CUIT: ' + c.cuit : '') + '</div>' : ''}
        <div class="vig">⏱ Válido hasta: ${fmtD(vigenciaISO)}</div>
      </td>
    </tr></table>
    <div class="pdf-div"></div>
    <table>
      <thead><tr><th>Producto</th><th style="text-align:center;width:55px">Cant.</th><th style="text-align:right;width:90px">P. unit.</th><th style="text-align:right;width:95px">Subtotal</th></tr></thead>
      <tbody>${allAltRows}</tbody>
    </table>
    <div class="totals"><div class="totals-box">
      ${isMultiAlt ? `<table class="totals-row" width="100%" cellpadding="0" cellspacing="0" style="font-size:9.5px;color:#6B7280;font-style:italic;margin-bottom:2px"><tr><td>Totales de: ${(alternatives.find(a => a.approved) || alternatives[0])?.label || 'Alternativa 1'}${alternatives.some(a => a.approved) ? ' ✓' : ''}</td></tr></table>` : ''}
      <table class="totals-row" width="100%" cellpadding="0" cellspacing="0"><tr><td>Subtotal productos</td><td class="tv">${fmt(pdfRevenue)}</td></tr></table>
      ${pdfDiscAmt > 0 ? `<table class="totals-row" width="100%" cellpadding="0" cellspacing="0" style="color:#DC2626"><tr><td>Descuento (${pdfDiscPct}%)</td><td class="tv">−${fmt(pdfDiscAmt)}</td></tr></table>` : ''}
      ${showEnvioLeyenda ? `<table class="totals-row" width="100%" cellpadding="0" cellspacing="0" style="font-size:10px;color:#92400E;font-style:italic"><tr><td>🚚 Costo de envío sujeto a pesaje y despacho</td><td class="tv">A cotizar</td></tr></table>` : ''}
      ${isMultiAlt && approvedAltPdf ? `<table class="totals-row" width="100%" cellpadding="0" cellspacing="0" style="font-size:9.5px;color:#059669;font-style:italic;margin-bottom:3px"><tr><td>✓ Aprobada: ${approvedAltPdf.label}</td><td class="tv"></td></tr></table>` : ''}
      <table class="totals-row tr-big" width="100%" cellpadding="0" cellspacing="0"><tr><td>Total</td><td class="tv">${fmt(pdfTotal)}</td></tr></table>
      ${showPayPdf ? `<table class="totals-row tr-senia" width="100%" cellpadding="0" cellspacing="0"><tr><td>Seña (${form.deposit}%)</td><td class="tv">${fmt(pdfDeposit)}</td></tr></table>
      <table class="totals-row" width="100%" cellpadding="0" cellspacing="0" style="color:#059669;font-weight:700"><tr><td>Saldo contra entrega</td><td class="tv">${fmt(pdfTotal - pdfDeposit)}</td></tr></table>` : ''}
    </div></div>
    ${c.ivaEnabled && showPayPdf ? (() => {
      const total = pdfTotal
      const ivaR = (Number(c.ivaRate) || 21) / 100
      const otrosR = (Number(c.otrosImpuestosRate) || 0) / 100
      const ivaContenido = total - (total / (1 + ivaR))
      const otrosImpAmt = total * otrosR
      return `<div class="iva-box">
        <div class="iva-title">Régimen de Transparencia Fiscal al Consumidor (Ley 27.743)</div>
        <table class="iva-tbl" width="100%" cellpadding="0" cellspacing="0"><tr><td>IVA Contenido (${(ivaR*100).toFixed(0)}%)</td><td class="iv">${fmt(ivaContenido)}</td></tr></table>
        ${otrosR > 0 ? `<table class="iva-tbl" width="100%" cellpadding="0" cellspacing="0"><tr><td>Otros Impuestos Nacionales Indirectos</td><td class="iv">${fmt(otrosImpAmt)}</td></tr></table>` : ''}
      </div>`
    })() : ''}
    ${form.noteCli ? `<div class="note">${form.noteCli}</div>` : ''}
    ${(() => {
      const bank = getBankConfig ? getBankConfig() : null
      const mp = getMPConfig ? getMPConfig() : null
      const hasCobro = (bank && bank.enabled && (bank.cbu || bank.alias)) || (mp && mp.enabled)
      if (!hasCobro) return ''
      return `<div class="cobro-block">
        <div class="cobro-title">💳 Datos para el pago</div>
        ${bank && bank.enabled && (bank.cbu || bank.alias) ? `
          <table class="cobro-tbl" width="100%" cellpadding="0" cellspacing="0">
          ${bank.cbu ? '<tr><td class="cobro-lbl">CBU</td><td class="cobro-val">' + bank.cbu + '<button class="copy-cbu" onclick="navigator.clipboard.writeText(\'' + bank.cbu + '\').catch(()=>{});var b=this;b.textContent=\'✓ Copiado\';setTimeout(function(){b.innerHTML=\'⎘ Copiar\'},1400)">⎘ Copiar</button></td></tr>' : ''}
          ${bank.alias ? '<tr><td class="cobro-lbl">Alias</td><td class="cobro-val">' + bank.alias + '<button class="copy-cbu" onclick="navigator.clipboard.writeText(\'' + bank.alias + '\').catch(()=>{});var b=this;b.textContent=\'✓ Copiado\';setTimeout(function(){b.innerHTML=\'⎘ Copiar\'},1400)">⎘ Copiar</button></td></tr>' : ''}
          ${bank.accountName ? '<tr><td class="cobro-lbl">Titular</td><td class="cobro-val">' + bank.accountName + '</td></tr>' : ''}
          ${bank.bank ? '<tr><td class="cobro-lbl">Banco</td><td class="cobro-val">' + bank.bank + '</td></tr>' : ''}
          </table>
        ` : ''}
      </div>`
    })()}
    ${(c.paymentConditions || c.legalNote) ? `<div class="footer">${c.paymentConditions ? '<div>' + c.paymentConditions + '</div>' : ''}${c.legalNote ? '<div style="margin-top:2px">' + c.legalNote + '</div>' : ''}</div>` : ''}
    ${waLink ? `<a class="accept-fab" href="${waLink}" target="_blank" rel="noopener"><span style="font-size:15px">✓</span> Aceptar Presupuesto</a>` : ''}
    </body></html>`
  }

  const openPreview = () => setPreviewHtml(buildPdfHtml())
  const printPDF = () => {
    const html = buildPdfHtml()
    const win = window.open('', '_blank')
    win.document.write(html); win.document.close()
    setTimeout(() => win.print(), 300)
  }

  const [emailSending, setEmailSending] = useState(false)
  const sendByEmail = async () => {
    const clientEmail = form.clientEmail.trim()
    if (!clientEmail) { toast('Agregá el email del cliente en el Paso 1.', 'er'); return }
    const svc = (c.ejsServiceId || '').trim()
    const tpl = (c.ejsTemplateId || '').trim()
    const pub = (c.ejsPublicKey || '').trim()
    if (!svc || !tpl || !pub) { toast('Configurá el email en Configuración → Integraciones → Email.', 'er'); return }
    setEmailSending(true)
    try {
      const emailjs = (await import('@emailjs/browser')).default
      await emailjs.send(svc, tpl, {
        to_email: clientEmail,
        subject: `Presupuesto ${budgetNum} — ${c.businessName || 'ANMA'}`,
        html_body: buildPdfHtml(),
        from_name: c.businessName || 'ANMA',
        client_name: form.contact || form.company || 'Cliente',
        budget_num: budgetNum,
      }, pub)
      toast(`Presupuesto enviado a ${clientEmail}`, 'ok')
    } catch (e) {
      toast(`Error al enviar: ${e?.text || e?.message || 'intentá de nuevo'}`, 'er')
    }
    setEmailSending(false)
  }

  return (
    <div className="page active" style={{ animation: 'pgIn .2s ease both' }}>
    <style>{`
      /* ── Kit builder responsive ── */
      .kit-comp-row{display:flex;align-items:center;gap:6px;background:var(--surface);border-radius:8px;padding:5px 8px;border:1px solid var(--border);flex-wrap:wrap}
      .kit-comp-name-group{flex:1;display:flex;gap:4px;min-width:140px}
      .kit-comp-nums{display:flex;align-items:center;gap:6px;flex-shrink:0;flex-wrap:nowrap}
      .kit-qty-badge{display:inline-flex;align-items:center;gap:3px;background:rgba(124,58,237,.08);border:1px solid rgba(124,58,237,.18);borderRadius:6px;padding:1px 6px;font-size:9px;font-weight:700;color:var(--brand);margin-left:4px;flex-shrink:0}
      @media(max-width:640px){
        .kit-comp-row{flex-direction:column;align-items:stretch;gap:6px;padding:8px 10px}
        .kit-comp-name-group{min-width:0;width:100%}
        .kit-comp-nums{width:100%;justify-content:flex-end;gap:8px;border-top:1px solid var(--border);padding-top:6px;margin-top:0}
        .kit-comp-nums input[type=number]{width:64px!important}
        .kit-comp-nums input[type=text]{width:80px!important}
        .kit-hdr{flex-direction:column!important;align-items:stretch!important;gap:8px!important}
        .kit-hdr-right{flex-wrap:wrap;gap:6px!important}
        .kit-hdr input{min-width:0}
      }
    `}</style>
      <div className="ph ph-pres">
        <div className="ph-left" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: '.01em', color: 'var(--txt)' }}>{budgetNum}</span>
          {(form.status === 'draft' || !editId) && (
            <span style={{ background: '#F5F3FF', color: '#7C3AED', border: '1px solid #DDD6FE', borderRadius: 9999, padding: '2px 9px', fontSize: 11, fontWeight: 700, lineHeight: 1.5, whiteSpace: 'nowrap' }}>Borrador</span>
          )}
        </div>
        <div className="ph-right"><button className="btn btn-ghost btn-sm" onClick={() => { localStorage.removeItem(DRAFT_KEY); setDraftRestored(false); nav('/') }}><i className="fa fa-xmark" /><span className="desc-txt"> Descartar</span></button></div>
      </div>


      {/* MOBILE STEP INDICATOR */}
      <div className="wiz-mobile-hd">
        <div className="wmh-label">Paso {currentStep} de {WIZARD_STEPS.length} &nbsp;·&nbsp; <b>{WIZARD_STEPS[currentStep - 1]?.label}</b></div>
        <div className="wmh-bar"><div className="wmh-fill" style={{ width: `${Math.round((currentStep / WIZARD_STEPS.length) * 100)}%` }} /></div>
      </div>

      {/* STEPPER */}
      <div className="wizard-steps">
        {WIZARD_STEPS.map((s, idx) => {
          const state = currentStep === s.id ? 'active' : currentStep > s.id ? 'done' : 'pending'
          return (
            <div key={s.id} className="wiz-step-wrap">
              <div className={`wiz-step ${state}`} onClick={() => goStep(s.id)}>
                <div className="wiz-step-num">
                  {state === 'done' ? <i className="fa fa-check" /> : s.id}
                </div>
                <div className="wiz-step-txt">
                  <div className="wiz-step-lbl">{s.label}</div>
                  <div className="wiz-step-desc">{s.desc}</div>
                </div>
                <i className={`fa ${s.icon} wiz-step-bgicon`} />
              </div>
              {idx < WIZARD_STEPS.length - 1 && <div className={`wiz-conn ${currentStep > s.id ? 'done' : ''}`} />}
            </div>
          )
        })}
      </div>

      <div className="budget-layout">
        <div>
          <div className="wiz-pane">
            {/* ─── PASO 1: CLIENTE ─── */}
            {currentStep === 1 && (
              <>
                <PaneHeader icon="fa-user-tie" title="Paso 1 · Cliente" subtitle="¿A quién le estás haciendo el presupuesto?" />
                <div className="grid2">
                  <div className="fg">
                    <label>Contacto (buscar en CRM)</label>
                    <ClientCombo clients={clients} value={form.contact} onSelect={handleClientSelect} onChange={val => setF('contact', val)} />
                  </div>
                  <div className="fg"><label>Empresa</label><input type="text" value={form.company} onChange={e => setF('company', e.target.value)} placeholder="Empresa S.A." /></div>
                  <div className="fg">
                    <label>WhatsApp</label>
                    <input type="text" value={form.wa}
                      onChange={e => { setF('wa', e.target.value); if (!waTouched) setWaTouched(true) }}
                      onBlur={() => setWaTouched(true)}
                      placeholder="+54 351 1234567"
                      className={waTouched && form.wa && !isValidWA(form.wa) ? 'inp-err' : ''} />
                    {waTouched && form.wa && !isValidWA(form.wa) && (
                      <div className="fg-err"><i className="fa fa-circle-exclamation" /> Formato no válido. Ej: <b>+54 351 1234567</b> (8 a 15 dígitos)</div>
                    )}
                  </div>
                  <div className="fg">
                    <label>Email del cliente</label>
                    <input type="email" value={form.clientEmail} onChange={e => setF('clientEmail', e.target.value)} placeholder="cliente@email.com" />
                  </div>
                  <div className="fg"><label>Ocasión</label>
                    <select value={form.ocasion} onChange={e => setF('ocasion', e.target.value)}>
                      <option value="">— seleccionar —</option>
                      {(c.occasions || []).map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                </div>
                <div className="wiz-tip">
                  <i className="fa fa-lightbulb" /> Buscá un contacto existente o creá uno nuevo escribiendo el nombre. Seleccioná la ocasión para personalizar el presupuesto.
                </div>
              </>
            )}

            {/* ─── PASO 2: KIT BUILDER ─── */}
            {currentStep === 2 && (
              <>
                <PaneHeader icon="fa-gift" title="Paso 2 · Kit / Box" subtitle="Construí cada regalo combinando packaging, productos y personalización" />

                {/* ── Tabs de alternativas ── */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
                  {alternatives.map((alt, ai) => (
                    <div key={ai} style={{ display: 'flex', alignItems: 'center', gap: 0, borderRadius: 10, overflow: 'hidden', border: ai === activeAltIdx ? '1.5px solid var(--primary)' : '1.5px solid var(--border)', background: ai === activeAltIdx ? 'var(--primary-light, #F5F3FF)' : 'var(--surface2)', flexShrink: 0 }}>
                      <button
                        onClick={() => setActiveAltIdx(ai)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px 4px 5px 10px', fontWeight: ai === activeAltIdx ? 700 : 500, fontSize: 12, color: ai === activeAltIdx ? 'var(--primary)' : 'var(--txt2)', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                      >
                        {alt.approved
                          ? <i className="fa fa-circle-check" style={{ marginRight: 5, fontSize: 10, color: '#10B981' }} />
                          : <i className="fa fa-layer-group" style={{ marginRight: 5, fontSize: 10, opacity: .7 }} />}
                        {alt.label || `Alternativa ${ai + 1}`}
                      </button>
                      {ai === activeAltIdx && (
                        <input
                          type="text"
                          value={alt.label}
                          onChange={e => updateAltLabel(ai, e.target.value)}
                          onClick={e => e.stopPropagation()}
                          placeholder={`Alternativa ${ai + 1}`}
                          style={{ border: 'none', borderLeft: '1px solid var(--border)', background: 'transparent', fontSize: 11, color: 'var(--primary)', fontWeight: 600, width: 110, padding: '4px 8px', fontFamily: 'inherit', outline: 'none' }}
                        />
                      )}
                      {alternatives.length > 1 && (
                        <button
                          onClick={e => { e.stopPropagation(); removeAlt(ai) }}
                          title="Eliminar alternativa"
                          style={{ background: 'none', border: 'none', borderLeft: '1px solid var(--border)', cursor: 'pointer', padding: '5px 8px', color: 'var(--txt2)', fontSize: 11, lineHeight: 1 }}
                        >
                          <i className="fa fa-xmark" />
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={addAlt}
                    title="Agregar alternativa"
                    style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: '1.5px dashed var(--border)', borderRadius: 10, cursor: 'pointer', padding: '5px 12px', fontSize: 12, color: 'var(--txt2)', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                  >
                    <i className="fa fa-plus" style={{ fontSize: 10 }} /> Nueva alternativa
                  </button>
                </div>

                {/* ── Banner de aprobación de la alternativa activa ── */}
                {(() => {
                  const isApproved = alternatives[activeAltIdx]?.approved === true
                  const anyApproved = alternatives.some(a => a.approved)
                  const approvedLabel = alternatives.find(a => a.approved)?.label
                  return (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, marginBottom: 14,
                      background: isApproved ? 'rgba(16,185,129,.08)' : 'var(--surface2)',
                      border: `1.5px solid ${isApproved ? '#10B981' : 'var(--border)'}`,
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {isApproved ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <i className="fa fa-circle-check" style={{ color: '#10B981', fontSize: 15, flexShrink: 0 }} />
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 700, color: '#059669' }}>Aprobada para producción</div>
                              <div style={{ fontSize: 10, color: 'var(--txt3)' }}>Al pasar a "En preparación", el stock se descontará solo de esta alternativa</div>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--txt2)' }}>
                              {anyApproved ? `Alternativa no aprobada` : 'Sin alternativa aprobada'}
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--txt3)' }}>
                              {anyApproved
                                ? <><i className="fa fa-circle-check" style={{ color: '#10B981', marginRight: 3 }} />Aprobada: <b>{approvedLabel}</b></>
                                : 'Aprobá una opción para conectar con el stock al pasar a producción'}
                            </div>
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => approveAlt(activeAltIdx)}
                        style={{
                          flexShrink: 0, padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                          cursor: 'pointer', fontFamily: 'inherit', border: 'none',
                          background: isApproved ? 'rgba(16,185,129,.15)' : 'var(--primary, #7C3AED)',
                          color: isApproved ? '#059669' : '#fff',
                          transition: 'opacity .15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.opacity = '.82' }}
                        onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
                      >
                        {isApproved ? <><i className="fa fa-check" style={{ marginRight: 5 }} />Aprobada</> : 'Aprobar esta opción'}
                      </button>
                    </div>
                  )
                })()}

                {(() => { const kit = items[0]; const kitIdx = 0; if (!kit) return null; return (
                  <div style={{ marginBottom: 14, border: '1.5px solid var(--border)', borderRadius: 14, overflow: 'hidden', background: 'var(--surface2)' }}>

                    {/* ─ Cabecera del kit ─ */}
                    <div className="kit-hdr" style={{ background: 'var(--grad)', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <input
                        type="text"
                        value={kit.name || ''}
                        onChange={e => updateKit(kitIdx, 'name', e.target.value)}
                        placeholder={`Kit #${kitIdx + 1} — nombre del regalo...`}
                        style={{ flex: 1, minWidth: 160, background: 'rgba(255,255,255,.14)', border: '1px solid rgba(255,255,255,.22)', borderRadius: 8, color: '#fff', fontWeight: 700, fontSize: 13, padding: '6px 10px', fontFamily: 'inherit' }}
                      />
                      <div className="kit-hdr-right" style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 9, color: 'rgba(255,255,255,.6)', marginBottom: 2 }}>Cant. kits</div>
                          <input type="number" min="1" value={kit.qty || 1} onFocus={selectOnFocus}
                            onChange={e => updateKit(kitIdx, 'qty', Math.max(1, parseInt(e.target.value) || 1))}
                            style={{ background: 'rgba(255,255,255,.14)', border: '1px solid rgba(255,255,255,.22)', borderRadius: 7, color: '#fff', fontWeight: 700, fontSize: 13, textAlign: 'center', width: 58, padding: '5px 6px', fontFamily: 'inherit' }} />
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 9, color: 'rgba(255,255,255,.6)', marginBottom: 2 }}>Precio u.</div>
                          <input type="text" inputMode="numeric" value={fmtTbl(kit.priceUnit)} onFocus={selectOnFocus}
                            onChange={e => { const r = parseTbl(e.target.value); updateKit(kitIdx, 'priceUnit', r === '' ? 0 : Number(r)) }}
                            style={{ background: 'rgba(255,255,255,.14)', border: '1px solid rgba(255,255,255,.22)', borderRadius: 7, color: '#fff', fontWeight: 700, fontSize: 13, textAlign: 'right', width: 88, padding: '5px 8px', fontFamily: 'inherit', fontVariantNumeric: 'tabular-nums' }} />
                        </div>
                        <div style={{ borderLeft: '1px solid rgba(255,255,255,.2)', paddingLeft: 10, textAlign: 'right' }}>
                          <div style={{ fontSize: 9, color: 'rgba(255,255,255,.55)', marginBottom: 1 }}>Subtotal</div>
                          <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{fmt(num(kit.qty) * num(kit.priceUnit))}</div>
                        </div>
                      </div>
                    </div>

                    <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>

                      {/* ─ Componente A: Packaging / Insumos ─ */}
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ width: 20, height: 20, borderRadius: 6, background: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: '#fff', flexShrink: 0 }}>A</div>
                            <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--txt2)' }}>Packaging / Insumos</span>
                          </div>
                          <button className="btn btn-ghost btn-xs" onClick={() => addPackComp(kitIdx)}>
                            <i className="fa fa-plus" /> Agregar
                          </button>
                        </div>
                        {(kit.packaging || []).length === 0 ? (
                          <div style={{ textAlign: 'center', padding: '9px 12px', background: 'var(--surface)', borderRadius: 8, border: '1px dashed var(--border)', color: 'var(--txt3)', fontSize: 11 }}>
                            <i className="fa fa-inbox" style={{ marginRight: 5, opacity: .45 }} />
                            Sin insumos — agregá cajas, bolsas, cintas, papel de seda, etc.
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                            {(kit.packaging || []).map((comp, cIdx) => (
                              <div key={cIdx} className="kit-comp-row">
                                <i className="fa fa-box" style={{ fontSize: 11, color: 'var(--brand)', flexShrink: 0, opacity: .65 }} />
                                {/* Nombre libre + picker opcional de DB */}
                                <div className="kit-comp-name-group">
                                  <input type="text" value={comp.name || ''}
                                    onChange={e => updatePackComp(kitIdx, cIdx, 'name', e.target.value)}
                                    placeholder="Ej: Caja kraft, Bolsa organza..."
                                    style={{ flex: 1, fontSize: 12, padding: '4px 8px', height: 30, minWidth: 0 }} />
                                  {insumos.length > 0 && (
                                    <button onClick={() => { setInsPickerTarget({ kitIdx, cIdx }); setInsPickerOpen(true) }} type="button" title="Elegir de Insumos"
                                      style={{ width: 30, height: 30, borderRadius: 7, border: '1.5px solid var(--border)', background: 'var(--surface2)', color: 'var(--brand)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0 }}>
                                      <i className="fa fa-list" />
                                    </button>
                                  )}
                                </div>
                                <div className="kit-comp-nums">
                                  {/* Costo unitario */}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                                    <span style={{ fontSize: 9, color: 'var(--txt3)', whiteSpace: 'nowrap' }}>$ u.</span>
                                    <input type="text" inputMode="numeric" value={fmtTbl(comp.costUnit)} onFocus={selectOnFocus}
                                      onChange={e => { const r = parseTbl(e.target.value); updatePackComp(kitIdx, cIdx, 'costUnit', r === '' ? 0 : Number(r)) }}
                                      style={{ width: 70, textAlign: 'right', height: 30, fontSize: 12, padding: '0 6px', fontVariantNumeric: 'tabular-nums' }} />
                                  </div>
                                  {/* Qty — muestra TOTAL (kit.qty × comp.qty), guarda por-kit */}
                                  <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
                                    <span style={{ fontSize: 8, color: 'var(--txt3)', lineHeight: 1 }}>cant. total</span>
                                    <input type="number" min="1"
                                      value={(num(comp.qty) || 1) * (num(kit.qty) || 1)}
                                      onFocus={selectOnFocus}
                                      onChange={e => {
                                        const total = Math.max(1, parseInt(e.target.value) || 1)
                                        updatePackComp(kitIdx, cIdx, 'qty', Math.max(1, Math.round(total / (num(kit.qty) || 1))))
                                      }}
                                      style={{ width: 54, textAlign: 'center', height: 28, fontSize: 12, padding: '0 4px', marginTop: 1, fontWeight: 700 }} />
                                  </div>
                                  {/* Subtotal total (costUnit × qty/kit × kit.qty) */}
                                  {num(comp.costUnit) > 0 && (
                                    <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--money)', fontVariantNumeric: 'tabular-nums', flexShrink: 0, minWidth: 58, textAlign: 'right' }}>
                                      {fmt(num(comp.costUnit) * num(comp.qty) * num(kit.qty))}
                                    </span>
                                  )}
                                  <button onClick={() => removePackComp(kitIdx, cIdx)}
                                    style={{ width: 24, height: 24, borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--txt3)', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--red)'; e.currentTarget.style.background = 'var(--red-lt)' }}
                                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--txt3)'; e.currentTarget.style.background = 'transparent' }}>
                                    <i className="fa fa-xmark" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* ─ Componente B: Contenido del kit ─ */}
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ width: 20, height: 20, borderRadius: 6, background: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: '#fff', flexShrink: 0 }}>B</div>
                            <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--txt2)' }}>Contenido del kit</span>
                          </div>
                          <button className="btn btn-ghost btn-xs" onClick={() => addProdComp(kitIdx)}>
                            <i className="fa fa-plus" /> Agregar
                          </button>
                        </div>
                        {(kit.products || []).length === 0 ? (
                          <div style={{ textAlign: 'center', padding: '9px 12px', background: 'var(--surface)', borderRadius: 8, border: '1px dashed var(--border)', color: 'var(--txt3)', fontSize: 11 }}>
                            <i className="fa fa-gift" style={{ marginRight: 5, opacity: .45 }} />
                            Sin productos — agregá mates, termos, tazas, libretas, etc.
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                            {(kit.products || []).map((comp, cIdx) => (
                              <div key={cIdx} className="kit-comp-row">
                                <i className="fa fa-gift" style={{ fontSize: 11, color: '#059669', flexShrink: 0, opacity: .65 }} />
                                <div className="kit-comp-name-group">
                                  <input type="text" value={comp.name || ''} onChange={e => updateProdComp(kitIdx, cIdx, 'name', e.target.value)}
                                    placeholder="Nombre del producto..."
                                    style={{ flex: 1, fontSize: 12, padding: '4px 8px', height: 30, minWidth: 0 }} />
                                  <button onClick={() => { setKitProdPickerTarget({ kitIdx, cIdx }); setKitProdPickerOpen(true) }} type="button" title="Elegir del catálogo"
                                    style={{ width: 30, height: 30, borderRadius: 7, border: '1.5px solid var(--border)', background: 'var(--surface2)', color: '#059669', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0 }}>
                                    <i className="fa fa-list" />
                                  </button>
                                </div>
                                <div className="kit-comp-nums">
                                  {/* Costo unitario */}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                                    <span style={{ fontSize: 9, color: 'var(--txt3)', whiteSpace: 'nowrap' }}>$ u.</span>
                                    <input type="text" inputMode="numeric" value={fmtTbl(comp.costUnit)} onFocus={selectOnFocus}
                                      onChange={e => { const r = parseTbl(e.target.value); updateProdComp(kitIdx, cIdx, 'costUnit', r === '' ? 0 : Number(r)) }}
                                      style={{ width: 70, textAlign: 'right', height: 30, fontSize: 12, padding: '0 6px', fontVariantNumeric: 'tabular-nums' }} />
                                  </div>
                                  {/* Qty — muestra TOTAL (kit.qty × comp.qty), guarda por-kit */}
                                  <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
                                    <span style={{ fontSize: 8, color: 'var(--txt3)', lineHeight: 1 }}>cant. total</span>
                                    <input type="number" min="1"
                                      value={(num(comp.qty) || 1) * (num(kit.qty) || 1)}
                                      onFocus={selectOnFocus}
                                      onChange={e => {
                                        const total = Math.max(1, parseInt(e.target.value) || 1)
                                        updateProdComp(kitIdx, cIdx, 'qty', Math.max(1, Math.round(total / (num(kit.qty) || 1))))
                                      }}
                                      style={{ width: 54, textAlign: 'center', height: 28, fontSize: 12, padding: '0 4px', marginTop: 1, fontWeight: 700 }} />
                                  </div>
                                  {/* Subtotal total */}
                                  {num(comp.costUnit) > 0 && (
                                    <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--money)', fontVariantNumeric: 'tabular-nums', flexShrink: 0, minWidth: 58, textAlign: 'right' }}>
                                      {fmt(num(comp.costUnit) * num(comp.qty) * num(kit.qty))}
                                    </span>
                                  )}
                                  <button onClick={() => removeProdComp(kitIdx, cIdx)}
                                    style={{ width: 24, height: 24, borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--txt3)', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--red)'; e.currentTarget.style.background = 'var(--red-lt)' }}
                                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--txt3)'; e.currentTarget.style.background = 'transparent' }}>
                                    <i className="fa fa-xmark" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* ─ Componente C: Personalización ─ */}
                      <div style={{ background: 'var(--surface)', borderRadius: 8, padding: '10px 12px', border: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                          <div style={{ width: 20, height: 20, borderRadius: 6, background: '#D97706', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: '#fff', flexShrink: 0 }}>C</div>
                          <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--txt2)' }}>Personalización</span>
                          <span style={{ fontSize: 10, color: 'var(--txt3)', marginLeft: 2 }}>logo, grabado, impresión</span>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <input type="text" value={kit.personalizacion?.desc || ''}
                            onChange={e => updatePersonalizacion(kitIdx, 'desc', e.target.value)}
                            placeholder="Ej: Logo bordado, impresión digital UV..."
                            style={{ flex: 1, minWidth: 160, fontSize: 12, padding: '6px 10px', height: 32 }} />
                          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 11, color: 'var(--txt3)', whiteSpace: 'nowrap' }}>Costo u.</span>
                            <input type="text" inputMode="numeric" value={fmtTbl(kit.personalizacion?.costUnit)}
                              onFocus={selectOnFocus}
                              onChange={e => { const r = parseTbl(e.target.value); updatePersonalizacion(kitIdx, 'costUnit', r === '' ? 0 : Number(r)) }}
                              style={{ width: 90, textAlign: 'right', fontSize: 12, padding: '6px 8px', height: 32, fontVariantNumeric: 'tabular-nums' }} />
                          </div>
                        </div>
                        {num(kit.personalizacion?.costUnit) > 0 && (
                          <div style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 5 }}>
                            {num(kit.qty)} u. × {fmt(num(kit.personalizacion?.costUnit))} = <strong style={{ color: 'var(--money)' }}>{fmt(num(kit.qty) * num(kit.personalizacion?.costUnit))}</strong>
                          </div>
                        )}
                      </div>

                      {/* ─ Resumen de costo del kit ─ */}
                      {kitCostUnit(kit) > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 18, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
                          <span style={{ fontSize: 11, color: 'var(--txt3)' }}>
                            Costo real u.: <strong style={{ color: 'var(--txt2)', fontVariantNumeric: 'tabular-nums' }}>{fmt(kitCostUnit(kit))}</strong>
                          </span>
                          {num(kit.priceUnit) > 0 && (() => {
                            const margin = ((num(kit.priceUnit) - kitCostUnit(kit)) / num(kit.priceUnit) * 100)
                            const ok = margin >= (num(c.marginLowThreshold) || 10)
                            return (
                              <span style={{ fontSize: 11, color: 'var(--txt3)' }}>
                                Margen: <strong style={{ color: ok ? '#4ade80' : 'var(--red)', fontVariantNumeric: 'tabular-nums' }}>{margin.toFixed(0)}%</strong>
                              </span>
                            )
                          })()}
                        </div>
                      )}
                    </div>
                  </div>
                )})()}

                {/* Picker de productos para componente B */}
                <ProductPicker open={kitProdPickerOpen} onClose={() => setKitProdPickerOpen(false)} products={products}
                  onSelect={(p) => {
                    if (!kitProdPickerTarget) return
                    const { kitIdx, cIdx } = kitProdPickerTarget
                    setItems(prev => prev.map((k, i) => {
                      if (i !== kitIdx) return k
                      return { ...k, products: (k.products || []).map((c, j) => j !== cIdx ? c : { ...c, id: p.id || '', name: p.name || '', costUnit: num(p.cost) }) }
                    }))
                    setKitProdPickerTarget(null)
                  }}
                />
                {/* Picker de insumos para componente A */}
                <ProductPicker open={insPickerOpen} onClose={() => setInsPickerOpen(false)}
                  products={insumos.map(ins => ({ ...ins, cost: num(ins.cost || ins.costUnit || 0), cat: ins.unit || ins.cat || '' }))}
                  onSelect={(ins) => {
                    if (!insPickerTarget) return
                    const { kitIdx, cIdx } = insPickerTarget
                    setItems(prev => prev.map((k, i) => {
                      if (i !== kitIdx) return k
                      return { ...k, packaging: (k.packaging || []).map((c, j) => j !== cIdx ? c : { ...c, id: ins.id || '', name: ins.name || '', costUnit: num(ins.cost) }) }
                    }))
                    setInsPickerTarget(null)
                  }}
                />

              </>
            )}

            {/* ─── PASO 3: ENTREGA ─── */}
            {currentStep === 3 && (
              <>
                <PaneHeader icon="fa-truck" title="Paso 3 · Entrega y precio" subtitle="Configurá modalidad, fechas y parámetros" />
                <div className="grid2">
                  <div className="fg"><label>Modalidad</label>
                    <select value={form.delivery} onChange={e => setF('delivery', e.target.value)}>
                      <option value="">— seleccionar —</option>
                      {(c.deliveryModes || []).map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div className="fg">
                    <label>Fecha pactada</label>
                    <input type="date" value={form.deliveryDate} onChange={e => setF('deliveryDate', e.target.value)} {...(editId ? {} : { min: todayISO() })} />
                    {form.deliveryDate && isWeekend(form.deliveryDate) && (
                      <div style={{ fontSize: 10, color: 'var(--amber,#F59E0B)', marginTop: 3 }}>
                        <i className="fa fa-triangle-exclamation" /> Es fin de semana. Verificá si entregás ese día.
                      </div>
                    )}
                  </div>
                  <div className="fg">
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer', textTransform: 'none', letterSpacing: 0 }}>
                      <input type="checkbox" checked={form.envioACotizar !== false} onChange={e => setF('envioACotizar', e.target.checked)} style={{ width: 'auto' }} />
                      Envío a cotizar (mostrar leyenda en PDF)
                    </label>
                  </div>
                  <div className="fg"><label>Estado</label>
                    <select value={form.status} onChange={e => setF('status', e.target.value)}>
                      <option value="draft">Borrador</option>
                      <option value="sent">Enviado al cliente</option>
                      <option value="confirmed">Confirmado</option>
                      <option value="inprogress">En preparación</option>
                      <option value="delivered">Entregado</option>
                      <option value="cancelled">Cancelado</option>
                    </select>
                  </div>
                  <div className="fg"><label>Estado de pago</label>
                    <select value={form.payStatus} onChange={e => setF('payStatus', e.target.value)}>
                      <option value="pending">Pago pendiente</option>
                      <option value="partial">Seña abonada</option>
                      <option value="paid">Pagado</option>
                    </select>
                  </div>
                </div>
                <div className="grid3" style={{ marginTop: 4 }}>
                  <div className="fg"><label>Margen ganancia (%)</label><input type="number" value={form.margin} onFocus={selectOnFocus} onChange={e => setF('margin', e.target.value)} onBlur={e => { if (e.target.value === '') setF('margin', 0) }} min="0" max="100" style={{ maxWidth: 120 }} /></div>
                  <div className="fg"><label>Seña requerida (%)</label><input type="number" value={form.deposit} onFocus={selectOnFocus} onChange={e => setF('deposit', e.target.value)} onBlur={e => { if (e.target.value === '') setF('deposit', 0) }} min="0" max="100" style={{ maxWidth: 120 }} /></div>
                  <div className="fg"><label>Impresión/logo x u. ($)</label><input type="number" value={form.logoCost} onFocus={selectOnFocus} onChange={e => setF('logoCost', e.target.value)} onBlur={e => { if (e.target.value === '') setF('logoCost', 0) }} min="0" style={{ maxWidth: 140 }} /></div>
                </div>
                {feats.descuentoCliente && (
                  <div className="fg" style={{ maxWidth: 200, marginTop: 4 }}>
                    <label>Descuento al cliente (%)</label>
                    <input type="number" value={form.discount} onFocus={selectOnFocus} onChange={e => setF('discount', e.target.value)} onBlur={e => { if (e.target.value === '') setF('discount', 0) }} min="0" max="100" style={{ maxWidth: 120 }} />
                  </div>
                )}
                <div className="grid2">
                  {feats.notasInternas && (
                    <div className="fg"><label>Nota interna</label><textarea value={form.noteInt} onChange={e => setF('noteInt', e.target.value)} rows={2} placeholder="Solo para vos..." /></div>
                  )}
                  <div className="fg"><label>Nota al cliente (PDF)</label><textarea value={form.noteCli} onChange={e => setF('noteCli', e.target.value)} rows={2} placeholder="Visible en el presupuesto..." /></div>
                </div>
              </>
            )}

            {/* ─── PASO 4: CONFIRMAR ─── */}
            {currentStep === 4 && (
              <>
                <PaneHeader icon="fa-check-double" title="Paso 4 · Confirmar y enviar" subtitle="Revisá todo antes de guardar" />
                <div className="wiz-review">
                  <div className="wiz-rev-card">
                    <div className="wiz-rev-card-h"><i className="fa fa-user-tie" /> Cliente <button className="wiz-rev-edit" onClick={() => goStep(1)}>Editar</button></div>
                    <div className="wiz-rev-body">
                      <div><b>{form.contact || '—'}</b>{form.company ? ` · ${form.company}` : ''}</div>
                      <div className="wiz-rev-meta">{form.wa || 'Sin WhatsApp'}{form.ocasion ? ` · ${form.ocasion}` : ''}</div>
                    </div>
                  </div>
                  <div className="wiz-rev-card">
                    <div className="wiz-rev-card-h">
                      <i className="fa fa-gift" /> Kits / Productos ({items.filter(i => i.type === 'kit' ? (i.name || i.packaging?.length || i.products?.length) : i.name).length})
                      <button className="wiz-rev-edit" onClick={() => goStep(2)}>Editar</button>
                    </div>
                    <div className="wiz-rev-body">
                      {items.filter(i => i.type === 'kit' ? (i.name || i.packaging?.length || i.products?.length) : i.name).map((it, idx) => (
                        <div key={idx}>
                          <div className="wiz-rev-item">
                            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              {it.type === 'kit' && <i className="fa fa-gift" style={{ fontSize: 9, color: 'var(--brand)', opacity: .7 }} />}
                              {it.qty}× {it.type === 'kit' ? (it.name || 'Kit sin nombre') : it.name}
                              {it.type === 'kit' && ((it.packaging?.length || 0) + (it.products?.length || 0)) > 0 && (
                                <span style={{ fontSize: 9, color: 'var(--txt3)', background: 'var(--surface2)', borderRadius: 4, padding: '1px 5px' }}>
                                  {(it.packaging?.length || 0) + (it.products?.length || 0)} comp.
                                </span>
                              )}
                            </span>
                            <span>{fmt(num(it.qty) * num(it.priceUnit))}</span>
                          </div>
                          {it.type === 'kit' && ((it.packaging || []).concat(it.products || [])).filter(c => c.name).map((c, ci) => (
                            <div key={ci} style={{ fontSize: 10, color: 'var(--txt3)', paddingLeft: 20, paddingBottom: 1 }}>↳ {c.name}{c.qty > 1 ? ` ×${c.qty}` : ''}</div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="wiz-rev-card">
                    <div className="wiz-rev-card-h"><i className="fa fa-truck" /> Entrega <button className="wiz-rev-edit" onClick={() => goStep(3)}>Editar</button></div>
                    <div className="wiz-rev-body">
                      <div>{form.delivery || 'Sin modalidad'} · {form.deliveryDate ? fmtDate(form.deliveryDate) : 'Sin fecha'}</div>
                      <div className="wiz-rev-meta">Margen {form.margin}% · Seña {form.deposit}%</div>
                    </div>
                  </div>
                </div>
                <div className="wiz-tip" style={{ marginTop: 14 }}>
                  <i className="fa fa-circle-check" /> Todo listo. Al confirmar guardás el presupuesto y volvés al dashboard.
                </div>
              </>
            )}

            {/* QUICK ACTIONS BAR — visible solo en mobile */}
            <div className="pres-mob-total">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="pmt-label">Total</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div className="pmt-val">{fmt(calc.total)}</div>
                  {feats.margenTabla && calc.marginLow && <span className="pmt-warn" title={`Margen bajo (< ${calc.marginThreshold}%)`}><i className="fa fa-triangle-exclamation" /></span>}
                  {feats.margenTabla && <div className="pmt-margin">{calc.marginReal}%</div>}
                </div>
              </div>
              <div className="pmt-acts">
                <button className="pmt-act-btn" onClick={sendWhatsApp} title="Enviar presupuesto">
                  <i className="fa-brands fa-whatsapp" style={{ fontSize: 20, color: '#4ade80' }} />
                  <span>Enviar</span>
                </button>
                {bankCfg.enabled && (
                  <button className="pmt-act-btn" onClick={sendBankDataByWA} title="Enviar datos de pago">
                    <i className="fa-brands fa-whatsapp" style={{ fontSize: 20, color: '#86efac' }} />
                    <span>Pago</span>
                  </button>
                )}
                <button className="pmt-act-btn" onClick={printPDF} title="Descargar PDF">
                  <i className="fa fa-file-pdf" style={{ fontSize: 20, color: '#93C5FD' }} />
                  <span>PDF</span>
                </button>
              </div>
            </div>

            {/* NAV WIZARD */}
            <div className="wiz-nav">
              <button className="btn btn-ghost" onClick={goPrev} disabled={currentStep === 1}>
                <i className="fa fa-arrow-left" /> Anterior
              </button>
              <div className="wiz-nav-mid">Paso {currentStep} de {WIZARD_STEPS.length}</div>
              {currentStep < WIZARD_STEPS.length ? (
                <button className="btn btn-primary" onClick={goNext}>
                  Siguiente <i className="fa fa-arrow-right" />
                </button>
              ) : (
                <button className="btn btn-primary" onClick={handleSave}>
                  <i className="fa fa-floppy-disk" /> Confirmar y guardar
                </button>
              )}
            </div>
          </div>
        </div>

        {/* PANEL LATERAL */}
        <div>
          <div className="calc-panel">
            <div className="cp-title"><i className="fa fa-calculator" />Resumen</div>
            <div className="cp-row"><span className="cp-lbl">N° Presupuesto</span><span className="cp-val">{budgetNum}</span></div>
            {feats.costoInterno && <div className="cp-row"><span className="cp-lbl">Costo proveedor</span><span className="cp-val">{fmt(calc.totalCost)}</span></div>}
            {calc.logTotal > 0 && <div className="cp-row"><span className="cp-lbl">Impresión</span><span className="cp-val">{fmt(calc.logTotal)}</span></div>}
            {feats.margenTabla && <div className="cp-row"><span className="cp-lbl">Ganancia</span><span className="cp-val" style={{ color: '#86EFAC' }}>{fmt(calc.gain)}</span></div>}
            {feats.margenTabla && <div className="cp-row"><span className="cp-lbl">Margen real</span><span className="cp-val" style={calc.marginLow ? { color: 'var(--red)', fontWeight: 800 } : undefined}>{calc.marginReal}%{calc.marginLow && <i className="fa fa-triangle-exclamation" style={{ marginLeft: 4, fontSize: 10 }} title={`Margen bajo (< ${calc.marginThreshold}%)`} />}</span></div>}
            {calc.discountAmt > 0 && (
              <div className="cp-row" style={{ borderTop: '1px dashed rgba(255,255,255,.10)', marginTop: 2, paddingTop: 4 }}>
                <span className="cp-lbl" style={{ color: 'rgba(255,255,255,.55)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <i className="fa fa-tag" style={{ fontSize: 9, opacity: .7 }} />
                  Descuento ({calc.discountPct}%)
                </span>
                <span className="cp-val" style={{ color: '#FCA5A5', fontWeight: 700 }}>−{fmt(calc.discountAmt)}</span>
              </div>
            )}
            {feats.margenTabla && marginBudgetedSaved !== null && Math.abs(marginBudgetedSaved - Number(calc.marginReal)) >= 0.5 && (() => {
              const delta = (Number(calc.marginReal) - marginBudgetedSaved).toFixed(1)
              const positive = Number(delta) >= 0
              return (
                <div className="cp-margin-cmp">
                  <div className="cmp-row"><span className="cmp-lbl"><i className="fa fa-bookmark" /> Presupuestado</span><span className="cmp-val">{marginBudgetedSaved.toFixed(1)}%</span></div>
                  <div className="cmp-row"><span className="cmp-lbl"><i className="fa fa-bullseye" /> Real actual</span><span className="cmp-val">{calc.marginReal}%</span></div>
                  <div className={`cmp-delta ${positive ? 'pos' : 'neg'}`}>
                    <i className={`fa fa-arrow-${positive ? 'up' : 'down'}`} />
                    {positive ? '+' : ''}{delta}% {positive ? 'mejor que lo presupuestado' : 'por debajo de lo presupuestado'}
                  </div>
                </div>
              )
            })()}
            {/* ── Chip de modo: cotización ↔ venta directa ── */}
            {isMultiAlt && !approvedAlt && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'rgba(124,58,237,.13)', border: '1px solid rgba(124,58,237,.24)', borderRadius: 9, padding: '8px 12px', marginBottom: 10 }}>
                <i className="fa fa-layer-group" style={{ fontSize: 12, color: 'rgba(167,139,250,.9)', flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,.78)', lineHeight: 1.2 }}>Modo cotización</div>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,.38)', lineHeight: 1.3, marginTop: 2 }}>Aprobá una alternativa para ver seña e IVA</div>
                </div>
              </div>
            )}
            {isMultiAlt && approvedAlt && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'rgba(16,185,129,.1)', border: '1px solid rgba(16,185,129,.22)', borderRadius: 9, padding: '8px 12px', marginBottom: 10 }}>
                <i className="fa fa-circle-check" style={{ fontSize: 12, color: '#34D399', flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#6EE7B7', lineHeight: 1.2 }}>Venta directa activa</div>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,.38)', lineHeight: 1.3, marginTop: 2 }}>{approvedAlt.label}</div>
                </div>
              </div>
            )}
            <div className="cp-total-row">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,.5)' }}>Total</span>
                <div style={{ textAlign: 'right' }}>
                  <div className="cp-total-val">{fmt(calc.total)}</div>
                  {showPaymentDetails && (
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,.4)', marginTop: 2 }}>Seña: {fmt(calc.depositAmt)}</div>
                  )}
                </div>
              </div>
              {showPaymentDetails && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,.08)' }}>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,.4)' }}>Saldo contra entrega</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#6EE7B7', fontVariantNumeric: 'tabular-nums' }}>{fmt(calc.total - calc.depositAmt)}</span>
                </div>
              )}
            </div>
            <div className="cp-actions">

              {/* ── 1. GUARDAR ── acción principal */}
              <button className="cp-btn cp-btn-primary"
                onClick={handleSave}
                style={{ fontSize: 14, padding: '13px 16px', fontWeight: 800, letterSpacing: '.01em', boxShadow: '0 4px 16px rgba(var(--brand-rgb),.35)' }}>
                <i className="fa fa-floppy-disk" /> Guardar Presupuesto
              </button>

              {/* ── 2. COMUNICACIÓN — compact ghost row ── */}
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,.32)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>Comunicación</div>
                <div style={{ display: 'flex', gap: 5 }}>
                  <button onClick={sendWhatsApp}
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '8px 6px', background: 'rgba(37,211,102,.08)', border: '1px solid rgba(37,211,102,.22)', borderRadius: 7, color: '#4ade80', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600, transition: 'background .15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(37,211,102,.16)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(37,211,102,.08)'}>
                    <i className="fa-brands fa-whatsapp" style={{ fontSize: 13 }} /> Enviar
                  </button>
                  {bankCfg.enabled ? (
                    <button onClick={sendBankDataByWA}
                      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '8px 6px', background: 'rgba(37,211,102,.06)', border: '1px solid rgba(37,211,102,.18)', borderRadius: 7, color: '#86efac', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600, transition: 'background .15s' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(37,211,102,.14)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'rgba(37,211,102,.06)'}>
                      <i className="fa-brands fa-whatsapp" style={{ fontSize: 13 }} /> Pago
                    </button>
                  ) : (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '8px 6px', background: 'rgba(100,116,139,.05)', border: '1px dashed rgba(100,116,139,.18)', borderRadius: 7, color: 'rgba(255,255,255,.18)', fontSize: 11 }}>
                      <i className="fa-brands fa-whatsapp" style={{ fontSize: 12 }} /> Pago
                    </div>
                  )}
                </div>
              </div>

              {/* ── 3. DOCUMENTOS ── */}
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,.3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>Documentos</div>
                <div style={{ display: 'flex', gap: 5 }}>
                  <button onClick={openPreview}
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '8px 6px', background: 'rgba(100,116,139,.18)', border: '1px solid rgba(100,116,139,.32)', borderRadius: 7, color: 'rgba(255,255,255,.72)', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'background .15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(100,116,139,.3)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(100,116,139,.18)'}>
                    <i className="fa fa-eye" style={{ fontSize: 12 }} /> Vista previa
                  </button>
                  <button onClick={printPDF}
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '8px 6px', background: 'rgba(100,116,139,.18)', border: '1px solid rgba(100,116,139,.32)', borderRadius: 7, color: 'rgba(255,255,255,.72)', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'background .15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(100,116,139,.3)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(100,116,139,.18)'}>
                    <i className="fa fa-file-pdf" style={{ fontSize: 12 }} /> PDF
                  </button>
                </div>
                {c.ejsEnabled && (
                  <button onClick={sendByEmail} disabled={emailSending}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', marginTop: 5, padding: '7px', background: 'rgba(100,116,139,.12)', border: '1px solid rgba(100,116,139,.22)', borderRadius: 7, color: 'rgba(255,255,255,.55)', fontSize: 11, fontWeight: 500, cursor: emailSending ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: emailSending ? .6 : 1, transition: 'background .15s' }}
                    onMouseEnter={e => { if (!emailSending) e.currentTarget.style.background = 'rgba(100,116,139,.22)' }}
                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(100,116,139,.12)'}>
                    <i className={`fa ${emailSending ? 'fa-spinner fa-spin' : 'fa-envelope'}`} style={{ fontSize: 11 }} />
                    {emailSending ? 'Enviando email...' : 'Enviar por email'}
                  </button>
                )}
              </div>

              {mpResult && <div style={{ marginTop: 6, fontSize: 10, wordBreak: 'break-all', color: 'rgba(255,255,255,.65)' }} dangerouslySetInnerHTML={{ __html: mpResult }} />}
            </div>

            {/* ── 4. PAGO ONLINE ── Mercado Pago */}
            {mpCfg.enabled && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,.3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>
                  <i className="fa fa-credit-card" style={{ marginRight: 4 }} />Pago online
                </div>
                <button onClick={generateMP} disabled={mpLoading}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '8px 10px', background: 'rgba(0,132,255,.12)', border: '1px solid rgba(0,132,255,.26)', borderRadius: 8, color: '#60a5fa', fontSize: 12, fontWeight: 600, cursor: mpLoading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: mpLoading ? .7 : 1, transition: 'background .15s' }}
                  onMouseEnter={e => { if (!mpLoading) e.currentTarget.style.background = 'rgba(0,132,255,.2)' }}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,132,255,.12)'}>
                  <i className="fa fa-credit-card" style={{ fontSize: 13 }} />
                  {mpLoading ? 'Generando link...' : 'Generar link de pago (MP)'}
                </button>
              </div>
            )}
            {!mpCfg.enabled && !bankCfg.enabled && (
              <div className="cp-pay-empty">
                <i className="fa fa-circle-info" /> Activá un método de cobro en Config › Pagos
              </div>
            )}
            <div className="wa-prev">
              <div className="wa-prev-lbl">Vista previa WA</div>
              <div className="wa-bubble">{waText}</div>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL PREVIEW */}
      {previewHtml && (
        <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) setPreviewHtml('') }}>
          <div style={{ background: 'var(--surface)', borderRadius: 18, width: '100%', maxWidth: 940, height: 'min(900px, 90vh)', boxShadow: 'var(--sh-lg)', animation: 'pgIn .2s ease both', display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0, margin: 'auto 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0, background: 'var(--surface2)', borderRadius: '18px 18px 0 0' }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Vista previa — {budgetNum}</h3>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-primary btn-sm" onClick={() => { printPDF(); setPreviewHtml('') }}><i className="fa fa-print" /> Imprimir</button>
                <button className="mclose" onClick={() => setPreviewHtml('')}><i className="fa fa-xmark" /></button>
              </div>
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <iframe title="Vista previa PDF" srcDoc={previewHtml} style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
