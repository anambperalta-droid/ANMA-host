/**
 * ANMA Regalos — POST /api/transfer-notify
 *
 * El CLIENTE avisa que hizo una transferencia bancaria para activar su plan.
 * Deja un registro instantáneo en `workspace_payments` con estado
 * 'pending_transfer' (NO activa la cuenta ni cuenta como ingreso: eso pasa
 * recién cuando Ana confirma la transferencia desde el Admin) y notifica a Ana.
 *
 * Body: { workspaceId: string, kind?: 'onboarding' | 'monthly' }
 *
 * Seguridad:
 *   - Requiere JWT del cliente (Authorization: Bearer <token>)
 *   - Verifica que el cliente pertenezca al workspace (anti-abuso)
 *   - Inserta con service role (la RLS de workspace_payments solo deja al admin)
 *   - Idempotente: no duplica si ya hay un aviso pendiente para ese workspace
 */

import { createClient } from '@supabase/supabase-js'
import { applyCors } from './_cors.js'
import { notifyAdmin } from './_admin-notify.js'
import { supabaseUrl, supabaseAnonKey, supabaseServiceKey, missingSupabaseEnv } from './_env.js'

const PRICING = { onboarding: 120000, monthly: 30000 }

export default async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'Method not allowed' })

  try {
    const authHeader = req.headers.authorization || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) return res.status(401).json({ ok: false, message: 'Missing auth token' })

    const missing = missingSupabaseEnv()
    if (missing) return res.status(500).json({ ok: false, message: `Vercel: faltan env vars — ${missing}` })

    // Validar identidad del cliente
    const supaUser = createClient(
      supabaseUrl(),
      supabaseAnonKey() || '',
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    )
    const { data: { user }, error: uErr } = await supaUser.auth.getUser(token)
    if (uErr || !user) return res.status(401).json({ ok: false, message: 'Invalid token' })

    const { workspaceId, kind = 'onboarding' } = req.body || {}
    if (!workspaceId) return res.status(400).json({ ok: false, message: 'workspaceId requerido' })
    if (!PRICING[kind]) return res.status(400).json({ ok: false, message: 'kind inválido' })

    const supa = createClient(supabaseUrl(), supabaseServiceKey())

    // El cliente debe pertenecer al workspace (o ser self-workspace legacy)
    const { data: mem } = await supa
      .from('memberships')
      .select('role')
      .eq('user_id', user.id)
      .eq('workspace_id', workspaceId)
      .eq('status', 'active')
      .maybeSingle()
    const belongs = !!mem || workspaceId === user.id
    if (!belongs) return res.status(403).json({ ok: false, message: 'No autorizado sobre este workspace' })

    // Idempotencia: si ya hay un aviso pendiente, no duplicamos (pero sí re-notificamos)
    const { data: pending } = await supa
      .from('workspace_payments')
      .select('id, paid_at')
      .eq('workspace_id', workspaceId)
      .eq('mp_status', 'pending_transfer')
      .order('paid_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    let payment = pending
    if (!pending) {
      const { data: ins, error } = await supa
        .from('workspace_payments')
        .insert({
          workspace_id: workspaceId,
          amount: PRICING[kind],
          currency: 'ARS',
          kind,
          mp_payment_id: null,
          mp_status: 'pending_transfer',
          paid_at: new Date().toISOString(),
          recorded_by: user.id,
          notes: `Transferencia informada por el cliente (${user.email}) — pendiente de confirmar en el banco`,
        })
        .select()
        .single()
      if (error) return res.status(500).json({ ok: false, message: error.message })
      payment = ins
    }

    const { data: wsRow } = await supa
      .from('workspaces')
      .select('id, name')
      .eq('id', workspaceId)
      .maybeSingle()

    await notifyAdmin({
      subject: `🔔 Transferencia informada — ${wsRow?.name || user.email}`,
      headline: 'Un cliente avisó que hizo una transferencia',
      body: [
        `Workspace: ${wsRow?.name || '(sin nombre)'} — id ${workspaceId}`,
        `Cliente: ${user.email}`,
        `Concepto: ${kind === 'onboarding' ? 'Pago de ingreso ($120.000)' : 'Cuota mensual ($30.000)'}`,
        `Estado: pendiente de confirmar`,
        '',
        'Quedó registrado en el Admin como pendiente. Verificá la transferencia en tu banco y confirmala (Marcar como pagado / Reconciliar).',
      ].join('\n'),
    }).catch(() => {})

    return res.status(200).json({ ok: true, payment })
  } catch (e) {
    return res.status(500).json({ ok: false, message: e?.message || 'Error inesperado' })
  }
}
