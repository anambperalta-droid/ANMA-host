import { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams } from 'react-router-dom'
import { useData } from '../../context/DataContext'
import { useToast } from '../../context/ToastContext'
import { fmt, db, dbW, dbDel } from '../../lib/storage'
import { getMPConfig, createPaymentLink, getBankConfig, buildBankInfoText } from '../../lib/mercadopago'
import { pushBudget, getSheetsConfig } from '../../lib/sheets'

/* ── Items legacy (backward compat) ── */
const emptyItem = () => ({ name: '', qty: 1, costUnit: '', priceUnit: '' })

/* ── Estructura Kit/Box modular ── */
const emptyPackComp = () => ({ id: '', name: '', costUnit: 0, qty: 1, fixedQty: false })
const emptyProdComp = () => ({ id: '', name: '', costUnit: 0, qty: 1 })
const emptyKit = () => ({
  type: 'kit',
  name: '',
  qty: 1,
  priceUnit: 0,
  // Flag: si false (default), el precio se calcula automático desde costos + margen
  // objetivo. Si el usuario edita el input → pasa a true y queda el valor literal.
  manualPriceUnit: false,
  packaging: [],
  products: [],
  personalizacion: { desc: '', costUnit: 0, designCost: 0 },
})

/* ── Alternativa de cotización ── */
const emptyAlt = (label = 'Alternativa 1') => ({ label, kits: [emptyKit()] })

/* ── ProductAutocomplete ────────────────────────────────────────────────
   Input predictivo con dropdown relativo (renderizado en portal con
   posición fixed para no quedar cortado por overflow del padre). Filtra
   en vivo mientras se escribe. Navegación con teclado (↑↓ Enter Esc). */
