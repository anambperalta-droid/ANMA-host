import { fmt, fmtDate } from './storage'

/**
 * buildWAMsg(b) — Genera un mensaje de WhatsApp contextual según el estado
 * de un presupuesto/pedido. Nunca devuelve "{{var}}" literales.
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
export function buildWAMsg(b) {
  const nombre = b.contact || ''
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

  // 1) Entregado + pagado completo → agradecimiento post-venta
  if (status === 'delivered' && pay === 'paid' && !sinComprobante) {
    return [
      `Hola ${nombre}!`,
      ``,
      `Esperamos que el pedido${empresa} haya quedado buenísimo. Cualquier devolución, feedback o próximo armado, nos escribís al toque.`,
      ``,
      `¡Gracias por elegirnos!`,
    ].join('\n')
  }

  // 2) Pagado pero sin comprobante registrado → pedir comprobante
  if (sinComprobante) {
    return [
      `Hola ${nombre}!`,
      ``,
      `Tenemos registrado el pago del pedido${num}${monto ? ` por ${monto}` : ''}, pero nos falta el comprobante para dejarlo cerrado.`,
      ``,
      `¿Nos lo podés mandar por acá? Mil gracias.`,
    ].join('\n')
  }

  // 3) Entregado con saldo pendiente → recordatorio de cobro
  if (status === 'delivered' && (pay === 'pending' || pay === 'partial')) {
    const amt = saldo > 0 ? fmt(saldo) : monto
    const linea2 = vencido
      ? `El pedido${num}${empresa} fue entregado el ${deliveryStr} y queda pendiente el saldo de ${amt} (${diasVencido} día${diasVencido !== 1 ? 's' : ''} de atraso).`
      : `Queda pendiente el saldo de ${amt} del pedido${num}${empresa}${deliveryStr ? ` entregado el ${deliveryStr}` : ''}.`
    return [
      `Hola ${nombre}!`,
      ``,
      linea2,
      ``,
      `Si necesitás los datos bancarios o preferís link de pago, decime y te paso al toque. ¡Gracias!`,
    ].join('\n')
  }

  // 4) En producción → aviso de progreso + fecha estimada
  if (status === 'production' || status === 'En producción' || status === 'inprogress' || status === 'En preparación') {
    return [
      `Hola ${nombre}!`,
      ``,
      `Te cuento que el pedido${num}${empresa} está en producción.${deliveryStr ? ` Fecha estimada de entrega: ${deliveryStr}.` : ''}`,
      ``,
      `Te aviso cuando esté listo para despachar. Cualquier consulta, me escribís.`,
    ].join('\n')
  }

  // 5) Confirmado sin seña → pedir seña para arrancar producción
  if (status === 'confirmed' && pay === 'pending') {
    const linea2 = deliveryStr && dd !== null && dd > 0
      ? `Para llegar al ${deliveryStr} tranquilos, lo ideal es cerrar la seña esta semana.`
      : `Para arrancar producción necesitaríamos cerrar la seña.`
    return [
      `Hola ${nombre}!`,
      ``,
      `Quedó confirmado el pedido${num}${empresa}${monto ? ` (${monto})` : ''}. ${linea2}`,
      ``,
      `Te paso los datos bancarios o te mando link de pago, lo que prefieras.`,
    ].join('\n')
  }

  // 6) Confirmado con seña parcial → avisar que arrancamos + resta saldo
  if (status === 'confirmed' && pay === 'partial') {
    const amt = saldo > 0 ? fmt(saldo) : monto
    return [
      `Hola ${nombre}!`,
      ``,
      `Confirmamos la seña del pedido${num}${empresa}. ¡Ya arrancamos!`,
      ``,
      `El saldo pendiente es de ${amt}${deliveryStr ? ` y lo coordinamos para la entrega del ${deliveryStr}` : ''}. Cualquier cosa me escribís.`,
    ].join('\n')
  }

  // 7) Default (sent/draft) → recontacto comercial
  const lines = [
    `Hola ${nombre}! ¿Cómo estás?`,
    ``,
    `Te escribo por el presupuesto${num}${monto ? ` (${monto})` : ''}${b.date ? ` que te pasamos el ${fmtDate(b.date)}` : ''}.`,
    `¿Pudiste verlo? Si querés ajustar algo —cantidades, opciones o presupuesto— lo vemos sin problema.`,
  ]
  if (deliveryStr && dd !== null && dd > 0) {
    lines.push('', `Para llegar a la entrega del ${deliveryStr} lo ideal sería confirmar esta semana. ¿Avanzamos?`)
  } else {
    lines.push('', `¿Avanzamos?`)
  }
  return lines.join('\n')
}

/**
 * openWAFor(b) — Abre WhatsApp con el mensaje contextual.
 * Fallback a window.location si popups están bloqueados.
 * Si no hay número cargado, abre WA en vacío con mensaje precargado.
 */
export function openWAFor(b, { onNoNumber } = {}) {
  const text = buildWAMsg(b)
  const num = (b.wa || '').replace(/\D/g, '')
  const encoded = encodeURIComponent(text)
  const url = num ? `https://wa.me/${num}?text=${encoded}` : `https://wa.me/?text=${encoded}`
  const w = window.open(url, '_blank')
  if (!w) { window.location.href = url; return }
  if (!num && typeof onNoNumber === 'function') onNoNumber(b)
}
