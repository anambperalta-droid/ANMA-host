import { useState, useEffect, useRef } from 'react'
import { useData } from '../../context/DataContext'
import { useToast } from '../../context/ToastContext'
import { fmt, cfg } from '../../lib/storage'

export default function Proveedores() {
  const { get, set, saveEntity, deleteEntity } = useData()
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(false)
  const [importModal, setImportModal] = useState(false)
  const [detailSupplier, setDetailSupplier] = useState(null)
  const [detailTab, setDetailTab] = useState('info')
  const [viewMode, setViewMode] = useState('table')
  const [loading, setLoading] = useState(true)
  const [dismissed, setDismissed] = useState(() => {
    try { return JSON.parse(localStorage.getItem('anma_prov_alerts_dismissed') || '{}') } catch { return {} }
  })
  const persistDismissed = (next) => {
    setDismissed(next)
    try { localStorage.setItem('anma_prov_alerts_dismissed', JSON.stringify(next)) } catch { /* ignorar */ }
  }
  const dismissAlert = (key) => persistDismissed({ ...dismissed, [key]: Date.now() })
  const restoreAlerts = () => persistDismissed({})
  const [form, setForm] = useState({ name: '', contact: '', wa: '', rubro: '', email: '', notes: '', cuit: '', ivaCondition: '', paymentTerm: '', cbu: '', leadTime: '' })
  const [newNote, setNewNote] = useState('')
  const fileRef = useRef(null)
  const [csvPreview, setCsvPreview] = useState([])
  const [priceModal, setPriceModal] = useState(null)
  const [priceForm, setPriceForm] = useState({ newCost: '', note: '' })
  const [reorderOpen, setReorderOpen] = useState(false)

  useEffect(() => { const t = setTimeout(() => setLoading(false), 80); return () => clearTimeout(t) }, [])

  // Auto-fix: dedupe + corrige rubro/email invertidos (one-time migration, idempotente)
  // SEGURO: usa `set` de DataContext (tiene userId correcto), sin reload ni dbW directo
  useEffect(() => {
    // Idempotencia: si ya corrió para este usuario, salir
    try {
      const ranKey = 'anma_prov_mig_v3'
      if (localStorage.getItem(ranKey) === 'done') return
    } catch { /* ignorar */ }

    const list = get('suppliers') || []
    if (list.length === 0) return

    const looksLikeEmail = (v) => typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
    const sigOf = (s) => `${(s.name||'').trim().toLowerCase()}|${(s.contact||'').trim().toLowerCase()}|${(s.wa||'').replace(/\D/g,'')}`

    // 1) Dedupe: agrupa por firma (name+contact+wa), conserva la "mejor" versión
    const groups = {}
    list.forEach(s => {
      const k = sigOf(s)
      if (!groups[k]) groups[k] = []   // sin ||= para compatibilidad con browsers viejos
      groups[k].push(s)
    })

    let dedupedList = []
    let dupesRemoved = 0
    let swapsApplied = 0

    Object.values(groups).forEach(grp => {
      if (grp.length === 1) {
        const s = grp[0]
        if (looksLikeEmail(s.rubro) && !looksLikeEmail(s.email)) {
          dedupedList.push({ ...s, rubro: s.email || '', email: s.rubro })
          swapsApplied++
        } else {
          dedupedList.push(s)
        }
      } else {
        const ranked = grp.slice().sort((a, b) => {
          const aBad = looksLikeEmail(a.rubro) ? 1 : 0
          const bBad = looksLikeEmail(b.rubro) ? 1 : 0
          if (aBad !== bBad) return aBad - bBad
          const aFill = Object.values(a).filter(Boolean).length
          const bFill = Object.values(b).filter(Boolean).length
          return bFill - aFill
        })
        const best = ranked[0]
        let merged = { ...best }
        if (looksLikeEmail(merged.rubro)) {
          const withRubro = grp.find(x => x !== best && !looksLikeEmail(x.rubro) && x.rubro)
          if (withRubro) merged.rubro = withRubro.rubro
          else if (!looksLikeEmail(merged.email)) {
            const tmp = merged.rubro; merged.rubro = merged.email || ''; merged.email = tmp
            swapsApplied++
          }
        }
        if (!merged.email) {
          const withEmail = grp.find(x => looksLikeEmail(x.email))
          if (withEmail) merged.email = withEmail.email
        }
        dedupedList.push(merged)
        dupesRemoved += grp.length - 1
      }
    })

    // Marcar como ejecutado ANTES de escribir (evita bucles si algo falla a mitad)
    try { localStorage.setItem('anma_prov_mig_v3', 'done') } catch { /* ignorar */ }

    if (dupesRemoved > 0 || swapsApplied > 0) {
      const finalList = dedupedList.map((s, i) => ({
        ...s,
        id: s.id || (Date.now() + i),
      }))
      // set() viene de DataContext → usa el userId correcto → llama refresh() internamente
      set('suppliers', finalList)
      const msgs = []
      if (dupesRemoved > 0) msgs.push(`${dupesRemoved} duplicado${dupesRemoved !== 1 ? 's' : ''} eliminado${dupesRemoved !== 1 ? 's' : ''}`)
      if (swapsApplied > 0) msgs.push(`${swapsApplied} con rubro/email corregido${swapsApplied !== 1 ? 's' : ''}`)
      toast(`Proveedores reparados: ${msgs.join(' · ')}`, 'ok')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const suppliers = get('suppliers')
  const products = get('products')
  const budgets = get('budgets')
  const sq = search.toLowerCase()
  const filtered = search ? suppliers.filter(s =>
    (s.name || '').toLowerCase().includes(sq) || (s.contact || '').toLowerCase().includes(sq) || (s.rubro || '').toLowerCase().includes(sq)
  ) : suppliers

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const openEdit = (s) => { setForm(s ? { ...s } : { name: '', contact: '', wa: '', rubro: '', email: '', notes: '', cuit: '', ivaCondition: '', paymentTerm: '', cbu: '', leadTime: '' }); setModal(true) }
  const save = () => {
    if (!form.name) { toast('Ingresá el nombre del proveedor.', 'er'); return }
    saveEntity('suppliers', form); setModal(false); toast('Proveedor guardado', 'ok')
    if (detailSupplier && form.id === detailSupplier.id) setDetailSupplier({ ...detailSupplier, ...form })
  }
  const del = (id) => {
    if (window.confirm('¿Eliminar proveedor?')) {
      deleteEntity('suppliers', id); toast('Proveedor eliminado', 'in')
      if (detailSupplier?.id === id) setDetailSupplier(null)
    }
  }

  const supplierProducts = (s) => products.filter(p => Number(p.supplierId) === s.id)

  /* ── Re-orden ── */
  const supplierLowStock = (s) => supplierProducts(s).filter(p => p.minStock > 0 && (p.stock || 0) <= p.minStock)

  const allLowStockBySupplier = (() => {
    const groups = []
    suppliers.forEach(s => {
      const items = supplierLowStock(s)
      if (items.length) groups.push({ s, items })
    })
    return groups.sort((a, b) => b.items.length - a.items.length)
  })()

  const totalLowStock = allLowStockBySupplier.reduce((sum, g) => sum + g.items.length, 0)

  const sendReorderWA = (s, items) => {
    if (!s.wa) { toast('Esta proveedora no tiene WhatsApp cargado', 'er'); return }
    const num = s.wa.replace(/\D/g, '')
    const lines = items.map(p => `• ${p.name} — necesito reponer (stock: ${p.stock || 0}, mín: ${p.minStock})`).join('\n')
    const text = `Hola ${s.contact || s.name}, te paso pedido de reposición:\n\n${lines}\n\nGracias!`
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(text)}`, '_blank')
  }

  /* ── Concentración de compras ── */
  const concentration = (() => {
    if (!suppliers.length || !products.length) return null
    const counts = suppliers.map(s => ({ s, n: supplierProducts(s).length })).filter(x => x.n > 0).sort((a, b) => b.n - a.n)
    if (!counts.length) return null
    const total = counts.reduce((sum, x) => sum + x.n, 0)
    const top = counts[0]
    const top3 = counts.slice(0, 3).reduce((sum, x) => sum + x.n, 0)
    return { topName: top.s.name, topPct: (top.n / total) * 100, top3Pct: (top3 / total) * 100, total }
  })()
  const supplierCostTotal = (s) => supplierProducts(s).reduce((sum, p) => sum + (Number(p.cost) || 0), 0)

  /* ── Score de performance del proveedor (0–100) ── */
  const supplierScore = (s) => {
    let score = 50
    let factors = []
    if (s.cuit && s.ivaCondition && s.paymentTerm) { score += 10; factors.push('Datos fiscales completos +10') }
    if (s.leadTime) {
      const lt = Number(s.leadTime)
      if (lt > 0 && lt <= 7) { score += 15; factors.push('Lead time excelente +15') }
      else if (lt <= 15) { score += 5; factors.push('Lead time aceptable +5') }
      else if (lt > 30) { score -= 10; factors.push('Lead time alto −10') }
    }
    const hist = s.priceHistory || []
    if (hist.length >= 2) {
      const ups = hist.filter(h => h.prevCost > 0 && h.newCost > h.prevCost)
      if (ups.length) {
        const avg = ups.reduce((sum, h) => sum + ((h.newCost - h.prevCost) / h.prevCost) * 100, 0) / ups.length
        if (avg <= 10) { score += 10; factors.push('Precios estables +10') }
        else if (avg >= 25) { score -= 10; factors.push('Subas frecuentes −10') }
      }
    }
    const lastDays = supplierLastActivity(s)
    if (lastDays !== null && lastDays <= 30) { score += 10; factors.push('Activa recientemente +10') }
    else if (lastDays !== null && lastDays > 90) { score -= 10; factors.push('Sin actividad >90d −10') }
    score = Math.max(0, Math.min(100, score))
    return { score, factors }
  }

  const supplierLastActivity = (s) => {
    const supplierProds = products.filter(p => String(p.supplierId) === String(s.id)).map(p => p.name)
    if (!supplierProds.length) return null
    const relevant = budgets
      .filter(b => b.items?.some(it => supplierProds.includes(it.name)) && b.date)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
    if (!relevant.length) return null
    return Math.floor((Date.now() - new Date(relevant[0].date)) / 86400000)
  }

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const lines = ev.target.result.split('\n').filter(l => l.trim())
      const header = lines[0].toLowerCase()
      const startIdx = header.includes('nombre') || header.includes('proveedor') || header.includes('name') ? 1 : 0
      const parsed = []
      for (let i = startIdx; i < lines.length; i++) {
        const parts = lines[i].match(/(".*?"|[^,]+)/g)?.map(v => v.replace(/^"|"$/g, '').trim()) || []
        if (parts.length >= 1 && parts[0]) {
          parsed.push({ name: parts[0] || '', contact: parts[1] || '', wa: parts[2] || '', rubro: parts[3] || '', email: parts[4] || '', notes: parts[5] || '' })
        }
      }
      setCsvPreview(parsed)
    }
    reader.readAsText(file)
  }

  const doImport = () => {
    csvPreview.forEach(s => saveEntity('suppliers', { ...s }))
    toast(`${csvPreview.length} proveedores importados`, 'ok')
    setCsvPreview([]); setImportModal(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const exportCSV = () => {
    const rows = [['Nombre', 'Contacto', 'WhatsApp', 'Rubro', 'Email', 'Notas'].join(',')]
    suppliers.forEach(s => rows.push([s.name, s.contact, s.wa, s.rubro, s.email, s.notes].map(v => `"${(v || '').replace(/"/g, '""')}"`).join(',')))
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'proveedores.csv'; a.click()
  }

  const addNote = () => {
    if (!newNote.trim() || !detailSupplier) return
    const existing = detailSupplier.noteHistory || []
    const updated = [...existing, { text: newNote.trim(), date: new Date().toISOString().slice(0, 16).replace('T', ' ') }]
    saveEntity('suppliers', { ...detailSupplier, noteHistory: updated })
    setDetailSupplier({ ...detailSupplier, noteHistory: updated })
    setNewNote('')
    toast('Nota agregada', 'ok')
  }

  const openWA = (s) => {
    if (!s.wa) return
    const num = s.wa.replace(/\D/g, '')
    const text = `Hola ${s.contact || s.name}, te contacto desde ANMA por el siguiente tema: `
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(text)}`, '_blank')
  }

  /* ── ESC cierra modales (prioridad: topmost primero) ── */
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        if (modal) { setModal(false); return }
        if (importModal) { setImportModal(false); setCsvPreview([]); return }
        if (detailSupplier) { setDetailSupplier(null); return }
      }
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [modal, importModal, detailSupplier])

  const openDetail = (s) => { setDetailSupplier(s); setDetailTab('info') }

  /* ── Generar link de portal para la proveedora ── */
  const sharePortalLink = (s) => {
    if (!s) return
    const prods = supplierProducts(s)
    const appCfg = cfg()
    const ownerName = appCfg.businessName || ''
    const ownerWa   = appCfg.contactWA || appCfg.businessWA || appCfg.ownerWA || ''
    const brandColor = appCfg.brandColor || '#7C3AED'

    // Payload con keys cortas (50%+ menos URL)
    const payload = {
      v: 2, // versión
      s: s.name,
      e: Date.now() + 30 * 86400000,
      p: prods.map(pp => {
        const o = { n: pp.name, c: Number(pp.cost) || 0 }
        if (pp.stock)    o.st = pp.stock
        if (pp.minStock) o.m  = pp.minStock
        if (pp.minStock > 0 && (pp.stock || 0) <= pp.minStock) o.r = 1
        return o
      }),
    }
    if (s.contact)     payload.c  = s.contact
    if (s.paymentTerm) payload.pt = s.paymentTerm
    if (s.leadTime)    payload.lt = s.leadTime
    if (ownerName)     payload.o  = ownerName
    if (ownerWa)       payload.w  = ownerWa
    if (brandColor)    payload.bc = brandColor
    if (appCfg.portalIntroCopy) payload.cp = appCfg.portalIntroCopy

    const json = JSON.stringify(payload)
    const b64 = btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const url = `${window.location.origin}/portal-proveedor?d=${b64}`

    // Mensaje WA personalizable
    const tpl = appCfg.portalShareMsg ||
      'Hola {contacto}! Te paso el portal con el resumen del pedido y los productos que necesito. Tiene los precios acordados, las condiciones y un botón para confirmar disponibilidad.'
    const text = tpl
      .replace(/\{contacto\}/g, s.contact || s.name)
      .replace(/\{proveedor\}/g, s.name)
      .replace(/\{empresa\}/g,  ownerName)
      .replace(/\{cant\}/g, prods.length)
      .replace(/\{link\}/g, url)
      + (tpl.includes('{link}') ? '' : `\n\n${url}`)
      + '\n\nVálido por 30 días.'

    if (s.wa) {
      const waNum = s.wa.replace(/\D/g, '')
      window.open(`https://wa.me/${waNum}?text=${encodeURIComponent(text)}`, '_blank')
    } else {
      navigator.clipboard.writeText(url).then(() => toast('Link copiado al portapapeles', 'ok'))
    }
  }

  /* ── Histórico de precios ── */
  const productPriceHistory = (productId) =>
    (detailSupplier?.priceHistory || []).filter(h => String(h.productId) === String(productId))
      .sort((a, b) => new Date(b.date) - new Date(a.date))

  const lastPriceChange = (product) => {
    const hist = productPriceHistory(product.id)
    if (!hist.length) return null
    const last = hist[0]
    const prev = Number(last.prevCost) || 0
    const curr = Number(last.newCost) || Number(product.cost) || 0
    if (!prev) return null
    const pct = ((curr - prev) / prev) * 100
    return { pct, date: last.date }
  }

  const openPriceModal = (product) => {
    setPriceModal({ product })
    setPriceForm({ newCost: String(product.cost || ''), note: '' })
  }

  const savePriceChange = () => {
    if (!priceModal?.product) return
    const product = priceModal.product
    const newCost = Number(priceForm.newCost)
    if (!newCost || newCost <= 0) { toast('Ingresá un costo válido', 'er'); return }
    const prevCost = Number(product.cost) || 0
    if (newCost === prevCost) { toast('El costo es el mismo', 'in'); return }
    saveEntity('products', { ...product, cost: newCost })
    const entry = {
      productId: product.id,
      productName: product.name,
      prevCost,
      newCost,
      date: new Date().toISOString().slice(0, 16).replace('T', ' '),
      note: priceForm.note.trim()
    }
    const history = [...(detailSupplier.priceHistory || []), entry]
    saveEntity('suppliers', { ...detailSupplier, priceHistory: history })
    setDetailSupplier({ ...detailSupplier, priceHistory: history })
    setPriceModal(null); setPriceForm({ newCost: '', note: '' })
    toast(`Precio actualizado: ${product.name}`, 'ok')
  }

  return (
    <div className="page active" style={{ animation: 'pgIn .2s ease both' }}>
      <div className="ph">
        <div className="ph-left"><h2>Proveedores</h2><p>Directorio de proveedores</p></div>
        <div className="ph-right">
          <button className="btn btn-ghost btn-sm" onClick={() => setImportModal(true)}><i className="fa fa-file-import" /> Importar</button>
          <button className="btn btn-secondary btn-sm" onClick={exportCSV}><i className="fa fa-download" /> Exportar</button>
          <button className="btn btn-primary btn-sm" onClick={() => openEdit()}><i className="fa fa-plus" /> Agregar</button>
        </div>
      </div>
      <div className="pill-row">
        <div className="search-row"><i className="fa fa-magnifying-glass" /><input type="text" placeholder="Buscar proveedor, rubro..." value={search} onChange={e => setSearch(e.target.value)} /></div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <button className={`pill ${viewMode === 'table' ? 'active' : ''}`} onClick={() => setViewMode('table')}><i className="fa fa-table-list" /></button>
          <button className={`pill ${viewMode === 'cards' ? 'active' : ''}`} onClick={() => setViewMode('cards')}><i className="fa fa-grip" /></button>
        </div>
      </div>

      {(dismissed.reorder || dismissed.concentration) && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <button onClick={restoreAlerts} className="btn btn-ghost btn-xs"
            style={{ fontSize: 11, color: 'var(--txt3)' }}>
            <i className="fa fa-eye" /> Mostrar alertas ocultas
          </button>
        </div>
      )}

      {totalLowStock > 0 && !dismissed.reorder && (
        <div style={{ background: 'rgba(220,38,38,.06)', border: '1px solid rgba(220,38,38,.25)', borderRadius: 10, marginBottom: 10, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', fontSize: 12 }}>
            <i className="fa fa-bell" style={{ color: '#DC2626', fontSize: 14 }} />
            <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => setReorderOpen(v => !v)}>
              <b style={{ color: '#DC2626' }}>{totalLowStock} producto{totalLowStock !== 1 ? 's' : ''} para re-ordenar</b>
              <span style={{ color: 'var(--txt3)', marginLeft: 6 }}>
                · {allLowStockBySupplier.length} proveedora{allLowStockBySupplier.length !== 1 ? 's' : ''} involucrada{allLowStockBySupplier.length !== 1 ? 's' : ''}
              </span>
            </div>
            <i className={`fa fa-chevron-${reorderOpen ? 'up' : 'down'}`} style={{ color: 'var(--txt3)', fontSize: 11, cursor: 'pointer' }} onClick={() => setReorderOpen(v => !v)} />
            <button onClick={() => dismissAlert('reorder')} title="Ocultar alerta"
              style={{ background: 'transparent', border: 'none', color: 'var(--txt3)', cursor: 'pointer', padding: '0 2px', fontSize: 14, lineHeight: 1 }}>
              <i className="fa fa-xmark" />
            </button>
          </div>
          {reorderOpen && (
            <div style={{ padding: '0 14px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {allLowStockBySupplier.map(({ s, items }) => (
                <div key={s.id} style={{ background: 'var(--surface)', borderRadius: 8, padding: '10px 12px', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <div style={{ flex: 1, fontWeight: 700, fontSize: 12, color: 'var(--txt)' }}>
                      {s.name}
                      {s.leadTime && <span style={{ fontSize: 10, color: 'var(--txt3)', fontWeight: 500, marginLeft: 6 }}>· {s.leadTime}d entrega</span>}
                    </div>
                    {s.wa && (
                      <button onClick={() => sendReorderWA(s, items)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#16A34A', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                        <i className="fa-brands fa-whatsapp" /> Pedir ahora
                      </button>
                    )}
                    <button onClick={() => openDetail(s)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'transparent', color: 'var(--txt2)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                      Ver ficha
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {items.map(p => (
                      <span key={p.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(220,38,38,.08)', color: '#DC2626', fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 12 }}>
                        {p.name} <span style={{ opacity: .7 }}>({p.stock || 0}/{p.minStock})</span>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {concentration && concentration.topPct >= 50 && !dismissed.concentration && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: concentration.topPct >= 70 ? 'rgba(220,38,38,.08)' : 'rgba(217,119,6,.08)', border: `1px solid ${concentration.topPct >= 70 ? 'rgba(220,38,38,.25)' : 'rgba(217,119,6,.25)'}`, borderRadius: 10, marginBottom: 10, fontSize: 12 }}>
          <i className="fa fa-triangle-exclamation" style={{ color: concentration.topPct >= 70 ? '#DC2626' : '#D97706', fontSize: 14 }} />
          <div style={{ flex: 1 }}>
            <b>Riesgo de concentración:</b> el {concentration.topPct.toFixed(0)}% de tus productos depende de <b>{concentration.topName}</b>.
            Top 3 proveedores concentran el {concentration.top3Pct.toFixed(0)}%. Considerá diversificar.
          </div>
          <button onClick={() => dismissAlert('concentration')} title="Ocultar alerta"
            style={{ background: 'transparent', border: 'none', color: 'var(--txt3)', cursor: 'pointer', padding: '0 2px', fontSize: 14, lineHeight: 1 }}>
            <i className="fa fa-xmark" />
          </button>
        </div>
      )}

      {viewMode === 'table' ? (
        <div className="tbl-card">
          <table>
            <thead><tr>
              <th>Proveedor / Contacto</th><th>WhatsApp</th><th>Rubro</th><th>Email</th>
              <th>Productos</th>
              <th>Acciones</th>
            </tr></thead>
            <tbody>
              {loading ? [1,2,3,4,5].map(i => (
                <tr key={i}><td colSpan={6}><div className="sk sk-text" style={{ height: 16, width: `${55 + Math.random() * 35}%` }} /></td></tr>
              )) : filtered.length ? filtered.map(s => (
                <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => openDetail(s)}>
                  <td>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--txt)' }}>{s.name}</div>
                      {s.contact && <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 1 }}>{s.contact}</div>}
                    </div>
                  </td>
                  <td>
                    {s.wa ? (
                      <a href={`https://wa.me/${s.wa.replace(/\D/g,'')}`} target="_blank" rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        title={s.wa}
                        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, background: '#DCFCE7', color: '#16A34A', fontSize: 16, textDecoration: 'none' }}>
                        <i className="fa-brands fa-whatsapp" />
                      </a>
                    ) : <span style={{ color: 'var(--txt4)' }}>—</span>}
                  </td>
                  <td>{s.rubro}</td><td>{s.email}</td>
                  <td><span className="badge b-sent">{supplierProducts(s).length}</span></td>
                  <td><div className="acts" style={{ gap: 8 }} onClick={e => e.stopPropagation()}>
                    <button className="act edit" onClick={() => openEdit(s)}><i className="fa fa-pen" /></button>
                    <div style={{ width: 1, height: 18, background: 'var(--border)' }} />
                    <button className="act del" onClick={() => del(s.id)}><i className="fa fa-trash" /></button>
                  </div></td>
                </tr>
              )) : <tr><td colSpan={6}><div className="empty"><div className="ico"><i className="fa fa-industry" /></div><h4>Sin proveedores</h4><p>Agregá tu primer proveedor</p></div></td></tr>}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 12 }}>
          {loading ? [1,2,3,4,5,6].map(i => (
            <div key={i} className="card"><div className="sk sk-text" style={{ height: 16, width: '60%', marginBottom: 8 }} /><div className="sk sk-text" style={{ height: 14, width: '80%' }} /></div>
          )) : filtered.length ? filtered.map(s => (
            <div key={s.id} className="card" style={{ cursor: 'pointer' }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = 'var(--sh-md)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}
              onClick={() => openDetail(s)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, #F59E0B 0%, #EF4444 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                  {(s.name || '?')[0].toUpperCase()}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div>
                  {s.contact && <div style={{ fontSize: 11, color: 'var(--txt3)' }}>{s.contact}</div>}
                </div>
              </div>
              {s.rubro && <span className="badge b-purple" style={{ marginBottom: 6 }}>{s.rubro}</span>}
              <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--txt2)', marginTop: 6 }}>
                {s.wa && <span><i className="fa-brands fa-whatsapp" style={{ marginRight: 3 }} />{s.wa}</span>}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                <span style={{ fontSize: 10, color: 'var(--txt3)' }}>{supplierProducts(s).length} producto{supplierProducts(s).length !== 1 ? 's' : ''}</span>
                <div className="acts" onClick={e => e.stopPropagation()}>
                  <button className="act edit" onClick={() => openEdit(s)}><i className="fa fa-pen" /></button>
                  <button className="act del" onClick={() => del(s.id)}><i className="fa fa-trash" /></button>
                </div>
              </div>
            </div>
          )) : <div className="empty" style={{ gridColumn: '1/-1' }}><div className="ico"><i className="fa fa-industry" /></div><h4>Sin proveedores</h4></div>}
        </div>
      )}

      <div style={{ marginTop: 8, fontSize: 11, color: 'var(--txt3)' }}>{filtered.length} proveedor{filtered.length !== 1 ? 'es' : ''}</div>

      {/* MODAL EDITAR */}
      {modal && (
        <div className="modal-bg open" style={{ zIndex: 700 }} onClick={e => { if (e.target === e.currentTarget) setModal(false) }}>
          <div className="modal" onKeyDown={e => { if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && form.name && form.name.trim()) save() }}>
            <div className="mh"><h3>{form.id ? 'Editar' : 'Agregar'} proveedor</h3><button className="mclose" onClick={() => setModal(false)}><i className="fa fa-xmark" /></button></div>
            <div className="grid2">
              <div className="fg"><label>Nombre *</label><input type="text" value={form.name} onChange={e => setF('name', e.target.value)} placeholder="Proveedor S.A." /></div>
              <div className="fg"><label>Contacto</label><input type="text" value={form.contact} onChange={e => setF('contact', e.target.value)} /></div>
              <div className="fg"><label>WhatsApp</label><input type="text" value={form.wa} onChange={e => setF('wa', e.target.value)} /></div>
              <div className="fg">
                <label>Rubro <span style={{ color: 'var(--txt4)', fontWeight: 400, fontSize: 10 }}>(ej: Electrónica, Textil, Alimentos)</span></label>
                <input type="text" value={form.rubro} onChange={e => setF('rubro', e.target.value)} placeholder="Categoría / industria" />
                {form.rubro && form.rubro.includes('@') && (
                  <div style={{ fontSize: 10.5, color: '#DC2626', marginTop: 3, fontWeight: 600 }}>
                    ⚠ Esto parece un email — usá el campo "Email" debajo
                  </div>
                )}
              </div>
            </div>
            <div className="fg">
              <label>Email <span style={{ color: 'var(--txt4)', fontWeight: 400, fontSize: 10 }}>(contacto@empresa.com)</span></label>
              <input type="email" value={form.email} onChange={e => setF('email', e.target.value)} placeholder="contacto@proveedor.com" />
            </div>
            <div style={{ marginTop: 8, fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.5px' }}>Datos fiscales y operativos</div>
            <div className="grid2">
              <div className="fg"><label>CUIT</label><input type="text" value={form.cuit} onChange={e => setF('cuit', e.target.value)} placeholder="20-12345678-9" /></div>
              <div className="fg"><label>Condición IVA</label>
                <select value={form.ivaCondition} onChange={e => setF('ivaCondition', e.target.value)}>
                  <option value="">—</option>
                  <option value="RI">Responsable Inscripto</option>
                  <option value="MT">Monotributo</option>
                  <option value="EX">Exento</option>
                  <option value="CF">Consumidor Final</option>
                </select>
              </div>
              <div className="fg"><label>Plazo de pago (días)</label><input type="number" min="0" value={form.paymentTerm} onChange={e => setF('paymentTerm', e.target.value)} placeholder="30" /></div>
              <div className="fg"><label>Lead time entrega (días)</label><input type="number" min="0" value={form.leadTime} onChange={e => setF('leadTime', e.target.value)} placeholder="7" /></div>
            </div>
            <div className="fg"><label>CBU / Alias</label><input type="text" value={form.cbu} onChange={e => setF('cbu', e.target.value)} placeholder="0000000000000000000000 o ALIAS.PROVEEDOR" /></div>
            <div className="fg"><label>Notas</label><textarea value={form.notes} onChange={e => setF('notes', e.target.value)} rows={2} /></div>
            <div className="mfooter"><button className="btn btn-secondary" onClick={() => setModal(false)}>Cancelar</button><button className="btn btn-primary" onClick={save}><i className="fa fa-floppy-disk" /> Guardar</button></div>
          </div>
        </div>
      )}

      {/* FICHA DETALLE CON PESTAÑAS */}
      {detailSupplier && (
        <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) setDetailSupplier(null) }}>
          <div className="modal" style={{ maxWidth: 820, height: 'min(820px, 92vh)', overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: 0 }} onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg, #F59E0B 0%, #EF4444 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                    {(detailSupplier.name || '?')[0].toUpperCase()}
                  </div>
                  <div>
                    <h3 style={{ fontSize: 17, fontWeight: 900, color: 'var(--txt)', letterSpacing: '-.4px', margin: 0, lineHeight: 1.2 }}>{detailSupplier.name}</h3>
                    {detailSupplier.contact && (
                      <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 2 }}>
                        {detailSupplier.contact}{detailSupplier.rubro ? <span style={{ color: 'var(--txt4)' }}> · {detailSupplier.rubro}</span> : ''}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 5 }}>
                  <button className="btn btn-ghost btn-xs" onClick={() => sharePortalLink(detailSupplier)} title="Genera un link público con resumen para la proveedora">
                    <i className="fa fa-share-nodes" /> Compartir portal
                  </button>
                  <button className="btn btn-ghost btn-xs" onClick={() => openEdit(detailSupplier)}><i className="fa fa-pen" /> Editar</button>
                  <button className="mclose" onClick={() => setDetailSupplier(null)}><i className="fa fa-xmark" /></button>
                </div>
              </div>
            </div>

            {/* Pestañas */}
            <div className="detail-tabs">
              {[['info', 'Información'], ['productos', 'Productos'], ['precios', 'Precios'], ['notas', 'Notas']].map(([k, l]) => (
                <div key={k} className={`detail-tab ${detailTab === k ? 'active' : ''}`} onClick={() => setDetailTab(k)}>{l}</div>
              ))}
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>

              {/* TAB: Información */}
              {detailTab === 'info' && (
                <div>
                  {/* Contacto activo — links funcionales */}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                    {detailSupplier.wa && (
                      <a
                        href="#"
                        onClick={e => { e.preventDefault(); openWA(detailSupplier) }}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#DCFCE7', color: '#16A34A', fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 20, textDecoration: 'none', cursor: 'pointer', transition: 'opacity .15s' }}
                        onMouseEnter={e => e.currentTarget.style.opacity = '.8'}
                        onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                        title="Abrir chat de WhatsApp"
                      >
                        <i className="fa-brands fa-whatsapp" /> WA: {detailSupplier.wa}
                      </a>
                    )}
                    {detailSupplier.email && (
                      <a
                        href={`mailto:${detailSupplier.email}`}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#DBEAFE', color: '#1D4ED8', fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 20, textDecoration: 'none', transition: 'opacity .15s' }}
                        onMouseEnter={e => e.currentTarget.style.opacity = '.8'}
                        onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                      >
                        <i className="fa fa-envelope" /> Email: {detailSupplier.email}
                      </a>
                    )}
                    {detailSupplier.rubro && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#EDE9FE', color: '#7C3AED', fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 20 }}>
                        <i className="fa fa-tag" /> Rubro: {detailSupplier.rubro}
                      </span>
                    )}
                  </div>

                  {/* Datos fiscales y operativos */}
                  {(detailSupplier.cuit || detailSupplier.ivaCondition || detailSupplier.paymentTerm || detailSupplier.leadTime || detailSupplier.cbu) && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, marginBottom: 14 }}>
                      {detailSupplier.cuit && (
                        <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '8px 12px' }}>
                          <div style={{ fontSize: 9, color: 'var(--txt3)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.5px' }}>CUIT</div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt)', marginTop: 2 }}>{detailSupplier.cuit}</div>
                        </div>
                      )}
                      {detailSupplier.ivaCondition && (
                        <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '8px 12px' }}>
                          <div style={{ fontSize: 9, color: 'var(--txt3)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.5px' }}>Condición IVA</div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt)', marginTop: 2 }}>
                            {{ RI: 'Resp. Inscripto', MT: 'Monotributo', EX: 'Exento', CF: 'Consumidor Final' }[detailSupplier.ivaCondition] || detailSupplier.ivaCondition}
                          </div>
                        </div>
                      )}
                      {detailSupplier.paymentTerm && (
                        <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '8px 12px' }}>
                          <div style={{ fontSize: 9, color: 'var(--txt3)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.5px' }}>Plazo pago</div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt)', marginTop: 2 }}>{detailSupplier.paymentTerm} días</div>
                        </div>
                      )}
                      {detailSupplier.leadTime && (
                        <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '8px 12px' }}>
                          <div style={{ fontSize: 9, color: 'var(--txt3)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.5px' }}>Lead time</div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt)', marginTop: 2 }}>{detailSupplier.leadTime} días</div>
                        </div>
                      )}
                      {detailSupplier.cbu && (
                        <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '8px 12px', gridColumn: '1 / -1' }}>
                          <div style={{ fontSize: 9, color: 'var(--txt3)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.5px' }}>CBU / Alias</div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt)', marginTop: 2, fontFamily: 'monospace', wordBreak: 'break-all' }}>{detailSupplier.cbu}</div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* KPI rápido */}
                  {(() => {
                    const prods = supplierProducts(detailSupplier)
                    const costTotal = supplierCostTotal(detailSupplier)
                    if (!prods.length) return null
                    return (
                      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                        <div style={{ flex: '1 1 100px', background: 'var(--surface2)', borderRadius: 10, padding: '10px 14px', textAlign: 'center' }}>
                          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--txt)' }}>{prods.length}</div>
                          <div style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 1 }}>Productos</div>
                        </div>
                        <div style={{ flex: '1 1 120px', background: 'var(--surface2)', borderRadius: 10, padding: '10px 14px', textAlign: 'center' }}>
                          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--money)' }}>{fmt(costTotal)}</div>
                          <div style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 1 }}>Costo total</div>
                        </div>
                      </div>
                    )
                  })()}

                  {/* Nota general del proveedor */}
                  {detailSupplier.notes ? (
                    <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '12px 14px', fontSize: 12, color: 'var(--txt2)', fontStyle: 'italic', borderLeft: '3px solid #F59E0B' }}>
                      {detailSupplier.notes}
                    </div>
                  ) : (
                    <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '12px 14px', fontSize: 12, color: 'var(--txt4)', fontStyle: 'italic', borderLeft: '3px solid var(--border)' }}>
                      <i className="fa fa-pencil" style={{ marginRight: 6 }} />Agrega notas sobre condiciones de pago o días de entrega...
                    </div>
                  )}
                </div>
              )}

              {/* TAB: Productos asociados */}
              {detailTab === 'productos' && (
                <div>
                  {supplierProducts(detailSupplier).length ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {supplierProducts(detailSupplier).map(p => (
                        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--surface2)', borderRadius: 8 }}>
                          <div style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--brand-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand)', fontSize: 12, flexShrink: 0 }}>
                            <i className="fa fa-cube" />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--txt)' }}>{p.name}</div>
                            <div style={{ fontSize: 10, color: 'var(--txt3)' }}>{p.cat}</div>
                          </div>
                          <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--money)' }}>{fmt(p.cost)}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: 24, color: 'var(--txt3)', fontSize: 12 }}>
                      <i className="fa fa-cube" style={{ marginRight: 5 }} />Sin productos asociados
                    </div>
                  )}
                </div>
              )}

              {/* TAB: Precios — histórico por producto */}
              {detailTab === 'precios' && (
                <div>
                  {supplierProducts(detailSupplier).length ? (
                    <>
                      <div style={{ fontSize: 11, color: 'var(--txt3)', marginBottom: 8 }}>
                        <i className="fa fa-circle-info" style={{ marginRight: 4 }} />
                        Registrá cambios de precio para detectar aumentos y comparar con otros proveedores.
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                        {supplierProducts(detailSupplier).map(p => {
                          const change = lastPriceChange(p)
                          const hist = productPriceHistory(p.id)
                          return (
                            <div key={p.id} style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--txt)' }}>{p.name}</div>
                                  <div style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 2 }}>
                                    {hist.length} cambio{hist.length !== 1 ? 's' : ''} registrado{hist.length !== 1 ? 's' : ''}
                                  </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                  <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--money)' }}>{fmt(p.cost)}</div>
                                  {change && (
                                    <div style={{ fontSize: 10, fontWeight: 700, color: change.pct > 0 ? '#DC2626' : '#16A34A', marginTop: 2 }}>
                                      <i className={`fa fa-arrow-${change.pct > 0 ? 'up' : 'down'}`} style={{ marginRight: 3 }} />
                                      {change.pct > 0 ? '+' : ''}{Number.isInteger(Math.round(change.pct * 10) / 10) ? Math.round(change.pct) : change.pct.toFixed(1)}%
                                    </div>
                                  )}
                                </div>
                                <button className="btn btn-ghost btn-xs" onClick={() => openPriceModal(p)} title="Registrar nuevo precio">
                                  <i className="fa fa-pen-to-square" />
                                </button>
                              </div>
                              {hist.length > 0 && (
                                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--border)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                  {hist.slice(0, 5).map((h, i) => {
                                    const pct = h.prevCost > 0 ? ((h.newCost - h.prevCost) / h.prevCost) * 100 : 0
                                    return (
                                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, color: 'var(--txt2)' }}>
                                        <i className="fa fa-clock" style={{ color: 'var(--txt4)' }} />
                                        <span style={{ color: 'var(--txt3)' }}>{h.date}</span>
                                        <span>{fmt(h.prevCost)} → <b>{fmt(h.newCost)}</b></span>
                                        <span style={{ color: pct > 0 ? '#DC2626' : '#16A34A', fontWeight: 700 }}>
                                          {pct > 0 ? '+' : ''}{Number.isInteger(Math.round(pct * 10) / 10) ? Math.round(pct) : pct.toFixed(1)}%
                                        </span>
                                        {h.note && <span style={{ color: 'var(--txt4)', fontStyle: 'italic' }}>· {h.note}</span>}
                                      </div>
                                    )
                                  })}
                                  {hist.length > 5 && (
                                    <div style={{ fontSize: 10, color: 'var(--txt4)' }}>...y {hist.length - 5} más</div>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </>
                  ) : (
                    <div style={{ textAlign: 'center', padding: 24, color: 'var(--txt3)', fontSize: 12 }}>
                      <i className="fa fa-tag" style={{ marginRight: 5 }} />Asociá productos a este proveedor para llevar histórico de precios.
                    </div>
                  )}
                </div>
              )}

              {/* TAB: Notas */}
              {detailTab === 'notas' && (
                <div>
                  {(detailSupplier.noteHistory || []).length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12, maxHeight: 280, overflowY: 'auto' }}>
                      {(detailSupplier.noteHistory || []).map((n, i) => (
                        <div key={i} style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px', borderLeft: '3px solid #F59E0B' }}>
                          <div style={{ fontSize: 12, color: 'var(--txt)', lineHeight: 1.5 }}>{n.text}</div>
                          <div style={{ fontSize: 9, color: 'var(--txt3)', marginTop: 3 }}><i className="fa fa-clock" style={{ marginRight: 3 }} />{n.date}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '16px 14px', marginBottom: 12, textAlign: 'center', color: 'var(--txt4)', fontSize: 12 }}>
                      <i className="fa fa-note-sticky" style={{ fontSize: 18, display: 'block', marginBottom: 6, opacity: .4 }} />
                      Agrega notas sobre condiciones de pago o días de entrega...
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input type="text" value={newNote} onChange={e => setNewNote(e.target.value)} onKeyDown={e => e.key === 'Enter' && addNote()}
                      placeholder="Escribí una nota sobre este proveedor..."
                      style={{ flex: 1, padding: '8px 12px', border: '1.5px solid var(--border)', borderRadius: 8, fontFamily: 'inherit', fontSize: 12, outline: 'none' }} />
                    <button className="btn btn-primary btn-sm" onClick={addNote} disabled={!newNote.trim()}><i className="fa fa-plus" /></button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL REGISTRAR NUEVO PRECIO */}
      {priceModal && (
        <div className="modal-bg open" style={{ zIndex: 700 }} onClick={e => { if (e.target === e.currentTarget) setPriceModal(null) }}>
          <div className="modal" style={{ maxWidth: 440 }}>
            <div className="mh">
              <h3>Registrar nuevo precio</h3>
              <button className="mclose" onClick={() => setPriceModal(null)}><i className="fa fa-xmark" /></button>
            </div>
            <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 12 }}>
              <div style={{ fontWeight: 700, color: 'var(--txt)' }}>{priceModal.product.name}</div>
              <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 2 }}>
                Costo actual: <b style={{ color: 'var(--money)' }}>{fmt(priceModal.product.cost)}</b>
              </div>
            </div>
            <div className="fg">
              <label>Nuevo costo *</label>
              <input type="number" min="0" step="0.01" value={priceForm.newCost}
                onChange={e => setPriceForm(f => ({ ...f, newCost: e.target.value }))}
                onFocus={e => e.target.select()}
                placeholder="0.00" autoFocus />
              {priceForm.newCost && Number(priceForm.newCost) > 0 && Number(priceModal.product.cost) > 0 && (
                (() => {
                  const pct = ((Number(priceForm.newCost) - Number(priceModal.product.cost)) / Number(priceModal.product.cost)) * 100
                  return (
                    <div style={{ fontSize: 11, marginTop: 4, color: pct > 0 ? '#DC2626' : pct < 0 ? '#16A34A' : 'var(--txt3)', fontWeight: 700 }}>
                      Variación: {pct > 0 ? '+' : ''}{Number.isInteger(Math.round(pct * 10) / 10) ? Math.round(pct) : pct.toFixed(1)}%
                    </div>
                  )
                })()
              )}
            </div>
            <div className="fg">
              <label>Nota (opcional)</label>
              <input type="text" value={priceForm.note}
                onChange={e => setPriceForm(f => ({ ...f, note: e.target.value }))}
                placeholder="Ej: aumento por dólar, lista nueva, etc." />
            </div>
            <div className="mfooter">
              <button className="btn btn-secondary" onClick={() => setPriceModal(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={savePriceChange}><i className="fa fa-floppy-disk" /> Guardar precio</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL IMPORTAR CSV */}
      {importModal && (
        <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) { setImportModal(false); setCsvPreview([]) } }}>
          <div className="modal" style={{ maxWidth: 680 }}>
            <div className="mh"><h3>Importar proveedores desde CSV</h3><button className="mclose" onClick={() => { setImportModal(false); setCsvPreview([]) }}><i className="fa fa-xmark" /></button></div>
            <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 11, color: 'var(--txt2)' }}>
              <b>Formato:</b> Nombre, Contacto, WhatsApp, Rubro, Email, Notas
            </div>
            <div className="fg">
              <label>Archivo CSV</label>
              <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFileSelect}
                style={{ padding: '8px 12px', border: '1.5px dashed var(--border)', borderRadius: 8, width: '100%', cursor: 'pointer', fontSize: 12 }} />
            </div>
            {csvPreview.length > 0 && (
              <>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt)', margin: '8px 0 6px' }}>
                  Vista previa ({csvPreview.length} registros)
                </div>
                <div style={{ maxHeight: 180, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
                  <table style={{ fontSize: 11 }}>
                    <thead><tr><th>Nombre</th><th>Contacto</th><th>WA</th><th>Rubro</th><th>Email</th></tr></thead>
                    <tbody>
                      {csvPreview.slice(0, 10).map((s, i) => (
                        <tr key={i}><td>{s.name}</td><td>{s.contact}</td><td>{s.wa}</td><td>{s.rubro}</td><td>{s.email}</td></tr>
                      ))}
                      {csvPreview.length > 10 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--txt3)' }}>...y {csvPreview.length - 10} más</td></tr>}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            <div className="mfooter">
              <button className="btn btn-secondary" onClick={() => { setImportModal(false); setCsvPreview([]) }}>Cancelar</button>
              <button className="btn btn-primary" onClick={doImport} disabled={!csvPreview.length}>
                <i className="fa fa-file-import" /> Importar {csvPreview.length}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
