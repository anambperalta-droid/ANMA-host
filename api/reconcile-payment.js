/**
 * ANMA Regalos — POST /api/reconcile-payment
 *
 * Reconciliación manual: cuando el webhook de MP no llegó y Ana sabe
 * que un pago existe (lo ve en su panel de Mercado Pago).
 *
 * Body:
 *   { paymentId: string, workspaceId?: string, kind?: 'onboarding'|'monthly' }
 *
 * Flujo:
 *   1. Consulta el pago a la API de MP (usa MP_ACCESS_TOKEN)
 *   2. Si status='approved' y no existe en workspace_payments → INSERT
 *   3. Si ya existe pero con estado distinto → UPDATE
 *   4. El trigger SQL actualiza workspace automáticamente
 *   5. Notifica al admin por email
 *
 * Auth: JWT del admin (validado contra ADMIN_EMAILS)
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
    const authHeader = req.headers.authorization || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) return res.status(401).json({ ok: false, message: 'Missing auth token' })

    const missing = missingSupabaseEnv()
    if (missing) {
      return res.status(500).json({ ok: false, message: `Vercel: faltan env vars — ${missing}` })
    }
    if (!process.env.MP_ACCESS_TOKEN) {
      return res.status(500).json({ ok: false, message: 'MP_ACCESS_TOKEN no configurado en Vercel' })
    }

    // Verificar admin
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

    const { paymentId, workspaceId: wsIdFromBody, kind: kindFromBody } = req.body || {}
    if (!paymentId) return res.status(400).json({ ok: false, message: 'paymentId requerido' })

    // Consultar MP
    const mpResp = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` },
    })
    const payment = await mpResp.json()
    if (!mpResp.ok) {
      return res.status(502).json({ ok: false, message: payment?.message || 'Error consultando MP', details: payment })
    }

    // Resolver workspaceId y kind desde external_reference si no vienen
    const extRef = String(payment.external_reference || '')
    const [wsFromRef, kindFromRef] = extRef.split('|')
    const workspaceId = wsIdFromBody || wsFromRef
    const kind = kindFromBody || kindFromRef || 'onboarding'

    if (!workspaceId) {
      return res.status(400).json({
        ok: false,
        message: 'No se pudo determinar el workspace. Pasá workspaceId manualmente.',
        mp_status: payment.status,
        external_reference: extRef,
      })
    }

    const supa = createClient(supabaseUrl(), supabaseServiceKey())

    // Idempotencia
    const { data: existing } = await supa
      .from('workspace_payments')
      .select('id, mp_status, amount')
      .eq('mp_payment_id', String(paymentId))
      .maybeSingle()

    const { data: wsRow } = await supa
      .from('workspaces')
      .select('id, name')
      .eq('id', workspaceId)
      .maybeSingle()

    let action
    if (existing) {
      if (existing.mp_status !== payment.status) {
        await supa
          .from('workspace_payments')
          .update({ mp_status: payment.status })
          .eq('id', existing.id)
        action = 'updated'
      } else {
        action = 'already_synced'
      }
    } else {
      const { error: insErr } = await supa.from('workspace_payments').insert({
        workspace_id: workspaceId,
        amount: payment.transaction_amount,
        currency: payment.currency_id || 'ARS',
        kind,
        mp_payment_id: String(paymentId),
        mp_status: payment.status,
        mp_payment_method: payment.payment_method_id,
        paid_at: payment.date_approved || payment.date_created || new Date().toISOString(),
        recorded_by: user.id,
        notes: `Reconciliado manualmente por ${user.email}`,
        raw_payload: payment,
      })
      if (insErr) return res.status(500).json({ ok: false, message: insErr.message })
      action = 'created'
    }

    // Notificar
    await notifyAdmin(paymentReceivedEmail({
      workspaceName: wsRow?.name,
      workspaceId,
      amount: payment.transaction_amount,
      kind,
      mpStatus: payment.status,
      method: payment.payment_method_id,
      paidAt: payment.date_approved || payment.date_created,
      source: `manual reconcile (${action})`,
    })).catch(() => {})

    return res.status(200).json({
      ok: true,
      action,
      workspaceId,
      kind,
      mp_status: payment.status,
      amount: payment.transaction_amount,
    })
  } catch (e) {
    return res.status(500).json({ ok: false, message: e?.message || 'Error inesperado' })
  }
}
