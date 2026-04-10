import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useData } from '../../context/DataContext'
import { useToast } from '../../context/ToastContext'
import { fmt } from '../../lib/storage'
import { getMPConfig, createPaymentLink, getBankConfig, buildBankInfoText } from '../../lib/mercadopago'

const emptyItem = () => ({ name: '', qty: 1, costUnit: '', priceUnit: '' })

/* ── Helpers para inputs numéricos sin NaN ── */
const num = (v) => { const n = Number(v); return isNaN(n) ? 0 : n }
const selectOnFocus = (e) => e.target.select()

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
    shipCost: 0, status: 'draft', payStatus: 'pending', noteInt: '', noteCli: '',
    margin: c.defaultMargin || 40, deposit: c.defaultDeposit || 50, logoCost: 0,
  })
  const [items, setItems] = useState([emptyItem()])
  const [editId, setEditId] = useState(null)
  const [mpResult, setMpResult] = useState('')
  const [mpLoading, setMpLoading] = useState(false)
  const [previewHtml, setPreviewHtml] = useState('')

  const clients = get('clients')
  const products = get('products')
  const marginPct = c.defaultMargin || 40

  useEffect(() => {
    if (id) {
      const b = get('budgets').find(x => x.id === Number(id))
      if (b) {
        setForm({
          contact: b.contact || '', company: b.company || '', wa: b.wa || '',
          ocasion: b.ocasion || '', delivery: b.delivery || '', deliveryDate: b.deliveryDate || '',
          shipCost: b.shipCost || 0, status: b.status || 'draft',
          noteInt: b.noteInt || '', noteCli: b.noteCli || '',
          payStatus: b.payStatus || 'pending',
          margin: b.margin ?? c.defaultMargin ?? 40,
          deposit: b.deposit ?? c.defaultDeposit ?? 50,
          logoCost: b.logoCost || 0,
        })
        setItems(b.items?.length ? b.items : [emptyItem()])
        setEditId(b.id)
      }
    }
  }, [id])

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

  const calc = useMemo(() => {
    let totalCost = 0, totalRevenue = 0, totalQty = 0
    items.forEach(i => {
      const q = num(i.qty), c = num(i.costUnit), p = num(i.priceUnit)
      totalCost += q * c; totalRevenue += q * p; totalQty += q
    })
    const logTotal = num(form.logoCost) * totalQty
    const ship = num(form.shipCost)
    const baseCost = totalCost + logTotal + ship
    const total = totalRevenue + ship
    const gain = total - baseCost
    const marginReal = total > 0 ? ((gain / total) * 100).toFixed(1) : '0.0'
    const depositAmt = Math.round(total * num(form.deposit) / 100)
    return { totalCost, totalRevenue, logTotal, baseCost, total, gain, marginReal, depositAmt, totalQty }
  }, [items, form.shipCost, form.logoCost, form.deposit])

  const budgetNum = useMemo(() => {
    if (editId) { const b = get('budgets').find(x => x.id === editId); return b?.num || '#—' }
    const num = c.nextNum || 1
    return `${c.budgetPrefix || 'AN'}-${String(num).padStart(4, '0')}`
  }, [editId, c.nextNum, c.budgetPrefix])

  const handleSave = () => {
    if (!form.contact && !form.company) { toast('Ingresá al menos contacto o empresa.', 'er'); return }
    const validItems = items.filter(i => i.name).map(i => ({ ...i, qty: num(i.qty), costUnit: num(i.costUnit), priceUnit: num(i.priceUnit) }))
    if (!validItems.length) { toast('Agregá al menos un producto.', 'er'); return }
    const saveForm = { ...form, shipCost: num(form.shipCost), logoCost: num(form.logoCost), margin: num(form.margin), deposit: num(form.deposit), payStatus: form.payStatus || 'pending' }
    saveBudget({ ...(editId ? { id: editId } : {}), ...saveForm, items: validItems, totalCost: calc.baseCost, totalGain: calc.gain, total: calc.total, depositAmt: calc.depositAmt })
    toast('Presupuesto guardado', 'ok')
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
    const brandColor = c.brandColor || '#7C3AED'
    const bName = c.businessName || 'ANMA'
    const prodRows = items.filter(i => i.name).map(i =>
      `<tr><td>${i.name}</td><td style="text-align:center">${i.qty}</td><td style="text-align:right">${fmt(i.priceUnit)}</td><td style="text-align:right">${fmt(i.qty * i.priceUnit)}</td></tr>`
    ).join('')
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${budgetNum}</title>
    <style>body{font-family:Arial,sans-serif;padding:32px;color:#1E1B4B;font-size:12px}.header{display:flex;justify-content:space-between;align-items:center;padding-bottom:16px;border-bottom:3px solid ${brandColor};margin-bottom:20px}.brand{font-size:20px;font-weight:800;color:${brandColor}}table{width:100%;border-collapse:collapse;margin:12px 0}th{background:${brandColor};color:#fff;padding:8px 10px;text-align:left;font-size:10px;text-transform:uppercase}td{padding:7px 10px;border-bottom:1px solid #E5E7F0}.total-row{font-size:16px;font-weight:800;color:${brandColor};text-align:right;margin-top:12px}.footer{margin-top:24px;padding-top:12px;border-top:1px solid #E5E7F0;font-size:10px;color:#888}</style></head><body>
    <div class="header"><div class="brand">${c.logo ? '<img src="' + c.logo + '" style="height:40px">' : bName}</div><div style="text-align:right"><div style="font-size:16px;font-weight:700;color:#1E1B4B">${budgetNum}</div><div>Fecha: ${new Date().toISOString().slice(0, 10)}</div>${form.deliveryDate ? '<div>Entrega: ' + form.deliveryDate + '</div>' : ''}</div></div>
    <div style="margin-bottom:16px"><b>Cliente:</b> ${form.contact || ''} ${form.company ? '— ' + form.company : ''}${form.wa ? '<br><b>WhatsApp:</b> ' + form.wa : ''}</div>
    <table><thead><tr><th>Producto</th><th style="text-align:center">Cant.</th><th style="text-align:right">Precio unit.</th><th style="text-align:right">Subtotal</th></tr></thead><tbody>${prodRows}</tbody></table>
    ${num(form.shipCost) ? '<div style="text-align:right;font-size:12px;color:#666">Envío: ' + fmt(num(form.shipCost)) + '</div>' : ''}
    <div class="total-row">Total: ${fmt(calc.total)}</div>
    <div style="text-align:right;font-size:12px;color:${brandColor};font-weight:600">Seña (${form.deposit}%): ${fmt(calc.depositAmt)}</div>
    ${form.noteCli ? '<div style="margin-top:12px;padding:10px;background:#F4F6FD;border-radius:6px;font-size:11px">' + form.noteCli + '</div>' : ''}
    <div class="footer"><div>${c.paymentConditions || ''}</div><div style="margin-top:3px">${c.legalNote || ''}</div></div></body></html>`
  }

  const openPreview = () => setPreviewHtml(buildPdfHtml())
  const printPDF = () => {
    const html = buildPdfHtml()
    const win = window.open('', '_blank')
    win.document.write(html); win.document.close()
    setTimeout(() => win.print(), 300)
  }

  return (
    <div className="page active" style={{ animation: 'pgIn .2s ease both' }}>
      <div className="ph">
        <div className="ph-left"><h2>{editId ? 'Editar presupuesto' : 'Nuevo presupuesto'}</h2><p>Completá los datos para generar el presupuesto</p></div>
        <div className="ph-right"><button className="btn btn-ghost btn-sm" onClick={() => nav('/')}><i className="fa fa-xmark" /> Descartar</button></div>
      </div>

      <div className="budget-layout">
        <div>
          {/* CLIENTE */}
          <div className="bsec">
            <div className="bsec-title"><i className="fa fa-user-tie" />Cliente</div>
            <div className="grid2">
              <div className="fg">
                <label>Contacto (buscar en CRM)</label>
                <ClientCombo clients={clients} value={form.contact} onSelect={handleClientSelect} onChange={val => setF('contact', val)} />
              </div>
              <div className="fg"><label>Empresa</label><input type="text" value={form.company} onChange={e => setF('company', e.target.value)} placeholder="Empresa S.A." /></div>
              <div className="fg"><label>WhatsApp</label><input type="text" value={form.wa} onChange={e => setF('wa', e.target.value)} placeholder="+54 351 ..." /></div>
              <div className="fg"><label>Ocasión</label>
                <select value={form.ocasion} onChange={e => setF('ocasion', e.target.value)}>
                  <option value="">— seleccionar —</option>
                  {(c.occasions || []).map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* ENTREGA */}
          <div className="bsec">
            <div className="bsec-title"><i className="fa fa-truck" />Entrega y estado</div>
            <div className="grid2">
              <div className="fg"><label>Modalidad</label>
                <select value={form.delivery} onChange={e => setF('delivery', e.target.value)}>
                  <option value="">— seleccionar —</option>
                  {(c.deliveryModes || []).map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="fg"><label>Fecha pactada</label><input type="date" value={form.deliveryDate} onChange={e => setF('deliveryDate', e.target.value)} /></div>
              <div className="fg"><label>Costo envío ($)</label><input type="number" value={form.shipCost} onFocus={selectOnFocus} onChange={e => setF('shipCost', e.target.value)} onBlur={e => { if (e.target.value === '') setF('shipCost', 0) }} min="0" /></div>
              <div className="fg"><label>Estado</label>
                <select value={form.status} onChange={e => setF('status', e.target.value)}>
                  <option value="draft">Borrador</option><option value="sent">Enviado</option>
                  <option value="negotiating">Negociando</option><option value="confirmed">Confirmado</option>
                  <option value="lost">Perdido</option>
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
          </div>

          {/* PRODUCTOS */}
          <div className="bsec">
            <div className="bsec-title"><i className="fa fa-box-open" />Productos</div>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead><tr><th style={{ minWidth: 160 }}>Producto</th><th style={{ width: 65 }}>Cant.</th><th style={{ width: 100 }}>Costo u.</th><th style={{ width: 100 }}>Precio u.</th><th style={{ width: 95 }}>Subtotal</th><th style={{ width: 36 }}></th></tr></thead>
                <tbody>
                  {items.map((it, i) => (
                    <tr key={i}>
                      <td><input type="text" value={it.name} onChange={e => updateItem(i, 'name', e.target.value)} placeholder="Nombre del producto" list="prod-suggestions" style={{ padding: '6px 8px', fontSize: 12 }} /></td>
                      <td><input type="number" value={it.qty} onFocus={selectOnFocus} onChange={e => updateItem(i, 'qty', e.target.value === '' ? '' : Math.max(1, Number(e.target.value) || 1))} onBlur={e => { if (e.target.value === '') updateItem(i, 'qty', 1) }} min="1" style={{ padding: '6px 8px', fontSize: 12 }} /></td>
                      <td><input type="number" value={it.costUnit} onFocus={selectOnFocus} onChange={e => updateItem(i, 'costUnit', e.target.value)} onBlur={e => { if (e.target.value === '') updateItem(i, 'costUnit', 0) }} min="0" style={{ padding: '6px 8px', fontSize: 12 }} /></td>
                      <td><input type="number" value={it.priceUnit} onFocus={selectOnFocus} onChange={e => updateItem(i, 'priceUnit', e.target.value)} onBlur={e => { if (e.target.value === '') updateItem(i, 'priceUnit', 0) }} min="0" style={{ padding: '6px 8px', fontSize: 12 }} /></td>
                      <td style={{ fontWeight: 600, color: 'var(--brand)', fontSize: 12 }}>{fmt(num(it.qty) * num(it.priceUnit))}</td>
                      <td><button className="act del" onClick={() => removeItem(i)}><i className="fa fa-xmark" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <datalist id="prod-suggestions">{products.map(p => <option key={p.id} value={p.name} />)}</datalist>
            </div>
            <button className="btn btn-ghost btn-xs" style={{ marginTop: 8 }} onClick={addItem}><i className="fa fa-plus" /> Agregar producto</button>
          </div>

          {/* PARÁMETROS */}
          <div className="bsec">
            <div className="bsec-title"><i className="fa fa-sliders" />Parámetros de precio</div>
            <div className="grid3">
              <div className="fg"><label>Margen ganancia (%)</label><input type="number" value={form.margin} onFocus={selectOnFocus} onChange={e => setF('margin', e.target.value)} onBlur={e => { if (e.target.value === '') setF('margin', 0) }} min="0" max="100" /></div>
              <div className="fg"><label>Seña requerida (%)</label><input type="number" value={form.deposit} onFocus={selectOnFocus} onChange={e => setF('deposit', e.target.value)} onBlur={e => { if (e.target.value === '') setF('deposit', 0) }} min="0" max="100" /></div>
              <div className="fg"><label>Impresión/logo x u. ($)</label><input type="number" value={form.logoCost} onFocus={selectOnFocus} onChange={e => setF('logoCost', e.target.value)} onBlur={e => { if (e.target.value === '') setF('logoCost', 0) }} min="0" /></div>
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
            <div className="cp-row"><span className="cp-lbl">Envío</span><span className="cp-val">{fmt(num(form.shipCost))}</span></div>
            <div className="cp-row"><span className="cp-lbl">Ganancia</span><span className="cp-val" style={{ color: '#86EFAC' }}>{fmt(calc.gain)}</span></div>
            <div className="cp-row"><span className="cp-lbl">Margen real</span><span className="cp-val">{calc.marginReal}%</span></div>
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
              <button className="cp-btn cp-btn-primary" onClick={handleSave}><i className="fa fa-floppy-disk" /> Guardar</button>
              <button className="cp-btn cp-btn-ghost" onClick={copyWA}><i className="fa-brands fa-whatsapp" /> Copiar WA</button>
              <button className="cp-btn cp-btn-ghost" onClick={openPreview}><i className="fa fa-eye" /> Vista previa</button>
              <button className="cp-btn cp-btn-ghost" onClick={printPDF}><i className="fa fa-file-pdf" /> PDF</button>
              {mpCfg.enabled && (
                <button className="cp-btn cp-btn-ghost" onClick={generateMP} disabled={mpLoading}
                  style={{ background: 'rgba(0,158,227,.15)', color: '#009EE3', borderColor: 'rgba(0,158,227,.3)' }}>
                  <i className="fa fa-credit-card" /> {mpLoading ? 'Generando...' : 'Link Mercado Pago'}
                </button>
              )}
              {bankCfg.enabled && (
                <button className="cp-btn cp-btn-ghost" onClick={copyBankInfo}
                  style={{ background: 'rgba(5,150,105,.15)', color: 'var(--acento)', borderColor: 'rgba(5,150,105,.3)' }}>
                  <i className="fa fa-building-columns" /> Copiar CBU / Alias
                </button>
              )}
              {bankCfg.enabled && (
                <button className="cp-btn cp-btn-ghost" onClick={copyBankWithBudget}
                  style={{ background: 'rgba(5,150,105,.08)', color: 'var(--acento)', borderColor: 'rgba(5,150,105,.2)', fontSize: 11 }}>
                  <i className="fa-brands fa-whatsapp" /> Copiar WA + datos bancarios
                </button>
              )}
              {!mpCfg.enabled && !bankCfg.enabled && (
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,.5)', padding: '6px 4px', textAlign: 'center' }}>
                  <i className="fa fa-circle-info" /> Activá un método de pago en Config &gt; Pagos
                </div>
              )}
              {mpResult && <div style={{ marginTop: 4, fontSize: 10, wordBreak: 'break-all' }} dangerouslySetInnerHTML={{ __html: mpResult }} />}
            </div>
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
          <div style={{ background: 'var(--surface)', borderRadius: 18, width: '100%', maxWidth: 940, maxHeight: '85vh', boxShadow: 'var(--sh-lg)', animation: 'pgIn .2s ease both', display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0, margin: 'auto 0' }}>
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
