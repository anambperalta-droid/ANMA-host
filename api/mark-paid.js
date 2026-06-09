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

const ADMIN_EMAILS = ['ana.mbperalta@gmail.com']

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'Method not allowed' })

  try {
    // Validar JWT del usuario
    const authHeader = req.headers.authorization || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) return res.status(401).json({ ok: false, message: 'Missing auth token' })

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.VITE_SUPABASE_URL) {
      return res.status(500).json({ ok: false, message: 'Server misconfigured' })
    }

    // Verificar el JWT con Supabase
    const supaUser = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '',
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
    const supa = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

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

    return res.status(200).json({ ok: true, payment: data })
  } catch (e) {
    return res.status(500).json({ ok: false, message: e?.message || 'Error inesperado' })
  }
}
