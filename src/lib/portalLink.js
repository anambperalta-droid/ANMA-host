/**
 * Short-link de los portales (cliente y proveedor).
 *
 * El payload entero metido en la URL (?d=BASE64) le llega al cliente o al
 * proveedor como un parrafo de base64 por WhatsApp. Esto lo guarda del lado
 * del servidor y devuelve un id corto.
 *
 * Dos intentos, en este orden:
 *   1. POST /api/portal-link — lo inserta la service_role, no pasa por RLS.
 *   2. insert directo desde el navegador — por si el endpoint no esta
 *      desplegado todavia.
 * Si los dos fallan, tira el error con el motivo para que quien llama decida
 * (hoy: caer al link largo y avisar por que).
 */
import { supabase } from './supabase'

export async function createPortalShortLink(payload, expiresAtMs) {
  const expiresAt = new Date(expiresAtMs || (Date.now() + 60 * 86400000)).toISOString()

  const { data: sess } = await supabase.auth.getSession()
  const token = sess?.session?.access_token
  if (!token) throw new Error('sesión vencida: recargá la página')

  // 1) Endpoint serverless
  try {
    const r = await fetch('/api/portal-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ payload, expiresAt }),
    })
    const j = await r.json().catch(() => null)
    if (r.ok && j?.ok && j.id) return j.id
    if (j?.message) throw new Error(j.message)
    throw new Error(`HTTP ${r.status}`)
  } catch (apiErr) {
    // 2) Insert directo (lo que habia antes)
    const id = (crypto?.randomUUID?.() || (Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2))).replace(/-/g, '').slice(0, 16)
    const { error } = await supabase.from('portal_links').insert({ id, payload, expires_at: expiresAt })
    if (!error) return id
    throw new Error(`${apiErr?.message || apiErr} / ${error.message}`)
  }
}
