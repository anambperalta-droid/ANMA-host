/* ═══════════════════════════════════════════════════════════════════
   ANMA Regalos — Adaptador de Pedido v1  (Fase 1 rediseño)
   ─────────────────────────────────────────────────────────────────
   Convierte entre el modelo `budget` legacy y el modelo `pedido` nuevo.
   El storage sigue siendo `budgets[]` en localStorage — este módulo
   solo traduce en lectura/escritura.

   Contratos preservados por `budgetFromPedido()`:
     · Mensajes.jsx  → contact, company, total, items[].name, date, deliveryDate, id
     · Logistica.jsx → viajeId, logisticaParadas, comisionista, viajeFecha
═══════════════════════════════════════════════════════════════════ */

// ── Estados ────────────────────────────────────────────────────────

export const ESTADOS = [
  'consulta', 'presupuestado', 'pausado', 'confirmado',
  'produccion', 'entregado', 'cerrado', 'perdido',
]

export const ESTADO_LABELS = {
  consulta:      'Consulta',
  presupuestado: 'Presupuestado',
  pausado:       'Pausado',
  confirmado:    'Confirmado',
  produccion:    'En producción',
  entregado:     'Entregado',
  cerrado:       'Cerrado',
  perdido:       'Perdido',
}

// Lectura: budget.status → pedido.estado. Incluye legacy negotiating/lost.
const STATUS_TO_ESTADO = {
  draft:       'consulta',
  sent:        'presupuestado',
  confirmed:   'confirmado',
  inprogress:  'produccion',
  delivered:   'entregado',
  cancelled:   'cerrado',
  negotiating: 'presupuestado',
  lost:        'perdido',
}

// Escritura: pedido.estado → budget.status. Colapsan pausado/perdido.
// La distinción vive en el campo nuevo `estado`, que se persiste junto.
export const ESTADO_TO_STATUS = {
  consulta:      'draft',
  presupuestado: 'sent',
  pausado:       'sent',
  confirmado:    'confirmed',
  produccion:    'inprogress',
  entregado:     'delivered',
  cerrado:       'cancelled',
  perdido:       'cancelled',
}

export const TAGS = ['producto', 'packaging', 'manoDeObra', 'diseno', 'envio', 'otro']
export const TAG_LABELS = {
  producto:   'Producto',
  packaging:  'Packaging',
  manoDeObra: 'Mano de obra',
  diseno:     'Diseño',
  envio:      'Envío',
  otro:       'Otro',
}
export const ESTADOS_COMPRA = ['pendiente', 'pedido', 'recibido']

/**
 * Devuelve el estado nuevo de un budget legacy sin reconstruir todo el pedido.
 * Preferimos budget.estado (poblado por budgetFromPedido en pedidos nuevos);
 * si no existe, mapeamos desde budget.status (legacy).
 */
export function getEstado(budget) {
  if (!budget) return 'consulta'
  return budget.estado || STATUS_TO_ESTADO[budget.status] || 'consulta'
}

const num = (v) => { const n = Number(v); return isNaN(n) ? 0 : n }
const uid = () => Date.now() + Math.floor(Math.random() * 1000)

// ── Lectura: budget → pedido ───────────────────────────────────────

/**
 * Reconstruye un pedido desde un budget legacy.
 * Estrategia:
 *  1. Si tiene alternatives con una aprobada → sus kits son la fuente principal.
 *  2. Si tiene alternatives sin aprobada → toma la primera; resto van a pedido.alternativas.
 *  3. Si NO tiene alternatives pero sí simplePack/simplePers → aplana a lineas.
 *  4. Si tampoco tiene eso pero sí items[] (legacy más viejo) → reconstruye básico.
 */
