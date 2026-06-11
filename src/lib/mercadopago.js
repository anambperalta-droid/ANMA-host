import { cfg, fmt } from './storage'

export function getMPConfig() {
  const c = cfg()
  return {
    enabled: c.mpEnabled !== false && !!c.mpToken,
    token: c.mpToken || '',
    pubkey: c.mpPubkey || '',
    name: c.mpName || c.businessName || 'ANMA',
    currency: c.mpCurrency || 'ARS',
    useSena: c.mpUseSena || false,
  }
}

export function getBankConfig() {
  const c = cfg()
  return {
    enabled: c.bankEnabled === true || !!(c.bankAlias || c.bankCbu),
    holder: c.bankHolder || '',
    bankName: c.bankName || '',
    accountType: c.bankAccountType || 'Cuenta corriente',
    cbu: c.bankCbu || '',
    alias: c.bankAlias || '',
    cuit: c.bankCuit || '',
    notes: c.bankNotes || '',
  }
}

export function buildBankInfoText(bank, businessName = '') {
  const lines = []
  if (businessName) lines.push(`*Datos para transferencia — ${businessName}*`)
  else lines.push('*Datos para transferencia*')
  if (bank.holder) lines.push(`*Titular:* ${bank.holder}`)
  if (bank.bankName) lines.push(`*Banco:* ${bank.bankName}`)
  if (bank.accountType) lines.push(`*Tipo:* ${bank.accountType}`)
  if (bank.cbu) lines.push(`*CBU:* ${bank.cbu}`)
  if (bank.alias) lines.push(`*Alias:* ${bank.alias}`)
  if (bank.cuit) lines.push(`*CUIT/CUIL:* ${bank.cuit}`)
  if (bank.notes) lines.push(`\n${bank.notes}`)
  return lines.join('\n')
}

/**
 * Llamadas a MP vía /api/mp-proxy (serverless de Vercel).
 * La API de MP responde 401 al preflight CORS, así que el browser bloquea
 * SIEMPRE las llamadas directas con Bearer — hay que pasar por el server.
 * Timeout de 15s para nunca dejar la UI colgada.
 */
async function mpProxy(payload) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 15000)
  try {
    const resp = await fetch('/api/mp-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    })
    const data = await resp.json().catch(() => ({}))
    return { status: resp.status, data }
  } finally {
    clearTimeout(timer)
  }
}

export async function testMPConnection(token) {
  try {
    const { status, data } = await mpProxy({ action: 'test', token })
    if (status === 200 && data.ok) return { ok: true, count: data.count }
    return { ok: false, message: data.message || 'Token inválido' }
  } catch (e) {
    return {
      ok: false,
      message: e?.name === 'AbortError'
        ? 'Mercado Pago no respondió (timeout). Probá de nuevo en un momento.'
        : 'No se pudo conectar. Verificá tu internet y reintentá.',
    }
  }
}

export async function createPaymentLink({ budget, mp, depositPct }) {
  const items = budget.items || []
  let totalRev = 0
  items.forEach((i) => { totalRev += i.qty * i.priceUnit })
  // Total final: si el caller pasa budget.total (calculado con descuento e IVA),
  // se usa ese — el link de MP debe cobrar EXACTAMENTE lo que dice el presupuesto.
  // Fallback legacy: qty × precio + envío (sin descuento ni IVA).
  const totalFinal = Number(budget.total) > 0 ? Math.round(Number(budget.total)) : totalRev + (budget.shipCost || 0)
  const amount = mp.useSena ? Math.round(totalFinal * depositPct / 100) : totalFinal
  const amountLabel = mp.useSena
    ? `Seña (${depositPct}%) — ${budget.num}`
    : `Total — ${budget.num}`

  const preference = {
    items: [{
      title: `${mp.name} — ${amountLabel}`,
      description: `${budget.num} para ${budget.company || budget.contact}. ${items.map((i) => i.qty + 'x ' + i.name).join(', ')}`,
      quantity: 1,
      unit_price: amount,
      currency_id: mp.currency,
    }],
    payer: { name: budget.contact || '', surname: budget.company || '' },
    external_reference: budget.num,
    statement_descriptor: mp.name.slice(0, 22),
    // back_urls es OBLIGATORIO cuando se usa auto_return — sin esto la API
    // devuelve 400 "auto_return invalid" y el link nunca se crea.
    // ctx=presupuesto → PagoResultado muestra la variante para el cliente final
    back_urls: {
      success: window.location.origin + '/pago-exitoso?ctx=presupuesto',
      pending: window.location.origin + '/pago-pendiente?ctx=presupuesto',
      failure: window.location.origin + '/pago-error?ctx=presupuesto',
    },
    auto_return: 'approved',
    expires: true,
    expiration_date_to: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
  }

  try {
    const { status, data } = await mpProxy({ action: 'preference', token: mp.token, preference })
    if (status === 200 && data.ok && data.link) {
      return { ok: true, link: data.link, amount, amountLabel }
    }
    return { ok: false, message: data.message || 'Error al crear link' }
  } catch (e) {
    return {
      ok: false,
      message: e?.name === 'AbortError'
        ? 'Mercado Pago no respondió (timeout). Probá de nuevo en un momento.'
        : 'No se pudo conectar. Verificá tu internet y reintentá.',
    }
  }
}
