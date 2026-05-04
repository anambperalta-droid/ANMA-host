import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useData } from '../../context/DataContext'
import { useToast } from '../../context/ToastContext'
import { fmt } from '../../lib/storage'
import { getMPConfig, createPaymentLink, getBankConfig, buildBankInfoText } from '../../lib/mercadopago'
import { pushBudget, getSheetsConfig } from '../../lib/sheets'

const emptyItem = () => ({ name: '', qty: 1, costUnit: '', priceUnit: '' })

/* Utilidades de fecha */
const todayISO = () => new Date().toISOString().slice(0, 10)
const isWeekend = (iso) => { if (!iso) return false; const d = new Date(iso + 'T00:00'); const w = d.getDay(); return w === 0 || w === 6 }

/* ── Helpers para inputs numéricos sin NaN ── */
const num = (v) => { const n = Number(v); return isNaN(n) ? 0 : n }
const selectOnFocus = (e) => e.target.select()

/* ── Validación WhatsApp ── */
const isValidWA = (v) => { if (!v) return true; const cleaned = v.replace(/[\s\-()]/g, ''); return /^[+]?\d{8,15}$/.test(cleaned) }

/* ── Sección colapsable ── */
function BSection({ icon, title, badge, children, defaultOpen = true, error = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={`bsec ${open ? '' : 'collapsed'} ${error ? 'has-err' : ''}`}>
      <div className="bsec-title" onClick={() => setOpen(!open)}>
        <div className="bsec-title-left"><i className={`fa ${icon}`} />{title}{badge ? <span className="bsec-badge">{badge}</span> : null}{error ? <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 15, height: 15, borderRadius: '50%', background: '#FEE2E2', color: '#DC2626', fontSize: 8, fontWeight: 900, marginLeft: 6, flexShrink: 0 }}>!</span> : null}</div>
        <i className={`fa fa-chevron-${open ? 'up' : 'down'} bsec-ch`} />
      </div>
      <div className="bsec-body">{children}</div>
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
        autoComplete="off"
        autoFocus />
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
    shipCost: 0, shipCharged: true, status: 'draft', payStatus: 'pending', noteInt: '', noteCli: '',
    margin: c.defaultMargin || 40, deposit: c.defaultDeposit || 50, logoCost: 0,
  })
  const [items, setItems] = useState([emptyItem()])
  const [editId, setEditId] = useState(null)
  const [marginBudgetedSaved, setMarginBudgetedSaved] = useState(null)
  const [mpResult, setMpResult] = useState('')
  const [mpLoading, setMpLoading] = useState(false)
  const [previewHtml, setPreviewHtml] = useState('')
  const [waTouched, setWaTouched] = useState(false)
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
          shipCost: b.shipCost || 0, shipCharged: b.shipCharged !== false, status: b.status || 'draft',
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
      // Restaurar borrador si existe
      try {
        const saved = localStorage.getItem(DRAFT_KEY)
        if (saved) {
          const { f, it } = JSON.parse(saved)
          if (f) setForm(prev => ({ ...prev, ...f }))
          if (it?.length) setItems(it)
          setDraftRestored(true)
          toast('Borrador restaurado — tus datos anteriores están cargados', 'ok')
        }
      } catch {}
    }
  }, [id]) // eslint-disable-line

  // Auto-guardar borrador mientras se edita un presupuesto nuevo
  useEffect(() => {
    if (id) return
    const hasSomeData = form.contact || form.company || items.some(i => i.name)
    if (hasSomeData) {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ f: form, it: items }))
    }
  }, [form, items]) // eslint-disable-line

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
    // Negocio siempre paga el envío; el cliente solo si shipCharged=true
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
    const saveForm = { ...form, shipCost: num(form.shipCost), shipCharged: form.shipCharged !== false, logoCost: num(form.logoCost), margin: num(form.margin), deposit: num(form.deposit), payStatus: form.payStatus || 'pending' }
    const marginBudgeted = marginBudgetedSaved !== null ? marginBudgetedSaved : Number(calc.marginReal)
    const savedBudget = saveBudget({ ...(editId ? { id: editId } : {}), ...saveForm, items: validItems, totalCost: calc.baseCost, totalGain: calc.gain, total: calc.total, depositAmt: calc.depositAmt, marginBudgeted })
    if (!editId) setMarginBudgetedSaved(marginBudgeted)
    setDraftRestored(false)
    localStorage.removeItem(DRAFT_KEY)
    toast('Presupuesto guardado', 'ok')
    // ─── Auto-sync a Google Sheets (fire-and-forget) ───
    const gs = getSheetsConfig()
    if (gs.enabled && gs.autoSync && gs.url && savedBudget) {
      pushBudget(savedBudget).then(r => {
        if (r.ok) toast('Sincronizado con Google Sheets', 'ok')
      }).catch(() => {})
    }
    nav('/')
  }

  const waText = useMemo(() => {
    const bName = c.businessName || 'ANMA'
    const prodList = items.filter(i => i.name).map(i => `• ${i.qty}x ${i.name}`).join('\n')
    return `Hola ${form.contact || '[NOMBRE]'}! Te envio el presupuesto de *${bName}* para ${form.company || '[EMPRESA]'}:\n\n${prodList}\n\n*Total:* ${fmt(calc.total)}\n*Entrega estimada:* ${form.deliveryDate || 'A coordinar'}${form.noteCli ? '\n*Nota:* ' + form.noteCli : ''}\n\nTe queda alguna duda? Quedamos a disposicion!`
  }, [form, items, calc.total, c.businessName])

  const copyWA = () => navigator.clipboard.writeText(waText).then(() => toast('Mensaje WA copiado', 'ok'))

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

  const copyBankInfo = () => {
    const bank = getBankConfig()
    if (!bank.enabled) { toast('Activá la transferencia bancaria en Configuración > Pagos.', 'er'); return }
    if (!bank.cbu && !bank.alias) { toast('Cargá al menos CBU o Alias en Configuración > Pagos.', 'er'); return }
    const text = buildBankInfoText(bank, c.businessName || 'ANMA')
    navigator.clipboard.writeText(text).then(() => toast('Datos de transferencia copiados', 'ok'))
  }

  const copyBankWithBudget = () => {
    const bank = getBankConfig()
    if (!bank.enabled) { toast('Activá la transferencia bancaria en Configuración > Pagos.', 'er'); return }
    const bankText = buildBankInfoText(bank, c.businessName || 'ANMA')
    const fullText = `${waText}\n\n${bankText}`
    navigator.clipboard.writeText(fullText).then(() => toast('Presupuesto + datos bancarios copiados', 'ok'))
  }

  /* ── WhatsApp directo — abre wa.me con el texto del presupuesto ── */
  const waPhone = () => form.wa.replace(/[^\d]/g, '')

  const sendWhatsApp = () => {
    const phone = waPhone()
    if (!phone) { toast('El cliente no tiene número de WhatsApp cargado.', 'er'); return }
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(waText)}`, '_blank')
  }

  /* ── Finalizar y Enviar Cobro — presupuesto + datos bancarios por WA ── */
  const sendPaymentByWA = () => {
    const bank = getBankConfig()
    if (!bank.enabled) { toast('Activá la transferencia bancaria en Configuración > Pagos.', 'er'); return }
    const phone = waPhone()
    if (!phone) { toast('El cliente no tiene número de WhatsApp cargado.', 'er'); return }
    const fullText = `${waText}\n\n${buildBankInfoText(bank, c.businessName || 'ANMA')}`
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(fullText)}`, '_blank')
  }

  /* ── Enviar Datos de Pago — solo CBU/Alias por WA ── */
  const sendBankDataByWA = () => {
    const bank = getBankConfig()
    if (!bank.enabled) { toast('Activá la transferencia bancaria en Configuración > Pagos.', 'er'); return }
    if (!bank.cbu && !bank.alias) { toast('Cargá al menos CBU o Alias en Configuración > Pagos.', 'er'); return }
    const phone = waPhone()
    if (!phone) { toast('El cliente no tiene número de WhatsApp cargado.', 'er'); return }
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(buildBankInfoText(bank, c.businessName || 'ANMA'))}`, '_blank')
  }

  /* ── ESC cierra modales ── */
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
      `<tr><td>${i.name}${i.variant ? ' <span style="color:#888;font-size:10px">· ' + i.variant + '</span>' : ''}</td><td style="text-align:center">${i.qty}</td><td style="text-align:right">${fmt(i.priceUnit)}</td><td style="text-align:right">${fmt(i.qty * i.priceUnit)}</td></tr>`
    ).join('')
    // Vigencia auto-calculada
    const validDays = num(c.budgetValidityDays) || 7
    const validUntil = new Date(); validUntil.setDate(validUntil.getDate() + validDays)
    const vigenciaISO = validUntil.toISOString().slice(0, 10)
    // Link WA dueño para "Aceptar presupuesto"
    const ownerWA = (c.ownerWA || c.businessWA || '').replace(/[^\d+]/g, '')
    const acceptMsg = encodeURIComponent(`Hola! Acepto el presupuesto ${budgetNum} de ${bName}. Cliente: ${form.contact || form.company || ''}. Total: ${fmt(calc.total)}.`)
    const waLink = ownerWA ? `https://wa.me/${ownerWA.replace('+','')}?text=${acceptMsg}` : ''
    const hasShip = num(form.shipCost) && form.shipCharged !== false
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
      .variant{color:#888;font-size:9.5px;margin-left:4px}
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
      ${hasShip ? `<div class="totals-row"><span>Envío</span><span>${fmt(num(form.shipCost))}</span></div>` : ''}
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

  /* ── Enviar por email (Resend) ── */
  const [emailSending, setEmailSending] = useState(false)
  const sendByEmail = async () => {
    const clientEmail = form.clientEmail || get('clients').find(cl => cl.company === form.company || cl.contact === form.contact)?.email || ''
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
          subject: `Presupuesto de ${c.businessName || 'ANMA'} — ${form.budgetNum || ''}`,
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
        <div className="ph-left"><h2>{editId ? 'Editar presupuesto' : 'Nuevo presupuesto'}</h2><p>Completá los datos para generar el presupuesto</p></div>
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
              setForm({ contact: '', company: '', wa: '', ocasion: '', delivery: '', deliveryDate: '', shipCost: 0, shipCharged: true, status: 'draft', payStatus: 'pending', noteInt: '', noteCli: '', margin: c.defaultMargin || 40, deposit: c.defaultDeposit || 50, logoCost: 0 })
              setItems([emptyItem()])
            }}
          >
            Limpiar borrador
          </button>
        </div>
      )}

      <style>{`
        .budget-layout .bsec input, .budget-layout .bsec select, .budget-layout .bsec textarea { border: 1px solid #E2E8F0; }
        .budget-layout .bsec input:focus, .budget-layout .bsec select:focus, .budget-layout .bsec textarea:focus { border-color: var(--brand); }
      `}</style>
      <div className="budget-layout">
        <div>
          {/* CLIENTE */}
          <BSection icon="fa-user-tie" title="Cliente" badge={form.contact || form.company || null} error={!form.contact && !form.company} defaultOpen={true}>
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
          </BSection>

          {/* ENTREGA */}
          <BSection icon="fa-truck" title="Entrega y estado" badge={form.deliveryDate || form.delivery || null} defaultOpen={false}>
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
                <label>Costo envío ($)</label>
                <input type="number" value={form.shipCost} onFocus={selectOnFocus} onChange={e => setF('shipCost', e.target.value)} onBlur={e => { if (e.target.value === '') setF('shipCost', 0) }} min="0" />
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, marginTop: 4, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.shipCharged !== false} onChange={e => setF('shipCharged', e.target.checked)} style={{ width: 'auto' }} />
                  Cobrar envío al cliente (sumar al total)
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
            <div className="grid2">
              <div className="fg"><label>Nota interna</label><textarea value={form.noteInt} onChange={e => setF('noteInt', e.target.value)} rows={2} placeholder="Solo para vos..." /></div>
              <div className="fg"><label>Nota al cliente (PDF)</label><textarea value={form.noteCli} onChange={e => setF('noteCli', e.target.value)} rows={2} placeholder="Visible en el presupuesto..." /></div>
            </div>
          </BSection>

          {/* PRODUCTOS */}
          <BSection icon="fa-box-open" title="Productos" badge={items.filter(i => i.name).length ? `${items.filter(i => i.name).length} ítems` : null} error={!items.some(i => i.name)} defaultOpen={!!id}>
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
                      <td><input type="text" value={it.name} onChange={e => updateItem(i, 'name', e.target.value)} placeholder="Nombre del producto" list="prod-suggestions" style={{ padding: '6px 8px', fontSize: 12 }} /></td>
                      <td><input type="number" value={it.qty} onFocus={selectOnFocus} onChange={e => updateItem(i, 'qty', e.target.value === '' ? '' : Math.max(1, Number(e.target.value) || 1))} onBlur={e => { if (e.target.value === '') updateItem(i, 'qty', 1) }} min="1" style={{ padding: '6px 8px', fontSize: 12, fontVariantNumeric: 'tabular-nums', fontFamily: 'inherit' }} /></td>
                      <td><input type="number" value={it.costUnit} onFocus={selectOnFocus} onChange={e => updateItem(i, 'costUnit', e.target.value)} onBlur={e => { if (e.target.value === '') updateItem(i, 'costUnit', 0) }} min="0" style={{ padding: '6px 8px', fontSize: 12, fontVariantNumeric: 'tabular-nums', fontFamily: 'inherit' }} /></td>
                      <td><input type="number" value={it.priceUnit} onFocus={selectOnFocus} onChange={e => updateItem(i, 'priceUnit', e.target.value)} onBlur={e => { if (e.target.value === '') updateItem(i, 'priceUnit', 0) }} min="0" style={{ padding: '6px 8px', fontSize: 12, fontVariantNumeric: 'tabular-nums', fontFamily: 'inherit' }} /></td>
                      <td style={{ fontWeight: 700, color: 'var(--money)', fontSize: 12, fontVariantNumeric: 'tabular-nums', fontFamily: 'inherit' }}>{fmt(num(it.qty) * num(it.priceUnit))}</td>
                      <td><button className="act del" onClick={() => removeItem(i)}><i className="fa fa-xmark" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <datalist id="prod-suggestions">{products.map(p => <option key={p.id} value={p.name} />)}</datalist>
            </div>
            <button className="btn btn-ghost btn-xs" style={{ marginTop: 8 }} onClick={addItem}><i className="fa fa-plus" /> Agregar producto</button>
          </BSection>

          {/* PARÁMETROS */}
          <BSection icon="fa-sliders" title="Parámetros de precio" badge={<span style={{ display: 'inline-flex', gap: 4 }}><span style={{ background: '#F1F5F9', color: '#64748B', borderRadius: 8, padding: '1px 8px', fontSize: 10, fontWeight: 600 }}>{form.margin || 0}% margen</span><span style={{ background: '#F1F5F9', color: '#64748B', borderRadius: 8, padding: '1px 8px', fontSize: 10, fontWeight: 600 }}>{form.deposit || 0}% seña</span></span>} defaultOpen={false}>
            <div className="grid3">
              <div className="fg"><label>Margen ganancia (%)</label><input type="number" value={form.margin} onFocus={selectOnFocus} onChange={e => setF('margin', e.target.value)} onBlur={e => { if (e.target.value === '') setF('margin', 0) }} min="0" max="100" /></div>
              <div className="fg"><label>Seña requerida (%)</label><input type="number" value={form.deposit} onFocus={selectOnFocus} onChange={e => setF('deposit', e.target.value)} onBlur={e => { if (e.target.value === '') setF('deposit', 0) }} min="0" max="100" /></div>
              <div className="fg"><label>Impresión/logo x u. ($)</label><input type="number" value={form.logoCost} onFocus={selectOnFocus} onChange={e => setF('logoCost', e.target.value)} onBlur={e => { if (e.target.value === '') setF('logoCost', 0) }} min="0" /></div>
            </div>
          </BSection>
        </div>

        {/* PANEL LATERAL */}
        <div style={{ position: 'sticky', top: 20, alignSelf: 'start' }}>
          <div className="calc-panel">
            <div className="cp-title"><i className="fa fa-calculator" />Resumen</div>

            {/* Métricas */}
            <div className="cp-row"><span className="cp-lbl">N° Presupuesto</span><span className="cp-val">{budgetNum}</span></div>
            <div className="cp-row"><span className="cp-lbl">Costo proveedor</span><span className="cp-val">{fmt(calc.totalCost)}</span></div>
            <div className="cp-row"><span className="cp-lbl">Impresión</span><span className="cp-val">{fmt(calc.logTotal)}</span></div>
            <div className="cp-row"><span className="cp-lbl">Envío</span><span className="cp-val">{fmt(num(form.shipCost))}</span></div>
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

            {/* Total */}
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

              {/* ── 2. COMUNICACIÓN ── flujo de venta, 2 botones WA únicos */}
              <div style={{ marginTop: 10, background: 'rgba(37,211,102,.07)', border: '1px solid rgba(37,211,102,.18)', borderRadius: 10, padding: '11px 12px' }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#4ade80', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 9, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <i className="fa-brands fa-whatsapp" /> Comunicación
                </div>

                {/* Botón 1: primer contacto */}
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

                {/* Botón 2: cerrar venta con datos de pago */}
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

              {/* ── 3. DOCUMENTOS ── herramientas, fila compacta slate */}
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

            {/* ── 4. PAGO ONLINE ── Mercado Pago (si está activo) */}
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

            {/* Vista previa WA */}
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
