import { useState, useEffect, useRef, useMemo } from 'react'
import { useData } from '../../context/DataContext'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { useConfirm } from '../../context/ConfirmContext'
import { fmt, db, dbW } from '../../lib/storage'

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

// ── Badge KIT ───────────────────────────────────────────────────────
function KitBadge({ small }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      background: 'linear-gradient(135deg, #FDF2F8, #F5F3FF)',
      color: '#8B5CF6', border: '1px solid #DDD6FE',
      fontSize: small ? 8.5 : 9.5, fontWeight: 800,
      padding: small ? '1px 5px' : '2px 7px',
      borderRadius: 20, letterSpacing: 0.3, flexShrink: 0,
    }}>
      <i className="fa fa-gift" style={{ fontSize: small ? 7 : 9 }} />
      KIT
    </span>
  )
}

export default function Catalogo() {
  const { get, config, updateConfig, saveEntity, deleteEntity } = useData()
  const toast   = useToast()
  const confirm = useConfirm()
  const c = config()
  const { role } = useAuth()
  const opHideCosts = role === 'operator' && c.opShowCosts === false
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('all')
  const [modal, setModal] = useState(false)
  const [bulkModal, setBulkModal] = useState(false)
  const [csvModal, setCsvModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ name: '', cat: '', cost: '', supplierId: '', image: '', stock: '' })
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
  const [viewMode, setViewMode] = useState(() => db('productViewMode', 'grid'))
  const switchView = (mode) => { setViewMode(mode); dbW('productViewMode', mode) }
  const [productMode, setProductMode] = useState('producto')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [marginInput, setMarginInput] = useState('')
  const imgRef = useRef(null)
  const bodyRef = useRef(null)
  const packCostRef = useRef(null)
  const [hasDraft, setHasDraft] = useState(null)
  const DRAFT_KEY = 'anma_prod_draft'

  // ── Quick-cat popover ─────────────────────────────────────────────
  const [quickCatPop, setQuickCatPop]     = useState(null) // { prod, x, y }
  const [quickCatInput, setQuickCatInput] = useState('')
  const [groupByType, setGroupByType]     = useState(false)
  // secciones colapsables cuando groupByType está ON
  const [collapsedGrps, setCollapsedGrps] = useState({})
  const toggleGrp = (key) => setCollapsedGrps(prev => ({ ...prev, [key]: !prev[key] }))

  // ── Estado del Kit Builder ────────────────────────────────────────
  const [componentes, setComponentes]   = useState([])
  const [compForm, setCompForm]         = useState({ nombre: '', qty: 1, costoUnit: '' })
  const [compSearch, setCompSearch]     = useState('')
  const [compDropdown, setCompDropdown] = useState(false)
  const compInputRef = useRef(null)
  // Packaging: items individuales (caja, cinta, tissue…)
  const [packagingItems, setPackagingItems] = useState([])
  const [packForm, setPackForm]             = useState({ nombre: '', qty: 1, costoUnit: '' })

  const kitCost   = componentes.reduce((s, c) => s + (num(c.qty) * num(c.costoUnit)), 0)
  const packTotal = packagingItems.reduce((s, p) => s + (num(p.qty) * num(p.costoUnit)), 0)
  const kitTotal  = kitCost + packTotal   // costo real = componentes + packaging

  // Sincronizar costo del kit → form.cost y recalcular precio
  useEffect(() => {
    if (productMode !== 'kit') return
    setF('cost', kitTotal)
    const m = parseFloat(marginInput)
    if (!isNaN(m) && kitTotal > 0) setF('price', Math.round(kitTotal * (1 + m / 100)))
  }, [kitTotal, productMode]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { const t = setTimeout(() => setLoading(false), 80); return () => clearTimeout(t) }, [])

  const products = get('products')
  const suppliers = get('suppliers')
  const cats = c.productCats || []
  // ── Detector: cats desactualizadas vs las sugeridas para regalos ──
  const SUGGESTED_REGALOS_CATS = [
    'Bebidas y vinos', 'Picadas y gourmet', 'Mates y termos', 'Vasos y cristalería',
    'Tablas y bazar', 'Indumentaria', 'Bolsos y mochilas', 'Tecnología',
    'Papelería y oficina', 'Aromas y bienestar', 'Packaging y cajas', 'Otros',
  ]
  const OLD_REGALOS_CATS = ['Tazas / Libretas / Lapiceras', 'Ropa y Textiles', 'Tecnología', 'Packaging / Cajas', 'Otros']
  const dismissKey = 'cats_upgrade_regalos_dismissed'
  const [bannerDismissed, setBannerDismissed] = useState(() => {
    try { return localStorage.getItem(dismissKey) === '1' } catch { return false }
  })
  const sortedCurrent = [...cats].sort().join('|')
  const sortedOld = [...OLD_REGALOS_CATS].sort().join('|')
  const sortedNew = [...SUGGESTED_REGALOS_CATS].sort().join('|')
  const showCatsUpgrade = !bannerDismissed && cats.length > 0 && sortedCurrent !== sortedNew && (sortedCurrent === sortedOld || (() => {
    const catSet = new Set(cats)
    const overlap = OLD_REGALOS_CATS.filter(p => catSet.has(p)).length
    return OLD_REGALOS_CATS.length > 0 && overlap / OLD_REGALOS_CATS.length >= 0.6
  })())
  const applyCatsUpgrade = () => {
    if (window.confirm(`¿Reemplazar tus ${cats.length} categorías actuales por las 12 sugeridas para regalos?\n\nLos productos con una categoría que ya no esté quedarán como "Sin categoría" hasta que los reasignes.`)) {
      updateConfig({ productCats: SUGGESTED_REGALOS_CATS })
      toast('Categorías actualizadas a las sugeridas para regalos', 'ok')
      try { localStorage.removeItem(dismissKey) } catch {}
    }
  }
  const dismissCatsUpgrade = () => {
    try { localStorage.setItem(dismissKey, '1') } catch {}
    setBannerDismissed(true)
  }
  const margin = c.defaultMargin || 40

  const filtered = useMemo(() => {
    let f = products
    if (catFilter !== 'all') f = f.filter(p => p.cat === catFilter)
    if (search) { const sq = search.toLowerCase(); f = f.filter(p => (p.name || '').toLowerCase().includes(sq) || (p.sku || '').toLowerCase().includes(sq)) }
    return f
  }, [products, catFilter, search])

  // ── Inteligencia de categorías: frecuencia de uso ─────────────────
  const catFrequency = useMemo(() => {
    const freq = {}
    products.forEach(p => { if (p.cat) freq[p.cat] = (freq[p.cat] || 0) + 1 })
    return freq
  }, [products])

  const catsSorted = useMemo(() =>
    [...cats].sort((a, b) => (catFrequency[b] || 0) - (catFrequency[a] || 0))
  , [cats, catFrequency])

  // ── Agrupación por tipo ────────────────────────────────────────────
  const prodsFiltered = useMemo(() => filtered.filter(p => p.tipo !== 'kit'), [filtered])
  const kitsFiltered  = useMemo(() => filtered.filter(p => p.tipo === 'kit'),  [filtered])

  const isAllSelected = filtered.length > 0 && filtered.every(p => selectedIds.has(p.id))

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const safeCat = (val) => (val && cats.includes(val)) ? val : (cats[0] || '')

  const open = (p) => {
    const isKit = p?.tipo === 'kit'
    setProductMode(isKit ? 'kit' : 'producto')
    setShowAdvanced(false)
    setComponentes(isKit && p.componentes ? p.componentes : [])
    setCompForm({ nombre: '', qty: 1, costoUnit: '' })
    setCompSearch('')
    if (isKit && p.packagingItems && p.packagingItems.length > 0) {
      setPackagingItems(p.packagingItems)
    } else if (isKit && p.costoExtra && num(p.costoExtra) > 0) {
      setPackagingItems([{ _pid: Date.now(), nombre: 'Packaging', qty: 1, costoUnit: num(p.costoExtra) }])
    } else {
      setPackagingItems([])
    }
    setPackForm({ nombre: '', qty: 1, costoUnit: '' })

    if (p) {
      setForm({ ...p, cat: p.cat ?? '', image: p.image || '', stock: p.stock ?? '' })
      const cv = num(p.cost); const pr = num(p.price || 0)
      setMarginInput(cv > 0 && pr > 0 ? String(Math.round((pr - cv) / cv * 100)) : String(margin))
      setHasDraft(null)
    } else {
      setMarginInput(String(margin))
      setForm({ name: '', cat: cats[0] || '', cost: '', supplierId: '', image: '', price: '', stock: '' })
      // ── Detectar borrador guardado ──
      try {
        const raw = localStorage.getItem(DRAFT_KEY)
        if (raw) {
          const d = JSON.parse(raw)
          // Solo restaurar borradores de las últimas 24h
          if (d._ts && Date.now() - d._ts < 86400000) { setHasDraft(d) }
          else { localStorage.removeItem(DRAFT_KEY); setHasDraft(null) }
        } else { setHasDraft(null) }
      } catch { setHasDraft(null) }
    }
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
    if (productMode === 'kit' && componentes.length === 0) {
      toast('Agregá al menos un componente al kit.', 'er'); return
    }
    const finalCost = productMode === 'kit' ? kitTotal : num(form.cost)
    // NOTA: `price` y `margin` ya no se persisten desde el catálogo.
    // El margen y precio final se calculan al armar el presupuesto.
    // Removemos esos campos del payload para mantener la BD limpia.
    const { price: _omitPrice, margin: _omitMargin, priceB2C: _omitPriceB2C, ...formClean } = form
    saveEntity('products', {
      ...formClean,
      cat:         formClean.cat ?? '',
      cost:        finalCost,
      stock:       formClean.stock === '' ? null : num(formClean.stock),
      tipo:        productMode === 'kit' ? 'kit' : 'producto',
      componentes:    productMode === 'kit' ? componentes : [],
      packagingItems: productMode === 'kit' ? packagingItems : [],
      costoExtra:     productMode === 'kit' ? packTotal : 0,
      updatedAt:   new Date().toISOString().slice(0, 10),
    })
    try { localStorage.removeItem(DRAFT_KEY) } catch {}
    setHasDraft(null)
    setModal(false)
    toast('Producto guardado', 'ok')
  }

  const del = (id) => confirm('¿Eliminar producto?', () => { deleteEntity('products', id); toast('Producto eliminado', 'in') })

  // ── Funciones del Kit Builder ─────────────────────────────────────
  const compSuggestions = useMemo(() => {
    const insumos = (get('insumos') || []).map(i => ({
      id: `ins_${i.id}`, name: i.name || i.nombre || '',
      cost: i.cost ?? i.costoUnit ?? 0, _source: 'insumo',
    }))
    const all = [
      ...products.map(p => ({ ...p, _source: 'product' })),
      ...insumos,
    ].filter(p => p.name)
    if (!compSearch.trim()) return all.slice(0, 8)
    const sq = compSearch.toLowerCase()
    return all.filter(p => p.name.toLowerCase().includes(sq)).slice(0, 8)
  }, [products, get, compSearch])

  const addComp = () => {
    const nombre = (compForm.nombre || compSearch || '').trim()
    if (!nombre) { toast('Ingresá el nombre del componente', 'er'); return }
    setComponentes(prev => [...prev, {
      _cid:      Date.now() + Math.floor(Math.random() * 1000),
      nombre,
      qty:       Math.max(0.1, num(compForm.qty) || 1),
      costoUnit: num(compForm.costoUnit) || 0,
      productId: compForm.productId || null,
    }])
    setCompForm({ nombre: '', qty: 1, costoUnit: '' })
    setCompSearch('')
    setCompDropdown(false)
    setTimeout(() => compInputRef.current?.focus(), 50)
    setTimeout(() => bodyRef.current?.scrollBy({ top: 60, behavior: 'smooth' }), 100)
  }

  const selectFromCatalog = (p) => {
    setCompForm({ nombre: p.name, qty: 1, costoUnit: p.cost, productId: p.id })
    setCompSearch(p.name)
    setCompDropdown(false)
    setTimeout(() => compInputRef.current?.focus(), 50)
  }

  const removeComp = (cid) => setComponentes(prev => prev.filter(c => c._cid !== cid))
  const updateComp = (cid, field, val) =>
    setComponentes(prev => prev.map(c => c._cid === cid ? { ...c, [field]: val } : c))

  // ── Packaging helpers ────────────────────────────────────────────
  const addPackaging = () => {
    const nombre = packForm.nombre.trim()
    if (!nombre) { toast('Ingresá el nombre del ítem de packaging', 'er'); return }
    setPackagingItems(prev => [...prev, {
      _pid: Date.now() + Math.floor(Math.random() * 1000),
      nombre,
      qty:       Math.max(1, num(packForm.qty) || 1),
      costoUnit: num(packForm.costoUnit) || 0,
    }])
    setPackForm({ nombre: '', qty: 1, costoUnit: '' })
    setTimeout(() => bodyRef.current?.scrollBy({ top: 80, behavior: 'smooth' }), 100)
  }
  const removePackaging = (pid) => setPackagingItems(prev => prev.filter(p => p._pid !== pid))
  const updatePackaging = (pid, field, val) =>
    setPackagingItems(prev => prev.map(p => p._pid === pid ? { ...p, [field]: val } : p))

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

  const onCostChange = (v) => {
    setF('cost', v)
    const cv = parseFloat(v)
    const m = parseFloat(marginInput)
    if (!isNaN(cv) && cv > 0 && !isNaN(m) && marginInput !== '') {
      setF('price', Math.round(cv * (1 + m / 100)))
    }
  }
  const onMarginChange = (v) => {
    setMarginInput(v)
    const cv = productMode === 'kit' ? kitTotal : num(form.cost)
    const m = parseFloat(v)
    if (cv > 0 && !isNaN(m)) setF('price', Math.round(cv * (1 + m / 100)))
  }
  const onPriceChange = (v) => {
    setF('price', v)
    const cv = productMode === 'kit' ? kitTotal : num(form.cost)
    const p = parseFloat(v)
    if (cv > 0 && !isNaN(p) && p > 0) setMarginInput(String(Math.round((p - cv) / cv * 100)))
  }

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

  const toggleSelect = (id) => { if (id == null) return; setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  const toggleSelectAll = () => setSelectedIds(isAllSelected ? new Set() : new Set(filtered.map(p => p.id).filter(Boolean)))

  const doBulkDelete = () => {
    if (!selectedIds.size) return
    confirm({ body: `¿Eliminar ${selectedIds.size} producto${selectedIds.size !== 1 ? 's' : ''}? Esta acción no se puede deshacer.`, danger: true, confirmLabel: 'Eliminar' }, () => {
      selectedIds.forEach(id => deleteEntity('products', id))
      toast(`${selectedIds.size} productos eliminados`, 'in')
      setSelectedIds(new Set())
    })
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

  // ── Quick-cat helpers ────────────────────────────────────────────
  const quickChangeCat = (prod, newCat) => {
    saveEntity('products', { ...prod, cat: newCat, updatedAt: new Date().toISOString().slice(0,10) })
    setQuickCatPop(null)
    toast('Categoría actualizada', 'ok')
  }
  const quickAddNewCat = () => {
    const name = quickCatInput.trim()
    if (!name) return
    if (cats.includes(name)) { toast('Esa categoría ya existe', 'er'); return }
    updateConfig({ productCats: [...cats, name] })
    setQuickCatInput('')
    toast(`Categoría "${name}" creada`, 'ok')
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
    confirm({ body: `¿Eliminar categoría "${cat}"?${affected > 0 ? `\n${affected} producto${affected !== 1 ? 's' : ''} quedarán sin categoría.` : ''}`, danger: true, confirmLabel: 'Eliminar' }, () => {
      updateConfig({ productCats: cats.filter(c => c !== cat) })
      products.filter(p => p.cat === cat).forEach(p => saveEntity('products', { ...p, cat: '' }))
      toast(`Categoría eliminada`, 'in')
    })
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

  /* ── ESC cierra modales ── */
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        if (compDropdown) { setCompDropdown(false); return }
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
  }, [catMgmtModal, bulkCatModal, bulkSupplierModal, csvModal, bulkModal, priceUpdateModal, modal, compDropdown])

  // ── Auto-guardar borrador mientras el modal está abierto ──────────
  useEffect(() => {
    if (!modal) return
    const draft = { form, componentes, packagingItems, productMode, marginInput, _ts: Date.now() }
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)) } catch {}
  }, [form, componentes, packagingItems, productMode, marginInput, modal]) // eslint-disable-line

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

  // ── Helper: tarjeta de grilla reutilizable ────────────────────────
  const renderGridCard = (p) => {
    const pct = marginPct(p)
    const cc  = catColor(p.cat)
    const isKit = p.tipo === 'kit'
    return (
      <div key={p.id} className="prod-card" onClick={() => open(p)}>
        <div className="prod-card-img" style={{ background: isKit ? '#F5F3FF' : cc.bg }}>
          {p.image
            ? <img src={p.image} alt={p.name} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <i className={`fa ${isKit ? 'fa-gift' : 'fa-box-open'}`} style={{ fontSize: 38, color: isKit ? '#8B5CF6' : cc.color, opacity: .5 }} />
          }
          <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleSelect(p.id)}
            style={{ position: 'absolute', top: 8, left: 8, width: 16, height: 16, cursor: 'pointer' }}
            onClick={e => e.stopPropagation()} />
          {isKit && <div style={{ position: 'absolute', top: 8, right: 8 }}><KitBadge /></div>}
        </div>
        <div className="prod-card-body">
          <div className="prod-card-name" title={p.name}>{p.name}</div>
          <span className="prod-card-cat qcat-badge" style={{ background: isKit ? '#F5F3FF' : cc.bg, color: isKit ? '#8B5CF6' : cc.color }}
            onClick={e => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setQuickCatPop({ prod: p, x: r.left, y: r.bottom + 4 }); setQuickCatInput('') }}>
            {p.cat || '—'} <i className="fa fa-pen" />
          </span>
          {isKit && p.componentes?.length > 0 && (
            <div style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 2 }}>
              <i className="fa fa-layer-group" style={{ marginRight: 3 }} />
              {p.componentes.length} componente{p.componentes.length !== 1 ? 's' : ''}
            </div>
          )}
          {/* Precio sugerido y % margen removidos — se calculan al armar el presupuesto */}
          {!opHideCosts && <div className="prod-card-cost" style={{ fontWeight: 800, fontSize: 14, color: 'var(--money)' }}>{fmt(p.cost)}</div>}
          {p.stock != null && (
            <div style={{ marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: p.stock === 0 ? '#FEF2F2' : p.stock <= 5 ? '#FFFBEB' : '#F0FDF4', color: p.stock === 0 ? '#DC2626' : p.stock <= 5 ? '#D97706' : '#059669', border: `1px solid ${p.stock === 0 ? '#FECACA' : p.stock <= 5 ? '#FDE68A' : '#86EFAC'}` }}>
              <i className="fa fa-cubes-stacked" style={{ fontSize: 8 }} />
              {p.stock === 0 ? 'Sin stock' : `${p.stock} u.`}
            </div>
          )}
        </div>
        <div className="prod-card-foot">
          <button className="prod-card-foot-btn" onClick={e => { e.stopPropagation(); open(p) }}>
            <i className="fa fa-pen" /> Editar
          </button>
          <div className="prod-card-foot-sep" />
          <button className="prod-card-foot-btn prod-card-foot-del" onClick={e => { e.stopPropagation(); del(p.id) }}>
            <i className="fa fa-trash" />
          </button>
        </div>
      </div>
    )
  }

  // ── Helper: fila de tabla reutilizable (tabla lista + grupos) ─────
  const renderTableRow = (p) => {
    const pct = marginPct(p)
    const cc  = catColor(p.cat)
    const isKit = p.tipo === 'kit'
    return (
      <tr key={p.id}>
        <td style={{ textAlign: 'center' }}>
          <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleSelect(p.id)} style={{ cursor: 'pointer' }} />
        </td>
        <td>
          {p.image && <img src={p.image} alt={p.name} loading="lazy" decoding="async" style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 6, marginRight: 8, verticalAlign: 'middle', flexShrink: 0 }} />}
          {!p.image && isKit && <i className="fa fa-gift" style={{ color: '#8B5CF6', marginRight: 8, fontSize: 16, verticalAlign: 'middle' }} />}
          <span style={{ fontWeight: 800 }}>{p.name}</span>
          {isKit && <span style={{ marginLeft: 6, verticalAlign: 'middle' }}><KitBadge small /></span>}
        </td>
        <td className="col-hide-mobile">
          {/* Categoría editable inline. Click → abre dropdown con cats del workspace.
              Cambio se guarda al instante. Misma estética que ANMA Pro. */}
          <select
            value={p.cat || ''}
            onChange={e => saveEntity('products', { ...p, cat: e.target.value, updatedAt: new Date().toISOString().slice(0,10) })}
            spellCheck={false}
            title="Click para cambiar categoría"
            style={{
              display: 'inline-flex', alignItems: 'center',
              background: cc.bg, color: cc.color,
              fontSize: 12, fontWeight: 700,
              padding: '5px 24px 5px 12px', borderRadius: 20,
              whiteSpace: 'nowrap', border: 'none', cursor: 'pointer',
              WebkitAppearance: 'none', MozAppearance: 'none', appearance: 'none',
              textDecoration: 'none', textDecorationLine: 'none',
              outline: 'none', fontFamily: 'inherit', lineHeight: 1.3,
            }}
          >
            <option value="">— Sin categoría —</option>
            {cats.map(cat => <option key={cat} value={cat}>{cat}</option>)}
          </select>
          <i className="fa fa-chevron-down" style={{ fontSize: 8, color: cc.color, marginLeft: -18, pointerEvents: 'none', opacity: .6 }} />
        </td>
        <td className="col-hide-mobile">{supplierName(p.supplierId)}</td>
        {!opHideCosts && <td>
          <span>{fmt(p.cost)}</span>
          {isKit && p.componentes?.length > 0 && (
            <span style={{ fontSize: 9, color: 'var(--txt4)', marginLeft: 4 }}>({p.componentes.length} comp.)</span>
          )}
        </td>}
        {/* Columna % Margen removida — el margen lo define el presupuesto */}
        {showCostInfo && (
          <td className="col-hide-mobile" style={{ fontSize: 11 }}>
            {p.updatedAt ? (
              <span style={{ color: (() => { const days = Math.floor((Date.now() - new Date(p.updatedAt)) / 86400000); return days > 180 ? '#DC2626' : days > 60 ? '#D97706' : '#16A34A' })(), fontWeight: 600 }}>
                {(() => { const days = Math.floor((Date.now() - new Date(p.updatedAt)) / 86400000); if (days === 0) return 'Hoy'; if (days === 1) return 'Ayer'; if (days < 30) return `hace ${days}d`; if (days < 365) return `hace ${Math.floor(days/30)}m`; return `hace ${Math.floor(days/365)}a` })()}
              </span>
            ) : <span style={{ color: 'var(--txt4)' }}>—</span>}
          </td>
        )}
        <td className="col-hide-mobile">
          {p.stock != null
            ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: p.stock === 0 ? '#FEF2F2' : p.stock <= 5 ? '#FFFBEB' : '#F0FDF4', color: p.stock === 0 ? '#DC2626' : p.stock <= 5 ? '#D97706' : '#059669', border: `1px solid ${p.stock === 0 ? '#FECACA' : p.stock <= 5 ? '#FDE68A' : '#86EFAC'}` }}>
                <i className="fa fa-cubes-stacked" style={{ fontSize: 9 }} />
                {p.stock === 0 ? 'Sin stock' : `${p.stock} u.`}
              </span>
            : <span style={{ color: 'var(--txt4)', fontSize: 12 }}>—</span>
          }
        </td>
        {/* Columna Precio sugerido removida — se calcula al armar el presupuesto */}
        <td><div className="acts" style={{ display:'flex',gap:5 }}>
          <button onClick={() => open(p)} title="Editar" style={{ width:28,height:28,borderRadius:'50%',border:'1.5px solid var(--border2)',background:'var(--surface2)',color:'var(--txt2)',cursor:'pointer',fontSize:11,display:'inline-flex',alignItems:'center',justifyContent:'center',padding:0,flexShrink:0,transition:'all .15s' }}><i className="fa fa-pen" /></button>
          <button onClick={() => del(p.id)} title="Eliminar" style={{ width:28,height:28,borderRadius:'50%',border:'1.5px solid #FECACA',background:'#FEF2F2',color:'#DC2626',cursor:'pointer',fontSize:11,display:'inline-flex',alignItems:'center',justifyContent:'center',padding:0,flexShrink:0,transition:'all .15s' }}><i className="fa fa-trash" /></button>
        </div></td>
      </tr>
    )
  }

  return (
    <div className="page active" style={{ animation: 'pgIn .25s ease both' }}>
      {/* Banner: categorías desactualizadas para regalos */}
      {showCatsUpgrade && (
        <div style={{
          background: 'linear-gradient(135deg, #F5F3FF 0%, #EFF6FF 100%)',
          border: '1px solid #C4B5FD', borderRadius: 12,
          padding: '12px 16px', marginBottom: 12,
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        }}>
          <i className="fa fa-wand-magic-sparkles" style={{ color: '#7C3AED', fontSize: 18, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 220, fontSize: 12.5, color: '#1E1B4B', lineHeight: 1.5 }}>
            <b>Tenemos 12 categorías más realistas para regalos.</b>
            <br/>
            <span style={{ color: '#4C1D95', opacity: .8 }}>Bebidas y vinos, picadas y gourmet, mates y termos, tablas, bolsos… ¿Querés actualizarlas?</span>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button onClick={dismissCatsUpgrade}
              style={{ background: 'transparent', border: '1px solid #C4B5FD', color: '#6D28D9', padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              Ahora no
            </button>
            <button onClick={applyCatsUpgrade}
              style={{ background: '#7C3AED', border: 'none', color: '#fff', padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <i className="fa fa-wand-magic-sparkles" /> Aplicar sugeridas
            </button>
          </div>
        </div>
      )}
      <div className="ph cat-ph" style={{ marginBottom: 6 }}>
        <div className="ph-right" style={{ gap: 6 }}>
          <div className="cli-pill-group">
            <button className="cli-pill" onClick={() => setPriceUpdateModal(true)}>
              <i className="fa fa-percent" /><span>Precios</span>
            </button>
            <button className="cli-pill" onClick={() => { setCsvCat(cats[0] || ''); setCsvModal(true) }}>
              <i className="fa fa-file-csv" /><span>Exportar</span>
            </button>
            <button className="cli-pill" onClick={() => { setBulkCat(cats[0] || ''); setBulkModal(true) }}>
              <i className="fa fa-file-import" /><span>Importar</span>
            </button>
            {/* ── View mode toggle ── */}
            <div style={{ display: 'inline-flex', border: '1.5px solid var(--border)', borderRadius: 9999, overflow: 'hidden', background: 'var(--surface)' }}>
              <button title="Vista cuadrícula" onClick={() => switchView('grid')}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, border: 'none', cursor: 'pointer', fontSize: 13, transition: 'all .15s', background: viewMode === 'grid' ? 'var(--brand)' : 'transparent', color: viewMode === 'grid' ? '#fff' : 'var(--txt3)' }}>
                <i className="fa fa-border-all" />
              </button>
              <button title="Vista lista" onClick={() => switchView('table')}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, border: 'none', cursor: 'pointer', fontSize: 13, transition: 'all .15s', background: viewMode === 'table' ? 'var(--brand)' : 'transparent', color: viewMode === 'table' ? '#fff' : 'var(--txt3)' }}>
                <i className="fa fa-list" />
              </button>
            </div>
          </div>
          <button className="cli-pill-new" onClick={() => open()}>
            <i className="fa fa-plus" /><span>Nuevo</span>
          </button>
        </div>
      </div>

      <style>{`
        .cli-pill-group{display:inline-flex;align-items:center;gap:6px}
        .cli-pill{display:inline-flex;align-items:center;gap:6px;height:44px;padding:0 18px;border-radius:9999px;border:1.5px solid var(--border);background:var(--surface);color:var(--txt2);font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;line-height:1;white-space:nowrap;-webkit-tap-highlight-color:transparent;transition:all .15s}
        .cli-pill:hover{border-color:var(--brand);color:var(--brand);background:var(--brand-xlt)}
        .cli-pill:active{transform:scale(.95)}
        .cli-pill i{font-size:12px}
        .cli-pill-new{display:inline-flex;align-items:center;gap:6px;height:44px;padding:0 20px;border-radius:9999px;border:none;background:var(--color-principal);color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;line-height:1;white-space:nowrap;-webkit-tap-highlight-color:transparent;transition:all .18s;box-shadow:0 4px 14px var(--brand-dim)}
        .cli-pill-new:hover{filter:brightness(1.08);transform:translateY(-1px)}
        .cli-pill-new:active{transform:scale(.95)}
        .cli-pill-new i{font-size:11px}
        @media(max-width:640px){.cli-pill{padding:7px 9px}.cli-pill-new{padding:7px 12px}.cat-ph{display:none!important}.modal-3col{grid-template-columns:1fr!important}}
        @media(max-width:480px){.cat-price-calc{grid-template-columns:1fr!important}.cat-price-arrow{display:none!important}}
        .comp-row{display:grid;grid-template-columns:1fr 56px 80px 30px;gap:6px;align-items:center;padding:8px 10px;border-radius:8px;background:var(--surface);border:1px solid var(--border);margin-bottom:5px}
        .comp-row input{padding:5px 8px;border:1.5px solid var(--border);border-radius:7px;font-size:12px;font-family:inherit;color:var(--txt);background:var(--surface);outline:none;width:100%;box-sizing:border-box}
        .comp-row input:focus{border-color:var(--brand)}
        .comp-add-row{display:grid;grid-template-columns:1fr 64px 88px auto;gap:6px;align-items:end;margin-top:8px}
        @media(max-width:520px){.comp-add-row{grid-template-columns:1fr 52px 72px auto}.comp-row{grid-template-columns:1fr 48px 72px 28px}}
        .qcat-badge{cursor:pointer;transition:filter .12s,transform .12s;display:inline-flex;align-items:center;gap:4px}
        .qcat-badge:hover{filter:brightness(.92);transform:scale(.97)}
        .qcat-badge i{font-size:8px;opacity:.6}
        .qcat-pop{position:fixed;z-index:700;background:var(--surface);border:1.5px solid var(--border);border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.18);min-width:200px;max-width:240px;overflow:hidden;animation:pgIn .15s ease both}
        .qcat-pop-item{display:flex;align-items:center;justify-content:space-between;padding:8px 12px;font-size:12px;font-weight:600;cursor:pointer;transition:background .1s;gap:6px}
        .qcat-pop-item:hover{background:var(--surface2)}
        .qcat-pop-item.active{background:var(--brand-xlt);color:var(--brand)}
        .grp-section-hd{display:flex;align-items:center;gap:8px;padding:7px 10px 7px 4px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.7px;color:var(--txt3);margin-top:4px;cursor:pointer;border-radius:8px;user-select:none;transition:background .12s}
        .grp-section-hd:hover{background:var(--surface2)}
        .grp-section-hd:first-child{margin-top:0}
        .grp-section-hd .grp-chevron{margin-left:auto;font-size:9px;opacity:.5;transition:transform .2s}
        .grp-section-hd .grp-badge{background:var(--surface2);border:1px solid var(--border);color:var(--txt3);font-size:9px;padding:1px 7px;border-radius:20px;font-weight:700}
        .bulk-import-sheet{width:100%;max-width:600px;background:var(--surface);display:flex;flex-direction:column;overflow:hidden;box-shadow:var(--sh-lg);max-height:92vh;max-height:92dvh;border-radius:18px;animation:pgIn .2s ease both;margin:auto}
        .bulk-import-sheet .mob-only-handle{display:none}
        @media(max-width:768px){
          .bulk-import-sheet{border-radius:20px 20px 0 0;max-width:100%;animation:slideUp .25s cubic-bezier(.32,.72,0,1) both;margin:0}
          .bulk-import-sheet .mob-only-handle{display:flex}
          .modal-bg:has(.bulk-import-sheet){align-items:flex-end!important;padding:0!important}
        }
      `}</style>

      <div className="pill-row cat-pill-row">
        <div className="search-row" style={{ maxWidth: 280 }}><i className="fa fa-magnifying-glass" /><input type="text" placeholder="Buscar producto..." value={search} onChange={e => setSearch(e.target.value)} /></div>
        <div className="cat-scroll-row">
          <div className="cat-scroll-pills">
            {cats.length > 6 ? (
              <select
                value={catFilter}
                onChange={e => setCatFilter(e.target.value)}
                style={{ padding: '5px 10px', border: '1.5px solid var(--border)', borderRadius: 9, fontSize: 12, background: 'var(--surface)', color: 'var(--txt)', fontFamily: 'inherit', cursor: 'pointer' }}
              >
                <option value="all">Todas las categorías</option>
                {cats.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            ) : (
              <>
                <div className={`pill ${catFilter === 'all' ? 'active' : ''}`} onClick={() => setCatFilter('all')}>Todos</div>
                {cats.map(cat => <div key={cat} className={`pill ${catFilter === cat ? 'active' : ''}`} onClick={() => setCatFilter(cat)}>{cat}</div>)}
              </>
            )}
          </div>
          <button className="cat-gestionar" onClick={() => setCatMgmtModal(true)} title="Gestionar categorías">
            <i className="fa fa-sliders" /> Gestionar
          </button>
          {/* Agrupar toggle */}
          <button
            onClick={() => setGroupByType(v => !v)}
            title={groupByType ? 'Ver todos mezclados' : 'Separar Productos y Kits'}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 40, padding: '0 13px', borderRadius: 10, border: `1.5px solid ${groupByType ? 'var(--brand)' : 'var(--border)'}`, background: groupByType ? 'var(--brand-xlt)' : 'var(--surface)', color: groupByType ? 'var(--brand)' : 'var(--txt3)', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', transition: 'all .15s', whiteSpace: 'nowrap', flexShrink: 0, WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}>
            <i className={`fa fa-${groupByType ? 'layer-group' : 'bars'}`} style={{ fontSize: 10 }} />
            {groupByType ? 'Agrupado' : 'Agrupar'}
          </button>
        </div>
      </div>

      {/* ── MOBILE CARD LIST (≤640px) ── */}
      <div className="cat-mob-list">
        {loading ? [1,2,3,4].map(i => (
          <div key={i} className="cat-mob-item">
            <div className="cat-mob-item-l" style={{ flex: 1 }}><div className="sk-line" style={{ height: 16, width: '55%' }} /></div>
          </div>
        )) : filtered.length ? filtered.map(p => {
          const cc = catColor(p.cat)
          const isKit = p.tipo === 'kit'
          return (
            <div key={p.id} className="cat-mob-item" onClick={() => open(p)}>
              <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleSelect(p.id)}
                style={{ cursor: 'pointer', flexShrink: 0, width: 16, height: 16 }}
                onClick={e => e.stopPropagation()} />
              <div className="cat-mob-item-l">
                {p.image
                  ? <img src={p.image} className="cat-mob-item-img" alt={p.name} loading="lazy" decoding="async" />
                  : <div className="cat-mob-item-noimg">
                      <i className={`fa ${isKit ? 'fa-gift' : 'fa-box-open'}`} style={{ color: isKit ? '#8B5CF6' : cc.color, fontSize: 16, opacity: .6 }} />
                    </div>
                }
                <div className="cat-mob-item-info">
                  <span className="cat-mob-item-name" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    {p.name}
                    {isKit && <KitBadge small />}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                    {p.cat && <span className="cat-mob-item-cat qcat-badge"
                      onClick={e => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setQuickCatPop({ prod: p, x: Math.min(r.left, window.innerWidth - 250), y: r.bottom + 4 }); setQuickCatInput('') }}>
                      {p.cat} <i className="fa fa-pen" />
                    </span>}
                    {p.stock != null && (
                      <span style={{ fontSize: 9.5, fontWeight: 700, padding: '1px 7px', borderRadius: 20, background: p.stock === 0 ? '#FEF2F2' : p.stock <= 5 ? '#FFFBEB' : '#F0FDF4', color: p.stock === 0 ? '#DC2626' : p.stock <= 5 ? '#D97706' : '#059669', border: `1px solid ${p.stock === 0 ? '#FECACA' : p.stock <= 5 ? '#FDE68A' : '#86EFAC'}` }}>
                        <i className="fa fa-cubes-stacked" style={{ marginRight: 3, fontSize: 8 }} />
                        {p.stock === 0 ? 'Sin stock' : `${p.stock} u.`}
                      </span>
                    )}
                  </div>
                </div>
                <span className="cat-mob-item-price">{fmt(p.cost)}</span>
              </div>
              <div className="cat-mob-item-acts" onClick={e => e.stopPropagation()} style={{ display:'flex',gap:5,alignItems:'center',flexShrink:0 }}>
                <button onClick={() => open(p)} title="Editar" style={{ width:30,height:30,borderRadius:'50%',border:'1.5px solid var(--border2)',background:'var(--surface2)',color:'var(--txt2)',cursor:'pointer',fontSize:11,display:'inline-flex',alignItems:'center',justifyContent:'center',flexShrink:0,padding:0,WebkitTapHighlightColor:'transparent' }}><i className="fa fa-pen" /></button>
                <button onClick={() => del(p.id)} title="Eliminar" style={{ width:30,height:30,borderRadius:'50%',border:'1.5px solid #FECACA',background:'#FEF2F2',color:'#DC2626',cursor:'pointer',fontSize:11,display:'inline-flex',alignItems:'center',justifyContent:'center',flexShrink:0,padding:0,WebkitTapHighlightColor:'transparent' }}><i className="fa fa-trash" /></button>
              </div>
            </div>
          )
        }) : (
          <div className="empty-native">
            <div className="ico"><i className="fa fa-box-open" /></div>
            <h4>Sin productos</h4>
            <p>Agregá tu primer producto al catálogo.</p>
          </div>
        )}
      </div>

      {/* ── DESKTOP TABLE / GRID (≥641px) ── */}
      <div className="cat-desk-view">
      {viewMode === 'table' ? (
        <div className="tbl-card">
          <table>
            <thead>
              <tr>
                <th style={{ width: 36, textAlign: 'center' }}>
                  <input type="checkbox" checked={isAllSelected} onChange={toggleSelectAll} style={{ cursor: 'pointer' }} />
                </th>
                <th>Producto</th>
                <th className="col-hide-mobile">Categoría</th>
                <th className="col-hide-mobile">Proveedor</th>
                {!opHideCosts && <th>
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
                </th>}
                {/* % Margen y Precio sugerido removidos — el margen se aplica al armar el presupuesto */}
                {showCostInfo && <th className="col-hide-mobile">Últ. actualización</th>}
                <th className="col-hide-mobile">Stock</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? [1,2,3,4].map(i => (
                <tr key={i}><td colSpan={showCostInfo ? 8 : 7}><div className="sk sk-text" style={{ height: 18, width: `${50 + Math.random() * 40}%` }} /></td></tr>
              )) : filtered.length ? (groupByType
                ? [
                    ...(prodsFiltered.length > 0 ? [
                      <tr key="__hd_prod" style={{ background: 'var(--surface)' }}>
                        <td colSpan={showCostInfo ? 8 : 7} style={{ paddingTop: 6, paddingBottom: 2, paddingLeft: 8 }}>
                          <div className="grp-section-hd" style={{ marginTop: 0 }} onClick={() => toggleGrp('prods')}>
                            <i className="fa fa-box" style={{ color: 'var(--brand)', fontSize: 11 }} />
                            Productos
                            <span className="grp-badge">{prodsFiltered.length}</span>
                            <i className={`fa fa-chevron-${collapsedGrps.prods ? 'right' : 'down'} grp-chevron`} />
                          </div>
                        </td>
                      </tr>,
                      ...(collapsedGrps.prods ? [] : prodsFiltered.map(p => renderTableRow(p)))
                    ] : []),
                    ...(kitsFiltered.length > 0 ? [
                      <tr key="__hd_kit" style={{ background: 'var(--surface)' }}>
                        <td colSpan={showCostInfo ? 8 : 7} style={{ paddingTop: 6, paddingBottom: 2, paddingLeft: 8 }}>
                          <div className="grp-section-hd" onClick={() => toggleGrp('kits')}>
                            <i className="fa fa-gift" style={{ color: '#8B5CF6', fontSize: 11 }} />
                            Kits & Boxes
                            <span className="grp-badge">{kitsFiltered.length}</span>
                            <i className={`fa fa-chevron-${collapsedGrps.kits ? 'right' : 'down'} grp-chevron`} />
                          </div>
                        </td>
                      </tr>,
                      ...(collapsedGrps.kits ? [] : kitsFiltered.map(p => renderTableRow(p)))
                    ] : []),
                  ]
                : filtered.map(p => renderTableRow(p))) : <tr><td colSpan={showCostInfo ? 8 : 7}><div className="empty"><div className="ico"><i className="fa fa-box-open" /></div><p>Sin productos</p></div></td></tr>}
            </tbody>
          </table>
        </div>
      ) : (
        /* ── GRID VIEW ── */
        <div className="prod-grid">
          {loading ? [1,2,3,4,5,6].map(i => (
            <div key={i} className="prod-card">
              <div className="prod-card-img" style={{ background: 'var(--surface3)' }}>
                <div className="sk-ava" style={{ width: 52, height: 52, borderRadius: 14 }} />
              </div>
              <div className="prod-card-body">
                <div className="sk-line" style={{ width: '75%' }} />
                <div className="sk-line" style={{ width: '45%', marginTop: 8 }} />
              </div>
            </div>
          )) : filtered.length ? (groupByType ? [
            ...(prodsFiltered.length > 0 ? [
              <div key="__ghd_prod" style={{ gridColumn: '1/-1' }}>
                <div className="grp-section-hd" onClick={() => toggleGrp('prods')}>
                  <i className="fa fa-box" style={{ color: 'var(--brand)', fontSize: 11 }} />
                  Productos
                  <span className="grp-badge">{prodsFiltered.length}</span>
                  <i className={`fa fa-chevron-${collapsedGrps.prods ? 'right' : 'down'} grp-chevron`} />
                </div>
              </div>,
              ...(collapsedGrps.prods ? [] : prodsFiltered.map(p => renderGridCard(p)))
            ] : []),
            ...(kitsFiltered.length > 0 ? [
              <div key="__ghd_kit" style={{ gridColumn: '1/-1' }}>
                <div className="grp-section-hd" onClick={() => toggleGrp('kits')}>
                  <i className="fa fa-gift" style={{ color: '#8B5CF6', fontSize: 11 }} />
                  Kits & Boxes
                  <span className="grp-badge">{kitsFiltered.length}</span>
                  <i className={`fa fa-chevron-${collapsedGrps.kits ? 'right' : 'down'} grp-chevron`} />
                </div>
              </div>,
              ...(collapsedGrps.kits ? [] : kitsFiltered.map(p => renderGridCard(p)))
            ] : []),
          ] : filtered.map(p => renderGridCard(p))) : (
            <div style={{ gridColumn: '1/-1' }}>
              <div className="empty-native">
                <div className="ico"><i className="fa fa-box-open" /></div>
                <h4>Sin productos</h4>
                <p>Agregá tu primer producto al catálogo.</p>
                <button className="btn btn-brand" onClick={() => setModal(true)}>
                  <i className="fa fa-plus" /> Agregar producto
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      </div>{/* /cat-desk-view */}

      {selectedIds.size > 0 && (
        <div className="bulk-float" style={{
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

      {/* ══════════════════════════════════════════════════
          MODAL PRODUCTO / KIT
      ══════════════════════════════════════════════════ */}
      {modal && (
        <div className="modal-bg open" style={{ padding: '6px 10px', alignItems: 'flex-start' }} onClick={e => { if (e.target === e.currentTarget) setModal(false) }}>
          <div className="modal-form-card prod-modal-card" style={{ width: '100%', maxWidth: productMode === 'kit' ? 1040 : 700, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            {/* ── HEADER FIJO ── */}
            <div className="mh" style={{ flexShrink: 0, padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <i className={`fa ${productMode === 'kit' ? 'fa-gift' : 'fa-box'}`} style={{ color: productMode === 'kit' ? '#8B5CF6' : 'var(--brand)', fontSize: 15 }} />
                {form.id ? 'Editar' : 'Nuevo'} {productMode === 'kit' ? 'Kit / Box' : 'producto'}
              </h3>
              <button className="mclose" onClick={() => setModal(false)}><i className="fa fa-xmark" /></button>
            </div>
            {/* ── BANNER BORRADOR ── */}
            {hasDraft && !form.id && (
              <div style={{ padding: '10px 20px', background: '#FFF7ED', borderBottom: '1px solid #FED7AA', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, animation: 'pgIn .2s ease both' }}>
                <i className="fa fa-clock-rotate-left" style={{ color: '#D97706', fontSize: 13, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: '#92400E' }}>
                  <b>Borrador guardado</b>{hasDraft.form?.name ? ` — ${hasDraft.form.name}` : ''}
                  <span style={{ fontSize: 10, color: '#B45309', marginLeft: 6 }}>
                    · hace {Math.max(1, Math.round((Date.now() - hasDraft._ts) / 60000))}min
                  </span>
                </div>
                <button className="btn btn-sm" style={{ background: '#D97706', color: '#fff', border: 'none', flexShrink: 0 }}
                  onClick={() => {
                    try {
                      setForm(hasDraft.form || {}); setComponentes(hasDraft.componentes || [])
                      setPackagingItems(hasDraft.packagingItems || []); setProductMode(hasDraft.productMode || 'producto')
                      setMarginInput(hasDraft.marginInput || String(margin)); setHasDraft(null)
                      toast('Borrador restaurado ✓', 'ok')
                    } catch { setHasDraft(null) }
                  }}>
                  <i className="fa fa-rotate-left" /> Restaurar
                </button>
                <button onClick={() => { try { localStorage.removeItem(DRAFT_KEY) } catch {}; setHasDraft(null) }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B45309', fontSize: 15, padding: '2px 4px', lineHeight: 1 }}>
                  <i className="fa fa-xmark" />
                </button>
              </div>
            )}
            {/* ── BODY SCROLLABLE ── */}
            <div ref={bodyRef} style={{ overflowY: 'auto', flex: 1, minHeight: 0, padding: '16px 20px 8px' }}>

            {/* ── TIPO: Producto terminado vs Kit/Box ── */}
            <div style={{ display: 'flex', gap: 5, marginBottom: 16, background: 'var(--surface2)', borderRadius: 12, padding: 5, border: '1px solid var(--border)' }}>
              <button onClick={() => setProductMode('producto')}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                  padding: '10px 14px', borderRadius: 9, border: 'none', fontFamily: 'inherit',
                  fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all .15s',
                  background: productMode === 'producto' ? 'var(--brand)' : 'transparent',
                  color: productMode === 'producto' ? '#fff' : 'var(--txt3)',
                }}>
                <i className="fa fa-box" style={{ fontSize: 13 }} /> Producto
              </button>
              <button onClick={() => setProductMode('kit')}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                  padding: '10px 14px', borderRadius: 9, border: 'none', fontFamily: 'inherit',
                  fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all .15s',
                  background: productMode === 'kit' ? 'linear-gradient(135deg,#8B5CF6,#DB2777)' : 'transparent',
                  color: productMode === 'kit' ? '#fff' : 'var(--txt3)',
                }}>
                <i className="fa fa-gift" style={{ fontSize: 13 }} /> Kit / Box
              </button>
            </div>

            {/* ══ KIT: 2 columnas │ PRODUCTO: 1 columna ══ */}
            {productMode === 'kit' ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, alignItems: 'start' }}>

              {/* ── COL IZQUIERDA: datos + componentes ── */}
              <div>

            {/* ── CARD 1: Datos del producto ── */}
            <div style={{ background: 'var(--surface2)', borderRadius: 12, padding: '14px 16px', marginBottom: 12, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--brand)', textTransform: 'uppercase', letterSpacing: '.7px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <i className={`fa ${productMode === 'kit' ? 'fa-gift' : 'fa-tag'}`} />
                {productMode === 'kit' ? 'Datos del Kit' : 'Datos del producto'}
              </div>
              <div className="fg"><label>{productMode === 'kit' ? 'Nombre del Kit *' : 'Nombre *'}</label>
                <input autoFocus tabIndex={1} type="text" value={form.name}
                  onChange={e => setF('name', e.target.value)}
                  placeholder={productMode === 'kit' ? 'Ej: Kit Bienestar, Box Día del Padre...' : 'Taza sublimada 11oz'} />
              </div>

              {/* Kit: solo Ocasión (Stock se ingresa en la card Producción) | Producto: 3 cols */}
              {productMode === 'kit' ? (
                <div className="fg" style={{ marginBottom: 0 }}>
                  <label><i className="fa fa-calendar-star" style={{ marginRight: 5, color: '#8B5CF6', fontSize: 10 }} />Ocasión / Tipo de evento</label>
                  <select tabIndex={2} value={form.cat} onChange={e => setF('cat', e.target.value)}>
                    {cats.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    {form.cat && !cats.includes(form.cat) && <option value={form.cat}>{form.cat}</option>}
                  </select>
                </div>
              ) : (
                /* ── Producto: 3 cols (Categoría + Proveedor + Stock) ── */
                <div className="modal-3col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 12px' }}>
                  <div className="fg" style={{ marginBottom: 0 }}><label>Categoría</label>
                    <select tabIndex={2} value={form.cat} onChange={e => setF('cat', e.target.value)}>
                      {cats.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                      {form.cat && !cats.includes(form.cat) && <option value={form.cat}>{form.cat}</option>}
                    </select>
                  </div>
                  <div className="fg" style={{ marginBottom: 0 }}><label>Proveedor</label>
                    <select tabIndex={3} value={form.supplierId} onChange={e => setF('supplierId', e.target.value)}>
                      <option value="">Sin asignar</option>
                      {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div className="fg" style={{ marginBottom: 0 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <i className="fa fa-cubes-stacked" style={{ color: form.stock !== '' && num(form.stock) <= 5 ? '#D97706' : 'var(--brand)', fontSize: 11 }} />
                      Stock <span style={{ fontWeight: 400, color: 'var(--txt4)', fontSize: 10 }}>(unid.)</span>
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input tabIndex={4} type="number" min="0" step="1" value={form.stock} onChange={e => setF('stock', e.target.value)} onFocus={selectOnFocus} placeholder="—" style={{ paddingRight: form.stock !== '' ? 52 : undefined }} />
                      {form.stock !== '' && <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 9, fontWeight: 800, padding: '2px 5px', borderRadius: 6, background: num(form.stock) === 0 ? '#FEF2F2' : num(form.stock) <= 5 ? '#FFFBEB' : '#F0FDF4', color: num(form.stock) === 0 ? '#DC2626' : num(form.stock) <= 5 ? '#D97706' : '#059669', pointerEvents: 'none' }}>{num(form.stock) === 0 ? 'AGOTADO' : num(form.stock) <= 5 ? 'BAJO' : 'OK'}</span>}
                    </div>
                  </div>
                </div>
              )}
            </div>{/* /card 1 */}

            {/* ══════════════════════════════════════════════
                CARD 2 KIT: CONSTRUCTOR DE COMPONENTES
            ══════════════════════════════════════════════ */}
            {true && (
              <div style={{
                background: 'linear-gradient(135deg, #FAF5FF, #FDF2F8)',
                borderRadius: 12, padding: '14px 16px', marginBottom: 12,
                border: '1.5px solid #DDD6FE',
              }}>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#8B5CF6', textTransform: 'uppercase', letterSpacing: '.7px', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <i className="fa fa-layer-group" /> Receta de 1 Kit
                      <span style={{ background: '#EDE9FE', color: '#8B5CF6', fontSize: 9, padding: '1px 6px', borderRadius: 10, fontWeight: 800 }}>
                        {componentes.length}
                      </span>
                    </div>
                    {componentes.length > 0 && (
                      <div style={{ fontSize: 11, fontWeight: 800, color: '#059669' }}>
                        insumos: {fmt(kitCost)}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--txt4)', marginTop: 3 }}>
                    <i className="fa fa-circle-info" style={{ marginRight: 4, color: '#A78BFA' }} />
                    Ingresá los insumos y packaging que lleva <strong style={{ color: '#8B5CF6' }}>1 sola unidad</strong> del kit
                  </div>
                </div>

                {/* Lista de componentes agregados */}
                {componentes.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    {/* Headers */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 56px 80px 30px', gap: 6, padding: '0 10px 4px', fontSize: 9, fontWeight: 700, color: 'var(--txt4)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      <span>Componente</span><span style={{ textAlign: 'center' }}>Cant.</span><span style={{ textAlign: 'right' }}>Costo/u</span><span />
                    </div>
                    {componentes.map((comp, idx) => {
                      const lineCost = num(comp.qty) * num(comp.costoUnit)
                      return (
                        <div key={comp._cid} className="comp-row" style={{ background: idx % 2 === 0 ? 'var(--surface)' : 'var(--surface2)' }}>
                          <div style={{ minWidth: 0 }}>
                            <input
                              value={comp.nombre}
                              onChange={e => updateComp(comp._cid, 'nombre', e.target.value)}
                              style={{ fontWeight: 600 }}
                              placeholder="Componente"
                            />
                            {lineCost > 0 && (
                              <div style={{ fontSize: 9, color: 'var(--txt3)', marginTop: 1 }}>
                                Subtotal: <span style={{ fontWeight: 700, color: '#059669' }}>{fmt(lineCost)}</span>
                                {comp.productId && <span style={{ marginLeft: 4, color: '#8B5CF6' }}><i className="fa fa-link" /></span>}
                              </div>
                            )}
                          </div>
                          <input
                            type="number" min="0.1" step="0.1"
                            value={comp.qty}
                            onChange={e => updateComp(comp._cid, 'qty', e.target.value)}
                            onFocus={selectOnFocus}
                            style={{ textAlign: 'center' }}
                          />
                          <input
                            type="number" min="0"
                            value={comp.costoUnit}
                            onChange={e => updateComp(comp._cid, 'costoUnit', e.target.value)}
                            onFocus={selectOnFocus}
                            style={{ textAlign: 'right' }}
                          />
                          <button
                            onClick={() => removeComp(comp._cid)}
                            style={{ width: 26, height: 26, border: '1px solid #FECACA', background: '#FFF1F2', color: '#DC2626', borderRadius: 6, cursor: 'pointer', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                          >
                            <i className="fa fa-xmark" />
                          </button>
                        </div>
                      )
                    })}
                    {/* Barra de costo componentes */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px 0', gap: 6 }}>
                      <span style={{ fontSize: 11, color: 'var(--txt3)' }}>
                        {componentes.length} componente{componentes.length !== 1 ? 's' : ''}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#059669' }}>
                        Subtotal productos: {fmt(kitCost)}
                      </span>
                    </div>
                  </div>
                )}

                {/* ── PACKAGING: ítems individuales ── */}
                <div style={{ marginTop: 8, background: 'rgba(255,255,255,.7)', borderRadius: 10, border: '1.5px solid #FBCFE8', overflow: 'hidden' }}>
                  {/* Header packaging */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'linear-gradient(90deg,#FDF2F8,#FFF5FB)', borderBottom: '1px solid #FBCFE8' }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: '#DB2777', textTransform: 'uppercase', letterSpacing: .6, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <i className="fa fa-gift" style={{ fontSize: 11 }} /> Packaging / Presentación
                      {packagingItems.length > 0 && (
                        <span style={{ background: '#FCE7F3', color: '#DB2777', fontSize: 9, padding: '1px 6px', borderRadius: 10, fontWeight: 800 }}>
                          {packagingItems.length}
                        </span>
                      )}
                    </div>
                    {packTotal > 0 && (
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 9, color: 'var(--txt4)', fontWeight: 600 }}>TOTAL PACKAGING</div>
                        <div style={{ fontSize: 13, fontWeight: 900, color: '#DB2777' }}>{fmt(packTotal)}</div>
                      </div>
                    )}
                  </div>
                  <div style={{ padding: '8px 12px' }}>
                    {/* Lista de ítems agregados */}
                    {packagingItems.length > 0 && (
                      <div style={{ marginBottom: 8, maxHeight: 168, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 44px 70px 26px', gap: 4, padding: '0 6px 3px', fontSize: 9, fontWeight: 700, color: 'var(--txt4)', textTransform: 'uppercase', letterSpacing: 0.4, position: 'sticky', top: 0, background: 'rgba(255,255,255,.9)' }}>
                          <span>Ítem</span><span style={{ textAlign: 'center' }}>Cant.</span><span style={{ textAlign: 'right' }}>Costo</span><span />
                        </div>
                        {packagingItems.map((p, idx) => {
                          const lineCost = num(p.qty) * num(p.costoUnit)
                          return (
                            <div key={p._pid} style={{ display: 'grid', gridTemplateColumns: '1fr 44px 70px 26px', gap: 4, alignItems: 'center', padding: '5px 6px', borderRadius: 7, background: idx % 2 === 0 ? 'var(--surface)' : '#FFF5FB', marginBottom: 3 }}>
                              <div>
                                <input
                                  value={p.nombre}
                                  onChange={e => updatePackaging(p._pid, 'nombre', e.target.value)}
                                  style={{ width: '100%', padding: '4px 7px', border: '1px solid #FBCFE8', borderRadius: 6, fontSize: 11.5, fontFamily: 'inherit', color: 'var(--txt)', background: 'transparent', fontWeight: 600, boxSizing: 'border-box' }}
                                />
                                {lineCost > 0 && <div style={{ fontSize: 9, color: '#DB2777', fontWeight: 700, paddingLeft: 4 }}>{fmt(lineCost)}</div>}
                              </div>
                              <input type="number" min="1" step="1" value={p.qty}
                                onChange={e => updatePackaging(p._pid, 'qty', e.target.value)}
                                onFocus={selectOnFocus}
                                style={{ padding: '4px 5px', border: '1px solid #FBCFE8', borderRadius: 6, fontSize: 11.5, fontFamily: 'inherit', textAlign: 'center', width: '100%', boxSizing: 'border-box' }}
                              />
                              <input type="number" min="0" value={p.costoUnit}
                                onChange={e => updatePackaging(p._pid, 'costoUnit', e.target.value)}
                                onFocus={selectOnFocus}
                                style={{ padding: '4px 5px', border: '1px solid #FBCFE8', borderRadius: 6, fontSize: 11.5, fontFamily: 'inherit', textAlign: 'right', width: '100%', boxSizing: 'border-box' }}
                              />
                              <button onClick={() => removePackaging(p._pid)}
                                style={{ width: 22, height: 22, border: '1px solid #FECACA', background: '#FFF1F2', color: '#DC2626', borderRadius: 5, cursor: 'pointer', fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <i className="fa fa-xmark" />
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    )}
                    {/* Chips rápidos */}
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: '#DB2777', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <i className="fa fa-bolt" style={{ fontSize: 8 }} /> Agregar rápido
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {['Caja', 'Cinta/Ribbon', 'Papel tissue', 'Bolsa', 'Tarjeta', 'Virutas', 'Film', 'Sticker'].map(preset => (
                          <button key={preset}
                            type="button"
                            onMouseDown={e => {
                              e.preventDefault()
                              setPackForm(f => ({ ...f, nombre: preset }))
                              setTimeout(() => packCostRef.current?.focus(), 30)
                            }}
                            style={{ fontSize: 10, padding: '4px 10px', borderRadius: 20, border: `1.5px solid ${packForm.nombre === preset ? '#DB2777' : '#FBCFE8'}`, background: packForm.nombre === preset ? '#FCE7F3' : 'var(--surface)', color: packForm.nombre === preset ? '#DB2777' : 'var(--txt3)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, whiteSpace: 'nowrap', transition: 'all .12s', display: 'flex', alignItems: 'center', gap: 3 }}>
                            <i className="fa fa-plus" style={{ fontSize: 7, opacity: packForm.nombre === preset ? 1 : .5 }} />{preset}
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* Form agregar ítem */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 44px 70px auto', gap: 5, alignItems: 'end' }}>
                      <input
                        type="text" value={packForm.nombre}
                        onChange={e => setPackForm(f => ({ ...f, nombre: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPackaging() } }}
                        placeholder="Caja, cinta, tissue…"
                        style={{ padding: '6px 9px', border: '1.5px solid #FBCFE8', borderRadius: 7, fontSize: 12, fontFamily: 'inherit', color: 'var(--txt)', background: 'var(--surface)', width: '100%', boxSizing: 'border-box' }}
                      />
                      <input type="number" min="1" step="1" value={packForm.qty}
                        onChange={e => setPackForm(f => ({ ...f, qty: e.target.value }))}
                        onFocus={selectOnFocus}
                        placeholder="Cant."
                        style={{ padding: '6px 5px', border: '1.5px solid #FBCFE8', borderRadius: 7, fontSize: 12, fontFamily: 'inherit', textAlign: 'center', width: '100%', boxSizing: 'border-box' }}
                      />
                      <input ref={packCostRef} type="number" min="0" value={packForm.costoUnit}
                        onChange={e => setPackForm(f => ({ ...f, costoUnit: e.target.value }))}
                        onFocus={selectOnFocus}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPackaging() } }}
                        placeholder="$ Costo"
                        style={{ padding: '6px 5px', border: '1.5px solid #FBCFE8', borderRadius: 7, fontSize: 12, fontFamily: 'inherit', textAlign: 'right', width: '100%', boxSizing: 'border-box' }}
                      />
                      <button onClick={addPackaging}
                        disabled={!packForm.nombre.trim()}
                        style={{ height: 32, padding: '0 10px', borderRadius: 7, border: 'none', background: packForm.nombre.trim() ? 'linear-gradient(135deg,#DB2777,#9333EA)' : 'var(--surface3)', color: packForm.nombre.trim() ? '#fff' : 'var(--txt4)', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 3, transition: 'all .15s' }}>
                        <i className="fa fa-plus" /> Agregar
                      </button>
                    </div>
                    {packForm.costoUnit && num(packForm.qty) > 0 && num(packForm.costoUnit) > 0 && (
                      <div style={{ fontSize: 10, color: '#DB2777', marginTop: 4, textAlign: 'right', fontWeight: 700 }}>
                        Subtotal: {fmt(num(packForm.qty) * num(packForm.costoUnit))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Formulario para agregar componente */}
                <div style={{
                  background: 'rgba(255,255,255,.7)', borderRadius: 10, padding: '10px 12px',
                  border: '1px dashed #DDD6FE', marginTop: componentes.length > 0 ? 8 : 0,
                }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#8B5CF6', marginBottom: 7, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    <i className="fa fa-plus-circle" style={{ marginRight: 4 }} />Agregar componente
                  </div>
                  <div className="comp-add-row">
                    {/* Campo nombre con dropdown de catálogo */}
                    <div style={{ position: 'relative' }}>
                      <input
                        ref={compInputRef}
                        type="text"
                        value={compSearch}
                        onChange={e => {
                          const v = e.target.value
                          setCompSearch(v)
                          setCompForm(f => ({ ...f, nombre: v, productId: null }))
                          setCompDropdown(true)
                        }}
                        onFocus={() => setCompDropdown(true)}
                        onBlur={() => setTimeout(() => setCompDropdown(false), 150)}
                        placeholder="Nombre o buscar del catálogo…"
                        style={{
                          width: '100%', padding: '7px 10px',
                          border: '1.5px solid #DDD6FE', borderRadius: 8,
                          fontSize: 12, fontFamily: 'inherit', color: 'var(--txt)',
                          background: 'var(--surface)', outline: 'none', boxSizing: 'border-box',
                        }}
                        onFocusCapture={e => e.target.style.borderColor = '#8B5CF6'}
                        onBlurCapture={e  => e.target.style.borderColor = '#DDD6FE'}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addComp() } }}
                      />
                      {/* Dropdown de sugerencias */}
                      {compDropdown && compSuggestions.length > 0 && (
                        <div style={{
                          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 400,
                          background: 'var(--surface)', border: '1.5px solid #DDD6FE',
                          borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.12)',
                          maxHeight: 200, overflowY: 'auto', marginTop: 2,
                        }}>
                          {compSearch && (
                            <div
                              onMouseDown={() => { setCompForm(f => ({ ...f, nombre: compSearch, productId: null })); setCompDropdown(false) }}
                              style={{ padding: '8px 12px', fontSize: 11.5, cursor: 'pointer', color: 'var(--txt3)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6 }}
                            >
                              <i className="fa fa-pen" style={{ color: '#94A3B8' }} />
                              Usar "<b>{compSearch}</b>" como componente libre
                            </div>
                          )}
                          {compSuggestions.map(p => (
                            <div
                              key={p.id}
                              onMouseDown={() => selectFromCatalog(p)}
                              style={{
                                padding: '9px 12px', fontSize: 12, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                borderBottom: '1px solid var(--border)',
                                transition: 'background .1s',
                              }}
                              onMouseEnter={e => e.currentTarget.style.background = '#F5F3FF'}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            >
                              <span style={{ fontWeight: 600, color: 'var(--txt)', display: 'flex', alignItems: 'center', gap: 5 }}>
                                <i className={`fa ${p._source === 'insumo' ? 'fa-wrench' : 'fa-box'}`} style={{ color: p._source === 'insumo' ? '#F59E0B' : '#8B5CF6', fontSize: 9 }} />
                                {p.name}
                                {p._source === 'insumo' && <span style={{ fontSize: 9, fontWeight: 700, background: '#FFFBEB', color: '#D97706', border: '1px solid #FDE68A', padding: '1px 5px', borderRadius: 8 }}>INSUMO</span>}
                              </span>
                              <span style={{ fontSize: 11, color: '#059669', fontWeight: 700 }}>{fmt(p.cost)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Cantidad */}
                    <input
                      type="number" min="0.1" step="0.1"
                      value={compForm.qty}
                      onChange={e => setCompForm(f => ({ ...f, qty: e.target.value }))}
                      onFocus={selectOnFocus}
                      placeholder="Cant."
                      style={{
                        padding: '7px 8px', border: '1.5px solid #DDD6FE', borderRadius: 8,
                        fontSize: 12, fontFamily: 'inherit', color: 'var(--txt)',
                        background: 'var(--surface)', textAlign: 'center', width: '100%', boxSizing: 'border-box',
                      }}
                    />

                    {/* Costo unitario */}
                    <input
                      type="number" min="0"
                      value={compForm.costoUnit}
                      onChange={e => setCompForm(f => ({ ...f, costoUnit: e.target.value }))}
                      onFocus={selectOnFocus}
                      placeholder="$ Costo"
                      style={{
                        padding: '7px 8px', border: '1.5px solid #DDD6FE', borderRadius: 8,
                        fontSize: 12, fontFamily: 'inherit', color: 'var(--txt)',
                        background: 'var(--surface)', textAlign: 'right', width: '100%', boxSizing: 'border-box',
                      }}
                    />

                    {/* Botón Agregar */}
                    <button
                      onClick={addComp}
                      disabled={!(compForm.nombre || compSearch).trim()}
                      style={{
                        height: 34, padding: '0 12px', borderRadius: 8, border: 'none',
                        background: (compForm.nombre || compSearch).trim() ? 'linear-gradient(135deg,#8B5CF6,#DB2777)' : 'var(--surface3)',
                        color: (compForm.nombre || compSearch).trim() ? '#fff' : 'var(--txt4)',
                        fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                        whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4,
                        transition: 'all .15s',
                      }}
                    >
                      <i className="fa fa-plus" /> Agregar
                    </button>
                  </div>

                  {/* Subtotal en tiempo real del form */}
                  {compForm.costoUnit && num(compForm.qty) > 0 && num(compForm.costoUnit) > 0 && (
                    <div style={{ fontSize: 10.5, color: 'var(--txt3)', marginTop: 6, textAlign: 'right' }}>
                      Subtotal: <span style={{ color: '#059669', fontWeight: 700 }}>
                        {fmt(num(compForm.qty) * num(compForm.costoUnit))}
                      </span>
                    </div>
                  )}
                </div>

                {/* Mensaje vacío */}
                {componentes.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '10px 0 4px', fontSize: 11, color: 'var(--txt4)' }}>
                    <i className="fa fa-arrow-up" style={{ marginRight: 4 }} />
                    Buscá en el catálogo o escribí un componente libre
                  </div>
                )}

                {/* ═══ COSTO TOTAL DE 1 KIT — resumen prominente ═══ */}
                {kitTotal > 0 && (
                  <div style={{ marginTop: 14, padding: '12px 14px', background: 'linear-gradient(135deg,#F0FDF4,#ECFDF5)', borderRadius: 10, border: '2px solid #6EE7B7', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 800, color: '#059669', textTransform: 'uppercase', letterSpacing: .6 }}>
                        <i className="fa fa-calculator" style={{ marginRight: 5 }} />Costo de 1 kit
                      </div>
                      {packTotal > 0 && kitCost > 0 && (
                        <div style={{ fontSize: 9, color: 'var(--txt3)', marginTop: 2 }}>
                          insumos {fmt(kitCost)} + packaging {fmt(packTotal)}
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: '#059669' }}>{fmt(kitTotal)}</div>
                  </div>
                )}
              </div>
            )}

              </div>{/* /col izquierda */}

              {/* ── COL DERECHA: precio + imagen ── */}
              <div>

            {/* ── CARD COSTO · MARGEN · PRECIO ── */}
            <div style={{ background: 'var(--surface2)', borderRadius: 12, padding: '14px 16px', marginBottom: 12, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--brand)', textTransform: 'uppercase', letterSpacing: '.7px', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <i className="fa fa-coins" /> {productMode === 'kit' ? 'Precio por 1 Kit' : 'Costo · Margen · Precio'}
              </div>
              {productMode === 'kit' && (
                <div style={{ fontSize: 10, color: 'var(--txt4)', marginBottom: 10 }}>
                  Cargá el costo del kit (auto si tiene componentes) — el precio final lo definís en el presupuesto.
                </div>
              )}
              <div className="cat-price-calc" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0 6px', alignItems: 'end', maxWidth: 320 }}>
                <div className="fg" style={{ marginBottom: 0 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <i className="fa fa-arrow-trend-down" style={{ color: 'var(--txt3)', fontSize: 10 }} />
                    {productMode === 'kit' ? 'Costo del Kit (auto)' : 'Costo del producto'}
                  </label>
                  {productMode === 'kit' ? (
                    // Costo auto-calculado — read only con indicador visual
                    <div style={{
                      padding: '8px 10px', background: componentes.length > 0 ? '#F0FDF4' : 'var(--surface)',
                      border: `1.5px solid ${componentes.length > 0 ? '#86EFAC' : 'var(--border)'}`,
                      borderRadius: 8, fontSize: 13, fontWeight: 800,
                      color: componentes.length > 0 ? '#059669' : 'var(--txt4)',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <i className="fa fa-calculator" style={{ fontSize: 10 }} />
                      <span>
                        {componentes.length > 0 || packTotal > 0 ? fmt(kitTotal) : '— Agregá componentes'}
                        {packTotal > 0 && kitCost > 0 && (
                          <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--txt3)', display: 'block' }}>
                            prod {fmt(kitCost)} + pkg {fmt(packTotal)}
                          </span>
                        )}
                      </span>
                    </div>
                  ) : (
                    <input tabIndex={5} type="number" value={form.cost} onFocus={selectOnFocus} onChange={e => onCostChange(e.target.value)} onBlur={e => { if (e.target.value === '') setF('cost', 0) }} min="0" />
                  )}
                </div>
                {/* Margen y Precio de Venta removidos — se aplican al armar el presupuesto */}
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--txt3)', marginTop: 8, fontStyle: 'italic' }}>
                <i className="fa fa-circle-info" style={{ marginRight: 4, opacity: .7 }} />
                El margen y precio de venta se definen al armar el presupuesto. Acá solo cargás el costo.
              </div>
            </div>

            {/* ── CARD PRODUCCIÓN & STOCK (kit mode only) ── */}
            <div style={{ background: 'var(--surface2)', borderRadius: 12, padding: '14px 16px', marginBottom: 12, border: '1.5px solid #6EE7B7' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: '.7px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <i className="fa fa-boxes-stacked" /> Producción & Stock inicial
              </div>
              <div className="fg" style={{ marginBottom: kitTotal > 0 && num(form.stock) > 0 ? 10 : 0 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <i className="fa fa-hashtag" style={{ color: '#059669', fontSize: 10 }} />
                  ¿Cuántos kits vas a armar?
                  <span style={{ fontWeight: 400, color: 'var(--txt4)', fontSize: 10 }}>(= stock inicial)</span>
                </label>
                <input type="number" min="0" step="1" value={form.stock} onChange={e => setF('stock', e.target.value)} onFocus={selectOnFocus} placeholder="Ej: 25" style={{ borderColor: '#6EE7B7', borderWidth: '1.5px' }} />
              </div>
              {/* Batch math — solo si hay cantidad Y costo */}
              {num(form.stock) > 0 && kitTotal > 0 && (
                <div style={{ background: 'rgba(255,255,255,.8)', borderRadius: 8, border: '1px solid #A7F3D0', overflow: 'hidden' }}>
                  <div style={{ padding: '7px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #D1FAE5' }}>
                    <span style={{ fontSize: 11, color: 'var(--txt3)' }}>Costo · 1 kit</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt)' }}>{fmt(kitTotal)}</span>
                  </div>
                  <div style={{ padding: '7px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#FEF2F2', borderBottom: '1px solid #FECACA' }}>
                    <span style={{ fontSize: 11, color: '#DC2626', fontWeight: 600 }}>Inversión total · {num(form.stock)} kits</span>
                    <span style={{ fontSize: 14, fontWeight: 900, color: '#DC2626' }}>{fmt(kitTotal * num(form.stock))}</span>
                  </div>
                  {num(form.price) > 0 && (<>
                    <div style={{ padding: '7px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #DBEAFE' }}>
                      <span style={{ fontSize: 11, color: '#2563EB', fontWeight: 600 }}>Ingresos si vendés todo</span>
                      <span style={{ fontSize: 12, fontWeight: 800, color: '#2563EB' }}>{fmt(num(form.price) * num(form.stock))}</span>
                    </div>
                    <div style={{ padding: '9px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: num(form.price) > kitTotal ? '#F0FDF4' : '#FEF2F2' }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: num(form.price) > kitTotal ? '#059669' : '#DC2626' }}>
                        <i className={`fa fa-arrow-trend-${num(form.price) > kitTotal ? 'up' : 'down'}`} style={{ marginRight: 5 }} />
                        Ganancia neta total
                      </span>
                      <span style={{ fontSize: 15, fontWeight: 900, color: num(form.price) > kitTotal ? '#059669' : '#DC2626' }}>
                        {fmt((num(form.price) - kitTotal) * num(form.stock))}
                      </span>
                    </div>
                  </>)}
                </div>
              )}
              {/* Hint cuando faltan datos */}
              {(num(form.stock) === 0 || form.stock === '') && (
                <div style={{ fontSize: 10, color: 'var(--txt4)', textAlign: 'center', padding: '2px 0' }}>
                  <i className="fa fa-arrow-up" style={{ marginRight: 3 }} />Ingresá la cantidad para ver la inversión total
                </div>
              )}
            </div>

            {/* ── ACORDEÓN: Configuración avanzada ── */}
            <button onClick={() => setShowAdvanced(s => !s)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, color: 'var(--txt2)', marginBottom: showAdvanced ? 0 : 4 }}>
              <span><i className="fa fa-sliders" style={{ marginRight: 6, color: 'var(--brand)' }} />Imagen y configuración avanzada</span>
              <i className={`fa fa-chevron-${showAdvanced ? 'up' : 'down'}`} style={{ fontSize: 11 }} />
            </button>
            {showAdvanced && (
              <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 10px 10px', padding: '14px 16px', marginBottom: 4 }}>
                {/* Imagen del kit */}
                <div className="fg" style={{ marginBottom: 12 }}>
                  <label>Imagen del kit <span style={{ fontWeight: 400, color: 'var(--txt3)' }}>(opcional)</span></label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {form.image
                      ? <img src={form.image} alt="preview" style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 8, border: '1.5px solid var(--border)', flexShrink: 0 }} />
                      : <div style={{ width: 60, height: 60, borderRadius: 8, border: '1.5px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: '#F5F3FF' }}>
                          <i className="fa fa-gift" style={{ color: '#8B5CF6', fontSize: 20, opacity: .5 }} />
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
                {/* SKU + Tiempo de armado */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px', marginBottom: 10 }}>
                  <div className="fg" style={{ marginBottom: 0 }}>
                    <label><i className="fa fa-barcode" style={{ marginRight: 5, fontSize: 10, color: 'var(--txt3)' }} />SKU / Código interno</label>
                    <input type="text" value={form.sku || ''} onChange={e => setF('sku', e.target.value)} placeholder="KIT-001, BOX-PAPA..." />
                  </div>
                  <div className="fg" style={{ marginBottom: 0 }}>
                    <label><i className="fa fa-clock" style={{ marginRight: 5, fontSize: 10, color: 'var(--txt3)' }} />Tiempo de armado <span style={{ fontWeight: 400, color: 'var(--txt4)', fontSize: 10 }}>(días)</span></label>
                    <input type="number" min="0" value={form.leadDays || ''} onChange={e => setF('leadDays', e.target.value)} placeholder="1" />
                  </div>
                </div>
                {/* Notas internas */}
                <div className="fg" style={{ marginBottom: 0 }}>
                  <label><i className="fa fa-note-sticky" style={{ marginRight: 5, fontSize: 10, color: 'var(--txt3)' }} />Notas internas <span style={{ fontWeight: 400, color: 'var(--txt4)', fontSize: 10 }}>(no visible al cliente)</span></label>
                  <textarea value={form.internalNotes || ''} onChange={e => setF('internalNotes', e.target.value)} rows={2} placeholder="Instrucciones de armado, proveedores, condiciones especiales..." style={{ resize: 'vertical', fontFamily: 'inherit', fontSize: 12 }} />
                </div>
              </div>
            )}

              </div>
              </div>
            ) : (
              /* ══ PRODUCTO MODE: datos + precio + imagen ══ */
              <>
                {/* Card datos producto */}
                <div style={{ background: 'var(--surface2)', borderRadius: 12, padding: '14px 16px', marginBottom: 12, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--brand)', textTransform: 'uppercase', letterSpacing: '.7px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <i className="fa fa-tag" /> Datos del producto
                  </div>
                  <div className="fg"><label>Nombre *</label>
                    <input autoFocus type="text" value={form.name} onChange={e => setF('name', e.target.value)} placeholder="Taza sublimada 11oz" />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
                    <div className="fg" style={{ marginBottom: 0 }}><label>Categoría</label>
                      <select value={form.cat} onChange={e => setF('cat', e.target.value)}>
                        {cats.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                        {form.cat && !cats.includes(form.cat) && <option value={form.cat}>{form.cat}</option>}
                      </select>
                    </div>
                    <div className="fg" style={{ marginBottom: 0 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <i className="fa fa-cubes-stacked" style={{ color: form.stock !== '' && num(form.stock) <= 5 ? '#D97706' : 'var(--brand)', fontSize: 11 }} />
                        Stock <span style={{ fontWeight: 400, color: 'var(--txt4)', fontSize: 10 }}>(unid.)</span>
                      </label>
                      <div style={{ position: 'relative' }}>
                        <input type="number" min="0" step="1" value={form.stock} onChange={e => setF('stock', e.target.value)} onFocus={selectOnFocus} placeholder="—" style={{ paddingRight: form.stock !== '' ? 52 : undefined }} />
                        {form.stock !== '' && <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 9, fontWeight: 800, padding: '2px 5px', borderRadius: 6, background: num(form.stock) === 0 ? '#FEF2F2' : num(form.stock) <= 5 ? '#FFFBEB' : '#F0FDF4', color: num(form.stock) === 0 ? '#DC2626' : num(form.stock) <= 5 ? '#D97706' : '#059669', pointerEvents: 'none' }}>{num(form.stock) === 0 ? 'AGOTADO' : num(form.stock) <= 5 ? 'BAJO' : 'OK'}</span>}
                      </div>
                    </div>
                  </div>
                </div>
                {/* Card costo producto */}
                <div style={{ background: 'var(--surface2)', borderRadius: 12, padding: '14px 16px', marginBottom: 12, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--brand)', textTransform: 'uppercase', letterSpacing: '.7px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <i className="fa fa-coins" /> Costo unitario
                  </div>
                  <div className="fg" style={{ marginBottom: 0, maxWidth: 240 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <i className="fa fa-arrow-trend-down" style={{ color: 'var(--txt3)', fontSize: 10 }} /> Costo del producto ($)
                    </label>
                    <input type="number" value={form.cost} onFocus={selectOnFocus} onChange={e => onCostChange(e.target.value)} onBlur={e => { if (e.target.value === '') setF('cost', 0) }} min="0" />
                    <div style={{ fontSize: 10.5, color: 'var(--txt3)', marginTop: 5, fontStyle: 'italic' }}>
                      <i className="fa fa-circle-info" style={{ marginRight: 4, opacity: .7 }} />
                      El margen y precio final se calculan al armar el presupuesto.
                    </div>
                  </div>
                </div>
                {/* Configuración avanzada producto */}
                <button onClick={() => setShowAdvanced(s => !s)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: showAdvanced ? '10px 10px 0 0' : 10, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, color: 'var(--txt2)', marginBottom: showAdvanced ? 0 : 4 }}>
                  <span><i className="fa fa-sliders" style={{ marginRight: 6, color: 'var(--brand)' }} />Imagen y configuración avanzada</span>
                  <i className={`fa fa-chevron-${showAdvanced ? 'up' : 'down'}`} style={{ fontSize: 11 }} />
                </button>
                {showAdvanced && (
                  <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 10px 10px', padding: '14px 16px', marginBottom: 4 }}>
                    {/* Imagen del producto */}
                    <div className="fg" style={{ marginBottom: 12 }}>
                      <label>Imagen del producto <span style={{ fontWeight: 400, color: 'var(--txt3)' }}>(opcional)</span></label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {form.image ? <img src={form.image} alt="preview" style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 8, border: '1.5px solid var(--border)', flexShrink: 0 }} /> : <div style={{ width: 60, height: 60, borderRadius: 8, border: '1.5px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><i className="fa fa-image" style={{ color: 'var(--txt4)', fontSize: 20, opacity: .5 }} /></div>}
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <input ref={imgRef} type="file" accept="image/*" onChange={handleImgUpload} style={{ display: 'none' }} />
                          <button className="btn btn-ghost btn-sm" type="button" onClick={() => imgRef.current?.click()}><i className="fa fa-upload" /> {form.image ? 'Cambiar' : 'Subir imagen'}</button>
                          {form.image && <button className="btn btn-ghost btn-sm" type="button" style={{ color: 'var(--red)' }} onClick={() => setF('image', '')}><i className="fa fa-trash" /> Quitar</button>}
                        </div>
                      </div>
                    </div>
                    {/* SKU + Stock mínimo */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px', marginBottom: 10 }}>
                      <div className="fg" style={{ marginBottom: 0 }}>
                        <label><i className="fa fa-barcode" style={{ marginRight: 5, fontSize: 10, color: 'var(--txt3)' }} />SKU / Código interno</label>
                        <input type="text" value={form.sku || ''} onChange={e => setF('sku', e.target.value)} placeholder="PROD-001, TZA-11OZ..." />
                      </div>
                      <div className="fg" style={{ marginBottom: 0 }}>
                        <label><i className="fa fa-triangle-exclamation" style={{ marginRight: 5, fontSize: 10, color: 'var(--txt3)' }} />Alerta stock mínimo <span style={{ fontWeight: 400, color: 'var(--txt4)', fontSize: 10 }}>(unid.)</span></label>
                        <input type="number" min="0" value={form.minStock || ''} onChange={e => setF('minStock', e.target.value)} placeholder="5" />
                      </div>
                    </div>
                    {/* Notas internas */}
                    <div className="fg" style={{ marginBottom: 0 }}>
                      <label><i className="fa fa-note-sticky" style={{ marginRight: 5, fontSize: 10, color: 'var(--txt3)' }} />Notas internas <span style={{ fontWeight: 400, color: 'var(--txt4)', fontSize: 10 }}>(no visible al cliente)</span></label>
                      <textarea value={form.internalNotes || ''} onChange={e => setF('internalNotes', e.target.value)} rows={2} placeholder="Proveedor preferido, condiciones especiales, variantes disponibles..." style={{ resize: 'vertical', fontFamily: 'inherit', fontSize: 12 }} />
                    </div>
                  </div>
                )}
              </>
            )}

            </div>{/* /body scrollable */}
            {/* ── FOOTER FIJO ── */}
            <div className="mfooter" style={{ flexShrink: 0, borderTop: '1px solid var(--border)', padding: '12px 20px' }}>
              <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={save}
                style={productMode === 'kit' ? { background: 'linear-gradient(135deg,#8B5CF6,#DB2777)', border: 'none' } : {}}>
                <i className={`fa ${productMode === 'kit' ? 'fa-gift' : 'fa-floppy-disk'}`} />
                {' '}{productMode === 'kit' ? 'Guardar Kit' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ RESTO DE MODALES (sin cambios) ══ */}

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
          <div className="bulk-import-sheet">
            {/* Handle visible solo en mobile */}
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10, paddingBottom: 4, flexShrink: 0 }} className="mob-only-handle">
              <div style={{ width: 36, height: 4, borderRadius: 4, background: 'var(--border2)' }} />
            </div>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 20px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 38, height: 38, borderRadius: 12, background: 'var(--brand-xlt)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand)', fontSize: 17 }}>
                  <i className="fa fa-bolt" />
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-.3px' }}>Carga masiva de productos</div>
                  <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 1 }}>Una línea por producto: nombre, precio</div>
                </div>
              </div>
              <button className="mclose" onClick={() => setBulkModal(false)}><i className="fa fa-xmark" /></button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '16px 20px 8px', WebkitOverflowScrolling: 'touch' }}>
              <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '12px 16px', marginBottom: 16, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand)', marginBottom: 4 }}>Formato de entrada</div>
                <div style={{ fontSize: 12, color: 'var(--txt2)', lineHeight: 1.7 }}>
                  Una línea por producto: <code style={{ background: 'var(--surface)', padding: '1px 5px', borderRadius: 4 }}>Nombre del producto, precio</code>
                </div>
                <div style={{ marginTop: 6, fontSize: 11, color: 'var(--txt3)' }}>Ej: <code>Taza sublimada, 850</code></div>
              </div>
              <div className="fg"><label>Categoría</label><select value={bulkCat} onChange={e => setBulkCat(e.target.value)}>{cats.map(cat => <option key={cat} value={cat}>{cat}</option>)}</select></div>
              <div className="fg" style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ margin: 0 }}>Datos de productos</label>
                  {bulkData.trim() && (
                    <span style={{ fontSize: 11, color: 'var(--brand)', fontWeight: 600 }}>
                      {bulkData.trim().split('\n').filter(l => l.trim()).length} producto{bulkData.trim().split('\n').filter(l => l.trim()).length !== 1 ? 's' : ''} detectado{bulkData.trim().split('\n').filter(l => l.trim()).length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <textarea value={bulkData} onChange={e => setBulkData(e.target.value)} rows={10} placeholder={'Taza sublimada, 850\nLapicera metálica, 450\nCuaderno corporativo, 1200'} style={{ fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }} />
              </div>
            </div>
            <div style={{ flexShrink: 0, borderTop: '1px solid var(--border)', padding: '12px 20px 20px', background: 'var(--surface)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setBulkModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={doBulk} disabled={!bulkData.trim()}>
                <i className="fa fa-bolt" /> {bulkData.trim() ? `Importar ${bulkData.trim().split('\n').filter(l => l.trim()).length} producto${bulkData.trim().split('\n').filter(l => l.trim()).length !== 1 ? 's' : ''}` : 'Importar'}
              </button>
            </div>
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

      {/* ── QUICK-CAT POPOVER ── */}
      {quickCatPop && (
        <>
          {/* Backdrop invisible que cierra el pop al hacer click fuera */}
          <div style={{ position: 'fixed', inset: 0, zIndex: 699 }} onMouseDown={() => setQuickCatPop(null)} />
          <div className="qcat-pop" style={{
            top:  Math.min(quickCatPop.y, window.innerHeight - 320),
            left: Math.min(quickCatPop.x, window.innerWidth  - 256),
          }}>
            {/* Header: nombre del producto */}
            <div style={{ padding: '10px 14px 7px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--txt)', maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5 }}>
                <i className="fa fa-tag" style={{ color: 'var(--brand)', fontSize: 10, flexShrink: 0 }} />
                {quickCatPop.prod.name}
              </div>
              <button onMouseDown={() => setQuickCatPop(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt3)', fontSize: 13, padding: '2px 3px', lineHeight: 1, flexShrink: 0 }}>
                <i className="fa fa-xmark" />
              </button>
            </div>
            {/* Lista de categorías ordenadas por frecuencia */}
            <div style={{ maxHeight: 210, overflowY: 'auto' }}>
              {/* Opción: Sin categoría */}
              <div
                className={`qcat-pop-item${!quickCatPop.prod.cat ? ' active' : ''}`}
                onMouseDown={() => quickChangeCat(quickCatPop.prod, '')}
              >
                <span style={{ color: 'var(--txt3)', fontStyle: 'italic', fontSize: 11 }}>Sin categoría</span>
                {!quickCatPop.prod.cat && <i className="fa fa-check" style={{ fontSize: 10, color: 'var(--brand)', flexShrink: 0 }} />}
              </div>
              {catsSorted.map(cat => {
                const cc     = catColor(cat)
                const freq   = catFrequency[cat] || 0
                const active = quickCatPop.prod.cat === cat
                return (
                  <div
                    key={cat}
                    className={`qcat-pop-item${active ? ' active' : ''}`}
                    onMouseDown={() => quickChangeCat(quickCatPop.prod, cat)}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 7, flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: cc.bg, color: cc.color, whiteSpace: 'nowrap', maxWidth: 145, overflow: 'hidden', textOverflow: 'ellipsis' }}>{cat}</span>
                      {freq > 0 && <span style={{ fontSize: 10, color: 'var(--txt4)', flexShrink: 0 }}>{freq}</span>}
                    </span>
                    {active && <i className="fa fa-check" style={{ fontSize: 10, color: 'var(--brand)', flexShrink: 0 }} />}
                  </div>
                )
              })}
            </div>
            {/* Input para agregar nueva categoría */}
            <div style={{ borderTop: '1px solid var(--border)', padding: '8px 10px', display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="text"
                value={quickCatInput}
                onChange={e => setQuickCatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); quickAddNewCat() } }}
                placeholder="Nueva categoría..."
                style={{ flex: 1, padding: '5px 9px', border: '1.5px solid var(--border)', borderRadius: 7, fontSize: 11, fontFamily: 'inherit', color: 'var(--txt)', background: 'var(--surface)', outline: 'none', minWidth: 0 }}
                onFocus={e => e.target.style.borderColor = 'var(--brand)'}
                onBlur={e  => e.target.style.borderColor = 'var(--border)'}
              />
              <button
                onMouseDown={e => { e.preventDefault(); quickAddNewCat() }}
                disabled={!quickCatInput.trim()}
                style={{ height: 30, width: 30, borderRadius: 7, border: 'none', background: quickCatInput.trim() ? 'var(--brand)' : 'var(--surface3)', color: quickCatInput.trim() ? '#fff' : 'var(--txt4)', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all .15s' }}>
                <i className="fa fa-plus" />
              </button>
            </div>
          </div>
        </>
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
            {/* ── Ocasiones sugeridas ── */}
            {(() => {
              const OCASIONES = ['Día del Padre','Día de la Madre','Día del Trabajador','Cumpleaños','Bodas / Casamiento','Baby Shower','Aniversario','Navidad / Fin de Año','Egresados','San Valentín','Día del Amigo','Corporativo / Empresa','Bienvenida / Agradecimiento','Otro']
              const missing = OCASIONES.filter(o => !cats.includes(o))
              if (missing.length === 0) return null
              return (
                <div style={{ marginTop: 14, padding: '12px 14px', background: 'linear-gradient(135deg,#F5F3FF,#FDF2F8)', borderRadius: 10, border: '1px solid #DDD6FE' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#8B5CF6', textTransform: 'uppercase', letterSpacing: .6, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <i className="fa fa-gift" /> Ocasiones sugeridas para kits
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
                    {missing.map(o => (
                      <span key={o} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: 'var(--surface)', border: '1px solid #DDD6FE', color: 'var(--txt2)' }}>{o}</span>
                    ))}
                  </div>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ color: '#8B5CF6', borderColor: '#DDD6FE', width: '100%', justifyContent: 'center' }}
                    onClick={() => {
                      const newCats = [...cats, ...missing]
                      updateConfig({ productCats: newCats })
                      toast(`${missing.length} ocasiones agregadas`, 'ok')
                    }}
                  >
                    <i className="fa fa-plus" /> Agregar todas las ocasiones sugeridas
                  </button>
                </div>
              )
            })()}
            <div className="mfooter" style={{ justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => { setCatMgmtModal(false); setEditingCat(null) }}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
