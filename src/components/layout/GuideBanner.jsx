import { useState } from 'react'
import { db, dbW } from '../../lib/storage'

/**
 * Banner discreto en el dashboard que invita al usuario a leer la guía
 * completa de la app (sección por sección). Se dismissea con la X y queda
 * persistido en localStorage para no molestar después.
 *
 * Paleta rose (brand de Regalos), diferenciada del Hub que usa violeta.
 */
export default function GuideBanner() {
  const [dismissed, setDismissed] = useState(() => db('guideBannerDismissed', false))

  if (dismissed) return null

  const close = () => {
    dbW('guideBannerDismissed', true)
    setDismissed(true)
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      background: 'linear-gradient(135deg, #FDF2F8 0%, #F5EFFE 100%)',
      border: '1px solid #F3D7EA',
      borderRadius: 14,
      padding: '12px 16px',
      margin: '0 0 14px',
      boxShadow: '0 4px 14px -10px rgba(225,29,116,.2)',
    }}>
      <div style={{
        flexShrink: 0, width: 36, height: 36, borderRadius: 10,
        background: 'linear-gradient(135deg, #E11D74, #9D174D)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontSize: 15,
      }}>
        <i className="fa-solid fa-book-open" />
      </div>
      <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: '#3c3753', lineHeight: 1.45 }}>
        <strong style={{ color: '#1F1338', fontWeight: 700, display: 'block', marginBottom: 1 }}>
          ¿Recién llegás a ANMA Regalos?
        </strong>
        <span>Conocé cada sección de la app paso a paso — pensada para marcas que venden a empresas.</span>
      </div>
      <a
        href="/guia"
        style={{
          flexShrink: 0,
          background: '#E11D74', color: '#fff',
          padding: '8px 14px', borderRadius: 9,
          fontSize: 12.5, fontWeight: 700,
          textDecoration: 'none', whiteSpace: 'nowrap',
          transition: 'background .15s, transform .15s',
        }}
        onMouseOver={(e) => { e.currentTarget.style.background = '#9D174D'; e.currentTarget.style.transform = 'translateY(-1px)' }}
        onMouseOut={(e) => { e.currentTarget.style.background = '#E11D74'; e.currentTarget.style.transform = 'none' }}
      >
        Ver la guía →
      </a>
      <button
        onClick={close}
        aria-label="Cerrar"
        style={{
          flexShrink: 0, width: 28, height: 28, border: 'none',
          background: 'transparent', cursor: 'pointer',
          color: '#94909f', fontSize: 14, borderRadius: 6,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'background .15s, color .15s',
        }}
        onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,.05)'; e.currentTarget.style.color = '#1F1338' }}
        onMouseOut={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94909f' }}
      >
        <i className="fa-solid fa-xmark" />
      </button>
    </div>
  )
}
