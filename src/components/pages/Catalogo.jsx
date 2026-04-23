import { useState, useEffect, useRef, useMemo } from 'react'
import { useData } from '../../context/DataContext'
import { useToast } from '../../context/ToastContext'
import { fmt } from '../../lib/storage'

const compressImage = (file, maxBytes = 180000) => new Promise((resolve) => {
  const reader = new FileReader()
  reader.onload = (e) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      let { width, height } = img
      const maxDim = 600
      if (width > maxDim || height > maxDim) {
        if (width > height) { height = Math.round(height * maxDim / width); width = maxDim }
        else { width = Math.round(width * maxDim / height); height = maxDim }
      }
      canvas.width = width; canvas.height = height
      canvas.getContext('2d').drawImage(img, 0, 0, width, height)
      let q = 0.85
      let result = canvas.toDataURL('image/jpeg', q)
      while (result.length > maxBytes && q > 0.2) { q -= 0.1; result = canvas.toDataURL('image/jpeg', q) }
      resolve(result)
    }
    img.src = e.target.result
  }
  reader.readAsDataURL(file)
})

const CAT_PALETTE = [
  { bg: '#F5F3FF', color: '#8B5CF6' },
  { bg: '#EFF6FF', color: '#60A5FA' },
  { bg: '#ECFDF5', color: '#34D399' },
  { bg: '#FFFBEB', color: '#F59E0B' },
  { bg: '#FDF2F8', color: '#F472B6' },
  { bg: '#F0FDFA', color: '#2DD4BF' },
  { bg: '#FFF7ED', color: '#FB923C' },
  { bg: '#F1F5F9', color: '#94A3B8' },
]