export function pedidoFromBudget(budget) {
  if (!budget) return null

  const alts = Array.isArray(budget.alternatives) ? budget.alternatives : []
  const approvedIdx = alts.findIndex(a => a?.id === budget.approvedAltId || a?.approved)
  const principalAlt = approvedIdx > -1 ? alts[approvedIdx] : alts[0] || null

  let lineas = []
  let esKit = false
  let cantKits = 0

  if (principalAlt?.kits?.length) {
    // Modo kit: aplanamos kits + packaging + products + personalización.
    esKit = true
    cantKits = principalAlt.kits.reduce((s, k) => s + num(k.qty), 0)

    principalAlt.kits.forEach(kit => {
      const kitQty = num(kit.qty) || 1
      const kitName = kit.name || 'Kit'

      // Línea principal del kit — precio por unidad × cantidad
      if (num(kit.priceUnit) > 0 || num(kit.costUnit) > 0) {
        lineas.push({
          id: uid(),
          descripcion: kitName,
          tag: 'producto',
          cantidad: kitQty,
          costoUnit: num(kit.costUnit),
          precioUnit: num(kit.priceUnit),
          esCostoUnico: false,
          estadoCompra: 'pendiente',
        })
      }

      // Packaging del kit
      ;(kit.packaging || []).forEach(comp => {
        if (!comp.name && !comp.qty) return
        lineas.push({
          id: uid(),
          descripcion: `${kitName} · ${comp.name || 'packaging'}`,
          tag: 'packaging',
          cantidad: num(comp.qty) * kitQty,
          costoUnit: num(comp.costUnit),
          precioUnit: 0,
          esCostoUnico: false,
          productoId: comp.id || null,
          estadoCompra: 'pendiente',
        })
      })

      // Productos del kit
      ;(kit.products || []).forEach(comp => {
        if (!comp.name && !comp.qty) return
        lineas.push({
          id: uid(),
          descripcion: `${kitName} · ${comp.name || 'producto'}`,
          tag: 'producto',
          cantidad: num(comp.qty) * kitQty,
          costoUnit: num(comp.costUnit),
          precioUnit: 0,
          esCostoUnico: false,
          productoId: comp.id || null,
          estadoCompra: 'pendiente',
        })
      })

      // Personalización — costos únicos + costo unitario
      const pers = kit.personalizacion || {}
      if (num(pers.costUnit) > 0) {
        lineas.push({
          id: uid(),
          descripcion: `${kitName} · personalización ${pers.desc || ''}`.trim(),
          tag: 'diseno',
          cantidad: kitQty,
          costoUnit: num(pers.costUnit),
          precioUnit: 0,
          esCostoUnico: false,
          estadoCompra: 'pendiente',
        })
      }
      ;['designCost', 'laborCost', 'printCost'].forEach(k => {
        if (num(pers[k]) > 0) {
          lineas.push({
            id: uid(),
            descripcion: `${kitName} · ${k === 'designCost' ? 'diseño' : k === 'laborCost' ? 'mano de obra' : 'impresión'}`,
            tag: k === 'printCost' ? 'diseno' : (k === 'laborCost' ? 'manoDeObra' : 'diseno'),
            cantidad: 1,
            costoUnit: num(pers[k]),
            precioUnit: 0,
            esCostoUnico: true,
            estadoCompra: 'pendiente',
          })
        }
      })
    })
  } else if (Array.isArray(budget.simplePack) && budget.simplePack.length) {
    // Modo simple viejo — simplePack + simplePers
    budget.simplePack.forEach(comp => {
      if (!comp.name && !comp.qty) return
      lineas.push({
        id: uid(),
        descripcion: comp.name || 'ítem',
        tag: 'producto',
        cantidad: num(comp.qty),
        costoUnit: num(comp.costUnit),
        precioUnit: num(comp.priceUnit || comp.price || 0),
        esCostoUnico: false,
        productoId: comp.id || null,
        estadoCompra: 'pendiente',
      })
    })

    const pers = budget.simplePers || {}
    if (num(pers.costUnit) > 0) {
      lineas.push({
        id: uid(),
        descripcion: pers.desc || 'personalización',
        tag: 'diseno',
        cantidad: budget.simplePack.reduce((s, c) => s + num(c.qty), 0) || 1,
        costoUnit: num(pers.costUnit),
        precioUnit: 0,
        esCostoUnico: false,
        estadoCompra: 'pendiente',
      })
    }
    ;['designCost', 'laborCost', 'printCost'].forEach(k => {
      if (num(pers[k]) > 0) {
        lineas.push({
          id: uid(),
          descripcion: k === 'designCost' ? 'diseño' : k === 'laborCost' ? 'mano de obra' : 'impresión',
          tag: k === 'printCost' ? 'diseno' : (k === 'laborCost' ? 'manoDeObra' : 'diseno'),
          cantidad: 1,
          costoUnit: num(pers[k]),
          precioUnit: 0,
          esCostoUnico: true,
          estadoCompra: 'pendiente',
        })
      }
    })
  } else if (Array.isArray(budget.items) && budget.items.length) {
    // Legacy más viejo: solo items[]
    budget.items.forEach(it => {
      lineas.push({
        id: uid(),
        descripcion: it.name || it.desc || 'ítem',
        tag: 'producto',
        cantidad: num(it.qty) || 1,
        costoUnit: num(it.cost || it.costUnit),
        precioUnit: num(it.price || it.priceUnit),
        esCostoUnico: false,
        estadoCompra: 'pendiente',
      })
    })
  }

  // Otras alternativas (no principales) van al menú "⋯"
  const otherAlts = alts
    .filter((_, i) => i !== approvedIdx)
    .map(alt => ({
      id: alt.id || uid(),
      label: alt.label || 'Alternativa',
      aprobada: false,
      // Aplanado liviano — no reprocesamos personalizaciones acá, solo referencia
      lineasCount: (alt.kits || []).reduce((s, k) => s + 1 + (k.packaging?.length || 0) + (k.products?.length || 0), 0),
    }))

  // Estado: preferir `estado` nuevo si existe; si no, mapear desde `status`
  const estado = budget.estado
    || STATUS_TO_ESTADO[budget.status]
    || 'consulta'

  // Envío: si había shipCost, agregar como línea de envío
  if (num(budget.shipCost) > 0) {
    lineas.push({
      id: uid(),
      descripcion: budget.delivery || 'Envío',
      tag: 'envio',
      cantidad: 1,
      costoUnit: num(budget.shipCost),
      precioUnit: budget.shipCharged ? num(budget.shipCost) : 0,
      esCostoUnico: true,
      estadoCompra: 'pendiente',
    })
  }

  return {
    id:           budget.id,
    numero:       budget.num || '',
    createdAt:    budget.date || new Date(budget.updatedAt || Date.now()).toISOString().slice(0, 10),
    updatedAt:    budget.updatedAt || Date.now(),

    clienteId:    budget.clientId || null,
    clienteNombre: budget.company || budget.contact || '',
    // Preservamos también contact/company/wa/clientEmail crudos por si el UI nuevo los muestra
    contact:      budget.contact || '',
    company:      budget.company || '',
    wa:           budget.wa || '',
    clientEmail:  budget.clientEmail || '',
    ocasion:      budget.ocasion || '',

    estado,
    incompleto:   !!budget.incompleto,

    esKit,
    cantKits,

    lineas,

    precioFinalManual: num(budget.total) > 0 ? num(budget.total) : null,
    aplicaIva:    !!budget.aplicaIva,

    fechaEntrega:     budget.deliveryDate    || '',
    horarioEntrega:   budget.deliveryTime    || '',
    direccionEntrega: budget.deliveryAddress || '',
    contactoEntrega:  budget.deliveryContact || '',
    seniaMonto:       num(budget.depositAmt) || (num(budget.total) * num(budget.deposit) / 100) || 0,

    notaInterna:  budget.noteInt || '',

    alternativas: otherAlts,
    alternativaAprobadaId: principalAlt?.id || null,

    // Passthrough Logística — se preservan sin transformación
    viajeId:            budget.viajeId || null,
    logisticaParadas:   budget.logisticaParadas || [],
    comisionista:       budget.comisionista || '',
    viajeFecha:         budget.viajeFecha || '',
    logisticaCharged:   !!budget.logisticaCharged,

    payStatus:    budget.payStatus || 'pending',
    payments:     Array.isArray(budget.payments) ? budget.payments : [],
  }
}

