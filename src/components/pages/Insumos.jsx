import { useState, useMemo, useEffect } from 'react'
import { useData } from '../../context/DataContext'
import { useToast } from '../../context/ToastContext'
import { fmt } from '../../lib/storage'

// Formateo con hasta 2 decimales para costos fraccionados
const fmtDec = (v) => {
  const n = Number(v) || 0
  return '$' + n.toLocaleString('es-AR', { maximumFractionDigits: 2 })
}

const EMPTY = {
  name: '', cat: '', subcat: '', unit: 'un', cost: '',
  stock: '', minStock: '', supplierId: '', notes: '',
  packCost: '', packQty: '', qtyPerGift: '',
}
const numFocus = e => e.target.select()

// Sugerencias de subcategoría orientadas a packaging/regalos
const SUBCAT_SUGGESTIONS = {
  cajas:       ['Kraft marrón', 'Blancas con tapa', 'Rígidas', 'Magnéticas', 'Con ventana'],
  bolsas:      ['Organza', 'Papel kraft', 'Metalizada', 'Tela', 'Transparente'],
  cintas:      ['Raso', 'Grosgrain', 'Satín', 'Lino', 'Rafia'],
  relleno:     ['Viruta de madera', 'Papel picado', 'Papel de seda', 'Shredded kraft', 'Algodón'],
  tarjetas:    ['Agradecimiento', 'Cumpleaños', 'Empresarial', 'Personalizada'],
  sellado:     ['Stickers circulares', 'Lacre', 'Precinto', 'Etiquetas kraft', 'Cinta adhesiva'],
  etiquetas:   ['Etiquetas kraft', 'Stickers personalizados', 'Tarjetas', 'Sellos de cera', 'Cinta deco'],
  packaging:   ['Cajas', 'Bolsas', 'Papel de seda', 'Cintas', 'Tarjetas'],
  prod_core:   ['Textiles', 'Químicos', 'Madera', 'Metales', 'Papel/Cartón'],
  insumos_op:  ['Limpieza', 'Librería', 'Etiquetas de envío', 'Precintos'],
  promo:       ['Folletos', 'Stickers', 'Muestras', 'Merchandising'],
}

const CAT_CLS = {
  cajas:        'b-confirmed',
  bolsas:       'b-sent',
  cintas:       'b-negotiating',
  relleno:      'b-draft',
  tarjetas:     'b-confirmed',
  sellado:      'b-sent',
  packaging:    'b-sent',
  prod_core:    'b-confirmed',
  insumos_op:   'b-negotiating',
  promo:        'b-lost',
}

const stockLevel = (stock, minStock) => {
  const s = stock || 0
  const m = minStock || 0
  if (m <= 0) return 'ok'
  if (s <= m) return 'low'
  if (s <= m * 1.1) return 'warn'
  return 'ok'
}

const LED_DOT = {
  low:  { bg: '#DC2626', pulse: true },
  warn: { bg: '#F59E0B', pulse: false },
  ok:   null,
}

const relTime = (iso) => {
  if (!iso) return null
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3600000)
  if (h < 1) return 'hace <1h'
  if (h < 24) return `hace ${h}h`
  const d = Math.floor(h / 24)
  if (d === 1) return 'ayer'
  if (d < 7) return `hace ${d}d`
  return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

