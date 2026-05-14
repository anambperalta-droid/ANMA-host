import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '../../context/DataContext'
import { useToast } from '../../context/ToastContext'
import { fmt, STATUS_MAP, STATUS_CLS } from '../../lib/storage'

/* ── Modal de vista previa de presupuesto (solo lectura) ── */
function BudgetPreviewModal({ budget, config, onClose, onEdit }) {
  if (!budget) return null
  const c = config
  const brandColor = c.brandColor || '#7C3AED'
  const bName = c.businessName || 'ANMA'
  const items = budget.items || []
  const num = (v) => { const n = Number(v); return isNaN(n) ? 0 : n }

  return (
    <div className="modal-bg open" style={{ zIndex: 700 }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: 'var(--surface)', borderRadius: 18, width: '100%', maxWidth: 940, height: 'min(900px, 92vh)', boxShadow: 'var(--sh-lg)', animation: 'pgIn .2s ease both', display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0, margin: 'auto 0' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0, background: 'var(--surface2)', borderRadius: '18px 18px 0 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="fa fa-file-invoice-dollar" style={{ color: brandColor }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt)' }}>Vista previa — {budget.num || '—'}</span>
            <span className={`badge ${STATUS_CLS[budget.status] || 'b-draft'}`}>{STATUS_MAP[budget.status] || 'Borrador'}</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-ghost btn-xs" onClick={onEdit}><i className="fa fa-pen" /> Editar presupuesto</button>
            <button className="mclose" onClick={onClose}><i className="fa fa-xmark" /></button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', background: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 18, borderBottom: `3px solid ${brandColor}`, marginBottom: 20 }}>
            <div>
              {c.logo ? <img src={c.logo} alt={bName} style={{ height: 44, marginBottom: 6 }} /> : <div style={{ fontSize: 24, fontWeight: 800, color: brandColor, letterSpacing: '-1px' }}>{bName}</div>}
              {c.subtitle && <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{c.subtitle}</div>}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#1E1B4B', letterSpacing: '-.5px' }}>{budget.num || '—'}</div>
              <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>Fecha: {budget.date || '—'}</div>
              {budget.deliveryDate && <div style={{ fontSize: 12, color: '#666' }}>Entrega: {budget.deliveryDate}</div>}
            </div>
          </div>
          <div style={{ background: '#F8F9FE', borderRadius: 10, padding: '14px 18px', marginBottom: 20 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 6 }}>Datos del cliente</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px', fontSize: 13, color: '#1E1B4B' }}>
              {budget.contact && <div><span style={{ color: '#888', fontSize: 11 }}>Contacto: </span><b>{budget.contact}</b></div>}
              {budget.company && <div><span style={{ color: '#888', fontSize: 11 }}>Empresa: </span><b>{budget.company}</b></div>}
              {budget.wa && <div><span style={{ color: '#888', fontSize: 11 }}>WhatsApp: </span>{budget.wa}</div>}
            </div>
          </div>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 8 }}>Detalle de productos</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: brandColor }}>
                  <th style={{ padding: '9px 12px', textAlign: 'left', color: '#fff', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px' }}>Producto</th>
                  <th style={{ padding: '9px 12px', textAlign: 'center', color: '#fff', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>Cant.</th>
                  <th style={{ padding: '9px 12px', textAlign: 'right', color: '#fff', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>Precio unit.</th>
                  <th style={{ padding: '9px 12px', textAlign: 'right', color: '#fff', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {items.length ? items.map((it, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #E5E7F0' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 500 }}>{it.name || '—'}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>{num(it.qty)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>{fmt(num(it.priceUnit))}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>{fmt(num(it.qty) * num(it.priceUnit))}</td>
                  </tr>
                )) : <tr><td colSpan={4} style={{ padding: 16, textAlign: 'center', color: '#888' }}>Sin productos</td></tr>}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ width: 260 }}>
              {num(budget.shipCost) > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13, color: '#666', borderBottom: '1px solid #E5E7F0' }}>
                  <span>Envío</span><span>{fmt(num(budget.shipCost))}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0 6px', fontSize: 20, fontWeight: 800, color: brandColor }}>
                <span>Total</span><span>{fmt(num(budget.total))}</span>
              </div>
              {num(budget.depositAmt) > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13, color: brandColor, fontWeight: 600 }}>
                  <span>Seña ({num(budget.deposit) || 50}%)</span><span>{fmt(num(budget.depositAmt))}</span>
                </div>
              )}
            </div>
          </div>
          {budget.noteCli && (
            <div style={{ marginTop: 20, background: '#F4F6FD', borderRadius: 8, padding: '12px 16px', fontSize: 12, color: '#4B5280', lineHeight: 1.6 }}>
              <i className="fa fa-message" style={{ color: brandColor, marginRight: 6 }} />{budget.noteCli}
            </div>
          )}
          <div style={{ marginTop: 24, paddingTop: 14, borderTop: '1px solid #E5E7F0', fontSize: 10, color: '#999', lineHeight: 1.6 }}>
            {c.paymentConditions && <div>{c.paymentConditions}</div>}
            {c.legalNote && <div style={{ marginTop: 3 }}>{c.legalNote}</div>}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Clientes() {
  const { get, saveEntity, deleteEntity, config } = useData()
  const toast = useToast()
  const nav = useNavigate()
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(false)
  const [importModal, setImportModal] = useState(false)
  const [detailClient, setDetailClient] = useState(null)
  const [detailTab, setDetailTab] = useState('info')
  const [viewMode, setViewMode] = useState('cards')
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ company: '', contact: '', wa: '', email: '', rubro: '', notes: '', clientType: 'b2c' })
  const [newNote, setNewNote] = useState('')
  const [previewBudget, setPreviewBudget] = useState(null)
  const fileRef = useRef(null)
  const [csvPreview, setCsvPreview] = useState([])
  const [revinculModal, setRevinculModal] = useState(null)
  const [revinculMsg, setRevinculMsg] = useState('')

  useEffect(() => { const t = setTimeout(() => setLoading(false), 80); return () => clearTimeout(t) }, [])

  const clients = get('clients')
  const budgets = get('budgets')
  const sq = search.toLowerCase()
  const filtered = search ? clients.filter(c =>
    (c.company || '').toLowerCase().includes(sq) || (c.contact || '').toLowerCase().includes(sq) || (c.rubro || '').toLowerCase().includes(sq)
  ) : clients

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const openEdit = (c) => { setForm(c || { company: '', contact: '', wa: '', email: '', rubro: '', notes: '', clientType: 'b2c' }); setModal(true) }
  const save = () => {
    if (!form.company) { toast('Ingresá el nombre de la empresa.', 'er'); return }
    saveEntity('clients', form); setModal(false); toast('Cliente guardado', 'ok')
    if (detailClient && form.id === detailClient.id) setDetailClient({ ...detailClient, ...form })
  }
  const del = (id) => {
    if (window.confirm('¿Eliminar cliente?')) {
      deleteEntity('clients', id); toast('Cliente eliminado', 'in')
      if (detailClient?.id === id) setDetailClient(null)
    }
  }

  const exportCSV = () => {
    const rows = [['Empresa', 'Contacto', 'WhatsApp', 'Email', 'Rubro', 'Notas'].join(',')]
    clients.forEach(c => rows.push([c.company, c.contact, c.wa, c.email, c.rubro, c.notes].map(v => `"${(v || '').replace(/"/g, '""')}"`).join(',')))
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'clientes.csv'; a.click()
  }

  /* ── Parsear vCard .vcf ── */
  const parseVcf = (text) => {
    const cards = text.split(/END:VCARD/i).filter(s => s.includes('BEGIN:VCARD'))
    return cards.map(card => {
      const get = (field) => {
        const m = card.match(new RegExp(`^${field}[^:]*:(.+)$`, 'mi'))
        return m ? m[1].replace(/\\n/g, ' ').replace(/\r/g, '').trim() : ''
      }
      const fnRaw = get('FN') || get('N').split(';').filter(Boolean).join(' ')
      const telRaw = get('TEL') || ''
      const emailRaw = get('EMAIL') || ''
      const orgRaw = get('ORG') || ''
      const tel = telRaw.replace(/[\s\-\(\)]/g, '').replace(/^\+54/, '').replace(/^54/, '')
      return { company: orgRaw || fnRaw, contact: fnRaw, wa: tel, email: emailRaw, rubro: '', notes: '' }
    }).filter(c => c.company || c.contact)
  }

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const content = ev.target.result
      // Detectar si es .vcf
      if (file.name.endsWith('.vcf') || content.includes('BEGIN:VCARD')) {
        setCsvPreview(parseVcf(content))
        return
      }
      // CSV
      const lines = content.split('\n').filter(l => l.trim())
      const header = lines[0].toLowerCase()
      const startIdx = header.includes('empresa') || header.includes('company') ? 1 : 0
      const parsed = []
      for (let i = startIdx; i < lines.length; i++) {
        const parts = lines[i].match(/(".*?"|[^,]+)/g)?.map(v => v.replace(/^"|"$/g, '').trim()) || []
        if (parts.length >= 1 && parts[0]) {
          parsed.push({ company: parts[0] || '', contact: parts[1] || '', wa: parts[2] || '', email: parts[3] || '', rubro: parts[4] || '', notes: parts[5] || '' })
        }
      }
      setCsvPreview(parsed)
    }
    reader.readAsText(file, 'UTF-8')
  }

  const doImport = () => {
    csvPreview.forEach(c => saveEntity('clients', { ...c }))
    toast(`${csvPreview.length} clientes importados`, 'ok')
    setCsvPreview([]); setImportModal(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const clientBudgets = (c) => budgets.filter(b => b.company === c.company || b.contact === c.contact)

  const clientTotalVendido = (c) => clientBudgets(c)
    .filter(b => ['confirmed', 'paid', 'partial'].includes(b.status))
    .reduce((s, b) => s + (Number(b.total) || 0), 0)

  const clientLastBudgetDays = (c) => {
    const sorted = clientBudgets(c).filter(b => b.date).sort((a, b) => new Date(b.date) - new Date(a.date))
    if (!sorted.length) return null
    const diff = Math.floor((Date.now() - new Date(sorted[0].date)) / 86400000)
    return diff
  }

  const clientPayStatus = (c) => {
    const bs = clientBudgets(c)
    if (!bs.length) return 'none'
    const hasPending = bs.some(b => b.payStatus === 'pending' && b.status === 'confirmed')
    const hasPartial = bs.some(b => b.payStatus === 'partial' && b.status === 'confirmed')
    const allPaid = bs.filter(b => b.status === 'confirmed').every(b => b.payStatus === 'paid')
    if (hasPending) return 'pending'
    if (hasPartial) return 'partial'
    if (allPaid && bs.some(b => b.status === 'confirmed')) return 'paid'
    return 'none'
  }

  const clientLastDate = (c) => {
    const sorted = clientBudgets(c).filter(b => b.date).sort((a, b) => new Date(b.date) - new Date(a.date))
    if (!sorted.length) return null
    const d = new Date(sorted[0].date)
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getFullYear()).slice(2)}`
  }

  const openRevincul = (c, e) => {
    e.stopPropagation()
    const msg = `Hola ${c.contact || c.company}! 👋 Te escribo desde ANMA Regalos. ¿Tenés algún evento próximo? ¡Podemos ayudarte con regalos y souvenirs personalizados! 🎁`
    setRevinculMsg(msg)
    setRevinculModal(c)
  }

  const sendRevincul = () => {
    if (!revinculModal?.wa) return
    const num = revinculModal.wa.replace(/\D/g, '')
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(revinculMsg)}`, '_blank')
    setRevinculModal(null)
  }

  const addNote = () => {
    if (!newNote.trim() || !detailClient) return
    const existing = detailClient.noteHistory || []
    const updated = [...existing, { text: newNote.trim(), date: new Date().toISOString().slice(0, 16).replace('T', ' ') }]
    saveEntity('clients', { ...detailClient, noteHistory: updated })
    setDetailClient({ ...detailClient, noteHistory: updated })
    setNewNote('')
    toast('Nota agregada', 'ok')
  }

  const openWA = (c) => {
    if (!c.wa) return
    const num = c.wa.replace(/\D/g, '')
    const text = `Hola ${c.contact || c.company}, te contacto desde ANMA por el siguiente tema: `
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(text)}`, '_blank')
  }

  // ESC global se maneja en AppShell

  const openDetail = (c) => { setDetailClient(c); setDetailTab('info') }

  return (
    <div className="page active" style={{ animation: 'pgIn .2s ease both' }}>
      <div className="ph zt-ph">
        <div className="ph-left"><h2>Clientes</h2></div>
        <div className="ph-right">
          <button className="btn btn-ghost btn-sm" onClick={() => setImportModal(true)}><i className="fa fa-file-import" /> Importar</button>
          <button className="btn btn-secondary btn-sm" onClick={exportCSV}><i className="fa fa-download" /> Exportar</button>
          <button className="btn btn-primary btn-sm" onClick={() => openEdit()}><i className="fa fa-plus" /> Agregar</button>
        </div>
      </div>
      <div className="pill-row">
        <div className="search-row zt-search-row"><i className="fa fa-magnifying-glass" /><input type="text" placeholder="Buscar empresa, contacto, rubro..." value={search} onChange={e => setSearch(e.target.value)} /></div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <button className={`pill ${viewMode === 'table' ? 'active' : ''}`} onClick={() => setViewMode('table')}><i className="fa fa-table-list" /></button>
          <button className={`pill ${viewMode === 'cards' ? 'active' : ''}`} onClick={() => setViewMode('cards')}><i className="fa fa-grip" /></button>
        </div>
      </div>

      <style>{`
        .zt-tbl{max-width:1100px;margin:0 auto}
        .zt-tbl table{width:100%;border-collapse:separate;border-spacing:0;table-layout:fixed}
        .zt-tbl thead th{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:#4B5563;padding:9px 8px;white-space:nowrap}
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
        .zt-ph .btn{height:40px!important;font-size:14px!important;font-weight:500!important;padding-left:16px!important;padding-right:16px!important}
        .zt-search-row{background:#F9FAFB!important;border:1px solid #E5E7EB!important;box-shadow:none!important}
      `}</style>
      {viewMode === 'table' ? (
        <div className="tbl-card zt-tbl">
          <table>
            <colgroup>
              <col style={{ width: 36 }} />
              <col style={{ width: 240 }} />
              <col style={{ width: 40 }} />
              <col style={{ width: 40 }} />
              <col style={{ width: 160 }} />
              <col style={{ width: 130 }} />
              <col style={{ width: 110 }} />
            </colgroup>
            <thead><tr>
              <th></th>
              <th style={{ textAlign: 'left' }}>Empresa / Contacto</th>
              <th style={{ textAlign: 'center' }} title="WhatsApp"><i className="fa-brands fa-whatsapp" style={{ color: '#6B7280', fontSize: 13 }} /></th>
              <th style={{ textAlign: 'center' }} title="Email"><i className="fa fa-envelope" style={{ color: '#6B7280', fontSize: 12 }} /></th>
              <th style={{ textAlign: 'right' }} className="col-hide-mobile">Rubro</th>
              <th style={{ textAlign: 'right' }}>Última actividad</th>
              <th style={{ textAlign: 'right' }}>Acciones</th>
            </tr></thead>
            <tbody>
              {loading ? [1,2,3,4,5].map(i => (
                <tr key={i}><td colSpan={7}><div className="sk sk-text" style={{ height: 16, width: `${55 + Math.random() * 35}%` }} /></td></tr>
              )) : filtered.length ? filtered.map(c => {
                const days = clientLastBudgetDays(c)
                const dotColor = days === null ? '#CBD5E1' : days <= 15 ? '#16A34A' : days <= 45 ? '#D97706' : '#DC2626'
                const dotTip = days === null ? 'Sin pedidos' : days <= 15 ? `Activo — hace ${days}d` : days <= 45 ? `Tibio — hace ${days}d` : `Frío — hace ${days}d`
                const isCold = days === null || days > 30
                return (
                  <tr key={c.id} onClick={() => openDetail(c)}>
                    <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                      <input type="checkbox" className="zt-chk" />
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span title={dotTip} style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--txt)', lineHeight: 1.3 }}>{c.company || c.contact || '—'}</div>
                          {c.contact && c.company && <div style={{ fontSize: 11, color: '#6B7280', marginTop: 1 }}>{c.contact}</div>}
                        </div>
                      </div>
                    </td>
                    <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                      {c.wa ? (
                        <a href={`https://wa.me/${c.wa.replace(/\D/g,'')}`} target="_blank" rel="noopener noreferrer" title={c.wa}
                          className="zt-ci" style={{ background: '#DCFCE7', color: '#16A34A' }}>
                          <i className="fa-brands fa-whatsapp" />
                        </a>
                      ) : <span style={{ color: 'var(--txt4)', fontSize: 11 }}>—</span>}
                    </td>
                    <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                      {c.email ? (
                        <a href={`mailto:${c.email}`} title={c.email}
                          className="zt-ci" style={{ background: '#EFF6FF', color: '#2563EB' }}>
                          <i className="fa fa-envelope" />
                        </a>
                      ) : <span style={{ color: 'var(--txt4)', fontSize: 11 }}>—</span>}
                    </td>
                    <td className="col-hide-mobile" style={{ textAlign: 'right' }}>
                      {c.rubro
                        ? <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--txt2)' }}>{c.rubro}</span>
                        : <span style={{ color: 'var(--txt4)', fontSize: 11 }}>—</span>}
                    </td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {clientLastDate(c)
                        ? <span style={{ fontSize: 12, fontWeight: 400, color: isCold ? '#DC2626' : '#6B7280' }}>{clientLastDate(c)}</span>
                        : <span style={{ fontSize: 11, color: '#9CA3AF' }}>Sin pedidos</span>}
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <div className="zt-acts">
                        {c.wa && (
                          <button
                            title={isCold ? 'Recontactar — sin actividad >30d' : 'Re-vincular por WhatsApp'}
                            className="zt-icon-btn"
                            style={{ background: isCold ? '#FEF9C3' : 'var(--surface2)', color: isCold ? '#EAB308' : 'var(--txt3)' }}
                            onClick={e => openRevincul(c, e)}>
                            <i className="fa fa-bolt" />
                          </button>
                        )}
                        <button title="Editar" className="zt-icon-btn" style={{ background: 'var(--surface2)', color: 'var(--txt2)' }} onClick={() => openEdit(c)}>
                          <i className="fa fa-pen" />
                        </button>
                        <button title="Eliminar" className="zt-icon-btn" style={{ background: '#FEF2F2', color: '#DC2626' }} onClick={() => del(c.id)}>
                          <i className="fa fa-trash" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              }) : <tr><td colSpan={7}><div className="empty"><div className="ico"><i className="fa fa-users" /></div><h4>Sin clientes</h4><p>Agregá tu primer cliente o empresa</p></div></td></tr>}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="nc-grid">
          {loading ? [1,2,3,4,5,6,7,8].map(i => (
            <div key={i} className="nc" style={{ flexDirection: 'column', alignItems: 'center', padding: '20px 14px 14px', gap: 0 }}>
              <div className="sk" style={{ width: 60, height: 60, borderRadius: '50%', background: 'var(--surface3)', animation: 'skPulse 1.4s ease infinite', flexShrink: 0, marginBottom: 10 }} />
              <div className="sk-line" style={{ width: '65%', marginBottom: 6 }} />
              <div className="sk-line" style={{ width: '40%' }} />
            </div>
          )) : filtered.length ? filtered.map(c => {
            const ps = clientPayStatus(c)
            const dotColor = ps === 'pending' ? '#DC2626' : ps === 'partial' ? '#D97706' : ps === 'paid' ? '#16A34A' : 'var(--border2)'
            const dotTitle = ps === 'pending' ? 'Pago pendiente' : ps === 'partial' ? 'Seña abonada' : ps === 'paid' ? 'Pagado' : 'Sin pedidos'
            const buds = clientBudgets(c)
            const totalSold = clientTotalVendido(c)
            const days = clientLastBudgetDays(c)
            return (
              <div key={c.id} className="nc" onClick={() => openDetail(c)}>
                {/* Avatar centrado con dot de estado */}
                <div className="nc-ava nc-ava-brand">
                  {(c.company || '?')[0].toUpperCase()}
                  <span className="nc-dot" style={{ background: dotColor, border: '2.5px solid var(--surface)' }} title={dotTitle} />
                </div>

                {/* Nombre e info centrada */}
                <div className="nc-body">
                  <div className="nc-title">{c.company}</div>
                  <div className="nc-sub">
                    {c.contact || c.rubro || <span style={{ color: 'var(--txt4)' }}>Sin contacto</span>}
                  </div>
                  {(buds.length > 0 || totalSold > 0) && (
                    <div className="nc-meta">
                      <span><i className="fa fa-file-invoice" style={{ fontSize: 10, marginRight: 3 }} />{buds.length}</span>
                      {totalSold > 0 && <span className="nc-meta-val">{fmt(totalSold)}</span>}
                      {days !== null && <span>{days === 0 ? 'hoy' : days === 1 ? 'ayer' : `${days}d`}</span>}
                    </div>
                  )}
                </div>

                {/* Íconos de contacto rápido */}
                <div className="nc-qact" onClick={e => e.stopPropagation()}>
                  {c.wa && (
                    <button className="ibtn ibtn-wa ibtn-sm" title={`WhatsApp · ${c.wa}`} onClick={() => openWA(c)}>
                      <i className="fa-brands fa-whatsapp" />
                    </button>
                  )}
                  {c.email && (
                    <a href={`mailto:${c.email}`} className="ibtn ibtn-email ibtn-sm" title={c.email}
                      onClick={e => e.stopPropagation()}>
                      <i className="fa fa-envelope" />
                    </a>
                  )}
                  <button className="ibtn ibtn-edit ibtn-sm" title="Editar cliente" onClick={() => openEdit(c)}>
                    <i className="fa fa-pen" />
                  </button>
                </div>
              </div>
            )
          }) : (
            <div className="empty-native" style={{ gridColumn: '1 / -1' }}>
              <div className="ico"><i className="fa fa-users" /></div>
              <h4>Sin clientes</h4>
              <p>Agregá tu primer cliente para empezar a gestionar pedidos.</p>
              <button className="btn btn-primary btn-sm" onClick={() => openEdit()} style={{ marginTop: 4 }}>
                <i className="fa fa-plus" /> Agregar cliente
              </button>
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 8, fontSize: 11, color: 'var(--txt3)' }}>{filtered.length} cliente{filtered.length !== 1 ? 's' : ''}</div>

      {/* MODAL EDITAR */}
      {modal && (
        <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) setModal(false) }}>
          <div className="modal">
            <div className="mh"><h3>{form.id ? 'Editar' : 'Agregar'} cliente</h3><button className="mclose" onClick={() => setModal(false)}><i className="fa fa-xmark" /></button></div>
            <div className="grid2">
              <div className="fg"><label>Empresa *</label><input type="text" value={form.company} onChange={e => setF('company', e.target.value)} placeholder="Empresa S.A." /></div>
              <div className="fg"><label>Contacto</label><input type="text" value={form.contact} onChange={e => setF('contact', e.target.value)} placeholder="Nombre" /></div>
              <div className="fg"><label>WhatsApp</label><input type="text" value={form.wa} onChange={e => setF('wa', e.target.value)} placeholder="+54 ..." /></div>
              <div className="fg"><label>Email</label><input type="email" value={form.email} onChange={e => setF('email', e.target.value)} /></div>
            </div>
            <div className="grid2">
              <div className="fg"><label>Rubro</label><input type="text" value={form.rubro} onChange={e => setF('rubro', e.target.value)} placeholder="Tecnología, Salud..." /></div>
              <div className="fg"><label>Tipo de cliente</label>
                <select value={form.clientType || 'b2c'} onChange={e => setF('clientType', e.target.value)}>
                  <option value="b2c">B2C — Cliente final</option>
                  <option value="b2b">B2B — Empresa / Mayorista</option>
                </select>
              </div>
            </div>
            <div className="fg"><label>Notas</label><textarea value={form.notes} onChange={e => setF('notes', e.target.value)} rows={2} placeholder="Observaciones..." /></div>
            <div className="mfooter"><button className="btn btn-secondary" onClick={() => setModal(false)}>Cancelar</button><button className="btn btn-primary" onClick={save}><i className="fa fa-floppy-disk" /> Guardar</button></div>
          </div>
        </div>
      )}

      {/* FICHA DETALLE */}
      {detailClient && (
        <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) setDetailClient(null) }}>
          <div className="modal" style={{ maxWidth: 820, height: 'min(820px, 92vh)', overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: 0 }} onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--grad)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                    {(detailClient.company || '?')[0].toUpperCase()}
                  </div>
                  <div>
                    <h3 style={{ fontSize: 17, fontWeight: 900, color: 'var(--txt)', letterSpacing: '-.4px', margin: 0, lineHeight: 1.2 }}>{detailClient.company}</h3>
                    <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {detailClient.contact && <span>{detailClient.contact}</span>}
                      <span className={`badge ${detailClient.clientType === 'b2b' ? 'b-confirmed' : 'b-sent'}`} style={{ fontSize: 9 }}>{detailClient.clientType === 'b2b' ? 'B2B' : 'B2C'}</span>
                      {detailClient.rubro && <span style={{ color: 'var(--txt4)' }}>· {detailClient.rubro}</span>}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 5 }}>
                  <button className="btn btn-ghost btn-xs" onClick={() => openEdit(detailClient)}><i className="fa fa-pen" /> Editar</button>
                  <button className="mclose" onClick={() => setDetailClient(null)}><i className="fa fa-xmark" /></button>
                </div>
              </div>
            </div>

            {/* Pestañas */}
            <div className="detail-tabs">
              {[['info', 'Información'], ['historial', 'Historial'], ['notas', 'Notas']].map(([k, l]) => (
                <div key={k} className={`detail-tab ${detailTab === k ? 'active' : ''}`} onClick={() => setDetailTab(k)}>{l}</div>
              ))}
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>

              {/* TAB: Información */}
              {detailTab === 'info' && (
                <div>
                  {/* Links activos */}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                    {detailClient.wa && (
                      <a
                        href="#"
                        onClick={e => { e.preventDefault(); openWA(detailClient) }}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#DCFCE7', color: '#16A34A', fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 20, textDecoration: 'none', cursor: 'pointer', transition: 'opacity .15s' }}
                        onMouseEnter={e => e.currentTarget.style.opacity = '.8'}
                        onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                        title="Abrir chat de WhatsApp"
                      >
                        <i className="fa-brands fa-whatsapp" />{detailClient.wa}
                      </a>
                    )}
                    {detailClient.email && (
                      <a
                        href={`mailto:${detailClient.email}`}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--blue-lt)', color: 'var(--blue)', fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 20, textDecoration: 'none', transition: 'opacity .15s' }}
                        onMouseEnter={e => e.currentTarget.style.opacity = '.8'}
                        onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                      >
                        <i className="fa fa-envelope" />{detailClient.email}
                      </a>
                    )}
                    {detailClient.rubro && <span className="badge b-purple">{detailClient.rubro}</span>}
                  </div>

                  {/* KPI rápido */}
                  {(() => {
                    const bgs = clientBudgets(detailClient)
                    const totalVendido = clientTotalVendido(detailClient)
                    const lastDays = clientLastBudgetDays(detailClient)
                    if (bgs.length > 0) return (
                      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                        <div style={{ flex: 1, background: 'var(--surface2)', borderRadius: 10, padding: '10px 14px', textAlign: 'center' }}>
                          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--money)' }}>{fmt(totalVendido)}</div>
                          <div style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 1 }}>Total vendido</div>
                        </div>
                        <div style={{ flex: 1, background: 'var(--surface2)', borderRadius: 10, padding: '10px 14px', textAlign: 'center' }}>
                          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--txt)' }}>
                            {lastDays === null ? '—' : lastDays === 0 ? 'Hoy' : `hace ${lastDays}d`}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 1 }}>Último pedido</div>
                        </div>
                        <div style={{ flex: 1, background: 'var(--surface2)', borderRadius: 10, padding: '10px 14px', textAlign: 'center' }}>
                          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--txt)' }}>{bgs.length}</div>
                          <div style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 1 }}>Presupuestos</div>
                        </div>
                      </div>
                    )
                    return null
                  })()}

                  {/* Nota general */}
                  {detailClient.notes ? (
                    <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '12px 14px', fontSize: 12, color: 'var(--txt2)', fontStyle: 'italic', borderLeft: '3px solid var(--brand)' }}>
                      {detailClient.notes}
                    </div>
                  ) : (
                    <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '12px 14px', fontSize: 12, color: 'var(--txt4)', fontStyle: 'italic', borderLeft: '3px solid var(--border)' }}>
                      <i className="fa fa-pencil" style={{ marginRight: 6 }} />Agrega notas sobre preferencias, condiciones especiales o recordatorios de seguimiento...
                    </div>
                  )}
                </div>
              )}

              {/* TAB: Historial de presupuestos */}
              {detailTab === 'historial' && (
                <div>
                  {clientBudgets(detailClient).length ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {clientBudgets(detailClient).sort((a, b) => b.id - a.id).map(b => (
                        <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--surface2)', borderRadius: 8, cursor: 'pointer', transition: 'background .15s' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--brand-xlt)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'var(--surface2)'}
                          onClick={() => setPreviewBudget(b)}>
                          <div style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--brand-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand)', fontSize: 12, flexShrink: 0 }}>
                            <i className="fa fa-file-invoice-dollar" />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--txt)' }}>{b.num || '—'}</span>
                              <span className={`badge ${STATUS_CLS[b.status] || 'b-draft'}`}>{STATUS_MAP[b.status] || 'Borrador'}</span>
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 1 }}>{b.date || '—'}</div>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--money)' }}>{fmt(b.total)}</div>
                          </div>
                          <i className="fa fa-chevron-right" style={{ color: 'var(--txt4)', fontSize: 10 }} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: 24, color: 'var(--txt3)', fontSize: 12 }}>
                      <i className="fa fa-file-circle-xmark" style={{ marginRight: 5 }} />Sin presupuestos para este cliente
                    </div>
                  )}
                </div>
              )}

              {/* TAB: Notas de seguimiento */}
              {detailTab === 'notas' && (
                <div>
                  {(detailClient.noteHistory || []).length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12, maxHeight: 280, overflowY: 'auto' }}>
                      {(detailClient.noteHistory || []).map((n, i) => (
                        <div key={i} style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px', borderLeft: '3px solid var(--amber)' }}>
                          <div style={{ fontSize: 12, color: 'var(--txt)', lineHeight: 1.5 }}>{n.text}</div>
                          <div style={{ fontSize: 9, color: 'var(--txt3)', marginTop: 3 }}><i className="fa fa-clock" style={{ marginRight: 3 }} />{n.date}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: '16px 14px', marginBottom: 12, textAlign: 'center', color: 'var(--txt4)', fontSize: 12 }}>
                      <i className="fa fa-note-sticky" style={{ fontSize: 18, display: 'block', marginBottom: 6, opacity: .4 }} />
                      Agrega notas de seguimiento, acuerdos o recordatorios sobre este cliente...
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input type="text" value={newNote} onChange={e => setNewNote(e.target.value)} onKeyDown={e => e.key === 'Enter' && addNote()}
                      placeholder="Escribí una nota de seguimiento..."
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
            <div className="mh"><h3>Importar contactos</h3><button className="mclose" onClick={() => { setImportModal(false); setCsvPreview([]) }}><i className="fa fa-xmark" /></button></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              <div style={{ padding: '10px 13px', borderRadius: 10, background: 'rgba(37,211,102,.07)', border: '1px solid rgba(37,211,102,.2)', fontSize: 11, color: 'var(--txt2)' }}>
                <div style={{ fontWeight: 700, color: 'var(--txt)', marginBottom: 4 }}><i className="fa-brands fa-whatsapp" style={{ color: '#25D366', marginRight: 5 }} />Desde WhatsApp / Teléfono</div>
                <div>Exportá tus contactos como <b>.vcf</b> desde el teléfono y subí el archivo acá. Se importan nombre, celular y email automáticamente.</div>
              </div>
              <div style={{ padding: '10px 13px', borderRadius: 10, background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 11, color: 'var(--txt2)' }}>
                <div style={{ fontWeight: 700, color: 'var(--txt)', marginBottom: 4 }}><i className="fa fa-file-csv" style={{ color: '#0F9D58', marginRight: 5 }} />Desde planilla CSV</div>
                <div><b>Columnas:</b> Empresa, Contacto, WhatsApp, Email, Rubro, Notas</div>
              </div>
            </div>
            <div className="fg">
              <label>Seleccioná archivo (.vcf de contactos o .csv)</label>
              <input ref={fileRef} type="file" accept=".csv,.txt,.vcf" onChange={handleFileSelect}
                style={{ padding: '8px 12px', border: '1.5px dashed var(--border)', borderRadius: 8, width: '100%', cursor: 'pointer', fontSize: 12 }} />
            </div>
            {csvPreview.length > 0 && (
              <>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt)', margin: '8px 0 6px' }}>Vista previa ({csvPreview.length} registros)</div>
                <div style={{ maxHeight: 180, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
                  <table style={{ fontSize: 11 }}>
                    <thead><tr><th>Empresa</th><th>Contacto</th><th>WA</th><th>Email</th><th>Rubro</th></tr></thead>
                    <tbody>
                      {csvPreview.slice(0, 10).map((c, i) => (
                        <tr key={i}><td>{c.company}</td><td>{c.contact}</td><td>{c.wa}</td><td>{c.email}</td><td>{c.rubro}</td></tr>
                      ))}
                      {csvPreview.length > 10 && <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--txt3)' }}>...y {csvPreview.length - 10} más</td></tr>}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            <div className="mfooter">
              <button className="btn btn-secondary" onClick={() => { setImportModal(false); setCsvPreview([]) }}>Cancelar</button>
              <button className="btn btn-primary" onClick={doImport} disabled={!csvPreview.length}><i className="fa fa-file-import" /> Importar {csvPreview.length}</button>
            </div>
          </div>
        </div>
      )}

      {previewBudget && (
        <BudgetPreviewModal
          budget={previewBudget}
          config={config()}
          onClose={() => setPreviewBudget(null)}
          onEdit={() => { setPreviewBudget(null); setDetailClient(null); nav(`/presupuesto/${previewBudget.id}`) }}
        />
      )}

      {/* MODAL RE-VINCULAR */}
      {revinculModal && (
        <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) setRevinculModal(null) }}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="mh">
              <h3><i className="fa fa-bolt" style={{ color: '#D97706', marginRight: 6 }} />Re-vincular — {revinculModal.company}</h3>
              <button className="mclose" onClick={() => setRevinculModal(null)}><i className="fa fa-xmark" /></button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--txt3)', marginBottom: 10 }}>
              Editá el mensaje antes de enviar a <b>{revinculModal.contact || revinculModal.company}</b>
              {revinculModal.wa && <span style={{ color: 'var(--txt4)', marginLeft: 4 }}>· {revinculModal.wa}</span>}
            </div>
            <div className="fg">
              <label>Mensaje</label>
              <textarea value={revinculMsg} onChange={e => setRevinculMsg(e.target.value)} rows={4}
                style={{ resize: 'vertical', fontFamily: 'inherit', fontSize: 13, lineHeight: 1.6, width: '100%', padding: '8px 12px', border: '1.5px solid var(--border)', borderRadius: 8, boxSizing: 'border-box' }} />
            </div>
            {!revinculModal.wa && (
              <div style={{ fontSize: 11, color: '#DC2626', background: '#FEE2E2', borderRadius: 8, padding: '8px 12px', marginBottom: 8 }}>
                <i className="fa fa-triangle-exclamation" style={{ marginRight: 5 }} />Esta clienta no tiene WhatsApp registrado.
              </div>
            )}
            <div className="mfooter">
              <button className="btn btn-secondary" onClick={() => setRevinculModal(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={sendRevincul} disabled={!revinculModal.wa}
                style={{ background: '#16A34A', borderColor: '#16A34A' }}>
                <i className="fa-brands fa-whatsapp" /> Enviar a WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
