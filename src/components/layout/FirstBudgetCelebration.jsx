import { useEffect, useState, useRef } from 'react'
import { useAuth } from '../../context/AuthContext'

/**
 * FirstBudgetCelebration — overlay celebratorio al primer pedido en ANMA Regalos.
 * Espejo del de Pro, con copy adaptado.
 */
const key = (userId) => `anma_first_budget_done_${userId || 'anon'}`

export function isFirstBudget(userId) {
  try { return !localStorage.getItem(key(userId)) } catch { return false }
}

export function markFirstBudgetCelebrated(userId) {
  try { localStorage.setItem(key(userId), new Date().toISOString()) } catch { /* ignorar */ }
}

export default function FirstBudgetCelebration() {
  const { user } = useAuth()
  const [show, setShow]   = useState(false)
  const [exiting, setExiting] = useState(false)
  const dismissTimer = useRef(null)

  useEffect(() => {
    const onFire = () => {
      if (!isFirstBudget(user?.id)) return
      markFirstBudgetCelebrated(user?.id)
      setShow(true)
      dismissTimer.current = setTimeout(close, 5000)
    }
    window.addEventListener('anma:first-budget-saved', onFire)
    return () => {
      window.removeEventListener('anma:first-budget-saved', onFire)
      if (dismissTimer.current) clearTimeout(dismissTimer.current)
    }
  }, [])

  const close = () => {
    setExiting(true)
    setTimeout(() => { setShow(false); setExiting(false) }, 300)
  }

  if (!show) return null

  const PARTICLES = Array.from({ length: 24 }, (_, i) => ({
    left: (i * 4.17) % 100,
    delay: (i * 0.12) % 1.4,
    duration: 2.5 + ((i * 0.13) % 1.5),
    color: ['#7C3AED', '#D946EF', '#F59E0B', '#2563EB', '#EC4899', '#10B981'][i % 6],
    size: 6 + (i % 4) * 2,
    rotateStart: (i * 47) % 360,
  }))

  return (
    <>
      <style>{`
        @keyframes anma-confetti-fall {
          0% { transform: translateY(-20vh) rotate(0deg); opacity: 0 }
          10% { opacity: 1 }
          90% { opacity: 1 }
          100% { transform: translateY(120vh) rotate(720deg); opacity: 0 }
        }
        @keyframes anma-pop-in {
          0% { transform: scale(.6); opacity: 0 }
          60% { transform: scale(1.05); opacity: 1 }
          100% { transform: scale(1); opacity: 1 }
        }
        @keyframes anma-pulse-ring {
          0% { transform: scale(.95); opacity: .8 }
          100% { transform: scale(1.5); opacity: 0 }
        }
        @keyframes anma-shimmer {
          0% { background-position: -200% 50% }
          100% { background-position: 200% 50% }
        }
      `}</style>

      <div aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: 9997, pointerEvents: 'none', overflow: 'hidden' }}>
        {PARTICLES.map((p, i) => (
          <span key={i} style={{
            position: 'absolute', top: '-5vh', left: `${p.left}%`,
            width: p.size, height: p.size, background: p.color,
            borderRadius: i % 3 === 0 ? '50%' : i % 3 === 1 ? '2px' : '0',
            transform: `rotate(${p.rotateStart}deg)`,
            animation: `anma-confetti-fall ${p.duration}s ${p.delay}s ease-in forwards`,
            opacity: 0,
          }} />
        ))}
      </div>

      <div onClick={close} style={{
        position: 'fixed', inset: 0, zIndex: 9998,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20, background: 'rgba(15, 12, 60, .35)',
        backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)',
        opacity: exiting ? 0 : 1, transition: 'opacity .3s', cursor: 'pointer',
      }}>
        <div onClick={e => e.stopPropagation()} style={{
          position: 'relative', background: 'var(--surface, #fff)', borderRadius: 22,
          padding: '36px 32px 28px', maxWidth: 380, width: '100%', textAlign: 'center',
          boxShadow: '0 25px 70px rgba(15,12,60,.3), 0 8px 20px rgba(124,58,237,.18)',
          animation: exiting ? 'none' : 'anma-pop-in .4s cubic-bezier(.34,1.56,.64,1) both',
          cursor: 'auto',
        }}>
          <div style={{ position: 'relative', width: 76, height: 76, margin: '0 auto 18px' }}>
            <span style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              background: 'linear-gradient(135deg, #D946EF, #EC4899)',
              animation: 'anma-pulse-ring 1.6s ease-out infinite',
            }} />
            <div style={{
              position: 'relative', width: 76, height: 76, borderRadius: '50%',
              background: 'linear-gradient(135deg, #D946EF, #EC4899)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 34, boxShadow: '0 10px 30px rgba(217,70,239,.4)',
            }}>
              <i className="fa fa-gift" />
            </div>
          </div>

          <h2 style={{
            fontSize: 22, fontWeight: 800, margin: '0 0 8px', letterSpacing: '-.4px',
            background: 'linear-gradient(90deg, #7C3AED, #D946EF, #7C3AED)',
            backgroundSize: '200% 100%',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            backgroundClip: 'text', animation: 'anma-shimmer 3s linear infinite',
          }}>
            ¡Tu primer pedido!
          </h2>

          <p style={{ fontSize: 13.5, color: 'var(--txt2, #374151)', margin: '0 0 22px', lineHeight: 1.6 }}>
            Acabás de armar tu primer pedido en ANMA Regalos. <br/>
            Mandalo por WhatsApp y empezá a vender.
          </p>

          <button onClick={close} style={{
            padding: '12px 28px', borderRadius: 12, border: 'none',
            background: 'linear-gradient(135deg, #7C3AED, #D946EF)',
            color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            boxShadow: '0 8px 22px rgba(124,58,237,.35)',
            display: 'inline-flex', alignItems: 'center', gap: 8,
          }}>
            <i className="fa fa-rocket" /> Seguir armando
          </button>

          <div style={{
            marginTop: 18, fontSize: 11, color: 'var(--txt4, #9ca3af)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            <i className="fa fa-lightbulb" style={{ color: '#F59E0B' }} />
            Cargá más kits para ver tus métricas en el Dashboard.
          </div>
        </div>
      </div>
    </>
  )
}