// ── Escritura: pedido → budget ─────────────────────────────────────

/**
 * Proyecta un pedido al shape budget. Preserva:
 *   · Los campos que Mensajes.jsx lee (contact, company, total,
 *     items[].name, date, deliveryDate, id)
 *   · Los campos que Logistica.jsx lee (viajeId, logisticaParadas,
 *     comisionista, viajeFecha)
 *   · El shape mínimo (alternatives con al menos una alt + kits)
 *     para que el UI viejo pueda abrirlo sin romperse
 * Persiste también `estado` (nuevo) además de `status` (legacy).
 */
export function budgetFromPedido(pedido, prevBudget = {}) {
  if (!pedido) return null

  const totales = calcularTotales(pedido)
  const status = ESTADO_TO_STATUS[pedido.estado] || 'draft'

  // items[] — proyección plana para Mensajes.jsx
  const items = pedido.lineas
    .filter(l => l.descripcion && (l.tag === 'producto' || l.tag === 'packaging'))
    .map(l => ({
      name: l.descripcion,
      qty:  num(l.cantidad),
      cost: num(l.costoUnit),
      price: num(l.precioUnit),
    }))

  // alternatives[] — proyección mínima. Toda las líneas van a un solo kit
  // dentro de la alternativa aprobada. El UI nuevo lee de `lineas`; el viejo
  // (Historial, PDF si aún vive) lee de esta estructura.
  const singleKit = {
    id: 1,
    name: pedido.esKit ? 'Kit' : 'Pedido',
    qty:  pedido.esKit ? num(pedido.cantKits) || 1 : 1,
    priceUnit: 0,
    costUnit: 0,
    packaging: pedido.lineas
      .filter(l => l.tag === 'packaging' && l.descripcion)
      .map(l => ({
        id: l.productoId || null,
        name: l.descripcion,
        qty: num(l.cantidad),
        costUnit: num(l.costoUnit),
      })),
    products: pedido.lineas
      .filter(l => l.tag === 'producto' && l.descripcion)
      .map(l => ({
        id: l.productoId || null,
        name: l.descripcion,
        qty: num(l.cantidad),
        costUnit: num(l.costoUnit),
        priceUnit: num(l.precioUnit),
      })),
    personalizacion: { desc: '', costUnit: 0, designCost: 0, laborCost: 0, printCost: 0 },
  }

  const alternatives = [{
    id: pedido.alternativaAprobadaId || 1,
    label: 'Principal',
    approved: true,
    kits: [singleKit],
  }]

  return {
    // ── Identidad ──
    ...prevBudget,           // preserva num, id si existen
    id:        pedido.id ?? prevBudget.id,
    num:       pedido.numero || prevBudget.num,
    date:      pedido.createdAt || prevBudget.date || new Date().toISOString().slice(0, 10),
    updatedAt: Date.now(),

    // ── Estados: doble persistencia (legacy + nuevo) ──
    status,
    estado:    pedido.estado,
    payStatus: pedido.payStatus || 'pending',

    // ── Cliente (contrato Mensajes) ──
    clientId:    pedido.clienteId || null,
    contact:     pedido.contact || pedido.clienteNombre || '',
    company:     pedido.company || pedido.clienteNombre || '',
    wa:          pedido.wa || '',
    clientEmail: pedido.clientEmail || '',
    ocasion:     pedido.ocasion || '',

    // ── Contenido ──
    alternatives,
    approvedAltId: alternatives[0].id,
    items,                   // proyección para Mensajes
    // simplePack/simplePers no se pueblan en el modelo nuevo — el UI viejo
    // los lee solo si alternatives está vacío; con alternatives siempre poblado, no importa.

    // ── Precio ──
    total:      totales.total,
    totalFinal: totales.total,
    depositAmt: num(pedido.seniaMonto),
    deposit:    totales.total > 0 ? Math.round((num(pedido.seniaMonto) / totales.total) * 100) : 0,
    margin:     totales.margen,
    discount:   0,
    logoCost:   0,
    aplicaIva:  !!pedido.aplicaIva,

    // ── Entrega (contrato Mensajes) ──
    deliveryDate:    pedido.fechaEntrega     || '',
    deliveryTime:    pedido.horarioEntrega   || '',
    deliveryAddress: pedido.direccionEntrega || '',
    deliveryContact: pedido.contactoEntrega  || '',
    delivery:        prevBudget.delivery     || '',
    shipCost:     pedido.lineas.filter(l => l.tag === 'envio').reduce((s, l) => s + num(l.costoUnit), 0),
    shipCharged:  pedido.lineas.some(l => l.tag === 'envio' && num(l.precioUnit) > 0),
    envioACotizar: false,

    // ── Logística (contrato Logistica.jsx) ──
    viajeId:          pedido.viajeId || null,
    logisticaParadas: pedido.logisticaParadas || [],
    comisionista:     pedido.comisionista || '',
    viajeFecha:       pedido.viajeFecha || '',
    logisticaCharged: !!pedido.logisticaCharged,
    logisticaShowDetail: prevBudget.logisticaShowDetail || false,

    // ── Notas ──
    noteInt: pedido.notaInterna || '',
    noteCli: prevBudget.noteCli || '',

    // ── Flags nuevos ──
    incompleto: !!pedido.incompleto,

    // ── Legacy que ya no se calcula (queda ausente en pedidos nuevos) ──
    // stockDeducted: intencionalmente no seteado (undefined)
    // totalCost / totalGain: on-the-fly, no persistimos
    // payments: preservamos si existían
    payments: Array.isArray(pedido.payments) ? pedido.payments : (prevBudget.payments || []),
  }
}

