/**
 * ANMA Regalos — POST /api/mp-webhook
 *
 * Recibe notificaciones de Mercado Pago cuando ocurre algo con un pago.
 * MP llama acá con { type, data: { id } } y nosotros consultamos el pago
 * para conocer su estado real (no confiamos en lo que viene en el body).
 *
 * Flow:
 *   1. MP nos manda { type: 'payment', data: { id: '<payment_id>' } }
 *   2. Consultamos el pago a MP API con nuestro token (server-side)
 *   3. Validamos el estado: 'approved' → registramos en Supabase
 *   4. El trigger SQL `on_payment_received` actualiza workspaces auto
 *   5. Respondemos 200 OK (sino MP reintenta indefinidamente)
 *
 * Seguridad:
 *   - El payload de MP puede ser falsificado, por eso consultamos a su API
 *     para obtener el estado real del pago (validación end-to-end)
 *   - Validamos el external_reference contra Supabase
 *   - Idempotente: si el mismo payment_id llega 2 veces, no duplicamos
 *
 * NOTA: registralo en Mercado Pago Developers → Webhooks:
 *   URL: https://anma-host.vercel.app/api/mp-webhook
 *   Eventos: Pagos
 */

import { createClient } from '@supabase/supabase-js'
import { notifyAdmin, paymentReceivedEmail } from './_admin-notify.js'
import { supabaseUrl, supabaseServiceKey, missingSupabaseEnv } from './_env.js'

export default async function handler(req, res) {
  // MP a veces hace GET para verificar la URL
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, status: 'webhook listening' })
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, message: 'Method not allowed' })
  }

  try {
    const accessToken = process.env.MP_ACCESS_TOKEN
    if (!accessToken) {
      console.error('[mp-webhook] MP_ACCESS_TOKEN no configurado')
      return res.status(500).json({ ok: false, message: 'Server misconfigured' })
    }

    // MP manda 2 formatos posibles:
    //   - { type: 'payment', data: { id: '...' } }  (formato nuevo)
    //   - { topic: 'payment', resource: 'https://...' }  (formato legacy)
    const body = req.body || {}
    let paymentId =
      body?.data?.id ||
      (body?.resource ? body.resource.split('/').pop() : null) ||
      req.query?.id ||
      null

    if (!paymentId) {
      // No es un evento de pago — respondemos OK para que MP no reintente
      return res.status(200).json({ ok: true, ignored: true })
    }

    // Consultar el pago real a MP API
    const mpResp = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const payment = await mpResp.json()
    if (!mpResp.ok) {
      console.error('[mp-webhook] Failed to fetch payment from MP:', payment)
      return res.status(502).json({ ok: false, message: 'No se pudo verificar el pago' })
    }

    // Parsear el external_reference: '<workspaceId>|<kind>'
    const extRef = String(payment.external_reference || '')
    const [workspaceId, kind] = extRef.split('|')
    if (!workspaceId) {
      console.warn('[mp-webhook] payment sin external_reference válido', paymentId)
      return res.status(200).json({ ok: true, warning: 'no external_reference' })
    }

    // Inicializar Supabase con service role para bypass RLS
    const missing = missingSupabaseEnv()
    if (missing) {
      console.error('[mp-webhook] Env vars faltantes:', missing)
      return res.status(500).json({ ok: false, message: `Vercel: faltan env vars — ${missing}` })
    }
    const supa = createClient(supabaseUrl(), supabaseServiceKey())

    // Idempotencia: si ya registramos este payment_id, no duplicamos
    const { data: existing } = await supa
      .from('workspace_payments')
      .select('id, mp_status')
      .eq('mp_payment_id', String(paymentId))
      .maybeSingle()

    // Traer nombre del workspace para el email al admin
    const { data: wsRow } = await supa
      .from('workspaces')
      .select('id, name')
      .eq('id', workspaceId)
      .maybeSingle()

    if (existing) {
      // Si el estado cambió (ej: pending → approved), actualizamos y notificamos
      if (existing.mp_status !== payment.status) {
        await supa
          .from('workspace_payments')
          .update({ mp_status: payment.status })
          .eq('id', existing.id)
        // Notificar al admin si el pago pasó a aprobado
        if (payment.status === 'approved') {
          await notifyAdmin(paymentReceivedEmail({
            workspaceName: wsRow?.name,
            workspaceId,
            amount: payment.transaction_amount,
            kind: kind || 'onboarding',
            mpStatus: payment.status,
            method: payment.payment_method_id,
            paidAt: payment.date_approved || payment.date_created,
            source: 'webhook',
          })).catch(err => console.error('[mp-webhook] notify failed', err))
        }
      }
      return res.status(200).json({ ok: true, action: 'updated', paymentId })
    }

    // Insertar nuevo registro de pago
    const { error: insErr } = await supa.from('workspace_payments').insert({
      workspace_id: workspaceId,
      amount: payment.transaction_amount,
      currency: payment.currency_id || 'ARS',
      kind: kind || 'onboarding',
      mp_payment_id: String(paymentId),
      mp_status: payment.status,
      mp_payment_method: payment.payment_method_id,
      paid_at: payment.date_approved || payment.date_created || new Date().toISOString(),
      raw_payload: payment,
    })

    if (insErr) {
      console.error('[mp-webhook] Failed to insert payment:', insErr)
      // Notificar al admin del error (para que no se pierda un pago silenciosamente)
      await notifyAdmin({
        subject: `⚠️ Error registrando pago MP ${paymentId}`,
        headline: 'No se pudo guardar un pago en la base',
        body: [
          `Workspace: ${wsRow?.name || '(sin nombre)'} — id ${workspaceId}`,
          `Payment id: ${paymentId}`,
          `Monto: ${payment.transaction_amount}`,
          `Estado MP: ${payment.status}`,
          `Error: ${insErr.message}`,
          '',
          'Revisá los logs de Vercel y reconciliá manualmente en Mercado Pago.',
        ].join('\n'),
      }).catch(() => {})
      return res.status(500).json({ ok: false, message: 'No se pudo registrar el pago' })
    }

    // El trigger SQL `on_payment_received` actualiza workspaces auto
    // si payment.status === 'approved'

    // Notificar al admin de cada pago que llega (aprobado o con problema)
    await notifyAdmin(paymentReceivedEmail({
      workspaceName: wsRow?.name,
      workspaceId,
      amount: payment.transaction_amount,
      kind: kind || 'onboarding',
      mpStatus: payment.status,
      method: payment.payment_method_id,
      paidAt: payment.date_approved || payment.date_created,
      source: 'webhook',
    })).catch(err => console.error('[mp-webhook] notify failed', err))

    return res.status(200).json({ ok: true, action: 'created', paymentId, status: payment.status })
  } catch (e) {
    console.error('[mp-webhook] Unexpected error:', e)
    // Respondemos 200 para que MP no reintente loop infinito
    // (los errores quedan en logs de Vercel)
    return res.status(200).json({ ok: false, error: e?.message || 'Unexpected' })
  }
}
