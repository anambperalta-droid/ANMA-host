/**
 * ANMA Regalos — GET /api/cron-daily
 *
 * Vercel Cron Job que corre 1 vez por día (11 UTC = 8 AM ARG).
 * Configurado en vercel.json: { "crons": [{ "path": "/api/cron-daily", "schedule": "0 11 * * *" }] }
 *
 * Hace 2 cosas independientes en cada corrida:
 *
 * A) Recalcular subscription_status según next_payment_due_at
 *    - active → pending_payment (>0d de retraso)
 *    - pending_payment → paused (>7d)
 *    - paused → churned (>90d)
 *
 * B) Enviar emails automáticos vía EmailJS API REST (server-side, NO
 *    depende de que el usuario abra la app). Casos disparadores:
 *
 *    Trial (auth.users.user_metadata.trial_started_at + 7d):
 *      - daysLeft === 2  → email "te quedan 2 días"
 *      - daysLeft === 0  → email "último día de prueba"
 *      - daysLeft === -1 → email "tu workspace se pausó"
 *
 *    Cuota mensual (workspaces.next_payment_due_at):
 *      - daysUntilDue === 2  → email "próximo pago en 2 días"
 *      - daysUntilDue === 0  → email "tu cuota vence hoy"
 *      - daysOverdue === 1   → email "cuota vencida (1 día)"
 *      - daysOverdue === 3   → email "cuota vencida (3 días)"
 *      - daysOverdue === 7   → email "último aviso antes de pausar"
 *
 * Env vars requeridas:
 *   VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   CRON_SECRET (recomendado)
 *   VITE_EMAILJS_SYS_SERVICE
 *   VITE_EMAILJS_SYS_PUBLIC_KEY
 *   VITE_EMAILJS_SYS_TPL
 */

import { createClient } from '@supabase/supabase-js'

const TRIAL_DAYS = 7
const ONE_DAY = 86_400_000
const APP_URL = 'https://anma-host.vercel.app'
const ACTIVATE_PATH = '/activar'

async function sendSystemEmail({ toEmail, subject, headline, body, ctaUrl }) {
  const svc = process.env.VITE_EMAILJS_SYS_SERVICE
  const pub = process.env.VITE_EMAILJS_SYS_PUBLIC_KEY
  const tpl = process.env.VITE_EMAILJS_SYS_TPL
              || process.env.VITE_EMAILJS_SYS_TPL_TRIAL
              || process.env.VITE_EMAILJS_SYS_TPL_SIGNUP
  const priv = process.env.VITE_EMAILJS_SYS_PRIVATE_KEY

  if (!svc || !pub || !tpl || !toEmail) return { ok: false, reason: 'missing_env' }

  try {
    const resp = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: svc,
        template_id: tpl,
        user_id: pub,
        ...(priv ? { accessToken: priv } : {}),
        template_params: {
          to_email: toEmail,
          subject,
          headline,
          body,
          cta_url: ctaUrl || `${APP_URL}${ACTIVATE_PATH}`,
        },
      }),
    })
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '')
      return { ok: false, reason: 'emailjs_error', status: resp.status, message: txt }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: 'exception', message: e?.message || String(e) }
  }
}

