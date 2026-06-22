import { useState, useEffect, useRef, useMemo } from 'react'
import { useData } from '../../context/DataContext'
import { useToast } from '../../context/ToastContext'
import { useConfirm } from '../../context/ConfirmContext'
import { fmt, cfg, db, dbW } from '../../lib/storage'
import { supabase } from '../../lib/supabase'

export default function Proveedores() {
  const { get, set, saveEntity, deleteEntity } = useData()
  const toast   = useToast()
  const confirm = useConfirm()
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(false)
  const [importModal, setImportModal] = useState(false)
  const [detailSupplier, setDetailSupplier] = useState(null)
  const [detailTab, setDetailTab] = useState('info')
  const [viewMode, setViewMode] = useState('table')
  const [loading, setLoading] = useState(true)
  const [dismissed, setDismissed] = useState(() => db('provAlertsDismissed', {}))
  const persistDismissed = (next) => {
    setDismissed(next)
    dbW('provAlertsDismissed', next)
  }
  const dismissAlert = (key) => persistDismissed({ ...dismissed, [key]: Date.now() })
  const restoreAlerts = () => persistDismissed({})
  const [form, setForm] = useState({ name: '', contact: '', wa: '', rubro: '', email: '', notes: '', cuit: '', ivaCondition: '', paymentTerm: '', cbu: '', leadTime: '' })
  const [newNote, setNewNote] = useState('')
  const fileRef = useRef(null)
  const [csvPreview, setCsvPreview] = useState([])
  const [isDragging, setIsDragging] = useState(false)
  const [priceModal, setPriceModal] = useState(null)
  const [priceForm, setPriceForm] = useState({ newCost: '', note: '' })
  const [reorderOpen, setReorderOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [importTab, setImportTab] = useState('archivo')
  const [pasteNums, setPasteNums] = useState('')

  useEffect(() => { const t = setTimeout(() => setLoading(false), 80); return () => clearTimeout(t) }, [])

  // Auto-fix: dedupe + corrige rubro/email invertidos (one-time migration, idempotente)
  // SEGURO: usa `set` de DataContext (tiene userId correcto), sin reload ni dbW directo
  useEffect(() => {
    if (db('provMigV3', null) === 'done') return

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
    dbW('provMigV3', 'done')

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

  /* ── Precompute: product lookup by supplier id — O(N_products) once, O(1) per row ── */
  const productsBySupplier = useMemo(() => {
    const map = new Map()
    products.forEach(p => {
      const sid = String(p.supplierId)
      if (!map.has(sid)) map.set(sid, [])
      map.get(sid).push(p)
    })
    return map
  }, [products])

  /* ── Search filter — only re-runs when suppliers or search changes ── */
  const filtered = useMemo(() => {
    if (!search) return suppliers
    const sq = search.toLowerCase()
    return suppliers.filter(s =>
      (s.name || '').toLowerCase().includes(sq) || (s.contact || '').toLowerCase().includes(sq) || (s.rubro || '').toLowerCase().includes(sq)
    )
  }, [suppliers, search])

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const openEdit = (s) => { setDetailSupplier(null); setForm(s ? { ...s } : { name: '', contact: '', wa: '', rubro: '', email: '', notes: '', cuit: '', ivaCondition: '', paymentTerm: '', cbu: '', leadTime: '' }); setModal(true) }
  const save = () => {
    if (!form.name) { toast('Ingresá el nombre del proveedor.', 'er'); return }
    saveEntity('suppliers', form); setModal(false); toast('Proveedor guardado', 'ok')
    if (detailSupplier && form.id === detailSupplier.id) setDetailSupplier({ ...detailSupplier, ...form })
  }
  const del = (id) => confirm('¿Eliminar proveedor?', () => {
    deleteEntity('suppliers', id); toast('Proveedor eliminado', 'in')
    if (detailSupplier?.id === id) setDetailSupplier(null)
  })

  /* ── Helper: O(1) lookup using the precomputed map ── */
  const supplierProducts = (s) => productsBySupplier.get(String(s.id)) || []

  /* ── Re-orden: low-stock products grouped by supplier ── */
  const { allLowStockBySupplier, totalLowStock } = useMemo(() => {
    const groups = []
    suppliers.forEach(s => {
      const items = (productsBySupplier.get(String(s.id)) || []).filter(p => p.minStock > 0 && (p.stock || 0) <= p.minStock)
      if (items.length) groups.push({ s, items })
    })
    groups.sort((a, b) => b.items.length - a.items.length)
    const total = groups.reduce((sum, g) => sum + g.items.length, 0)
    return { allLowStockBySupplier: groups, totalLowStock: total }
  }, [suppliers, productsBySupplier])

  const sendReorderWA = (s, items) => {
    if (!s.wa) { toast('Esta proveedora no tiene WhatsApp cargado', 'er'); return }
    const num = s.wa.replace(/\D/g, '')
    const lines = items.map(p => `• ${p.name} — necesito reponer (stock: ${p.stock || 0}, mín: ${p.minStock})`).join('\n')
    const text = `Hola ${s.contact || s.name}, te paso pedido de reposición:\n\n${lines}\n\nGracias!`
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(text)}`, '_blank')
  }

  /* ── Concentración de compras ── */
  const concentration = useMemo(() => {
    if (!suppliers.length || !products.length) return null
    const counts = suppliers
      .map(s => ({ s, n: (productsBySupplier.get(String(s.id)) || []).length }))
      .filter(x => x.n > 0)
      .sort((a, b) => b.n - a.n)
    if (!counts.length) return null
    const total = counts.reduce((sum, x) => sum + x.n, 0)
    const top = counts[0]
    const top3 = counts.slice(0, 3).reduce((sum, x) => sum + x.n, 0)
    return { topName: top.s.name, topPct: (top.n / total) * 100, top3Pct: (top3 / total) * 100, total }
  }, [suppliers, products.length, productsBySupplier])

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

  /* ── Precompute last-activity map — one O(N_suppliers × N_budgets) pass → O(1) per row ── */
  const lastActivityBySupplierId = useMemo(() => {
    const map = new Map()
    suppliers.forEach(s => {
      const prods = productsBySupplier.get(String(s.id)) || []
      if (!prods.length) { map.set(s.id, null); return }
      const prodNames = new Set(prods.map(p => p.name))
      let maxDate = 0
      budgets.forEach(b => {
        if (!b.date) return
        if (b.items?.some(it => prodNames.has(it.name))) {
          const t = new Date(b.date).getTime()
          if (t > maxDate) maxDate = t
        }
      })
      map.set(s.id, maxDate > 0 ? Math.floor((Date.now() - maxDate) / 86400000) : null)
    })
    return map
  }, [suppliers, productsBySupplier, budgets])

  const supplierLastActivity = (s) => lastActivityBySupplierId.get(s.id) ?? null

  const processFile = (file) => {
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
          parsed.push({ name: parts[0] || '', contact: parts[1] || '', wa: parts[2] || '', email: parts[3] || '', rubro: parts[4] || '', notes: parts[5] || '' })
        }
      }
      setCsvPreview(parsed)
    }
    reader.readAsText(file, 'UTF-8')
  }
  const handleFileSelect = (e) => processFile(e.target.files?.[0])

  const downloadTemplate = () => {
    const csv = 'sep=,\nNombre,Contacto,WhatsApp,Email,Rubro,Notas\n"Mi Proveedor S.A.","Juan García","1112345678","juan@proveedor.com","Textiles","Sin notas"\n"Otro Proveedor","Ana Martínez","1187654321","ana@proveedor.com","Packaging",""'
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'plantilla-proveedores.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  const doImport = () => {
    csvPreview.forEach(s => saveEntity('suppliers', { ...s }))
    toast(`${csvPreview.length} proveedores importados`, 'ok')
    setCsvPreview([]); setImportModal(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const closeImportModal = () => {
    setImportModal(false); setCsvPreview([]); setImportTab('archivo'); setPasteNums('')
    if (fileRef.current) fileRef.current.value = ''
  }

  /* ── Parsear números pegados: flexible (nombre + número, solo número, etc.) ── */
  const parsePastedNums = (raw) => {
    const results = []
    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean)
    for (const line of lines) {
      const m = line.match(/[\d][\d\s\-.()]{6,18}[\d]/)
      if (!m) {
        const name = line.replace(/^\d+[.)]\s*/, '').trim()
        if (name.length >= 2) results.push({ name, contact: name, wa: '', email: '', rubro: '', notes: '' })
        continue
      }
      let wa = m[0].replace(/[\s\-.() ]/g, '')
      wa = wa.replace(/^00549?/, '').replace(/^549/, '').replace(/^54/, '').replace(/^0/, '')
      let name = line.replace(m[0], '').replace(/[-–—,;:|[\](){}]+/g, ' ').replace(/\s+/g, ' ').trim()
      name = name || `Proveedor ${wa.slice(-4)}`
      results.push({ name, contact: name, wa, email: '', rubro: '', notes: '' })
    }
    return results
  }
  const parsedPaste = parsePastedNums(pasteNums)

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
        if (importModal) { closeImportModal(); return }
        if (detailSupplier) { setDetailSupplier(null); return }
      }
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [modal, importModal, detailSupplier])

  const openDetail = (s) => { setDetailSupplier(s); setDetailTab('info') }

  /* ── Bulk selection ── */
  const isAllSelected = filtered.length > 0 && filtered.every(s => selectedIds.has(s.id))
  const toggleSelect = (id) => setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleSelectAll = () => setSelectedIds(isAllSelected ? new Set() : new Set(filtered.map(s => s.id)))
  const bulkDelete = () => {
    confirm({ body: `¿Eliminar ${selectedIds.size} proveedor(es)?`, danger: true, confirmLabel: 'Eliminar' }, () => {
      selectedIds.forEach(id => deleteEntity('suppliers', id))
      toast(`${selectedIds.size} proveedores eliminados`, 'ok')
      if (detailSupplier && selectedIds.has(detailSupplier.id)) setDetailSupplier(null)
      setSelectedIds(new Set())
    })
  }
  const bulkExportCSV = () => {
    const sel = suppliers.filter(s => selectedIds.has(s.id))
    const rows = [['Nombre','Contacto','WhatsApp','Rubro','Email','Notas'].join(',')]
    sel.forEach(s => rows.push([s.name,s.contact,s.wa,s.rubro,s.email,s.notes].map(v => `"${(v||'').replace(/"/g,'""')}"`).join(',')))
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'proveedores-seleccion.csv'; a.click()
    toast(`${sel.length} proveedores exportados`, 'ok')
  }
  const bulkCopyWA = () => {
    const nums = suppliers.filter(s => selectedIds.has(s.id) && s.wa).map(s => s.wa)
    if (!nums.length) { toast('Ninguno tiene WhatsApp', 'warn'); return }
    navigator.clipboard.writeText(nums.join('\n')).then(() => toast(`${nums.length} números copiados`, 'ok'))
  }
  const bulkMailto = () => {
    const emails = suppliers.filter(s => selectedIds.has(s.id) && s.email).map(s => s.email)
    if (!emails.length) { toast('Ninguno tiene email', 'warn'); return }
    window.open(`mailto:?bcc=${emails.join(',')}`)
    toast(`Email abierto con ${emails.length} destinatarios`, 'ok')
  }

  /* ── Generar link de portal para la proveedora ── */
  const sharePortalLink = async (s) => {
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

    // Short-link: payload en Supabase + id corto. Fallback al link largo (?d=).
    let url
    try {
      const id = (crypto?.randomUUID?.() || (Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2))).replace(/-/g, '').slice(0, 16)
      const { error } = await supabase.from('portal_links').insert({ id, payload, expires_at: new Date(payload.e).toISOString() })
      if (error) throw error
      url = `${window.location.origin}/portal-proveedor?id=${id}`
    } catch {
      const json = JSON.stringify(payload)
      const b64 = btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
      url = `${window.location.origin}/portal-proveedor?d=${b64}`
    }

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
      <div className="ph zt-ph">
        <div className="ph-right" style={{ gap: 6 }}>
          <div className="cli-pill-group">
            <button className="cli-pill" onClick={() => setImportModal(true)}>
              <i className="fa fa-file-import" /><span>Importar</span>
            </button>
            <button className="cli-pill" onClick={exportCSV}>
              <i className="fa fa-download" /><span>Exportar</span>
            </button>
          </div>
          <button className="cli-pill-new" onClick={() => openEdit()}>
            <i className="fa fa-plus" /><span>Nuevo</span>
          </button>
        </div>
      </div>
      <div className="pill-row">
        <div className="search-row zt-search-row"><i className="fa fa-magnifying-glass" /><input type="text" placeholder="Buscar proveedor, rubro..." value={search} onChange={e => setSearch(e.target.value)} /></div>
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

      <style>{`
        .zt-tbl{max-width:1100px;margin:0 auto}
        .zt-tbl table{width:100%;border-collapse:separate;border-spacing:0;table-layout:fixed}
        .zt-tbl thead th{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--txt3);padding:8px 8px;white-space:nowrap}
        .zt-tbl thead tr{border-bottom:1px solid var(--border)}
        .zt-tbl tbody td{padding:9px 8px;font-size:13px;vertical-align:middle}
        .zt-tbl tbody tr{cursor:pointer;transition:background .12s}
        .zt-tbl tbody tr:hover{background:#F8FAFC}
        .zt-chk{appearance:none;-webkit-appearance:none;width:16px;height:16px;border-radius:50%;border:1.5px solid #D1D5DB;background:transparent;cursor:pointer;position:relative;display:block;margin:auto;transition:border-color .12s,background .12s}
        .zt-chk:hover{border-color:var(--brand)}
        .zt-chk:checked{border-color:var(--brand);background:var(--brand)}
        .zt-chk:checked::after{content:'';position:absolute;top:2px;left:5px;width:4px;height:7px;border:2px solid #fff;border-top:none;border-left:none;transform:rotate(42deg)}
        .zt-acts{opacity:.6;transition:opacity .15s;display:flex;align-items:center;gap:4px;justify-content:flex-end}
        .zt-tbl tbody tr:hover .zt-acts{opacity:1}
        .zt-icon-btn{width:28px;height:28px;border-radius:8px;border:none;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;font-size:13px;font-family:inherit;transition:transform .12s}
        .zt-icon-btn:hover{transform:scale(1.1)}
        .zt-ci{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:8px;font-size:16px;text-decoration:none;transition:transform .12s,opacity .15s;opacity:.45}
        .zt-tbl tbody tr:hover .zt-ci{opacity:1}
        .zt-ci:hover{transform:scale(1.12)}
        .zt-ph{align-items:center!important}
        .zt-search-row{background:#F9FAFB!important;border:1px solid #E5E7EB!important;box-shadow:none!important;height:34px!important;border-radius:9999px!important}
        .pill-row .pill{height:34px!important;border-radius:9999px!important;display:inline-flex!important;align-items:center!important;justify-content:center!important}
        .cli-pill-group{display:inline-flex;align-items:center;gap:6px}
        .cli-pill{display:inline-flex;align-items:center;gap:6px;height:44px;padding:0 18px;border-radius:9999px;border:1.5px solid var(--border);background:var(--surface);color:var(--txt2);font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;line-height:1;white-space:nowrap;-webkit-tap-highlight-color:transparent;transition:all .15s}
        .cli-pill:hover{border-color:var(--brand);color:var(--brand);background:var(--brand-xlt)}
        .cli-pill:active{transform:scale(.95)}
        .cli-pill i{font-size:12px}
        .cli-pill-new{display:inline-flex;align-items:center;gap:6px;height:44px;padding:0 20px;border-radius:9999px;border:none;background:var(--color-principal);color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;line-height:1;white-space:nowrap;-webkit-tap-highlight-color:transparent;transition:all .18s;box-shadow:0 4px 14px var(--brand-dim)}
        .cli-pill-new:hover{filter:brightness(1.08);transform:translateY(-1px)}
        .cli-pill-new:active{transform:scale(.95)}
        .cli-pill-new i{font-size:11px}
        /* ── TARJETAS MÓVILES PROVEEDORES ── */
        .prov-mob-list{display:none;flex-direction:column}
        .prov-mob-card{display:flex;align-items:center;gap:8px;padding:11px 0;border-bottom:1px solid var(--border);cursor:pointer;-webkit-tap-highlight-color:transparent;transition:background .1s}
        .prov-mob-card:active{background:var(--surface2)}
        .prov-mob-card:last-child{border-bottom:none}
        .prov-mob-id{flex:1;min-width:0;display:flex;align-items:center;gap:7px}
        .prov-mob-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
        .prov-mob-id-text{min-width:0;flex:1}
        .prov-mob-name{font-weight:700;font-size:13px;color:var(--txt);line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .prov-mob-contact{font-size:11px;color:#6B7280;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .prov-mob-mid{flex-shrink:0;width:76px;display:flex;flex-direction:column;align-items:center;gap:4px}
        .prov-mob-cicons{display:flex;gap:5px}
        .prov-mob-ci{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:8px;font-size:14px;text-decoration:none;-webkit-tap-highlight-color:transparent;transition:opacity .15s}
        .prov-mob-ci:active{opacity:.7}
        .prov-mob-ci-wa{background:#DCFCE7;color:#16A34A}
        .prov-mob-ci-mail{background:#EFF6FF;color:#2563EB}
        .prov-mob-ci-ph{display:inline-block;width:28px;height:28px}
        .prov-mob-prods{font-size:10.5px;font-weight:600;color:var(--txt3);line-height:1;text-align:center;white-space:nowrap}
        .prov-mob-acts{flex-shrink:0;display:flex;gap:4px;align-items:center}
        .prov-mob-act{width:34px;height:34px;border-radius:9px;border:none;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;font-size:13px;font-family:inherit;background:var(--surface2);color:var(--txt2);-webkit-tap-highlight-color:transparent;transition:transform .1s,background .12s}
        .prov-mob-act:active{transform:scale(0.88)}
        .prov-mob-act-del{background:#FEF2F2!important;color:#DC2626!important}
        @media(max-width:640px){.prov-desk-only{display:none!important}.prov-mob-list{display:flex}.prov-ph-title{display:none!important}.cli-pill{padding:7px 9px}.cli-pill-new{padding:7px 12px}}
        @media(min-width:641px){.prov-mob-list{display:none!important}}
      `}</style>
      {/* LISTA MÓVIL */}
      <div className="prov-mob-list">
        {loading ? [1,2,3,4].map(i => (
          <div key={i} className="prov-mob-card" style={{ cursor: 'default' }}>
            <div className="prov-mob-id">
              <span className="prov-mob-dot" style={{ background: '#E5E7EB' }} />
              <div className="prov-mob-id-text">
                <div className="sk sk-text" style={{ height: 13, width: '55%', marginBottom: 5 }} />
                <div className="sk sk-text" style={{ height: 11, width: '35%' }} />
              </div>
            </div>
            <div className="prov-mob-mid">
              <div className="prov-mob-cicons">
                <span className="prov-mob-ci-ph" style={{ background: '#F3F4F6', borderRadius: 8 }} />
                <span className="prov-mob-ci-ph" style={{ background: '#F3F4F6', borderRadius: 8 }} />
              </div>
              <div className="sk sk-text" style={{ height: 10, width: 40 }} />
            </div>
            <div className="prov-mob-acts">
              <div style={{ width: 34, height: 34, borderRadius: 9, background: '#F3F4F6' }} />
              <div style={{ width: 34, height: 34, borderRadius: 9, background: '#F3F4F6' }} />
            </div>
          </div>
        )) : filtered.length ? filtered.map(s => {
          const days = supplierLastActivity(s)
          const dotColor = days === null ? '#CBD5E1' : days <= 30 ? '#16A34A' : days <= 90 ? '#D97706' : '#DC2626'
          const np = supplierProducts(s).length
          return (
            <div key={s.id} className="prov-mob-card" onClick={() => openDetail(s)}>
              <div className="prov-mob-id">
                <span className="prov-mob-dot" style={{ background: dotColor }} />
                <div className="prov-mob-id-text">
                  <div className="prov-mob-name">{s.name}</div>
                  {s.contact && <div className="prov-mob-contact">{s.contact}</div>}
                </div>
              </div>
              <div className="prov-mob-mid" onClick={e => e.stopPropagation()}>
                <div className="prov-mob-cicons">
                  {s.wa
                    ? <a href={`https://wa.me/${s.wa.replace(/\D/g,'')}`} target="_blank" rel="noopener noreferrer" className="prov-mob-ci prov-mob-ci-wa" onClick={e => e.stopPropagation()}><i className="fa-brands fa-whatsapp" /></a>
                    : <span className="prov-mob-ci-ph" />}
                  {s.email
                    ? <a href={`mailto:${s.email}`} className="prov-mob-ci prov-mob-ci-mail" onClick={e => e.stopPropagation()}><i className="fa fa-envelope" /></a>
                    : <span className="prov-mob-ci-ph" />}
                </div>
                <div className="prov-mob-prods">{np} prod{np !== 1 ? 's.' : '.'}</div>
              </div>
              <div className="prov-mob-acts" onClick={e => e.stopPropagation()} style={{ display:'flex',gap:5,alignItems:'center',flexShrink:0 }}>
                <button title="Editar" onClick={() => openEdit(s)} style={{ width:30,height:30,borderRadius:'50%',border:'1.5px solid var(--border2)',background:'var(--surface2)',color:'var(--txt2)',cursor:'pointer',fontSize:11,display:'inline-flex',alignItems:'center',justifyContent:'center',flexShrink:0,padding:0,WebkitTapHighlightColor:'transparent' }}><i className="fa fa-pen" /></button>
                <button title="Eliminar" onClick={() => del(s.id)} style={{ width:30,height:30,borderRadius:'50%',border:'1.5px solid #FECACA',background:'#FEF2F2',color:'#DC2626',cursor:'pointer',fontSize:11,display:'inline-flex',alignItems:'center',justifyContent:'center',flexShrink:0,padding:0,WebkitTapHighlightColor:'transparent' }}><i className="fa fa-trash" /></button>
              </div>
            </div>
          )
        }) : (
          <div className="empty"><div className="ico"><i className="fa fa-industry" /></div><h4>Sin proveedores</h4></div>
        )}
      </div>
      <div className="prov-desk-only">
      {viewMode === 'table' ? (
        <div className="tbl-card zt-tbl">
          <table>
            <colgroup>
              <col style={{ width: 36 }} />
              <col style={{ width: 240 }} />
              <col style={{ width: 40 }} />
              <col style={{ width: 40 }} />
              <col style={{ width: 160 }} />
              <col style={{ width: 120 }} />
              <col style={{ width: 110 }} />
            </colgroup>
            <thead><tr>
              <th onClick={e => e.stopPropagation()} style={{ cursor:'default' }}><input type="checkbox" className="zt-chk" checked={isAllSelected} onChange={toggleSelectAll} /></th>
              <th style={{ textAlign: 'left' }}>Proveedor / Contacto</th>
              <th style={{ textAlign: 'center' }} title="WhatsApp"><i className="fa-brands fa-whatsapp" style={{ color: '#6B7280', fontSize: 13 }} /></th>
              <th style={{ textAlign: 'center' }} title="Email"><i className="fa fa-envelope" style={{ color: '#6B7280', fontSize: 12 }} /></th>
              <th style={{ textAlign: 'left' }} className="col-hide-mobile">Rubro</th>
              <th style={{ textAlign: 'left' }}>Prods.</th>
              <th style={{ textAlign: 'right' }}>Acciones</th>
            </tr></thead>
            <tbody>
              {loading ? [1,2,3,4,5].map(i => (
                <tr key={i}><td colSpan={7}><div className="sk sk-text" style={{ height: 16, width: `${55 + Math.random() * 35}%` }} /></td></tr>
              )) : filtered.length ? filtered.map(s => (
                <tr key={s.id} onClick={() => openDetail(s)} style={{ background: selectedIds.has(s.id) ? 'rgba(124,58,237,.06)' : undefined }}>
                  <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                    <input type="checkbox" className="zt-chk" checked={selectedIds.has(s.id)} onChange={() => toggleSelect(s.id)} />
                  </td>
                  <td>
                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--txt)', lineHeight: 1.3 }}>{s.name}</div>
                    {s.contact && <div style={{ fontSize: 11, color: '#6B7280', marginTop: 1 }}>{s.contact}</div>}
                  </td>
                  <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                    {s.wa ? (
                      <a href={`https://wa.me/${s.wa.replace(/\D/g,'')}`} target="_blank" rel="noopener noreferrer" title={s.wa}
                        className="zt-ci" style={{ background: '#DCFCE7', color: '#16A34A' }}>
                        <i className="fa-brands fa-whatsapp" />
                      </a>
                    ) : <span style={{ color: 'var(--txt4)', fontSize: 11 }}>—</span>}
                  </td>
                  <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                    {s.email ? (
                      <a href={`mailto:${s.email}`} title={s.email}
                        className="zt-ci" style={{ background: '#EFF6FF', color: '#2563EB' }}>
                        <i className="fa fa-envelope" />
                      </a>
                    ) : <span style={{ color: 'var(--txt4)', fontSize: 11 }}>—</span>}
                  </td>
                  <td className="col-hide-mobile" style={{ textAlign: 'left' }}>
                    {s.rubro
                      ? <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--txt2)' }}>{s.rubro}</span>
                      : <span style={{ color: 'var(--txt4)', fontSize: 11 }}>—</span>}
                  </td>
                  <td style={{ textAlign: 'left' }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--txt2)', fontVariantNumeric: 'tabular-nums' }}>{supplierProducts(s).length}</span>
                  </td>
                  <td onClick={e => e.stopPropagation()}>
                    <div className="zt-acts">
                      <button title="Editar" style={{ width:28,height:28,borderRadius:'50%',border:'1.5px solid var(--border2)',background:'var(--surface2)',color:'var(--txt2)',cursor:'pointer',fontSize:11,display:'inline-flex',alignItems:'center',justifyContent:'center',padding:0,flexShrink:0,transition:'all .15s' }} onClick={() => openEdit(s)}>
                        <i className="fa fa-pen" />
                      </button>
                      <button title="Eliminar" style={{ width:28,height:28,borderRadius:'50%',border:'1.5px solid #FECACA',background:'#FEF2F2',color:'#DC2626',cursor:'pointer',fontSize:11,display:'inline-flex',alignItems:'center',justifyContent:'center',padding:0,flexShrink:0,transition:'all .15s' }} onClick={() => del(s.id)}>
                        <i className="fa fa-trash" />
                      </button>
                    </div>
                  </td>
                </tr>
              )) : <tr><td colSpan={7}><div className="empty"><div className="ico"><i className="fa fa-industry" /></div><h4>Sin proveedores</h4><p>Agregá tu primer proveedor</p></div></td></tr>}
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
                {(() => { const np = supplierProducts(s).length; return <span style={{ fontSize: 10, color: 'var(--txt3)' }}>{np} producto{np !== 1 ? 's' : ''}</span> })()}
                <div className="acts" onClick={e => e.stopPropagation()} style={{ display:'flex',gap:5 }}>
                  <button onClick={() => openEdit(s)} title="Editar" style={{ width:28,height:28,borderRadius:'50%',border:'1.5px solid var(--border2)',background:'var(--surface2)',color:'var(--txt2)',cursor:'pointer',fontSize:11,display:'inline-flex',alignItems:'center',justifyContent:'center',padding:0,flexShrink:0 }}><i className="fa fa-pen" /></button>
                  <button onClick={() => del(s.id)} title="Eliminar" style={{ width:28,height:28,borderRadius:'50%',border:'1.5px solid #FECACA',background:'#FEF2F2',color:'#DC2626',cursor:'pointer',fontSize:11,display:'inline-flex',alignItems:'center',justifyContent:'center',padding:0,flexShrink:0 }}><i className="fa fa-trash" /></button>
                </div>
              </div>
            </div>
          )) : <div className="empty" style={{ gridColumn: '1/-1' }}><div className="ico"><i className="fa fa-industry" /></div><h4>Sin proveedores</h4></div>}
        </div>
      )}
      </div>

      <div style={{ marginTop: 8, fontSize: 11, color: 'var(--txt3)' }}>{filtered.length} proveedor{filtered.length !== 1 ? 'es' : ''}</div>

      {/* MODAL EDITAR */}
      {modal && (
        <div className="modal-bg open" style={{ zIndex: 700 }} onClick={e => { if (e.target === e.currentTarget) setModal(false) }}>
          <div className="modal-form-card" style={{ maxWidth: 620 }}
            onKeyDown={e => { if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && form.name && form.name.trim()) save() }}>

            {/* Header fijo */}
            <div style={{ padding: '18px 28px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <div className="mh" style={{ margin: 0, paddingBottom: 0, borderBottom: 'none' }}>
                <h3>{form.id ? 'Editar' : 'Agregar'} proveedor</h3>
                <button className="mclose" onClick={() => setModal(false)}><i className="fa fa-xmark" /></button>
              </div>
            </div>

            {/* Body scrollable */}
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '18px 28px 4px', WebkitOverflowScrolling: 'touch' }}>
              <div className="grid2">
                <div className="fg"><label>Nombre *</label><input type="text" value={form.name} onChange={e => setF('name', e.target.value)} placeholder="Proveedor S.A." autoFocus /></div>
                <div className="fg"><label>Contacto</label><input type="text" value={form.contact} onChange={e => setF('contact', e.target.value)} /></div>
                <div className="fg"><label>WhatsApp</label><input type="text" value={form.wa} onChange={e => setF('wa', e.target.value)} /></div>
                <div className="fg">
                  <label>Email <span style={{ color: 'var(--txt4)', fontWeight: 400, fontSize: 10 }}>(contacto@empresa.com)</span></label>
                  <input type="email" value={form.email} onChange={e => setF('email', e.target.value)} placeholder="contacto@proveedor.com" />
                </div>
              </div>
              <div className="fg">
                <label>Rubro <span style={{ color: 'var(--txt4)', fontWeight: 400, fontSize: 10 }}>(ej: Textil, Packaging, Alimentos)</span></label>
                <input type="text" value={form.rubro} onChange={e => setF('rubro', e.target.value)} placeholder="Categoría / industria" />
                {form.rubro && form.rubro.includes('@') && (
                  <div style={{ fontSize: 10.5, color: '#DC2626', marginTop: 3, fontWeight: 600 }}>
                    ⚠ Esto parece un email — usá el campo "Email" arriba
                  </div>
                )}
              </div>

              <div style={{ borderTop: '1px solid var(--border)', margin: '16px 0 12px', paddingTop: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                  <div style={{ width: 24, height: 24, borderRadius: 7, background: 'var(--brand-xlt)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className="fa fa-landmark" style={{ color: 'var(--brand)', fontSize: 10 }} />
                  </div>
                  <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Datos fiscales y operativos</span>
                </div>
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
                  <div className="fg"><label>Plazo de pago (días)</label><input type="number" min="0" value={form.paymentTerm} onChange={e => setF('paymentTerm', e.target.value)} placeholder="30" style={{ maxWidth: 100 }} /></div>
                  <div className="fg"><label>Lead time entrega (días)</label><input type="number" min="0" value={form.leadTime} onChange={e => setF('leadTime', e.target.value)} placeholder="7" style={{ maxWidth: 100 }} /></div>
                </div>
                <div className="fg"><label>CBU / Alias</label><input type="text" value={form.cbu} onChange={e => setF('cbu', e.target.value)} placeholder="0000000000000000000000 o ALIAS.PROVEEDOR" /></div>
              </div>

              <div className="fg"><label>Notas internas</label><textarea value={form.notes} onChange={e => setF('notes', e.target.value)} rows={3} placeholder="Condiciones especiales, recordatorios, acuerdos comerciales..." /></div>
            </div>

            {/* Footer fijo */}
            <div style={{ flexShrink: 0, position: 'sticky', bottom: 0, borderTop: '1px solid var(--border)', padding: '14px 28px 20px', background: 'var(--surface)', display: 'flex', gap: 10, justifyContent: 'flex-end', zIndex: 5 }}>
              <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={save}><i className="fa fa-floppy-disk" /> Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* FICHA DETALLE CON PESTAÑAS */}
      {detailSupplier && (
        <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) setDetailSupplier(null) }}>
          <div className="modal-form-card cli-detail-card" style={{ width: '100%', maxWidth: 860, maxHeight: '95vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 50, height: 50, borderRadius: '50%', background: 'linear-gradient(135deg, #F59E0B 0%, #EF4444 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                    {(detailSupplier.name || '?')[0].toUpperCase()}
                  </div>
                  <div>
                    <h3 style={{ fontSize: 18, fontWeight: 900, color: 'var(--txt)', letterSpacing: '-.4px', margin: 0, lineHeight: 1.2 }}>{detailSupplier.name}</h3>
                    {detailSupplier.contact && (
                      <div style={{ fontSize: 13, color: 'var(--txt3)', marginTop: 3 }}>
                        {detailSupplier.contact}{detailSupplier.rubro ? <span style={{ color: 'var(--txt4)' }}> · {detailSupplier.rubro}</span> : ''}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => sharePortalLink(detailSupplier)} title="Genera un link público con resumen para la proveedora">
                    <i className="fa fa-share-nodes" /> Compartir portal
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => openEdit(detailSupplier)}><i className="fa fa-pen" /> Editar</button>
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
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '20px 24px', WebkitOverflowScrolling: 'touch' }}>

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

      {/* MODAL IMPORTAR */}
      {importModal && (
        <div className="modal-bg open" style={{ alignItems: 'flex-end', padding: 0 }} onClick={e => { if (e.target === e.currentTarget) closeImportModal() }}>
          <div style={{ width: '100%', maxWidth: 640, background: 'var(--surface)', borderRadius: '20px 20px 0 0', display: 'flex', flexDirection: 'column', maxHeight: '92dvh', overflow: 'hidden', boxShadow: '0 -8px 40px rgba(0,0,0,.18)', animation: 'slideUp .25s cubic-bezier(.32,.72,0,1) both' }}>
            {/* Handle */}
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10, paddingBottom: 4, flexShrink: 0 }}>
              <div style={{ width: 36, height: 4, borderRadius: 4, background: 'var(--border2)' }} />
            </div>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 20px 12px', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 38, height: 38, borderRadius: 12, background: 'var(--brand-xlt)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand)', fontSize: 17 }}>
                  <i className="fa fa-truck" />
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-.3px' }}>Importar proveedores</div>
                  <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 1 }}>Subí un archivo o pegá los números directo</div>
                </div>
              </div>
              <button className="mclose" onClick={closeImportModal}><i className="fa fa-xmark" /></button>
            </div>
            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              {[
                { id: 'archivo', icon: 'fa-cloud-arrow-up', label: 'Subir archivo' },
                { id: 'pegar',   icon: 'fa-paste',          label: 'Pegar números' },
              ].map(t => (
                <button key={t.id} onClick={() => { setImportTab(t.id); setCsvPreview([]); setPasteNums('') }}
                  style={{ flex: 1, padding: '11px 4px', fontSize: 13, fontWeight: importTab === t.id ? 700 : 500, color: importTab === t.id ? 'var(--brand)' : 'var(--txt3)', background: 'none', border: 'none', borderBottom: importTab === t.id ? '2.5px solid var(--brand)' : '2.5px solid transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, transition: 'all .15s', marginBottom: -1 }}>
                  <i className={`fa ${t.icon}`} style={{ fontSize: 14 }} /> {t.label}
                </button>
              ))}
            </div>

            {/* Body — scrollable, SIN altura fija */}
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '20px 20px 8px', WebkitOverflowScrolling: 'touch' }}>

              {/* ── TAB: Subir archivo ── */}
              {importTab === 'archivo' && (<>
                {/* Tips compactos — 1 fila horizontal */}
                {csvPreview.length === 0 && (
                  <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                    {[
                      { icon: 'fa-brands fa-whatsapp', icoColor: '#25D366', bg: 'rgba(37,211,102,.07)', border: 'rgba(37,211,102,.25)', label: 'Contactos .vcf', sub: 'App Contactos → Compartir' },
                      { icon: 'fa-brands fa-whatsapp', icoColor: '#25D366', bg: 'rgba(37,211,102,.05)', border: 'rgba(37,211,102,.18)', label: 'Chat WA .txt', sub: '⋮ Más → Exportar chat' },
                      { icon: 'fa-file-csv', icoColor: '#0F9D58', bg: 'var(--surface2)', border: 'var(--border)', label: 'Planilla CSV', action: downloadTemplate },
                    ].map((t, i) => (
                      <div key={i} onClick={t.action || undefined} style={{ flex: '1 1 130px', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: t.bg, border: `1px solid ${t.border}`, cursor: t.action ? 'pointer' : 'default', transition: 'opacity .15s' }}
                        onMouseEnter={e => t.action && (e.currentTarget.style.opacity = '.8')} onMouseLeave={e => t.action && (e.currentTarget.style.opacity = '1')}>
                        <div style={{ width: 32, height: 32, borderRadius: 9, background: `${t.icoColor}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <i className={t.icon} style={{ color: t.icoColor, fontSize: 15 }} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.label}</div>
                          <div style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 1 }}>{t.action ? '⬇ Descargar plantilla' : t.sub}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {/* Drop zone */}
                {csvPreview.length === 0 && (
                  <>
                    <div
                      onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
                      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setIsDragging(false) }}
                      onDrop={e => { e.preventDefault(); setIsDragging(false); processFile(e.dataTransfer.files[0]) }}
                      onClick={() => fileRef.current?.click()}
                      style={{ border: `2px dashed ${isDragging ? 'var(--brand)' : 'var(--border)'}`, background: isDragging ? 'var(--brand-xlt)' : 'var(--surface2)', borderRadius: 14, padding: '36px 20px', textAlign: 'center', cursor: 'pointer', transition: 'all .2s', marginBottom: 10 }}
                    >
                      <div style={{ width: 56, height: 56, borderRadius: '50%', background: isDragging ? 'var(--brand-dim)' : 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                        <i className="fa fa-cloud-arrow-up" style={{ fontSize: 22, color: isDragging ? 'var(--brand)' : 'var(--txt3)' }} />
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--txt)', marginBottom: 5 }}>
                        {isDragging ? '¡Soltá el archivo acá!' : 'Arrastrá tu archivo acá'}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--txt3)', marginBottom: 14 }}>o hacé clic para seleccionar</div>
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        {['.vcf', '.csv', '.txt'].map(ext => (
                          <span key={ext} style={{ fontSize: 11, fontWeight: 700, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px', color: 'var(--txt2)' }}>{ext}</span>
                        ))}
                      </div>
                      <input ref={fileRef} type="file" accept=".csv,.txt,.vcf" onChange={handleFileSelect} style={{ display: 'none' }} />
                    </div>
                    <div style={{ padding: '8px 12px', background: 'var(--surface2)', borderRadius: 8, fontSize: 11, color: 'var(--txt3)' }}>
                      <b style={{ color: 'var(--txt2)' }}>Columnas CSV:</b> Nombre · Contacto · WhatsApp · Email · Rubro · Notas
                    </div>
                  </>
                )}
                {/* Preview */}
                {csvPreview.length > 0 && (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ background: '#059669', color: '#fff', fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 20 }}>{csvPreview.length} registros</span>
                        <span style={{ fontSize: 12, color: 'var(--txt3)' }}>listos para importar</span>
                      </div>
                      <button className="btn btn-ghost btn-xs" style={{ color: 'var(--txt3)' }} onClick={() => { setCsvPreview([]); if (fileRef.current) fileRef.current.value = '' }}>
                        <i className="fa fa-arrow-left" /> Cambiar archivo
                      </button>
                    </div>
                    <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 10, maxHeight: 300, overflowY: 'auto' }}>
                      <table style={{ fontSize: 11, minWidth: 480 }}>
                        <thead><tr><th style={{ width: 28 }}>#</th><th>Nombre</th><th>Contacto</th><th>WA</th><th>Rubro</th><th>Email</th></tr></thead>
                        <tbody>
                          {csvPreview.slice(0, 20).map((s, i) => (
                            <tr key={i}><td style={{ color: 'var(--txt4)', textAlign: 'center' }}>{i + 1}</td><td><b>{s.name}</b></td><td>{s.contact}</td><td>{s.wa}</td><td>{s.rubro}</td><td>{s.email}</td></tr>
                          ))}
                          {csvPreview.length > 20 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--txt3)', padding: '8px', fontStyle: 'italic' }}>…y {csvPreview.length - 20} más</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>)}

              {/* ── TAB: Pegar números ── */}
              {importTab === 'pegar' && (
                <div>
                  <div style={{ padding: '12px 14px', borderRadius: 10, background: '#FFF7ED', border: '1.5px solid #FED7AA', marginBottom: 14, fontSize: 12 }}>
                    <div style={{ fontWeight: 700, color: '#C2410C', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <i className="fa fa-bolt" /> Cargá todos tus proveedores ahora mismo — sin exportar nada
                    </div>
                    <div style={{ color: '#92400E', lineHeight: 1.6 }}>
                      Abrí WhatsApp, entrá a cada chat de proveedor y <b>copiá el número</b> desde el perfil del contacto.
                      Pegalo acá (uno por línea) con o sin nombre. También podés pegar desde tus notas, agenda o cualquier lista.
                    </div>
                    <div style={{ marginTop: 8, display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 11, color: '#92400E' }}>
                      <span><i className="fa fa-circle-check" style={{ color: '#059669', marginRight: 4 }} /><b>11 9876 5432</b> — solo número</span>
                      <span><i className="fa fa-circle-check" style={{ color: '#059669', marginRight: 4 }} /><b>Textiles Ruiz 1145678901</b></span>
                      <span><i className="fa fa-circle-check" style={{ color: '#059669', marginRight: 4 }} /><b>+54 9 11 2345 6789 - Packaging S.A.</b></span>
                    </div>
                  </div>
                  <textarea
                    value={pasteNums}
                    onChange={e => setPasteNums(e.target.value)}
                    placeholder={'Pegá o escribí los números de tus proveedores:\n\n11 9876 5432\nTextiles Ruiz  1145678901\n+54 9 11 2345 6789 - Packaging S.A.\nProveedor Envases  2216789012\n...'}
                    style={{ width: '100%', minHeight: 180, borderRadius: 10, border: '1.5px solid var(--border)', padding: '12px 14px', fontSize: 13, fontFamily: 'inherit', lineHeight: 1.7, resize: 'vertical', outline: 'none', background: 'var(--surface)', color: 'var(--txt)', boxSizing: 'border-box', transition: 'border-color .15s' }}
                    onFocus={e => e.target.style.borderColor = 'var(--brand)'}
                    onBlur={e => e.target.style.borderColor = 'var(--border)'}
                    autoFocus
                  />
                  {parsedPaste.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <span style={{ background: '#059669', color: '#fff', fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 20 }}>{parsedPaste.length} contactos detectados</span>
                        <span style={{ fontSize: 11, color: 'var(--txt3)' }}>— revisá y confirmá</span>
                      </div>
                      <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 10, maxHeight: 240, overflowY: 'auto' }}>
                        <table style={{ fontSize: 11, minWidth: 340 }}>
                          <thead><tr><th style={{ width: 24 }}>#</th><th>Nombre / Empresa</th><th>WhatsApp</th></tr></thead>
                          <tbody>
                            {parsedPaste.slice(0, 30).map((s, i) => (
                              <tr key={i}>
                                <td style={{ color: 'var(--txt4)', textAlign: 'center' }}>{i + 1}</td>
                                <td><b>{s.name}</b></td>
                                <td style={{ color: s.wa ? 'var(--txt)' : 'var(--txt4)', fontStyle: s.wa ? 'normal' : 'italic' }}>{s.wa || 'sin número'}</td>
                              </tr>
                            ))}
                            {parsedPaste.length > 30 && <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--txt3)', padding: '8px', fontStyle: 'italic' }}>…y {parsedPaste.length - 30} más</td></tr>}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  {pasteNums.trim() && parsedPaste.length === 0 && (
                    <div style={{ marginTop: 10, padding: '10px 14px', background: 'var(--surface2)', borderRadius: 8, fontSize: 12, color: 'var(--txt3)' }}>
                      <i className="fa fa-circle-info" style={{ marginRight: 6 }} />Escribí al menos un número o nombre para ver la vista previa.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="mfooter" style={{ flexShrink: 0, borderTop: '1px solid var(--border)', padding: '12px 20px' }}>
              <button className="btn btn-secondary" onClick={closeImportModal}>Cancelar</button>
              {importTab === 'archivo' && (
                <button className="btn btn-primary" onClick={doImport} disabled={!csvPreview.length}>
                  <i className="fa fa-file-import" /> {csvPreview.length > 0 ? `Importar ${csvPreview.length} proveedores` : 'Importar'}
                </button>
              )}
              {importTab === 'pegar' && (
                <button className="btn btn-primary" disabled={parsedPaste.length === 0}
                  onClick={() => { parsedPaste.forEach(s => saveEntity('suppliers', { ...s })); toast(`${parsedPaste.length} proveedores importados`, 'ok'); closeImportModal() }}>
                  <i className="fa fa-industry" /> {parsedPaste.length > 0 ? `Agregar ${parsedPaste.length} proveedores` : 'Agregar proveedores'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bulk action bar — vertical right side */}
      {selectedIds.size > 0 && (
        <div style={{ position:'fixed', right:12, top:'50%', transform:'translateY(-50%)', background:'rgba(12,10,40,.88)', backdropFilter:'blur(14px)', WebkitBackdropFilter:'blur(14px)', color:'#fff', borderRadius:10, display:'flex', flexDirection:'column', alignItems:'center', gap:2, padding:'6px 4px', boxShadow:'0 4px 18px rgba(0,0,0,.2)', zIndex:200, animation:'pgIn .15s ease both', border:'1px solid rgba(255,255,255,.08)' }}>
          <span style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,.55)', paddingBottom:6, borderBottom:'1px solid rgba(255,255,255,.1)', marginBottom:2, width:'100%', textAlign:'center' }}>{selectedIds.size}</span>
          {[
            { fn: bulkExportCSV, icon:'fa fa-download',        tip:'Exportar CSV',             hBg:'rgba(255,255,255,.1)',   hCol:'#fff' },
            { fn: bulkCopyWA,    icon:'fa-brands fa-whatsapp', tip:'Copiar números WhatsApp',  hBg:'rgba(74,222,128,.14)',   hCol:'#4ADE80' },
            { fn: bulkMailto,    icon:'fa fa-envelope',         tip:'Enviar email',             hBg:'rgba(96,165,250,.14)',   hCol:'#93C5FD' },
            { fn: bulkDelete,    icon:'fa fa-trash',            tip:'Eliminar seleccionados',   hBg:'rgba(220,38,38,.18)',    hCol:'#FCA5A5' },
          ].map(({ fn, icon, tip, hBg, hCol }) => (
            <button key={tip} onClick={fn} title={tip}
              onMouseOver={e=>{e.currentTarget.style.background=hBg;e.currentTarget.style.color=hCol}}
              onMouseOut={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color='rgba(255,255,255,.65)'}}
              style={{ background:'transparent', border:'none', color:'rgba(255,255,255,.65)', borderRadius:7, width:30, height:30, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, transition:'all .12s' }}>
              <i className={icon} />
            </button>
          ))}
          <div style={{ width:12, height:1, background:'rgba(255,255,255,.1)', margin:'2px 0' }} />
          <button onClick={() => setSelectedIds(new Set())} title="Cancelar"
            onMouseOver={e=>e.currentTarget.style.color='rgba(255,255,255,.8)'}
            onMouseOut={e=>e.currentTarget.style.color='rgba(255,255,255,.3)'}
            style={{ background:'transparent', border:'none', color:'rgba(255,255,255,.3)', borderRadius:7, width:26, height:26, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, transition:'color .12s' }}>
            <i className="fa fa-xmark" />
          </button>
        </div>
      )}
    </div>
  )
}
