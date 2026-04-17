import { useState, useEffect, useRef } from 'react'
import { useData } from '../../context/DataContext'
import { useToast } from '../../context/ToastContext'
import { fmt } from '../../lib/storage'

const CAT_PALETTE = [
  { bg: '#EDE9FE', color: '#5B21B6' },
  { bg: '#DBEAFE', color: '#1D4ED8' },
  { bg: '#D1FAE5', color: '#065F46' },
  { bg: '#FEF3C7', color: '#92400E' },
  { bg: '#FCE7F3', color: '#9D174D' },
  { bg: '#FFEDD5', color: '#9A3412' },
  { bg: '#E0F2FE', color: '#075985' },
  { bg: '#F0FDF4', color: '#166534' },
]

export default function Catalogo() {
  const { get, config, saveEntity, deleteEntity } = useData()
  const toast = useToast()
  const c = config()
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('all')
  const [modal, setModal] = useState(false)
  const [bulkModal, setBulkModal] = useState(false)
  const [csvModal, setCsvModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ name: '', cat: '', cost: '', supplierId: '' })
  const num = (v) => { const n = Number(v); return isNaN(n) ? 0 : n }
  const selectOnFocus = (e) => e.target.select()
  const [bulkCat, setBulkCat] = useState('')
  const [bulkData, setBulkData] = useState('')
  const [csvPreview, setCsvPreview] = useState([])
  const [csvCat, setCsvCat] = useState('')
  const csvRef = useRef(null)
  const [priceUpdateModal, setPriceUpdateModal] = useState(false)
  const [pricePct, setPricePct] = useState('')
  const [priceSupplier, setPriceSupplier] = useState('all')

  useEffect(() => { const t = setTimeout(() => setLoading(false), 80); return () => clearTimeout(t) }, [])

  const products = get('products')
  const suppliers = get('suppliers')
  const cats = c.productCats || []
  const margin = c.defaultMargin || 40

  const sq = search.toLowerCase()
  let filtered = products
  if (catFilter !== 'all') filtered = filtered.filter(p => p.cat === catFilter)
  if (search) filtered = filtered.filter(p => (p.name || '').toLowerCase().includes(sq))

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const open = (p) => {
    setForm(p ? { ...p, cat: p.cat != null ? p.cat : (cats[0] || '') } : { name: '', cat: cats[0] || '', cost: '', supplierId: '' })
    setModal(true)
  }
  const save = () => {
    if (!form.name) { toast('Ingresá el nombre del producto.', 'er'); return }
    saveEntity('products', { ...form, cat: form.cat ?? '', cost: num(form.cost) })
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

  const doPriceUpdate = () => {
    const pct = Number(pricePct)
    if (!pct) { toast('Ingresá un porcentaje válido', 'er'); return }
    const factor = 1 + pct / 100
    priceUpdatePreview.forEach(p => {
      const newCost = Math.round((Number(p.cost) || 0) * factor)
      saveEntity('products', { ...p, cost: newCost })
    })
    toast(`${priceUpdatePreview.length} productos actualizados (${pct > 0 ? '+' : ''}${pct}%)`, 'ok')
    setPriceUpdateModal(false); setPricePct(''); setPriceSupplier('all')
  }

  /* ── ESC cierra modales (prioridad: topmost primero) ── */
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        if (csvModal) { setCsvModal(false); setCsvPreview([]); return }
        if (bulkModal) { setBulkModal(false); return }
        if (priceUpdateModal) { setPriceUpdateModal(false); return }
        if (modal) { setModal(false); return }
      }
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [csvModal, bulkModal, priceUpdateModal, modal])

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
          <button className="btn btn-primary btn-sm" onClick={() => open()}><i className="fa fa-plus" /> Agregar producto</button>
        </div>
      </div>
      <div className="pill-row">
        <div className="search-row" style={{ maxWidth: 280 }}><i className="fa fa-magnifying-glass" /><input type="text" placeholder="Buscar producto..." value={search} onChange={e => setSearch(e.target.value)} /></div>
        <div className={`pill ${catFilter === 'all' ? 'active' : ''}`} onClick={() => setCatFilter('all')}>Todos</div>
        {cats.map(cat => <div key={cat} className={`pill ${catFilter === cat ? 'active' : ''}`} onClick={() => setCatFilter(cat)}>{cat}</div>)}
      </div>
      <div className="tbl-card">
        <table>
          <thead>
            <tr>
              <th>Producto</th>
              <th>Categoría</th>
              <th>Proveedor</th>
              <th>Costo ($)</th>
              <th>% Margen</th>
              <th>Precio sugerido ($)</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? [1,2,3,4].map(i => (
              <tr key={i}><td colSpan={7}><div className="sk sk-text" style={{ height: 18, width: `${50 + Math.random() * 40}%` }} /></td></tr>
            )) : filtered.length ? filtered.map(p => {
              const pct = marginPct(p)
              const cc = catColor(p.cat)
              return (
                <tr key={p.id}>
                  <td><b>{p.name}</b></td>
                  <td>
                    <span style={{
                      display: 'inline-block',
                      padding: '2px 10px',
                      borderRadius: 20,
                      fontSize: 11,
                      fontWeight: 700,
                      background: cc.bg,
                      color: cc.color,
                      letterSpacing: 0.2,
                    }}>{p.cat}</span>
                  </td>
                  <td>{supplierName(p.supplierId)}</td>
                  <td>{fmt(p.cost)}</td>
                  <td>
                    {pct !== null ? (
                      <span style={{
                        fontWeight: 800,
                        fontSize: 13,
                        color: marginColor(pct),
                      }}>{pct}%</span>
                    ) : <span style={{ color: 'var(--txt4)' }}>—</span>}
                  </td>
                  <td style={{ fontWeight: 700, color: 'var(--money)' }}>{fmt(suggestedPrice(p.cost))}</td>
                  <td><div className="acts">
                    <button className="act edit" onClick={() => open(p)} title="Editar"><i className="fa fa-pen" /></button>
                    <button className="act del" onClick={() => del(p.id)} title="Eliminar"><i className="fa fa-trash" /></button>
                  </div></td>
                </tr>
              )
            }) : <tr><td colSpan={7}><div className="empty"><div className="ico"><i className="fa fa-box-open" /></div><p>Sin productos</p></div></td></tr>}
          </tbody>
        </table>
      </div>

      {modal && (
        <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) setModal(false) }}>
          <div className="modal">
            <div className="mh"><h3>{form.id ? 'Editar' : 'Agregar'} producto</h3><button className="mclose" onClick={() => setModal(false)}><i className="fa fa-xmark" /></button></div>
            <div className="fg"><label>Nombre *</label><input type="text" value={form.name} onChange={e => setF('name', e.target.value)} placeholder="Taza sublimada 11oz" /></div>
            <div className="grid2">
              <div className="fg"><label>Categoría</label><select value={form.cat} onChange={e => setF('cat', e.target.value)}>{cats.map(cat => <option key={cat} value={cat}>{cat}</option>)}</select></div>
              <div className="fg"><label>Costo ($) *</label><input type="number" value={form.cost} onFocus={selectOnFocus} onChange={e => setF('cost', e.target.value)} onBlur={e => { if (e.target.value === '') setF('cost', 0) }} min="0" /></div>
            </div>
            <div className="fg"><label>Proveedor</label><select value={form.supplierId} onChange={e => setF('supplierId', e.target.value)}><option value="">Sin asignar</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
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
    </div>
  )
}
