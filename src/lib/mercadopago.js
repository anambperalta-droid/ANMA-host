import { cfg, fmt } from './storage'

export function getMPConfig() {
  const c = cfg()
  return {
    token: c.mpToken || '',
    pubkey: c.mpPubkey || '',
    name: c.mpName || c.businessName || 'ANMA',
    currency: c.mpCurrency || 'ARS',
    useSena: c.mpUseSena || false,
  }
}

export async function testMPConnection(token) {
  const resp = await fetch('https://api.mercadopago.com/v1/payment_methods', {
    headers: { Authorization: 'Bearer ' + token },
  })
  if (resp.ok) {
    const data = await resp.json()
    return { ok: true, count: data.length }
  }
  const err = await resp.json().catch(() => ({}))
  return { ok: false, status: resp.status, message: err.message || 'Token inválido' }
}

export async function createPaymentLink({ budget, mp, depositPct }) {
  const items = budget.items || []
  let totalRev = 0
  items.forEach((i) => { totalRev += i.qty * i.priceUnit })
  const totalFinal = totalRev + (budget.shipCost || 0)
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
    auto_return: 'approved',
    expires: true,
    expiration_date_to: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
  }

  const resp = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + mp.token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(preference),
  })

  if (resp.ok) {
    const data = await resp.json()
    const link = data.init_point || data.sandbox_init_point || ''
    return { ok: true, link, amount, amountLabel }
  }

  const err = await resp.json().catch(() => ({}))
  return { ok: false, status: resp.status, message: err.message || 'Error al crear link' }
}
