import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { getBillingStatus, STATUS } from '../../lib/subscription'

/**
 * PaymentDueBanner — sistema PROGRESIVO de avisos de cuota mensual.
 *
 * Filosofía: no presionar, ofrecer alternativas. El user debe sentirse
 * informado, no acorralado. Cada nivel tiene su intensidad visual.
 *
 * 5 niveles (de menos a más invasivo):
 *
 *   NIVEL 0 — silencio (>5 días):       no se muestra nada.
 *   NIVEL 1 — chip sutil (3-5 días):    barra estrecha ámbar pastel, copy amable.
 *                                       1 CTA primario + dismiss-per-day.
 *   NIVEL 2 — visible (0-2 días):       barra medium ámbar definido, copy claro.
 *                                       3 acciones: pagar / WA / posponer 24h.
 *   NIVEL 3 — vencido (1-7 días):       sticky rojo SUAVE, no dismissable hoy,
 *                                       pero permite "posponer 24h" 1 vez por día.
 *                                       3 acciones siempre visibles.
 *   NIVEL 4 — paused:                   modal bloqueante (estado de emergencia,
 *                                       ya no hay alternativa que ofrecer).
 */

const DISMISS_KEY = 'anma_payment_due_dismissed_at'
const SNOOZE_KEY  = 'anma_payment_due_snoozed_until'

