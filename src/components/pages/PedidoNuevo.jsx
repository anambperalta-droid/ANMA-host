/* ═══════════════════════════════════════════════════════════════════
   PedidoNuevo — vista única de carga de pedido (Fase 2, Parte 1)
   ─────────────────────────────────────────────────────────────────
   Reemplazo del wizard de 4 pasos por una pantalla scrolleable con
   autosave. Convive con /presupuesto viejo en paralelo hasta Fase 3.

   Bloques: Cliente · Líneas · Precio · Entrega · Nota interna.
   Menú "⋯" (Estado / Alternativas / Kit mode / Duplicar / Eliminar)
   queda para Parte 2.
═══════════════════════════════════════════════════════════════════ */
import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useData } from '../../context/DataContext'
import { useToast } from '../../context/ToastContext'
import { useConfirm } from '../../context/ConfirmContext'
import { fmt } from '../../lib/storage'
import {
  pedidoFromBudget, budgetFromPedido, calcularTotales,
  totalDesdeMargen, pedidoVacio, nuevaLinea,
  ESTADOS, ESTADO_LABELS, ESTADOS_COMPRA, TAGS, TAG_LABELS,
} from '../../lib/pedido'

const ESTADO_COMPRA_LABELS = {
  pendiente: 'Pendiente',
  pedido:    'Pedido',
  recibido:  'Recibido',
}

// Paleta de estados — chips con color diferenciado por etapa del ciclo
const ESTADO_COLOR = {
  consulta:      { bg: '#f1f5f9', fg: '#475569', bd: '#cbd5e1' },
  presupuestado: { bg: '#dbeafe', fg: '#1d4ed8', bd: '#bfdbfe' },
  pausado:       { bg: '#fef3c7', fg: '#b45309', bd: '#fde68a' },
  confirmado:    { bg: '#dcfce7', fg: '#15803d', bd: '#bbf7d0' },
  produccion:    { bg: '#ede9fe', fg: '#6d28d9', bd: '#ddd6fe' },
  entregado:     { bg: '#d1fae5', fg: '#065f46', bd: '#a7f3d0' },
  cerrado:       { bg: '#f1f5f9', fg: '#64748b', bd: '#cbd5e1' },
  perdido:       { bg: '#fee2e2', fg: '#b91c1c', bd: '#fecaca' },
}

const ESTADO_COMPRA_COLOR = {
  pendiente: { bg: '#f8fafc', fg: '#64748b', bd: '#e2e8f0' },
  pedido:    { bg: '#dbeafe', fg: '#1e40af', bd: '#bfdbfe' },
  recibido:  { bg: '#dcfce7', fg: '#166534', bd: '#bbf7d0' },
}

// Tag por linea — categoriza el tipo de gasto (para analisis futuro)
const TAG_COLOR = {
  producto:   { bg: '#e0f2fe', fg: '#075985', bd: '#bae6fd' },
  packaging:  { bg: '#ffedd5', fg: '#9a3412', bd: '#fed7aa' },
  manoDeObra: { bg: '#fef3c7', fg: '#78350f', bd: '#fde68a' },
  diseno:     { bg: '#ede9fe', fg: '#5b21b6', bd: '#ddd6fe' },
  envio:      { bg: '#dbeafe', fg: '#1e3a8a', bd: '#bfdbfe' },
  otro:       { bg: '#f1f5f9', fg: '#475569', bd: '#cbd5e1' },
}

// Iconos por bloque con color soft — le da identidad sin ruido
const SECCION_META = {
  cliente:  { icon: 'fa-user-tie',    color: '#7c3aed' },
  lineas:   { icon: 'fa-list-check',  color: '#0891b2' },
  precio:   { icon: 'fa-coins',       color: '#16a34a' },
  entrega:  { icon: 'fa-truck-fast',  color: '#ea580c' },
  nota:     { icon: 'fa-pen-to-square', color: '#64748b' },
}

const hasMinimum = (p) =>
  !!(p.clienteNombre || p.contact || p.company) &&
  p.lineas.some(l => l.descripcion && l.descripcion.trim().length > 0)

