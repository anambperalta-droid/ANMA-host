/**
 * ANMA Regalos — CORS allowlist para las funciones serverless.
 *
 * Solo se permite responder con Access-Control-Allow-Origin a:
 *   - el dominio de producción (anma-host.vercel.app)
 *   - el propio origen del deployment (cubre previews *.vercel.app)
 *
 * Cualquier otro origen NO recibe el header CORS.
 */
const STATIC_ALLOWED = [
  'https://anma-host.vercel.app',
]

export function applyCors(req, res, methods = 'POST, OPTIONS') {
  const origin = req.headers.origin || ''
  const host = req.headers.host || ''
  const allowed =
    STATIC_ALLOWED.includes(origin) ||
    (!!origin && origin === `https://${host}`)

  if (allowed) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Access-Control-Allow-Methods', methods)
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  return allowed
}
