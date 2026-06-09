/**
 * ANMA Pro — Helper de estado de suscripción.
 *
 * Funciones puras que calculan, a partir de un workspace de Supabase
 * (con las columnas que agregamos en SUPABASE_MP_MIGRATION.sql):
 *   - billing.status: el estado canónico actual
 *   - billing.daysUntilDue: días hasta vencimiento (negativo si ya venció)
 *   - billing.label: texto humano para mostrar al user
 *   - billing.urgency: 'fresh' | 'warm' | 'hot' | 'overdue' | 'paused' | 'ok'
 *   - billing.tone: { bg, fg } para UI
 *
 * Usado por:
 *   - PaymentDueBanner (cliente — alertas in-app)
 *   - Admin.jsx tab "Cobros" (vista admin)
 */

export const MONTHLY_AMOUNT = 30000
export const ONBOARDING_AMOUNT = 120000

// Estados canónicos del subscription_status en workspaces
export const STATUS = {
  TRIAL:          'trial',
  PENDING_SETUP:  'pending_setup',  // pagó entrada, esperando setup admin
  ACTIVE:         'active',         // al día con su mensual
  PENDING_PAYMENT:'pending_payment',// cuota vencida hace <= 7d (gracia)
  PAUSED:         'paused',         // suspendido por no pagar
  CHURNED:        'churned',        // perdido
}

/** Días enteros entre 2 fechas (positivo si dateB > dateA) */
function daysBetween(dateA, dateB) {
  if (!dateA || !dateB) return null
  return Math.floor((new Date(dateB).getTime() - new Date(dateA).getTime()) / 86_400_000)
}