function ProductAutocomplete({ value, products, onChangeText, onPick, placeholder, style, inputStyle, formatLine }) {
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const [rect, setRect] = useState(null)
  const wrapRef = useRef(null)
  const inputRef = useRef(null)
  const dropdownRef = useRef(null)

  const lq = (value || '').toLowerCase().trim()
  const filtered = useMemo(() => {
    if (!products || products.length === 0) return []
    if (!lq) return products.slice(0, 50)
    return products.filter(p =>
      (p.name || '').toLowerCase().includes(lq) ||
      (p.cat || '').toLowerCase().includes(lq)
    ).slice(0, 50)
  }, [products, lq])

  const recalc = () => {
    if (!inputRef.current) return
    const r = inputRef.current.getBoundingClientRect()
    setRect({ top: r.bottom + 2, left: r.left, width: r.width })
  }
  useLayoutEffect(() => { if (open) recalc() }, [open])
  useEffect(() => {
    if (!open) return
    const onScroll = () => recalc()
    const onResize = () => recalc()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onClick = (e) => {
      if (wrapRef.current?.contains(e.target)) return
      if (dropdownRef.current?.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const handleKey = (e) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { setOpen(true); return }
    if (!open) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(filtered.length - 1, h + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => Math.max(0, h - 1)) }
    else if (e.key === 'Enter') { if (filtered[highlight]) { e.preventDefault(); pick(filtered[highlight]) } }
    else if (e.key === 'Escape') { setOpen(false) }
  }

  const pick = (p) => { onPick(p); setOpen(false); setHighlight(0) }

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', ...style }}>
      <input
        ref={inputRef}
        type="text"
        value={value || ''}
        onChange={e => { onChangeText(e.target.value); setOpen(true); setHighlight(0) }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKey}
        placeholder={placeholder || 'Buscar producto...'}
        autoComplete="off"
        style={{ width: '100%', ...inputStyle }}
      />
      {open && rect && filtered.length > 0 && createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: 'fixed', top: rect.top, left: rect.left,
            width: Math.max(260, rect.width), maxHeight: 280, overflowY: 'auto',
            background: 'var(--surface, #fff)', border: '1.5px solid var(--brand, #7C3AED)',
            borderRadius: 10, boxShadow: '0 10px 32px rgba(0,0,0,.18)', zIndex: 9999, padding: 4,
          }}
        >
          {filtered.map((p, i) => (
            <button key={p.id}
              onMouseDown={e => { e.preventDefault(); pick(p) }}
              onMouseEnter={() => setHighlight(i)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '8px 10px', border: 'none',
                background: i === highlight ? 'var(--brand-xlt, #F5F3FF)' : 'transparent',
                borderRadius: 6, cursor: 'pointer', textAlign: 'left',
                color: 'var(--txt, #111)', fontFamily: 'inherit', fontSize: 12.5,
              }}
            >
              <i className="fa fa-box-open" style={{ color: 'var(--brand)', fontSize: 11, opacity: .8 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                {(p.cat || typeof p.cost === 'number') && (
                  <div style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 1 }}>
                    {p.cat ? <span>{p.cat}</span> : null}
                    {p.cat && typeof p.cost === 'number' ? ' · ' : ''}
                    {typeof p.cost === 'number' ? `Costo: ${fmt(p.cost || 0)}` : ''}
                  </div>
                )}
              </div>
              {formatLine && formatLine(p)}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}

/* ── Selector de producto (BottomSheet / modal) — legacy, mantenido para
   los pickers de insumos y productos de kit que aún lo usan ── */
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
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '6px 8px 16px' }}>
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
  const { get, config, saveBudget, deductKitStock } = useData()
  const toast = useToast()
  const c = config()
  const feats = c.features || {}

  const [form, setForm] = useState({
    contact: '', company: '', wa: '', clientEmail: '', ocasion: '', delivery: '', deliveryDate: '',
    shipCost: 0, shipCharged: false, envioACotizar: true, status: 'draft', payStatus: 'pending', noteInt: '', noteCli: '',
    margin: c.defaultMargin || 40, deposit: c.defaultDeposit || 50, logoCost: 0, discount: 0,
    // ── Logística / Comisionista ── viajeId apunta al registro global en 'viajes' (dbW).
    // logisticaParadas = paradas atribuidas a ESTE presupuesto (category: Insumos|Mercadería|Entrega Pedido).
    viajeId: null,
    logisticaParadas: [],
    comisionista: '',
    viajeFecha: '',
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
  const [mpResult, setMpResult] = useState(null)
  const [mpLoading, setMpLoading] = useState(false)
  const [previewHtml, setPreviewHtml] = useState('')
  const [waTouched, setWaTouched] = useState(false)
  const [currentStep, setCurrentStep] = useState(1)
  const [draftRestored, setDraftRestored] = useState(false)

  /* ── Modo: simple (lista de productos) | kit (constructor regalo) ── */
  const [kitMode, setKitMode] = useState(false)
  const handleModeSwitch = (toKit) => {
    if (toKit === kitMode) return
    setKitMode(toKit)
    setActiveAltIdx(0)
    if (toKit) {
      setAlternatives([emptyAlt()])
    } else {
      setAlternatives([{ label: 'Pedido', kits: [emptyItem()] }])
    }
  }
  /* ── Pedido simple: packaging global + personalización global ── */
  const [simplePack, setSimplePack] = useState([])
  // simplePers: costos de personalización centralizados (modo simple).
  //   desc/costUnit: descripción + costo por unidad (amortiza por qty)
  //   designCost:    honorario único del diseñador (fijo, se amortiza por qty)
  //   laborCost:     honorario único de mano de obra (fijo, se amortiza por qty)
  //   printCost:     costo total de impresión/estampado/grabado (fijo)
  const [simplePers, setSimplePers] = useState({ desc: '', costUnit: 0, designCost: 0, laborCost: 0, printCost: 0 })
  const addSimplePack    = () => setSimplePack(p => [...p, emptyPackComp()])
  const removeSimplePack = (idx) => setSimplePack(p => p.filter((_, i) => i !== idx))
  const updateSimplePack = (idx, key, val) => setSimplePack(p => p.map((c, i) => i !== idx ? c : { ...c, [key]: val }))
  const updateSimplePers = (key, val) => setSimplePers(p => ({ ...p, [key]: val }))

  const clients = get('clients')
  const products = get('products')
  const insumos = get('insumos', [])
  const marginPct = c.defaultMargin || 40

  /* ── Draft persistence ── */
  const DRAFT_KEY = 'presupDraft'  // user-scoped via dbW/db/dbDel

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
          viajeId: b.viajeId || null,
          logisticaParadas: b.logisticaParadas || [],
          comisionista: b.comisionista || '',
          viajeFecha: b.viajeFecha || '',
        })
        // Backward compat: si ya tiene alternatives las carga; si no, envuelve items en Alternativa 1
        if (b.alternatives?.length) {
          setAlternatives(b.alternatives)
        } else {
          setAlternatives([{ label: 'Alternativa 1', kits: b.items?.length ? b.items : [emptyKit()] }])
        }
        setEditId(b.id)
        setMarginBudgetedSaved(typeof b.marginBudgeted === 'number' ? b.marginBudgeted : null)
        const hasKitItems = (b.alternatives || []).some(a => (a.kits || []).some(i => i.type === 'kit'))
          || (b.items || []).some(i => i.type === 'kit')
        setKitMode(hasKitItems)
        if (b.simplePack?.length) setSimplePack(b.simplePack)
        if (b.simplePers) setSimplePers(prev => ({ ...prev, ...b.simplePers }))
      }
    } else {
      const saved = db(DRAFT_KEY, null)
      if (saved) {
        const { f, it, step } = saved
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
        const draftHasKit = (it || []).some(a => Array.isArray(a?.kits) ? a.kits.some(i => i.type === 'kit') : a?.type === 'kit')
        setKitMode(draftHasKit)
        if (saved.sp?.length) setSimplePack(saved.sp)
        if (saved.spers) setSimplePers(prev => ({ ...prev, ...saved.spers }))
        setDraftRestored(true)
        toast('Borrador restaurado — tus datos anteriores están cargados', 'ok')
      }
    }
  }, [id]) // eslint-disable-line

  useEffect(() => {
    if (id) return
    const hasSomeData = form.contact || form.company || alternatives.some(a => a.kits.some(i => i.name))
    if (hasSomeData) {
      dbW(DRAFT_KEY, { f: form, it: alternatives, step: currentStep, km: kitMode, sp: simplePack, spers: simplePers })
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

  // Helper local: aplica el patch al kit y luego re-precia con el margen actual.
  // Cualquier cambio en packaging/products/personalización dispara reprice → priceUnit
  // siempre refleja el costo real × margen. Evita que el precio quede stale.
  const _patchKitAndReprice = (kitIdx, patcher) => setItems(prev => prev.map((k, i) => {
    if (i !== kitIdx) return k
    const patched = patcher(k)
    // Respeta el modo manual: si el usuario fijó el precio, no lo recalcula
    if (patched.manualPriceUnit) return patched
    const cu = kitCostUnit(patched)
    return cu > 0 ? { ...patched, priceUnit: priceFromMargin(cu, form.margin, form.discount) } : patched
  }))

  // Componente A — Packaging / Insumos
  const addPackComp = (kitIdx) => _patchKitAndReprice(kitIdx, k => ({ ...k, packaging: [...(k.packaging || []), emptyPackComp()] }))
  const removePackComp = (kitIdx, cIdx) => _patchKitAndReprice(kitIdx, k => ({ ...k, packaging: (k.packaging || []).filter((_, j) => j !== cIdx) }))
  const updatePackComp = (kitIdx, cIdx, key, val) => _patchKitAndReprice(kitIdx, k => ({ ...k, packaging: (k.packaging || []).map((c, j) => j !== cIdx ? c : { ...c, [key]: val }) }))

  // Componente B — Productos del kit
  const addProdComp = (kitIdx) => _patchKitAndReprice(kitIdx, k => ({ ...k, products: [...(k.products || []), emptyProdComp()] }))
  const removeProdComp = (kitIdx, cIdx) => _patchKitAndReprice(kitIdx, k => ({ ...k, products: (k.products || []).filter((_, j) => j !== cIdx) }))
  const updateProdComp = (kitIdx, cIdx, key, val) => _patchKitAndReprice(kitIdx, k => ({ ...k, products: (k.products || []).map((c, j) => j !== cIdx ? c : { ...c, [key]: val }) }))

  // Componente C — Personalización
  const updatePersonalizacion = (kitIdx, key, val) => _patchKitAndReprice(kitIdx, k => ({ ...k, personalizacion: { ...(k.personalizacion || {}), [key]: val } }))

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

  /* ── Helper: costo unitario de un kit ──
     fixedQty:    el insumo tiene cant. fija (total pedido, no ×kit) → se amortiza
     designCost:  honorario único del diseñador → se amortiza por cant. de kits
     laborCost:   honorario único de mano de obra → se amortiza por cant. de kits
     printCost:   costo fijo total de impresión/grabado → se amortiza por cant. de kits */
  const kitCostUnit = (kit) => {
    const kq = Math.max(1, num(kit.qty))
    let cu = num(kit.personalizacion?.costUnit)
    if (num(kit.personalizacion?.designCost) > 0) cu += num(kit.personalizacion.designCost) / kq
    if (num(kit.personalizacion?.laborCost)  > 0) cu += num(kit.personalizacion.laborCost)  / kq
    if (num(kit.personalizacion?.printCost)  > 0) cu += num(kit.personalizacion.printCost)  / kq
    ;(kit.packaging || []).forEach(p => {
      cu += p.fixedQty
        ? (num(p.costUnit) * num(p.qty)) / kq   // costo amortizado
        : num(p.costUnit) * num(p.qty)           // costo por kit (default)
    })
    ;(kit.products || []).forEach(p => { cu += num(p.costUnit) * num(p.qty) })
    return cu
  }

  /* ── Cálculo de precio desde margen + descuento ───────────────────────
     price = cost / ((1 - m/100) × (1 - d/100))
     Pre-compensa el descuento al cliente. Garantía: si ponés 15% margen y
     5% descuento, el "Margen real" del panel da 15% (no 9.5%). */
  const priceFromMargin = (cost, marginPct, discountPct = 0) => {
    const m = Math.min(99, Math.max(0, num(marginPct))) / 100
    const d = Math.min(99, Math.max(0, num(discountPct))) / 100
    const denom = (1 - m) * (1 - d)
    return denom > 0 ? Math.round(num(cost) / denom) : Math.round(num(cost))
  }

  /* ── Precio EFECTIVO del kit ─────────────────────────────────────────
     Si manualPriceUnit === true → respeta lo que tipeó el usuario.
     Si no → calcula automáticamente con la fórmula del margen objetivo.
     Esto se actualiza solo cuando cambian componentes o margen. */
  const effectiveKitPrice = (kit) => {
    if (kit?.manualPriceUnit) return Math.max(0, num(kit.priceUnit))
    const cu = kitCostUnit(kit)
    if (cu <= 0) return Math.max(0, num(kit.priceUnit))
    return priceFromMargin(cu, form.margin, form.discount)
  }

  /* ── Costo unitario EFECTIVO de un ítem = costo propio + parte pro-rata de los costos fijos.
     Los costos fijos del presupuesto (envío cargado al cliente + logística/comisionista) se
     distribuyen entre los ítems en proporción a su costo total. Así el priceUnit ya cubre
     su porción de overhead → "Margen real" en el panel coincide con el % ingresado. */
  const _effectiveItemCostUnit = (item, sharedFixed, totalItemsBaseCost) => {
    const ownCost = item.type === 'kit' ? kitCostUnit(item) : num(item.costUnit)
    const qty = Math.max(1, num(item.qty))
    if (ownCost <= 0 || totalItemsBaseCost <= 0 || sharedFixed <= 0) return ownCost
    const itemTotalCost = ownCost * qty
    const share = (itemTotalCost / totalItemsBaseCost) * sharedFixed
    return ownCost + (share / qty)
  }

  /* ── Reprice unificado: margen + descuento + costos fijos pro-rata.
     Garantía: el margen real del panel = % de margen ingresado, independiente del descuento. */
  const _repriceAllKits = (marginPct, discountPct) => {
    setAlternatives(prev => prev.map(alt => {
      const kits = alt.kits || []
      const shipCharged = form.shipCharged !== false
      const sharedFixed = Math.max(0, num(form.shipCost)) * (shipCharged ? 1 : 0)
        + Math.round((form.logisticaParadas || []).reduce((s, p) => s + Math.max(0, num(p.cost)), 0))
      const totalItemsBaseCost = kits.reduce((s, it) => {
        const c = it.type === 'kit' ? kitCostUnit(it) : num(it.costUnit)
        return s + Math.max(0, c) * Math.max(0, num(it.qty))
      }, 0)
      return {
        ...alt,
        kits: kits.map(item => {
          // Si el usuario fijó el precio manualmente, NO lo pisamos al cambiar margen/descuento
          if (item.manualPriceUnit) return item
          const effCost = _effectiveItemCostUnit(item, sharedFixed, totalItemsBaseCost)
          return effCost > 0 ? { ...item, priceUnit: priceFromMargin(effCost, marginPct, discountPct) } : item
        })
      }
    }))
  }

  const setMarginAndReprice = (val) => {
    setF('margin', val)
    _repriceAllKits(val, form.discount)
  }
  const setDiscountAndReprice = (val) => {
    setF('discount', val)
    _repriceAllKits(form.margin, val)
  }

  /* ── Logística / Comisionista — paradas atribuidas a ESTE presupuesto ── */
  const PARADA_CATEGORIES = [
    { val: 'Insumos',        lbl: '📥 Retiro Insumos' },
    { val: 'Mercadería',     lbl: '📦 Retiro Mercadería' },
    { val: 'Entrega Pedido', lbl: '🚚 Entrega Pedido' },
  ]
  const addParada = (category = 'Entrega Pedido') =>
    setF('logisticaParadas', [...(form.logisticaParadas || []), { category, detail: '', cost: 0 }])
  const updateParada = (idx, field, val) =>
    setF('logisticaParadas', (form.logisticaParadas || []).map((p, i) => i !== idx ? p : { ...p, [field]: val }))
  const removeParada = (idx) =>
    setF('logisticaParadas', (form.logisticaParadas || []).filter((_, i) => i !== idx))

  const calc = useMemo(() => {
    let totalCost = 0, totalRevenue = 0, totalQty = 0
    let itemsWithName = 0, itemsWithCost = 0
    items.forEach(item => {
      if (item.type === 'kit') {
        const q = Math.max(0, num(item.qty))
        const cu = Math.max(0, kitCostUnit(item))
        // Precio efectivo: respeta override manual o calcula auto desde margen
        const pEff = effectiveKitPrice(item)
        // Round per-item to avoid floating-point accumulation across kit components
        totalCost    += Math.round(q * cu)
        totalRevenue += Math.round(q * pEff)
        totalQty     += q
        if (item.name || (item.packaging?.length > 0) || (item.products?.length > 0)) itemsWithName++
        if (cu > 0 && (item.name || item.packaging?.length || item.products?.length)) itemsWithCost++
      } else {
        const q = Math.max(0, num(item.qty))
        const c2 = Math.max(0, num(item.costUnit))
        const p = Math.max(0, num(item.priceUnit))
        totalCost    += Math.round(q * c2)
        totalRevenue += Math.round(q * p)
        totalQty     += q
        if (item.name) itemsWithName++
        if (item.name && c2 > 0) itemsWithCost++
      }
    })
    // Modo simple: sumar packaging y personalización globales al costo.
    // Personalización tiene 4 componentes:
    //   - costUnit (por unidad, amortizado por qty) — descripción/logo
    //   - designCost (fijo, único) — honorario diseñador
    //   - laborCost  (fijo, único) — honorario mano de obra        ← NUEVO
    //   - printCost  (fijo, único) — costo total impresión/grabado ← reemplaza form.logoCost
    let persFixedTotal = 0
    if (!kitMode) {
      simplePack.forEach(p => { totalCost += Math.round(Math.max(0, num(p.costUnit)) * Math.max(0, num(p.qty))) })
      totalCost += Math.round(Math.max(0, num(simplePers.costUnit)) * totalQty)
      persFixedTotal =
        Math.max(0, num(simplePers.designCost)) +
        Math.max(0, num(simplePers.laborCost)) +
        Math.max(0, num(simplePers.printCost))
      totalCost += persFixedTotal
    }
    // True ↔ todos los ítems con contenido tienen costo > 0
    const hasFullCostData = itemsWithName > 0 && itemsWithCost === itemsWithName
    // logTotal queda en 0 — el costo de impresión se centraliza en simplePers.printCost (fijo)
    const logTotal = 0
    const ship = Math.max(0, num(form.shipCost))
    const shipCharged = form.shipCharged !== false
    // Logística / Comisionista — suma de paradas atribuidas a este presupuesto
    const viajesCost = Math.round((form.logisticaParadas || []).reduce((s, p) => s + Math.max(0, num(p.cost)), 0))
    const baseCost = totalCost + logTotal + ship + viajesCost
    const discountPct = Math.min(Math.max(num(form.discount), 0), 100)
    const discountAmt = Math.round(totalRevenue * discountPct / 100)
    const total = totalRevenue - discountAmt + (shipCharged ? ship : 0)
    const gain = hasFullCostData ? (total - baseCost) : 0
    const marginReal = (hasFullCostData && total > 0)
      ? (((total - baseCost) / total) * 100).toFixed(1)
      : '0.0'
    const costPending = !hasFullCostData
    const marginThreshold = num(c.marginLowThreshold) || 10
    const marginLow = hasFullCostData && total > 0 && Number(marginReal) < marginThreshold
    const depositAmt = Math.round(total * num(form.deposit) / 100)
    return { totalCost, totalRevenue, logTotal, baseCost, total, gain, marginReal, marginLow, marginThreshold, depositAmt, totalQty, discountAmt, discountPct, viajesCost, costPending, hasFullCostData, persFixedTotal }
  }, [items, form.shipCost, form.shipCharged, form.deposit, form.discount, form.logisticaParadas, c.marginLowThreshold, kitMode, simplePack, simplePers])

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
    // Si los costos están pendientes (algún ítem sin costo) NO congelamos un margen 0 engañoso.
    const marginBudgeted = marginBudgetedSaved !== null
      ? marginBudgetedSaved
      : (calc.costPending ? null : Number(calc.marginReal))

    // Descuento de stock: solo al pasar a "En preparación" y solo una vez
    const prevBudget = editId ? get('budgets').find(b => b.id === editId) : null
    const wasStockDeducted = prevBudget?.stockDeducted === true
    const willDeductStock = form.status === 'inprogress' && !wasStockDeducted

    // ── Cost freeze ──────────────────────────────────────────────────────────────
    // Kit component costs are stored frozen in the alternatives structure.
    // Preserve totalCost from the confirmed budget to prevent retroactive
    // gain changes if product/insumo costs are updated later.
    const frozenTotalCost = wasStockDeducted ? (prevBudget.totalCost ?? calc.baseCost) : calc.baseCost
    const totalGain       = calc.total - frozenTotalCost

    const savedBudget = saveBudget({
      ...(editId ? { id: editId } : {}), ...saveForm,
      items: validItems, alternatives,
      ...(!kitMode ? { simplePack, simplePers } : {}),
      stockDeducted: wasStockDeducted || willDeductStock,
      totalCost: frozenTotalCost,
      totalGain,
      total: calc.total,
      depositAmt: calc.depositAmt,
      marginBudgeted,
      ...(willDeductStock ? { costSnapshot: { date: new Date().toISOString().slice(0, 10), baseCost: calc.baseCost, viajesCost: calc.viajesCost } } : {}),
    })

    // ── Sincronización Logística ⇄ Presupuesto ──────────────────────────────
    // Persistimos las paradas en dbW('viajes') usando el schema de Regalos:
    // viaje = { id, date, time, cost, status, tasks: [{id, category, detail, cost, done, budgetId, budgetNum}] }
    // Cada parada lleva budgetId para atribución y para que editar el viaje
    // desde el módulo Logística impacte sobre este presupuesto.
    const paradasInput = (form.logisticaParadas || []).filter(p => p.detail || num(p.cost) > 0)
    if (savedBudget?.id && (paradasInput.length > 0 || form.viajeId)) {
      const taggedTasks = paradasInput.map((p, i) => ({
        id: Date.now() + i,
        category: p.category || 'Entrega Pedido',
        detail: p.detail || '',
        cost: Math.max(0, num(p.cost)),
        done: false,
        budgetId: savedBudget.id,
        budgetNum: savedBudget.num || '',
      }))
      const allViajes = db('viajes', [])
      if (form.viajeId) {
        // Viaje existente → reemplazamos SOLO las tasks de este budget
        const viaje = allViajes.find(v => v.id === form.viajeId)
        if (viaje) {
          const otherTasks = (viaje.tasks || []).filter(t => t.budgetId !== savedBudget.id)
          const updatedTasks = [...otherTasks, ...taggedTasks]
          const updated = {
            ...viaje,
            comisionista: form.comisionista || viaje.comisionista || '',
            date: form.viajeFecha || viaje.date,
            tasks: updatedTasks,
          }
          dbW('viajes', allViajes.map(v => v.id === viaje.id ? updated : v))
        }
      } else if (taggedTasks.length > 0) {
        // Nuevo viaje creado desde este presupuesto
        const newViaje = {
          id: Date.now(),
          date: form.viajeFecha || new Date().toISOString().slice(0, 10),
          time: new Date().toTimeString().slice(0, 5),
          comisionista: form.comisionista || '',
          cost: '',
          status: 'Planificado',
          tasks: taggedTasks,
        }
        dbW('viajes', [...allViajes, newViaje])
        // Re-guardamos el budget con el viajeId asignado
        saveBudget({ ...savedBudget, viajeId: newViaje.id })
      }
    }

    if (willDeductStock) {
      const approvedAlt = alternatives.find(a => a.approved) || alternatives[0]
      deductKitStock(approvedAlt, savedBudget?.num || '')
      const approvedLabel = approvedAlt?.label || 'Alternativa 1'
      toast(`Stock descontado — ${approvedLabel}`, 'ok')
    }
    if (!editId) setMarginBudgetedSaved(marginBudgeted)
    setDraftRestored(false)
    dbDel(DRAFT_KEY)
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
      if (!hasItem) return kitMode ? 'Agregá al menos un Kit con nombre, insumos o productos.' : 'Agregá al menos un producto al pedido.'
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
        const pEff = effectiveKitPrice(kit)
        altRev += kQty * pEff
        lines.push(`\n*🎁 ${kit.name || 'Kit sin nombre'}* ×${kQty}  →  ${fmt(kQty * pEff)}`)

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
        if (num(kit.personalizacion?.designCost) > 0) {
          lines.push(`  ✏️ *Diseñador:* ${fmt(num(kit.personalizacion.designCost))} (honorario único)`)
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
        setMpResult({ ok: true, link: result.link, label: `${result.amountLabel}: ${fmt(result.amount)}` })
        toast('Link de pago creado', 'ok')
      } else {
        setMpResult({ ok: false, message: result.message })
      }
    } catch { setMpResult({ ok: false, message: 'Error de conexión' }) }
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
          const isLast = ci === arr.length - 1 && !(i.products || []).some(p => p.name) && !i.personalizacion?.desc && !num(i.personalizacion?.costUnit) && !num(i.personalizacion?.designCost)
          // fixedQty: mostrar qty real sin multiplicar por kits
          const displayQty = c.fixedQty ? num(c.qty || 1) : num(c.qty || 1)
          const label = c.fixedQty ? `${c.name} (total pedido)` : c.name
          return subRow(label, displayQty, num(c.costUnit), isLast)
        })

        /* ── Bloque B: Contenido del Kit ── */
        const prodItems = (i.products || []).filter(c => c.name)
        const prodHdr   = prodItems.length ? blockHdrRow('✨', 'B. Contenido del Kit', '#F0FDF4') : ''
        const prodRowsHtml = prodItems.map((c, ci, arr) => {
          const isLast = ci === arr.length - 1 && !i.personalizacion?.desc && !num(i.personalizacion?.costUnit)
          return subRow(c.name, num(c.qty || 1), num(c.costUnit), isLast)
        })

        /* ── Bloque C: Personalización ── */
        const hasPers    = i.personalizacion?.desc || num(i.personalizacion?.costUnit) > 0
        const hasDesign  = num(i.personalizacion?.designCost) > 0
        const persHdr    = (hasPers || hasDesign) ? blockHdrRow('🎨', 'C. Personalización', '#FFFBEB') : ''
        const persRow    = hasPers ? subRow(
          i.personalizacion?.desc || 'Personalización / Logo',
          1, num(i.personalizacion?.costUnit), !hasDesign
        ) : ''
        const designRow  = hasDesign ? subRow('Honorario diseñador (único)', 1, num(i.personalizacion.designCost), true) : ''

        /* Fila de cierre si no hay sub-filas */
        const closingRow = (!packItems.length && !prodItems.length && !hasPers && !hasDesign)
          ? `<tr><td style="background:${bg2};border-left:3px solid ${bc};border-bottom:2px solid ${bdr};padding:3px 0"></td><td style="background:${bg2};border-bottom:2px solid ${bdr}"></td><td style="background:${bg2};border-bottom:2px solid ${bdr}"></td><td style="background:${bg2};border-bottom:2px solid ${bdr}"></td></tr>` : ''

        return [kitSep, kitRow, packHdr, ...packRowsHtml, prodHdr, ...prodRowsHtml, persHdr, persRow, designRow, closingRow].filter(Boolean)
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
    ${showPayPdf ? `
    <div class="totals"><div class="totals-box">
      ${isMultiAlt && approvedAltPdf ? `<table class="totals-row" width="100%" cellpadding="0" cellspacing="0" style="font-size:9.5px;color:#059669;font-style:italic;margin-bottom:3px"><tr><td>✓ Aprobada: ${approvedAltPdf.label}</td><td class="tv"></td></tr></table>` : ''}
      <table class="totals-row" width="100%" cellpadding="0" cellspacing="0"><tr><td>Subtotal productos</td><td class="tv">${fmt(pdfRevenue)}</td></tr></table>
      ${pdfDiscAmt > 0 ? `<table class="totals-row" width="100%" cellpadding="0" cellspacing="0" style="color:#DC2626"><tr><td>Descuento (${pdfDiscPct}%)</td><td class="tv">−${fmt(pdfDiscAmt)}</td></tr></table>` : ''}
      ${showEnvioLeyenda ? `<table class="totals-row" width="100%" cellpadding="0" cellspacing="0" style="font-size:10px;color:#92400E;font-style:italic"><tr><td>🚚 Costo de envío sujeto a pesaje y despacho</td><td class="tv">A cotizar</td></tr></table>` : ''}
      <table class="totals-row tr-big" width="100%" cellpadding="0" cellspacing="0"><tr><td>Total</td><td class="tv">${fmt(pdfTotal)}</td></tr></table>
      <table class="totals-row tr-senia" width="100%" cellpadding="0" cellspacing="0"><tr><td>Seña (${form.deposit}%)</td><td class="tv">${fmt(pdfDeposit)}</td></tr></table>
      <table class="totals-row" width="100%" cellpadding="0" cellspacing="0" style="color:#059669;font-weight:700"><tr><td>Saldo contra entrega</td><td class="tv">${fmt(pdfTotal - pdfDeposit)}</td></tr></table>
    </div></div>
    ` : ''}
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
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail)) { toast('El email del cliente no es válido.', 'er'); return }
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
      /* ── Lavado visual unificado — tablas ligeras y coherentes ── */
      /* Wrapper tipo Card — fondo gris ultra claro, borde sutil */
      .tbl-card{background:#FAFAFB;border:1px solid #ECECF1;border-radius:12px;padding:6px 12px 10px;margin-top:2px}
      /* Header de columnas — tipografía secundaria gris */
      .kit-tbl-hdr,.simple-tbl-hdr{display:grid;gap:6px;padding:8px 8px 10px;border-bottom:1px solid #F3F4F6;align-items:end}
      .kit-tbl-hdr{grid-template-columns:14px 1fr 64px 96px 90px 26px}
      .simple-tbl-hdr{grid-template-columns:1fr 58px 96px 78px 28px}
      .kit-tbl-hdr span,.simple-tbl-hdr span{font-size:9.5px;font-weight:600;color:#9CA3AF;text-transform:uppercase;letter-spacing:.08em}
      /* Filas — aire vertical, sin bordes pesados, divisor sutil entre filas */
      .kit-tbl{display:flex;flex-direction:column}
      .simple-tbl{display:flex;flex-direction:column}
      .kit-tbl-row,.simple-tbl-row{display:grid;gap:6px;align-items:center;padding:10px 8px;background:transparent;border:none;border-bottom:1px solid #F3F4F6;border-radius:0}
      .kit-tbl-row{grid-template-columns:14px 1fr 64px 96px 90px 26px}
      .simple-tbl-row{grid-template-columns:1fr 58px 96px 78px 28px}
      .kit-tbl-row:last-child,.simple-tbl-row:last-child{border-bottom:none}
      .kit-tbl-row .ico{display:flex;align-items:center;justify-content:center}
      /* Inputs limpios: transparentes en reposo, borde brand sólo al focus */
      .kit-tbl-row input[type=text],.kit-tbl-row input[type=number],.kit-tbl-row select,
      .simple-tbl-row input[type=text],.simple-tbl-row input[type=number],.simple-tbl-row select{
        border:1px solid transparent!important;background:transparent!important;
        transition:border-color .15s,background .15s;
      }
      .kit-tbl-row input[type=text]:hover,.kit-tbl-row input[type=number]:hover,
      .simple-tbl-row input[type=text]:hover,.simple-tbl-row input[type=number]:hover{
        background:rgba(0,0,0,.025)!important;
      }
      .kit-tbl-row input[type=text]:focus,.kit-tbl-row input[type=number]:focus,.kit-tbl-row select:focus,
      .simple-tbl-row input[type=text]:focus,.simple-tbl-row input[type=number]:focus,.simple-tbl-row select:focus{
        border-color:var(--brand)!important;background:#fff!important;outline:none;
        box-shadow:0 0 0 3px rgba(124,58,237,.08);
      }
      /* Botón Agregar minimalista — alineado izquierda, borde punteado sutil */
      .tbl-add-btn{
        display:inline-flex;align-items:center;gap:6px;
        background:transparent;border:1px dashed #D1D5DB;border-radius:8px;
        padding:7px 12px;margin-top:8px;
        font-family:inherit;font-size:11.5px;font-weight:600;color:#6B7280;
        cursor:pointer;transition:all .15s;
      }
      .tbl-add-btn:hover{border-color:var(--brand);color:var(--brand);background:rgba(124,58,237,.04)}
      .tbl-add-btn i{font-size:11px}
      /* Header de sección (A / B / C) — más liviano dentro del card */
      .tbl-section-hd{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:4px 2px 8px}
      .tbl-section-hd .badge{width:18px;height:18px;border-radius:5px;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:800;color:#fff;flex-shrink:0}
      .tbl-section-hd .label{font-size:11px;font-weight:700;color:#374151;letter-spacing:.02em}
      .tbl-section-hd .hint{font-size:10px;color:#9CA3AF}
      /* Legacy classes (compat) */
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
        .kit-tbl-hdr,.simple-tbl-hdr{display:none}
        .kit-tbl-row,.simple-tbl-row{display:flex;flex-wrap:wrap;align-items:stretch;gap:6px;padding:8px 4px}
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
        <div className="ph-right"><button className="btn btn-ghost btn-sm" onClick={() => { dbDel(DRAFT_KEY); setDraftRestored(false); nav('/') }}><i className="fa fa-xmark" /><span className="desc-txt"> Descartar</span></button></div>
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

            {/* ─── PASO 2: PRODUCTOS / KIT ─── */}
            {currentStep === 2 && (
              <>
                <PaneHeader icon="fa-gift" title="Paso 2 · Productos" subtitle="¿Qué tipo de pedido es este?" />

                {/* ── Selector de modo ── */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
                  {/* Tab: Pedido simple */}
                  <button
                    onClick={() => handleModeSwitch(false)}
                    style={{ padding: '13px 14px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', border: `2px solid ${!kitMode ? 'var(--brand)' : 'var(--border)'}`, background: !kitMode ? 'rgba(124,58,237,.07)' : 'var(--surface2)', textAlign: 'left', transition: 'all .15s', outline: 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                      <div style={{ width: 30, height: 30, borderRadius: 8, background: !kitMode ? 'var(--grad)' : 'var(--surface)', border: `1.5px solid ${!kitMode ? 'transparent' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0 }}>
                        <i className="fa fa-list-ul" style={{ color: !kitMode ? '#fff' : 'var(--txt3)' }} />
                      </div>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: !kitMode ? 'var(--brand)' : 'var(--txt2)', flex: 1 }}>Pedido simple</span>
                      {!kitMode && <i className="fa fa-circle-check" style={{ color: 'var(--brand)', fontSize: 14, flexShrink: 0 }} />}
                    </div>
                    <div style={{ fontSize: 10.5, color: 'var(--txt3)', paddingLeft: 38, lineHeight: 1.4 }}>Productos con precio directo. Sin packaging ni personalización.</div>
                  </button>
                  {/* Tab: Kit / Box */}
                  <button
                    onClick={() => handleModeSwitch(true)}
                    style={{ padding: '13px 14px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', border: `2px solid ${kitMode ? 'var(--brand)' : 'var(--border)'}`, background: kitMode ? 'rgba(124,58,237,.07)' : 'var(--surface2)', textAlign: 'left', transition: 'all .15s', outline: 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                      <div style={{ width: 30, height: 30, borderRadius: 8, background: kitMode ? 'var(--grad)' : 'var(--surface)', border: `1.5px solid ${kitMode ? 'transparent' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0 }}>
                        <i className="fa fa-gift" style={{ color: kitMode ? '#fff' : 'var(--txt3)' }} />
                      </div>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: kitMode ? 'var(--brand)' : 'var(--txt2)', flex: 1 }}>Kit / Box regalo</span>
                      {kitMode && <i className="fa fa-circle-check" style={{ color: 'var(--brand)', fontSize: 14, flexShrink: 0 }} />}
                    </div>
                    <div style={{ fontSize: 10.5, color: 'var(--txt3)', paddingLeft: 38, lineHeight: 1.4 }}>Constructor completo: packaging, personalización y alternativas.</div>
                  </button>
                </div>

                {/* ══════════════════════════════════════════
                    MODO SIMPLE — lista de productos
                ══════════════════════════════════════════ */}
                {!kitMode && (
                  <>
                    {/* header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 11, color: 'var(--txt3)' }}>
                        {items.filter(i => i.name).length
                          ? `${items.filter(i => i.name).length} producto${items.filter(i => i.name).length !== 1 ? 's' : ''} cargado${items.filter(i => i.name).length !== 1 ? 's' : ''}`
                          : 'Cargá los productos del pedido'}
                      </span>
                    </div>
                    {/* Card wrapper — fondo gris ultra claro, tabla limpia adentro */}
                    <div className="tbl-card">
                      {/* column headers — tipografía secundaria */}
                      <div className="simple-tbl-hdr">
                        {[['Producto', 'left'], ['Qty', 'center'], ['Precio u.', 'right'], ['Total', 'right'], ['', '']].map(([h, a], i) => (
                          <span key={i} style={{ textAlign: a }}>{h}</span>
                        ))}
                      </div>
                      {/* rows */}
                      <div className="simple-tbl">
                        {items.map((item, idx) => (
                        <div key={idx} className="simple-tbl-row"
                          draggable onDragStart={handleDragStart(idx)} onDragOver={handleDragOver(idx)} onDragLeave={handleDragLeave} onDrop={handleDrop(idx)}
                          style={{ background: dragOver === idx ? 'rgba(124,58,237,.04)' : undefined, transition: 'background .1s' }}>
                          {/* Nombre del producto (autocomplete predictivo) */}
                          <div style={{ minWidth: 0 }}>
                            <ProductAutocomplete
                              value={item.name}
                              products={products}
                              onChangeText={(v) => updateItem(idx, 'name', v)}
                              onPick={(p) => setAlternatives(prev => prev.map((alt, ai) => ai !== activeAltIdx ? alt : {
                                ...alt,
                                kits: alt.kits.map((it, i) => i !== idx ? it : {
                                  ...it, name: p.name,
                                  costUnit: p.cost || 0,
                                  priceUnit: num(p.cost) > 0 ? priceFromMargin(num(p.cost), form.margin, form.discount) : 0,
                                })
                              }))}
                              placeholder="Nombre del producto..."
                              inputStyle={{ fontSize: 12, padding: '5px 8px', height: 32 }}
                            />
                          </div>
                          {/* Qty */}
                          <input type="number" min="1" value={item.qty || 1} onFocus={selectOnFocus}
                            onChange={e => updateItem(idx, 'qty', Math.max(1, parseInt(e.target.value) || 1))}
                            style={{ height: 32, textAlign: 'center', fontSize: 12, padding: '0 4px', fontWeight: 700 }} />
                          {/* Precio unit */}
                          <input type="text" inputMode="numeric" value={fmtTbl(item.priceUnit)} onFocus={selectOnFocus}
                            onChange={e => { const r = parseTbl(e.target.value); updateItem(idx, 'priceUnit', r === '' ? 0 : Number(r)) }}
                            style={{ height: 32, textAlign: 'right', fontSize: 12, padding: '0 8px', fontVariantNumeric: 'tabular-nums' }} />
                          {/* Subtotal */}
                          <div style={{ textAlign: 'right', fontSize: 12, fontWeight: 700, color: num(item.qty) * num(item.priceUnit) > 0 ? 'var(--money)' : 'var(--txt4)', fontVariantNumeric: 'tabular-nums' }}>
                            {num(item.qty) * num(item.priceUnit) > 0 ? fmt(num(item.qty) * num(item.priceUnit)) : '—'}
                          </div>
                          {/* Remove */}
                          <button onClick={() => removeItem(idx)}
                            style={{ width: 26, height: 26, borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--txt4)', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            onMouseEnter={e => { e.currentTarget.style.color = 'var(--red)'; e.currentTarget.style.background = 'var(--red-lt)' }}
                            onMouseLeave={e => { e.currentTarget.style.color = 'var(--txt4)'; e.currentTarget.style.background = 'transparent' }}>
                            <i className="fa fa-xmark" />
                          </button>
                        </div>
                      ))}
                      </div>
                      {/* add row — botón minimalista, alineado izquierda */}
                      <button className="tbl-add-btn" onClick={addItem}>
                        <i className="fa fa-plus" /> Agregar producto
                      </button>
                    </div>
                    {/* tip */}
                    <div className="wiz-tip" style={{ marginTop: 12 }}>
                      <i className="fa fa-lightbulb" /> Empezá a escribir el nombre del producto para autocompletar desde tu catálogo — el costo y precio se llenan solos.
                    </div>

                    {/* ─ Packaging / Insumos (simple mode) ─ */}
                    <div style={{ marginTop: 14, border: '1.5px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--surface2)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: simplePack.length > 0 ? '1px solid var(--border)' : 'none', background: 'var(--surface2)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 20, height: 20, borderRadius: 6, background: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: '#fff', flexShrink: 0 }}>A</div>
                          <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--txt2)' }}>Packaging / Insumos</span>
                          <span style={{ fontSize: 10, color: 'var(--txt3)' }}>cajas, bolsas, cintas...</span>
                        </div>
                        <button className="btn btn-ghost btn-xs" onClick={addSimplePack}>
                          <i className="fa fa-plus" /> Agregar
                        </button>
                      </div>
                      {simplePack.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '9px 14px', color: 'var(--txt3)', fontSize: 11 }}>
                          <i className="fa fa-inbox" style={{ marginRight: 5, opacity: .45 }} /> Sin insumos — opcional
                        </div>
                      ) : (
                        <div style={{ padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                          {simplePack.map((comp, cIdx) => (
                            <div key={cIdx} className="kit-comp-row">
                              <i className="fa fa-box" style={{ fontSize: 11, color: 'var(--brand)', flexShrink: 0, opacity: .65 }} />
                              <div className="kit-comp-name-group" style={{ flex: 1, minWidth: 0 }}>
                                <ProductAutocomplete
                                  value={comp.name}
                                  products={insumos.map(ins => ({ ...ins, cost: num(ins.cost || ins.costUnit || 0), cat: ins.unit || ins.cat || '' }))}
                                  onChangeText={(v) => updateSimplePack(cIdx, 'name', v)}
                                  onPick={(ins) => {
                                    updateSimplePack(cIdx, 'name', ins.name || '')
                                    updateSimplePack(cIdx, 'costUnit', num(ins.cost))
                                  }}
                                  placeholder="Ej: Caja kraft, Bolsa organza..."
                                  inputStyle={{ fontSize: 12, padding: '4px 8px', height: 30 }}
                                />
                              </div>
                              <div className="kit-comp-nums">
                                <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                                  <span style={{ fontSize: 9, color: 'var(--txt3)', whiteSpace: 'nowrap' }}>$ u.</span>
                                  <input type="text" inputMode="numeric" value={fmtTbl(comp.costUnit)} onFocus={selectOnFocus}
                                    onChange={e => { const r = parseTbl(e.target.value); updateSimplePack(cIdx, 'costUnit', r === '' ? 0 : Number(r)) }}
                                    style={{ width: 70, textAlign: 'right', height: 30, fontSize: 12, padding: '0 6px', fontVariantNumeric: 'tabular-nums' }} />
                                </div>
                                <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
                                  <span style={{ fontSize: 8, color: 'var(--txt3)', lineHeight: 1 }}>cantidad</span>
                                  <input type="number" min="1" value={num(comp.qty) || 1} onFocus={selectOnFocus}
                                    onChange={e => updateSimplePack(cIdx, 'qty', Math.max(1, parseInt(e.target.value) || 1))}
                                    style={{ width: 54, textAlign: 'center', height: 28, fontSize: 12, padding: '0 4px', marginTop: 1, fontWeight: 700 }} />
                                </div>
                                {num(comp.costUnit) > 0 && (
                                  <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--money)', fontVariantNumeric: 'tabular-nums', flexShrink: 0, minWidth: 58, textAlign: 'right' }}>
                                    {fmt(num(comp.costUnit) * num(comp.qty))}
                                  </span>
                                )}
                                <button onClick={() => removeSimplePack(cIdx)}
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

                    {/* ─ Personalización (simple mode) ─ */}
                    <div style={{ marginTop: 10, background: 'var(--surface)', borderRadius: 10, padding: '10px 14px', border: '1.5px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <div style={{ width: 20, height: 20, borderRadius: 6, background: '#D97706', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: '#fff', flexShrink: 0 }}>C</div>
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--txt2)' }}>Personalización</span>
                        <span style={{ fontSize: 10, color: 'var(--txt3)', marginLeft: 2 }}>logo, grabado, impresión</span>
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <input type="text" value={simplePers.desc || ''}
                          onChange={e => updateSimplePers('desc', e.target.value)}
                          placeholder="Ej: Logo bordado, impresión digital UV..."
                          style={{ flex: 1, minWidth: 160, fontSize: 12, padding: '6px 10px', height: 32 }} />
                        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 11, color: 'var(--txt3)', whiteSpace: 'nowrap' }}>Costo u.</span>
                          <input type="text" inputMode="numeric" value={fmtTbl(simplePers.costUnit)}
                            onFocus={selectOnFocus}
                            onChange={e => { const r = parseTbl(e.target.value); updateSimplePers('costUnit', r === '' ? 0 : Number(r)) }}
                            style={{ width: 90, textAlign: 'right', fontSize: 12, padding: '6px 8px', height: 32, fontVariantNumeric: 'tabular-nums' }} />
                        </div>
                      </div>
                      {num(simplePers.costUnit) > 0 && (
                        <div style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 5 }}>
                          {items.reduce((s, i) => s + num(i.qty), 0)} u. × {fmt(num(simplePers.costUnit))} = <strong style={{ color: 'var(--money)' }}>{fmt(items.reduce((s, i) => s + num(i.qty), 0) * num(simplePers.costUnit))}</strong>
                        </div>
                      )}
                      {/* Costo del diseñador */}
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--border)', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: 130 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt2)', display: 'flex', alignItems: 'center', gap: 5 }}>
                            <i className="fa fa-pen-ruler" style={{ opacity: .65, fontSize: 10 }} /> Costo del diseñador
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 1 }}>Honorario único — se amortiza por cantidad</div>
                        </div>
                        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 11, color: 'var(--txt3)', whiteSpace: 'nowrap' }}>$ total</span>
                          <input type="text" inputMode="numeric" value={fmtTbl(simplePers.designCost)}
                            onFocus={selectOnFocus}
                            onChange={e => { const r = parseTbl(e.target.value); updateSimplePers('designCost', r === '' ? 0 : Number(r)) }}
                            style={{ width: 90, textAlign: 'right', fontSize: 12, padding: '6px 8px', height: 32, fontVariantNumeric: 'tabular-nums' }} />
                        </div>
                      </div>
                      {num(simplePers.designCost) > 0 && (() => {
                        const totalQtyCalc = items.reduce((s, i) => s + num(i.qty), 0)
                        return (
                          <div style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 4 }}>
                            {fmt(num(simplePers.designCost))} ÷ {totalQtyCalc} u. = <strong style={{ color: 'var(--money)' }}>{fmt(Math.round(num(simplePers.designCost) / Math.max(1, totalQtyCalc)))}</strong> amortizado por unidad
                          </div>
                        )
                      })()}

                      {/* 🛠️ Mano de Obra (fijo, se amortiza por qty) */}
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--border)', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: 130 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt2)', display: 'flex', alignItems: 'center', gap: 5 }}>
                            🛠️ Costo Mano de Obra
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 1 }}>Honorario único — se amortiza por cantidad</div>
                        </div>
                        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 11, color: 'var(--txt3)', whiteSpace: 'nowrap' }}>$ total</span>
                          <input type="text" inputMode="numeric" value={fmtTbl(simplePers.laborCost)}
                            onFocus={selectOnFocus}
                            onChange={e => { const r = parseTbl(e.target.value); updateSimplePers('laborCost', r === '' ? 0 : Number(r)) }}
                            style={{ width: 90, textAlign: 'right', fontSize: 12, padding: '6px 8px', height: 32, fontVariantNumeric: 'tabular-nums' }} />
                        </div>
                      </div>
                      {num(simplePers.laborCost) > 0 && (() => {
                        const totalQtyCalc = items.reduce((s, i) => s + num(i.qty), 0)
                        return (
                          <div style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 4 }}>
                            {fmt(num(simplePers.laborCost))} ÷ {totalQtyCalc} u. = <strong style={{ color: 'var(--money)' }}>{fmt(Math.round(num(simplePers.laborCost) / Math.max(1, totalQtyCalc)))}</strong> amortizado por unidad
                          </div>
                        )
                      })()}

                      {/* 🖨️ Impresión General (fijo total, trasladado desde el grid3 de Paso 3) */}
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--border)', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: 130 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt2)', display: 'flex', alignItems: 'center', gap: 5 }}>
                            🖨️ Costo de Impresión General
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 1 }}>Valor fijo total del proceso de estampado/grabado</div>
                        </div>
                        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 11, color: 'var(--txt3)', whiteSpace: 'nowrap' }}>$ total</span>
                          <input type="text" inputMode="numeric" value={fmtTbl(simplePers.printCost)}
                            onFocus={selectOnFocus}
                            onChange={e => { const r = parseTbl(e.target.value); updateSimplePers('printCost', r === '' ? 0 : Number(r)) }}
                            style={{ width: 90, textAlign: 'right', fontSize: 12, padding: '6px 8px', height: 32, fontVariantNumeric: 'tabular-nums' }} />
                        </div>
                      </div>
                      {num(simplePers.printCost) > 0 && (
                        <div style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 4 }}>
                          Total fijo: <strong style={{ color: 'var(--money)' }}>{fmt(num(simplePers.printCost))}</strong>
                        </div>
                      )}
                    </div>

                    {/* Catalog picker */}
                    <ProductPicker open={pickerOpen} onClose={() => setPickerOpen(false)} products={products} onSelect={handlePickProduct} />
                  </>
                )}

                {/* ══════════════════════════════════════════
                    MODO KIT — constructor completo de regalos
                ══════════════════════════════════════════ */}
                {kitMode && (
                  <>

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
                          <div style={{ fontSize: 9, color: 'rgba(255,255,255,.6)', marginBottom: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                            <span>Precio u.</span>
                            {kit.manualPriceUnit ? (
                              <button onClick={() => setItems(prev => prev.map((k, i) => i !== kitIdx ? k : { ...k, manualPriceUnit: false, priceUnit: effectiveKitPrice({ ...k, manualPriceUnit: false }) }))}
                                title="Volver a precio automático según margen"
                                style={{ background: 'rgba(255,255,255,.18)', border: 'none', color: '#fff', borderRadius: 999, padding: '0 6px', fontSize: 8, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', height: 12, lineHeight: 1 }}>
                                ✎ manual · reset
                              </button>
                            ) : (
                              <span title="Calculado automáticamente desde Costo Real + Margen objetivo"
                                style={{ background: 'rgba(52,211,153,.22)', color: '#A7F3D0', borderRadius: 999, padding: '0 6px', fontSize: 8, fontWeight: 800, height: 12, lineHeight: '12px' }}>
                                ⚙ auto
                              </span>
                            )}
                          </div>
                          <input type="text" inputMode="numeric"
                            value={fmtTbl(effectiveKitPrice(kit))}
                            onFocus={selectOnFocus}
                            onChange={e => {
                              const r = parseTbl(e.target.value)
                              const v = r === '' ? 0 : Number(r)
                              // Editar manualmente → marca el flag y guarda literal
                              setItems(prev => prev.map((k, i) => i !== kitIdx ? k : { ...k, manualPriceUnit: true, priceUnit: v }))
                            }}
                            title={kit.manualPriceUnit ? 'Precio manual — clic en "reset" para volver al cálculo automático' : 'Sugerido por costo + margen objetivo. Tipeá para sobreescribir.'}
                            style={{ background: 'rgba(255,255,255,.14)', border: `1px solid ${kit.manualPriceUnit ? 'rgba(167,139,250,.55)' : 'rgba(255,255,255,.22)'}`, borderRadius: 7, color: '#fff', fontWeight: 700, fontSize: 13, textAlign: 'right', width: 92, padding: '5px 8px', fontFamily: 'inherit', fontVariantNumeric: 'tabular-nums' }} />
                        </div>
                        <div style={{ borderLeft: '1px solid rgba(255,255,255,.2)', paddingLeft: 10, textAlign: 'right' }}>
                          <div style={{ fontSize: 9, color: 'rgba(255,255,255,.55)', marginBottom: 1 }}>Subtotal</div>
                          <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{fmt(num(kit.qty) * effectiveKitPrice(kit))}</div>
                        </div>
                      </div>
                    </div>

                    <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>

                      {/* ─ Componente A: Packaging / Insumos ─ */}
                      <div className="tbl-card">
                        <div className="tbl-section-hd">
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div className="badge" style={{ background: 'var(--brand)' }}>A</div>
                            <span className="label">Packaging / Insumos</span>
                            <span className="hint">cajas, bolsas, cintas...</span>
                          </div>
                        </div>
                        {(kit.packaging || []).length === 0 ? (
                          <div style={{ textAlign: 'center', padding: '9px 12px', background: 'var(--surface)', borderRadius: 8, border: '1px dashed var(--border)', color: 'var(--txt3)', fontSize: 11 }}>
                            <i className="fa fa-inbox" style={{ marginRight: 5, opacity: .45 }} />
                            Sin insumos — agregá cajas, bolsas, cintas, papel de seda, etc.
                          </div>
                        ) : (
                          <div className="kit-tbl">
                            {/* Header de columnas — mismo patrón que modo simple */}
                            <div className="kit-tbl-hdr">
                              <span></span>
                              <span style={{ textAlign: 'left' }}>Insumo</span>
                              <span style={{ textAlign: 'center' }}>Cant.</span>
                              <span style={{ textAlign: 'right' }}>Costo u.</span>
                              <span style={{ textAlign: 'right' }}>Subtotal</span>
                              <span></span>
                            </div>
                            {(kit.packaging || []).map((comp, cIdx) => (
                              <div key={cIdx} className="kit-tbl-row">
                                <span className="ico" style={{ color: 'var(--brand)', opacity: .7, fontSize: 11 }}>
                                  <i className="fa fa-box" />
                                </span>
                                {/* Nombre del insumo — autocomplete + toggle inline ×kit/fijo */}
                                <div style={{ minWidth: 0, display: 'flex', gap: 4, alignItems: 'center' }}>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <ProductAutocomplete
                                      value={comp.name}
                                      products={insumos.map(ins => ({ ...ins, cost: num(ins.cost || ins.costUnit || 0), cat: ins.unit || ins.cat || '' }))}
                                      onChangeText={(v) => updatePackComp(kitIdx, cIdx, 'name', v)}
                                      onPick={(ins) => {
                                        updatePackComp(kitIdx, cIdx, 'id', ins.id || '')
                                        updatePackComp(kitIdx, cIdx, 'name', ins.name || '')
                                        updatePackComp(kitIdx, cIdx, 'costUnit', num(ins.cost))
                                      }}
                                      placeholder="Ej: Caja kraft, Bolsa organza..."
                                      inputStyle={{ fontSize: 12, padding: '5px 8px', height: 32 }}
                                    />
                                  </div>
                                  {/* Toggle ×kit / fijo — inline al lado del nombre */}
                                  <button
                                    onClick={() => updatePackComp(kitIdx, cIdx, 'fixedQty', !comp.fixedQty)}
                                    title={comp.fixedQty ? 'Cantidad fija para todo el pedido — clic para cambiar a ×kit' : 'Cantidad por kit — clic para fijar cantidad total del pedido'}
                                    style={{ height: 32, padding: '0 8px', borderRadius: 6, border: `1.5px solid ${comp.fixedQty ? 'var(--brand)' : 'var(--border)'}`, background: comp.fixedQty ? 'rgba(124,58,237,.1)' : 'transparent', color: comp.fixedQty ? 'var(--brand)' : 'var(--txt4)', cursor: 'pointer', fontSize: 10, fontWeight: 700, fontFamily: 'inherit', flexShrink: 0, lineHeight: 1 }}>
                                    {comp.fixedQty ? '📦 fijo' : '×kit'}
                                  </button>
                                </div>
                                {/* Cant. — modo ×kit muestra cantidad por kit; modo fijo muestra cantidad total del pedido */}
                                <input type="number" min="1"
                                  value={num(comp.qty) || 1}
                                  onFocus={selectOnFocus}
                                  onChange={e => updatePackComp(kitIdx, cIdx, 'qty', Math.max(1, parseInt(e.target.value) || 1))}
                                  title={comp.fixedQty
                                    ? `Cantidad fija total del pedido: ${num(comp.qty) || 1}`
                                    : `${num(comp.qty) || 1} por kit × ${num(kit.qty) || 1} kits = ${(num(comp.qty) || 1) * (num(kit.qty) || 1)} total`}
                                  style={{ height: 32, textAlign: 'center', fontSize: 12, padding: '0 4px', fontWeight: 700, borderColor: comp.fixedQty ? 'var(--brand)' : undefined }} />
                                {/* Costo unitario */}
                                <input type="text" inputMode="numeric" value={fmtTbl(comp.costUnit)} onFocus={selectOnFocus}
                                  onChange={e => { const r = parseTbl(e.target.value); updatePackComp(kitIdx, cIdx, 'costUnit', r === '' ? 0 : Number(r)) }}
                                  style={{ height: 32, textAlign: 'right', fontSize: 12, padding: '0 8px', fontVariantNumeric: 'tabular-nums' }} />
                                {/* Subtotal */}
                                <div style={{ textAlign: 'right', fontSize: 12, fontWeight: 700, color: num(comp.costUnit) > 0 ? 'var(--money)' : 'var(--txt4)', fontVariantNumeric: 'tabular-nums' }}>
                                  {num(comp.costUnit) > 0
                                    ? fmt(comp.fixedQty
                                        ? num(comp.costUnit) * num(comp.qty)
                                        : num(comp.costUnit) * num(comp.qty) * num(kit.qty))
                                    : '—'}
                                </div>
                                {/* Remove */}
                                <button onClick={() => removePackComp(kitIdx, cIdx)}
                                  style={{ width: 26, height: 26, borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--txt4)', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--red)'; e.currentTarget.style.background = 'var(--red-lt)' }}
                                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--txt4)'; e.currentTarget.style.background = 'transparent' }}>
                                  <i className="fa fa-xmark" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        {/* Botón Agregar insumo — minimalista, alineado izquierda */}
                        <button className="tbl-add-btn" onClick={() => addPackComp(kitIdx)}>
                          <i className="fa fa-plus" /> Agregar insumo
                        </button>
                      </div>

                      {/* ─ Componente B: Contenido del kit ─ */}
                      <div className="tbl-card">
                        <div className="tbl-section-hd">
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div className="badge" style={{ background: '#059669' }}>B</div>
                            <span className="label">Contenido del kit</span>
                            <span className="hint">productos incluidos en cada caja</span>
                          </div>
                        </div>
                        {(kit.products || []).length === 0 ? (
                          <div style={{ textAlign: 'center', padding: '9px 12px', background: 'var(--surface)', borderRadius: 8, border: '1px dashed var(--border)', color: 'var(--txt3)', fontSize: 11 }}>
                            <i className="fa fa-gift" style={{ marginRight: 5, opacity: .45 }} />
                            Sin productos — agregá mates, termos, tazas, libretas, etc.
                          </div>
                        ) : (
                          <div className="kit-tbl">
                            {/* Header de columnas — mismo patrón que modo simple */}
                            <div className="kit-tbl-hdr">
                              <span></span>
                              <span style={{ textAlign: 'left' }}>Producto</span>
                              <span style={{ textAlign: 'center' }}>Cant. ×kit</span>
                              <span style={{ textAlign: 'right' }}>Costo u.</span>
                              <span style={{ textAlign: 'right' }}>Subtotal</span>
                              <span></span>
                            </div>
                            {(kit.products || []).map((comp, cIdx) => (
                              <div key={cIdx} className="kit-tbl-row">
                                <span className="ico" style={{ color: '#059669', opacity: .7, fontSize: 11 }}>
                                  <i className="fa fa-gift" />
                                </span>
                                <div style={{ minWidth: 0 }}>
                                  <ProductAutocomplete
                                    value={comp.name}
                                    products={products}
                                    onChangeText={(v) => updateProdComp(kitIdx, cIdx, 'name', v)}
                                    onPick={(p) => {
                                      updateProdComp(kitIdx, cIdx, 'name', p.name)
                                      updateProdComp(kitIdx, cIdx, 'costUnit', p.cost || 0)
                                      updateProdComp(kitIdx, cIdx, 'id', p.id)
                                    }}
                                    placeholder="Nombre del producto..."
                                    inputStyle={{ fontSize: 12, padding: '5px 8px', height: 32 }}
                                  />
                                </div>
                                {/* Cant. por kit (1 = una unidad por cada caja) */}
                                <input type="number" min="1"
                                  value={num(comp.qty) || 1}
                                  onFocus={selectOnFocus}
                                  onChange={e => updateProdComp(kitIdx, cIdx, 'qty', Math.max(1, parseInt(e.target.value) || 1))}
                                  title={`Total = ${(num(comp.qty) || 1) * (num(kit.qty) || 1)} unidades (${num(comp.qty) || 1} × ${num(kit.qty) || 1} kits)`}
                                  style={{ height: 32, textAlign: 'center', fontSize: 12, padding: '0 4px', fontWeight: 700 }} />
                                {/* Costo unitario */}
                                <input type="text" inputMode="numeric" value={fmtTbl(comp.costUnit)} onFocus={selectOnFocus}
                                  onChange={e => { const r = parseTbl(e.target.value); updateProdComp(kitIdx, cIdx, 'costUnit', r === '' ? 0 : Number(r)) }}
                                  style={{ height: 32, textAlign: 'right', fontSize: 12, padding: '0 8px', fontVariantNumeric: 'tabular-nums' }} />
                                {/* Subtotal = qty × kit.qty × costUnit */}
                                <div style={{ textAlign: 'right', fontSize: 12, fontWeight: 700, color: num(comp.costUnit) > 0 ? 'var(--money)' : 'var(--txt4)', fontVariantNumeric: 'tabular-nums' }}>
                                  {num(comp.costUnit) > 0 ? fmt(num(comp.costUnit) * num(comp.qty) * num(kit.qty)) : '—'}
                                </div>
                                {/* Remove */}
                                <button onClick={() => removeProdComp(kitIdx, cIdx)}
                                  style={{ width: 26, height: 26, borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--txt4)', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--red)'; e.currentTarget.style.background = 'var(--red-lt)' }}
                                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--txt4)'; e.currentTarget.style.background = 'transparent' }}>
                                  <i className="fa fa-xmark" />
                                </button>
                              </div>
                            ))}
                            <div style={{ fontSize: 10, color: 'var(--txt3)', fontStyle: 'italic', textAlign: 'right', padding: '4px 8px 0' }}>
                              <i className="fa fa-circle-info" style={{ marginRight: 4, opacity: .6 }} />
                              Cant. ×kit es lo que lleva <strong>cada caja</strong>. El total cobrado se multiplica por {num(kit.qty) || 1} kits.
                            </div>
                          </div>
                        )}
                        {/* Botón Agregar producto — minimalista, alineado izquierda */}
                        <button className="tbl-add-btn" onClick={() => addProdComp(kitIdx)}>
                          <i className="fa fa-plus" /> Agregar producto
                        </button>
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

                        {/* Costo del diseñador (honorario único, se amortiza) */}
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--border)', flexWrap: 'wrap' }}>
                          <div style={{ flex: 1, minWidth: 130 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt2)', display: 'flex', alignItems: 'center', gap: 5 }}>
                              <i className="fa fa-pen-ruler" style={{ opacity: .65, fontSize: 10 }} />
                              Costo del diseñador
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 1 }}>Honorario único — se amortiza por cantidad</div>
                          </div>
                          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 11, color: 'var(--txt3)', whiteSpace: 'nowrap' }}>$ total</span>
                            <input type="text" inputMode="numeric" value={fmtTbl(kit.personalizacion?.designCost)}
                              onFocus={selectOnFocus}
                              onChange={e => { const r = parseTbl(e.target.value); updatePersonalizacion(kitIdx, 'designCost', r === '' ? 0 : Number(r)) }}
                              style={{ width: 90, textAlign: 'right', fontSize: 12, padding: '6px 8px', height: 32, fontVariantNumeric: 'tabular-nums' }} />
                          </div>
                        </div>
                        {num(kit.personalizacion?.designCost) > 0 && (
                          <div style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 4 }}>
                            {fmt(num(kit.personalizacion.designCost))} ÷ {num(kit.qty)} u. = <strong style={{ color: 'var(--money)' }}>{fmt(Math.round(num(kit.personalizacion.designCost) / Math.max(1, num(kit.qty))))}</strong> amortizado por kit
                          </div>
                        )}

                        {/* 🛠️ Mano de Obra (honorario único, se amortiza por kit) */}
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--border)', flexWrap: 'wrap' }}>
                          <div style={{ flex: 1, minWidth: 130 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt2)', display: 'flex', alignItems: 'center', gap: 5 }}>
                              🛠️ Costo Mano de Obra
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 1 }}>Honorario único — se amortiza por cantidad</div>
                          </div>
                          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 11, color: 'var(--txt3)', whiteSpace: 'nowrap' }}>$ total</span>
                            <input type="text" inputMode="numeric" value={fmtTbl(kit.personalizacion?.laborCost)}
                              onFocus={selectOnFocus}
                              onChange={e => { const r = parseTbl(e.target.value); updatePersonalizacion(kitIdx, 'laborCost', r === '' ? 0 : Number(r)) }}
                              style={{ width: 90, textAlign: 'right', fontSize: 12, padding: '6px 8px', height: 32, fontVariantNumeric: 'tabular-nums' }} />
                          </div>
                        </div>
                        {num(kit.personalizacion?.laborCost) > 0 && (
                          <div style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 4 }}>
                            {fmt(num(kit.personalizacion.laborCost))} ÷ {num(kit.qty)} u. = <strong style={{ color: 'var(--money)' }}>{fmt(Math.round(num(kit.personalizacion.laborCost) / Math.max(1, num(kit.qty))))}</strong> amortizado por kit
                          </div>
                        )}

                        {/* 🖨️ Impresión General (valor fijo total) */}
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--border)', flexWrap: 'wrap' }}>
                          <div style={{ flex: 1, minWidth: 130 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt2)', display: 'flex', alignItems: 'center', gap: 5 }}>
                              🖨️ Costo de Impresión General
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 1 }}>Valor fijo total del proceso de estampado/grabado</div>
                          </div>
                          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 11, color: 'var(--txt3)', whiteSpace: 'nowrap' }}>$ total</span>
                            <input type="text" inputMode="numeric" value={fmtTbl(kit.personalizacion?.printCost)}
                              onFocus={selectOnFocus}
                              onChange={e => { const r = parseTbl(e.target.value); updatePersonalizacion(kitIdx, 'printCost', r === '' ? 0 : Number(r)) }}
                              style={{ width: 90, textAlign: 'right', fontSize: 12, padding: '6px 8px', height: 32, fontVariantNumeric: 'tabular-nums' }} />
                          </div>
                        </div>
                        {num(kit.personalizacion?.printCost) > 0 && (
                          <div style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 4 }}>
                            {fmt(num(kit.personalizacion.printCost))} ÷ {num(kit.qty)} u. = <strong style={{ color: 'var(--money)' }}>{fmt(Math.round(num(kit.personalizacion.printCost) / Math.max(1, num(kit.qty))))}</strong> amortizado por kit
                          </div>
                        )}
                      </div>

                      {/* ─ Resumen de costo del kit ─ */}
                      {kitCostUnit(kit) > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 18, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
                          <span style={{ fontSize: 11, color: 'var(--txt3)' }}>
                            Costo real u.: <strong style={{ color: 'var(--txt2)', fontVariantNumeric: 'tabular-nums' }}>{fmt(kitCostUnit(kit))}</strong>
                          </span>
                          {effectiveKitPrice(kit) > 0 && (() => {
                            const pEff = effectiveKitPrice(kit)
                            const margin = ((pEff - kitCostUnit(kit)) / pEff * 100)
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
                  </>
                )}

                {/* Picker de insumos — fuera del kitMode para funcionar en ambos modos */}
                <ProductPicker open={insPickerOpen} onClose={() => { setInsPickerOpen(false); setInsPickerTarget(null) }}
                  products={insumos.map(ins => ({ ...ins, cost: num(ins.cost || ins.costUnit || 0), cat: ins.unit || ins.cat || '' }))}
                  onSelect={(ins) => {
                    if (!insPickerTarget) return
                    const { kitIdx, cIdx } = insPickerTarget
                    if (kitIdx === -1) {
                      // Modo simple: actualizar simplePack
                      updateSimplePack(cIdx, 'name', ins.name || '')
                      updateSimplePack(cIdx, 'costUnit', num(ins.cost))
                    } else {
                      // Modo kit: actualizar packaging del kit
                      setItems(prev => prev.map((k, i) => {
                        if (i !== kitIdx) return k
                        return { ...k, packaging: (k.packaging || []).map((c, j) => j !== cIdx ? c : { ...c, id: ins.id || '', name: ins.name || '', costUnit: num(ins.cost) }) }
                      }))
                    }
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
                  <div className="fg"><label>Margen ganancia (%)</label><input type="number" value={form.margin} onFocus={selectOnFocus} onChange={e => setMarginAndReprice(e.target.value)} onBlur={e => { if (e.target.value === '') setMarginAndReprice(0) }} min="0" max="100" style={{ maxWidth: 120 }} /></div>
                  <div className="fg"><label>Seña requerida (%)</label><input type="number" value={form.deposit} onFocus={selectOnFocus} onChange={e => setF('deposit', e.target.value)} onBlur={e => { if (e.target.value === '') setF('deposit', 0) }} min="0" max="100" style={{ maxWidth: 120 }} /></div>
                  {/* "Impresión/logo x u." removido — el costo de impresión vive ahora en Personalización (Costo de Impresión General, fijo total) */}
                </div>
                {feats.descuentoCliente && (
                  <div className="fg" style={{ maxWidth: 200, marginTop: 4 }}>
                    <label>Descuento al cliente (%)</label>
                    <input type="number" value={form.discount} onFocus={selectOnFocus} onChange={e => setDiscountAndReprice(e.target.value)} onBlur={e => { if (e.target.value === '') setDiscountAndReprice(0) }} min="0" max="100" style={{ maxWidth: 120 }} />
                  </div>
                )}

                {/* ─── 🚚 Logística / Comisionista ─── */}
                <div style={{ marginTop: 20, padding: '18px 20px', background: 'var(--bg-card, #fff)', border: '1px solid var(--border, #E5E7EB)', borderRadius: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>🚚</span> Logística / Comisionista
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        Paradas del viaje (insumos, mercadería o entrega). Suma al costo total y se sincroniza con Control de Viajes.
                      </div>
                    </div>
                    {form.viajeId && (
                      <span style={{ background: '#EDE9FE', color: '#5B21B6', padding: '3px 8px', borderRadius: 9999, fontSize: 10, fontWeight: 700 }} title="Vinculado a un viaje registrado en Logística">
                        <i className="fa fa-link" /> Viaje #{form.viajeId}
                      </span>
                    )}
                  </div>
                  <div className="grid2" style={{ marginBottom: 10 }}>
                    <div className="fg">
                      <label>Comisionista / Transportista</label>
                      <input type="text" value={form.comisionista || ''} onChange={e => setF('comisionista', e.target.value)} placeholder="Nombre del comisionista" />
                    </div>
                    <div className="fg">
                      <label>Fecha del viaje</label>
                      <input type="date" value={form.viajeFecha || ''} onChange={e => setF('viajeFecha', e.target.value)} />
                    </div>
                  </div>

                  {(form.logisticaParadas || []).length === 0 && (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0', fontStyle: 'italic' }}>
                      Sin paradas cargadas. Agregá las paradas que componen este viaje.
                    </div>
                  )}
                  {(form.logisticaParadas || []).map((p, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                      <select value={p.category} onChange={e => updateParada(idx, 'category', e.target.value)} style={{ flex: '0 0 180px' }}>
                        {PARADA_CATEGORIES.map(t => <option key={t.val} value={t.val}>{t.lbl}</option>)}
                      </select>
                      <input type="text" value={p.detail || ''} onChange={e => updateParada(idx, 'detail', e.target.value)} placeholder="Descripción (dónde / qué)" style={{ flex: '1 1 180px', minWidth: 140 }} />
                      <input type="number" min="0" value={p.cost || 0} onFocus={selectOnFocus}
                        onChange={e => updateParada(idx, 'cost', e.target.value === '' ? 0 : Number(e.target.value))}
                        placeholder="Costo $" style={{ width: 110, textAlign: 'right' }} />
                      <button type="button" className="btn btn-ghost btn-xs" onClick={() => removeParada(idx)} style={{ color: 'var(--red, #EF4444)', padding: '2px 6px' }}>
                        <i className="fa fa-trash" />
                      </button>
                    </div>
                  ))}

                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                    <button type="button" className="btn btn-ghost btn-xs" onClick={() => addParada('Insumos')}>
                      <i className="fa fa-plus" /> Retiro Insumos
                    </button>
                    <button type="button" className="btn btn-ghost btn-xs" onClick={() => addParada('Mercadería')}>
                      <i className="fa fa-plus" /> Retiro Mercadería
                    </button>
                    <button type="button" className="btn btn-ghost btn-xs" onClick={() => addParada('Entrega Pedido')}>
                      <i className="fa fa-plus" /> Entrega Pedido
                    </button>
                  </div>

                  {calc.viajesCost > 0 && (
                    <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px dashed var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        Total logística ({(form.logisticaParadas || []).length} parada{(form.logisticaParadas || []).length !== 1 ? 's' : ''})
                      </span>
                      <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>{fmt(calc.viajesCost)}</span>
                    </div>
                  )}
                </div>

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

                  {/* ─ Resumen desglosado ─ */}
                  <div className="wiz-rev-card">
                    <div className="wiz-rev-card-h"><i className="fa fa-calculator" /> Resumen desglosado</div>
                    <div className="wiz-rev-body">
                      {alternatives.length > 1 && approvedAlt && (
                        <div style={{ fontSize: 11, color: '#059669', fontWeight: 600, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 5 }}>
                          <i className="fa fa-circle-check" /> Alternativa aprobada: {approvedAlt.label}
                        </div>
                      )}
                      {items.filter(i => i.type === 'kit' ? (i.name || i.packaging?.length || i.products?.length) : i.name).map((it, idx) => (
                        <div key={idx} style={{ marginBottom: idx < items.length - 1 ? 10 : 0 }}>
                          <div className="wiz-rev-item" style={{ fontWeight: 700 }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              <i className="fa fa-gift" style={{ fontSize: 9, color: 'var(--brand)', opacity: .7 }} />
                              {it.type === 'kit' ? (it.name || 'Kit sin nombre') : it.name} ×{it.qty}
                            </span>
                            <span style={{ color: 'var(--brand)' }}>{fmt(num(it.qty) * num(it.priceUnit))}</span>
                          </div>
                          {it.type === 'kit' && (() => {
                            const packLines = (it.packaging || []).filter(c => c.name)
                            const prodLines = (it.products || []).filter(c => c.name)
                            const hasPers = it.personalizacion?.desc || num(it.personalizacion?.costUnit) > 0
                            const hasDesign = num(it.personalizacion?.designCost) > 0
                            if (!packLines.length && !prodLines.length && !hasPers && !hasDesign) return null
                            return (
                              <div style={{ paddingLeft: 14, marginTop: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
                                {packLines.map((c, ci) => (
                                  <div key={ci} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: 'var(--txt3)' }}>
                                    <span>📦 {c.name}
                                      {c.fixedQty
                                        ? <span style={{ fontSize: 9, marginLeft: 4, background: 'rgba(124,58,237,.08)', border: '1px solid rgba(124,58,237,.2)', borderRadius: 4, padding: '1px 5px', color: 'var(--brand)' }}>×{c.qty} fijo</span>
                                        : <span style={{ fontSize: 9, color: 'var(--txt4)', marginLeft: 3 }}>×{num(c.qty) * num(it.qty)}</span>}
                                    </span>
                                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                                      {c.fixedQty ? fmt(num(c.costUnit) * num(c.qty)) : fmt(num(c.costUnit) * num(c.qty) * num(it.qty))}
                                    </span>
                                  </div>
                                ))}
                                {prodLines.map((c, ci) => (
                                  <div key={ci} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: 'var(--txt3)' }}>
                                    <span>🎁 {c.name} <span style={{ fontSize: 9, color: 'var(--txt4)', marginLeft: 3 }}>×{num(c.qty) * num(it.qty)}</span></span>
                                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(num(c.costUnit) * num(c.qty) * num(it.qty))}</span>
                                  </div>
                                ))}
                                {hasPers && (
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: 'var(--txt3)' }}>
                                    <span>🎨 {it.personalizacion.desc || 'Personalización'} <span style={{ fontSize: 9, color: 'var(--txt4)', marginLeft: 3 }}>×{it.qty}</span></span>
                                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(num(it.personalizacion.costUnit) * num(it.qty))}</span>
                                  </div>
                                )}
                                {hasDesign && (
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: 'var(--txt3)' }}>
                                    <span>✏️ Costo diseñador <span style={{ fontSize: 9, color: 'var(--txt4)', marginLeft: 3 }}>(único)</span></span>
                                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(num(it.personalizacion.designCost))}</span>
                                  </div>
                                )}
                              </div>
                            )
                          })()}
                        </div>
                      ))}
                      {/* Simple mode: packaging + personalizacion extras */}
                      {!kitMode && (simplePack.filter(c => c.name).length > 0 || simplePers.desc || num(simplePers.costUnit) > 0 || num(simplePers.designCost) > 0 || num(simplePers.laborCost) > 0 || num(simplePers.printCost) > 0) && (
                        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--border)' }}>
                          {simplePack.filter(c => c.name).map((c, ci) => (
                            <div key={ci} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: 'var(--txt3)', marginBottom: 3 }}>
                              <span>📦 {c.name} <span style={{ fontSize: 9, color: 'var(--txt4)', marginLeft: 3 }}>×{c.qty}</span></span>
                              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(num(c.costUnit) * num(c.qty))}</span>
                            </div>
                          ))}
                          {(simplePers.desc || num(simplePers.costUnit) > 0) && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: 'var(--txt3)', marginBottom: 3 }}>
                              <span>🎨 {simplePers.desc || 'Personalización'}</span>
                              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(num(simplePers.costUnit) * items.reduce((s, i) => s + num(i.qty), 0))}</span>
                            </div>
                          )}
                          {num(simplePers.designCost) > 0 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: 'var(--txt3)' }}>
                              <span>✏️ Costo diseñador <span style={{ fontSize: 9, color: 'var(--txt4)', marginLeft: 3 }}>(único)</span></span>
                              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(num(simplePers.designCost))}</span>
                            </div>
                          )}
                          {num(simplePers.laborCost) > 0 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: 'var(--txt3)' }}>
                              <span>🛠️ Mano de obra <span style={{ fontSize: 9, color: 'var(--txt4)', marginLeft: 3 }}>(único)</span></span>
                              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(num(simplePers.laborCost))}</span>
                            </div>
                          )}
                          {num(simplePers.printCost) > 0 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: 'var(--txt3)' }}>
                              <span>🖨️ Impresión general <span style={{ fontSize: 9, color: 'var(--txt4)', marginLeft: 3 }}>(fijo)</span></span>
                              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(num(simplePers.printCost))}</span>
                            </div>
                          )}
                        </div>
                      )}
                      {calc.logTotal > 0 && (
                        <div className="wiz-rev-item" style={{ color: 'var(--txt2)', fontSize: 11, marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--border)' }}>
                          <span>🖨️ Impresión/logo global</span>
                          <span>{fmt(calc.logTotal)}</span>
                        </div>
                      )}
                      {calc.discountAmt > 0 && (
                        <div className="wiz-rev-item" style={{ color: 'var(--red)', fontSize: 12, marginTop: 4 }}>
                          <span>Descuento ({calc.discountPct}%)</span>
                          <span>−{fmt(calc.discountAmt)}</span>
                        </div>
                      )}
                      <div className="wiz-rev-item" style={{ fontWeight: 800, fontSize: 16, marginTop: 10, paddingTop: 10, borderTop: '2px solid var(--border)' }}>
                        <span>Total</span>
                        <span style={{ color: 'var(--brand)' }}>{fmt(calc.total)}</span>
                      </div>
                      {showPaymentDetails && (
                        <>
                          <div className="wiz-rev-item" style={{ fontWeight: 600, color: 'var(--txt2)', marginTop: 4 }}>
                            <span>Seña ({form.deposit}%)</span>
                            <span>{fmt(calc.depositAmt)}</span>
                          </div>
                          <div className="wiz-rev-item" style={{ fontWeight: 700, color: '#16A34A' }}>
                            <span>Saldo contra entrega</span>
                            <span>{fmt(calc.total - calc.depositAmt)}</span>
                          </div>
                        </>
                      )}
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
                  {feats.margenTabla && !calc.costPending && calc.marginLow && <span className="pmt-warn" title={`Margen bajo (< ${calc.marginThreshold}%)`}><i className="fa fa-triangle-exclamation" /></span>}
                  {feats.margenTabla && <div className="pmt-margin" style={calc.costPending ? { color: '#F59E0B', fontStyle: 'italic' } : undefined} title={calc.costPending ? 'Falta cargar el costo' : undefined}>{calc.costPending ? '—' : `${calc.marginReal}%`}</div>}
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
            {feats.costoInterno && <div className="cp-row"><span className="cp-lbl">Costo proveedor</span><span className="cp-val" style={calc.costPending ? { color: '#F59E0B', fontStyle: 'italic', fontWeight: 700 } : undefined} title="Suma de qty × costoUnit de todos los productos/kits + packaging + personalización fija">{calc.costPending ? 'Pendiente' : fmt(calc.totalCost)}</span></div>}
            {calc.persFixedTotal > 0 && (
              <div className="cp-row" style={{ paddingLeft: 12 }} title="Honorarios fijos (Diseñador + Mano de Obra + Impresión General). Se amortizan según las cantidades del pedido.">
                <span className="cp-lbl" style={{ fontSize: 10.5, opacity: .75 }}>↳ Personalización fija</span>
                <span className="cp-val" style={{ fontSize: 11.5, opacity: .9 }}>{fmt(calc.persFixedTotal)}</span>
              </div>
            )}
            {calc.logTotal > 0 && <div className="cp-row"><span className="cp-lbl">Impresión</span><span className="cp-val">{fmt(calc.logTotal)}</span></div>}
            {num(form.shipCost) > 0 && <div className="cp-row"><span className="cp-lbl">Envío</span><span className="cp-val">{fmt(num(form.shipCost))}</span></div>}
            {calc.viajesCost > 0 && <div className="cp-row"><span className="cp-lbl">🚚 Logística</span><span className="cp-val">{fmt(calc.viajesCost)}</span></div>}
            {feats.costoInterno && (() => {
              const breakdown = [
                `Productos: ${fmt(calc.totalCost)}`,
                calc.logTotal > 0 ? `Impresión: ${fmt(calc.logTotal)}` : null,
                num(form.shipCost) > 0 ? `Envío: ${fmt(num(form.shipCost))}` : null,
                calc.viajesCost > 0 ? `Logística: ${fmt(calc.viajesCost)}` : null,
              ].filter(Boolean).join(' · ')
              return (
                <div className="cp-row" style={{ background: 'rgba(245,158,11,.12)', borderRadius: 6, padding: '4px 8px', margin: '4px 0', borderLeft: '3px solid #F59E0B' }} title={`Costo crudo antes de margen e IVA — ${breakdown}`}>
                  <span className="cp-lbl" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <i className="fa fa-lock" style={{ fontSize: 9, color: '#F59E0B' }} />
                    <span>Costo Real</span>
                    <span style={{ fontSize: 8, opacity: .6, fontStyle: 'italic' }}>(interno · pre-margen)</span>
                  </span>
                  <span className="cp-val" style={calc.costPending ? { color: '#F59E0B', fontStyle: 'italic', fontWeight: 800 } : { color: '#FBBF24', fontWeight: 800 }}>
                    {calc.costPending ? 'Pendiente' : fmt(calc.baseCost)}
                  </span>
                </div>
              )
            })()}
            {feats.margenTabla && <div className="cp-row"><span className="cp-lbl">Ganancia</span><span className="cp-val" style={calc.costPending ? { color: '#F59E0B', fontStyle: 'italic', fontWeight: 700 } : { color: '#86EFAC' }}>{calc.costPending ? 'Pendiente' : fmt(calc.gain)}</span></div>}
            {feats.margenTabla && (() => {
              const target = num(form.margin)
              const real = Number(calc.marginReal) || 0
              const drift = Math.abs(real - target)
              const matches = !calc.costPending && drift < 0.5
              return (
                <>
                  <div className="cp-row">
                    <span className="cp-lbl" title="El margen que ingresaste como objetivo">
                      <i className="fa fa-bullseye" style={{ fontSize: 9, marginRight: 4, opacity: .6 }} />
                      Margen objetivo
                    </span>
                    <span className="cp-val" style={{ opacity: .85, fontWeight: 700 }}>{target}%</span>
                  </div>
                  <div className="cp-row">
                    <span className="cp-lbl">Margen real</span>
                    <span className="cp-val" style={calc.costPending ? { color: '#F59E0B', fontStyle: 'italic', fontWeight: 700 } : (calc.marginLow ? { color: 'var(--red)', fontWeight: 800 } : (matches ? { color: '#86EFAC', fontWeight: 700 } : undefined))}>
                      {calc.costPending ? 'Pendiente' : `${calc.marginReal}%`}
                      {!calc.costPending && matches && <i className="fa fa-check" style={{ marginLeft: 4, fontSize: 9, color: '#86EFAC' }} title="Coincide con el objetivo" />}
                      {!calc.costPending && !matches && drift >= 0.5 && drift < 2 && <i className="fa fa-circle-info" style={{ marginLeft: 4, fontSize: 9, opacity: .6 }} title={`Drift de ${drift.toFixed(1)} pts por redondeo de precio por unidad`} />}
                      {!calc.costPending && calc.marginLow && <i className="fa fa-triangle-exclamation" style={{ marginLeft: 4, fontSize: 10 }} title={`Margen bajo (< ${calc.marginThreshold}%)`} />}
                      {calc.costPending && <i className="fa fa-circle-info" style={{ marginLeft: 4, fontSize: 10 }} title="Cargá el costo de los productos para calcular el margen real" />}
                    </span>
                  </div>
                </>
              )
            })()}
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
            {/* ── Desglose por kit (con anidamiento de componentes) ── */}
            {items.filter(i => i.type === 'kit' ? (i.name || i.packaging?.length || i.products?.length) : i.name).length > 0 && (
              <div style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid rgba(255,255,255,.08)' }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,.28)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>Desglose</div>
                {items.filter(i => i.type === 'kit' ? (i.name || i.packaging?.length || i.products?.length) : i.name).map((it, idx) => {
                  const isKit = it.type === 'kit'
                  const kitQty = num(it.qty) || 1
                  // Componentes anidados — solo en modo kit
                  const products  = isKit ? (it.products  || []).filter(p => p.name) : []
                  const packaging = isKit ? (it.packaging || []).filter(p => p.name) : []
                  const hasPers   = isKit && (it.personalizacion?.desc || num(it.personalizacion?.costUnit) > 0)
                  const hasDesign = isKit && num(it.personalizacion?.designCost) > 0
                  const hasLabor  = isKit && num(it.personalizacion?.laborCost)  > 0
                  const hasPrint  = isKit && num(it.personalizacion?.printCost)  > 0
                  return (
                    <div key={idx} style={{ marginBottom: 8, padding: isKit && (products.length || packaging.length || hasPers || hasDesign || hasLabor || hasPrint) ? '6px 8px 4px' : 0, background: isKit && (products.length || packaging.length) ? 'rgba(255,255,255,.03)' : 'transparent', borderRadius: 6, border: isKit && (products.length || packaging.length) ? '1px solid rgba(255,255,255,.06)' : 'none' }}>
                      {/* Header del ítem (kit o producto simple) */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11.5, color: 'rgba(255,255,255,.85)', fontWeight: 700 }}>
                          {isKit ? '📦 ' : ''}{isKit ? (it.name || 'Kit') : it.name}
                          <span style={{ fontWeight: 400, color: 'rgba(255,255,255,.45)', marginLeft: 4, fontSize: 10 }}>
                            ({it.qty} {isKit ? (it.qty !== 1 ? 'uds' : 'ud') : (it.qty !== 1 ? 'unidades' : 'unidad')})
                          </span>
                        </span>
                        <span style={{ fontSize: 11.5, fontWeight: 800, color: 'rgba(255,255,255,.95)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                          {fmt(num(it.qty) * (isKit ? effectiveKitPrice(it) : num(it.priceUnit)))}
                        </span>
                      </div>

                      {/* Subtítulo cost u. — sólo para productos simples (no kits anidados) */}
                      {!isKit && (
                        <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,.35)', marginTop: 1 }}>
                          Costo u.: {fmt(Math.round(num(it.costUnit)))}
                        </div>
                      )}

                      {/* ── Componentes anidados del kit (sangrado + línea vertical) ── */}
                      {isKit && (products.length > 0 || packaging.length > 0 || hasPers || hasDesign || hasLabor || hasPrint) && (
                        <div style={{ marginTop: 6, marginLeft: 16, paddingLeft: 10, borderLeft: '1.5px solid rgba(167,139,250,.28)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                          {/* B — Productos del kit */}
                          {products.map((p, pi) => (
                            <div key={`p-${pi}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, fontSize: 10.5, color: 'rgba(255,255,255,.55)' }}>
                              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                <span style={{ color: 'rgba(255,255,255,.35)', marginRight: 5 }}>↳</span>
                                🎁 {p.name}
                                <span style={{ color: 'rgba(255,255,255,.3)', marginLeft: 4, fontSize: 9.5 }}>× {num(p.qty) || 1}</span>
                              </span>
                              {num(p.costUnit) > 0 && (
                                <span style={{ fontSize: 10, color: 'rgba(255,255,255,.4)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                                  {fmt(num(p.costUnit) * num(p.qty) * kitQty)}
                                </span>
                              )}
                            </div>
                          ))}
                          {/* A — Packaging del kit */}
                          {packaging.map((p, pi) => (
                            <div key={`pk-${pi}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, fontSize: 10.5, color: 'rgba(255,255,255,.55)' }}>
                              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                <span style={{ color: 'rgba(255,255,255,.35)', marginRight: 5 }}>↳</span>
                                📦 {p.name}
                                <span style={{ color: 'rgba(255,255,255,.3)', marginLeft: 4, fontSize: 9.5 }}>
                                  × {p.fixedQty ? (num(p.qty) || 1) : (num(p.qty) || 1) * kitQty}
                                  {p.fixedQty ? <span style={{ marginLeft: 3, color: 'rgba(167,139,250,.55)', fontWeight: 700 }}>(fijo)</span> : null}
                                </span>
                              </span>
                              {num(p.costUnit) > 0 && (
                                <span style={{ fontSize: 10, color: 'rgba(255,255,255,.4)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                                  {fmt(p.fixedQty ? num(p.costUnit) * num(p.qty) : num(p.costUnit) * num(p.qty) * kitQty)}
                                </span>
                              )}
                            </div>
                          ))}
                          {/* C — Personalización */}
                          {hasPers && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, fontSize: 10.5, color: 'rgba(255,255,255,.55)' }}>
                              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                <span style={{ color: 'rgba(255,255,255,.35)', marginRight: 5 }}>↳</span>
                                🎨 {it.personalizacion?.desc || 'Personalización'}
                              </span>
                              {num(it.personalizacion?.costUnit) > 0 && (
                                <span style={{ fontSize: 10, color: 'rgba(255,255,255,.4)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                                  {fmt(num(it.personalizacion.costUnit) * kitQty)}
                                </span>
                              )}
                            </div>
                          )}
                          {hasDesign && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, fontSize: 10.5, color: 'rgba(167,139,250,.6)' }}>
                              <span><span style={{ color: 'rgba(255,255,255,.35)', marginRight: 5 }}>↳</span>✏️ Diseñador <span style={{ fontSize: 9, opacity: .7 }}>(único)</span></span>
                              <span style={{ fontSize: 10, fontVariantNumeric: 'tabular-nums' }}>{fmt(num(it.personalizacion.designCost))}</span>
                            </div>
                          )}
                          {hasLabor && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, fontSize: 10.5, color: 'rgba(167,139,250,.6)' }}>
                              <span><span style={{ color: 'rgba(255,255,255,.35)', marginRight: 5 }}>↳</span>🛠️ Mano de obra <span style={{ fontSize: 9, opacity: .7 }}>(único)</span></span>
                              <span style={{ fontSize: 10, fontVariantNumeric: 'tabular-nums' }}>{fmt(num(it.personalizacion.laborCost))}</span>
                            </div>
                          )}
                          {hasPrint && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, fontSize: 10.5, color: 'rgba(167,139,250,.6)' }}>
                              <span><span style={{ color: 'rgba(255,255,255,.35)', marginRight: 5 }}>↳</span>🖨️ Impresión <span style={{ fontSize: 9, opacity: .7 }}>(fijo)</span></span>
                              <span style={{ fontSize: 10, fontVariantNumeric: 'tabular-nums' }}>{fmt(num(it.personalizacion.printCost))}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

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

              {mpResult && (
                <div style={{ marginTop: 6, fontSize: 10, wordBreak: 'break-all' }}>
                  {mpResult.ok
                    ? <a href={mpResult.link} target="_blank" rel="noopener noreferrer" style={{ color: '#009EE3' }}>{mpResult.label} — Abrir link</a>
                    : <span style={{ color: 'var(--red)' }}>Error: {mpResult.message}</span>}
                </div>
              )}
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
