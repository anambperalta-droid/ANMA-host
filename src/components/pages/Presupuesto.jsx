import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useData } from '../../context/DataContext'
import { useToast } from '../../context/ToastContext'
import { fmt } from '../../lib/storage'
import { getMPConfig, createPaymentLink, getBankConfig, buildBankInfoText } from '../../lib/mercadopago'
import { pushBudget, getSheetsConfig } from '../../lib/sheets'

const emptyItem = () => ({ name: '', qty: 1, costUnit: '', priceUnit: '' })

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

/* ── Helpers para inputs numéricos sin NaN ── */
const num = (v) => { const n = Number(v); return isNaN(n) ? 0 : n }
const selectOnFocus = (e) => e.target.select()

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
  const { get, config, saveBudget } = useData()
  const toast = useToast()
  const c = config()

  const [form, setForm] = useState({
    contact: '', company: '', wa: '', ocasion: '', delivery: '', deliveryDate: '',
    shipCost: 0, shipCharged: false, envioACotizar: true, status: 'draft', payStatus: 'pending', noteInt: '', noteCli: '',
    margin: c.defaultMargin || 40, deposit: c.defaultDeposit || 50, logoCost: 0,
  })
  const [items, setItems] = useState([emptyItem()])
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
  const marginPct = c.defaultMargin || 40

  /* ── Draft persistence ── */
  const DRAFT_KEY = 'anma_rg_presup_draft'

  useEffect(() => {
    if (id) {
      const b = get('budgets').find(x => x.id === Number(id))
      if (b) {
        setForm({
          contact: b.contact || '', company: b.company || '', wa: b.wa || '',
          ocasion: b.ocasion || '', delivery: b.delivery || '', deliveryDate: b.deliveryDate || '',
          shipCost: b.shipCost || 0, shipCharged: b.shipCharged !== false,
          status: b.status || 'draft',
          noteInt: b.noteInt || '', noteCli: b.noteCli || '',
          payStatus: b.payStatus || 'pending',
          margin: b.margin ?? c.defaultMargin ?? 40,
          deposit: b.deposit ?? c.defaultDeposit ?? 50,
          logoCost: b.logoCost || 0,
        })
        setItems(b.items?.length ? b.items : [emptyItem()])
        setEditId(b.id)
        setMarginBudgetedSaved(typeof b.marginBudgeted === 'number' ? b.marginBudgeted : null)
      }
    } else {
      try {
        const saved = localStorage.getItem(DRAFT_KEY)
        if (saved) {
          const { f, it, step } = JSON.parse(saved)
          if (f) setForm(prev => ({ ...prev, ...f }))
          if (it?.length) setItems(it)
          if (step) setCurrentStep(step)
          setDraftRestored(true)
          toast('Borrador restaurado — tus datos anteriores están cargados', 'ok')
        }
      } catch {}
    }
  }, [id]) // eslint-disable-line

  useEffect(() => {
    if (id) return
    const hasSomeData = form.contact || form.company || items.some(i => i.name)
    if (hasSomeData) {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ f: form, it: items, step: currentStep }))
    }
  }, [form, items, currentStep]) // eslint-disable-line

  const setF = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const handleClientSelect = (client) => {
    setForm(f => ({ ...f, contact: client.contact || '', company: client.company || '', wa: client.wa || '' }))
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
    setItems(prev => prev.map((it, i) => {
      if (i !== pickerIdx) return it
      return { ...it, name: p.name, costUnit: p.cost || 0, priceUnit: Math.round(num(p.cost) * (1 + marginPct / 100)) }
    }))
  }, [pickerIdx, marginPct])

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

  const calc = useMemo(() => {
    let totalCost = 0, totalRevenue = 0, totalQty = 0
    items.forEach(i => {
      const q = num(i.qty), c = num(i.costUnit), p = num(i.priceUnit)
      totalCost += q * c; totalRevenue += q * p; totalQty += q
    })
    const logTotal = num(form.logoCost) * totalQty
    const ship = num(form.shipCost)
    const shipCharged = form.shipCharged !== false
    const baseCost = totalCost + logTotal + ship
    const total = totalRevenue + (shipCharged ? ship : 0)
    const gain = total - baseCost
    const marginReal = total > 0 ? ((gain / total) * 100).toFixed(1) : '0.0'
    const marginThreshold = num(c.marginLowThreshold) || 10
    const marginLow = total > 0 && Number(marginReal) < marginThreshold
    const depositAmt = Math.round(total * num(form.deposit) / 100)
    return { totalCost, totalRevenue, logTotal, baseCost, total, gain, marginReal, marginLow, marginThreshold, depositAmt, totalQty }
  }, [items, form.shipCost, form.shipCharged, form.logoCost, form.deposit, c.marginLowThreshold])

  const budgetNum = useMemo(() => {
    if (editId) { const b = get('budgets').find(x => x.id === editId); return b?.num || '#—' }
    const num = c.nextNum || 1
    return `${c.budgetPrefix || 'AN'}-${String(num).padStart(4, '0')}`
  }, [editId, c.nextNum, c.budgetPrefix])

  const handleSave = () => {
    if (!form.contact && !form.company) { toast('Falta el cliente. Cargá un nombre de contacto o empresa.', 'er'); return }
    if (form.wa && !isValidWA(form.wa)) { toast('El WhatsApp no tiene un formato válido. Ej: +54 351 1234567', 'er'); setWaTouched(true); return }
    const validItems = items.filter(i => i.name).map(i => ({ ...i, qty: num(i.qty), costUnit: num(i.costUnit), priceUnit: num(i.priceUnit) }))
    if (!validItems.length) { toast('Necesitás al menos un producto. Agregá uno desde "Productos".', 'er'); return }
    const saveForm = { ...form, shipCost: 0, shipCharged: false, envioACotizar: form.envioACotizar !== false, logoCost: num(form.logoCost), margin: num(form.margin), deposit: num(form.deposit), payStatus: form.payStatus || 'pending' }
    const marginBudgeted = marginBudgetedSaved !== null ? marginBudgetedSaved : Number(calc.marginReal)
    const savedBudget = saveBudget({ ...(editId ? { id: editId } : {}), ...saveForm, items: validItems, totalCost: calc.baseCost, totalGain: calc.gain, total: calc.total, depositAmt: calc.depositAmt, marginBudgeted })
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
      if (!items.some(i => i.name)) return 'Agregá al menos un producto al pedido.'
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
    const prodList = items.filter(i => i.name).map(i => `• ${i.qty}x ${i.name}`).join('\n')
    return `Hola ${form.contact || '[NOMBRE]'}! Te envio el presupuesto de *${bName}* para ${form.company || '[EMPRESA]'}:\n\n${prodList}\n\n*Total:* ${fmt(calc.total)}\n*Entrega estimada:* ${form.deliveryDate || 'A coordinar'}${form.noteCli ? '\n*Nota:* ' + form.noteCli : ''}\n\nTe queda alguna duda? Quedamos a disposicion!`
  }, [form, items, calc.total, c.businessName])

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
    const prodRows = items.filter(i => i.name).map(i =>
      `<tr><td>${i.name}</td><td style="text-align:center">${i.qty}</td><td style="text-align:right">${fmt(i.priceUnit)}</td><td style="text-align:right">${fmt(i.qty * i.priceUnit)}</td></tr>`
    ).join('')
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
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;margin:0;padding:22px 28px 70px;color:#1E1B4B;font-size:11.5px;line-height:1.45;background:#fff}
      .header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:10px;border-bottom:2.5px solid ${brandColor};margin-bottom:14px}
      .brand{font-size:18px;font-weight:800;color:${brandColor};letter-spacing:-.3px}
      .brand img{height:38px;display:block}
      .hd-meta{text-align:right;font-size:10.5px;color:#555;line-height:1.5}
      .hd-meta .num{font-size:15px;font-weight:800;color:#1E1B4B;margin-bottom:2px}
      .vig{display:inline-block;margin-top:5px;padding:3px 8px;background:#FEF3C7;color:#92400E;font-size:9.5px;font-weight:700;border-radius:4px;letter-spacing:.2px}
      .client-row{display:grid;grid-template-columns:1fr 1fr;gap:8px 18px;padding:10px 12px;background:#F8F9FC;border-radius:6px;margin-bottom:12px;font-size:11px}
      .client-row .lbl{font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:#888;font-weight:700;margin-bottom:1px}
      .client-row .val{font-weight:600;color:#1E1B4B}
      table{width:100%;border-collapse:collapse;margin:4px 0 0}
      th{background:${brandColor};color:#fff;padding:7px 9px;text-align:left;font-size:9.5px;text-transform:uppercase;letter-spacing:.4px;font-weight:700}
      td{padding:6px 9px;border-bottom:1px solid #EEF0F7;font-size:11px}
      tr:last-child td{border-bottom:none}
      .totals{margin-top:6px;display:flex;justify-content:flex-end}
      .totals-box{min-width:240px;padding:10px 14px;background:linear-gradient(135deg,${brandColor}0d,${brandColor}1a);border-radius:8px;border:1px solid ${brandColor}33}
      .totals-row{display:flex;justify-content:space-between;padding:2px 0;font-size:11px;color:#555}
      .totals-row.big{font-size:16px;font-weight:800;color:${brandColor};padding-top:6px;margin-top:4px;border-top:1px solid ${brandColor}33}
      .totals-row.senia{font-size:11.5px;font-weight:700;color:${brandColor}}
      .note{margin-top:12px;padding:9px 12px;background:#F4F6FD;border-left:3px solid ${brandColor};border-radius:4px;font-size:11px;color:#333}
      .footer{margin-top:14px;padding-top:8px;border-top:1px solid #E5E7F0;font-size:9.5px;color:#999;line-height:1.5}
      .cobro-block{margin-top:12px;padding:10px 14px;background:#F0FDF4;border:1.5px solid #86EFAC;border-radius:8px}
      .cobro-title{font-size:10px;font-weight:700;color:#065F46;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px}
      .cobro-row{display:flex;justify-content:space-between;padding:2px 0;font-size:11px}
      .cobro-lbl{color:#666;font-weight:500}
      .cobro-val{font-weight:700;color:#1E1B4B;font-family:monospace}
      .iva-box{margin-top:10px;padding:10px 14px;background:#FAFBFD;border:1px solid #E5E7F0;border-radius:6px;font-size:10.5px;color:#374151}
      .iva-title{font-weight:700;margin-bottom:5px;font-size:10px;color:#1E1B4B;text-transform:uppercase;letter-spacing:.3px}
      .iva-row{display:flex;justify-content:space-between;padding:1.5px 0}
      .iva-row span:last-child{font-family:monospace;font-weight:600}
      .accept-fab{position:fixed;bottom:18px;right:18px;background:#25D366;color:#fff;padding:13px 20px;border-radius:999px;font-weight:700;text-decoration:none;box-shadow:0 6px 20px rgba(37,211,102,.4);font-size:12.5px;display:inline-flex;align-items:center;gap:7px}
      .accept-fab:hover{background:#1da851}
      @media print{.accept-fab{display:none}body{padding:18px 22px}}
    </style></head><body>
    <div class="header">
      <div class="brand">${c.logo ? '<img src="' + c.logo + '" alt="' + bName + '">' : bName}</div>
      <div class="hd-meta">
        <div class="num">${budgetNum}</div>
        ${c.razonSocial ? '<div style="font-weight:600">' + c.razonSocial + '</div>' : ''}
        ${c.cuit ? '<div>CUIT: ' + c.cuit + '</div>' : ''}
        ${c.ptoVenta ? '<div>Pto. Venta: ' + c.ptoVenta + '</div>' : ''}
        ${c.condIva && c.ivaEnabled ? '<div>' + c.condIva + '</div>' : ''}
        <div>Fecha de emisión: ${fmtD(new Date().toISOString().slice(0, 10))}</div>
        ${form.deliveryDate ? '<div>Entrega: ' + fmtD(form.deliveryDate) + '</div>' : ''}
        <div class="vig">⏱ Válido hasta: ${fmtD(vigenciaISO)}</div>
      </div>
    </div>
    <div class="client-row">
      ${form.contact ? `<div><div class="lbl">Contacto</div><div class="val">${form.contact}</div></div>` : ''}
      ${form.company ? `<div><div class="lbl">Empresa</div><div class="val">${form.company}</div></div>` : ''}
      ${form.wa ? `<div><div class="lbl">WhatsApp</div><div class="val">${form.wa}</div></div>` : ''}
      ${form.ocasion ? `<div><div class="lbl">Ocasión</div><div class="val">${form.ocasion}</div></div>` : ''}
      ${form.delivery ? `<div><div class="lbl">Modalidad</div><div class="val">${form.delivery}</div></div>` : ''}
    </div>
    <table>
      <thead><tr><th>Producto</th><th style="text-align:center;width:55px">Cant.</th><th style="text-align:right;width:90px">P. unit.</th><th style="text-align:right;width:95px">Subtotal</th></tr></thead>
      <tbody>${prodRows}</tbody>
    </table>
    <div class="totals"><div class="totals-box">
      <div class="totals-row"><span>Subtotal productos</span><span>${fmt(calc.totalRevenue)}</span></div>
      ${showEnvioLeyenda ? `<div class="totals-row" style="font-size:10px;color:#92400E;font-style:italic"><span>🚚 Costo de envío sujeto a pesaje y despacho</span><span>A cotizar</span></div>` : ''}
      <div class="totals-row big"><span>Total</span><span>${fmt(calc.total)}</span></div>
      <div class="totals-row senia"><span>Seña (${form.deposit}%)</span><span>${fmt(calc.depositAmt)}</span></div>
      <div class="totals-row" style="color:#059669;font-weight:700"><span>Saldo contra entrega</span><span>${fmt(calc.total - calc.depositAmt)}</span></div>
    </div></div>
    ${c.ivaEnabled ? (() => {
      const total = calc.total
      const ivaR = (Number(c.ivaRate) || 21) / 100
      const otrosR = (Number(c.otrosImpuestosRate) || 0) / 100
      const ivaContenido = total - (total / (1 + ivaR))
      const otrosImpAmt = total * otrosR
      return `<div class="iva-box">
        <div class="iva-title">Régimen de Transparencia Fiscal al Consumidor (Ley 27.743)</div>
        <div class="iva-row"><span>IVA Contenido (${(ivaR*100).toFixed(0)}%)</span><span>${fmt(ivaContenido)}</span></div>
        ${otrosR > 0 ? `<div class="iva-row"><span>Otros Impuestos Nacionales Indirectos</span><span>${fmt(otrosImpAmt)}</span></div>` : ''}
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
          ${bank.cbu ? '<div class="cobro-row"><span class="cobro-lbl">CBU</span><span class="cobro-val">' + bank.cbu + '</span></div>' : ''}
          ${bank.alias ? '<div class="cobro-row"><span class="cobro-lbl">Alias</span><span class="cobro-val">' + bank.alias + '</span></div>' : ''}
          ${bank.accountName ? '<div class="cobro-row"><span class="cobro-lbl">Titular</span><span class="cobro-val">' + bank.accountName + '</span></div>' : ''}
          ${bank.bank ? '<div class="cobro-row"><span class="cobro-lbl">Banco</span><span class="cobro-val">' + bank.bank + '</span></div>' : ''}
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
    const clientEmail = get('clients').find(cl => cl.company === form.company || cl.contact === form.contact)?.email || ''
    if (!clientEmail) { toast('Este cliente no tiene email cargado. Agregalo en Clientes.', 'er'); return }
    if (!c.resendApiKey) { toast('Configurá el email en Configuración → Integraciones → Email.', 'er'); return }
    setEmailSending(true)
    try {
      const html = buildPdfHtml()
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${c.resendApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: c.resendFrom || 'onboarding@resend.dev',
          to: [clientEmail],
          subject: `Presupuesto de ${c.businessName || 'ANMA'}`,
          html,
        }),
      })
      if (res.ok) {
        toast(`Presupuesto enviado a ${clientEmail}`, 'ok')
      } else {
        const d = await res.json().catch(() => ({}))
        toast(`Error al enviar: ${d.message || 'verificá la configuración de email'}`, 'er')
      }
    } catch {
      toast('No se pudo enviar el email. Verificá tu conexión.', 'er')
    }
    setEmailSending(false)
  }

  return (
    <div className="page active" style={{ animation: 'pgIn .2s ease both' }}>
      <div className="ph">
        <div className="ph-left"><h2>{editId ? 'Editar pedido' : 'Nuevo pedido'}</h2><p>Completá los datos del pedido o cotización</p></div>
        <div className="ph-right"><button className="btn btn-ghost btn-sm" onClick={() => { localStorage.removeItem(DRAFT_KEY); setDraftRestored(false); nav('/') }}><i className="fa fa-xmark" /> Descartar</button></div>
      </div>

      {draftRestored && !id && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: '#FFFBEB', border: '1.5px solid #FCD34D',
          borderRadius: 10, padding: '10px 16px', marginBottom: 14,
          fontSize: 12, color: '#92400E'
        }}>
          <i className="fa fa-rotate-left" style={{ color: '#D97706' }} />
          <span><b>Borrador recuperado.</b> Tus datos anteriores están cargados — podés continuar donde dejaste.</span>
          <button
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#92400E', cursor: 'pointer', fontSize: 11, fontWeight: 600, textDecoration: 'underline' }}
            onClick={() => {
              localStorage.removeItem(DRAFT_KEY)
              setDraftRestored(false)
              setForm({ contact: '', company: '', wa: '', ocasion: '', delivery: '', deliveryDate: '', shipCost: 0, shipCharged: false, envioACotizar: true, status: 'draft', payStatus: 'pending', noteInt: '', noteCli: '', margin: c.defaultMargin || 40, deposit: c.defaultDeposit || 50, logoCost: 0 })
              setItems([emptyItem()])
            }}
          >
            Limpiar borrador
          </button>
        </div>
      )}

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

            {/* ─── PASO 2: PRODUCTOS ─── */}
            {currentStep === 2 && (
              <>
                <PaneHeader icon="fa-box-open" title="Paso 2 · Productos" subtitle="Agregá los ítems que incluye el pedido" />
                <div style={{ overflowX: 'auto' }}>
                  <table>
                    <thead><tr><th style={{ width: 24 }}></th><th style={{ minWidth: 160 }}>Producto</th><th style={{ width: 65 }}>Cant.</th><th style={{ width: 100 }}>Costo u.</th><th style={{ width: 100 }}>Precio u.</th><th style={{ width: 95 }}>Subtotal</th><th style={{ width: 36 }}></th></tr></thead>
                    <tbody>
                      {items.map((it, i) => (
                        <tr key={i}
                          onDragOver={handleDragOver(i)} onDrop={handleDrop(i)} onDragLeave={handleDragLeave}
                          style={dragOver === i ? { background: 'var(--brand-xlt)', outline: '2px dashed var(--brand)' } : undefined}>
                          <td style={{ textAlign: 'center', cursor: 'grab', color: 'var(--txt3)' }}
                            draggable onDragStart={handleDragStart(i)} title="Arrastrar para reordenar">
                            <i className="fa fa-grip-vertical" />
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                              <input type="text" value={it.name} onChange={e => updateItem(i, 'name', e.target.value)} placeholder="Nombre del producto" style={{ padding: '6px 8px', fontSize: 12, flex: 1 }} />
                              <button onClick={() => openPicker(i)} type="button" title="Elegir del catálogo"
                                style={{ width: 32, height: 32, borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--surface2)', color: 'var(--brand)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0, transition: 'background .12s' }}>
                                <i className="fa fa-list" />
                              </button>
                            </div>
                          </td>
                          <td><input type="number" value={it.qty} onFocus={selectOnFocus} onChange={e => updateItem(i, 'qty', e.target.value === '' ? '' : Math.max(1, Number(e.target.value) || 1))} onBlur={e => { if (e.target.value === '') updateItem(i, 'qty', 1) }} min="1" style={{ padding: '6px 8px', fontSize: 12, fontVariantNumeric: 'tabular-nums', fontFamily: 'inherit' }} /></td>
                          <td><input type="number" value={it.costUnit} onFocus={selectOnFocus} onChange={e => updateItem(i, 'costUnit', e.target.value)} onBlur={e => { if (e.target.value === '') updateItem(i, 'costUnit', 0) }} min="0" style={{ padding: '6px 8px', fontSize: 12, fontVariantNumeric: 'tabular-nums', fontFamily: 'inherit' }} /></td>
                          <td><input type="number" value={it.priceUnit} onFocus={selectOnFocus} onChange={e => updateItem(i, 'priceUnit', e.target.value)} onBlur={e => { if (e.target.value === '') updateItem(i, 'priceUnit', 0) }} min="0" style={{ padding: '6px 8px', fontSize: 12, fontVariantNumeric: 'tabular-nums', fontFamily: 'inherit' }} /></td>
                          <td style={{ fontWeight: 700, color: 'var(--money)', fontSize: 12, fontVariantNumeric: 'tabular-nums', fontFamily: 'inherit' }}>{fmt(num(it.qty) * num(it.priceUnit))}</td>
                          <td><button className="act del" onClick={() => removeItem(i)}><i className="fa fa-xmark" /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <ProductPicker open={pickerOpen} onClose={() => setPickerOpen(false)} products={products} onSelect={handlePickProduct} />
                </div>
                <button className="btn btn-ghost btn-xs" style={{ marginTop: 8 }} onClick={addItem}><i className="fa fa-plus" /> Agregar producto</button>
                <div className="wiz-tip">
                  <i className="fa fa-lightbulb" /> Escribí el nombre del producto para autocompletar desde tu catálogo — el costo y precio se llenan solos.
                </div>
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
                  <div className="fg"><label>Margen ganancia (%)</label><input type="number" value={form.margin} onFocus={selectOnFocus} onChange={e => setF('margin', e.target.value)} onBlur={e => { if (e.target.value === '') setF('margin', 0) }} min="0" max="100" /></div>
                  <div className="fg"><label>Seña requerida (%)</label><input type="number" value={form.deposit} onFocus={selectOnFocus} onChange={e => setF('deposit', e.target.value)} onBlur={e => { if (e.target.value === '') setF('deposit', 0) }} min="0" max="100" /></div>
                  <div className="fg"><label>Impresión/logo x u. ($)</label><input type="number" value={form.logoCost} onFocus={selectOnFocus} onChange={e => setF('logoCost', e.target.value)} onBlur={e => { if (e.target.value === '') setF('logoCost', 0) }} min="0" /></div>
                </div>
                <div className="grid2">
                  <div className="fg"><label>Nota interna</label><textarea value={form.noteInt} onChange={e => setF('noteInt', e.target.value)} rows={2} placeholder="Solo para vos..." /></div>
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
                    <div className="wiz-rev-card-h"><i className="fa fa-box-open" /> Productos ({items.filter(i => i.name).length}) <button className="wiz-rev-edit" onClick={() => goStep(2)}>Editar</button></div>
                    <div className="wiz-rev-body">
                      {items.filter(i => i.name).map((it, idx) => (
                        <div key={idx} className="wiz-rev-item">
                          <span>{it.qty}× {it.name}</span>
                          <span>{fmt(num(it.qty) * num(it.priceUnit))}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="wiz-rev-card">
                    <div className="wiz-rev-card-h"><i className="fa fa-truck" /> Entrega <button className="wiz-rev-edit" onClick={() => goStep(3)}>Editar</button></div>
                    <div className="wiz-rev-body">
                      <div>{form.delivery || 'Sin modalidad'} · {form.deliveryDate || 'Sin fecha'}</div>
                      <div className="wiz-rev-meta">Margen {form.margin}% · Seña {form.deposit}%</div>
                    </div>
                  </div>
                </div>
                <div className="wiz-tip" style={{ marginTop: 14 }}>
                  <i className="fa fa-circle-check" /> Todo listo. Al confirmar guardás el presupuesto y volvés al dashboard.
                </div>
              </>
            )}

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
            <div className="cp-row"><span className="cp-lbl">Costo proveedor</span><span className="cp-val">{fmt(calc.totalCost)}</span></div>
            <div className="cp-row"><span className="cp-lbl">Impresión</span><span className="cp-val">{fmt(calc.logTotal)}</span></div>
            <div className="cp-row"><span className="cp-lbl">Ganancia</span><span className="cp-val" style={{ color: '#86EFAC' }}>{fmt(calc.gain)}</span></div>
            <div className="cp-row"><span className="cp-lbl">Margen real</span><span className="cp-val" style={calc.marginLow ? { color: 'var(--red)', fontWeight: 800 } : undefined}>{calc.marginReal}%{calc.marginLow && <i className="fa fa-triangle-exclamation" style={{ marginLeft: 4, fontSize: 10 }} title={`Margen bajo (< ${calc.marginThreshold}%)`} />}</span></div>
            {marginBudgetedSaved !== null && Math.abs(marginBudgetedSaved - Number(calc.marginReal)) >= 0.5 && (() => {
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
            <div className="cp-total-row">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,.5)' }}>Total</span>
                <div style={{ textAlign: 'right' }}>
                  <div className="cp-total-val">{fmt(calc.total)}</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,.4)', marginTop: 2 }}>Seña: {fmt(calc.depositAmt)}</div>
                </div>
              </div>
            </div>
            <div className="cp-actions">

              {/* ── 1. GUARDAR ── acción principal */}
              <button className="cp-btn cp-btn-primary"
                onClick={handleSave}
                style={{ fontSize: 14, padding: '13px 16px', fontWeight: 800, letterSpacing: '.01em', boxShadow: '0 4px 16px rgba(var(--brand-rgb),.35)' }}>
                <i className="fa fa-floppy-disk" /> Guardar Presupuesto
              </button>

              {/* ── 2. COMUNICACIÓN ── */}
              <div style={{ marginTop: 10, background: 'rgba(37,211,102,.07)', border: '1px solid rgba(37,211,102,.18)', borderRadius: 10, padding: '11px 12px' }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#4ade80', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 9, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <i className="fa-brands fa-whatsapp" /> Comunicación
                </div>
                <button onClick={sendWhatsApp}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 12px', background: 'rgba(37,211,102,.22)', border: '1.5px solid rgba(37,211,102,.42)', borderRadius: 8, color: '#fff', cursor: 'pointer', fontFamily: 'inherit', transition: 'background .15s', marginBottom: 6 }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(37,211,102,.34)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(37,211,102,.22)'}>
                  <i className="fa-brands fa-whatsapp" style={{ fontSize: 16, color: '#4ade80', flexShrink: 0 }} />
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.2 }}>Enviar Presupuesto</div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,.6)', marginTop: 2 }}>Primer contacto con el cliente</div>
                  </div>
                </button>
                {bankCfg.enabled ? (
                  <button onClick={sendBankDataByWA}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 12px', background: 'rgba(37,211,102,.1)', border: '1px solid rgba(37,211,102,.26)', borderRadius: 8, color: '#86efac', cursor: 'pointer', fontFamily: 'inherit', transition: 'background .15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(37,211,102,.18)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(37,211,102,.1)'}>
                    <i className="fa-brands fa-whatsapp" style={{ fontSize: 16, flexShrink: 0 }} />
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.2 }}>Enviar Datos de Pago</div>
                      <div style={{ fontSize: 10, color: 'rgba(134,239,172,.65)', marginTop: 2 }}>CBU / Alias para cerrar la venta</div>
                    </div>
                  </button>
                ) : (
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,.28)', padding: '6px 4px', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <i className="fa fa-circle-info" style={{ fontSize: 10 }} />
                    Activá transferencia en Config › Pagos para habilitar este botón
                  </div>
                )}
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
                {c.resendEnabled && (
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
