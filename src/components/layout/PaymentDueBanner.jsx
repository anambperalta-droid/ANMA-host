import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { getBillingStatus, STATUS } from '../../lib/subscription'

/**
 * PaymentDueBanner — banner sticky in-app que avisa de cuotas mensuales.
 *
 * Estados que dispara:
 *   - active + ≤5d para vencer  → banner amarillo/rojo "Vence en Xd"
 *   - pending_payment           → banner rojo "Vencida hace Xd, pagá ahora"
 *   - paused                    → banner gris bloqueante "Reactivar workspace"
 *
 * No se muestra si:
 *   - User está en trial (TrialBanner se encarga)
 *   - User es operator (no es el owner — los pagos son del owner)
 *   - Quedan más de 5 días hasta vencer
 *
 * Dismiss: por día, salvo si está vencido (no se puede ocultar).
 *
 * CTA: dispara /api/mp-create-preference con kind='monthly' → redirect a MP.
 */

const DISMISS_KEY = 'anma_payment_due_dismissed_at'

export default function PaymentDueBanner() {
  const { user, role, loading } = useAuth()
  const [workspace, setWorkspace] = useState(null)
  const [hidden, setHidden] = useState(true)
  const [paying, setPaying] = useState(false)

  // Solo cargar workspace si es owner (operators no ven banner de pago)
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

  // Calcular si debe mostrarse hoy (dismiss persistente por día)
  useEffect(() => {
    if (!workspace) return
    try {
      const raw = localStorage.getItem(DISMISS_KEY)
      if (raw) {
        const dismissedDate = raw.slice(0, 10)
        const today = new Date().toISOString().slice(0, 10)
        setHidden(dismissedDate === today)
      } else {
        setHidden(false)
      }
    } catch {
      setHidden(false)
    }
  }, [workspace?.id, workspace?.subscription_status])

  const billing = getBillingStatus(workspace)
  if (!billing.shouldShowBanner) return null
  // El estado paused/overdue NO se puede ocultar (es crítico)
  const canDismiss = billing.urgency === 'warm' || billing.urgency === 'fresh'
  if (hidden && canDismiss) return null

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

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, new Date().toISOString()) } catch { /* ignorar */ }
    setHidden(true)
  }

  const isPaused = billing.urgency === 'paused'
  const isOverdue = billing.urgency === 'overdue'

  // Banner BLOQUEANTE para paused (fullscreen) ──────────────────────────
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
          maxWidth: 440, width: '100%', textAlign: 'center',
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
          <p style={{ fontSize: 14, color: '#475569', lineHeight: 1.6, margin: '0 0 22px' }}>
            {billing.bannerCopy.body}
          </p>
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
            {paying ? (
              <><i className="fa fa-spinner fa-spin" /> Generando link…</>
            ) : (
              <><i className="fa fa-bolt" /> {billing.bannerCopy.cta}</>
            )}
          </button>
          <p style={{ fontSize: 11.5, color: '#94a3b8', margin: '14px 0 0' }}>
            <i className="fa fa-shield-halved" style={{ marginRight: 5 }} />
            Tus datos siguen seguros · 90 días de retención garantizados
          </p>
        </div>
      </div>
    )
  }

  // Banner sticky NORMAL (overdue, hot, warm) ─────────────────────────
  const bgGradient = isOverdue
    ? 'linear-gradient(90deg, #DC2626, #EF4444)'
    : billing.urgency === 'hot'
      ? 'linear-gradient(90deg, #DC2626, #F87171)'
      : 'linear-gradient(90deg, #D97706, #F59E0B)'

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        background: bgGradient,
        color: '#fff',
        padding: '10px 16px',
        display: 'flex', alignItems: 'center', gap: 10,
        fontSize: 13, fontWeight: 600,
        boxShadow: '0 2px 8px rgba(0,0,0,.08)',
        flexShrink: 0, position: 'relative', zIndex: 50,
      }}
    >
      <i className={`fa ${isOverdue ? 'fa-fire' : 'fa-hourglass-half'}`} style={{ fontSize: 14, flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0, lineHeight: 1.35 }}>
        <strong>{billing.bannerCopy.title}.</strong>
        <span style={{ opacity: .9, fontWeight: 500, marginLeft: 6, display: 'inline-block' }}>
          {billing.bannerCopy.body}
        </span>
      </span>
      <button
        onClick={handlePay}
        disabled={paying}
        style={{
          background: 'rgba(255,255,255,.18)',
          color: '#fff', border: 'none',
          padding: '6px 14px', borderRadius: 8,
          fontSize: 12, fontWeight: 800,
          whiteSpace: 'nowrap', flexShrink: 0,
          cursor: paying ? 'wait' : 'pointer',
          fontFamily: 'inherit',
          transition: 'background .15s',
        }}
        onMouseEnter={e => !paying && (e.currentTarget.style.background = 'rgba(255,255,255,.28)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,.18)')}
      >
        {paying ? <i className="fa fa-spinner fa-spin" /> : <><i className="fa fa-bolt" style={{ marginRight: 5 }} />{billing.bannerCopy.cta}</>}
      </button>
      {canDismiss && (
        <button
          onClick={dismiss}
          aria-label="Ocultar hoy"
          title="Ocultar hoy"
          style={{
            width: 26, height: 26, borderRadius: 6,
            background: 'transparent', border: 'none',
            color: 'rgba(255,255,255,.85)',
            cursor: 'pointer', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13,
          }}
        >
          <i className="fa fa-xmark" />
        </button>
      )}

      <style>{`
        @media(max-width:540px){
          [role="status"] > span:last-of-type > span{display:none}
          [role="status"]{padding:9px 12px;font-size:12px;gap:8px}
          [role="status"] button{padding:5px 10px;font-size:11.5px}
        }
      `}</style>
    </div>
  )
}
