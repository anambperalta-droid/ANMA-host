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
  totalDesdeMargen, pedidoVacio, nuevaLinea, snapshotAlt, aplicarAlt,
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

// Icono y subtítulo pregunta por sección — la estética base viene de .wiz-pane
// (tema-aware, misma que /presupuesto). El icono se pinta con var(--grad).
const SECCION_META = {
  cliente:  { icon: 'fa-user-tie',      title: 'Cliente' },
  lineas:   { icon: 'fa-list-check',    title: 'Productos' },
  costos:   { icon: 'fa-briefcase',     title: 'Costos operativos' },
  precio:   { icon: 'fa-coins',         title: 'Precio' },
  entrega:  { icon: 'fa-truck-fast',    title: 'Entrega' },
  nota:     { icon: 'fa-pen-to-square', title: 'Nota interna' },
}

// Sub-conjuntos del enum TAGS por sección visible
const TAGS_PRODUCTOS = ['producto', 'packaging']
const TAGS_COSTOS    = ['manoDeObra', 'diseno', 'envio', 'otro']

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

  const setLineaById    = (id, patch) => updateFn(p => ({ ...p, lineas: p.lineas.map(l => l.id === id ? { ...l, ...patch } : l) }))
  const addLinea        = (tag = 'producto') => updateFn(p => ({ ...p, lineas: [...p.lineas, nuevaLinea({ tag })] }))
  const removeLineaById = (id) => updateFn(p => {
    const filtered = p.lineas.filter(l => l.id !== id)
    return { ...p, lineas: filtered.length ? filtered : [nuevaLinea()] }
  })

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
    toast(`Cliente cargado: ${cl.company || cl.contact || '—'}`, 'ok')
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
            onSaveAlt={() => {
              const label = `Alternativa ${(pedido.alternativas?.length || 0) + 1}`
              const snap = snapshotAlt(pedido, label)
              updateFn(p => ({ ...p, alternativas: [...(p.alternativas || []), snap] }))
              toast(`${label} guardada`, 'ok')
            }}
            onToggleKit={() => {
              if (pedido.esKit) update({ esKit: false, cantKits: 0 })
              else              update({ esKit: true,  cantKits: Math.max(1, Number(pedido.cantKits) || 10) })
            }}
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
            <button onClick={() => nav('/pedido')} className="btn btn-primary btn-sm"
              title="Empezar otro pedido">
              <i className="fa fa-plus" /> Nuevo
            </button>
          )}
          <button onClick={() => nav('/')} className="btn btn-ghost btn-sm" style={{ borderRadius: 10 }}>
            <i className="fa fa-arrow-left" /> Volver
          </button>
        </div>
      </div>

      {/* Kit chip — aparece cuando esKit está activo */}
      {pedido.esKit && (
        <KitChip
          cantidad={pedido.cantKits}
          onChange={v => update({ cantKits: Math.max(1, Number(v) || 1) })}
          onOff={() => update({ esKit: false, cantKits: 0 })}
        />
      )}

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0,1fr)' }}>

        {/* ── CLIENTE ── */}
        <section className="wiz-pane">
          <PaneHead meta={SECCION_META.cliente} />
          <div className="pedido-cliente-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
            <div ref={clientBoxRef} style={{ position: 'relative' }}>
              <label style={labelStyle}>Empresa o persona</label>
              <input
                type="text"
                value={pedido.clienteNombre}
                onChange={e => { update({ clienteNombre: e.target.value, clienteId: null, company: e.target.value }); setShowClientList(true) }}
                onFocus={() => setShowClientList(true)}
                placeholder="Buscá o escribí uno nuevo"
                autoComplete="off"
                style={inputStyle}
              />
              {showClientList && clientMatches.length > 0 && (
                <div style={dropdownStyle}>
                  {clientMatches.map(cl => (
                    <div key={cl.id} onClick={() => pickCliente(cl)} style={dropdownItem}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--brand-xlt)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)' }}>
                        {cl.contact || cl.company || '—'}
                      </div>
                      {(cl.company || cl.wa) && (
                        <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 2 }}>
                          {cl.company}{cl.wa ? ` · ${cl.wa}` : ''}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
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

        {/* ── PRODUCTOS (Producto + Packaging) ── */}
        <LineasSection
          meta={SECCION_META.lineas}
          tags={TAGS_PRODUCTOS}
          defaultTag="producto"
          lineas={pedido.lineas.filter(l => TAGS_PRODUCTOS.includes(l.tag || 'producto'))}
          products={products}
          onAdd={() => addLinea('producto')}
          onChange={setLineaById}
          onRemove={removeLineaById}
          onPickProduct={(name) => toast(`${name} cargado del catálogo`, 'ok')}
          totalLineas={pedido.lineas.length}
          extras={(pedido.alternativas?.length > 0) && (
            <AlternativasBar
              alternativas={pedido.alternativas}
              onLoad={(alt) => updateFn(p => aplicarAlt(p, alt))}
              onApprove={(id) => updateFn(p => ({
                ...p,
                alternativas: (p.alternativas || []).map(a => ({ ...a, aprobada: a.id === id })),
              }))}
              onDelete={(id) => updateFn(p => ({
                ...p,
                alternativas: (p.alternativas || []).filter(a => a.id !== id),
              }))}
              onRename={(id, label) => updateFn(p => ({
                ...p,
                alternativas: (p.alternativas || []).map(a => a.id === id ? { ...a, label } : a),
              }))}
            />
          )}
        />

        {/* ── COSTOS OPERATIVOS (Mano de obra + Diseño + Envío + Otro) ── */}
        <LineasSection
          meta={SECCION_META.costos}
          tags={TAGS_COSTOS}
          defaultTag="manoDeObra"
          lineas={pedido.lineas.filter(l => TAGS_COSTOS.includes(l.tag))}
          products={products}
          onAdd={() => addLinea('manoDeObra')}
          onChange={setLineaById}
          onRemove={removeLineaById}
          onPickProduct={(name) => toast(`${name} cargado del catálogo`, 'ok')}
          totalLineas={pedido.lineas.length}
          emptyHint="Diseño, mano de obra, envío u otros costos que se suman al pedido."
        />

        {/* ── PRECIO ── */}
        <section className="wiz-pane">
          <PaneHead meta={SECCION_META.precio} />
          <PrecioBlock pedido={pedido} totales={totales}
            onTotalChange={setPrecioFinal}
            onMargenChange={setMargen}
            onIvaChange={() => update({ aplicaIva: !pedido.aplicaIva })}
            onSeniaChange={v => update({ seniaMonto: Number(v) || 0 })}
          />
        </section>

        {/* ── ENTREGA ── */}
        <section className="wiz-pane">
          <PaneHead meta={SECCION_META.entrega} />
          <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 1fr', gap: 12 }} className="pedido-entrega-grid">
            <div>
              <label style={labelStyle}>Fecha</label>
              <input type="date" value={pedido.fechaEntrega || ''}
                onChange={e => update({ fechaEntrega: e.target.value })}
                style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Horario</label>
              <input type="text" value={pedido.horarioEntrega || ''}
                onChange={e => update({ horarioEntrega: e.target.value })}
                placeholder="Ej: mañana antes de las 12" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Contacto para coordinar</label>
              <input type="text" value={pedido.contactoEntrega || ''}
                onChange={e => update({ contactoEntrega: e.target.value })}
                placeholder="Nombre y teléfono" style={inputStyle} />
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <label style={labelStyle}>Dirección</label>
            <input type="text" value={pedido.direccionEntrega || ''}
              onChange={e => update({ direccionEntrega: e.target.value })}
              placeholder="Calle, número, piso, ciudad" style={inputStyle} />
          </div>
          <div style={hintYellow}>
            <i className="fa fa-lightbulb" style={{ marginRight: 8, color: '#B45309', marginTop: 2 }} />
            <span>Los envíos con comisionista se cargan en <b>Logística</b> y se enlazan por número de pedido.</span>
          </div>
        </section>

        {/* ── NOTA INTERNA ── */}
        <section className="wiz-pane">
          <PaneHead meta={SECCION_META.nota} />
          <textarea value={pedido.notaInterna}
            onChange={e => update({ notaInterna: e.target.value })}
            rows={4}
            placeholder="Texto libre. Todo lo que quieras recordar de este pedido."
            style={{ ...inputStyle, minHeight: 88, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} />
        </section>
      </div>

      {/* Estilos de la tabla de productos — densidad Airtable-style */}
      <style>{`
        /* Fix stacking: cualquier wiz-pane con foco activo sube z-index para
           que sus dropdowns (Cliente / Descripción / etc) no queden tapados
           por los siguientes wiz-pane (que crean stacking context por la
           animación pgIn). */
        .wiz-pane { position: relative; }
        .wiz-pane:focus-within { z-index: 100; }

        /* Fila plana con divisor sutil abajo, sin bg propio */
        .pedido-linea-row {
          padding: 6px 8px;
          border-bottom: 1px solid var(--border);
          transition: background .12s ease;
          border-radius: 6px;
        }
        .pedido-linea-row:last-child { border-bottom: none; }
        .pedido-linea-row:hover { background: var(--brand-xlt); }
        .pedido-linea-row:hover .pedido-remove-btn { opacity: 1 !important; }

        /* Inputs "flat" — sin border, se resaltan solo al hover/focus */
        .pedido-cell-input {
          width: 100%;
          padding: 6px 8px;
          border: 1px solid transparent;
          border-radius: 6px;
          font-size: 13px;
          font-family: inherit;
          background: transparent;
          color: var(--txt);
          outline: none;
          box-sizing: border-box;
          transition: background .12s ease, border-color .12s ease;
        }
        .pedido-cell-input:hover  { background: var(--surface2); }
        .pedido-cell-input:focus  { background: var(--surface); border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-xlt); }
        .pedido-cell-input::placeholder { color: var(--txt4); font-weight: 400; }

        /* Chips (Tipo / Estado compra) centrados bajo su header en desktop */
        .pedido-linea-row > .l-tag,
        .pedido-linea-row > .l-estado { display: flex; flex-direction: column; align-items: center; }
        .pedido-linea-row > .l-tag > select,
        .pedido-linea-row > .l-estado > select { max-width: 100%; }

        /* Label por campo — solo visible en mobile (card apilada) */
        .l-mob-label { display: none; }

        @media (max-width: 720px) {
          .pedido-linea-header { display: none !important; }
          .pedido-linea-row {
            grid-template-columns: 1fr 1fr !important;
            grid-template-areas:
              'desc  desc'
              'tag   remove'
              'cant  costo'
              'precio estado' !important;
            padding: 14px !important;
            gap: 12px 10px !important;
            border: 1px solid var(--border) !important;
            border-radius: 12px !important;
            margin-bottom: 10px !important;
          }
          .pedido-linea-row:hover { background: var(--surface) !important; }
          .pedido-linea-row > .l-desc   { grid-area: desc; }
          .pedido-linea-row > .l-tag    { grid-area: tag; justify-content: flex-start; }
          .pedido-linea-row > .l-cant   { grid-area: cant; }
          .pedido-linea-row > .l-costo  { grid-area: costo; }
          .pedido-linea-row > .l-precio { grid-area: precio; }
          .pedido-linea-row > .l-estado { grid-area: estado; justify-content: flex-start; }
          .pedido-linea-row > .l-remove {
            grid-area: remove; justify-self: end; opacity: 1 !important;
            width: 30px; height: 30px; border-radius: 8px !important;
            background: var(--surface2) !important; color: var(--red) !important;
          }
          /* Inputs mobile: border visible para que se lean como campos */
          .pedido-linea-row .pedido-cell-input {
            border: 1px solid var(--border) !important;
            background: var(--surface) !important;
            padding: 9px 10px !important;
            text-align: left !important;
            font-size: 14px !important;
          }
          .l-mob-label {
            display: block; font-size: 9px; font-weight: 700;
            color: var(--txt3); text-transform: uppercase; letter-spacing: .05em;
            margin-bottom: 4px;
          }
          .pedido-cliente-grid { grid-template-columns: 1fr !important; }
          .pedido-entrega-grid { grid-template-columns: 1fr !important; }
          .pedido-precio-grid  { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 960px) and (min-width: 721px) {
          .pedido-precio-grid { grid-template-columns: 1fr 1fr !important; }
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

function LineasSection({ meta, tags, lineas, products, onAdd, onChange, onRemove, onPickProduct, totalLineas, extras, emptyHint }) {
  // Estado elevado: cuando cualquier fila abre su dropdown de catálogo, la
  // sección sube z-index para que no la tape la siguiente. Solución robusta
  // (el :focus-within CSS no alcanza por los stacking context de pgIn).
  const [dropdownOpen, setDropdownOpen] = useState(false)
  return (
    <section className="wiz-pane" style={{ position: 'relative', zIndex: dropdownOpen ? 200 : undefined }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <PaneHead meta={meta} />
        <button onClick={onAdd} className="btn btn-primary btn-sm" style={{ flexShrink: 0 }}>
          <i className="fa fa-plus" /> Agregar
        </button>
      </div>

      {extras}

      {lineas.length > 0 && (
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
      )}

      {lineas.map(linea => (
        <LineaRow key={linea.id}
          linea={linea}
          products={products}
          tags={tags}
          onChange={patch => onChange(linea.id, patch)}
          onRemove={() => onRemove(linea.id)}
          canRemove={totalLineas > 1 || !!linea.descripcion}
          onPickProduct={onPickProduct}
          onDropdownOpen={setDropdownOpen} />
      ))}

      {lineas.length === 0 && (
        <div style={{ padding: '18px 4px 6px', fontSize: 12, color: 'var(--txt3)', lineHeight: 1.5 }}>
          {emptyHint || `Todavía no cargaste ${meta.title.toLowerCase()}. Tocá "+ Agregar" para sumar una línea.`}
        </div>
      )}
    </section>
  )
}

function LineaRow({ linea, products, tags, onChange, onRemove, canRemove, onPickProduct, onDropdownOpen }) {
  return (
    <div className="pedido-linea-row" style={{ ...lineaGrid, alignItems: 'center' }}>
      <div className="l-desc" style={{ minWidth: 0 }}>
        <span className="l-mob-label">Descripción</span>
        <DescripcionInput value={linea.descripcion} products={products}
          onChange={patch => onChange(patch)} onPick={onPickProduct}
          onDropdownOpen={onDropdownOpen} flat />
      </div>
      <div className="l-tag">
        <span className="l-mob-label">Tipo</span>
        <TagChip value={linea.tag || 'producto'} tags={tags}
          onChange={v => onChange({ tag: v })} mini />
      </div>
      <div className="l-cant">
        <span className="l-mob-label">Cantidad</span>
        <input className="pedido-cell-input" type="number" min={0} value={linea.cantidad}
          onChange={e => onChange({ cantidad: e.target.value === '' ? 0 : Number(e.target.value) })}
          style={{ textAlign: 'right' }} />
      </div>
      <div className="l-costo">
        <span className="l-mob-label">Costo/u</span>
        <input className="pedido-cell-input" type="number" min={0} value={linea.costoUnit}
          onChange={e => onChange({ costoUnit: e.target.value === '' ? 0 : Number(e.target.value) })}
          placeholder="0" style={{ textAlign: 'right' }} />
      </div>
      <div className="l-precio">
        <span className="l-mob-label">Precio/u</span>
        <input className="pedido-cell-input" type="number" min={0} value={linea.precioUnit}
          onChange={e => onChange({ precioUnit: e.target.value === '' ? 0 : Number(e.target.value) })}
          placeholder="0" style={{ textAlign: 'right' }} />
      </div>
      <div className="l-estado">
        <span className="l-mob-label">Estado compra</span>
        <EstadoCompraChip value={linea.estadoCompra}
          onChange={v => onChange({ estadoCompra: v })} mini />
      </div>
      <button onClick={onRemove} disabled={!canRemove}
        title={canRemove ? 'Eliminar línea' : 'Al menos una línea'}
        className="l-remove pedido-remove-btn"
        style={{
          background: 'transparent', border: 'none', color: 'var(--txt3)',
          cursor: canRemove ? 'pointer' : 'not-allowed', padding: 4,
          fontSize: 12, opacity: canRemove ? 0 : 0.3,
          transition: 'opacity .15s ease',
        }}>
        <i className="fa fa-times" />
      </button>
    </div>
  )
}

function PrecioBlock({ pedido, totales, onTotalChange, onMargenChange, onIvaChange, onSeniaChange }) {
  const gananciaOk = totales.ganancia >= 0
  const saldo = pedido.seniaMonto > 0 && totales.total > 0 ? Math.max(0, totales.total - pedido.seniaMonto) : null
  return (
    <div style={{ display: 'grid', gap: 12 }}>

      {/* ── TOTAL destacado — protagonista arriba ── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '14px 18px',
        background: totales.total > 0 ? 'linear-gradient(90deg, #f0fdf4 0%, #ecfdf5 100%)' : 'var(--surface2)',
        border: `1.5px solid ${totales.total > 0 ? '#86efac' : 'var(--border)'}`,
        borderRadius: 12,
      }}>
        <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.08em', color: totales.total > 0 ? '#065f46' : 'var(--txt3)' }}>TOTAL</span>
        <input type="number" min={0}
          value={totales.total || ''}
          onChange={e => onTotalChange(e.target.value)}
          style={{
            ...inputStyle, textAlign: 'right', fontWeight: 800, fontSize: 18,
            maxWidth: 190, padding: '9px 14px',
            borderColor: totales.total > 0 ? '#86efac' : 'var(--brand)',
            color: totales.total > 0 ? '#065f46' : 'var(--txt)',
            background: 'var(--surface)',
          }} />
      </div>

      {/* ── 3 columnas: Cálculo | Margen | Cobro ── */}
      <div className="pedido-precio-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>

        <div style={precioGroup}>
          <div style={precioGroupLabel}>Cálculo</div>
          <Row label="Subtotal" value={fmt(totales.subtotal)} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: 'var(--txt3)' }}>
              <input type="checkbox" checked={pedido.aplicaIva} onChange={onIvaChange} />
              IVA 21%
            </label>
            <span style={{ fontWeight: 600, color: pedido.aplicaIva ? 'var(--txt)' : 'var(--txt3)' }}>{fmt(totales.iva)}</span>
          </div>
        </div>

        <div style={precioGroup}>
          <div style={precioGroupLabel}>Margen</div>
          <Row label="Costo" value={fmt(totales.costoTotal)} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
            <span style={{ color: 'var(--txt3)' }}>Ganancia</span>
            <b style={{ color: gananciaOk ? '#15803d' : '#dc2626' }}>{fmt(totales.ganancia)}</b>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
            <span style={{ color: 'var(--txt3)' }}>Margen</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input type="number" min={0} max={99} value={totales.margen}
                onChange={e => onMargenChange(e.target.value)}
                style={{ ...inputStyle, width: 60, textAlign: 'right', padding: '4px 8px', fontSize: 12, fontWeight: 700 }} />
              <span style={{ color: 'var(--txt3)', fontSize: 11 }}>%</span>
            </div>
          </div>
        </div>

        <div style={precioGroup}>
          <div style={precioGroupLabel}>Cobro</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
            <span style={{ color: 'var(--txt3)' }}>Seña</span>
            <input type="number" min={0}
              value={pedido.seniaMonto || ''}
              onChange={e => onSeniaChange(e.target.value)}
              placeholder="0" style={{ ...inputStyle, width: 96, textAlign: 'right', padding: '4px 8px', fontSize: 12, fontWeight: 700 }} />
          </div>
          {saldo != null && (
            <Row label="Saldo" value={fmt(saldo)} />
          )}
        </div>

      </div>
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
      <span style={{ color: 'var(--txt3)' }}>{label}</span>
      <span style={{ fontWeight: 600, color: 'var(--txt)' }}>{value}</span>
    </div>
  )
}

function DescripcionInput({ value, products, onChange, onPick, onDropdownOpen, className, flat }) {
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
  const showDropdown = open && matches.length > 0

  // Reporta al padre (LineasSection) cuando el dropdown está visible, para
  // que suba el z-index de la sección.
  useEffect(() => { onDropdownOpen?.(showDropdown) }, [showDropdown]) // eslint-disable-line

  const pick = (p) => {
    onChange({
      descripcion: p.name || '',
      costoUnit: Number(p.cost) || 0,
      precioUnit: Number(p.price) || 0,
      productoId: p.id,
    })
    setOpen(false)
    if (onPick) onPick(p.name || 'Producto')
  }

  return (
    <div ref={ref} className={className} style={{ position: 'relative', minWidth: 0 }}>
      <input type="text" value={value}
        onChange={e => { onChange({ descripcion: e.target.value, productoId: null }); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder={flat ? 'Descripción' : 'Descripción — escribí para buscar en el catálogo'}
        autoComplete="off"
        className={flat ? 'pedido-cell-input' : ''}
        style={flat ? { fontWeight: 500 } : inputStyle} />
      {showDropdown && (
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

function PaneHead({ meta }) {
  return (
    <div className="wiz-pane-head">
      <div className="wiz-pane-ico"><i className={`fa ${meta.icon}`} /></div>
      <div style={{ minWidth: 0 }}>
        <div className="wiz-pane-title">{meta.title}</div>
        {meta.sub && <div className="wiz-pane-sub">{meta.sub}</div>}
      </div>
    </div>
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

function TagChip({ value, onChange, className, mini, tags }) {
  const st = TAG_COLOR[value] || TAG_COLOR.otro
  const pad = mini ? '3px 8px' : '6px 10px'
  const fs  = mini ? 10 : 11
  const options = tags || TAGS
  return (
    <select className={className} value={value} onChange={e => onChange(e.target.value)}
      title="Tipo de línea"
      style={{
        padding: pad, fontSize: fs, fontWeight: 700,
        border: `1px solid ${st.bd}`, borderRadius: 999,
        background: st.bg, color: st.fg,
        fontFamily: 'inherit', outline: 'none', cursor: 'pointer',
        appearance: 'none', WebkitAppearance: 'none', textAlign: 'center',
      }}>
      {options.map(k => <option key={k} value={k}>{TAG_LABELS[k]}</option>)}
    </select>
  )
}

function EstadoCompraChip({ value, onChange, className, mini }) {
  const st = ESTADO_COMPRA_COLOR[value] || ESTADO_COMPRA_COLOR.pendiente
  const pad = mini ? '3px 8px' : '6px 10px'
  const fs  = mini ? 10 : 11
  return (
    <select className={className} value={value} onChange={e => onChange(e.target.value)}
      style={{
        padding: pad, fontSize: fs, fontWeight: 700,
        border: `1px solid ${st.bd}`, borderRadius: 999,
        background: st.bg, color: st.fg,
        fontFamily: 'inherit', outline: 'none', cursor: 'pointer',
        appearance: 'none', WebkitAppearance: 'none', textAlign: 'center',
      }}>
      {ESTADOS_COMPRA.map(k => <option key={k} value={k}>{ESTADO_COMPRA_LABELS[k]}</option>)}
    </select>
  )
}

function KitChip({ cantidad, onChange, onOff }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      padding: '10px 14px', marginBottom: 14,
      background: 'var(--brand-xlt)',
      border: '1.5px solid var(--brand)',
      borderRadius: 12,
      fontSize: 13, fontWeight: 600, color: 'var(--brand)',
    }}>
      <i className="fa fa-gift" />
      <span>Modo kit — cada línea es <b>1 componente por unidad</b>, se multiplica ×</span>
      <input type="number" min={1} value={cantidad}
        onChange={e => onChange(e.target.value)}
        style={{
          width: 70, textAlign: 'center', fontWeight: 800, fontSize: 14,
          padding: '5px 8px', border: '1.5px solid var(--brand)', borderRadius: 8,
          background: 'var(--surface)', color: 'var(--brand)', fontFamily: 'inherit', outline: 'none',
        }} />
      <span>unidades</span>
      <button onClick={onOff}
        title="Salir de modo kit"
        style={{
          marginLeft: 4, background: 'transparent', border: 'none', color: 'var(--brand)',
          cursor: 'pointer', padding: 4, fontSize: 13,
        }}>
        <i className="fa fa-xmark" />
      </button>
    </div>
  )
}

function AlternativasBar({ alternativas, onLoad, onApprove, onDelete, onRename }) {
  const [openMenuId, setOpenMenuId] = useState(null)
  useEffect(() => {
    const close = () => setOpenMenuId(null)
    if (openMenuId) {
      document.addEventListener('mousedown', close)
      return () => document.removeEventListener('mousedown', close)
    }
  }, [openMenuId])

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8,
      padding: '10px 12px', marginTop: 12, marginBottom: 4,
      background: 'var(--brand-xlt)', border: '1.5px solid var(--brand)',
      borderRadius: 10,
    }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand)', textTransform: 'uppercase', letterSpacing: '.06em', marginRight: 4 }}>
        <i className="fa fa-layer-group" style={{ marginRight: 6 }} />
        Alternativas guardadas
      </span>
      {alternativas.map(alt => (
        <div key={alt.id} style={{ position: 'relative', display: 'inline-flex' }}>
          <button
            onClick={() => onLoad(alt)}
            title="Cargar esta alternativa en el editor"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '5px 10px 5px 12px',
              background: alt.aprobada ? '#dcfce7' : 'var(--surface)',
              color: alt.aprobada ? '#15803d' : 'var(--txt)',
              border: `1.5px solid ${alt.aprobada ? '#86efac' : 'var(--border2)'}`,
              borderRadius: 999, fontSize: 12, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
            {alt.aprobada && <i className="fa fa-check" style={{ fontSize: 10 }} />}
            {alt.label}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === alt.id ? null : alt.id) }}
            title="Opciones"
            style={{
              padding: '5px 8px', marginLeft: -1,
              background: 'var(--surface)', color: 'var(--txt3)',
              border: `1.5px solid var(--border2)`, borderLeft: 'none',
              borderRadius: '0 999px 999px 0', fontSize: 11, cursor: 'pointer',
            }}>
            <i className="fa fa-ellipsis-vertical" />
          </button>
          {openMenuId === alt.id && (
            <div onMouseDown={(e) => e.stopPropagation()}
              style={{
                position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 200,
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 10, minWidth: 180, boxShadow: '0 10px 30px rgba(0,0,0,.12)',
                overflow: 'hidden',
              }}>
              <MenuItem icon={alt.aprobada ? 'fa-check-double' : 'fa-check'}
                label={alt.aprobada ? 'Quitar aprobación' : 'Marcar como aprobada'}
                onClick={() => { setOpenMenuId(null); onApprove(alt.aprobada ? null : alt.id) }} />
              <MenuItem icon="fa-pen" label="Renombrar"
                onClick={() => {
                  const nuevo = prompt('Nombre de la alternativa:', alt.label)
                  setOpenMenuId(null)
                  if (nuevo && nuevo.trim()) onRename(alt.id, nuevo.trim())
                }} />
              <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
              <MenuItem icon="fa-trash" label="Eliminar" color="#dc2626"
                onClick={() => { setOpenMenuId(null); onDelete(alt.id) }} />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function MenuMore({ pedido, onSaveAlt, onToggleKit, onDuplicate, onDelete }) {
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
          <MenuItem icon="fa-layer-group"
            label={pedido.alternativas?.length > 0
              ? `Guardar como alternativa (${pedido.alternativas.length})`
              : 'Guardar como alternativa'}
            onClick={() => { setOpen(false); onSaveAlt() }} />
          <MenuItem
            icon={pedido.esKit ? 'fa-list-ul' : 'fa-gift'}
            label={pedido.esKit ? 'Salir de modo kit' : 'Convertir en kit'}
            onClick={() => { setOpen(false); onToggleKit() }} />
          <div style={{ height: 1, background: 'var(--border, #e2e8f0)', margin: '4px 0' }} />
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

// Subgrupo interno para PrecioBlock — le da estructura visual a la seccion
const precioGroup = {
  display: 'grid', gap: 6,
  padding: '12px 14px',
  background: 'var(--surface2)',
  border: '1px solid var(--border)',
  borderRadius: 10,
}
const precioGroupLabel = {
  fontSize: 10, fontWeight: 700, color: 'var(--txt2)',
  textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4,
}

// Label uppercase — misma escala que .f-lbl (login/config)
const labelStyle = {
  display: 'block',
  fontSize: 10,
  color: 'var(--txt2)',
  marginBottom: 5,
  fontWeight: 700,
  letterSpacing: '.06em',
  textTransform: 'uppercase',
}

// Nota inline estilo dorado — matchea el hint del wizard viejo
const hintYellow = {
  marginTop: 12, padding: '10px 14px',
  background: '#FEF3C7', border: '1px solid #FDE68A',
  borderRadius: 10, fontSize: 12, color: '#78350F',
  display: 'flex', alignItems: 'flex-start', lineHeight: 1.5,
}

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  border: '1.5px solid var(--border)',
  borderRadius: 8,
  fontSize: 13,
  fontFamily: 'inherit',
  background: 'var(--surface)',
  color: 'var(--txt)',
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color .15s ease',
}

const dropdownStyle = {
  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
  background: 'var(--surface)',
  border: '2px solid var(--brand)',
  borderRadius: 10, maxHeight: 280, overflowY: 'auto', marginTop: 6,
  boxShadow: '0 12px 32px rgba(0,0,0,.14)',
  overflow: 'hidden',
}

const dropdownItem = {
  padding: '12px 16px', cursor: 'pointer',
  borderBottom: '1px solid var(--border)',
  transition: 'background .1s',
  background: 'var(--surface)',
}

const lineaGrid = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1.8fr) 92px 56px 84px 84px 96px 24px',
  gap: 8,
}
