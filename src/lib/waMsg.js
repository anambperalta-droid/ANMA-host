import { fmt, fmtDate } from './storage'

/**
 * Firma de cierre por rubro — personalidad de marca ligera + override manual.
 * cfg.waSignoff > RUBRO_SIGNOFF[cfg.rubro] > default.
 */
export const RUBRO_SIGNOFF = {
  indumentaria: (neg) => `¡Un beso! · ${neg || 'Equipo ANMA'}`,
  tecnologia:   (neg) => `Saludos,\n${neg || 'ANMA'}`,
  decoracion:   (neg) => `¡Gracias!\nEquipo ${neg || 'ANMA'}`,
  almacen:      (neg) => `¡Abrazo! · ${neg || 'ANMA'}`,
  gastronomia:  (neg) => `¡Gracias! · ${neg || 'ANMA'}`,
  servicios:    (neg) => `Saludos cordiales,\n${neg || 'ANMA'}`,
  default:      (neg) => `¡Saludos!\n${neg || 'ANMA'}`,
}

function pickSignoff(cfg) {
  if (!cfg) return null
  if (typeof cfg.waSignoff === 'string' && cfg.waSignoff.trim()) return cfg.waSignoff.trim()
  const neg = cfg.businessName || ''
  const builder = RUBRO_SIGNOFF[cfg.rubro] || RUBRO_SIGNOFF.default
  return builder(neg)
}

/**
 * buildWAMsg(b, { cfg } = {}) — Genera un mensaje de WhatsApp contextual según
 * el estado de un presupuesto/pedido. Nunca devuelve "{{var}}" literales.
 *
 * Rutea por combinación status + payStatus:
 *   delivered + paid                       → agradecimiento post-venta
 *   paid con needsReceipt                  → pedir comprobante
 *   delivered + pending/partial            → recordatorio de cobro (con días de atraso si aplica)
 *   production/inprogress                  → aviso de progreso + fecha estimada
 *   confirmed + pending                    → pedir seña para arrancar
 *   confirmed + partial                    → avisar producción + resta saldo
 *   draft/sent (default)                   → recontacto comercial
 *
 * Se usa desde Historial, Ventas y cualquier botón contextual WA de pedido.
 */
