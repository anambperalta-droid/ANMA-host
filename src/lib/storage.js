/* ═══════════════════════════════════════
   ANMA Regalos — Storage Layer v4
   Modelo: Presupuestos / Clientes / Catálogo
   Datos aislados por usuario (userId)
═══════════════════════════════════════ */
const BASE = 'anma3_'

// userId se setea al loguearse (ver AuthContext)
let _userId = null

export function setStorageUser(userId) {
  _userId = userId || null
}

function K() {
  return _userId ? `${BASE}u_${_userId}_` : `${BASE}`
}

export function db(key, fallback = []) {
  try {
    return JSON.parse(localStorage.getItem(K() + key)) ?? fallback
  } catch {
    return fallback
  }
}

export function dbW(key, value) {
  localStorage.setItem(K() + key, JSON.stringify(value))
}

export function cfg() {
  return db('cfg', {})
}

export function wCfg(patch) {
  dbW('cfg', { ...cfg(), ...patch })
}

export const DEFAULTS = {
  businessName: 'ANMA',
  subtitle: 'Tu negocio en un solo lugar',
  currency: '$',
  defaultMargin: 40,
  defaultDeposit: 50,
  validity: 15,
  budgetPrefix: 'AN',
  nextNum: 1,
  paymentConditions: '50% seña al confirmar, saldo contra entrega.',
  legalNote: 'Validez 15 días hábiles. Precios sujetos a variaciones de insumos.',
  deliveryModes: [
    'Estándar — 15-20 días hábiles',
    'Urgente — 7-10 días hábiles (+15%)',
    'Córdoba Capital — A coordinar',
  ],
  productCats: [
    'Tazas / Libretas / Lapiceras',
    'Ropa y Textiles',
    'Tecnología',
    'Packaging / Cajas',
    'Otros',
  ],
  occasions: [
    'Fin de año',
    'Cumpleaños',
    'Día de la Empresa',
    'Lanzamiento',
    'Evento corporativo',
  ],
}

export function ensureDefaults() {
  const c = cfg()
  if (!c.businessName) wCfg(DEFAULTS)
}

export const fmt = (v) => {
  const c = cfg()
  const cur = c.currency || '$'
  return cur + (Number(v) || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })
}

export const MONTHS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

export const STATUS_MAP = {
  draft: 'Borrador',
  sent: 'Enviado',
  negotiating: 'Negociando',
  confirmed: 'Confirmado',
  lost: 'Perdido',
}

export const STATUS_CLS = {
  draft: 'b-draft',
  sent: 'b-sent',
  negotiating: 'b-negotiating',
  confirmed: 'b-confirmed',
  lost: 'b-lost',
}

export const PAY_STATUS_MAP = {
  pending: 'Pago pendiente',
  partial: 'Seña abonada',
  paid: 'Pagado',
}

export const PAY_STATUS_CLS = {
  pending: 'b-draft',
  partial: 'b-negotiating',
  paid: 'b-confirmed',
}