/** Convierte el workspace en un objeto billing completo para UI */
export function getBillingStatus(workspace) {
  if (!workspace) {
    return {
      status: STATUS.TRIAL,
      isActive: false,
      isPaying: false,
      daysUntilDue: null,
      label: 'Sin datos',
      urgency: 'fresh',
      tone: { bg: 'var(--surface2)', fg: 'var(--txt3)' },
      shouldShowBanner: false,
      shouldBlock: false,
    }
  }

  const status = workspace.subscription_status || STATUS.TRIAL
  const due = workspace.next_payment_due_at
  const daysUntilDue = due ? daysBetween(new Date(), due) : null

  // ── PAUSED: bloqueo total (datos preservados pero no puede usar) ───────
  if (status === STATUS.PAUSED || status === STATUS.CHURNED) {
    return {
      status,
      isActive: false,
      isPaying: false,
      daysUntilDue,
      label: status === STATUS.PAUSED ? 'Workspace pausado' : 'Suscripción terminada',
      urgency: 'paused',
      tone: { bg: '#6B7280', fg: '#fff' },
      shouldShowBanner: true,
      shouldBlock: true,
      bannerCopy: {
        title: 'Tu workspace está pausado',
        body: 'Tus datos siguen guardados (90 días). Activá tu plan para retomar exactamente donde quedaste.',
        cta: 'Reactivar mi cuenta',
      },
    }
  }

  // ── PENDING_PAYMENT: ya venció (gracia 7d) ─────────────────────────────
  if (status === STATUS.PENDING_PAYMENT || (daysUntilDue !== null && daysUntilDue < 0)) {
    const overdueDays = daysUntilDue !== null ? -daysUntilDue : 0
    return {
      status: STATUS.PENDING_PAYMENT,
      isActive: true,  // todavía puede usar (gracia)
      isPaying: false,
      daysUntilDue,
      label: `Vencida hace ${overdueDays}d`,
      urgency: 'overdue',
      tone: { bg: '#DC2626', fg: '#fff' },
      shouldShowBanner: true,
      shouldBlock: false,
      bannerCopy: {
        title: `Cuota pendiente — ${overdueDays} día${overdueDays !== 1 ? 's' : ''} de retraso`,
        body: `Si necesitás tiempo o tenés alguna duda, contanos por WhatsApp. Quedan ${7 - overdueDays} días de gracia.`,
        cta: 'Regularizar ahora',
      },
    }
  }

  // ── PENDING_SETUP: pagó entrada pero todavía esperando setup ──────────
  if (status === STATUS.PENDING_SETUP) {
    return {
      status,
      isActive: true,
      isPaying: true,
      daysUntilDue,
      label: 'Esperando setup',
      urgency: 'fresh',
      tone: { bg: 'rgba(124,58,237,.12)', fg: '#7C3AED' },
      shouldShowBanner: false,  // No molestar — ya pagó
      shouldBlock: false,
    }
  }

  // ── ACTIVE: al día. Calculamos urgency según días restantes ───────────
  if (status === STATUS.ACTIVE) {
    if (daysUntilDue === null) {
      return {
        status,
        isActive: true,
        isPaying: true,
        daysUntilDue: null,
        label: 'Al día',
        urgency: 'ok',
        tone: { bg: 'rgba(22,163,74,.12)', fg: '#16A34A' },
        shouldShowBanner: false,
        shouldBlock: false,
      }
    }
    // 0 días = vence hoy
    if (daysUntilDue === 0) {
      return {
        status,
        isActive: true,
        isPaying: true,
        daysUntilDue,
        label: 'Vence hoy',
        urgency: 'hot',
        tone: { bg: '#DC2626', fg: '#fff' },
        shouldShowBanner: true,
        shouldBlock: false,
        bannerCopy: {
          title: 'Tu cuota mensual vence hoy',
          body: 'Aboná los $30.000 cuando te sea cómodo — ofrecemos varias opciones.',
          cta: 'Pagar $30k',
        },
      }
    }
    // 1-2 días: hot
    if (daysUntilDue <= 2) {
      return {
        status,
        isActive: true,
        isPaying: true,
        daysUntilDue,
        label: `Vence en ${daysUntilDue}d`,
        urgency: 'hot',
        tone: { bg: 'rgba(220,38,38,.12)', fg: '#DC2626' },
        shouldShowBanner: true,
        shouldBlock: false,
        bannerCopy: {
          title: `Tu cuota vence en ${daysUntilDue} día${daysUntilDue !== 1 ? 's' : ''}`,
          body: 'Buen momento para adelantar el pago. $30.000 mensuales.',
          cta: 'Pagar $30k',
        },
      }
    }
    // 3-5 días: warm
    if (daysUntilDue <= 5) {
      return {
        status,
        isActive: true,
        isPaying: true,
        daysUntilDue,
        label: `Vence en ${daysUntilDue}d`,
        urgency: 'warm',
        tone: { bg: 'rgba(217,119,6,.12)', fg: '#D97706' },
        shouldShowBanner: true,
        shouldBlock: false,
        bannerCopy: {
          title: `Próximo pago en ${daysUntilDue} días`,
          body: 'Te avisamos con tiempo para que organices tu cuota mensual.',
          cta: 'Adelantar pago',
        },
      }
    }
    // >5 días: todo OK, sin banner
    return {
      status,
      isActive: true,
      isPaying: true,
      daysUntilDue,
      label: `Vence en ${daysUntilDue}d`,
      urgency: 'ok',
      tone: { bg: 'rgba(22,163,74,.12)', fg: '#16A34A' },
      shouldShowBanner: false,
      shouldBlock: false,
    }
  }

  // ── TRIAL u otros: el TrialBanner maneja esto, no PaymentDueBanner ────
  return {
    status,
    isActive: status === STATUS.TRIAL,
    isPaying: false,
    daysUntilDue,
    label: 'Trial',
    urgency: 'fresh',
    tone: { bg: 'rgba(124,58,237,.12)', fg: '#7C3AED' },
    shouldShowBanner: false,
    shouldBlock: false,
  }
}

/** Genera mensaje WhatsApp pre-cargado para que el admin contacte al cliente */
export function buildPaymentReminderWAMessage({ workspaceName, mpLink, kind = 'monthly' }) {
  const amount = kind === 'monthly' ? '30.000' : '120.000'
  const label = kind === 'monthly' ? 'cuota mensual' : 'activación'
  return (
    `¡Hola${workspaceName ? ` ${workspaceName}` : ''}! ` +
    `Te dejo el link para abonar tu ${label} de ANMA ($${amount}):\n\n` +
    `${mpLink}\n\n` +
    `Cualquier consulta, estoy a las órdenes. ¡Gracias!`
  )
}

/** Formato $X.XXX.XXX */
export function fmtMoney(n, currency = 'ARS') {
  if (typeof n !== 'number') return '-'
  try {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)
  } catch {
    return `$${n.toLocaleString('es-AR')}`
  }
}

/** Formato fecha corta */
export function fmtShortDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}
