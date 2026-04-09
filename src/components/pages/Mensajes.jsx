import { useState, useEffect, useMemo, useRef } from 'react'
import { useData } from '../../context/DataContext'
import { useToast } from '../../context/ToastContext'
import { fmt } from '../../lib/storage'

/* ═══ 5 Solapas de venta ═══ */
const STAGES = ['Captación', 'Presupuestos', 'Pagos', 'Logística', 'Post-Venta']
const STAGE_ICONS = {
  'Captación': 'fa-bullhorn',
  'Presupuestos': 'fa-file-invoice-dollar',
  'Pagos': 'fa-credit-card',
  'Logística': 'fa-truck-fast',
  'Post-Venta': 'fa-heart',
}

/* ═══ 12 templates default ═══ */
const DEFAULT_TEMPLATES = [
  { stage: 'Captación', title: 'Presentacion inicial', isDefault: true,
    text: 'Hola {{nombre}}!\n\nSoy de *{{negocio}}*, trabajamos con productos personalizados para empresas.\n\nMe encantaria contarte que opciones tenemos para {{empresa}}. Tenes unos minutos esta semana?\n\nSaludos!' },
  { stage: 'Captación', title: 'Contacto por referencia', isDefault: true,
    text: 'Hola {{nombre}}!\n\nMe pasaron tu contacto como referente de {{empresa}}. Somos *{{negocio}}* y trabajamos con soluciones a medida para empresas.\n\nTe interesaria ver nuestro catalogo?\n\nQuedo atento!' },
  { stage: 'Captación', title: 'Seguimiento amable', isDefault: true,
    text: 'Hola {{nombre}}! Como andas?\n\nTe escribo para saber si pudiste revisar la propuesta que te mande el {{fecha}}.\n\nNecesitas que ajustemos algo? Estamos para ayudarte.\n\nSaludos!' },
  { stage: 'Presupuestos', title: 'Envio de presupuesto', isDefault: true,
    text: 'Hola {{nombre}}!\n\nTe envio el presupuesto para {{empresa}}:\n\n- {{producto}}\n*Total:* {{precio}}\n*Entrega estimada:* {{fecha}}\n\nQuedamos a disposicion para cualquier ajuste. Esperamos tu confirmacion!' },
  { stage: 'Presupuestos', title: 'Presupuesto con opciones', isDefault: true,
    text: 'Hola {{nombre}}!\n\nTe arme las opciones que charlamos para {{empresa}}:\n\n- Opcion A: {{producto}} -- {{precio}}\n- Opcion B: [completar]\n\nAmbas incluyen personalizacion con logo. Cual te cierra mas?' },
  { stage: 'Presupuestos', title: 'Contrapropuesta', isDefault: true,
    text: 'Hola {{nombre}}!\n\nRevise los numeros para {{empresa}} y puedo ofrecerte:\n\n- {{producto}} x {{precio}} (con descuento del 5% por cantidad)\n- Envio bonificado\n\nEs nuestro mejor precio. Confirmamos?' },
  { stage: 'Pagos', title: 'Confirmacion de pedido', isDefault: true,
    text: 'Excelente {{nombre}}!\n\nQueda confirmado el pedido para {{empresa}}:\n\n- {{producto}}\n*Total:* {{precio}}\n*Seña:* [monto seña]\n*Entrega:* {{fecha}}\n\nTe paso los datos para la transferencia. Gracias por confiar en *{{negocio}}*!' },
  { stage: 'Pagos', title: 'Recordatorio de pago', isDefault: true,
    text: 'Hola {{nombre}}!\n\nTe escribo para recordarte que queda pendiente el saldo del pedido de {{empresa}} por {{precio}}.\n\nNecesitas los datos bancarios de nuevo? Estamos para ayudarte.\n\nSaludos!' },
  { stage: 'Logística', title: 'Aviso de despacho', isDefault: true,
    text: 'Hola {{nombre}}!\n\nTe cuento que ya despachamos tu pedido para {{empresa}}.\n\n- {{producto}}\n*Entrega estimada:* {{fecha}}\n\nTe avisamos apenas llegue. Cualquier consulta, escribinos!' },
  { stage: 'Logística', title: 'Seguimiento con urgencia', isDefault: true,
    text: 'Hola {{nombre}}!\n\nLos tiempos de produccion estan corriendo y queria confirmar si avanzamos con el pedido de {{empresa}}.\n\nPara llegar a la fecha que necesitas, lo ideal es confirmar esta semana. Que te parece?' },
  { stage: 'Post-Venta', title: 'Agradecimiento post-entrega', isDefault: true,
    text: 'Hola {{nombre}}!\n\nEsperamos que los regalos hayan sido un exito en {{empresa}}.\n\nNos contas como les fue? Tu feedback nos ayuda a mejorar.\n\nPara futuros pedidos, ya tenemos tu perfil guardado. Gracias!' },
  { stage: 'Post-Venta', title: 'Reactivacion de cliente', isDefault: true,
    text: 'Hola {{nombre}}!\n\nHace un tiempo que no hablamos. En *{{negocio}}* tenemos novedades y productos nuevos que creo que le pueden servir a {{empresa}}.\n\nTe mando el catalogo actualizado?\n\nSaludos!' },
]

