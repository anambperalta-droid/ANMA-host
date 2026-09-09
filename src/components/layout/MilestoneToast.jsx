import { useEffect, useState, useRef } from 'react'
import { useAuth } from '../../context/AuthContext'

/**
 * MilestoneToast — pop-up de logro / refuerzo positivo.
 *
 * Filosofía: "Intuitive design isn't about adding clarity.
 * It's about removing confusion." — el toast celebra lo bueno,
 * sin obligar al usuario a leer nada obligatorio.
 *
 * Diseño: card compacta en la esquina inferior derecha, animación de
 * entrada suave desde abajo, mini-confetti (8 partículas), auto-dismiss
 * en 5s. NO bloquea la app — solo aparece, celebra y se va.
 *
 * Trigger:
 *   window.dispatchEvent(new CustomEvent('anma:milestone', {
 *     detail: { id: 'client-first', title: '...', body: '...', icon: 'fa-users' }
 *   }))
 *
 * Persistencia: cada milestone id se guarda por usuario en localStorage
 * → solo se dispara UNA VEZ por usuario.
 */

const key = (userId, milestoneId) => `anma_milestone_${milestoneId}_${userId || 'anon'}`

export function isMilestoneUnseen(userId, milestoneId) {
  try { return !localStorage.getItem(key(userId, milestoneId)) } catch { return false }
}

export function markMilestoneSeen(userId, milestoneId) {
  try { localStorage.setItem(key(userId, milestoneId), new Date().toISOString()) } catch { /* ignorar */ }
}

/**
 * Helper para disparar desde cualquier lugar de la app.
 * Ejemplo:
 *   triggerMilestone('client-first', {
 *     title: '¡Primer cliente cargado!',
 *     body: 'Ya tenés a quién venderle. Ahora armale su primer presupuesto.',
 *     icon: 'fa-users',
 *   })
 */
export function triggerMilestone(id, opts = {}) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('anma:milestone', {
    detail: { id, ...opts },
  }))
}

const DEFAULT_GRADIENT = 'linear-gradient(135deg, #7C3AED, #059669)'

