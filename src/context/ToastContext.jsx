import { createContext, useContext, useState, useCallback } from 'react'

const Ctx = createContext()

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const toast = useCallback((msg, type = 'in') => {
    const id = Date.now() + Math.random()
    setToasts((prev) => [...prev, { id, msg, type }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500)
  }, [])

  return (
    <Ctx.Provider value={toast}>
      {children}
      <div className="toast-hub">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            <i className={`fa ${t.type === 'ok' ? 'fa-circle-check' : t.type === 'er' ? 'fa-circle-exclamation' : 'fa-circle-info'}`} />
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

export const useToast = () => useContext(Ctx)
