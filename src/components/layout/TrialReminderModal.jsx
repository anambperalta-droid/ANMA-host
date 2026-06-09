import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'

/**
 * TrialReminderModal — espejo del de Pro, adaptado a Regalos.
 */

const MILESTONES = {
  day_5: {
    daysLeft: 2,
    icon: 'fa-hourglass-half',
    color: '#D97706',
    bg: 'linear-gradient(135deg, #FEF3C7, #FDE68A)',
    title: 'Te quedan 2 días de prueba',
    body: '¿Cómo va? Si querés que tus kits y datos sigan después del día 7, activá tu plan ahora.',
    cta: 'Activar plan ahora',
    secondary: 'Seguir probando',
  },
  day_7: {
    daysLeft: 0,
    icon: 'fa-fire',
    color: '#DC2626',
    bg: 'linear-gradient(135deg, #FEE2E2, #FECACA)',
    title: 'Último día de prueba',
    body: 'Hoy termina tu trial. Si activás ahora, mantenés todo: kits, clientes, productos. Si no, mañana pausamos el workspace.',
    cta: 'Activar para no perder nada',
    secondary: 'Decidir más tarde',
  },
  expired: {
    daysLeft: -1,
    icon: 'fa-pause',
    color: '#6B7280',
    bg: 'linear-gradient(135deg, #F3F4F6, #E5E7EB)',
    title: 'Tu workspace está pausado',
    body: 'Tus datos están guardados. Activá tu plan para retomar exactamente donde quedaste.',
    cta: 'Reactivar workspace',
    secondary: 'Salir',
  },
}

const STORAGE_PREFIX = 'anma_trial_milestone_'

function getCurrentMilestone(trial) {
  if (!trial?.isTrial) return null
  const { daysLeft } = trial
  if (daysLeft === 2) return 'day_5'
  if (daysLeft === 0 && trial.active) return 'day_7'
  if (daysLeft < 0 && daysLeft >= -7) return 'expired'
  return null
}

function wasShownToday(key) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key)
    if (!raw) return false
    return raw.slice(0, 10) === new Date().toISOString().slice(0, 10)
  } catch { return false }
}

function markShownToday(key) {
  try { localStorage.setItem(STORAGE_PREFIX + key, new Date().toISOString()) } catch { /* ignorar */ }
}

export default function TrialReminderModal() {
  const { trial, user, loading } = useAuth()
  const [milestone, setMilestone] = useState(null)
  const [exiting, setExiting] = useState(false)

  useEffect(() => {
    if (loading || !user || !trial) return
    const m = getCurrentMilestone(trial)
    if (!m) return
    const delay = setTimeout(() => {
      if (!wasShownToday(m)) {
        setMilestone(m)
        markShownToday(m)
      }
    }, 2400)
    return () => clearTimeout(delay)
  }, [trial?.daysLeft, trial?.isTrial, user, loading])

  if (!milestone) return null
  const m = MILESTONES[milestone]

  const close = () => {
    setExiting(true)
    setTimeout(() => { setMilestone(null); setExiting(false) }, 280)
  }

  const goActivate = () => {
    window.open('https://api.whatsapp.com/send?phone=5491169456863&text=' + encodeURIComponent('¡Hola! Quiero activar mi plan de ANMA Regalos antes de que se venza el trial.'), '_blank')
    close()
  }

  return (
    <>
      <div onClick={close} style={{
        position: 'fixed', inset: 0, zIndex: 9998,
        background: 'rgba(15,12,60,.55)',
        backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
        opacity: exiting ? 0 : 1, transition: 'opacity .25s',
      }} />
      <div style={{
        position: 'fixed', zIndex: 9999, left: '50%', top: '50%',
        transform: `translate(-50%, -50%) ${exiting ? 'scale(.95)' : 'scale(1)'}`,
        opacity: exiting ? 0 : 1,
        width: 'calc(100vw - 28px)', maxWidth: 440,
        background: 'var(--surface, #fff)', borderRadius: 18,
        boxShadow: '0 20px 60px rgba(15,12,60,.3), 0 4px 12px rgba(0,0,0,.08)',
        overflow: 'hidden',
        transition: 'opacity .25s, transform .28s cubic-bezier(.34,1.56,.64,1)',
      }}>
        <div style={{ padding: '28px 26px 22px', background: m.bg, textAlign: 'center', position: 'relative' }}>
          <button onClick={close} aria-label="Cerrar" style={{
            position: 'absolute', top: 12, right: 12,
            width: 30, height: 30, borderRadius: 8,
            background: 'rgba(255,255,255,.6)', border: 'none',
            color: 'var(--txt2)', cursor: 'pointer', fontSize: 14,
          }}>
            <i className="fa fa-xmark" />
          </button>
          <div style={{
            width: 60, height: 60, borderRadius: 18, background: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 14px', color: m.color, fontSize: 26,
            boxShadow: '0 8px 24px rgba(0,0,0,.12)',
          }}>
            <i className={`fa ${m.icon}`} />
          </div>
          <h2 style={{ fontSize: 19, fontWeight: 800, color: '#1f1f1f', margin: '0 0 4px', letterSpacing: '-.3px', lineHeight: 1.2 }}>
            {m.title}
          </h2>
        </div>

        <div style={{ padding: '20px 26px 22px' }}>
          <p style={{ fontSize: 14, color: 'var(--txt2)', margin: '0 0 22px', lineHeight: 1.6, textAlign: 'center' }}>
            {m.body}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button onClick={goActivate} style={{
              width: '100%', padding: '13px 18px', borderRadius: 11, border: 'none',
              background: `linear-gradient(135deg, ${m.color}, ${m.color}dd)`,
              color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              boxShadow: `0 6px 20px ${m.color}40`,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              <i className="fa-brands fa-whatsapp" />
              {m.cta}
            </button>
            <button onClick={close} style={{
              width: '100%', padding: '12px 18px', borderRadius: 11,
              background: 'transparent', border: '1.5px solid var(--border, #e5e7eb)',
              color: 'var(--txt3, #6B7280)', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
              {m.secondary}
            </button>
          </div>
          <div style={{ marginTop: 14, fontSize: 11, color: 'var(--txt4, #9ca3af)', textAlign: 'center', lineHeight: 1.5 }}>
            <i className="fa fa-shield-halved" style={{ marginRight: 5, color: m.color }} />
            Sin contratos · Cancelás cuando quieras · Datos guardados 90 días
          </div>
        </div>
      </div>
    </>
  )
}
