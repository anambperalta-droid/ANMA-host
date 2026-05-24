import { createContext, useContext, useState, useCallback, useRef } from 'react'

const Ctx = createContext()

/*
  useConfirm() → confirm(msgOrOpts, onConfirm)

  Simple:
    confirm('¿Eliminar producto?', () => deleteEntity('products', id))

  Con opciones:
    confirm({ body: '...', danger: true, confirmLabel: 'Eliminar' }, () => doAction())

  Con texto requerido (doble confirmación):
    confirm({ body: '...', danger: true, requireText: 'ELIMINAR', confirmLabel: 'Eliminar' }, () => doAction())
*/
export function ConfirmProvider({ children }) {
  const [modal, setModal]   = useState(null)
  const [typed, setTyped]   = useState('')
  const cbRef               = useRef(null)

  const confirm = useCallback((msgOrOpts, onConfirm) => {
    const opts = typeof msgOrOpts === 'string' ? { body: msgOrOpts } : msgOrOpts
    cbRef.current = onConfirm || null
    setTyped('')
    setModal({
      body:         opts.body || '',
      danger:       opts.danger ?? false,
      confirmLabel: opts.confirmLabel || 'Confirmar',
      cancelLabel:  opts.cancelLabel  || 'Cancelar',
      requireText:  opts.requireText  || null,
    })
  }, [])

  const handleConfirm = () => {
    setModal(null)
    cbRef.current?.()
    cbRef.current = null
  }

  const handleCancel = () => {
    setModal(null)
    cbRef.current = null
  }

  const canConfirm = !modal?.requireText || typed === modal?.requireText

  return (
    <Ctx.Provider value={confirm}>
      {children}
      {modal && (
        <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) handleCancel() }}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="mh">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <i className={`fa ${modal.danger ? 'fa-triangle-exclamation' : 'fa-circle-question'}`}
                   style={{ color: modal.danger ? 'var(--red)' : 'var(--brand)', fontSize: 16 }} />
                {modal.danger ? 'Atención' : 'Confirmar acción'}
              </h3>
              <button className="mclose" onClick={handleCancel}><i className="fa fa-xmark" /></button>
            </div>

            <p style={{ fontSize: 13, color: 'var(--txt2)', margin: '0 0 16px', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
              {modal.body}
            </p>

            {modal.requireText && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: 'var(--txt3)', marginBottom: 6 }}>
                  Escribí <strong style={{ color: 'var(--txt)' }}>{modal.requireText}</strong> para confirmar:
                </div>
                <input
                  className="f-inp"
                  value={typed}
                  onChange={e => setTyped(e.target.value)}
                  placeholder={modal.requireText}
                  autoFocus
                  style={{ width: '100%', boxSizing: 'border-box' }}
                  onKeyDown={e => { if (e.key === 'Enter' && canConfirm) handleConfirm() }}
                />
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={handleCancel}>{modal.cancelLabel}</button>
              <button
                className="btn btn-primary"
                onClick={handleConfirm}
                disabled={!canConfirm}
                style={{
                  background:   modal.danger ? 'var(--red)'    : undefined,
                  borderColor:  modal.danger ? 'var(--red)'    : undefined,
                  opacity:      canConfirm   ? 1                : 0.4,
                  cursor:       canConfirm   ? 'pointer'        : 'not-allowed',
                }}
              >
                {modal.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  )
}

export const useConfirm = () => useContext(Ctx)