export default function PaymentDueBanner() {
  const { user, role, loading } = useAuth()
  const [workspace, setWorkspace] = useState(null)
  const [hidden, setHidden] = useState(true)
  const [paying, setPaying] = useState(false)

  // Cargar workspace solo si es owner
  useEffect(() => {
    if (loading || !user?.id || role !== 'owner') return
    let cancelled = false
    ;(async () => {
      try {
        const { data: mb } = await supabase
          .from('memberships')
          .select('workspace_id')
          .eq('user_id', user.id)
          .eq('role', 'owner')
          .eq('status', 'active')
          .limit(1)
          .maybeSingle()
        const wsId = mb?.workspace_id || user.id
        const { data: ws } = await supabase
          .from('workspaces')
          .select('id, name, subscription_status, next_payment_due_at, activated_at, last_payment_at')
          .eq('id', wsId)
          .maybeSingle()
        if (!cancelled) setWorkspace(ws)
      } catch { /* silencio — banner no es crítico */ }
    })()
    return () => { cancelled = true }
  }, [user?.id, role, loading])

  // Chequear dismiss/snooze persistente
  useEffect(() => {
    if (!workspace) return
    try {
      const dismissed = localStorage.getItem(DISMISS_KEY)
      const snoozedUntil = localStorage.getItem(SNOOZE_KEY)
      const today = new Date().toISOString().slice(0, 10)
      const now = Date.now()
      const isDismissedToday = dismissed && dismissed.slice(0, 10) === today
      const isSnoozed = snoozedUntil && now < Number(snoozedUntil)
      setHidden(isDismissedToday || isSnoozed)
    } catch {
      setHidden(false)
    }
  }, [workspace?.id, workspace?.subscription_status])

  const billing = getBillingStatus(workspace)
  if (!billing.shouldShowBanner) return null

  // PAUSED es siempre bloqueante (nivel 4) — no se puede ocultar
  const isPaused = billing.urgency === 'paused'
  const isOverdue = billing.urgency === 'overdue'
  // Permite dismiss/snooze si es nivel 1-2 (no es vencido ni paused)
  const canDismiss = !isPaused && !isOverdue
  // Snooze permitido también en overdue (pero solo 1 vez por día efectivamente)
  const canSnooze = !isPaused

  if (hidden && (canDismiss || canSnooze)) return null

  const handlePay = async () => {
    if (!workspace?.id) return
    setPaying(true)
    try {
      const resp = await fetch('/api/mp-create-preference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: workspace.id,
          kind: 'monthly',
          userEmail: user?.email,
        }),
      })
      const data = await resp.json()
      if (!data.ok) throw new Error(data.message || 'Error')
      window.location.href = data.init_point
    } catch (e) {
      alert('No pudimos generar el link de pago. Probá de nuevo o escribinos por WhatsApp.')
      setPaying(false)
    }
  }

  const dismissToday = () => {
    try { localStorage.setItem(DISMISS_KEY, new Date().toISOString()) } catch { /* ignorar */ }
    setHidden(true)
  }

  const snooze24h = () => {
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now() + 24 * 60 * 60 * 1000))
    } catch { /* ignorar */ }
    setHidden(true)
  }

  const openWA = () => {
    const wsName = workspace?.name || ''
    const msg = `¡Hola! Tengo una consulta sobre el pago de mi cuota mensual de ANMA${wsName ? ` (${wsName})` : ''}.`
    window.open(`https://api.whatsapp.com/send?phone=5491169456863&text=${encodeURIComponent(msg)}`, '_blank')
  }

  // ── NIVEL 4: PAUSED (bloqueante) ───────────────────────────────────────
  if (isPaused) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9998,
        background: 'rgba(15,12,60,.85)',
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}>
        <div style={{
          background: '#fff', borderRadius: 18, padding: '36px 32px 28px',
          maxWidth: 460, width: '100%', textAlign: 'center',
          boxShadow: '0 25px 70px rgba(15,12,60,.4)',
        }}>
          <div style={{
            width: 76, height: 76, borderRadius: '50%',
            background: 'linear-gradient(135deg, #6B7280, #9CA3AF)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 18px', color: '#fff', fontSize: 32,
          }}>
            <i className="fa fa-pause" />
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', margin: '0 0 10px', letterSpacing: '-.4px' }}>
            {billing.bannerCopy.title}
          </h2>
          <p style={{ fontSize: 14, color: '#475569', lineHeight: 1.65, margin: '0 0 22px' }}>
            {billing.bannerCopy.body}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              onClick={handlePay}
              disabled={paying}
              style={{
                width: '100%', padding: '14px 24px', borderRadius: 12, border: 'none',
                background: 'linear-gradient(135deg, #7C3AED, #6366F1)',
                color: '#fff', fontSize: 14.5, fontWeight: 800, cursor: paying ? 'wait' : 'pointer',
                fontFamily: 'inherit', boxShadow: '0 10px 28px rgba(124,58,237,.4)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {paying ? <><i className="fa fa-spinner fa-spin" /> Generando link…</> : <><i className="fa fa-bolt" /> {billing.bannerCopy.cta}</>}
            </button>
            <button
              onClick={openWA}
              style={{
                width: '100%', padding: '12px 24px', borderRadius: 12,
                background: 'transparent', border: '1.5px solid var(--border, #e5e7eb)',
                color: 'var(--txt2, #374151)', fontSize: 13, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              <i className="fa-brands fa-whatsapp" style={{ color: '#25D366' }} />
              Charlar con soporte
            </button>
          </div>
          <p style={{ fontSize: 11.5, color: '#94a3b8', margin: '14px 0 0' }}>
            <i className="fa fa-shield-halved" style={{ marginRight: 5 }} />
            Tus datos siguen seguros · 90 días de retención garantizados
          </p>
        </div>
      </div>
    )
  }

  // ── Selección de estilo según nivel ────────────────────────────────────
  // Nivel 1 (warm, 3-5d): pastel ámbar, compacto
  // Nivel 2 (hot, 0-2d): ámbar definido, medium
  // Nivel 3 (overdue): rojo suave (no agresivo)
  const level =
    isOverdue                    ? 'overdue' :
    billing.urgency === 'hot'    ? 'hot'     :
    'warm'

  const styles = {
    warm: {
      bg: 'linear-gradient(90deg, #FFFBEB, #FEF3C7)',
      color: '#92400E',
      borderColor: '#FDE68A',
      iconColor: '#D97706',
      iconBg: 'rgba(217,119,6,.12)',
      ctaBg: 'linear-gradient(135deg, #D97706, #F59E0B)',
    },
    hot: {
      bg: 'linear-gradient(90deg, #FEF3C7, #FECACA)',
      color: '#7F1D1D',
      borderColor: '#FCA5A5',
      iconColor: '#DC2626',
      iconBg: 'rgba(220,38,38,.12)',
      ctaBg: 'linear-gradient(135deg, #DC2626, #EF4444)',
    },
    overdue: {
      bg: 'linear-gradient(90deg, #FEE2E2, #FECACA)',
      color: '#7F1D1D',
      borderColor: '#FCA5A5',
      iconColor: '#DC2626',
      iconBg: 'rgba(220,38,38,.18)',
      ctaBg: 'linear-gradient(135deg, #DC2626, #EF4444)',
    },
  }[level]

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        background: styles.bg,
        color: styles.color,
        padding: '11px 16px',
        display: 'flex', alignItems: 'center', gap: 12,
        fontSize: 13,
        borderBottom: `1px solid ${styles.borderColor}`,
        boxShadow: '0 1px 3px rgba(0,0,0,.04)',
        flexShrink: 0, position: 'relative', zIndex: 50,
      }}
    >
      {/* Icono en círculo suave */}
      <div style={{
        width: 32, height: 32, borderRadius: '50%',
        background: styles.iconBg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: styles.iconColor,
        flexShrink: 0, fontSize: 14,
      }}>
        <i className={`fa ${isOverdue ? 'fa-circle-exclamation' : 'fa-calendar-day'}`} />
      </div>

      {/* Mensaje */}
      <div style={{ flex: 1, minWidth: 0, lineHeight: 1.4 }}>
        <strong style={{ fontWeight: 700 }}>{billing.bannerCopy.title}.</strong>{' '}
        <span style={{ opacity: .85 }}>{billing.bannerCopy.body}</span>
      </div>

      {/* Acciones — 3 opciones reales */}
      <div className="pdb-actions" style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
        {/* CTA primario: pagar */}
        <button
          onClick={handlePay}
          disabled={paying}
          style={{
            background: styles.ctaBg,
            color: '#fff', border: 'none',
            padding: '7px 14px', borderRadius: 8,
            fontSize: 12, fontWeight: 700,
            whiteSpace: 'nowrap',
            cursor: paying ? 'wait' : 'pointer',
            fontFamily: 'inherit',
            boxShadow: '0 2px 6px rgba(0,0,0,.1)',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}
        >
          {paying ? <i className="fa fa-spinner fa-spin" /> : <><i className="fa fa-bolt" />{billing.bannerCopy.cta}</>}
        </button>

        {/* Opción secundaria: WhatsApp */}
        <button
          onClick={openWA}
          className="pdb-secondary"
          title="Hablar con soporte por WhatsApp"
          style={{
            background: 'rgba(255,255,255,.5)',
            color: styles.color,
            border: `1px solid ${styles.borderColor}`,
            padding: '7px 12px', borderRadius: 8,
            fontSize: 12, fontWeight: 600,
            whiteSpace: 'nowrap',
            cursor: 'pointer',
            fontFamily: 'inherit',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}
        >
          <i className="fa-brands fa-whatsapp" style={{ color: '#25D366' }} />
          <span className="pdb-secondary-label">WhatsApp</span>
        </button>

        {/* Opción terciaria: posponer 24h */}
        {canSnooze && (
          <button
            onClick={snooze24h}
            className="pdb-snooze"
            title="Recordame en 24 horas"
            aria-label="Recordame en 24 horas"
            style={{
              background: 'transparent',
              color: styles.color,
              border: 'none',
              padding: '7px 10px', borderRadius: 8,
              fontSize: 12, fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
              opacity: .7,
            }}
          >
            <i className="fa fa-clock" />
            <span className="pdb-snooze-label" style={{ marginLeft: 5 }}>24h</span>
          </button>
        )}

        {/* Dismiss (solo nivel 1-2, no overdue) */}
        {canDismiss && (
          <button
            onClick={dismissToday}
            aria-label="Ocultar hoy"
            title="Ocultar por hoy"
            style={{
              width: 26, height: 26, borderRadius: 6,
              background: 'transparent', border: 'none',
              color: styles.color,
              opacity: .5,
              cursor: 'pointer', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12,
            }}
          >
            <i className="fa fa-xmark" />
          </button>
        )}
      </div>

      <style>{`
        @media(max-width:640px){
          [role="status"]{padding:9px 12px;font-size:12px;gap:8px;flex-wrap:wrap}
          [role="status"] > div:nth-child(2){flex:1 1 100%;order:2}
          [role="status"] > div:first-child{order:1}
          [role="status"] .pdb-actions{order:3;flex:1 1 100%;justify-content:flex-end;margin-top:4px}
          [role="status"] .pdb-secondary-label,
          [role="status"] .pdb-snooze-label{display:none}
          [role="status"] .pdb-secondary,
          [role="status"] .pdb-snooze{padding:6px 10px}
        }
      `}</style>
    </div>
  )
}
