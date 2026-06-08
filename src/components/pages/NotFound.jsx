import { useNavigate, useLocation } from 'react-router-dom'

export default function NotFound() {
  const nav = useNavigate()
  const loc = useLocation()

  return (
    <div style={{
      minHeight: 'calc(100vh - 120px)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '40px 20px', textAlign: 'center',
    }}>
      <div style={{
        width: 96, height: 96, borderRadius: '50%',
        background: 'linear-gradient(135deg, var(--brand-xlt), rgba(124,58,237,.18))',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 20, fontSize: 40,
      }}>
        🎁
      </div>
      <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--txt)', margin: '0 0 8px', letterSpacing: '-.4px' }}>
        Esta página no existe
      </h1>
      <p style={{ fontSize: 14, color: 'var(--txt3)', margin: '0 0 6px', maxWidth: 420, lineHeight: 1.55 }}>
        No encontramos lo que buscás. Puede que el link sea viejo o que la sección haya cambiado.
      </p>
      <code style={{ fontSize: 11, color: 'var(--txt4)', background: 'var(--surface2)', padding: '4px 10px', borderRadius: 6, marginBottom: 24, maxWidth: '100%', wordBreak: 'break-all' }}>
        {loc.pathname}
      </code>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button onClick={() => nav('/')} className="btn btn-primary" style={{ padding: '11px 22px', fontSize: 14 }}>
          <i className="fa fa-house" /> Ir al inicio
        </button>
        <button onClick={() => nav(-1)} className="btn btn-secondary" style={{ padding: '11px 22px', fontSize: 14 }}>
          <i className="fa fa-arrow-left" /> Volver
        </button>
      </div>
    </div>
  )
}