export default function Catalogo() {
  const { get, config, updateConfig, saveEntity, deleteEntity } = useData()
  const toast = useToast()
  const c = config()
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('all')
  const [modal, setModal] = useState(false)
  const [bulkModal, setBulkModal] = useState(false)
  const [csvModal, setCsvModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ name: '', cat: '', cost: '', supplierId: '', image: '' })
  const num = (v) => { const n = Number(v); return isNaN(n) ? 0 : n }
  const selectOnFocus = (e) => e.target.select()
  const [bulkCat, setBulkCat] = useState('')
  const [bulkData, setBulkData] = useState('')
  const [csvPreview, setCsvPreview] = useState([])
  const [csvCat, setCsvCat] = useState('')
  const csvRef = useRef(null)
  const [priceUpdateModal, setPriceUpdateModal] = useState(false)
  const [showCostInfo, setShowCostInfo] = useState(false)
  const [pricePct, setPricePct] = useState('')
  const [priceSupplier, setPriceSupplier] = useState('all')

  const [selectedIds, setSelectedIds] = useState(new Set())
  const [bulkCatModal, setBulkCatModal] = useState(false)
  const [bulkCatValue, setBulkCatValue] = useState('')
  const [bulkSupplierModal, setBulkSupplierModal] = useState(false)
  const [bulkSupplierValue, setBulkSupplierValue] = useState('')
  const [catMgmtModal, setCatMgmtModal] = useState(false)
  const [editingCat, setEditingCat] = useState(null)
  const [viewMode, setViewMode] = useState('table')
  const imgRef = useRef(null)

  useEffect(() => { const t = setTimeout(() => setLoading(false), 80); return () => clearTimeout(t) }, [])

  const products = get('products')
  const suppliers = get('suppliers')
  const cats = c.productCats || []
  const margin = c.defaultMargin || 40

  const filtered = useMemo(() => {
    let f = products
    if (catFilter !== 'all') f = f.filter(p => p.cat === catFilter)
    if (search) { const sq = search.toLowerCase(); f = f.filter(p => (p.name || '').toLowerCase().includes(sq) || (p.sku || '').toLowerCase().includes(sq)) }
    return f
  }, [products, catFilter, search])

  const isAllSelected = filtered.length > 0 && filtered.every(p => selectedIds.has(p.id))

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const safeCat = (val) => (val && cats.includes(val)) ? val : (cats[0] || '')
  const open = (p) => {
    setForm(p
      ? { ...p, cat: p.cat ?? '', image: p.image || '' }
      : { name: '', cat: cats[0] || '', cost: '', supplierId: '', image: '' }
    )
    setModal(true)
  }

  const handleImgUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const compressed = await compressImage(file)
    setF('image', compressed)
    e.target.value = ''
  }
  const save = () => {
    if (!form.name) { toast('Ingresá el nombre del producto.', 'er'); return }
    saveEntity('products', { ...form, cat: form.cat ?? '', cost: num(form.cost), updatedAt: new Date().toISOString().slice(0,10) })
    setModal(false)
    toast('Producto guardado', 'ok')
  }
  const del = (id) => { if (window.confirm('¿Eliminar producto?')) { deleteEntity('products', id); toast('Producto eliminado', 'in') } }
  const doBulk = () => {
    const lines = bulkData.split('\n').filter(l => l.trim())
    let count = 0
    lines.forEach(l => {
      const parts = l.split(',')
      if (parts.length >= 2) {
        saveEntity('products', { name: parts[0].trim(), cat: bulkCat || cats[0] || '', cost: Number(parts[1].trim()) || 0, supplierId: '' })
        count++
      }
    })
    setBulkModal(false); setBulkData(''); toast(`${count} productos importados`, 'ok')
  }
  const supplierName = (id) => { const s = suppliers.find(x => x.id === Number(id)); return s?.name || '—' }

  const suggestedPrice = (cost) => Math.round(num(cost) * (1 + margin / 100))

  const catColor = (cat) => {
    const idx = cats.indexOf(cat)
    return CAT_PALETTE[(idx < 0 ? 0 : idx) % CAT_PALETTE.length]
  }

  const marginPct = (p) => {
    const cost = num(p.cost)
    if (!cost) return null
    return Math.round((suggestedPrice(cost) - cost) / cost * 100)
  }

  const marginColor = (pct) => {
    if (pct === null) return 'var(--txt3)'
    if (pct < 20) return '#DC2626'
    if (pct < 35) return '#D97706'
    return '#16A34A'
  }

  const priceUpdatePreview = priceSupplier === 'all'
    ? products
    : products.filter(p => String(p.supplierId) === String(priceSupplier))

  const toggleSelect = (id) => setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleSelectAll = () => setSelectedIds(isAllSelected ? new Set() : new Set(filtered.map(p => p.id)))

  const doBulkDelete = () => {
    if (!selectedIds.size) return
    if (!window.confirm(`¿Eliminar ${selectedIds.size} producto${selectedIds.size !== 1 ? 's' : ''}? Esta acción no se puede deshacer.`)) return
    selectedIds.forEach(id => deleteEntity('products', id))
    toast(`${selectedIds.size} productos eliminados`, 'in')
    setSelectedIds(new Set())
  }

  const doBulkCat = () => {
    if (!bulkCatValue && bulkCatValue !== '') return
    selectedIds.forEach(id => {
      const p = products.find(x => x.id === id)
      if (p) saveEntity('products', { ...p, cat: bulkCatValue })
    })
    toast(`${selectedIds.size} productos movidos a "${bulkCatValue || 'Sin categoría'}"`, 'ok')
    setSelectedIds(new Set()); setBulkCatModal(false); setBulkCatValue('')
  }

  const doBulkSupplier = () => {
    selectedIds.forEach(id => {
      const p = products.find(x => x.id === id)
      if (p) saveEntity('products', { ...p, supplierId: bulkSupplierValue })
    })
    toast(`${selectedIds.size} productos actualizados`, 'ok')
    setSelectedIds(new Set()); setBulkSupplierModal(false); setBulkSupplierValue('')
  }

  const doRenameCat = (original, newName) => {
    if (!newName || newName === original) { setEditingCat(null); return }
    updateConfig({ productCats: cats.map(c => c === original ? newName : c) })
    products.filter(p => p.cat === original).forEach(p => saveEntity('products', { ...p, cat: newName }))
    toast(`Categoría renombrada a "${newName}"`, 'ok')
    setEditingCat(null)
  }

  const doDeleteCat = (cat) => {
    const affected = products.filter(p => p.cat === cat).length
    if (!window.confirm(`¿Eliminar categoría "${cat}"?${affected > 0 ? `\n${affected} producto${affected !== 1 ? 's' : ''} quedarán sin categoría.` : ''}`)) return
    updateConfig({ productCats: cats.filter(c => c !== cat) })
    products.filter(p => p.cat === cat).forEach(p => saveEntity('products', { ...p, cat: '' }))
    toast(`Categoría eliminada`, 'in')
  }

  const doPriceUpdate = () => {
    const pct = Number(pricePct)
    if (!pct) { toast('Ingresá un porcentaje válido', 'er'); return }
    const factor = 1 + pct / 100
    const targets = selectedIds.size > 0 ? products.filter(p => selectedIds.has(p.id)) : priceUpdatePreview
    targets.forEach(p => {
      const newCost = Math.round((Number(p.cost) || 0) * factor)
      saveEntity('products', { ...p, cost: newCost, updatedAt: new Date().toISOString().slice(0, 10) })
    })
    toast(`${targets.length} productos actualizados (${pct > 0 ? '+' : ''}${pct}%)`, 'ok')
    setPriceUpdateModal(false); setPricePct(''); setPriceSupplier('all')
    if (selectedIds.size > 0) setSelectedIds(new Set())
  }

  /* ── ESC cierra modales (prioridad: topmost primero) ── */
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        if (catMgmtModal) { setCatMgmtModal(false); setEditingCat(null); return }
        if (bulkCatModal) { setBulkCatModal(false); return }
        if (bulkSupplierModal) { setBulkSupplierModal(false); return }
        if (csvModal) { setCsvModal(false); setCsvPreview([]); return }
        if (bulkModal) { setBulkModal(false); return }
        if (priceUpdateModal) { setPriceUpdateModal(false); return }
        if (modal) { setModal(false); return }
      }
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [catMgmtModal, bulkCatModal, bulkSupplierModal, csvModal, bulkModal, priceUpdateModal, modal])

  const handleCsvFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const lines = ev.target.result.split('\n').filter(l => l.trim())
      const header = lines[0].toLowerCase()
      const startIdx = header.includes('producto') || header.includes('nombre') || header.includes('name') ? 1 : 0
      const parsed = []
      for (let i = startIdx; i < lines.length; i++) {
        const parts = lines[i].match(/(".*?"|[^,]+)/g)?.map(v => v.replace(/^"|"$/g, '').trim()) || []
        if (parts.length >= 1 && parts[0]) {
          parsed.push({ name: parts[0], cost: Number(parts[1]) || 0, supplierId: '' })
        }
      }
      setCsvPreview(parsed)
    }
    reader.readAsText(file)
  }

  const doCsvImport = () => {
    csvPreview.forEach(p => saveEntity('products', { ...p, cat: csvCat || cats[0] || '' }))
    toast(`${csvPreview.length} productos importados`, 'ok')
    setCsvPreview([]); setCsvModal(false)
    if (csvRef.current) csvRef.current.value = ''
  }

  return (
    <div className="page active" style={{ animation: 'pgIn .25s ease both' }}>
      <div className="ph">
        <div className="ph-left"><h2>Catálogo de Productos</h2><p>Productos, categorías y costos</p></div>
        <div className="ph-right">
          <button className="btn btn-ghost btn-sm" onClick={() => setPriceUpdateModal(true)}>
            <i className="fa fa-percent" /> Actualizar precios
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => { setCsvCat(cats[0] || ''); setCsvModal(true) }}><i className="fa fa-file-csv" /> Importar CSV</button>
          <button className="btn btn-secondary btn-sm" onClick={() => { setBulkCat(cats[0] || ''); setBulkModal(true) }}><i className="fa fa-file-import" /> Carga masiva</button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setViewMode(v => v === 'table' ? 'grid' : 'table')}
            title={viewMode === 'table' ? 'Vista grilla' : 'Vista tabla'}
          >
            <i className={`fa ${viewMode === 'table' ? 'fa-grip' : 'fa-table-list'}`} />
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => open()}><i className="fa fa-plus" /> Agregar producto</button>
        </div>
      </div>
      <div className="pill-row">
        <div className="search-row" style={{ maxWidth: 280 }}><i className="fa fa-magnifying-glass" /><input type="text" placeholder="Buscar producto..." value={search} onChange={e => setSearch(e.target.value)} /></div>
        <div className={`pill ${catFilter === 'all' ? 'active' : ''}`} onClick={() => setCatFilter('all')}>Todos</div>
        {cats.map(cat => <div key={cat} className={`pill ${catFilter === cat ? 'active' : ''}`} onClick={() => setCatFilter(cat)}>{cat}</div>)}
        <button
          onClick={() => setCatMgmtModal(true)}
          style={{ marginLeft: 'auto', background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', color: 'var(--txt3)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'inherit' }}
          title="Gestionar categorías"
        >
          <i className="fa fa-sliders" /> Gestionar
        </button>
      </div>
      {viewMode === 'table' ? (
        <div className="tbl-card">
          <table>
            <thead>
              <tr>
                <th style={{ width: 36, textAlign: 'center' }}>
                  <input type="checkbox" checked={isAllSelected} onChange={toggleSelectAll} style={{ cursor: 'pointer' }} />
                </th>
                <th>Producto</th>
                <th>Categoría</th>
                <th>Proveedor</th>
                <th>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    Costo ($)
                    <button
                      title={showCostInfo ? 'Ocultar última actualización' : 'Mostrar última actualización'}
                      onClick={() => setShowCostInfo(v => !v)}
                      style={{ background: showCostInfo ? 'var(--brand)' : 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, color: showCostInfo ? '#fff' : 'var(--txt3)', fontSize: 9, padding: '2px 6px', cursor: 'pointer', fontWeight: 700, transition: 'all .2s' }}
                    >
                      <i className="fa fa-clock" /> ult. act.
                    </button>
                  </span>
                </th>
                <th>% Margen</th>
                {showCostInfo && <th>Últ. actualización</th>}
                <th>Precio sugerido ($)</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? [1,2,3,4].map(i => (
                <tr key={i}><td colSpan={showCostInfo ? 9 : 8}><div className="sk sk-text" style={{ height: 18, width: `${50 + Math.random() * 40}%` }} /></td></tr>
              )) : filtered.length ? filtered.map(p => {
                const pct = marginPct(p)
                const cc = catColor(p.cat)
                return (
                  <tr key={p.id}>
                    <td style={{ textAlign: 'center' }}>
                      <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleSelect(p.id)} style={{ cursor: 'pointer' }} />
                    </td>
                    <td>
                      {p.image && <img src={p.image} alt={p.name} style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 6, marginRight: 8, verticalAlign: 'middle', flexShrink: 0 }} />}
                      <span style={{ fontWeight: 800 }}>{p.name}</span>
                    </td>
                    <td>
                      <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: cc.bg, color: cc.color, letterSpacing: 0.2 }}>{p.cat}</span>
                    </td>
                    <td>{supplierName(p.supplierId)}</td>
                    <td>{fmt(p.cost)}</td>
                    <td>
                      {pct !== null ? (
                        <span style={{ fontWeight: 800, fontSize: 13, color: marginColor(pct) }}>{pct}%</span>
                      ) : <span style={{ color: 'var(--txt4)' }}>—</span>}
                    </td>
                    {showCostInfo && (
                      <td style={{ fontSize: 11 }}>
                        {p.updatedAt ? (
                          <span style={{ color: (() => { const days = Math.floor((Date.now() - new Date(p.updatedAt)) / 86400000); return days > 180 ? '#DC2626' : days > 60 ? '#D97706' : '#16A34A' })(), fontWeight: 600 }}>
                            {(() => { const days = Math.floor((Date.now() - new Date(p.updatedAt)) / 86400000); if (days === 0) return 'Hoy'; if (days === 1) return 'Ayer'; if (days < 30) return `hace ${days}d`; if (days < 365) return `hace ${Math.floor(days/30)}m`; return `hace ${Math.floor(days/365)}a` })()}
                          </span>
                        ) : <span style={{ color: 'var(--txt4)' }}>—</span>}
                      </td>
                    )}
                    <td style={{ fontWeight: 700, color: 'var(--money)' }}>{fmt(suggestedPrice(p.cost))}</td>
                    <td><div className="acts">
                      <button className="act edit" onClick={() => open(p)} title="Editar"><i className="fa fa-pen" /></button>
                      <button className="act del" onClick={() => del(p.id)} title="Eliminar"><i className="fa fa-trash" /></button>
                    </div></td>
                  </tr>
                )
              }) : <tr><td colSpan={showCostInfo ? 9 : 8}><div className="empty"><div className="ico"><i className="fa fa-box-open" /></div><p>Sin productos</p></div></td></tr>}
            </tbody>
          </table>
        </div>
      ) : (
        /* ── GRID VIEW ── */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(190px,1fr))', gap: 14, marginTop: 4 }}>
          {loading ? [1,2,3,4,5,6].map(i => (
            <div key={i} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="sk" style={{ height: 130, borderRadius: '10px 10px 0 0' }} />
              <div style={{ padding: '10px 12px' }}>
                <div className="sk sk-text" style={{ height: 13, width: '70%', marginBottom: 8 }} />
                <div className="sk sk-text" style={{ height: 11, width: '45%' }} />
              </div>
            </div>
          )) : filtered.length ? filtered.map(p => {
            const pct = marginPct(p)
            const cc = catColor(p.cat)
            return (
              <div key={p.id} className="card" style={{ padding: 0, overflow: 'hidden', cursor: 'pointer', transition: 'transform .18s,box-shadow .18s' }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = 'var(--sh-lg)' }}
                onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}
              >
                {/* IMAGE */}
                <div style={{ height: 130, background: cc.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
                  {p.image
                    ? <img src={p.image} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <i className="fa fa-box-open" style={{ fontSize: 36, color: cc.color, opacity: .5 }} />
                  }
                  <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleSelect(p.id)}
                    style={{ position: 'absolute', top: 8, left: 8, cursor: 'pointer', width: 16, height: 16 }}
                    onClick={e => e.stopPropagation()} />
                </div>
                {/* INFO */}
                <div style={{ padding: '10px 12px' }}>
                  <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--txt)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.name}>{p.name}</div>
                  <span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: cc.bg, color: cc.color, marginBottom: 6 }}>{p.cat || '—'}</span>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontSize: 11, color: 'var(--txt3)' }}>{fmt(p.cost)}</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--money)' }}>{fmt(suggestedPrice(p.cost))}</span>
                  </div>
                  {pct !== null && <div style={{ fontSize: 10, fontWeight: 700, color: marginColor(pct), marginTop: 2 }}>{pct}% margen</div>}
                </div>
                {/* ACTIONS */}
                <div style={{ display: 'flex', borderTop: '1px solid var(--border)' }}>
                  <button onClick={() => open(p)} style={{ flex: 1, padding: '7px 0', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--brand)', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', transition: 'background .15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--brand-xlt)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                    <i className="fa fa-pen" /> Editar
                  </button>
                  <div style={{ width: 1, background: 'var(--border)' }} />
                  <button onClick={() => del(p.id)} style={{ flex: 1, padding: '7px 0', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', transition: 'background .15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#FFF1F2'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                    <i className="fa fa-trash" />
                  </button>
                </div>
              </div>
            )
          }) : (
            <div style={{ gridColumn: '1/-1' }}>
              <div className="empty"><div className="ico"><i className="fa fa-box-open" /></div><p>Sin productos</p></div>
            </div>
          )}
        </div>
      )}

      {selectedIds.size > 0 && (
        <div style={{
          position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--surface)', border: '2px solid var(--brand)', borderRadius: 14,
          boxShadow: '0 8px 32px rgba(0,0,0,.18)', padding: '10px 16px',
          display: 'flex', alignItems: 'center', gap: 10, zIndex: 200, flexWrap: 'wrap',
          animation: 'pgIn .2s ease both'
        }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--brand)', marginRight: 4 }}>
            <i className="fa fa-check-square" style={{ marginRight: 6 }} />{selectedIds.size} seleccionado{selectedIds.size !== 1 ? 's' : ''}
          </span>
          <div style={{ width: 1, height: 22, background: 'var(--border)' }} />
          <button className="btn btn-ghost btn-sm" onClick={() => { setBulkCatValue(cats[0] || ''); setBulkCatModal(true) }}>
            <i className="fa fa-tag" /> Categoría
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => { setBulkSupplierValue(''); setBulkSupplierModal(true) }}>
            <i className="fa fa-truck" /> Proveedor
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => { setPricePct(''); setPriceUpdateModal(true) }}>
            <i className="fa fa-percent" /> Precios
          </button>
          <button className="btn btn-sm" onClick={doBulkDelete} style={{ background: 'var(--red)', color: '#fff', border: 'none' }}>
            <i className="fa fa-trash" /> Eliminar
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setSelectedIds(new Set())}>
            <i className="fa fa-xmark" />
          </button>
        </div>
      )}

      {modal && (
        <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) setModal(false) }}>
          <div className="modal">
            <div className="mh"><h3>{form.id ? 'Editar' : 'Agregar'} producto</h3><button className="mclose" onClick={() => setModal(false)}><i className="fa fa-xmark" /></button></div>
            <div className="fg"><label>Nombre *</label><input autoFocus tabIndex={1} type="text" value={form.name} onChange={e => setF('name', e.target.value)} placeholder="Taza sublimada 11oz" /></div>
            <div className="grid2">
              <div className="fg"><label>Categoría</label><select tabIndex={2} value={form.cat} onChange={e => setF('cat', e.target.value)}>{cats.map(cat => <option key={cat} value={cat}>{cat}</option>)}{form.cat && !cats.includes(form.cat) && (
                  <option value={form.cat}>{form.cat}</option>
                )}</select></div>
              <div className="fg"><label>Costo ($) *</label><input tabIndex={3} type="number" value={form.cost} onFocus={selectOnFocus} onChange={e => setF('cost', e.target.value)} onBlur={e => { if (e.target.value === '') setF('cost', 0) }} min="0" /></div>
            </div>
            <div className="fg"><label>Proveedor</label><select tabIndex={4} value={form.supplierId} onChange={e => setF('supplierId', e.target.value)}><option value="">Sin asignar</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            <div className="fg">
              <label>Imagen del producto <span style={{ fontWeight: 400, color: 'var(--txt3)' }}>(opcional)</span></label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {form.image
                  ? <img src={form.image} alt="preview" style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 8, border: '1.5px solid var(--border)', flexShrink: 0 }} />
                  : <div style={{ width: 60, height: 60, borderRadius: 8, border: '1.5px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <i className="fa fa-image" style={{ color: 'var(--txt4)', fontSize: 20 }} />
                    </div>
                }
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <input ref={imgRef} type="file" accept="image/*" onChange={handleImgUpload} style={{ display: 'none' }} />
                  <button className="btn btn-ghost btn-sm" type="button" onClick={() => imgRef.current?.click()}>
                    <i className="fa fa-upload" /> {form.image ? 'Cambiar imagen' : 'Subir imagen'}
                  </button>
                  {form.image && (
                    <button className="btn btn-ghost btn-sm" type="button" style={{ color: 'var(--red)' }} onClick={() => setF('image', '')}>
                      <i className="fa fa-trash" /> Quitar
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className="mfooter"><button className="btn btn-secondary" onClick={() => setModal(false)}>Cancelar</button><button className="btn btn-primary" onClick={save}><i className="fa fa-floppy-disk" /> Guardar</button></div>
          </div>
        </div>
      )}

      {priceUpdateModal && (
        <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) setPriceUpdateModal(false) }}>
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="mh">
              <h3><i className="fa fa-percent" style={{ marginRight: 8 }} />Actualizar precios masivamente</h3>
              <button className="mclose" onClick={() => setPriceUpdateModal(false)}><i className="fa fa-xmark" /></button>
            </div>
            <div className="fg">
              <label>Proveedor</label>
              <select value={priceSupplier} onChange={e => setPriceSupplier(e.target.value)}>
                <option value="all">Todos los proveedores ({products.length} productos)</option>
                {suppliers.map(s => {
                  const cnt = products.filter(p => String(p.supplierId) === String(s.id)).length
                  return <option key={s.id} value={String(s.id)}>{s.name} ({cnt} productos)</option>
                })}
              </select>
            </div>
            <div className="fg">
              <label>% de ajuste (positivo = aumento, negativo = descuento)</label>
              <input
                type="number"
                value={pricePct}
                onChange={e => setPricePct(e.target.value)}
                placeholder="Ej: 15 para +15%, -10 para -10%"
                onFocus={selectOnFocus}
              />
            </div>
            {pricePct && Number(pricePct) !== 0 && priceUpdatePreview.length > 0 && (
              <div style={{
                background: Number(pricePct) > 0 ? '#FEF3C7' : '#DBEAFE',
                border: `1px solid ${Number(pricePct) > 0 ? '#FCD34D' : '#93C5FD'}`,
                borderRadius: 10, padding: '12px 16px', marginBottom: 8, fontSize: 13,
              }}>
                <b>{Number(pricePct) > 0 ? '📈' : '📉'} Se actualizarán {priceUpdatePreview.length} producto{priceUpdatePreview.length !== 1 ? 's' : ''}</b>
                <div style={{ marginTop: 4, color: 'var(--txt2)' }}>
                  Los costos se ajustarán un <b>{Number(pricePct) > 0 ? '+' : ''}{pricePct}%</b>. El precio sugerido se recalculará automáticamente.
                </div>
              </div>
            )}
            <div className="mfooter">
              <button className="btn btn-secondary" onClick={() => setPriceUpdateModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={doPriceUpdate} disabled={!pricePct || Number(pricePct) === 0 || !priceUpdatePreview.length}>
                <i className="fa fa-bolt" /> Aplicar ajuste
              </button>
            </div>
          </div>
        </div>
      )}

      {csvModal && (
        <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) { setCsvModal(false); setCsvPreview([]) } }}>
          <div className="modal" style={{ maxWidth: 680 }}>
            <div className="mh"><h3>Importar productos desde CSV</h3><button className="mclose" onClick={() => { setCsvModal(false); setCsvPreview([]) }}><i className="fa fa-xmark" /></button></div>
            <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '14px 18px', marginBottom: 16, fontSize: 12, color: 'var(--txt2)' }}>
              <b>Formato:</b> Nombre del producto, Costo (una por línea)
            </div>
            <div className="fg"><label>Categoría</label><select value={csvCat} onChange={e => setCsvCat(e.target.value)}>{cats.map(cat => <option key={cat} value={cat}>{cat}</option>)}</select></div>
            <div className="fg">
              <label>Archivo CSV</label>
              <input ref={csvRef} type="file" accept=".csv,.txt" onChange={handleCsvFile}
                style={{ padding: '10px 14px', border: '2px dashed var(--border)', borderRadius: 10, width: '100%', cursor: 'pointer' }} />
            </div>
            {csvPreview.length > 0 && (
              <div style={{ maxHeight: 180, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8, marginTop: 8 }}>
                <table style={{ fontSize: 12 }}>
                  <thead><tr><th>Producto</th><th>Costo</th></tr></thead>
                  <tbody>
                    {csvPreview.slice(0, 10).map((p, i) => <tr key={i}><td>{p.name}</td><td>{fmt(p.cost)}</td></tr>)}
                    {csvPreview.length > 10 && <tr><td colSpan={2} style={{ textAlign: 'center', color: 'var(--txt3)' }}>...y {csvPreview.length - 10} más</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
            <div className="mfooter">
              <button className="btn btn-secondary" onClick={() => { setCsvModal(false); setCsvPreview([]) }}>Cancelar</button>
              <button className="btn btn-primary" onClick={doCsvImport} disabled={!csvPreview.length}><i className="fa fa-file-import" /> Importar {csvPreview.length}</button>
            </div>
          </div>
        </div>
      )}

      {bulkModal && (
        <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) setBulkModal(false) }}>
          <div className="modal">
            <div className="mh"><h3>Carga masiva de productos</h3><button className="mclose" onClick={() => setBulkModal(false)}><i className="fa fa-xmark" /></button></div>
            <div style={{ fontSize: 12, color: 'var(--txt2)', marginBottom: 14, background: 'var(--surface2)', padding: '10px 14px', borderRadius: 8 }}>Formato: <code>Nombre del producto, precio</code> (una por línea)</div>
            <div className="fg"><label>Categoría</label><select value={bulkCat} onChange={e => setBulkCat(e.target.value)}>{cats.map(cat => <option key={cat} value={cat}>{cat}</option>)}</select></div>
            <div className="fg"><label>Datos</label><textarea value={bulkData} onChange={e => setBulkData(e.target.value)} rows={8} placeholder={'Taza sublimada, 850\nLapicera metálica, 450'} /></div>
            <div className="mfooter"><button className="btn btn-secondary" onClick={() => setBulkModal(false)}>Cancelar</button><button className="btn btn-primary" onClick={doBulk}><i className="fa fa-bolt" /> Importar</button></div>
          </div>
        </div>
      )}

      {bulkCatModal && (
        <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) setBulkCatModal(false) }}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="mh"><h3><i className="fa fa-tag" style={{ marginRight: 8 }} />Cambiar categoría</h3><button className="mclose" onClick={() => setBulkCatModal(false)}><i className="fa fa-xmark" /></button></div>
            <p style={{ fontSize: 13, color: 'var(--txt2)', marginBottom: 12 }}>Mover <b>{selectedIds.size} producto{selectedIds.size !== 1 ? 's' : ''}</b> a:</p>
            <div className="fg">
              <select value={bulkCatValue} onChange={e => setBulkCatValue(e.target.value)}>
                <option value="">Sin categoría</option>
                {cats.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="mfooter">
              <button className="btn btn-secondary" onClick={() => setBulkCatModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={doBulkCat}><i className="fa fa-check" /> Aplicar</button>
            </div>
          </div>
        </div>
      )}

      {bulkSupplierModal && (
        <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) setBulkSupplierModal(false) }}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="mh"><h3><i className="fa fa-truck" style={{ marginRight: 8 }} />Cambiar proveedor</h3><button className="mclose" onClick={() => setBulkSupplierModal(false)}><i className="fa fa-xmark" /></button></div>
            <p style={{ fontSize: 13, color: 'var(--txt2)', marginBottom: 12 }}>Asignar proveedor a <b>{selectedIds.size} producto{selectedIds.size !== 1 ? 's' : ''}</b>:</p>
            <div className="fg">
              <select value={bulkSupplierValue} onChange={e => setBulkSupplierValue(e.target.value)}>
                <option value="">Sin asignar</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="mfooter">
              <button className="btn btn-secondary" onClick={() => setBulkSupplierModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={doBulkSupplier}><i className="fa fa-check" /> Aplicar</button>
            </div>
          </div>
        </div>
      )}

      {catMgmtModal && (
        <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) { setCatMgmtModal(false); setEditingCat(null) } }}>
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="mh"><h3><i className="fa fa-sliders" style={{ marginRight: 8 }} />Gestionar categorías</h3><button className="mclose" onClick={() => { setCatMgmtModal(false); setEditingCat(null) }}><i className="fa fa-xmark" /></button></div>
            {cats.length === 0 && <div style={{ fontSize: 13, color: 'var(--txt3)', textAlign: 'center', padding: 20 }}>No hay categorías definidas.<br/>Creá una desde Configuración.</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 340, overflowY: 'auto' }}>
              {cats.map((cat) => {
                const cc = catColor(cat)
                const count = products.filter(p => p.cat === cat).length
                const isEditing = editingCat?.original === cat
                return (
                  <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border)', background: isEditing ? 'var(--brand-xlt)' : 'var(--surface)' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', background: cc.bg, color: cc.color, fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 20, whiteSpace: 'nowrap', flexShrink: 0 }}>{cat}</span>
                    {isEditing ? (
                      <input
                        autoFocus
                        type="text"
                        value={editingCat.value}
                        onChange={e => setEditingCat(ec => ({ ...ec, value: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') doRenameCat(cat, editingCat.value); if (e.key === 'Escape') setEditingCat(null) }}
                        style={{ flex: 1, padding: '5px 8px', border: '2px solid var(--brand)', borderRadius: 7, fontSize: 13, fontFamily: 'inherit' }}
                      />
                    ) : (
                      <span style={{ flex: 1, fontSize: 13, color: 'var(--txt2)' }}>{count} producto{count !== 1 ? 's' : ''}</span>
                    )}
                    {isEditing ? (
                      <>
                        <button className="btn btn-primary btn-xs" onClick={() => doRenameCat(cat, editingCat.value)}><i className="fa fa-check" /></button>
                        <button className="btn btn-ghost btn-xs" onClick={() => setEditingCat(null)}><i className="fa fa-xmark" /></button>
                      </>
                    ) : (
                      <>
                        <button className="btn btn-ghost btn-xs" title="Renombrar" onClick={() => setEditingCat({ original: cat, value: cat })}><i className="fa fa-pen" /></button>
                        <button className="btn btn-ghost btn-xs" title="Eliminar" style={{ color: 'var(--red)' }} onClick={() => doDeleteCat(cat)}><i className="fa fa-trash" /></button>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
            <div className="mfooter" style={{ justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => { setCatMgmtModal(false); setEditingCat(null) }}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
