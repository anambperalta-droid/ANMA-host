import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

const TABS = [
  { path: '/',            icon: 'fa-house',    label: 'Inicio',    perm: 'dashboard.view' },
  { path: '/presupuesto', icon: 'fa-plus',     label: 'Pedido',    perm: 'pedido.create',  fab: true },
  { path: '/clientes',    icon: 'fa-users',    label: 'Clientes',  perm: 'cliente.view' },
  { path: '/catalogo',    icon: 'fa-box-open', label: 'Productos', perm: 'catalogo.view' },
  { path: null,           icon: 'fa-grid-2',   label: 'Más',       always: true },
]

export default function BottomNav({ onMore }) {
  const loc   = useLocation()
  const nav   = useNavigate()
  const { can } = useAuth()

  return (
    <nav className="bottom-nav" role="navigation" aria-label="Navegación principal">
      {TABS.map((t, i) => {
        if (t.perm && !can(t.perm) && !t.always) return null

        const isActive = t.path
          ? (t.path === '/' ? loc.pathname === '/' : loc.pathname.startsWith(t.path))
          : false

        if (t.fab) return (
          <button
            key={i}
            onClick={() => nav(t.path)}
            className="bn-fab"
            aria-label={t.label}
          >
            <i className={`fa ${t.icon}`} />
          </button>
        )

        if (!t.path) return (
          <button
            key={i}
            onClick={onMore}
            className={`bn-item${isActive ? ' active' : ''}`}
            aria-label={t.label}
          >
            <i className={`fa ${t.icon}`} />
            <span>{t.label}</span>
          </button>
        )

        return (
          <button
            key={i}
            onClick={() => nav(t.path)}
            className={`bn-item${isActive ? ' active' : ''}`}
            aria-label={t.label}
          >
            <i className={`fa ${t.icon}`} />
            <span>{t.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