export default function PedidoNuevo() {
  const { id } = useParams()
  const nav = useNavigate()
  const { get, saveBudget, deleteBudget, config } = useData()
  const toast = useToast()
  const confirm = useConfirm()
  const c = config()

  const [pedido, setPedido] = useState(() => {
    if (id) {
      const b = get('budgets', []).find(x => String(x.id) === String(id))
      return b ? pedidoFromBudget(b) : pedidoVacio()
    }
    return pedidoVacio()
  })
  const [lastSaved, setLastSaved] = useState(id ? Date.now() : null)
  const [saving, setSaving]     = useState(false)
  const saveTimer   = useRef(null)
  const dirtyRef    = useRef(false)
  const skipNextRef = useRef(false)
  const firstMount  = useRef(true)

  // ── Sincronizar cambios de URL con el estado ──
  // "+ Nuevo pedido" navega a /pedido (sin id) desde /pedido/:id → reset.
  // Editar desde Historial navega a /pedido/:id → cargar ese pedido.
  // El primer save hace nav(replace) a /pedido/:id — se ignora acá porque
  // pedido.id ya coincide con id de la URL.
  useEffect(() => {
    if (firstMount.current) { firstMount.current = false; return }
    if (id && String(pedido.id) === String(id)) return
    if (id) {
      const b = get('budgets', []).find(x => String(x.id) === String(id))
      if (b) { setPedido(pedidoFromBudget(b)); setLastSaved(Date.now()) }
    } else {
      setPedido(pedidoVacio())
      setLastSaved(null)
    }
    dirtyRef.current    = false
    skipNextRef.current = true
  }, [id]) // eslint-disable-line

  const clients  = get('clients', [])
  const products = get('products', [])

  // ── Autosave con debounce 500ms ──
  useEffect(() => {
    if (skipNextRef.current) { skipNextRef.current = false; return }
    if (!dirtyRef.current)   return
    if (!hasMinimum(pedido)) return

    clearTimeout(saveTimer.current)
    setSaving(true)
    saveTimer.current = setTimeout(() => {
      try {
        const wasNew = !pedido.id
        const prev  = pedido.id ? get('budgets', []).find(x => x.id === pedido.id) : {}
        const budget = budgetFromPedido(pedido, prev)
        const saved  = saveBudget(budget)
        skipNextRef.current = true
        setPedido(p => ({ ...p, id: saved.id, numero: saved.num, updatedAt: saved.updatedAt }))
        setLastSaved(Date.now())
        dirtyRef.current = false
        // Primer save de un pedido nuevo: reflejamos el id en la URL para
        // que F5 no pierda la referencia. replace: true no ensucia el back.
        if (wasNew && saved?.id) nav(`/pedido/${saved.id}`, { replace: true })
      } catch {
        toast('No se pudo guardar. Revisá los datos.', 'er')
      } finally {
        setSaving(false)
      }
    }, 500)

    return () => clearTimeout(saveTimer.current)
  }, [pedido]) // eslint-disable-line

  // Helpers de mutación — todos marcan dirty
  const update   = (patch) => { dirtyRef.current = true; setPedido(p => ({ ...p, ...patch })) }
  const updateFn = (fn)    => { dirtyRef.current = true; setPedido(fn) }

  const setLinea    = (idx, patch) => updateFn(p => ({ ...p, lineas: p.lineas.map((l, i) => i === idx ? { ...l, ...patch } : l) }))
  const addLinea    = ()           => updateFn(p => ({ ...p, lineas: [...p.lineas, nuevaLinea()] }))
  const removeLinea = (idx)        => updateFn(p => ({
    ...p, lineas: p.lineas.length > 1 ? p.lineas.filter((_, i) => i !== idx) : [nuevaLinea()],
  }))

  const totales = calcularTotales(pedido, (c.ivaRate || 21) / 100)

  const setPrecioFinal = (v) => {
    const nv = v === '' || v == null ? null : Number(v)
    update({ precioFinalManual: nv })
  }
  const setMargen = (v) => {
    const t = totalDesdeMargen(pedido, v)
    update({ precioFinalManual: t })
  }

  // ── Client picker inline ──
  const [showClientList, setShowClientList] = useState(false)
  const clientBoxRef = useRef(null)
  useEffect(() => {
    const close = (e) => { if (clientBoxRef.current && !clientBoxRef.current.contains(e.target)) setShowClientList(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const clientMatches = pedido.clienteNombre
    ? clients.filter(cl =>
        (cl.company || '').toLowerCase().includes(pedido.clienteNombre.toLowerCase()) ||
        (cl.contact || '').toLowerCase().includes(pedido.clienteNombre.toLowerCase()))
        .slice(0, 8)
    : clients.slice(0, 8)

  const pickCliente = (cl) => {
    dirtyRef.current = true
    setPedido(p => ({
      ...p,
      clienteId:    cl.id,
      clienteNombre: cl.company || cl.contact || '',
      company:      cl.company || '',
      contact:      cl.contact || '',
      wa:           cl.wa || '',
      clientEmail:  cl.email || '',
    }))
    setShowClientList(false)
  }

  return (
    <div className="page active" style={{ animation: 'pgIn .2s ease both' }}>

      {/* ── HEADER ── */}
      <div className="ph" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: 'var(--txt)' }}>
            {pedido.id ? `Pedido ${pedido.numero || `#${pedido.id}`}` : 'Nuevo pedido'}
          </h2>
          <SaveIndicator saving={saving} lastSaved={lastSaved} pedido={pedido} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <EstadoSelect value={pedido.estado} onChange={v => update({ estado: v })} />
          <MenuMore
            pedido={pedido}
            onDuplicate={() => {
              const clone = { ...pedido, id: null, numero: '', createdAt: new Date().toISOString().slice(0, 10) }
              clone.lineas = clone.lineas.map(l => ({ ...l, id: Date.now() + Math.random() }))
              dirtyRef.current = true
              setPedido(clone)
              nav('/pedido')
              toast('Pedido duplicado — editá y se guarda solo', 'ok')
            }}
            onDelete={() => {
              if (!pedido.id) { nav(-1); return }
              confirm('¿Eliminar este pedido? Esta acción no se puede deshacer.', () => {
                deleteBudget(pedido.id)
                toast('Pedido eliminado', 'in')
                nav('/')
              })
            }}
          />
          {pedido.id && (
            <button onClick={() => nav('/pedido')} className="btn btn-sm"
              title="Empezar otro pedido"
              style={{ borderRadius: 10, background: 'var(--brand, #7c3aed)', color: '#fff', border: 'none' }}>
              <i className="fa fa-plus" /> Nuevo
            </button>
          )}
          <button onClick={() => nav('/')} className="btn btn-ghost btn-sm" style={{ borderRadius: 10 }}>
            <i className="fa fa-arrow-left" /> Volver
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0,1fr)' }}>

        {/* ── CLIENTE ── */}
        <section style={cardStyleFor('cliente')}>
          <SectionTitle meta={SECCION_META.cliente} label="Cliente" />
          <div ref={clientBoxRef} style={{ position: 'relative' }}>
            <input
              type="text"
              value={pedido.clienteNombre}
              onChange={e => { update({ clienteNombre: e.target.value, clienteId: null, company: e.target.value }); setShowClientList(true) }}
              onFocus={() => setShowClientList(true)}
              placeholder="Empresa o persona"
              autoComplete="off"
              style={{ ...inputStyle, fontSize: 15, fontWeight: 500 }}
            />
            {showClientList && clientMatches.length > 0 && (
              <div style={dropdownStyle}>
                {clientMatches.map(cl => (
                  <div key={cl.id} onClick={() => pickCliente(cl)} style={dropdownItem}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--brand-xlt, #f5f3ff)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)' }}>
                      {cl.contact || cl.company || '—'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 2 }}>
                      {cl.company}{cl.wa ? ` · ${cl.wa}` : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
            <div>
              <label style={labelStyle}>Ocasión</label>
              <input type="text" value={pedido.ocasion}
                onChange={e => update({ ocasion: e.target.value })}
                placeholder="Fin de año, cumpleaños…" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>WhatsApp</label>
              <input type="text" value={pedido.wa}
                onChange={e => update({ wa: e.target.value })}
                placeholder="+54 351 …" style={inputStyle} />
            </div>
          </div>
        </section>

        {/* ── LÍNEAS ── */}
        <section style={cardStyleFor('lineas')}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <SectionTitle meta={SECCION_META.lineas} label="Líneas" />
            <button onClick={addLinea} className="btn btn-sm"
              style={{ background: 'var(--brand, #7c3aed)', color: '#fff', border: 'none', borderRadius: 10, padding: '6px 12px' }}>
              <i className="fa fa-plus" /> Agregar
            </button>
          </div>

          {/* Headers desktop */}
          <div style={{ ...lineaGrid, marginBottom: 6, fontSize: 10, fontWeight: 600, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.03em' }}
               className="pedido-linea-header">
            <span>Descripción</span>
            <span style={{ textAlign: 'center' }}>Tipo</span>
            <span style={{ textAlign: 'right' }}>Cant</span>
            <span style={{ textAlign: 'right' }}>Costo/u</span>
            <span style={{ textAlign: 'right' }}>Precio/u</span>
            <span style={{ textAlign: 'center' }}>Compra</span>
            <span />
          </div>

          {pedido.lineas.map((linea, idx) => (
            <LineaRow key={linea.id}
              linea={linea}
              products={products}
              onChange={patch => setLinea(idx, patch)}
              onRemove={() => removeLinea(idx)}
              canRemove={pedido.lineas.length > 1 || !!linea.descripcion} />
          ))}
        </section>

        {/* ── PRECIO ── */}
        <section style={cardStyleFor('precio')}>
          <SectionTitle meta={SECCION_META.precio} label="Precio" />
          <PrecioBlock pedido={pedido} totales={totales}
            onTotalChange={setPrecioFinal}
            onMargenChange={setMargen}
            onIvaChange={() => update({ aplicaIva: !pedido.aplicaIva })}
            onSeniaChange={v => update({ seniaMonto: Number(v) || 0 })}
          />
        </section>

        {/* ── ENTREGA ── */}
        <section style={cardStyleFor('entrega')}>
          <SectionTitle meta={SECCION_META.entrega} label="Entrega" />
          <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 12 }} className="pedido-entrega-grid">
            <div>
              <label style={labelStyle}>Fecha</label>
              <input type="date" value={pedido.fechaEntrega || ''}
                onChange={e => update({ fechaEntrega: e.target.value })}
                style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Horario / preferencia</label>
              <input type="text" value={pedido.horarioEntrega || ''}
                onChange={e => update({ horarioEntrega: e.target.value })}
                placeholder="Ej: mañana antes de las 12" style={inputStyle} />
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <label style={labelStyle}>Dirección</label>
            <input type="text" value={pedido.direccionEntrega || ''}
              onChange={e => update({ direccionEntrega: e.target.value })}
              placeholder="Calle, número, piso, ciudad" style={inputStyle} />
          </div>
          <div style={{ marginTop: 12 }}>
            <label style={labelStyle}>Contacto para coordinar</label>
            <input type="text" value={pedido.contactoEntrega || ''}
              onChange={e => update({ contactoEntrega: e.target.value })}
              placeholder="Nombre y teléfono de quien recibe" style={inputStyle} />
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--txt3)' }}>
            <i className="fa fa-info-circle" style={{ marginRight: 6 }} />
            Los envíos con comisionista se cargan en <b>Logística</b> y se enlazan por número de pedido.
          </div>
        </section>

        {/* ── NOTA INTERNA ── */}
        <section style={cardStyleFor('nota')}>
          <SectionTitle meta={SECCION_META.nota} label="Nota interna" />
          <textarea value={pedido.notaInterna}
            onChange={e => update({ notaInterna: e.target.value })}
            rows={4}
            placeholder="Texto libre. Todo lo que quieras recordar de este pedido."
            style={{ ...inputStyle, minHeight: 88, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} />
        </section>
      </div>

      {/* Reglas responsive: en mobile las líneas se apilan como cards */}
      <style>{`
        @media (max-width: 720px) {
          .pedido-linea-header { display: none !important; }
          .pedido-linea-row {
            grid-template-columns: 1fr 1fr !important;
            grid-template-areas:
              'desc desc'
              'tag estado'
              'cant costo'
              'precio remove' !important;
            padding: 12px !important;
            background: var(--surface, #fff);
            border: 1px solid var(--border, #e2e8f0);
            border-radius: 10px;
            margin-bottom: 10px !important;
          }
          .pedido-linea-row > .l-desc   { grid-area: desc; }
          .pedido-linea-row > .l-tag    { grid-area: tag; }
          .pedido-linea-row > .l-cant   { grid-area: cant; }
          .pedido-linea-row > .l-costo  { grid-area: costo; }
          .pedido-linea-row > .l-precio { grid-area: precio; }
          .pedido-linea-row > .l-estado { grid-area: estado; }
          .pedido-linea-row > .l-remove { grid-area: remove; justify-self: end; }
        }
      `}</style>
    </div>
  )
}

// ── Sub-componentes ────────────────────────────────────────────────

function SaveIndicator({ saving, lastSaved, pedido }) {
  const ready = hasMinimum(pedido)
  return (
    <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, minHeight: 16 }}>
      {saving && (<><i className="fa fa-arrows-rotate fa-spin" style={{ fontSize: 10 }} />Guardando…</>)}
      {!saving && lastSaved && (<><i className="fa fa-check" style={{ color: '#16a34a' }} />Guardado automáticamente</>)}
      {!saving && !lastSaved && !ready && (
        <>Se guarda solo cuando cargues cliente + una descripción</>
      )}
    </div>
  )
}

function LineaRow({ linea, products, onChange, onRemove, canRemove }) {
  return (
    <div className="pedido-linea-row" style={{ ...lineaGrid, marginBottom: 8, alignItems: 'center' }}>
      <DescripcionInput className="l-desc" value={linea.descripcion} products={products}
        onChange={patch => onChange(patch)} />
      <TagChip className="l-tag" value={linea.tag || 'producto'}
        onChange={v => onChange({ tag: v })} />
      <input className="l-cant" type="number" min={0} value={linea.cantidad}
        onChange={e => onChange({ cantidad: e.target.value === '' ? 0 : Number(e.target.value) })}
        style={{ ...inputStyle, textAlign: 'right' }} />
      <input className="l-costo" type="number" min={0} value={linea.costoUnit}
        onChange={e => onChange({ costoUnit: e.target.value === '' ? 0 : Number(e.target.value) })}
        placeholder="0" style={{ ...inputStyle, textAlign: 'right' }} />
      <input className="l-precio" type="number" min={0} value={linea.precioUnit}
        onChange={e => onChange({ precioUnit: e.target.value === '' ? 0 : Number(e.target.value) })}
        placeholder="0" style={{ ...inputStyle, textAlign: 'right' }} />
      <EstadoCompraChip className="l-estado" value={linea.estadoCompra}
        onChange={v => onChange({ estadoCompra: v })} />
      <button onClick={onRemove} disabled={!canRemove}
        title={canRemove ? 'Eliminar línea' : 'Al menos una línea'}
        className="l-remove"
        style={{
          background: 'transparent', border: 'none', color: 'var(--txt3)',
          cursor: canRemove ? 'pointer' : 'not-allowed', padding: 6,
          fontSize: 14, opacity: canRemove ? 1 : 0.3,
        }}>
        <i className="fa fa-times" />
      </button>
    </div>
  )
}

function PrecioBlock({ pedido, totales, onTotalChange, onMargenChange, onIvaChange, onSeniaChange }) {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <Row label="Subtotal" value={fmt(totales.subtotal)} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: 'var(--txt3)' }}>
          <input type="checkbox" checked={pedido.aplicaIva} onChange={onIvaChange} />
          IVA 21%
        </label>
        <span style={{ fontWeight: 600, color: pedido.aplicaIva ? 'var(--txt)' : 'var(--txt3)' }}>{fmt(totales.iva)}</span>
      </div>

      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '12px 14px',
        background: totales.total > 0 ? 'linear-gradient(90deg, #f0fdf4 0%, #ecfdf5 100%)' : 'transparent',
        border: totales.total > 0 ? '1px solid #bbf7d0' : '1px solid var(--border)',
        borderRadius: 10,
        marginTop: 6, marginBottom: 6,
      }}>
        <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.05em', color: totales.total > 0 ? '#065f46' : 'var(--txt)' }}>TOTAL</span>
        <input type="number" min={0}
          value={totales.total || ''}
          onChange={e => onTotalChange(e.target.value)}
          style={{
            ...inputStyle, textAlign: 'right', fontWeight: 800, fontSize: 17,
            maxWidth: 180,
            borderColor: totales.total > 0 ? '#86efac' : 'var(--brand, #7c3aed)',
            color: totales.total > 0 ? '#065f46' : 'var(--txt)',
            background: '#fff',
          }} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', gap: 14, color: 'var(--txt3)' }}>
          <span>Costo <b style={{ color: 'var(--txt)' }}>{fmt(totales.costoTotal)}</b></span>
          <span>Ganancia <b style={{ color: totales.ganancia >= 0 ? 'var(--txt)' : '#dc2626' }}>{fmt(totales.ganancia)}</b></span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: 'var(--txt3)' }}>Margen</span>
          <input type="number" min={0} max={99} value={totales.margen}
            onChange={e => onMargenChange(e.target.value)}
            style={{ ...inputStyle, width: 62, textAlign: 'right', padding: '4px 8px', fontSize: 12 }} />
          <span style={{ color: 'var(--txt3)' }}>%</span>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, marginTop: 6 }}>
        <label style={{ color: 'var(--txt3)' }}>Seña</label>
        <input type="number" min={0}
          value={pedido.seniaMonto || ''}
          onChange={e => onSeniaChange(e.target.value)}
          placeholder="0" style={{ ...inputStyle, textAlign: 'right', maxWidth: 160 }} />
      </div>
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
      <span style={{ color: 'var(--txt3)' }}>{label}</span>
      <span style={{ fontWeight: 600, color: 'var(--txt)' }}>{value}</span>
    </div>
  )
}

