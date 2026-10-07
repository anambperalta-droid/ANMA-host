import { createContext, useContext, useState, useCallback, useRef } from 'react'

const Ctx = createContext()

/* API:
 *   toast('Guardado', 'ok')                                    — toast simple (3.5s)
 *   toast('Cliente eliminado', 'in', { undo: () => restore() })  — con botón Deshacer (8s)
 *   toast('Error', 'er')                                        — error (3.5s)
 * Backward compatible: llamadas con 2 args mantienen comportamiento previo. */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef(new Map())

  const dismiss = useCallback((id) => {
    const tm = timers.current.get(id)
    if (tm) { clearTimeout(tm); timers.current.delete(id) }
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback((msg, type = 'in', opts = {}) => {
    const id = Date.now() + Math.random()
    const hasUndo = typeof opts.undo === 'function'
    const ttl = hasUndo ? 8000 : 3500
    setToasts((prev) => [...prev, { id, msg, type, undo: opts.undo || null, undoLabel: opts.undoLabel || 'Deshacer' }])
    const tm = setTimeout(() => dismiss(id), ttl)
    timers.current.set(id, tm)
  }, [dismiss])

  const handleUndo = (t) => {
    try { t.undo?.() } finally { dismiss(t.id) }
  }

  return (
    <Ctx.Provider value={toast}>
      {children}
      <div className="toast-hub">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            <i className={`fa ${t.type === 'ok' ? 'fa-circle-check' : t.type === 'er' ? 'fa-circle-exclamation' : 'fa-circle-info'}`} />
            <span>{t.msg}</span>
            {t.undo && (
              <button
                onClick={() => handleUndo(t)}
                style={{ marginLeft: 10, background: 'rgba(255,255,255,.18)', border: '1px solid rgba(255,255,255,.3)', color: '#fff', fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'uppercase', letterSpacing: '.5px' }}
              >
                {t.undoLabel}
              </button>
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

export const useToast = () => useContext(Ctx)