const EMAIL_COPY = {
  trial_day_5: {
    subject: 'Te quedan 2 días de prueba en ANMA Regalos',
    headline: 'Tu prueba está por terminar',
    body: 'Faltan 2 días para que termine tu período de prueba. Activá tu plan para que tus cotizaciones, kits y clientes sigan disponibles sin interrupciones.',
    ctaUrl: `${APP_URL}${ACTIVATE_PATH}`,
  },
  trial_day_7: {
    subject: 'Hoy se vence tu prueba de ANMA Regalos',
    headline: 'Último día de prueba',
    body: 'Hoy es el último día de tu prueba. Activá tu plan ahora para no perder el acceso a tu operación en ANMA Regalos.',
    ctaUrl: `${APP_URL}${ACTIVATE_PATH}`,
  },
  trial_expired: {
    subject: 'Tu prueba de ANMA Regalos terminó — reactivá cuando quieras',
    headline: 'Tu período de prueba terminó',
    body: 'Tu prueba llegó a su fin, pero tus datos siguen guardados y seguros (90 días). Reactivá tu plan para retomar exactamente donde quedaste.',
    ctaUrl: `${APP_URL}${ACTIVATE_PATH}`,
  },
  payment_warm: {
    subject: 'Tu cuota mensual de ANMA Regalos vence en 2 días',
    headline: 'Próximo pago en 2 días',
    body: 'Te avisamos con tiempo para que organices tu cuota mensual de $30.000. Podés pagarla ahora si te queda cómodo — sino, cuando quieras dentro del plazo.',
    ctaUrl: `${APP_URL}${ACTIVATE_PATH}`,
  },
  payment_today: {
    subject: 'Tu cuota mensual de ANMA Regalos vence hoy',
    headline: 'Tu cuota vence hoy',
    body: 'Recordá abonar los $30.000 de tu cuota mensual. Pagás con Mercado Pago desde el link, sin trámite.',
    ctaUrl: `${APP_URL}${ACTIVATE_PATH}`,
  },
  payment_overdue_1: {
    subject: 'Tu cuota de ANMA Regalos venció ayer',
    headline: 'Cuota pendiente — 1 día de retraso',
    body: 'Tu cuota mensual venció ayer. Tenés 7 días de gracia para regularizar antes de que se pause el workspace. Si necesitás tiempo extra, escribinos por WhatsApp.',
    ctaUrl: `${APP_URL}${ACTIVATE_PATH}`,
  },
  payment_overdue_3: {
    subject: 'Tu cuota de ANMA Regalos lleva 3 días vencida',
    headline: 'Cuota pendiente — 3 días de retraso',
    body: 'Tu cuota mensual lleva 3 días de retraso. Quedan 4 días de gracia antes de pausar el workspace. Regularizá en 1 clic o escribinos si necesitás más tiempo.',
    ctaUrl: `${APP_URL}${ACTIVATE_PATH}`,
  },
  payment_overdue_7: {
    subject: 'Último aviso: mañana se pausa tu workspace ANMA Regalos',
    headline: 'Último día antes de pausar',
    body: 'Tu cuota mensual lleva 7 días vencida. Mañana el workspace pasa a estado pausado (los datos siguen guardados 90 días). Aboná ahora para evitar la pausa.',
    ctaUrl: `${APP_URL}${ACTIVATE_PATH}`,
  },
}