export default function Insumos() {
  const { get, config, updateConfig, saveEntity, deleteEntity } = useData()
  const toast = useToast()
  const c = config()
  const cats = c.insumoCats || []
  const units = c.units || ['un', 'kg', 'lt', 'm', 'cm', 'rollo', 'hoja', 'caja', 'pack']

  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('all')
  const [showLowOnly, setShowLowOnly] = useState(false)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ ...EMPTY })
  const [showAdvancedModal, setShowAdvancedModal] = useState(false)
  const [showCalc, setShowCalc] = useState(false)
  const [alertDismissed, setAlertDismissed] = useState(() => {
    try { return sessionStorage.getItem('pkg_low_dismissed') === '1' } catch { return false }
  })
  const dismissLowAlert = () => {
    try { sessionStorage.setItem('pkg_low_dismissed', '1') } catch {}
    setAlertDismissed(true)
  }

  // ── Inline nueva categoría ──
  const [showNewCat, setShowNewCat] = useState(false)
  const [newCatLabel, setNewCatLabel] = useState('')

  // Auto-poblar categorías default si el usuario no tiene ninguna
  useEffect(() => {
    if (cats.length === 0) {
      updateConfig({
        insumoCats: [
          { id: 'cajas',     label: 'Cajas' },
          { id: 'bolsas',    label: 'Bolsas' },
          { id: 'cintas',    label: 'Cintas y Cordones' },
          { id: 'relleno',   label: 'Protección y Relleno' },
          { id: 'etiquetas', label: 'Etiquetas y Papelería' },
        ],
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const addCat = () => {
    const label = newCatLabel.trim()
    if (!label) return
    const id = `cat_${Date.now()}`
    const newCats = [...cats, { id, label }]
    updateConfig({ insumoCats: newCats })
    setF('cat', id)
    setNewCatLabel('')
    setShowNewCat(false)
  }

  const insumos = get('insumos', [])
  const suppliers = get('suppliers', [])

  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const filtered = useMemo(() => {
    let f = insumos
    if (catFilter !== 'all') f = f.filter(x => x.cat === catFilter)
    if (showLowOnly) f = f.filter(x => stockLevel(x.stock, x.minStock) === 'low')
    if (search) {
      const s = search.toLowerCase()
      f = f.filter(x =>
        x.name.toLowerCase().includes(s) ||
        (x.cat || '').toLowerCase().includes(s) ||
        (x.subcat || '').toLowerCase().includes(s)
      )
    }
    return f.sort((a, b) => (b.id || 0) - (a.id || 0))
  }, [insumos, catFilter, showLowOnly, search])

  const lowStock = useMemo(() => insumos.filter(x => stockLevel(x.stock, x.minStock) === 'low'), [insumos])
  const totalValue = insumos.reduce((s, x) => s + (x.stock || 0) * (Number(x.cost) || 0), 0)

  // Cálculo de fraccionamiento en tiempo real
  const costPerGift = useMemo(() => {
    const pc = parseFloat(form.packCost)
    const pq = parseFloat(form.packQty)
    const qpg = parseFloat(form.qtyPerGift)
    if (!pc || !pq || !qpg || pq <= 0 || qpg <= 0) return null
    return (pc / pq) * qpg
  }, [form.packCost, form.packQty, form.qtyPerGift])

  // Rendimiento: cuántos regalos cubre el stock actual
  const rendimiento = (item) => {
    const qpg = parseFloat(item.qtyPerGift)
    if (!qpg || qpg <= 0 || !item.stock) return null
    return Math.floor(item.stock / qpg)
  }

  const catLabel = (id) => cats.find(cat => cat.id === id)?.label || id || '—'

  const openNew = () => {
    setShowAdvancedModal(false)
    setShowCalc(false)
    setForm({ ...EMPTY, cat: cats[0]?.id || '' })
    setModal(true)
  }
  const openEdit = (item) => {
    setShowAdvancedModal(false)
    setShowCalc(!!(item.packCost || item.packQty || item.qtyPerGift))
    setForm({ ...item })
    setModal(true)
  }

  const save = () => {
    if (!form.name) { toast('Ingresá un nombre', 'er'); return }
    saveEntity('insumos', {
      ...form,
      cost: Number(form.cost) || 0,
      stock: Number(form.stock) || 0,
      minStock: Number(form.minStock) || 0,
      packCost: form.packCost ? Number(form.packCost) : undefined,
      packQty: form.packQty ? Number(form.packQty) : undefined,
      qtyPerGift: form.qtyPerGift ? Number(form.qtyPerGift) : undefined,
    })
    setModal(false)
    toast(form.id ? 'Material actualizado' : 'Material creado', 'ok')
  }

  const remove = (id) => {
    if (window.confirm('¿Eliminar este material?')) { deleteEntity('insumos', id); toast('Eliminado', 'in') }
  }

  const quickAdjust = (item, delta) => {
    const newQty = Math.max(0, (item.stock || 0) + delta)
    saveEntity('insumos', { ...item, stock: newQty })
    toast(`Stock: ${newQty} ${item.unit || 'un'}`, 'ok')
  }

  const supplierName = (id) => { const s = suppliers.find(x => x.id === id); return s ? s.name : '—' }

  return (
    <div className="page active" style={{ animation: 'pgIn .25s ease both' }}>
      <div className="ph">
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--txt4)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 2 }}>
            <i className="fa fa-cube" style={{ marginRight: 4 }} />Materiales de Packaging
          </div>
        </div>
        <div className="ph-right">
          <button className="btn btn-primary" onClick={openNew} style={{ minHeight: 44 }}>
            <i className="fa fa-plus" /> Nuevo material
          </button>
        </div>
      </div>

      {/* ── KPIs ── */}
      <div className="bento" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 14 }}>
        <div className="bento-kpi" style={{ borderLeft: '3px solid var(--brand)', padding: '12px 14px 10px' }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>Total materiales</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--txt)', letterSpacing: '-.03em', lineHeight: 1.1 }}>{insumos.length}</div>
        </div>
        <div className="bento-kpi" style={{ borderLeft: '3px solid var(--green)', padding: '12px 14px 10px' }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>Valor en packaging</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--money)', letterSpacing: '-.03em', lineHeight: 1.1 }}>{fmt(totalValue)}</div>
        </div>
        <div className="bento-kpi" style={{ borderLeft: `3px solid ${lowStock.length > 0 ? 'var(--red)' : 'var(--green)'}`, ...(lowStock.length === 0 ? { borderTop: '4px solid #10B981' } : {}), padding: '12px 14px 10px' }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>Stock bajo</div>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1.1, color: lowStock.length > 0 ? 'var(--red)' : 'var(--green)' }}>{lowStock.length}</div>
          {lowStock.length === 0
            ? <div style={{ fontSize: 9.5, color: '#16A34A', marginTop: 2, fontWeight: 600 }}>Todo en orden</div>
            : <button onClick={() => setShowLowOnly(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 10, fontWeight: 700, color: '#DC2626', marginTop: 5, display: 'flex', alignItems: 'center', gap: 3 }}>
                Ver faltantes <i className="fa fa-arrow-right" style={{ fontSize: 8 }} />
              </button>
          }
        </div>
        <div className="bento-kpi" style={{ borderLeft: '3px solid var(--amber)', padding: '12px 14px 10px' }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>Categorías</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--txt)', letterSpacing: '-.03em', lineHeight: 1.1 }}>{cats.length}</div>
        </div>
      </div>

      {/* Low stock banner */}
      {lowStock.length > 0 && !alertDismissed && (
        <div style={{ background: 'var(--red-lt)', border: '1.5px solid #FCA5A5', borderRadius: 10, padding: '10px 16px', marginBottom: 14, fontSize: 12, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <i className="fa fa-triangle-exclamation" />
          <span style={{ flex: 1 }}><b>{lowStock.length} material{lowStock.length > 1 ? 'es' : ''}</b> con stock bajo: {lowStock.slice(0, 4).map(x => x.name).join(', ')}{lowStock.length > 4 ? '...' : ''}</span>
          <button onClick={dismissLowAlert} style={{ background: 'none', border: 'none', color: '#DC2626', cursor: 'pointer', padding: '2px 4px', borderRadius: 4, fontSize: 14, flexShrink: 0, opacity: 0.7 }}><i className="fa fa-xmark" /></button>
        </div>
      )}

      {/* ── Layout asimétrico 65/35 ── */}
      <div className="ins-layout">

        {/* ── LEFT: tabla de materiales ── */}
        <div className="ins-main">
          {showLowOnly && (
            <div style={{ background: '#FFF1F2', border: '1.5px solid #FECACA', borderRadius: 10, padding: '8px 14px', marginBottom: 10, fontSize: 12, color: '#DC2626', display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="fa fa-triangle-exclamation" style={{ fontSize: 11 }} />
              <span style={{ flex: 1 }}>Mostrando solo materiales con stock bajo</span>
              <button onClick={() => setShowLowOnly(false)} style={{ background: 'none', border: '1px solid #FECACA', cursor: 'pointer', color: '#DC2626', fontWeight: 700, fontSize: 11, padding: '2px 8px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                <i className="fa fa-xmark" /> Limpiar
              </button>
            </div>
          )}

          {/* Filtros */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <div className="search-row" style={{ maxWidth: 280 }}>
              <i className="fa fa-magnifying-glass" />
              <input type="text" placeholder="Buscar material o tipo..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select className="f-inp" style={{ maxWidth: 220 }} value={catFilter} onChange={e => setCatFilter(e.target.value)}>
              <option value="all">Todas las categorías</option>
              {cats.map(cat => <option key={cat.id} value={cat.id}>{cat.label}</option>)}
            </select>
          </div>

          {/* ── Mobile: pill cards ── */}
          <div className="ins-mob-list">
            {filtered.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px 24px', color: 'var(--txt3)' }}>
                <i className="fa fa-box-open" style={{ fontSize: 24, marginBottom: 8, display: 'block' }} />
                <div>Sin materiales de packaging cargados</div>
                <div style={{ fontSize: 11, color: 'var(--txt4)', marginTop: 6, lineHeight: 1.6 }}>
                  Cargá acá tus cajas de cartón, cintas de raso,<br />viruta de madera, tarjetas o bolsas de despacho
                </div>
              </div>
            )}
            {filtered.map(item => {
              const level = stockLevel(item.stock, item.minStock)
              const led = LED_DOT[level]
              const rend = rendimiento(item)
              return (
                <div key={item.id} className={`ins-mob-card${level === 'low' ? ' low' : ''}`}>
                  {led
                    ? <div className={`ins-mob-card-dot${led.pulse ? ' ins-led-pulse' : ''}`} style={{ background: led.bg }} />
                    : <div className="ins-mob-card-dot" style={{ background: 'transparent' }} />
                  }
                  <div className="ins-mob-card-body">
                    <div className="ins-mob-card-name">{item.name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3, flexWrap: 'wrap', minHeight: 16 }}>
                      {item.cat && <span className={`badge ${CAT_CLS[item.cat] || 'b-draft'}`} style={{ fontSize: 9, padding: '1px 5px' }}>{catLabel(item.cat)}</span>}
                      {rend !== null && <span style={{ fontSize: 10, color: '#16A34A', fontWeight: 700 }}>~{rend} regalos</span>}
                    </div>
                    <div className="ins-mob-card-meta">
                      Stock: <b style={{ color: level === 'low' ? '#DC2626' : level === 'warn' ? '#D97706' : 'var(--txt)' }}>{item.stock || 0}</b> {item.unit || 'un'}
                      {item.minStock > 0 && <span style={{ color: 'var(--txt4)', marginLeft: 6 }}>· mín {item.minStock}</span>}
                    </div>
                  </div>
                  <div className="ins-mob-card-right">
                    <div>
                      <div className="ins-mob-card-price">{fmt(item.cost)}</div>
                      <div className="ins-mob-card-unit">/{item.unit || 'un'}</div>
                    </div>
                    <div className="ins-mob-card-acts">
                      <button className="ins-mob-card-btn green" title="+1" onClick={() => quickAdjust(item, 1)}>
                        <i className="fa fa-plus" />
                      </button>
                      <button className="ins-mob-card-btn" title="Editar" onClick={() => openEdit(item)}>
                        <i className="fa fa-pen" />
                      </button>
                      <button className="ins-mob-card-btn red" title="Eliminar" onClick={() => remove(item.id)}>
                        <i className="fa fa-trash" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* ── Desktop: tabla premium ── */}
          <div className="ins-desk-view">
            <div className="card tbl-card" style={{ padding: 0, overflow: 'hidden' }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Material de Packaging</th>
                    <th>Unidad</th>
                    <th style={{ textAlign: 'right' }}>Costo U.</th>
                    <th style={{ textAlign: 'right', color: '#16A34A' }}>
                      <i className="fa fa-gift" style={{ fontSize: 10, marginRight: 4 }} />Rendimiento
                    </th>
                    <th>Proveedor</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: 48, color: 'var(--txt3)' }}>
                      <i className="fa fa-box-open" style={{ fontSize: 28, marginBottom: 10, display: 'block', opacity: .5 }} />
                      <div style={{ fontWeight: 600, marginBottom: 6 }}>Sin materiales de packaging</div>
                      <div style={{ fontSize: 11, color: 'var(--txt4)', lineHeight: 1.6 }}>
                        Cargá cajas de cartón, cintas de raso, viruta de madera,<br />tarjetas de agradecimiento o bolsas de despacho
                      </div>
                    </td></tr>
                  )}
                  {filtered.map(item => {
                    const level = stockLevel(item.stock, item.minStock)
                    const led = LED_DOT[level]
                    const rend = rendimiento(item)
                    return (
                      <tr key={item.id} style={level === 'low' ? { borderLeft: '3px solid #DC2626' } : undefined}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                            {led
                              ? <span className={led.pulse ? 'ins-led-pulse' : ''} style={{ width: 7, height: 7, borderRadius: '50%', background: led.bg, flexShrink: 0, display: 'inline-block', marginTop: 5 }} />
                              : <span style={{ width: 7, height: 7, flexShrink: 0, display: 'inline-block' }} />
                            }
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 13 }}>{item.name}</div>
                              <div style={{ fontSize: 10.5, marginTop: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ color: level === 'low' ? '#DC2626' : level === 'warn' ? '#D97706' : 'var(--txt3)', fontWeight: level !== 'ok' ? 700 : 400 }}>
                                  {item.stock || 0} en stock
                                </span>
                                {item.minStock > 0 && <span style={{ color: 'var(--txt4)' }}>· mín {item.minStock}</span>}
                                <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 1 }} onClick={e => e.stopPropagation()}>
                                  <button className="ins-stk-btn" title="+1" onClick={() => quickAdjust(item, 1)}>+</button>
                                  <button className="ins-stk-btn" title="-1" onClick={() => quickAdjust(item, -1)} disabled={(item.stock || 0) <= 0}>−</button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--txt3)' }}>{item.unit || 'un'}</td>
                        <td style={{ textAlign: 'right' }}>
                          <div>{fmtDec(item.cost)}</div>
                          {item.qtyPerGift > 0 && (
                            <div style={{ fontSize: 9.5, color: 'var(--brand)', marginTop: 1, fontWeight: 600 }}>
                              {fmtDec((Number(item.cost) || 0) * item.qtyPerGift)}/regalo
                            </div>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {rend !== null
                            ? <div>
                                <span style={{ fontWeight: 800, fontSize: 14, color: rend > 10 ? '#16A34A' : rend > 5 ? '#D97706' : '#DC2626' }}>~{rend}</span>
                                <span style={{ fontSize: 10, color: 'var(--txt4)', marginLeft: 3 }}>regalos</span>
                              </div>
                            : <span style={{ color: 'var(--txt4)', fontSize: 11 }}>—</span>
                          }
                        </td>
                        <td style={{ fontSize: 11 }}>{supplierName(item.supplierId)}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                            <button title="Editar" onClick={() => openEdit(item)} style={{ width:28,height:28,borderRadius:'50%',border:'1.5px solid var(--border2)',background:'var(--surface2)',color:'var(--txt2)',cursor:'pointer',fontSize:11,display:'inline-flex',alignItems:'center',justifyContent:'center',padding:0,flexShrink:0,transition:'all .15s' }}><i className="fa fa-pen" /></button>
                            <button title="Eliminar" onClick={() => remove(item.id)} style={{ width:28,height:28,borderRadius:'50%',border:'1.5px solid #FECACA',background:'#FEF2F2',color:'#DC2626',cursor:'pointer',fontSize:11,display:'inline-flex',alignItems:'center',justifyContent:'center',padding:0,flexShrink:0,transition:'all .15s' }}><i className="fa fa-trash" /></button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ── RIGHT: panel lateral (desktop only) ── */}
        <div className="ins-panel">
          {/* Resumen */}
          <div className="card" style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--txt4)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
              <i className="fa fa-chart-simple" /> Resumen packaging
            </div>
            <div className="ins-pstat">
              <span><i className="fa fa-cubes" style={{ color: 'var(--brand)', marginRight: 5, fontSize: 11 }} />Total materiales</span>
              <b>{insumos.length}</b>
            </div>
            <div className="ins-pstat">
              <span><i className="fa fa-coins" style={{ color: '#F59E0B', marginRight: 5, fontSize: 11 }} />Valor packaging</span>
              <b style={{ color: 'var(--money)' }}>{fmt(totalValue)}</b>
            </div>
            <div className="ins-pstat">
              <span><i className="fa fa-gift" style={{ color: '#8B5CF6', marginRight: 5, fontSize: 11 }} />Con rendimiento</span>
              <b style={{ color: '#16A34A' }}>{insumos.filter(x => x.qtyPerGift > 0).length}</b>
            </div>
          </div>

          {/* Stock crítico o Todo OK */}
          {lowStock.length > 0 ? (
            <div className="card" style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#DC2626', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 5 }}>
                <i className="fa fa-triangle-exclamation" /> Packaging crítico ({lowStock.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {lowStock.slice(0, 7).map(item => (
                  <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                    <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600, color: 'var(--txt)', marginRight: 8 }}>{item.name}</div>
                    <div style={{ fontSize: 11, color: '#DC2626', fontWeight: 700, flexShrink: 0 }}>
                      {item.stock || 0}<span style={{ color: 'var(--txt4)', fontWeight: 400, marginLeft: 2 }}>{item.unit || 'un'}</span>
                    </div>
                  </div>
                ))}
                {lowStock.length > 7 && <div style={{ fontSize: 10, color: 'var(--txt4)', paddingTop: 6 }}>+{lowStock.length - 7} más</div>}
              </div>
            </div>
          ) : (
            <div className="card" style={{ padding: '20px 16px', textAlign: 'center' }}>
              <i className="fa fa-circle-check" style={{ color: 'var(--green)', fontSize: 24, marginBottom: 8, display: 'block' }} />
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt2)', marginBottom: 3 }}>Packaging completo</div>
              <div style={{ fontSize: 11, color: 'var(--txt3)' }}>Todos los materiales tienen stock suficiente</div>
            </div>
          )}

          {/* Tip calculadora */}
          <div className="card" style={{ padding: '12px 14px', borderLeft: '3px solid var(--brand)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--brand)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
              <i className="fa fa-lightbulb" /> Tip: calculadora de fraccionamiento
            </div>
            <div style={{ fontSize: 11, color: 'var(--txt3)', lineHeight: 1.55 }}>
              Al crear un material, indicá el <b>costo del rollo/pack completo</b> y cuánto usás por regalo para calcular el costo real por unidad.
            </div>
          </div>
        </div>

      </div>

      {/* ── Modal: crear / editar material ── */}
      {modal && (
        <div className="modal-bg open" style={{ padding: '48px 16px', alignItems: 'flex-start' }} onClick={e => { if (e.target === e.currentTarget) setModal(false) }}>
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="mh">
              <div>
                <h3>{form.id ? 'Editar material' : 'Nuevo material de packaging'}</h3>
                <div style={{ fontSize: 10, color: 'var(--txt4)', marginTop: 2 }}>Cajas, cintas, viruta, tarjetas, bolsas…</div>
              </div>
              <button className="mclose" onClick={() => setModal(false)}><i className="fa fa-xmark" /></button>
            </div>

            {/* Fila 1: Nombre */}
            <div className="fg">
              <label><i className="fa fa-cube" style={{ color: 'var(--brand)', fontSize: 10, marginRight: 4 }} />Nombre del material *</label>
              <input type="text" value={form.name} onChange={e => setF('name', e.target.value)} placeholder="Ej: Cinta de raso, Caja kraft 20×15, Viruta natural…" autoFocus />
            </div>

            {/* Fila 2: Costo + Unidad */}
            <div className="grid2" style={{ marginTop: 10 }}>
              <div className="fg">
                <label><i className="fa fa-coins" style={{ color: '#F59E0B', fontSize: 10, marginRight: 4 }} />Costo unitario ($)</label>
                <input type="number" value={form.cost} onChange={e => setF('cost', e.target.value)} onFocus={numFocus} placeholder="0" min="0" />
              </div>
              <div className="fg">
                <label><i className="fa fa-ruler-combined" style={{ color: '#64748B', fontSize: 10, marginRight: 4 }} />Unidad de medida</label>
                <select value={form.unit} onChange={e => setF('unit', e.target.value)}>
                  {units.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>

            {/* ── Calculadora de fraccionamiento ── */}
            <button
              onClick={() => setShowCalc(p => !p)}
              style={{ background: showCalc ? 'var(--brand-xlt, rgba(99,102,241,.08))' : 'none', border: showCalc ? '1.5px solid var(--brand-dim, rgba(99,102,241,.25))' : '1.5px dashed var(--border)', cursor: 'pointer', padding: '9px 14px', fontSize: 12, fontWeight: 700, color: 'var(--brand)', display: 'flex', alignItems: 'center', gap: 6, width: '100%', marginTop: 10, borderRadius: 10, fontFamily: 'inherit', transition: 'all .15s' }}
            >
              <i className="fa fa-calculator" style={{ fontSize: 13 }} />
              {showCalc ? 'Ocultar calculadora de fraccionamiento' : '¿Comprás por rollo o pack? Calculá el costo por regalo →'}
            </button>

            {showCalc && (
              <div className="pkg-calc-card">
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--brand)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <i className="fa fa-calculator" /> Calculadora de fraccionamiento
                </div>

                <div className="grid2" style={{ marginBottom: 10 }}>
                  <div className="fg">
                    <label>Costo del pack completo ($)</label>
                    <input type="number" value={form.packCost} onChange={e => setF('packCost', e.target.value)} onFocus={numFocus} placeholder="Ej: 10000" min="0" />
                  </div>
                  <div className="fg">
                    <label>Cantidad total del pack</label>
                    <input type="number" value={form.packQty} onChange={e => setF('packQty', e.target.value)} onFocus={numFocus} placeholder="Ej: 50 metros" min="0" step="any" />
                  </div>
                </div>

                <div className="fg">
                  <label>
                    <i className="fa fa-gift" style={{ color: '#8B5CF6', fontSize: 10, marginRight: 4 }} />
                    Uso por regalo / caja
                  </label>
                  <input type="number" value={form.qtyPerGift} onChange={e => setF('qtyPerGift', e.target.value)} onFocus={numFocus} placeholder="Ej: 0.5 metros por moño" min="0" step="any" />
                  <div style={{ fontSize: 10, color: 'var(--txt4)', marginTop: 4 }}>
                    También se usa para calcular el rendimiento del stock en la tabla
                  </div>
                </div>

                {/* Resultado calculado */}
                {costPerGift !== null && (
                  <div className="pkg-calc-result">
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--brand)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 4 }}>
                        <i className="fa fa-star" style={{ marginRight: 3 }} />Costo real por regalo
                      </div>
                      <div style={{ fontSize: 26, fontWeight: 900, color: 'var(--brand)', letterSpacing: '-.03em', lineHeight: 1 }}>
                        {fmtDec(costPerGift)}
                      </div>
                      <div style={{ fontSize: 10, color: 'rgba(99,102,241,.7)', marginTop: 3 }}>
                        {fmtDec(parseFloat(form.packCost))} ÷ {form.packQty} × {form.qtyPerGift} {form.unit || 'un'}
                      </div>
                    </div>
                    <button
                      onClick={() => setF('cost', String(Math.round(costPerGift * 100) / 100))}
                      className="pkg-calc-apply"
                    >
                      <i className="fa fa-arrow-up-right-from-square" style={{ fontSize: 11 }} />
                      Aplicar como<br />costo unitario
                    </button>
                  </div>
                )}

                {costPerGift === null && (form.packCost || form.packQty || form.qtyPerGift) && (
                  <div style={{ fontSize: 11, color: 'var(--txt4)', padding: '8px 0', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <i className="fa fa-circle-info" style={{ fontSize: 10 }} />
                    Completá los 3 campos para calcular el costo por regalo
                  </div>
                )}
              </div>
            )}

            {/* Fila 3: Proveedor */}
            <div className="fg" style={{ marginTop: 10 }}>
              <label><i className="fa fa-truck" style={{ color: '#8B5CF6', fontSize: 10, marginRight: 4 }} />Proveedor</label>
              <select value={form.supplierId || ''} onChange={e => setF('supplierId', e.target.value ? Number(e.target.value) : '')}>
                <option value="">Sin proveedor asignado</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            {/* Acordeón: más opciones */}
            <button
              onClick={() => setShowAdvancedModal(p => !p)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '10px 0 2px', fontSize: 12, fontWeight: 700, color: 'var(--brand)', display: 'flex', alignItems: 'center', gap: 5, width: '100%', marginTop: 6 }}
            >
              <i className={`fa fa-chevron-${showAdvancedModal ? 'up' : 'down'}`} style={{ fontSize: 9 }} />
              {showAdvancedModal ? 'Menos opciones' : 'Más opciones (categoría, stock, notas)'}
            </button>

            {showAdvancedModal && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 10, borderTop: '1px solid var(--border)', marginTop: 2 }}>
                <div className="grid2">
                  <div className="fg">
                    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      Categoría
                      <button
                        type="button"
                        onClick={() => { setShowNewCat(p => !p); setNewCatLabel('') }}
                        title={showNewCat ? 'Cancelar nueva categoría' : 'Crear nueva categoría'}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: showNewCat ? 'var(--txt3)' : 'var(--brand)', fontSize: 15, padding: '0 2px', lineHeight: 1, display: 'flex', alignItems: 'center', gap: 3, fontWeight: 700 }}
                      >
                        <i className={`fa ${showNewCat ? 'fa-xmark' : 'fa-circle-plus'}`} />
                      </button>
                    </label>
                    {showNewCat ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input
                          type="text"
                          value={newCatLabel}
                          onChange={e => setNewCatLabel(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') addCat(); if (e.key === 'Escape') setShowNewCat(false) }}
                          placeholder="Nombre de la categoría..."
                          autoFocus
                          style={{ flex: 1 }}
                        />
                        <button type="button" onClick={addCat} className="btn btn-primary btn-sm" style={{ padding: '0 12px', flexShrink: 0 }}>
                          <i className="fa fa-check" />
                        </button>
                      </div>
                    ) : (
                      <select value={form.cat} onChange={e => { setF('cat', e.target.value); setF('subcat', '') }}>
                        <option value="">Sin categoría</option>
                        {cats.map(cat => <option key={cat.id} value={cat.id}>{cat.label}</option>)}
                      </select>
                    )}
                  </div>
                  <div className="fg">
                    <label>Tipo <span style={{ fontWeight: 400, color: 'var(--txt3)', fontSize: 11 }}>(opc.)</span></label>
                    <input
                      type="text"
                      list={`subcat-list-${form.cat}`}
                      value={form.subcat || ''}
                      onChange={e => setF('subcat', e.target.value)}
                      placeholder={form.cat ? 'Ej: Kraft, Satén, Premium' : 'Seleccioná categoría'}
                      disabled={!form.cat}
                    />
                    {form.cat && (
                      <datalist id={`subcat-list-${form.cat}`}>
                        {(SUBCAT_SUGGESTIONS[form.cat] || []).map(s => <option key={s} value={s} />)}
                      </datalist>
                    )}
                  </div>
                </div>
                <div className="grid2">
                  <div className="fg">
                    <label>Stock actual</label>
                    <input type="number" value={form.stock} onChange={e => setF('stock', e.target.value)} onFocus={numFocus} placeholder="0" />
                  </div>
                  <div className="fg">
                    <label>Stock mínimo (alerta)</label>
                    <input type="number" value={form.minStock} onChange={e => setF('minStock', e.target.value)} onFocus={numFocus} placeholder="0" />
                  </div>
                </div>
                <div className="fg">
                  <label>Notas</label>
                  <textarea value={form.notes || ''} onChange={e => setF('notes', e.target.value)} rows={2} placeholder="Proveedor habitual, observaciones de presentación..." />
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setModal(false)}>Cancelar</button>
              <button className="btn btn-primary btn-sm" onClick={save}>
                <i className="fa fa-floppy-disk" /> {form.id ? 'Guardar cambios' : 'Crear material'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
