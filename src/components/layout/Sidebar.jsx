import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useData } from '../../context/DataContext'
import { prefetchRoute } from '../../lib/routes'

// `perm` define quién ve cada entrada (owner ve todo, operator solo coincidencias).
// `ownerOnly: true` = oculto para operator siempre.
const NAV = [
  { section: 'Gestión' },
  { path: '/', icon: 'fa-chart-line', label: 'Dashboard', chipKey: 'budgets', perm: 'dashboard.view' },
  { path: '/presupuesto', icon: 'fa-file-invoice-dollar', label: 'Presupuesto', perm: 'pedido.create' },
  { path: '/clientes', icon: 'fa-users', label: 'Clientes', chipKey: 'clients', perm: 'cliente.view' },
  { section: 'Catálogo' },
  { path: '/catalogo', icon: 'fa-box-open', label: 'Productos', chipKey: 'products', perm: 'catalogo.view' },
  { path: '/proveedores', icon: 'fa-industry', label: 'Proveedores', chipKey: 'suppliers', perm: 'proveedor.view' },
  { path: '/insumos', icon: 'fa-cubes', label: 'Packaging', perm: 'catalogo.view' },
  { path: '/logistica', icon: 'fa-truck-fast', label: 'Logística', perm: 'logistica.view' },
  { section: 'Comunicación' },
  { path: '/mensajes', icon: 'fa-brands fa-whatsapp', label: 'Mensajes WA', perm: 'mensajes.view' },
  { section: 'Ayuda' },
  { path: '/guia', icon: 'fa-book-open', label: 'Guía completa' },
  { section: 'Sistema', ownerOnly: true },
  { path: '/config', icon: 'fa-gear', label: 'Configuración', ownerOnly: true },
]

export default function Sidebar({ open, onClose, collapsed }) {
  const loc = useLocation()
  const nav = useNavigate()
  const { logout, role, can, isGlobalAdmin } = useAuth()
  const { get, config } = useData()
  const c = config()
  const name = c.businessName || 'ANMA'
  const sub = c.subtitle || 'Tu negocio en un solo lugar'
  const email = c.email || ''
  const userName = email.split('@')[0] || 'Administrador'

  const goTo = (path) => { nav(path); onClose() }

  const doBackup = () => {
    const data = { budgets: get('budgets'), clients: get('clients'), products: get('products'), suppliers: get('suppliers'), tariffs: get('tariffs'), shipments: get('shipments'), waTemplates: get('waTemplates'), cfg: config() }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = `ANMA_backup_${new Date().toISOString().slice(0,10)}.json`; a.click()
  }

  return (
    <aside className={`sidebar ${open ? 'open' : ''}${collapsed ? ' slim' : ''}`}>
      <div className="sb-top">
        <div className="sb-logo-row">
          <div className="sb-logo">
            {c.logo ? <img src={c.logo} alt="" /> : name.slice(0, 2).toUpperCase()}
          </div>
          <div className="sb-logo-txt">
            <div className="n">{name}</div>
            <div className="s">{sub}</div>
          </div>
        </div>
      </div>
      <nav className="sb-nav">
        {NAV.map((item, i) => {
          if (role === 'operator') {
            if (item.ownerOnly) return null
            if (item.perm && !can(item.perm)) return null
          }
          if (item.section) return <div key={i} className="sb-sec">{item.section}</div>
          const active = loc.pathname === item.path || (item.path === '/presupuesto' && loc.pathname.startsWith('/presupuesto'))
          return (
            <div
              key={item.path}
              className={`sb-item ${active ? 'active' : ''}`}
              data-tip={item.label}
              onClick={() => goTo(item.path)}
              onMouseEnter={() => prefetchRoute(item.path)}
              onTouchStart={() => prefetchRoute(item.path)}
              onFocus={() => prefetchRoute(item.path)}
              role="link"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goTo(item.path) } }}
            >
              <i className={`fa ${item.icon}`} />
              <span className="sb-lbl">{item.label}</span>
            </div>
          )
        })}
        {role === 'owner' && (
          <div className="sb-item" data-tip="Backup" onClick={doBackup}><i className="fa fa-cloud-arrow-down" /><span className="sb-lbl">Backup</span></div>
        )}
        {isGlobalAdmin && (
          <>
            <div className="sb-sec">Super admin</div>
            <div className={`sb-item ${loc.pathname === '/admin' ? 'active' : ''}`} data-tip="Admin · Workspaces" onClick={() => goTo('/admin')}>
              <i className="fa fa-shield-halved" /><span className="sb-lbl">Admin · Workspaces</span>
            </div>
          </>
        )}
      </nav>
      <div className="sb-foot">
        <div className="sb-user" onClick={logout}>
          <div className="sb-ava">{(userName[0] || 'A').toUpperCase()}</div>
          <div><div className="sb-uname">{userName}</div><div className="sb-urole">{role === 'operator' ? 'Operador · Cerrar sesión' : 'Cerrar sesión'}</div></div>
          <i className="fa fa-right-from-bracket" style={{ marginLeft: 'auto', color: 'rgba(255,255,255,.25)', fontSize: 13 }} />
        </div>
        {/* Versión del build — útil para detectar caché viejo del usuario */}
        <div className="sb-version" title="Versión del build — si reportás un bug, mencionalo">
          v{__BUILD_VERSION__}
        </div>
      </div>
    </aside>
  )
}
