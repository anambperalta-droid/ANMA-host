/**
 * ANMA Regalos — Notificaciones al admin (Ana) por email vía EmailJS.
 *
 * Se dispara cuando:
 *   - Llega un pago aprobado por webhook MP
 *   - Se registra un pago manual desde el Admin
 *   - Hay un problema al procesar un pago
 *
 * Server-side, usa la misma cuenta de EmailJS que cron-daily.
 * Nunca bloquea el flujo principal: si falla el email, el pago se registra igual.
 */

const ADMIN_EMAIL = 'ana.mbperalta@gmail.com'
const APP_LABEL = 'ANMA Regalos'
const ADMIN_PATH = 'https://anma-host.vercel.app/admin'

export async function notifyAdmin({ subject, headline, body, ctaUrl }) {
  const svc  = process.env.VITE_EMAILJS_SYS_SERVICE
  const pub  = process.env.VITE_EMAILJS_SYS_PUBLIC_KEY
  const tpl  = process.env.VITE_EMAILJS_SYS_TPL
            || process.env.VITE_EMAILJS_SYS_TPL_TRIAL
            || process.env.VITE_EMAILJS_SYS_TPL_SIGNUP
  const priv = process.env.VITE_EMAILJS_SYS_PRIVATE_KEY

  if (!svc || !pub || !tpl) {
    console.warn('[admin-notify] EmailJS no configurado — skip')
    return { ok: false, reason: 'missing_env' }
  }

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
          to_email: ADMIN_EMAIL,
          subject: `[${APP_LABEL}] ${subject}`,
          headline,
          body,
          cta_url: ctaUrl || ADMIN_PATH,
        },
      }),
    })
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '')
      console.error('[admin-notify] EmailJS error', resp.status, txt)
      return { ok: false, reason: 'emailjs_error', status: resp.status }
    }
    return { ok: true }
  } catch (e) {
    console.error('[admin-notify] Exception', e?.message || e)
    return { ok: false, reason: 'exception', message: e?.message || String(e) }
  }
}

const fmtARS = (n) => {
  const num = Number(n) || 0
  try { return num.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }) }
  catch { return `$${num}` }
}

export function paymentReceivedEmail({ workspaceName, workspaceId, amount, kind, mpStatus, method, paidAt, source }) {
  const kindLabel = kind === 'onboarding' ? 'Pago de ingreso ($120.000)'
                  : kind === 'monthly'    ? 'Cuota mensual ($30.000)'
                  : kind === 'manual'     ? 'Pago manual'
                  : kind
  const sourceLabel = source === 'webhook' ? 'Mercado Pago (automático)'
                    : source === 'manual'  ? 'Registrado manualmente desde Admin'
                    : source
  const statusOk = (mpStatus === 'approved' || mpStatus === 'manual_confirmed')
  const paidWhen = paidAt ? new Date(paidAt).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' }) : '—'

  return {
    subject: statusOk
      ? `💰 Pago aprobado — ${workspaceName || workspaceId} (${fmtARS(amount)})`
      : `⚠️ Pago con estado "${mpStatus}" — ${workspaceName || workspaceId}`,
    headline: statusOk
      ? `Nuevo pago aprobado en ${APP_LABEL}`
      : `Pago con estado "${mpStatus}" recibido`,
    body: [
      `Workspace: ${workspaceName || '(sin nombre)'} — id ${workspaceId}`,
      `Concepto: ${kindLabel}`,
      `Monto: ${fmtARS(amount)}`,
      `Estado: ${mpStatus || '—'}`,
      `Método: ${method || '—'}`,
      `Origen: ${sourceLabel || '—'}`,
      `Fecha: ${paidWhen}`,
      '',
      statusOk
        ? 'El estado del workspace se actualizó automáticamente. Revisá el Admin para ver el detalle.'
        : 'El pago quedó registrado con este estado. Si no se aprueba, revisá en Mercado Pago manualmente.',
    ].join('\n'),
    ctaUrl: ADMIN_PATH,
  }
}