function DescripcionInput({ value, products, onChange, className }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const q = (value || '').toLowerCase().trim()
  const matches = q
    ? products.filter(p => (p.name || '').toLowerCase().includes(q)).slice(0, 8)
    : []

  const pick = (p) => {
    onChange({
      descripcion: p.name || '',
      costoUnit: Number(p.cost) || 0,
      precioUnit: Number(p.price) || 0,
      productoId: p.id,
    })
    setOpen(false)
  }

  return (
    <div ref={ref} className={className} style={{ position: 'relative', minWidth: 0 }}>
      <input type="text" value={value}
        onChange={e => { onChange({ descripcion: e.target.value, productoId: null }); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder="Descripción — escribí para buscar en el catálogo"
        autoComplete="off"
        style={inputStyle} />
      {open && matches.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
          background: 'var(--surface, #fff)',
          border: '1px solid var(--brand, #7c3aed)',
          borderRadius: 8, maxHeight: 260, overflowY: 'auto', marginTop: 4,
          boxShadow: '0 8px 24px rgba(0,0,0,.1)',
        }}>
          {matches.map(p => (
            <div key={p.id} onClick={() => pick(p)}
              style={{ padding: '9px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border, #e2e8f0)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--brand-xlt, #f5f3ff)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                {p.cat && <div style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 1 }}>{p.cat}</div>}
              </div>
              <div style={{ fontSize: 11, color: 'var(--txt3)', flexShrink: 0, textAlign: 'right' }}>
                <div>Costo <b style={{ color: 'var(--txt)' }}>{fmt(Number(p.cost) || 0)}</b></div>
                {Number(p.price) > 0 && <div>Precio <b style={{ color: '#16a34a' }}>{fmt(Number(p.price))}</b></div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SectionTitle({ meta, label }) {
  return (
    <h3 style={{
      display: 'flex', alignItems: 'center', gap: 8,
      fontSize: 12, fontWeight: 700,
      color: 'var(--txt3, #64748b)',
      textTransform: 'uppercase', letterSpacing: '.06em',
      margin: '0 0 12px',
    }}>
      <span style={{
        width: 24, height: 24, borderRadius: 7,
        background: meta.color + '18', color: meta.color,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11,
      }}>
        <i className={`fa ${meta.icon}`} />
      </span>
      {label}
    </h3>
  )
}

function EstadoSelect({ value, onChange }) {
  const st = ESTADO_COLOR[value] || ESTADO_COLOR.consulta
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      title="Estado del pedido"
      style={{
        padding: '7px 12px', maxWidth: 180, fontWeight: 700, fontSize: 12,
        border: `1.5px solid ${st.bd}`, borderRadius: 999,
        background: st.bg, color: st.fg,
        fontFamily: 'inherit', outline: 'none', cursor: 'pointer',
        letterSpacing: '.02em',
      }}>
      {ESTADOS.map(k => <option key={k} value={k}>{ESTADO_LABELS[k]}</option>)}
    </select>
  )
}

function TagChip({ value, onChange, className }) {
  const st = TAG_COLOR[value] || TAG_COLOR.otro
  return (
    <select className={className} value={value} onChange={e => onChange(e.target.value)}
      title="Tipo de línea"
      style={{
        padding: '6px 10px', fontSize: 10, fontWeight: 700,
        border: `1px solid ${st.bd}`, borderRadius: 999,
        background: st.bg, color: st.fg,
        fontFamily: 'inherit', outline: 'none', cursor: 'pointer',
        appearance: 'none', WebkitAppearance: 'none', textAlign: 'center',
      }}>
      {TAGS.map(k => <option key={k} value={k}>{TAG_LABELS[k]}</option>)}
    </select>
  )
}

function EstadoCompraChip({ value, onChange, className }) {
  const st = ESTADO_COMPRA_COLOR[value] || ESTADO_COMPRA_COLOR.pendiente
  return (
    <select className={className} value={value} onChange={e => onChange(e.target.value)}
      style={{
        padding: '6px 10px', fontSize: 11, fontWeight: 700,
        border: `1px solid ${st.bd}`, borderRadius: 999,
        background: st.bg, color: st.fg,
        fontFamily: 'inherit', outline: 'none', cursor: 'pointer',
        appearance: 'none', WebkitAppearance: 'none', textAlign: 'center',
      }}>
      {ESTADOS_COMPRA.map(k => <option key={k} value={k}>{ESTADO_COMPRA_LABELS[k]}</option>)}
    </select>
  )
}

function MenuMore({ pedido, onDuplicate, onDelete }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} className="btn btn-ghost btn-sm"
        title="Más opciones" style={{ borderRadius: 10, padding: '7px 12px' }}>
        <i className="fa fa-ellipsis-vertical" />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 6, zIndex: 200,
          background: 'var(--surface, #fff)',
          border: '1px solid var(--border, #e2e8f0)',
          borderRadius: 10, minWidth: 200,
          boxShadow: '0 10px 30px rgba(0,0,0,.12)',
          overflow: 'hidden',
        }}>
          <MenuItem icon="fa-copy" label="Duplicar pedido"
            onClick={() => { setOpen(false); onDuplicate() }}
            disabled={!pedido.id} />
          <MenuItem icon="fa-trash" label="Eliminar pedido" color="#dc2626"
            onClick={() => { setOpen(false); onDelete() }}
            disabled={!pedido.id} />
        </div>
      )}
    </div>
  )
}

function MenuItem({ icon, label, onClick, color, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%',
        padding: '10px 14px', border: 'none', background: 'transparent',
        color: disabled ? 'var(--txt3)' : (color || 'var(--txt)'),
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit', fontSize: 13, fontWeight: 500,
        textAlign: 'left', opacity: disabled ? 0.5 : 1,
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = 'var(--brand-xlt, #f5f3ff)' }}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
      <i className={`fa ${icon}`} style={{ width: 14, textAlign: 'center' }} />
      {label}
    </button>
  )
}

