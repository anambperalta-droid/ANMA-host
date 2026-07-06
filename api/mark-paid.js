/**
 * ANMA Pro — POST /api/mark-paid
 *
 * Endpoint para que el ADMIN GLOBAL registre un pago manual (transferencia,
 * efectivo, mercado pago link compartido, etc).
 *
 * Body:
 *   { workspaceId, amount, kind, notes? }
 *
 * Seguridad:
 *   - Requiere Authorization: Bearer <JWT del admin>
 *   - Validamos que el email del JWT sea el de admin global (hardcoded)
 *   - Service role para insertar bypaseando RLS
 *
 * Trigger SQL `on_payment_received` actualiza workspaces automáticamente.
 */

import { createClient } from '@supabase/supabase-js'
import { applyCors } from './_cors.js'
import { notifyAdmin, paymentReceivedEmail } from './_admin-notify.js'
import { supabaseUrl, supabaseAnonKey, supabaseServiceKey, missingSupabaseEnv } from './_env.js'

const ADMIN_EMAILS = ['ana.mbperalta@gmail.com']

export default async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'Method not allowed' })

  try {
    // Validar JWT del usuario
    const authHeader = req.headers.authorization || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) return res.status(401).json({ ok: false, message: 'Missing auth token' })

    const missing = missingSupabaseEnv()
    if (missing) {
      return res.status(500).json({ ok: false, message: `Vercel: faltan env vars — ${missing}` })
    }

    // Verificar el JWT con Supabase
    const supaUser = createClient(
      supabaseUrl(),
      supabaseAnonKey() || '',
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    )
    const { data: { user }, error: uErr } = await supaUser.auth.getUser(token)
    if (uErr || !user) return res.status(401).json({ ok: false, message: 'Invalid token' })

    if (!ADMIN_EMAILS.includes(user.email)) {
      return res.status(403).json({ ok: false, message: 'Forbidden — admin only' })
    }

    // Body
    const { workspaceId, amount, kind, notes } = req.body || {}
    if (!workspaceId) return res.status(400).json({ ok: false, message: 'workspaceId requerido' })
    if (typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ ok: false, message: 'amount inválido (debe ser número positivo)' })
    }
    if (!['onboarding', 'monthly', 'manual'].includes(kind)) {
      return res.status(400).json({ ok: false, message: 'kind inválido' })
    }

    // Insert con service role (bypass RLS)
    const supa = createClient(supabaseUrl(), supabaseServiceKey())

    const { data, error } = await supa
      .from('workspace_payments')
      .insert({
        workspace_id: workspaceId,
        amount,
        currency: 'ARS',
        kind: kind === 'manual' ? 'manual' : kind,
        mp_payment_id: null,
        mp_status: 'manual_confirmed',
        paid_at: new Date().toISOString(),
        recorded_by: user.id,
        notes: notes || `Pago manual registrado por ${user.email}`,
      })
      .select()
      .single()

    if (error) {
      return res.status(500).json({ ok: false, message: error.message })
    }

    // Traer el nombre del workspace para el email
    const { data: wsRow } = await supa
      .from('workspaces')
      .select('id, name')
      .eq('id', workspaceId)
      .maybeSingle()

    // Notificar al admin (a sí mismo) que el registro quedó ok
    await notifyAdmin(paymentReceivedEmail({
      workspaceName: wsRow?.name,
      workspaceId,
      amount,
      kind: kind === 'manual' ? 'manual' : kind,
      mpStatus: 'manual_confirmed',
      method: 'manual',
      paidAt: data.paid_at,
      source: 'manual',
    })).catch(err => console.error('[mark-paid] notify failed', err))

    return res.status(200).json({ ok: true, payment: data })
  } catch (e) {
    return res.status(500).json({ ok: false, message: e?.message || 'Error inesperado' })
  }
}
