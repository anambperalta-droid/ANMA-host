/**
 * ANMA Hub — POST /api/portal-link
 *
 * Crea el short-link de un portal (cliente o proveedor): guarda el payload en
 * `portal_links` y devuelve un id corto para compartir por WhatsApp.
 *
 * Por que un endpoint y no el insert desde el navegador: el insert directo
 * depende de que la sesion del navegador llegue valida a PostgREST y de que la
 * policy de RLS este puesta. Cuando algo de eso falla, el unico sintoma es que
 * al cliente le llega un parrafo de base64. Aca el insert lo hace la
 * service_role, que no pasa por RLS, y el error vuelve explicado.
 *
 * Body:  { payload: object, expiresAt: string ISO }
 * Header: Authorization: Bearer <access_token de Supabase>  (obligatorio)
 * Respuesta: { ok: true, id } | { ok: false, message }
 */

import { createClient } from '@supabase/supabase-js'
import { applyCors } from './_cors.js'
import { supabaseUrl, supabaseServiceKey, missingSupabaseEnv } from './_env.js'

const MAX_PAYLOAD_BYTES = 256 * 1024

export default async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'Method not allowed' })

  const missing = missingSupabaseEnv()
  if (missing) return res.status(500).json({ ok: false, message: `Falta configurar en el servidor: ${missing}` })

  try {
    const { payload, expiresAt } = req.body || {}
    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ ok: false, message: 'payload requerido' })
    }
    if (JSON.stringify(payload).length > MAX_PAYLOAD_BYTES) {
      return res.status(413).json({ ok: false, message: 'El contenido del portal es demasiado grande' })
    }

    // Solo un usuario logueado puede crear links: el token se valida de verdad
    // contra Supabase, no se confia en nada que venga del cliente.
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
    if (!token) return res.status(401).json({ ok: false, message: 'Sesión requerida' })

    const admin = createClient(supabaseUrl(), supabaseServiceKey(), { auth: { persistSession: false } })
    const { data: userData, error: userErr } = await admin.auth.getUser(token)
    if (userErr || !userData?.user) {
      return res.status(401).json({ ok: false, message: 'Sesión vencida: volvé a entrar' })
    }

    const expires = expiresAt && !isNaN(Date.parse(expiresAt))
      ? new Date(expiresAt).toISOString()
      : new Date(Date.now() + 60 * 86400000).toISOString()

    const id = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10)
    const { error } = await admin.from('portal_links').insert({
      id,
      payload,
      expires_at: expires,
      created_by: userData.user.id,
    })
    if (error) {
      return res.status(500).json({ ok: false, message: `No se pudo guardar el link: ${error.message}` })
    }

    return res.status(200).json({ ok: true, id })
  } catch (e) {
    return res.status(500).json({ ok: false, message: e?.message || 'Error inesperado' })
  }
}