export function buildWAMsg(b, { cfg } = {}) {
  const nombre = b.contact || ''
  const signoff = pickSignoff(cfg)
  const withSignoff = (lines) => signoff ? [...lines, '', signoff].join('\n') : lines.join('\n')
  const empresa = b.company ? ` para ${b.company}` : ''
  const monto = b.total ? fmt(b.total) : ''
  // Nota: no incluimos el número interno de presupuesto (ej. P-0018) en el
  // mensaje al cliente — no le aporta nada. Lo identificamos por el monto
  // y la fecha, que para el cliente sí es claro.
  const num = ''
  const deliveryISO = b.deliveryDate
  const deliveryStr = deliveryISO ? fmtDate(deliveryISO) : ''
  const senia = Number(b.depositAmt) || 0
  const total = Number(b.total) || 0
  const saldo = Math.max(0, total - senia)
  const dd = deliveryISO
    ? Math.ceil((new Date(deliveryISO + 'T00:00') - new Date()) / 86400000)
    : null
  const vencido = dd !== null && dd < 0
  const diasVencido = vencido ? Math.abs(dd) : 0
  const sinComprobante = b.payStatus === 'paid' && b.needsReceipt === true
  const status = b.status || 'draft'
  const pay = b.payStatus || 'pending'

  if (status === 'delivered' && pay === 'paid' && !sinComprobante) {
    return withSignoff([`Hola ${nombre}!`, ``, `Esperamos que el pedido${empresa} haya quedado buenísimo. Cualquier devolución, feedback o próximo armado, nos escribís al toque.`, ``, `¡Gracias por elegirnos!`])
  }
  if (sinComprobante) {
    return withSignoff([`Hola ${nombre}!`, ``, `Tenemos registrado el pago del pedido${num}${monto ? ` por ${monto}` : ''}, pero nos falta el comprobante para dejarlo cerrado.`, ``, `¿Nos lo podés mandar por acá? Mil gracias.`])
  }
  if (status === 'delivered' && (pay === 'pending' || pay === 'partial')) {
    const amt = saldo > 0 ? fmt(saldo) : monto
    const linea2 = vencido
      ? `El pedido${num}${empresa} fue entregado el ${deliveryStr} y queda pendiente el saldo de ${amt} (${diasVencido} día${diasVencido !== 1 ? 's' : ''} de atraso).`
      : `Queda pendiente el saldo de ${amt} del pedido${num}${empresa}${deliveryStr ? ` entregado el ${deliveryStr}` : ''}.`
    return withSignoff([`Hola ${nombre}!`, ``, linea2, ``, `Si necesitás los datos bancarios o preferís link de pago, decime y te paso al toque. ¡Gracias!`])
  }
  if (status === 'production' || status === 'En producción' || status === 'inprogress' || status === 'En preparación') {
    return withSignoff([`Hola ${nombre}!`, ``, `Te cuento que el pedido${num}${empresa} está en producción.${deliveryStr ? ` Fecha estimada de entrega: ${deliveryStr}.` : ''}`, ``, `Te aviso cuando esté listo para despachar. Cualquier consulta, me escribís.`])
  }
  if (status === 'confirmed' && pay === 'pending') {
    const linea2 = deliveryStr && dd !== null && dd > 0
      ? `Para llegar al ${deliveryStr} tranquilos, lo ideal es cerrar la seña esta semana.`
      : `Para arrancar producción necesitaríamos cerrar la seña.`
    return withSignoff([`Hola ${nombre}!`, ``, `Quedó confirmado el pedido${num}${empresa}${monto ? ` (${monto})` : ''}. ${linea2}`, ``, `Te paso los datos bancarios o te mando link de pago, lo que prefieras.`])
  }
  if (status === 'confirmed' && pay === 'partial') {
    const amt = saldo > 0 ? fmt(saldo) : monto
    return withSignoff([`Hola ${nombre}!`, ``, `Confirmamos la seña del pedido${num}${empresa}. ¡Ya arrancamos!`, ``, `El saldo pendiente es de ${amt}${deliveryStr ? ` y lo coordinamos para la entrega del ${deliveryStr}` : ''}. Cualquier cosa me escribís.`])
  }
  const lines = [`Hola ${nombre}! ¿Cómo estás?`, ``, `Te escribo por el presupuesto${num}${monto ? ` (${monto})` : ''}${b.date ? ` que te pasamos el ${fmtDate(b.date)}` : ''}.`, `¿Pudiste verlo? Si querés ajustar algo —cantidades, opciones o presupuesto— lo vemos sin problema.`]
  if (deliveryStr && dd !== null && dd > 0) lines.push('', `Para llegar a la entrega del ${deliveryStr} lo ideal sería confirmar esta semana. ¿Avanzamos?`)
  else lines.push('', `¿Avanzamos?`)
  return withSignoff(lines)
}

/**
 * openWAFor(b) — Abre WhatsApp con el mensaje contextual.
 * Fallback a window.location si popups están bloqueados.
 * Si no hay número cargado, abre WA en vacío con mensaje precargado.
 * `onSent(b)` se dispara después de abrir WA — útil para registrar
 * lastContactAt en el budget sin acoplar la lib a DataContext.
 */
export function openWAFor(b, { onNoNumber, onSent, cfg } = {}) {
  const text = buildWAMsg(b, { cfg })
  const num = (b.wa || '').replace(/\D/g, '')
  const encoded = encodeURIComponent(text)
  const url = num ? `https://wa.me/${num}?text=${encoded}` : `https://wa.me/?text=${encoded}`
  const w = window.open(url, '_blank')
  if (!w) { window.location.href = url }
  if (!num && typeof onNoNumber === 'function') onNoNumber(b)
  if (typeof onSent === 'function') onSent(b)
}

/**
 * buildClientePortalLink(b, cfg) — Genera link público /portal-cliente?d=BASE64
 * con un payload compacto (keys cortas) para que la URL no sea gigante.
 * Expira a los 60 días. Backward-compatible con el patrón del PortalProveedor.
 */