/* ── Paleta soft ── */
const P = {
  card: '#ffffff',
  cardBorder: '#e2e8f0',
  bubble: '#f0fdf4',
  bubbleBorder: '#dcfce7',
  text: '#334155',
  textSoft: '#64748b',
  textMuted: '#94a3b8',
  accent: '#25D366',
  accentSoft: 'rgba(37,211,102,.08)',
  accentBorder: 'rgba(37,211,102,.2)',
  shadow: '0 4px 6px -1px rgb(0 0 0 / 0.07), 0 2px 4px -2px rgb(0 0 0 / 0.05)',
  shadowHover: '0 10px 25px -5px rgb(0 0 0 / 0.08), 0 8px 10px -6px rgb(0 0 0 / 0.04)',
  varTag: '#0d9488',
  varBg: 'rgba(13,148,136,.08)',
}

/* ── Highlight {{var}} con estilo suave ── */
function HighlightedText({ text }) {
  const parts = text.split(/({{[^}]+}})/g)
  return (
    <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.85, letterSpacing: '-.01em' }}>
      {parts.map((part, i) =>
        /^{{.+}}$/.test(part) ? (
          <span key={i} style={{ background: P.varBg, color: P.varTag, fontWeight: 600, borderRadius: 4, padding: '1px 5px', fontSize: '0.92em', fontFamily: "'SF Mono','Fira Code',monospace" }}>{part}</span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </div>
  )
}

/* ── Selector de cliente premium / minimalista ── */
function ClientSelector({ clients, selected, onSelect, onClear }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef()

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const lq = q.toLowerCase()
  const filtered = q
    ? clients.filter(c => (c.contact || '').toLowerCase().includes(lq) || (c.company || '').toLowerCase().includes(lq)).slice(0, 8)
    : clients.slice(0, 8)

  const pick = (c) => { onSelect(c); setQ(''); setOpen(false) }

  if (selected) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, background: '#fff',
        border: `1px solid ${P.accentBorder}`, borderRadius: 12, padding: '8px 14px',
        boxShadow: '0 1px 3px rgba(37,211,102,.06)',
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: 10, background: 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#fff', flexShrink: 0,
        }}>
          {(selected.company || selected.contact || '?')[0].toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: P.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {selected.contact || '—'} <span style={{ color: P.textMuted, fontWeight: 400 }}>{selected.company ? `— ${selected.company}` : ''}</span>
          </div>
          {selected.wa && <div style={{ fontSize: 11, color: P.textSoft, marginTop: 1 }}><i className="fa-brands fa-whatsapp" style={{ marginRight: 4, color: P.accent }} />{selected.wa}</div>}
        </div>
        <button onClick={onClear} style={{
          background: 'none', border: '1px solid #e2e8f0', borderRadius: 8, color: P.textMuted,
          cursor: 'pointer', fontSize: 11, padding: '4px 8px', transition: 'all .15s',
        }}
          onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.borderColor = '#fca5a5' }}
          onMouseLeave={e => { e.currentTarget.style.color = P.textMuted; e.currentTarget.style.borderColor = '#e2e8f0' }}>
          <i className="fa fa-xmark" />
        </button>
      </div>
    )
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, background: '#fff',
        border: '1px solid #e2e8f0', borderRadius: 12, padding: '9px 14px',
        transition: 'border-color .15s, box-shadow .15s',
        boxShadow: open ? '0 0 0 3px rgba(37,211,102,.08)' : 'none',
        borderColor: open ? P.accentBorder : '#e2e8f0',
      }}>
        <i className="fa fa-magnifying-glass" style={{ color: P.textMuted, fontSize: 13 }} />
        <input type="text" value={q}
          onChange={e => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder="Buscar cliente por nombre o empresa..."
          style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: P.text, fontFamily: 'inherit', fontWeight: 500 }}
          autoComplete="off" />
      </div>
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
          boxShadow: '0 12px 28px rgba(0,0,0,.08)', maxHeight: 240, overflowY: 'auto', marginTop: 4,
        }}>
          {filtered.map(c => (
            <div key={c.id} onClick={() => pick(c)} style={{
              padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
              borderBottom: '1px solid #f1f5f9', transition: 'background .12s',
            }}
              onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <div style={{
                width: 28, height: 28, borderRadius: 8,
                background: 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 800, color: '#fff', flexShrink: 0,
              }}>
                {(c.company || c.contact || '?')[0].toUpperCase()}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: P.text }}>{c.contact || '—'}</div>
                <div style={{ fontSize: 10, color: P.textMuted }}>{c.company}{c.wa ? ` · ${c.wa}` : ''}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Panel de variables sticky ── */
function VariablesPanel({ client, config, budget }) {
  const c = config
  const vars = [
    { key: 'nombre', icon: 'fa-user', value: client?.contact },
    { key: 'empresa', icon: 'fa-building', value: client?.company },
    { key: 'negocio', icon: 'fa-store', value: c.businessName || 'ANMA' },
    { key: 'precio', icon: 'fa-coins', value: budget ? fmt(budget.total) : null },
    { key: 'producto', icon: 'fa-box-open', value: budget?.items?.length ? budget.items.map(i => i.name).filter(Boolean).join(', ') : null },
    { key: 'fecha', icon: 'fa-calendar', value: budget?.deliveryDate || budget?.date || null },
  ]

  return (
    <div style={{
      position: 'sticky', top: 72, background: '#fff', borderRadius: 16,
      border: '1px solid #e2e8f0', padding: '18px 20px',
      boxShadow: P.shadow, width: 240, flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 14 }}>
        <div style={{ width: 26, height: 26, borderRadius: 8, background: P.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <i className="fa fa-code" style={{ color: P.accent, fontSize: 11 }} />
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: P.text, letterSpacing: '-.02em' }}>Variables activas</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {vars.map(v => (
          <div key={v.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <i className={`fa ${v.icon}`} style={{ color: P.textMuted, fontSize: 11, marginTop: 3, width: 14, textAlign: 'center', flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <code style={{ fontSize: 10, fontWeight: 600, color: P.varTag, fontFamily: "'SF Mono','Fira Code',monospace", background: P.varBg, padding: '1px 5px', borderRadius: 4 }}>
                {`{{${v.key}}}`}
              </code>
              <div style={{ fontSize: 11, fontWeight: 600, color: v.value ? P.text : P.textMuted, marginTop: 2, wordBreak: 'break-word', fontStyle: v.value ? 'normal' : 'italic' }}>
                {v.value || 'sin datos'}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ═══════════════════════════════
   Componente principal
═══════════════════════════════ */
export default function Mensajes() {
  const { get, saveEntity, deleteEntity, set, config } = useData()
  const toast = useToast()
  const c = config()
  const [activeStage, setActiveStage] = useState('Captación')
  const [modal, setModal] = useState(false)
  const [editModal, setEditModal] = useState(false)
  const [form, setForm] = useState({ stage: 'Captación', title: '', text: '' })
  const [activeClient, setActiveClient] = useState(null)

  const clients = get('clients')
  const budgets = get('budgets')

  const templates = useMemo(() => {
    const stored = get('waTemplates')
    if (!stored.length) {
      const withIds = DEFAULT_TEMPLATES.map((t, i) => ({ ...t, id: Date.now() + i }))
      set('waTemplates', withIds)
      return withIds
    }
    return stored
  }, [get('waTemplates').length])

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        if (editModal) { setEditModal(false); return }
        if (modal) { setModal(false); return }
      }
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [editModal, modal])

  const clientBudget = useMemo(() => {
    if (!activeClient) return null
    return budgets
      .filter(b => b.company === activeClient.company || b.contact === activeClient.contact)
      .sort((a, b) => b.id - a.id)[0] || null
  }, [activeClient, budgets])

  const replaceVars = (text) => {
    const nombre = activeClient?.contact || ''
    const empresa = activeClient?.company || ''
    const wa = activeClient?.wa || ''
    const negocio = c.businessName || 'ANMA'
    const precio = clientBudget ? fmt(clientBudget.total) : ''
    const producto = clientBudget?.items?.length ? clientBudget.items.map(i => i.name).filter(Boolean).join(', ') : ''
    const fecha = clientBudget?.deliveryDate || clientBudget?.date || ''
    return text
      .replace(/{{nombre}}/gi, nombre)
      .replace(/{{empresa}}/gi, empresa)
      .replace(/{{negocio}}/gi, negocio)
      .replace(/{{precio}}/gi, precio)
      .replace(/{{producto}}/gi, producto)
      .replace(/{{fecha}}/gi, fecha)
      .replace(/{{wa}}/gi, wa)
  }

  const unresolvedCount = (text) => {
    const resolved = replaceVars(text)
    const remaining = resolved.match(/{{[^}]+}}/g)
    return remaining ? remaining.length : 0
  }

  const stageTemplates = templates.filter(t => t.stage === activeStage)
  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const openNew = () => { setForm({ stage: activeStage, title: '', text: '' }); setModal(true) }
  const openEdit = (t) => { setForm({ ...t }); setEditModal(true) }

  const saveMsg = () => {
    if (!form.title || !form.text) { toast('Completá título y texto.', 'er'); return }
    saveEntity('waTemplates', form)
    setModal(false); setEditModal(false); toast('Mensaje guardado', 'ok')
  }

  const deleteMsg = (id) => {
    if (window.confirm('¿Eliminar este mensaje?')) { deleteEntity('waTemplates', id); toast('Mensaje eliminado', 'in') }
  }

  const restoreDefaults = () => {
    if (!window.confirm('¿Restaurar los mensajes originales?')) return
    const withIds = DEFAULT_TEMPLATES.map((t, i) => ({ ...t, id: Date.now() + i }))
    set('waTemplates', withIds); toast('Mensajes restaurados', 'ok')
  }

  const copyText = (text) => {
    const final = replaceVars(text)
    navigator.clipboard.writeText(final).then(() => {
      const pending = unresolvedCount(text)
      toast(pending > 0 ? `Copiado con ${pending} variable${pending > 1 ? 's' : ''} sin completar` : 'Mensaje copiado', pending > 0 ? 'in' : 'ok')
    })
  }

  const sendWA = (text) => {
    const final = replaceVars(text)
    const waNum = activeClient?.wa ? activeClient.wa.replace(/\D/g, '') : ''
    const encoded = encodeURIComponent(final)
    window.open(waNum ? `https://wa.me/${waNum}?text=${encoded}` : `https://wa.me/?text=${encoded}`, '_blank')
  }

  /* ── Botón de icono genérico (gris por defecto, color en hover) ── */
  const IconBtn = ({ icon, title, onClick, hoverBg, hoverColor, hoverBorder }) => (
    <button onClick={onClick} title={title}
      style={{
        width: 32, height: 32, borderRadius: 10, border: '1px solid #e2e8f0',
        background: '#fff', color: P.textMuted, fontSize: 12,
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all .15s ease', flexShrink: 0,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = hoverBg; e.currentTarget.style.color = hoverColor; e.currentTarget.style.borderColor = hoverBorder }}
      onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = P.textMuted; e.currentTarget.style.borderColor = '#e2e8f0' }}>
      <i className={`fa ${icon}`} />
    </button>
  )

  /* ── Modal de formulario reutilizable ── */
  const FormModal = ({ title, icon, iconColor, onClose }) => (
    <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal modal-lg" style={{ borderRadius: 20, border: '1px solid #e2e8f0', boxShadow: '0 20px 60px rgba(0,0,0,.1)' }}>
        <div className="mh">
          <h3><i className={`fa ${icon}`} style={{ color: iconColor, marginRight: 8 }} />{title}</h3>
          <button className="mclose" onClick={onClose}><i className="fa fa-xmark" /></button>
        </div>
        <div className="grid2">
          <div className="fg"><label>Etapa</label>
            <select value={form.stage} onChange={e => setF('stage', e.target.value)}>
              {STAGES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="fg"><label>Título *</label><input type="text" value={form.title} onChange={e => setF('title', e.target.value)} placeholder="Ej: Bienvenida inicial" /></div>
        </div>
        <div className="fg">
          <label>Texto del mensaje *</label>
          <textarea value={form.text} onChange={e => setF('text', e.target.value)} rows={8}
            placeholder="Hola {{nombre}}, soy de {{negocio}}..."
            style={{ lineHeight: 1.7 }} />
        </div>
        <div style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 14px', marginTop: 4, fontSize: 11, color: P.textSoft, border: '1px solid #f1f5f9' }}>
          <b style={{ color: P.text }}>Variables:</b>{' '}
          {['nombre', 'empresa', 'negocio', 'producto', 'precio', 'fecha'].map((v, i) => (
            <span key={v}>{i > 0 && ' · '}<code style={{ color: P.varTag, fontFamily: "'SF Mono','Fira Code',monospace", fontSize: 10, background: P.varBg, padding: '1px 4px', borderRadius: 3 }}>{`{{${v}}}`}</code></span>
          ))}
        </div>
        <div className="mfooter">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-sm" onClick={saveMsg}
            style={{ background: P.accent, color: '#fff', border: 'none', borderRadius: 10 }}>
            <i className="fa fa-floppy-disk" /> Guardar
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="page active" style={{ animation: 'pgIn .2s ease both' }}>
      {/* ── Header ── */}
      <div className="ph">
        <div className="ph-left">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 32, height: 32, borderRadius: 10, background: P.accentSoft, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className="fa-brands fa-whatsapp" style={{ color: P.accent, fontSize: 16 }} />
            </span>
            Mensajes WhatsApp
          </h2>
          <p>Templates inteligentes para cada etapa de venta</p>
        </div>
        <div className="ph-right">
          <button className="btn btn-ghost btn-sm" onClick={restoreDefaults} style={{ borderRadius: 10 }}>
            <i className="fa fa-rotate-left" /> Restaurar
          </button>
          <button className="btn btn-sm" onClick={openNew}
            style={{ background: P.accent, color: '#fff', border: 'none', borderRadius: 10, boxShadow: '0 4px 12px rgba(37,211,102,.2)' }}>
            <i className="fa fa-plus" /> Nuevo mensaje
          </button>
        </div>
      </div>

      {/* ── Selector de cliente ── */}
      <div style={{ marginBottom: 20, maxWidth: 480 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: P.textMuted, letterSpacing: '.5px', textTransform: 'uppercase', marginBottom: 6 }}>
          <i className="fa fa-user-tie" style={{ marginRight: 5 }} />Cliente activo
        </div>
        <ClientSelector clients={clients} selected={activeClient} onSelect={setActiveClient} onClear={() => setActiveClient(null)} />
      </div>

      {/* ── Tabs de etapas ── */}
      <div style={{
        display: 'flex', gap: 2, background: '#f8fafc', border: '1px solid #e2e8f0',
        borderRadius: 14, padding: 4, marginBottom: 20, width: 'fit-content',
      }}>
        {STAGES.map(s => {
          const isActive = activeStage === s
          const count = templates.filter(t => t.stage === s).length
          return (
            <button key={s} onClick={() => setActiveStage(s)}
              style={{
                padding: '8px 16px', borderRadius: 10, border: 'none', fontSize: 12, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6,
                transition: 'all .15s ease',
                background: isActive ? '#fff' : 'transparent',
                color: isActive ? P.accent : P.textSoft,
                boxShadow: isActive ? P.shadow : 'none',
              }}>
              <i className={`fa ${STAGE_ICONS[s]}`} style={{ fontSize: 11 }} />
              {s}
              <span style={{
                fontSize: 9, fontWeight: 700, minWidth: 16, textAlign: 'center',
                padding: '1px 5px', borderRadius: 10,
                background: isActive ? P.accentSoft : '#f1f5f9',
                color: isActive ? P.accent : P.textMuted,
              }}>{count}</span>
            </button>
          )
        })}
      </div>

      {/* ── Layout: Cards + Variables panel sticky ── */}
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>

        {/* Cards grid */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {stageTemplates.length ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
              {stageTemplates.map(t => {
                const pending = activeClient ? unresolvedCount(t.text) : 0
                return (
                  <div key={t.id} style={{
                    background: P.card, border: `1px solid ${P.cardBorder}`, borderRadius: 16,
                    padding: 0, boxShadow: P.shadow, transition: 'all .2s ease', overflow: 'hidden',
                    display: 'flex', flexDirection: 'column',
                  }}
                    onMouseEnter={e => { e.currentTarget.style.boxShadow = P.shadowHover; e.currentTarget.style.transform = 'translateY(-3px)' }}
                    onMouseLeave={e => { e.currentTarget.style.boxShadow = P.shadow; e.currentTarget.style.transform = '' }}>

                    {/* Card header */}
                    <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid #f1f5f9' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: P.text, flex: 1, minWidth: 0, letterSpacing: '-.02em' }}>
                          {t.title}
                        </div>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          {activeClient && pending === 0 && (
                            <span style={{ fontSize: 9, fontWeight: 700, color: P.accent, background: P.accentSoft, padding: '2px 8px', borderRadius: 10, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 3 }}>
                              <i className="fa fa-circle-check" style={{ fontSize: 8 }} />Listo
                            </span>
                          )}
                          {activeClient && pending > 0 && (
                            <span style={{ fontSize: 9, fontWeight: 600, color: '#d97706', background: '#fffbeb', padding: '2px 8px', borderRadius: 10, whiteSpace: 'nowrap' }}>
                              {pending} pendiente{pending > 1 ? 's' : ''}
                            </span>
                          )}
                          {t.isDefault && (
                            <span style={{ fontSize: 9, fontWeight: 600, color: P.textMuted, background: '#f8fafc', padding: '2px 8px', borderRadius: 10, whiteSpace: 'nowrap' }}>
                              Original
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Bubble */}
                    <div style={{ padding: '14px 18px', flex: 1 }}>
                      <div style={{
                        background: P.bubble, border: `1px solid ${P.bubbleBorder}`,
                        borderRadius: '4px 14px 14px 14px', padding: '14px 16px',
                        fontSize: 12.5, color: P.text,
                      }}>
                        {activeClient
                          ? <HighlightedText text={replaceVars(t.text)} />
                          : <HighlightedText text={t.text} />
                        }
                      </div>
                    </div>

                    {/* Footer */}
                    <div style={{ padding: '12px 18px 16px', display: 'flex', gap: 6, borderTop: '1px solid #f1f5f9', alignItems: 'center' }}>
                      <button onClick={() => copyText(t.text)}
                        style={{
                          flex: 1, padding: '8px 0', borderRadius: 10, border: '1px solid #e2e8f0',
                          background: '#fff', color: P.textSoft, fontSize: 11, fontWeight: 600,
                          cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center',
                          justifyContent: 'center', gap: 5, transition: 'all .15s ease',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.borderColor = '#cbd5e1' }}
                        onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#e2e8f0' }}>
                        <i className="fa fa-copy" /> Copiar
                      </button>
                      <button onClick={() => sendWA(t.text)}
                        style={{
                          flex: 1, padding: '8px 0', borderRadius: 10, border: `1px solid ${P.accent}`,
                          background: P.accent, color: '#fff', fontSize: 11, fontWeight: 600,
                          cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center',
                          justifyContent: 'center', gap: 5, transition: 'all .15s ease',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#1DA851'}
                        onMouseLeave={e => e.currentTarget.style.background = P.accent}>
                        <i className="fa-brands fa-whatsapp" /> {activeClient?.wa ? 'Enviar directo' : 'Enviar'}
                      </button>
                      <IconBtn icon="fa-pen" title="Editar" onClick={() => openEdit(t)} hoverBg="#eff6ff" hoverColor="#2563eb" hoverBorder="#93c5fd" />
                      <IconBtn icon="fa-trash" title="Eliminar" onClick={() => deleteMsg(t.id)} hoverBg="#fef2f2" hoverColor="#dc2626" hoverBorder="#fca5a5" />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '48px 20px', color: P.textMuted }}>
              <div style={{ width: 56, height: 56, borderRadius: 16, background: P.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', fontSize: 22 }}>
                <i className="fa-brands fa-whatsapp" style={{ color: P.accent }} />
              </div>
              <h4 style={{ fontSize: 15, fontWeight: 700, color: P.text, marginBottom: 4 }}>Sin mensajes en "{activeStage}"</h4>
              <p style={{ fontSize: 12, marginBottom: 14 }}>Creá un template para esta etapa</p>
              <button className="btn btn-sm" onClick={openNew}
                style={{ background: P.accent, color: '#fff', border: 'none', borderRadius: 10 }}>
                <i className="fa fa-plus" /> Agregar mensaje
              </button>
            </div>
          )}
        </div>

        {/* Variables panel sticky */}
        {activeClient && (
          <VariablesPanel client={activeClient} config={c} budget={clientBudget} />
        )}
      </div>

      {/* ── Modals ── */}
      {modal && <FormModal title="Nuevo mensaje" icon="fa-brands fa-whatsapp" iconColor={P.accent} onClose={() => setModal(false)} />}
      {editModal && <FormModal title="Editar mensaje" icon="fa-pen" iconColor="#2563eb" onClose={() => setEditModal(false)} />}
    </div>
  )
}
