import { useEffect, useRef } from 'react'

/**
 * BottomSheet — Componente de menú nativo que sube desde abajo.
 *
 * Props:
 *  - open: boolean
 *  - onClose: () => void
 *  - title?: string (header opcional)
 *  - children: contenido del sheet
 */
export default function BottomSheet({ open, onClose, title, children }) {
  const sheetRef = useRef(null)

  /* Cerrar con ESC */
  useEffect(() => {
    if (!open) return
    const h = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])

  /* Bloquear scroll del body cuando está abierto */
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  return (
    <>
      <div
        className={`bsheet-overlay${open ? ' open' : ''}`}
        onClick={onClose}
      />
      <div
        ref={sheetRef}
        className={`bsheet${open ? ' open' : ''}`}
        role="dialog"
        aria-modal="true"
      >
        <div className="bsheet-handle" />
        {title && (
          <div className="bsheet-header">
            <h4>{title}</h4>
            <button
              onClick={onClose}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--txt3)', fontSize: 18, padding: 4,
              }}
              aria-label="Cerrar"
            >
              <i className="fa fa-xmark" />
            </button>
          </div>
        )}
        <div className="bsheet-body">
          {children}
        </div>
      </div>
    </>
  )
}

/**
 * BottomSheetItem — Fila individual dentro del sheet.
 *
 * Props:
 *  - icon: string (fa class, ej: 'fa-truck')
 *  - label: string
 *  - sub?: string
 *  - onClick: () => void
 *  - iconBg/iconColor?: override de colores
 */
export function BottomSheetItem({ icon, label, sub, onClick, iconBg, iconColor }) {
  return (
    <button className="bsheet-item" onClick={onClick}>
      <div
        className="bsheet-item-ico"
        style={iconBg || iconColor ? { background: iconBg, color: iconColor } : undefined}
      >
        <i className={`fa ${icon}`} />
      </div>
      <div className="bsheet-item-body">
        <div className="bsheet-item-title">{label}</div>
        {sub && <div className="bsheet-item-sub">{sub}</div>}
      </div>
      <i className="fa fa-chevron-right" style={{ color: 'var(--txt4)', fontSize: 12 }} />
    </button>
  )
}