export default async function handler(req, res) {
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
    return res.status(500).json({ ok: false, message: 'Server misconfigured (supabase)' })
  }

  const supa = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const stats = {
    ranAt: new Date().toISOString(),
    transitions: { checked: 0, transitioned: [], errors: [] },
    emails: { sent: [], errors: [], skipped: 0 },
  }

  const now = Date.now()

  try {
    // A) Recalcular subscription_status
    const { data: workspaces, error } = await supa
      .from('workspaces')
      .select('id, name, subscription_status, activated_at, next_payment_due_at')
      .not('activated_at', 'is', null)

    if (error) throw error

    for (const ws of (workspaces || [])) {
      stats.transitions.checked++
      const currentStatus = ws.subscription_status
      let newStatus = currentStatus
      const due = ws.next_payment_due_at ? new Date(ws.next_payment_due_at).getTime() : null

      if (!due) {
        newStatus = 'active'
      } else {
        const daysOverdue = Math.floor((now - due) / ONE_DAY)
        if (daysOverdue <= 0)       newStatus = 'active'
        else if (daysOverdue <= 7)  newStatus = 'pending_payment'
        else if (daysOverdue <= 90) newStatus = 'paused'
        else                        newStatus = 'churned'
      }

      if (currentStatus === 'pending_setup') continue

      if (newStatus !== currentStatus) {
        const { error: upErr } = await supa
          .from('workspaces')
          .update({ subscription_status: newStatus })
          .eq('id', ws.id)
        if (upErr) {
          stats.transitions.errors.push({ id: ws.id, error: upErr.message })
        } else {
          stats.transitions.transitioned.push({
            id: ws.id, name: ws.name, from: currentStatus, to: newStatus,
          })
        }
      }
    }

    // B1) Emails de PAGO MENSUAL
    const { data: wsForPayment } = await supa
      .from('workspaces')
      .select('id, name, subscription_status, next_payment_due_at')
      .not('next_payment_due_at', 'is', null)
      .in('subscription_status', ['active', 'pending_payment'])

    for (const ws of (wsForPayment || [])) {
      const due = new Date(ws.next_payment_due_at).getTime()
      const daysUntilDue = Math.floor((due - now) / ONE_DAY)

      let phaseKey = null
      if (daysUntilDue === 2)  phaseKey = 'payment_warm'
      else if (daysUntilDue === 0) phaseKey = 'payment_today'
      else if (daysUntilDue === -1) phaseKey = 'payment_overdue_1'
      else if (daysUntilDue === -3) phaseKey = 'payment_overdue_3'
      else if (daysUntilDue === -7) phaseKey = 'payment_overdue_7'

      if (!phaseKey) { stats.emails.skipped++; continue }

      const ownerEmail = await getOwnerEmail(supa, ws.id)
      if (!ownerEmail) {
        stats.emails.errors.push({ ws: ws.id, phase: phaseKey, reason: 'no_owner_email' })
        continue
      }

      const copy = EMAIL_COPY[phaseKey]
      const result = await sendSystemEmail({ toEmail: ownerEmail, ...copy })
      if (result.ok) {
        stats.emails.sent.push({ to: ownerEmail, phase: phaseKey, ws: ws.name })
      } else {
        stats.emails.errors.push({ to: ownerEmail, phase: phaseKey, ...result })
      }
    }

    // B2) Emails de TRIAL EXPIRING
    let page = 1
    const perPage = 200
    while (true) {
      const { data: usersPage, error: uErr } = await supa.auth.admin.listUsers({ page, perPage })
      if (uErr) { stats.emails.errors.push({ scope: 'listUsers', message: uErr.message }); break }
      const users = usersPage?.users || []
      if (users.length === 0) break

      for (const u of users) {
        const meta = u.user_metadata || {}
        if (meta.subscribed || meta.invited_to_site) continue
        if (!meta.trial_started_at) continue

        const started = new Date(meta.trial_started_at).getTime()
        const elapsedDays = Math.floor((now - started) / ONE_DAY)
        const daysLeft = TRIAL_DAYS - elapsedDays

        let phaseKey = null
        if (daysLeft === 2)  phaseKey = 'trial_day_5'
        else if (daysLeft === 0) phaseKey = 'trial_day_7'
        else if (daysLeft === -1) phaseKey = 'trial_expired'

        if (!phaseKey) continue
        if (!u.email) continue

        const copy = EMAIL_COPY[phaseKey]
        const result = await sendSystemEmail({ toEmail: u.email, ...copy })
        if (result.ok) {
          stats.emails.sent.push({ to: u.email, phase: phaseKey })
        } else {
          stats.emails.errors.push({ to: u.email, phase: phaseKey, ...result })
        }
      }

      if (users.length < perPage) break
      page++
    }

    console.log(`[cron-daily] Done. transitions=${stats.transitions.transitioned.length} emails_sent=${stats.emails.sent.length} errors=${stats.emails.errors.length}`)

    return res.status(200).json({ ok: true, ...stats })
  } catch (e) {
    console.error('[cron-daily] Unexpected error:', e)
    return res.status(500).json({ ok: false, message: e?.message || 'Unexpected', stats })
  }
}

async function getOwnerEmail(supa, workspaceId) {
  try {
    const { data: mb } = await supa
      .from('memberships')
      .select('user_id')
      .eq('workspace_id', workspaceId)
      .eq('role', 'owner')
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()
    if (!mb?.user_id) return null

    const { data: userWrap } = await supa.auth.admin.getUserById(mb.user_id)
    return userWrap?.user?.email || null
  } catch {
    return null
  }
}