export default function MilestoneToast() {
  const { user } = useAuth()
  const [queue, setQueue] = useState([])   // stack — múltiples milestones seguidos
  const [current, setCurrent] = useState(null)
  const [exiting, setExiting] = useState(false)
  const dismissTimer = useRef(null)

  // Suscripción global al evento
  useEffect(() => {
    const onFire = (ev) => {
      const detail = ev?.detail
      if (!detail?.id) return
      if (!isMilestoneUnseen(user?.id, detail.id)) return
      markMilestoneSeen(user?.id, detail.id)
      setQueue(q => [...q, detail])
    }
    window.addEventListener('anma:milestone', onFire)
    return () => window.removeEventListener('anma:milestone', onFire)
  }, [user])

  // Procesar cola: mostrar 1 a la vez
  useEffect(() => {
    if (current || queue.length === 0) return
    const [next, ...rest] = queue
    setQueue(rest)
    setCurrent(next)
    // Auto-dismiss en 5.5s
    dismissTimer.current = setTimeout(close, 5500)
    return () => { if (dismissTimer.current) clearTimeout(dismissTimer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, current])

  const close = () => {
    setExiting(true)
    setTimeout(() => { setCurrent(null); setExiting(false) }, 260)
  }

  if (!current) return null

  const gradient = current.gradient || DEFAULT_GRADIENT
  const icon = current.icon || 'fa-trophy'

  // 8 partículas de confetti minimalista (no invasivo — solo un toque)
  const PARTICLES = Array.from({ length: 8 }, (_, i) => ({
    left: 10 + (i * 11) % 80,
    delay: (i * 0.08) % 0.6,
    duration: 1.8 + ((i * 0.15) % 1.2),
    color: ['#7C3AED', '#059669', '#F59E0B', '#EC4899', '#2563EB'][i % 5],
    size: 5 + (i % 3) * 2,
  }))

  return (
    <>
      <style>{`
        @keyframes anma-mt-slide-in {
          0% { transform: translateY(120%); opacity: 0 }
          80% { transform: translateY(-4px); opacity: 1 }
          100% { transform: translateY(0); opacity: 1 }
        }
        @keyframes anma-mt-slide-out {
          0% { transform: translateY(0); opacity: 1 }
          100% { transform: translateY(120%); opacity: 0 }
        }
        @keyframes anma-mt-icon-pop {
          0% { transform: scale(.5) rotate(-15deg); opacity: 0 }
          60% { transform: scale(1.15) rotate(8deg); opacity: 1 }
          100% { transform: scale(1) rotate(0); opacity: 1 }
        }
        @keyframes anma-mt-confetti {
          0% { transform: translateY(0) rotate(0); opacity: 0 }
          15% { opacity: 1 }
          100% { transform: translateY(-90px) rotate(360deg); opacity: 0 }
        }
        @keyframes anma-mt-progress {
          0% { transform: translateX(-100%) }
          100% { transform: translateX(0) }
        }
        .anma-mt-container{
          position:fixed;
          right:20px;bottom:20px;
          z-index:9996;
          max-width:340px;
          width:calc(100vw - 40px);
          pointer-events:none;
        }
        @media (max-width:640px){
          .anma-mt-container{
            left:16px;right:16px;bottom:calc(76px + env(safe-area-inset-bottom,0px));
            max-width:none;width:auto;
          }
        }
      `}</style>

      <div className="anma-mt-container">
        <div
          onClick={close}
          role="button" tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Escape') close() }}
          style={{
            position: 'relative',
            background: 'var(--surface, #fff)',
            border: '1px solid var(--border, #E5E7EB)',
            borderRadius: 16,
            padding: '16px 18px 14px 68px',
            boxShadow: '0 20px 40px rgba(15,12,60,.22), 0 4px 12px rgba(15,12,60,.08)',
            cursor: 'pointer',
            pointerEvents: 'auto',
            overflow: 'hidden',
            animation: exiting
              ? 'anma-mt-slide-out .26s ease-in forwards'
              : 'anma-mt-slide-in .42s cubic-bezier(.22,1.35,.4,1) both',
            fontFamily: 'inherit',
          }}
        >
          {/* Mini-confetti sobre el icono (top-left area) */}
          <div aria-hidden="true" style={{
            position: 'absolute',
            top: 8, left: 8, width: 60, height: 60,
            pointerEvents: 'none',
          }}>
            {PARTICLES.map((p, i) => (
              <span key={i} style={{
                position: 'absolute',
                bottom: 22, left: `${p.left}%`,
                width: p.size, height: p.size,
                background: p.color,
                borderRadius: i % 3 === 0 ? '50%' : i % 3 === 1 ? '2px' : '0',
                animation: `anma-mt-confetti ${p.duration}s ${p.delay}s ease-out forwards`,
                opacity: 0,
              }} />
            ))}
          </div>

          {/* Icono con gradient del milestone */}
          <div style={{
            position: 'absolute',
            top: 14, left: 16,
            width: 44, height: 44, borderRadius: 12,
            background: gradient,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 18,
            boxShadow: '0 8px 20px rgba(124,58,237,.28)',
            animation: 'anma-mt-icon-pop .5s .1s cubic-bezier(.34,1.56,.64,1) both',
          }}>
            <i className={`fa ${icon}`} />
          </div>

          {/* Contenido */}
          <div style={{
            fontSize: 10.5, fontWeight: 700,
            letterSpacing: '.14em', textTransform: 'uppercase',
            color: 'var(--txt3, #6B7280)', marginBottom: 3,
          }}>
            Logro desbloqueado
          </div>
          <div style={{
            fontSize: 14, fontWeight: 700,
            color: 'var(--txt, #111827)', marginBottom: 4,
            lineHeight: 1.3, letterSpacing: '-.01em',
          }}>
            {current.title || '¡Buen paso!'}
          </div>
          {current.body && (
            <div style={{
              fontSize: 12.5, color: 'var(--txt2, #4B5563)',
              lineHeight: 1.5,
            }}>
              {current.body}
            </div>
          )}

          {/* Progress bar de auto-dismiss */}
          <div aria-hidden="true" style={{
            position: 'absolute',
            left: 0, right: 0, bottom: 0,
            height: 3,
            background: 'transparent',
            overflow: 'hidden',
          }}>
            <div style={{
              width: '100%', height: '100%',
              background: gradient,
              transform: 'translateX(-100%)',
              animation: 'anma-mt-progress 5.5s linear forwards',
            }} />
          </div>
        </div>
      </div>
    </>
  )
}
