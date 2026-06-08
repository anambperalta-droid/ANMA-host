import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'

/**
 * WelcomeTour — coachmark tour de 4 pasos para usuarios nuevos de ANMA Regalos.
 * Espejo del de Pro, adaptado al lenguaje del producto (kits de regalo).
 */
const TOUR_KEY = 'anma_welcome_tour_done'
const STEPS = [
  {
    icon: 'fa-chart-line', color: '#7C3AED',
    title: '¡Bienvenido a ANMA Regalos!',
    body: 'Acá vas a ver la salud completa de tu negocio de regalos: ventas, cobros, alertas y estado de pedidos.',
    cta: 'Próximo',
  },
  {
    icon: 'fa-gift', color: '#D946EF',
    title: 'Armá tu primer kit',
    body: 'Cada kit junta productos + packaging en un click. El sistema calcula costo, margen y precio final automáticamente.',
    cta: 'Siguiente',
  },
  {
    icon: 'fa-users', color: '#D97706',
    title: 'Tu base de clientes',
    body: 'Cada cliente con su historial de regalos, contactos y último pedido. Importá los que ya tenés.',
    cta: 'Siguiente',
  },
  {
    icon: 'fa-cube', color: '#2563EB',
    title: 'Catálogo + packaging',
    body: 'Cargá productos y packaging una vez. El stock se descuenta solo al confirmar pedidos.',
    cta: '¡Empezar!',
  },
]

export default function WelcomeTour() {
  const { user, trial, loading } = useAuth()
  const [step, setStep]   = useState(0)
  const [show, setShow]   = useState(false)
  const [exiting, setExiting] = useState(false)

  useEffect(() => {
    if (loading || !user || !trial?.isTrial) return
    try {
      const done = localStorage.getItem(TOUR_KEY)
      if (!done) {
        const t = setTimeout(() => setShow(true), 1200)
        return () => clearTimeout(t)
      }
    } catch { /* ignorar */ }
  }, [user, trial?.isTrial, loading])

  const finish = () => {
    try { localStorage.setItem(TOUR_KEY, new Date().toISOString()) } catch { /* ignorar */ }
    setExiting(true)
    setTimeout(() => { setShow(false); setExiting(false) }, 280)
  }

  const next = () => {
    if (step < STEPS.length - 1) setStep(s => s + 1)
    else finish()
  }
  const prev = () => { if (step > 0) setStep(s => s - 1) }

  if (!show) return null
  const s = STEPS[step]

  return (
    <>
      <div onClick={finish} style={{
        position: 'fixed', inset: 0, zIndex: 9998,
        background: 'rgba(15, 12, 60, .55)',
        backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
        opacity: exiting ? 0 : 1, transition: 'opacity .25s',
      }} />
      <div style={{
        position: 'fixed', zIndex: 9999,
        left: '50%', bottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)',
        transform: `translateX(-50%) ${exiting ? 'translateY(20px)' : 'translateY(0)'}`,
        opacity: exiting ? 0 : 1,
        width: 'calc(100vw - 28px)', maxWidth: 440,
        background: 'var(--surface, #fff)', borderRadius: 18,
        boxShadow: '0 20px 60px rgba(15,12,60,.25), 0 4px 12px rgba(0,0,0,.08)',
        overflow: 'hidden',
        transition: 'opacity .25s, transform .28s cubic-bezier(.4,0,.2,1)',
      }}>
        <div style={{
          padding: '24px 24px 20px',
          background: `linear-gradient(135deg, ${s.color}10, ${s.color}05)`,
          borderBottom: '1px solid var(--border, #e5e7eb)',
          display: 'flex', alignItems: 'flex-start', gap: 14,
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14,
            background: `linear-gradient(135deg, ${s.color}, ${s.color}cc)`,
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, flexShrink: 0, boxShadow: `0 6px 18px ${s.color}40`,
          }}>
            <i className={`fa ${s.icon}`} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: s.color, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 4 }}>
              Paso {step + 1} de {STEPS.length}
            </div>
            <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--txt, #111)', margin: 0, letterSpacing: '-.3px', lineHeight: 1.3 }}>
              {s.title}
            </h3>
          </div>
          <button onClick={finish} aria-label="Cerrar tour" style={{
            width: 30, height: 30, borderRadius: 8,
            background: 'transparent', border: 'none', color: 'var(--txt3, #6b7280)',
            cursor: 'pointer', flexShrink: 0, fontSize: 14,
          }}>
            <i className="fa fa-xmark" />
          </button>
        </div>
        <div style={{ padding: '18px 24px 6px' }}>
          <p style={{ fontSize: 13.5, color: 'var(--txt2, #374151)', margin: 0, lineHeight: 1.6 }}>{s.body}</p>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, padding: '14px 24px 6px' }}>
          {STEPS.map((_, i) => (
            <span key={i} style={{
              width: i === step ? 22 : 6, height: 6, borderRadius: 99,
              background: i === step ? s.color : 'var(--border, #e5e7eb)',
              transition: 'width .25s, background .25s',
            }} />
          ))}
        </div>
        <div style={{ padding: '10px 18px 18px', display: 'flex', gap: 8, alignItems: 'center' }}>
          {step > 0 ? (
            <button onClick={prev} style={{
              padding: '10px 16px', borderRadius: 10,
              background: 'transparent', border: '1.5px solid var(--border, #e5e7eb)',
              color: 'var(--txt2, #374151)', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
            }}>
              <i className="fa fa-arrow-left" />
            </button>
          ) : (
            <button onClick={finish} style={{
              padding: '10px 14px', borderRadius: 10,
              background: 'transparent', border: 'none',
              color: 'var(--txt3, #6b7280)', fontSize: 12.5, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
              Saltar
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button onClick={next} style={{
            padding: '10px 22px', borderRadius: 10, border: 'none',
            background: `linear-gradient(135deg, ${s.color}, ${s.color}dd)`,
            color: '#fff', fontSize: 13, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit',
            boxShadow: `0 4px 14px ${s.color}40`,
            display: 'inline-flex', alignItems: 'center', gap: 7,
          }}>
            {s.cta}
            {step < STEPS.length - 1 && <i className="fa fa-arrow-right" style={{ fontSize: 11 }} />}
            {step === STEPS.length - 1 && <i className="fa fa-rocket" style={{ fontSize: 12 }} />}
          </button>
        </div>
      </div>
    </>
  )
}
