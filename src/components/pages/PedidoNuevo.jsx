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
  getEstado, registrarEvento,
  ESTADOS, ESTADO_LABELS, estadoOptions, ESTADOS_COMPRA, TAGS, TAG_LABELS,
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

// Tareas operativas iniciales — se siembran una sola vez en localStorage.
// A partir de ahí Ana puede agregar las suyas y quedan guardadas.
const DEFAULT_COSTOS_PRESETS = [
  { name: 'Diseño',                tag: 'diseno' },
  { name: 'Mano de obra',          tag: 'manoDeObra' },
  { name: 'Armado de kit',         tag: 'manoDeObra' },
  { name: 'Impresión / Estampado', tag: 'diseno' },
  { name: 'Embalaje especial',     tag: 'otro' },
  { name: 'Envío',                 tag: 'envio' },
]

export default function PedidoNuevo() {
  const { id } = useParams()
  const nav = useNavigate()
  const { get, set, saveBudget, deleteBudget, config } = useData()
  const toast = useToast()
  const confirm = useConfirm()
  const c = config()

  // Presets de tareas operativas — siembra en el primer uso.
  const costosPresets = (() => {
    const stored = get('costosPresets', [])
    if (stored.length) return stored
    const seeded = DEFAULT_COSTOS_PRESETS.map((p, i) => ({ id: Date.now() + i, cost: 0, ...p }))
    set('costosPresets', seeded)
    return seeded
  })()

  // Guarda una tarea operativa nueva para reusar en el futuro (dedup por nombre).
  const savePresetCosto = (name, tag, cost) => {
    const nombre = (name || '').trim()
    if (!nombre) return
    const list = get('costosPresets', [])
    if (list.some(p => (p.name || '').toLowerCase() === nombre.toLowerCase())) return
    set('costosPresets', [...list, { id: Date.now(), name: nombre, tag: tag || 'otro', cost: Number(cost) || 0 }])
    toast(`"${nombre}" guardada en tus tareas`, 'ok')
  }

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
        // Timeline: si el estado cambió respecto al guardado previo, lo
        // registramos como evento. En un pedido nuevo con estado != consulta
        // también queda el hito.
        const estadoPrevio = pedido.id ? getEstado(prev) : 'consulta'
        if (pedido.estado !== estadoPrevio) {
          budget.events = registrarEvento(prev, { type: 'estado', estado: pedido.estado })
        }
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
  // Costos operativos son montos fijos (esCostoUnico) — no se multiplican por cantidad.
  const addLinea        = (tag = 'producto') => {
    const esCostos = TAGS_COSTOS.includes(tag)
    updateFn(p => ({ ...p, lineas: [...p.lineas, nuevaLinea({ tag, esCostoUnico: esCostos, cantidad: 1 })] }))
  }
  const removeLineaById = (id) => updateFn(p => {
    const filtered = p.lineas.filter(l => l.id !== id)
    return { ...p, lineas: filtered.length ? filtered : [nuevaLinea()] }
  })

  // Recordar el monto de una tarea operativa: al editar el costo de una línea
  // cuya descripción coincide con una tarea guardada, actualiza su preset para
  // que la próxima vez se autocomplete con ese valor.
  const syncPresetCost = (name, cost) => {
    const nm = (name || '').trim().toLowerCase()
    if (!nm) return
    const list = get('costosPresets', [])
    const idx = list.findIndex(pp => (pp.name || '').toLowerCase() === nm)
    if (idx > -1 && Number(list[idx].cost) !== Number(cost)) {
      const next = [...list]; next[idx] = { ...next[idx], cost: Number(cost) || 0 }
      set('costosPresets', next)
    }
  }
  const setCostoLinea = (id, patch) => {
    setLineaById(id, patch)
    if ('costoUnit' in patch) {
      const linea = pedido.lineas.find(l => l.id === id)
      const nombre = patch.descripcion ?? linea?.descripcion
      if (nombre) syncPresetCost(nombre, patch.costoUnit)
    }
  }

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

      <div className="pedido-form" style={{ display: 'grid', gap: 12, gridTemplateColumns: 'minmax(0,1fr)' }}>

        {/* ── CLIENTE ── */}
        <section className="pedido-pane">
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

        {/* ── COSTOS OPERATIVOS (tareas guardables, NO catálogo de productos) ── */}
        <LineasSection
          meta={SECCION_META.costos}
          tags={TAGS_COSTOS}
          defaultTag="manoDeObra"
          lineas={pedido.lineas.filter(l => TAGS_COSTOS.includes(l.tag))}
          products={costosPresets}
          isCostos
          onAdd={() => addLinea('manoDeObra')}
          onChange={setCostoLinea}
          onRemove={removeLineaById}
          onPickProduct={(name) => toast(`${name} agregada`, 'ok')}
          onCreatePreset={savePresetCosto}
          totalLineas={pedido.lineas.length}
          emptyHint="Diseño, mano de obra, envío u otros costos que se suman al pedido."
        />

        {/* ── PRECIO ── */}
        <section className="pedido-pane">
          <PaneHead meta={SECCION_META.precio} />
          <PrecioBlock pedido={pedido} totales={totales}
            onTotalChange={setPrecioFinal}
            onMargenChange={setMargen}
            onIvaChange={() => update({ aplicaIva: !pedido.aplicaIva })}
            onSeniaChange={v => update({ seniaMonto: Number(v) || 0 })}
          />
        </section>

        {/* ── ENTREGA ── */}
        <section className="pedido-pane">
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

        {/* ── NOTA INTERNA (compacta) ── */}
        <section className="pedido-pane">
          <PaneHead meta={SECCION_META.nota} />
          <textarea value={pedido.notaInterna}
            onChange={e => update({ notaInterna: e.target.value })}
            rows={2}
            placeholder="Recordatorio, detalle de coordinación, lo que quieras."
            style={{ ...inputStyle, minHeight: 48, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} />
        </section>

        {/* ── CIERRE: confirmación de carga ── */}
        <FinalizarBar pedido={pedido} saving={saving} lastSaved={lastSaved} onFinish={() => nav('/')} />
      </div>

      {/* Estilos propios del form — clase pedido-pane (NO reusa .wiz-pane
          para no arrastrar las reglas mobile !important del wizard viejo). */}
      <style>{`
        .pedido-form { align-content: start; }

        /* ── Card de sección: compacta, moderna, sin divisor grande ── */
        .pedido-pane {
          position: relative;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 15px 16px;
          box-shadow: 0 1px 2px rgba(15,23,42,.04);
        }
        .pedido-pane:focus-within { z-index: 100; }
        .pedido-pane-head { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
        .pedido-pane-ico {
          width: 30px; height: 30px; border-radius: 8px; flex-shrink: 0;
          background: var(--grad); color: #fff;
          display: flex; align-items: center; justify-content: center; font-size: 13px;
        }
        .pedido-pane-title { font-size: 14.5px; font-weight: 700; color: var(--txt); letter-spacing: -.2px; font-family: 'Space Grotesk','Inter',sans-serif; }
        @media (max-width: 720px) {
          .pedido-pane { padding: 13px 13px; border-radius: 12px; }
          .pedido-pane-head { margin-bottom: 10px; }
        }

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

        /* Chip Tipo centrado bajo su header en desktop */
        .pedido-linea-row > .l-tag { display: flex; flex-direction: column; align-items: center; }
        .pedido-linea-row > .l-tag > select { max-width: 100%; }

        /* Label por campo — solo visible en mobile (card apilada) */
        .l-mob-label { display: none; }

        @media (max-width: 720px) {
          .pedido-linea-header { display: none !important; }
          .pedido-linea-row {
            grid-template-columns: 1fr 1fr 1fr !important;
            grid-template-areas:
              'desc desc remove'
              'cant costo precio' !important;
            padding: 14px !important;
            gap: 12px 8px !important;
            border: 1px solid var(--border) !important;
            border-radius: 14px !important;
            margin-bottom: 10px !important;
            box-shadow: 0 1px 2px rgba(15,23,42,.04) !important;
          }
          .pedido-linea-row.is-costos {
            grid-template-areas:
              'desc desc remove'
              'tag  costo costo' !important;
          }
          .pedido-linea-row:hover { background: var(--surface) !important; }
          .pedido-linea-row > .l-desc   { grid-area: desc; }
          .pedido-linea-row > .l-tag    { grid-area: tag; justify-content: flex-start !important; align-items: flex-start !important; }
          .pedido-linea-row > .l-cant   { grid-area: cant; }
          .pedido-linea-row > .l-costo  { grid-area: costo; }
          .pedido-linea-row > .l-precio { grid-area: precio; }
          .pedido-linea-row > .l-remove {
            grid-area: remove; justify-self: end; align-self: start; opacity: 1 !important;
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

// Barra de cierre — confirma que todo quedó guardado y ofrece "salir al tablero".
// El pedido ya se guarda solo; esto le da al usuario la certeza de haber terminado.
function FinalizarBar({ pedido, saving, lastSaved, onFinish }) {
  const ready = hasMinimum(pedido)
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
      padding: '14px 18px', marginTop: 2,
      background: ready ? 'linear-gradient(90deg, #f0fdf4 0%, #ecfdf5 100%)' : 'var(--surface2)',
      border: `1px solid ${ready ? '#bbf7d0' : 'var(--border)'}`, borderRadius: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 10, flexShrink: 0,
          background: ready ? '#16a34a' : 'var(--border2)', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15,
        }}>
          <i className={`fa ${saving ? 'fa-arrows-rotate fa-spin' : ready ? 'fa-check' : 'fa-pen'}`} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: ready ? '#065f46' : 'var(--txt2)' }}>
            {saving ? 'Guardando…' : ready ? 'Pedido guardado' : 'Falta cliente + una descripción'}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--txt3)', marginTop: 1 }}>
            {ready ? 'Se guarda solo con cada cambio. Podés cerrar tranquila.' : 'Con eso ya se empieza a guardar automáticamente.'}
          </div>
        </div>
      </div>
      <button onClick={onFinish} className="btn btn-primary"
        disabled={!lastSaved && !ready}
        style={{ flexShrink: 0, opacity: (!lastSaved && !ready) ? 0.5 : 1 }}>
        <i className="fa fa-check-double" /> Listo — ir al tablero
      </button>
    </div>
  )
}

function LineasSection({ meta, tags, lineas, products, onAdd, onChange, onRemove, onPickProduct, onCreatePreset, isCostos, totalLineas, extras, emptyHint }) {
  // Estado elevado: cuando cualquier fila abre su dropdown de catálogo, la
  // sección sube z-index para que no la tape la siguiente. Solución robusta
  // (el :focus-within CSS no alcanza por los stacking context de pgIn).
  const [dropdownOpen, setDropdownOpen] = useState(false)
  return (
    <section className="pedido-pane" style={{ position: 'relative', zIndex: dropdownOpen ? 200 : undefined }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <PaneHead meta={meta} />
        <button onClick={onAdd} className="btn btn-primary btn-sm" style={{ flexShrink: 0 }}>
          <i className="fa fa-plus" /> Agregar
        </button>
      </div>

      {extras}

      {lineas.length > 0 && (
        <div style={{ ...(isCostos ? gridCostos : gridProd), marginBottom: 6, fontSize: 10, fontWeight: 600, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.03em' }}
             className="pedido-linea-header">
          <span>Descripción</span>
          {isCostos ? (
            <>
              <span style={{ textAlign: 'center' }}>Tipo</span>
              <span style={{ textAlign: 'right' }}>Monto</span>
            </>
          ) : (
            <>
              <span style={{ textAlign: 'right' }}>Cant</span>
              <span style={{ textAlign: 'right' }}>Costo/u</span>
              <span style={{ textAlign: 'right' }}>Precio/u</span>
            </>
          )}
          <span />
        </div>
      )}

      {lineas.map(linea => (
        <LineaRow key={linea.id}
          linea={linea}
          products={products}
          tags={tags}
          isCostos={isCostos}
          onChange={patch => onChange(linea.id, patch)}
          onRemove={() => onRemove(linea.id)}
          canRemove={totalLineas > 1 || !!linea.descripcion}
          onPickProduct={onPickProduct}
          onCreatePreset={onCreatePreset}
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

function LineaRow({ linea, products, tags, isCostos, onChange, onRemove, canRemove, onPickProduct, onCreatePreset, onDropdownOpen }) {
  return (
    <div className={`pedido-linea-row ${isCostos ? 'is-costos' : ''}`} style={{ ...(isCostos ? gridCostos : gridProd), alignItems: 'center' }}>
      <div className="l-desc" style={{ minWidth: 0 }}>
        <span className="l-mob-label">Descripción</span>
        <DescripcionInput value={linea.descripcion} products={products}
          onChange={patch => onChange(patch)} onPick={onPickProduct}
          isCostos={isCostos} tag={linea.tag || 'producto'}
          onCreatePreset={onCreatePreset ? (name) => onCreatePreset(name, linea.tag, linea.costoUnit) : null}
          onDropdownOpen={onDropdownOpen} flat />
      </div>
      {isCostos ? (
        /* Costos operativos: Tipo + Monto (costo fijo, no se multiplica) */
        <>
        <div className="l-tag">
          <span className="l-mob-label">Tipo</span>
          <TagChip value={linea.tag || 'otro'} tags={tags}
            onChange={v => onChange({ tag: v })} mini />
        </div>
        <div className="l-costo">
          <span className="l-mob-label">Monto</span>
          <input className="pedido-cell-input" type="number" min={0} value={linea.costoUnit}
            onChange={e => onChange({ costoUnit: e.target.value === '' ? 0 : Number(e.target.value) })}
            placeholder="0" style={{ textAlign: 'right' }} />
        </div>
        </>
      ) : (
        <>
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
        </>
      )}

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
  const margenReal = totales.total > 0 ? Math.round((totales.ganancia / totales.total) * 100) : 0
  const margenBajo = totales.total > 0 && margenReal < (Number(totales.margen) || 0)
  const saldo = Math.max(0, totales.total - (pedido.seniaMonto || 0))
  const sg = { fontFamily: "'Space Grotesk','Inter',sans-serif", fontVariantNumeric: 'tabular-nums' }
  const rowStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', fontSize: 12.5 }
  const lbl = { color: 'rgba(255,255,255,.72)' }
  return (
    <div style={{ background: 'var(--panel-grad, linear-gradient(160deg,#1E1B4B 0%,#312E81 55%,#4C1D95 100%))', borderRadius: 16, padding: '18px 20px', color: '#fff', boxShadow: '0 12px 36px rgba(30,27,75,.28)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
        <i className="fa fa-receipt" style={{ color: '#c4b5fd' }} />
        <span style={{ fontWeight: 700, fontSize: 15, fontFamily: "'Space Grotesk','Inter',sans-serif" }}>Resumen</span>
      </div>

      {/* Costo real (interno, pre-margen) — destacado */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 11px', borderRadius: 10, background: 'rgba(251,191,36,.14)', border: '1px solid rgba(251,191,36,.3)', marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#FCD34D' }}><i className="fa fa-lock" style={{ marginRight: 6, fontSize: 10 }} />Costo real <span style={{ fontWeight: 500, opacity: .85 }}>(interno · pre-margen)</span></span>
        <b style={{ ...sg, fontSize: 14, color: '#FCD34D' }}>{fmt(totales.costoTotal)}</b>
      </div>

      {/* Ganancia */}
      <div style={rowStyle}>
        <span style={lbl}>Ganancia</span>
        <b style={{ ...sg, color: gananciaOk ? '#6ee7b7' : '#fca5a5' }}>{fmt(totales.ganancia)}</b>
      </div>

      {/* Margen objetivo (editable) */}
      <div style={rowStyle}>
        <span style={lbl}><i className="fa fa-bullseye" style={{ marginRight: 6, opacity: .7 }} />Margen objetivo</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input type="number" min={0} max={99} value={totales.margen} onChange={e => onMargenChange(e.target.value)}
            style={{ width: 54, textAlign: 'right', padding: '4px 8px', fontSize: 12.5, fontWeight: 700, borderRadius: 8, border: '1px solid rgba(255,255,255,.2)', background: 'rgba(255,255,255,.08)', color: '#fff', ...sg }} />
          <span style={{ color: 'rgba(255,255,255,.6)' }}>%</span>
        </span>
      </div>

      {/* Margen real */}
      <div style={rowStyle}>
        <span style={lbl}>Margen real</span>
        <b style={{ ...sg, color: margenBajo ? '#fca5a5' : '#6ee7b7' }}>{margenReal}%{margenBajo && <i className="fa fa-triangle-exclamation" style={{ marginLeft: 5, fontSize: 10 }} />}</b>
      </div>

      {/* IVA */}
      <label style={{ ...rowStyle, cursor: 'pointer' }}>
        <span style={lbl}><input type="checkbox" checked={pedido.aplicaIva} onChange={onIvaChange} style={{ marginRight: 7, verticalAlign: 'middle' }} />IVA 21%</span>
        <span style={{ ...sg, color: pedido.aplicaIva ? '#fff' : 'rgba(255,255,255,.5)' }}>{fmt(totales.iva)}</span>
      </label>

      {/* Total + saldo */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,.14)', marginTop: 10, paddingTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,.6)', fontWeight: 700, letterSpacing: '.06em' }}>TOTAL</div>
          {pedido.seniaMonto > 0 && <div style={{ fontSize: 11, color: 'rgba(255,255,255,.55)', marginTop: 2 }}>Seña {fmt(pedido.seniaMonto)} · Saldo {fmt(saldo)}</div>}
        </div>
        <input type="number" min={0} value={totales.total || ''} onChange={e => onTotalChange(e.target.value)}
          style={{ width: 150, textAlign: 'right', padding: '8px 12px', fontSize: 22, fontWeight: 700, borderRadius: 10, border: '1px solid rgba(196,181,253,.45)', background: 'rgba(255,255,255,.1)', color: '#fff', ...sg }} />
      </div>

      {/* Anticipo / Seña */}
      <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,.6)', marginBottom: 6, fontWeight: 700, letterSpacing: '.04em' }}>ANTICIPO / SEÑA</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="number" min={0} value={pedido.seniaMonto || ''} onChange={e => onSeniaChange(e.target.value)} placeholder="$0"
            style={{ flex: 1, minWidth: 0, padding: '8px 10px', fontSize: 12.5, fontWeight: 700, borderRadius: 8, border: '1px solid rgba(255,255,255,.2)', background: 'rgba(255,255,255,.08)', color: '#fff', ...sg }} />
          {totales.total > 0 && [30, 50, 100].map(pct => {
            const monto = Math.round(totales.total * pct / 100)
            const active = pedido.seniaMonto === monto
            return (
              <button key={pct} type="button" onClick={() => onSeniaChange(monto)}
                style={{ padding: '8px 11px', fontSize: 11, fontWeight: 700, borderRadius: 8, border: `1px solid ${active ? '#c4b5fd' : 'rgba(255,255,255,.2)'}`, background: active ? 'rgba(196,181,253,.28)' : 'rgba(255,255,255,.06)', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
                {pct}%
              </button>
            )
          })}
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

function DescripcionInput({ value, products, onChange, onPick, onCreatePreset, isCostos, onDropdownOpen, className, flat, tag }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const q = (value || '').toLowerCase().trim()
  // Solo sugerir del catálogo cuando la línea es "Producto" (o en Costos operativos).
  // Para Packaging / mano de obra / otros, la descripción es texto libre — no productos.
  const allowCatalog = isCostos || !tag || tag === 'producto'
  const matches = !allowCatalog ? []
    : q
    ? products.filter(p => (p.name || '').toLowerCase().includes(q)).slice(0, 8)
    : (isCostos ? products.slice(0, 8) : [])   // costos: mostrar tareas al enfocar
  // Ofrecer "guardar" cuando hay texto que no coincide exactamente con una tarea
  const exactMatch = q && products.some(p => (p.name || '').toLowerCase() === q)
  const canCreate = !!onCreatePreset && q.length > 1 && !exactMatch
  const showDropdown = open && (matches.length > 0 || canCreate)

  // Reporta al padre (LineasSection) cuando el dropdown está visible, para
  // que suba el z-index de la sección.
  useEffect(() => { onDropdownOpen?.(showDropdown) }, [showDropdown]) // eslint-disable-line

  const pick = (p) => {
    onChange({
      descripcion: p.name || '',
      costoUnit: Number(p.cost) || 0,
      precioUnit: Number(p.price) || 0,
      productoId: p.id,
      ...(isCostos && p.tag ? { tag: p.tag } : {}),
    })
    setOpen(false)
    if (onPick) onPick(p.name || (isCostos ? 'Tarea' : 'Producto'))
  }

  const create = () => {
    onCreatePreset?.(value)
    setOpen(false)
  }

  return (
    <div ref={ref} className={className} style={{ position: 'relative', minWidth: 0 }}>
      <input type="text" value={value}
        onChange={e => { onChange({ descripcion: e.target.value, productoId: null }); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder={flat ? (isCostos ? 'Tarea o costo' : 'Descripción') : 'Descripción — escribí para buscar en el catálogo'}
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
                {(p.cat || (isCostos && p.tag)) && <div style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 1 }}>{p.cat || TAG_LABELS[p.tag]}</div>}
              </div>
              <div style={{ fontSize: 11, color: 'var(--txt3)', flexShrink: 0, textAlign: 'right' }}>
                {Number(p.cost) > 0 && <div>Costo <b style={{ color: 'var(--txt)' }}>{fmt(Number(p.cost))}</b></div>}
                {Number(p.price) > 0 && <div>Precio <b style={{ color: '#16a34a' }}>{fmt(Number(p.price))}</b></div>}
              </div>
            </div>
          ))}
          {canCreate && (
            <div onClick={create}
              style={{ padding: '10px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, background: 'var(--brand-xlt)', color: 'var(--brand)', fontWeight: 700, fontSize: 12 }}
              onMouseEnter={e => e.currentTarget.style.filter = 'brightness(.97)'}
              onMouseLeave={e => e.currentTarget.style.filter = 'none'}>
              <i className="fa fa-bookmark" />
              Guardar "{value}" como tarea
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function PaneHead({ meta }) {
  return (
    <div className="pedido-pane-head">
      <div className="pedido-pane-ico"><i className={`fa ${meta.icon}`} /></div>
      <div className="pedido-pane-title">{meta.title}</div>
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
      {estadoOptions(value).map(k => <option key={k} value={k}>{ESTADO_LABELS[k] || k}</option>)}
    </select>
  )
}

function TagChip({ value, onChange, className, mini, tags }) {
  const st = TAG_COLOR[value] || TAG_COLOR.otro
  const options = tags || TAGS
  // Alineado al resto del form: usa el mismo campo rectangular (pedido-cell-input),
  // con el color del tipo como acento sutil en el texto + un puntito a la izquierda.
  return (
    <select className={`pedido-cell-input tag-select ${className || ''}`} value={value} onChange={e => onChange(e.target.value)}
      title="Tipo de línea"
      style={{ fontWeight: 600, color: 'var(--txt)', cursor: 'pointer', width: '100%', boxSizing: 'border-box' }}>
      {options.map(k => <option key={k} value={k} style={{ color: 'var(--txt)' }}>{TAG_LABELS[k]}</option>)}
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

// Productos: Descripción · Cant · Costo/u · Precio/u · (x)  — sin "Tipo" (packaging = producto del catálogo)
const gridProd = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 2.4fr) 64px 100px 100px 24px',
  gap: 8,
}
// Costos operativos: Descripción · Tipo · Monto · (x) — sin cant/precio/compra
const gridCostos = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 2.4fr) 128px 120px 24px',
  gap: 8,
}
