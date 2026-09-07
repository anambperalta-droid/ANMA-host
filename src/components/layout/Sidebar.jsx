import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useData } from '../../context/DataContext'
import { useTaskFab } from '../../context/TaskFabContext'
import { usePrivacy } from '../../context/PrivacyContext'
import { prefetchRoute } from '../../lib/routes'

// Theme helpers — mismo storage que Topbar (clave 'anma_theme').
const THEME_KEY = 'anma_theme'
function readTheme() {
  if (typeof window === 'undefined') return 'light'
  const saved = localStorage.getItem(THEME_KEY)
  if (saved === 'dark' || saved === 'light') return saved
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

// `perm` define quién ve cada entrada (owner ve todo, operator solo coincidencias).
// `ownerOnly: true` = oculto para operator siempre.
const NAV = [
  { section: 'Gestión' },
  { path: '/', icon: 'fa-chart-line', label: 'Dashboard', chipKey: 'budgets', perm: 'dashboard.view' },
  { path: '/pedido', icon: 'fa-clipboard-list', label: 'Nuevo pedido', perm: 'pedido.create' },
  { path: '/clientes', icon: 'fa-users', label: 'Clientes', chipKey: 'clients', perm: 'cliente.view' },
  { section: 'Catálogo' },
  { path: '/catalogo', icon: 'fa-box-open', label: 'Productos', chipKey: 'products', perm: 'catalogo.view' },
  { path: '/proveedores', icon: 'fa-industry', label: 'Proveedores', chipKey: 'suppliers', perm: 'proveedor.view' },
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
  const { panelOpen, setPanelOpen, activeTasks, focusMode, setFocusMode } = useTaskFab()
  const { hidden, toggle: togglePrivacy } = usePrivacy()
  const [theme, setTheme] = useState(readTheme)
  useEffect(() => {
    const h = () => setTheme(readTheme())
    window.addEventListener('storage', h)
    return () => window.removeEventListener('storage', h)
  }, [])
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
    localStorage.setItem(THEME_KEY, next)
  }
  const openTasksPanel = () => {
    if (focusMode) setFocusMode(false)
    else setPanelOpen(o => !o)
    onClose()
  }
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
          const active = loc.pathname === item.path
            || (item.path === '/pedido' && (loc.pathname.startsWith('/pedido') || loc.pathname.startsWith('/presupuesto')))
            || (item.path === '/pedido' && loc.pathname.startsWith('/pedido'))
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
      {/* Ajustes rápidos — reubicados del Topbar para descongestionar mobile */}
      <div className="sb-quick-settings">
        <div className="sb-section-title">Ajustes rápidos</div>
        <button className="sb-quick-item" onClick={openTasksPanel}>
          <i className="fa fa-brain" style={{ color: 'var(--brand)' }} />
          <span className="sb-quick-lbl">
            {focusMode ? 'Salir del Modo Enfoque' : 'Tareas y Modo Enfoque'}
          </span>
          {!focusMode && activeTasks.length > 0 && (
            <span className="sb-quick-badge" style={{
              background: activeTasks.some(t => t.priority === 'today') ? '#DC2626' : '#D97706'
            }}>
              {activeTasks.length > 9 ? '9+' : activeTasks.length}
            </span>
          )}
        </button>
        <button className="sb-quick-item" onClick={() => { togglePrivacy() }}>
          <i className={`fa ${hidden ? 'fa-eye-slash' : 'fa-eye'}`} style={{ color: hidden ? '#DC2626' : 'var(--txt3)' }} />
          <span className="sb-quick-lbl">
            {hidden ? 'Mostrar datos financieros' : 'Ocultar datos financieros'}
          </span>
          <span className="sb-quick-toggle" data-on={hidden ? 'true' : 'false'} />
        </button>
        <button className="sb-quick-item" onClick={toggleTheme}>
          <i className={`fa ${theme === 'dark' ? 'fa-sun' : 'fa-moon'}`} style={{ color: 'var(--txt3)' }} />
          <span className="sb-quick-lbl">
            {theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
          </span>
          <span className="sb-quick-toggle" data-on={theme === 'dark' ? 'true' : 'false'} />
        </button>
      </div>
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
