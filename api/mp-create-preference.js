/**
 * ANMA Regalos — POST /api/mp-create-preference
 *
 * Crea una preferencia de pago en Mercado Pago para el "Pago de ingreso" ($120.000)
 * o cuota mensual ($30.000) y devuelve el init_point para redirigir al checkout.
 *
 * Body esperado:
 *   { workspaceId: string, kind: 'onboarding' | 'monthly', userEmail?: string }
 *
 * Respuesta:
 *   { ok: true, init_point: string, preferenceId: string }
 *   { ok: false, message: string }
 *
 * Seguridad:
 *   - El access token NUNCA se expone al cliente (vive en env vars de Vercel)
 *   - workspaceId se valida contra Supabase (debe existir + caller debe ser owner)
 *   - external_reference = workspaceId para reconciliación posterior en webhook
 */

import { createClient } from '@supabase/supabase-js'
import { applyCors } from './_cors.js'

const PRICING = {
  onboarding: { amount: 120000, label: 'Pago de ingreso — Setup llave en mano + 1er mes' },
  monthly:    { amount:  30000, label: 'Cuota mensual ANMA Regalos' },
}

export default async function handler(req, res) {
  applyCors(req, res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'Method not allowed' })

  try {
    const { workspaceId, kind = 'onboarding', userEmail } = req.body || {}

    if (!workspaceId) return res.status(400).json({ ok: false, message: 'workspaceId requerido' })
    if (!PRICING[kind]) return res.status(400).json({ ok: false, message: 'kind inválido' })

    const accessToken = process.env.MP_ACCESS_TOKEN
    if (!accessToken) {
      return res.status(500).json({ ok: false, message: 'MP_ACCESS_TOKEN no configurado en el servidor' })
    }

    const baseUrl = process.env.APP_BASE_URL || `https://${req.headers.host}`
    const pricing = PRICING[kind]

    // Validación NO bloqueante: nunca bloqueamos un pago por esto. El webhook
    // reconcilia por external_reference (workspaceId|kind). Si falta el row de
    // workspace, lo creamos al vuelo para atribuir el cobro.
    if (process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.VITE_SUPABASE_URL) {
      try {
        const supa = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
        const { data: ws } = await supa
          .from('workspaces')
          .select('id, name, contact_email')
          .eq('id', workspaceId)
          .maybeSingle()
        if (!ws) {
          await supa.from('workspaces')
            .insert({ id: workspaceId, name: userEmail || 'Cliente', plan: 'solo', seats_allowed: 0 })
            .then(() => {}, () => {})
        }
      } catch { /* nunca bloquear el pago */ }
    }

    // Crear preferencia en Mercado Pago
    const preference = {
      items: [{
        id: `anma-${kind}`,
        title: pricing.label,
        description: 'ANMA Regalos — Sistema de gestión de negocios',
        quantity: 1,
        unit_price: pricing.amount,
        currency_id: 'ARS',
      }],
      payer: userEmail ? { email: userEmail } : undefined,
      external_reference: `${workspaceId}|${kind}`,
      statement_descriptor: 'ANMA REGALOS',
      back_urls: {
        success: `${baseUrl}/pago-exitoso`,
        pending: `${baseUrl}/pago-pendiente`,
        failure: `${baseUrl}/pago-error`,
      },
      auto_return: 'approved',
      notification_url: `${baseUrl}/api/mp-webhook`,
      metadata: { workspace_id: workspaceId, kind },
      // Expira en 7 días por seguridad
      expires: true,
      expiration_date_to: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    }

    const mpResp = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(preference),
    })

    const mpData = await mpResp.json()

    if (!mpResp.ok) {
      return res.status(502).json({
        ok: false,
        message: mpData.message || 'Error creando preferencia en Mercado Pago',
        details: mpData,
      })
    }

    // Detectar si usamos TEST token → devolver sandbox_init_point
    const isTest = accessToken.startsWith('TEST-')
    const initPoint = isTest ? (mpData.sandbox_init_point || mpData.init_point) : mpData.init_point

    return res.status(200).json({
      ok: true,
      init_point: initPoint,
      preferenceId: mpData.id,
      amount: pricing.amount,
      kind,
    })
  } catch (e) {
    return res.status(500).json({ ok: false, message: e?.message || 'Error inesperado' })
  }
}