// ── Cálculo de totales ─────────────────────────────────────────────

/**
 * Calcula subtotal, IVA, total, margen y ganancia a partir de las líneas.
 * Reglas:
 *  · Cada línea con precioUnit > 0 aporta al ingreso.
 *  · Cada línea aporta a costo total (costoUnit × cantidad, o solo costoUnit si esCostoUnico).
 *  · IVA se suma sobre el subtotal si aplicaIva.
 *  · Si precioFinalManual está seteado, ese es el total; el margen se recalcula.
 *  · Ganancia = total - costoTotal.
 *  · Margen (%) = ganancia / total * 100 (sobre precio, no sobre costo).
 */
export function calcularTotales(pedido, ivaRate = 0.21) {
  if (!pedido?.lineas?.length) {
    return { subtotal: 0, iva: 0, total: num(pedido?.precioFinalManual), costoTotal: 0, ganancia: 0, margen: 0 }
  }

  // En modo kit cada linea representa 1 componente por unidad de kit.
  // Se multiplica x cantKits salvo que sea costo unico (diseño, molde, etc).
  const multi = pedido.esKit && num(pedido.cantKits) > 0 ? num(pedido.cantKits) : 1

  const subtotal = pedido.lineas.reduce((s, l) => {
    const p = num(l.precioUnit)
    if (p <= 0) return s
    return s + (l.esCostoUnico ? p : p * num(l.cantidad) * multi)
  }, 0)

  const costoTotal = pedido.lineas.reduce((s, l) => {
    const c = num(l.costoUnit)
    if (c <= 0) return s
    return s + (l.esCostoUnico ? c : c * num(l.cantidad) * multi)
  }, 0)

  const ivaAmt = pedido.aplicaIva ? Math.round(subtotal * ivaRate) : 0
  const subtotalConIva = subtotal + ivaAmt

  const total = pedido.precioFinalManual != null && pedido.precioFinalManual > 0
    ? num(pedido.precioFinalManual)
    : subtotalConIva

  const ganancia = total - costoTotal
  const margen = total > 0 ? Math.round((ganancia / total) * 100) : 0

  return { subtotal, iva: ivaAmt, total, costoTotal, ganancia, margen }
}