export function buildClientePortalLink(b, cfg = {}) {
  // Precio unitario con múltiples fallbacks: pu, price, unitPrice, precio.
  // Si no hay ninguno pero el item trae su subtotal/total, lo derivamos de qty.
  const items = (Array.isArray(b.items) ? b.items : []).map(i => {
    const qty = Number(i.qty ?? i.cantidad ?? 1) || 0
    // priceUnit = Hub. precioUnit = Regalos (schema actual). Resto = legacy/edge.
    const puRaw = Number(i.priceUnit ?? i.precioUnit ?? i.pu ?? i.price ?? i.unitPrice ?? i.precio ?? 0)
    const sub = Number(i.subtotal ?? i.total ?? 0)
    const pu = puRaw > 0 ? puRaw : (qty > 0 && sub > 0 ? Math.round(sub / qty) : 0)
    return { n: String(i.name || '').slice(0, 60), q: qty, pu }
  })
  // Saldo honesto según payStatus — un pedido 'paid' NO tiene saldo pendiente.
  const total = Number(b.total) || 0
  const depAmt = Number(b.depositAmt) || 0
  const pay = b.payStatus || 'pending'
  const seniaReal = pay === 'paid' ? total : (pay === 'partial' ? depAmt : 0)
  // Logo: solo si ≤8KB; fallback a iniciales en el portal (Linear/Slack-style).
  const logoRaw = cfg.logo || cfg.logoDataUrl || ''
  const lg = (typeof logoRaw === 'string' && logoRaw.length <= 8192) ? logoRaw : ''
  const payload = {
    nm: b.num || '',      // número del pedido (P-NNNN) — para mensajes contextuales en el portal
    n: b.contact || '',
    co: b.company || '',
    neg: cfg.businessName || 'ANMA',
    lg,
    it: items,
    t: total,
    s: seniaReal,
    d: b.deliveryDate || null,
    st: b.status || 'draft',
    ps: pay,
    wa: cfg.ownerWa || cfg.wa || '',
    cbu: cfg.cbu || '',
    al: cfg.alias || '',
    tit: cfg.titular || '',
    mp: cfg.linkPago || cfg.mpLink || '',
    e: Date.now() + 60 * 86400000, // 60 días
  }
  const json = JSON.stringify(payload)
  // base64 URL-safe (igual que PortalProveedor)
  const b64 = btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  // En Hub el app está bajo /app; portal es público bajo /portal-cliente
  const base = typeof window !== 'undefined' && window.location.pathname.startsWith('/app')
    ? origin + '/app/portal-cliente'
    : origin + '/portal-cliente'
  return `${base}?d=${b64}`
}

/**
 * sharePortalCliente(b, cfg, { toast }) — genera el link, copia al clipboard
 * y abre WhatsApp con un mensaje corto + el link. Si no hay número, abre WA
 * en vacío para que el usuario elija contacto.
 */
export function sharePortalCliente(b, cfg = {}, { toast } = {}) {
  const link = buildClientePortalLink(b, cfg)
  try { navigator.clipboard?.writeText(link) } catch { /* ignore */ }
  const nombre = b.contact || ''
  const neg = cfg.businessName || 'nosotros'
  const text = [
    `Hola ${nombre}!`,
    ``,
    `Te comparto el estado de tu pedido con ${neg}. Lo podés abrir desde este link (se actualiza solo):`,
    link,
  ].join('\n')
  const num = (b.wa || '').replace(/\D/g, '')
  const encoded = encodeURIComponent(text)
  const url = num ? `https://wa.me/${num}?text=${encoded}` : `https://wa.me/?text=${encoded}`
  const w = window.open(url, '_blank')
  if (!w) { window.location.href = url }
  if (typeof toast === 'function') toast('Link del cliente copiado al portapapeles', 'ok')
  return link
}

/**
 * decodeClientePortal(d) — Decodifica el payload desde ?d=BASE64.
 * Devuelve null si no es válido o venció.
 */
export function decodeClientePortal(d) {
  try {
    const b64 = d.replace(/-/g, '+').replace(/_/g, '/')
    const json = decodeURIComponent(escape(atob(b64)))
    const raw = JSON.parse(json)
    if (raw.e && Date.now() > raw.e) return { expired: true }
    return raw
  } catch {
    return null
  }
}

/**
 * relTimeShort(ts) — "hace 2d" / "hace 3h" / "hace 5min" / "ahora".
 * Usado para mostrar "Último contacto" en el drawer / tabla sin ocupar espacio.
 */
export function relTimeShort(ts) {
  if (!ts) return ''
  const diff = Date.now() - Number(ts)
  if (diff < 0) return ''
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min}min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h}h`
  const d = Math.floor(h / 24)
  if (d < 30) return `hace ${d}d`
  const mo = Math.floor(d / 30)
  return `hace ${mo}m`
}
