import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'

const DISMISS_KEY = 'anma_trial_banner_dismissed_at'

export default function TrialBanner() {
  const { trial } = useAuth()
  const [hidden, setHidden] = useState(true)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DISMISS_KEY)
      if (raw) {
        const dismissedDate = raw.slice(0, 10)
        const today = new Date().toISOString().slice(0, 10)
        setHidden(dismissedDate === today)
      } else setHidden(false)
    } catch { setHidden(false) }
  }, [trial?.daysLeft])

  if (!trial?.isTrial || !trial.active) return null
  if (hidden) return null

  const { daysLeft } = trial
  const tone = daysLeft <= 1 ? 'critical' : daysLeft <= 3 ? 'warn' : 'info'
  const palette = {
    info:     { bg: 'linear-gradient(90deg,#7C3AED,#6366F1)', icon: 'fa-gift' },
    warn:     { bg: 'linear-gradient(90deg,#D97706,#F59E0B)', icon: 'fa-hourglass-half' },
    critical: { bg: 'linear-gradient(90deg,#DC2626,#EF4444)', icon: 'fa-fire' },
  }[tone]

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, new Date().toISOString()) } catch { /* ignorar */ }
    setHidden(true)
  }

  const dayLabel = daysLeft === 1 ? 'día' : 'días'
  const msg = daysLeft === 1
    ? '¡Último día de prueba!'
    : daysLeft <= 3
      ? `Quedan ${daysLeft} ${dayLabel} de prueba`
      : `Estás probando ANMA Regalos — ${daysLeft} ${dayLabel} restantes`

  return (
    <div role="status" aria-live="polite" style={{
      background: palette.bg, color: '#fff', padding: '10px 16px',
      display: 'flex', alignItems: 'center', gap: 10,
      fontSize: 13, fontWeight: 600, boxShadow: '0 2px 8px rgba(0,0,0,.08)',
      flexShrink: 0, position: 'relative', zIndex: 50,
    }}>
      <i className={`fa ${palette.icon}`} style={{ fontSize: 14, flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0, lineHeight: 1.35 }}>
        {msg}
        <span style={{ opacity: .85, fontWeight: 500, marginLeft: 6 }}>
          · Activá tu plan para no perder tus datos.
        </span>
      </span>
      <a
        href="/activar"
        style={{
          background: 'rgba(255,255,255,.16)', color: '#fff', textDecoration: 'none',
          padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
          whiteSpace: 'nowrap', flexShrink: 0, transition: 'background .15s',
        }}>
        <i className="fa fa-bolt" style={{ marginRight: 5 }} /> Activar plan
      </a>
      <button onClick={dismiss} aria-label="Ocultar banner" title="Ocultar hoy" style={{
        width: 26, height: 26, borderRadius: 6, background: 'transparent', border: 'none',
        color: 'rgba(255,255,255,.85)', cursor: 'pointer', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
      }}>
        <i className="fa fa-xmark" />
      </button>
      <style>{`
        @media(max-width:540px){
          [role="status"] > span:last-of-type span{display:none}
          [role="status"]{padding:9px 12px;font-size:12px;gap:8px}
          [role="status"] a{padding:5px 10px;font-size:11.5px}
        }
      `}</style>
    </div>
  )
}