/**
 * Dado un total objetivo, devuelve el margen implícito.
 * Útil para la edición bidireccional precio↔margen en la UI.
 */
export function margenDesdeTotal(pedido, totalObjetivo) {
  const { costoTotal } = calcularTotales(pedido)
  const t = num(totalObjetivo)
  if (t <= 0) return 0
  return Math.round(((t - costoTotal) / t) * 100)
}

/**
 * Dado un margen objetivo (%), devuelve el total implícito.
 */
export function totalDesdeMargen(pedido, margenObjetivo) {
  const { costoTotal } = calcularTotales(pedido)
  const m = Math.min(99, Math.max(0, num(margenObjetivo))) / 100
  if (m >= 1) return costoTotal * 100
  return costoTotal > 0 ? Math.round(costoTotal / (1 - m)) : 0
}

// ── Helpers de línea ───────────────────────────────────────────────

/**
 * Devuelve un snapshot del estado editable del pedido — lo que se guarda
 * como alternativa. NO incluye alternativas ni metadatos de identidad
 * (num, cliente, entrega) — solo el contenido comparable.
 */
export function snapshotAlt(pedido, label) {
  return {
    id: Date.now() + Math.floor(Math.random() * 1000),
    label: label || `Alternativa ${Date.now() % 10000}`,
    aprobada: false,
    esKit: !!pedido.esKit,
    cantKits: num(pedido.cantKits),
    aplicaIva: !!pedido.aplicaIva,
    precioFinalManual: pedido.precioFinalManual ?? null,
    seniaMonto: num(pedido.seniaMonto),
    // Copiamos las líneas con IDs nuevos para que no colisionen si el user
    // carga la alt en el editor y edita ambas.
    lineas: (pedido.lineas || []).map(l => ({ ...l, id: Date.now() + Math.floor(Math.random() * 1e6) })),
  }
}

