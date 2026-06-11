/**
 * ANMA — POST /api/mp-proxy
 *
 * Proxy server-side hacia la API de Mercado Pago para las integraciones del
 * USUARIO (Config → Pagos: cada negocio usa su propio Access Token).
 *
 * Por qué existe: la API de MP responde 401 al preflight CORS del navegador,
 * así que las llamadas con `Authorization: Bearer` directas desde el cliente
 * son bloqueadas SIEMPRE por el browser. Este proxy corre en Vercel (server),
 * donde no hay CORS.
 *
 * Body:
 *   { action: 'test',       token }                → GET  /v1/payment_methods
 *   { action: 'preference', token, preference }    → POST /checkout/preferences
 *
 * Seguridad: solo 2 endpoints fijos de MP (no es proxy abierto), el token lo
 * provee el caller (es SU token de MP, igual que cuando lo usaba el cliente).
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'Method not allowed' })

  try {
    const { action, token, preference } = req.body || {}

    if (!token || typeof token !== 'string' || token.length < 20) {
      return res.status(400).json({ ok: false, message: 'Access Token inválido o vacío.' })
    }

    if (action === 'test') {
      const mpResp = await fetch('https://api.mercadopago.com/v1/payment_methods', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (mpResp.ok) {
        const data = await mpResp.json()
        return res.status(200).json({ ok: true, count: Array.isArray(data) ? data.length : 0 })
      }
      const err = await mpResp.json().catch(() => ({}))
      return res.status(200).json({
        ok: false,
        message: mpResp.status === 401
          ? 'Token inválido o vencido. Verificá que sea el Access Token de PRODUCCIÓN (empieza con APP_USR-).'
          : (err.message || `Mercado Pago respondió ${mpResp.status}`),
      })
    }

    if (action === 'preference') {
      if (!preference || typeof preference !== 'object' || !Array.isArray(preference.items)) {
        return res.status(400).json({ ok: false, message: 'Preferencia inválida.' })
      }
      const mpResp = await fetch('https://api.mercadopago.com/checkout/preferences', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(preference),
      })
      const data = await mpResp.json().catch(() => ({}))
      if (mpResp.ok) {
        const isTest = token.startsWith('TEST-')
        const link = isTest ? (data.sandbox_init_point || data.init_point) : data.init_point
        return res.status(200).json({ ok: true, link, preferenceId: data.id })
      }
      return res.status(200).json({ ok: false, message: data.message || `Error de Mercado Pago (${mpResp.status})` })
    }

    return res.status(400).json({ ok: false, message: 'action inválida.' })
  } catch (e) {
    return res.status(500).json({ ok: false, message: e?.message || 'Error inesperado en el proxy MP.' })
  }
}
