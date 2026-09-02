/**
 * ANMA Regalos — Datos bancarios de ANMA para cobrar la SUSCRIPCIÓN por
 * transferencia (sin comisión de Mercado Pago).
 *
 * ⚠️ IMPORTANTE: estos son los datos de ANMA (Ana) donde el CLIENTE deposita
 * la cuota/onboarding. NO confundir con getBankConfig() de mercadopago.js, que
 * son los datos de la TIENDA para cobrarle a SUS propios clientes.
 *
 * 👉 Para actualizar los datos, editá SOLO los valores de abajo.
 */

export const ANMA_BANK = {
  // Nombre del titular de la cuenta (como figura en el banco)
  holder: 'Ana María Peralta Bordón',
  // Banco
  bankName: 'Banco Galicia',
  // Tipo de cuenta
  accountType: 'Caja de ahorro',
  // CBU (22 dígitos) — el dato principal para transferir
  cbu: '0070378730004005401111',
  // Alias (más fácil de copiar para el cliente)
  alias: 'ANA.MPERALTA',
  // CUIT / CUIL del titular
  cuit: '23-35567234-4',
  // WhatsApp de ANMA (solo dígitos, con código país) para el aviso "Ya transferí"
  whatsapp: '5491169456863',
}

/** ¿Están cargados los datos mínimos para mostrar la opción de transferencia? */
export function anmaBankReady(b = ANMA_BANK) {
  const filled = (v) => v && !String(v).startsWith('COMPLETAR')
  // Alcanza con alias O cbu para poder transferir
  return filled(b.holder) && (filled(b.alias) || filled(b.cbu))
}

/** Texto plano para copiar / mandar por WhatsApp con los datos de transferencia. */
export function anmaBankText(b = ANMA_BANK) {
  const lines = ['Datos para transferencia — ANMA']
  const push = (label, v) => { if (v && !String(v).startsWith('COMPLETAR')) lines.push(`${label}: ${v}`) }
  push('Titular', b.holder)
  push('Banco', b.bankName)
  push('Tipo', b.accountType)
  push('CBU', b.cbu)
  push('Alias', b.alias)
  push('CUIT/CUIL', b.cuit)
  return lines.join('\n')
}
