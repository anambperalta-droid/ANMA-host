import { useState, useEffect, useRef } from 'react'
import { useData } from '../../context/DataContext'
import { useToast } from '../../context/ToastContext'
import { fmt } from '../../lib/storage'

export default function Proveedores() {
  const { get, saveEntity, deleteEntity } = useData()
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(false)
  const [importModal, setImportModal] = useState(false)
  const [detailSupplier, setDetailSupplier] = useState(null)
  const [detailTab, setDetailTab] = useState('info')
  const [viewMode, setViewMode] = useState('table')
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ name: '', contact: '', wa: '', rubro: '', email: '', notes: '' })
  const [newNote, setNewNote] = useState('')
  const fileRef = useRef(null)
  const [csvPreview, setCsvPreview] = useState([])

  useEffect(() => { const t = setTimeout(() => setLoading(false), 80); return () => clearTimeout(t) }, [])

  const suppliers = get('suppliers')
  const products = get('products')
  const sq = search.toLowerCase()
  const filtered = search ? suppliers.filter(s =>
    (s.name || '').toLowerCase().includes(sq) || (s.contact || '').toLowerCase().includes(sq) || (s.rubro || '').toLowerCase().includes(sq)
  ) : suppliers

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const openEdit = (s) => { setForm(s ? { ...s } : { name: '', contact: '', wa: '', rubro: '', email: '', notes: '' }); setModal(true) }
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
  const supplierCostTotal = (s) => supplierProducts(s).reduce((sum, p) => sum + (Number(p.cost) || 0), 0)

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

      {viewMode === 'table' ? (
        <div className="tbl-card">
          <table>
            <thead><tr><th>Nombre</th><th>Contacto</th><th>WhatsApp</th><th>Rubro</th><th>Email</th><th>Productos</th><th>Acciones</th></tr></thead>
            <tbody>
              {loading ? [1,2,3,4,5].map(i => (
                <tr key={i}><td colSpan={7}><div className="sk sk-text" style={{ height: 16, width: `${55 + Math.random() * 35}%` }} /></td></tr>
              )) : filtered.length ? filtered.map(s => (
                <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => openDetail(s)}>
                  <td style={{ fontWeight: 800 }}>{s.name}</td>
                  <td>{s.contact}</td>
                  <td>{s.wa}</td><td>{s.rubro}</td><td>{s.email}</td>
                  <td><span className="badge b-sent">{supplierProducts(s).length}</span></td>
                  <td><div className="acts" onClick={e => e.stopPropagation()}>
                    <button className="act edit" onClick={() => openEdit(s)}><i className="fa fa-pen" /></button>
                    <button className="act del" onClick={() => del(s.id)}><i className="fa fa-trash" /></button>
                  </div></td>
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
        <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) setModal(false) }}>
          <div className="modal">
            <div className="mh"><h3>{form.id ? 'Editar' : 'Agregar'} proveedor</h3><button className="mclose" onClick={() => setModal(false)}><i className="fa fa-xmark" /></button></div>
            <div className="grid2">
              <div className="fg"><label>Nombre *</label><input type="text" value={form.name} onChange={e => setF('name', e.target.value)} placeholder="Proveedor S.A." /></div>
              <div className="fg"><label>Contacto</label><input type="text" value={form.contact} onChange={e => setF('contact', e.target.value)} /></div>
              <div className="fg"><label>WhatsApp</label><input type="text" value={form.wa} onChange={e => setF('wa', e.target.value)} /></div>
              <div className="fg"><label>Rubro</label><input type="text" value={form.rubro} onChange={e => setF('rubro', e.target.value)} /></div>
            </div>
            <div className="fg"><label>Email</label><input type="email" value={form.email} onChange={e => setF('email', e.target.value)} /></div>
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
                  <button className="btn btn-ghost btn-xs" onClick={() => openEdit(detailSupplier)}><i className="fa fa-pen" /> Editar</button>
                  <button className="mclose" onClick={() => setDetailSupplier(null)}><i className="fa fa-xmark" /></button>
                </div>
              </div>
            </div>

            {/* Pestañas */}
            <div className="detail-tabs">
              {[['info', 'Información'], ['productos', 'Productos'], ['notas', 'Notas']].map(([k, l]) => (
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

                  {/* KPI rápido */}
                  {(() => {
                    const prods = supplierProducts(detailSupplier)
                    const costTotal = supplierCostTotal(detailSupplier)
                    if (prods.length > 0) return (
                      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                        <div style={{ flex: 1, background: 'var(--surface2)', borderRadius: 10, padding: '10px 14px', textAlign: 'center' }}>
                          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--txt)' }}>{prods.length}</div>
                          <div style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 1 }}>Productos</div>
                        </div>
                        <div style={{ flex: 1, background: 'var(--surface2)', borderRadius: 10, padding: '10px 14px', textAlign: 'center' }}>
                          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--money)' }}>{fmt(costTotal)}</div>
                          <div style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 1 }}>Costo total catálogo</div>
                        </div>
                      </div>
                    )
                    return null
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