/**
 * Aplica un snapshot de alternativa sobre el pedido — reemplaza el
 * contenido editable pero preserva la identidad (id, num, cliente,
 * fecha, notas, entrega, logística, estado).
 */
export function aplicarAlt(pedido, alt) {
  if (!alt) return pedido
  return {
    ...pedido,
    esKit: !!alt.esKit,
    cantKits: num(alt.cantKits),
    aplicaIva: !!alt.aplicaIva,
    precioFinalManual: alt.precioFinalManual ?? null,
    seniaMonto: num(alt.seniaMonto),
    lineas: (alt.lineas || []).map(l => ({ ...l, id: Date.now() + Math.floor(Math.random() * 1e6) })),
  }
}

export function nuevaLinea(overrides = {}) {
  return {
    id: uid(),
    descripcion: '',
    tag: 'producto',
    cantidad: 1,
    costoUnit: 0,
    precioUnit: 0,
    esCostoUnico: false,
    estadoCompra: 'pendiente',
    ...overrides,
  }
}

export function pedidoVacio(overrides = {}) {
  return {
    id: null,
    numero: '',
    createdAt: new Date().toISOString().slice(0, 10),
    updatedAt: Date.now(),
    clienteId: null,
    clienteNombre: '',
    contact: '', company: '', wa: '', clientEmail: '', ocasion: '',
    estado: 'consulta',
    incompleto: true,
    esKit: false,
    cantKits: 0,
    lineas: [nuevaLinea()],
    precioFinalManual: null,
    aplicaIva: false,
    fechaEntrega: '',
    horarioEntrega: '',
    direccionEntrega: '',
    contactoEntrega: '',
    seniaMonto: 0,
    notaInterna: '',
    alternativas: [],
    alternativaAprobadaId: null,
    viajeId: null, logisticaParadas: [], comisionista: '', viajeFecha: '', logisticaCharged: false,
    payStatus: 'pending',
    payments: [],
    ...overrides,
  }
}