// ── Styles ─────────────────────────────────────────────────────────

// Card con banda superior del color del bloque + sombra suave
function cardStyleFor(sectionKey) {
  const color = SECCION_META[sectionKey]?.color || '#7c3aed'
  return {
    background: 'var(--surface, #fff)',
    border: '1px solid var(--border, #e2e8f0)',
    borderRadius: 14,
    padding: 18,
    borderTop: `3px solid ${color}`,
    boxShadow: '0 1px 2px rgba(15,23,42,.04), 0 4px 12px rgba(15,23,42,.03)',
  }
}
const labelStyle = {
  display: 'block',
  fontSize: 11,
  color: 'var(--txt3, #64748b)',
  marginBottom: 5,
  fontWeight: 500,
}

const inputStyle = {
  width: '100%',
  padding: '8px 12px',
  border: '1px solid var(--border, #e2e8f0)',
  borderRadius: 8,
  fontSize: 13,
  fontFamily: 'inherit',
  background: 'var(--surface, #fff)',
  color: 'var(--txt, #0f172a)',
  outline: 'none',
  boxSizing: 'border-box',
}

const dropdownStyle = {
  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
  background: 'var(--surface, #fff)',
  border: '1px solid var(--brand, #7c3aed)',
  borderRadius: 8, maxHeight: 240, overflowY: 'auto', marginTop: 4,
  boxShadow: '0 8px 24px rgba(0,0,0,.1)',
}

const dropdownItem = {
  padding: '10px 14px', cursor: 'pointer',
  borderBottom: '1px solid var(--border, #e2e8f0)',
  transition: 'background .1s',
}

const lineaGrid = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 2fr) 118px 68px 92px 92px 108px 30px',
  gap: 8,
}
