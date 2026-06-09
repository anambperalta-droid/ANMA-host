/**
 * ANMA Regalos — GET /api/cron-daily
 *
 * Vercel Cron Job que se ejecuta 1 vez por día (9 AM UTC = 6 AM ARG).
 * Configurado en vercel.json: { "crons": [{ "path": "/api/cron-daily", "schedule": "0 9 * * *" }] }
 *
 * Funciones:
 *   1. Para cada workspace activated, recalcula subscription_status según
 *      next_payment_due_at usando la function SQL calc_subscription_status()
 *   2. Marca paused los workspaces con vencimiento > 7d sin pago
 *   3. Marca churned los workspaces paused > 90d
 *   4. Devuelve resumen (útil para debugging y monitoring)
 *
 * Seguridad:
 *   - Vercel Cron incluye automáticamente el header Authorization: Bearer <CRON_SECRET>
 *   - Validamos contra process.env.CRON_SECRET (set en Vercel env vars)
 *   - Si no hay CRON_SECRET, sigue funcionando pero loguea warning
 */

import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  // Validar que la llamada viene de Vercel Cron (no de un user random)
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = req.headers.authorization || ''
    if (authHeader !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ ok: false, message: 'Unauthorized' })
    }
  } else {
    console.warn('[cron-daily] CRON_SECRET no configurado — endpoint sin proteger')
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.VITE_SUPABASE_URL) {
    return res.status(500).json({ ok: false, message: 'Server misconfigured' })
  }

  const supa = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const stats = {
    checked: 0,
    transitioned: [],   // [{ workspace_id, from, to }]
    errors: [],
  }

  try {
    // 1. Traer todos los workspaces activados (no trials)
    const { data: workspaces, error } = await supa
      .from('workspaces')
      .select('id, name, subscription_status, activated_at, next_payment_due_at')
      .not('activated_at', 'is', null)

    if (error) throw error

    const now = Date.now()
    const ONE_DAY = 86_400_000

    // 2. Para cada uno, calcular el nuevo estado
    for (const ws of (workspaces || [])) {
      stats.checked++
      const currentStatus = ws.subscription_status
      let newStatus = currentStatus
      const due = ws.next_payment_due_at ? new Date(ws.next_payment_due_at).getTime() : null

      if (!due) {
        // Sin fecha de próximo vencimiento → asumimos active
        newStatus = 'active'
      } else {
        const daysOverdue = Math.floor((now - due) / ONE_DAY)
        if (daysOverdue <= 0)             newStatus = 'active'
        else if (daysOverdue <= 7)        newStatus = 'pending_payment'
        else if (daysOverdue <= 90)       newStatus = 'paused'
        else                              newStatus = 'churned'
      }

      // Mantener pending_setup hasta que admin lo active manualmente
      // (No queremos que un cron rompa el flow de setup inicial)
      if (currentStatus === 'pending_setup') {
        continue
      }

      if (newStatus !== currentStatus) {
        const { error: upErr } = await supa
          .from('workspaces')
          .update({ subscription_status: newStatus })
          .eq('id', ws.id)
        if (upErr) {
          stats.errors.push({ id: ws.id, error: upErr.message })
        } else {
          stats.transitioned.push({
            id: ws.id,
            name: ws.name,
            from: currentStatus,
            to: newStatus,
          })
          console.log(`[cron-daily] ${ws.name}: ${currentStatus} → ${newStatus}`)
        }
      }
    }

    // 3. Guardar un log de la corrida (para auditoría)
    // Si tenés tabla 'cron_runs' la podés crear, pero por ahora solo loguear.
    console.log(`[cron-daily] Completed: checked=${stats.checked}, transitioned=${stats.transitioned.length}, errors=${stats.errors.length}`)

    return res.status(200).json({
      ok: true,
      ranAt: new Date().toISOString(),
      ...stats,
    })
  } catch (e) {
    console.error('[cron-daily] Unexpected error:', e)
    return res.status(500).json({ ok: false, message: e?.message || 'Unexpected', stats })
  }
}
