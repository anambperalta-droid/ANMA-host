import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useData } from '../../context/DataContext'

const NAV = [
  { section: 'Gestión' },
  { path: '/', icon: 'fa-clock-rotate-left', label: 'Historial', chipKey: 'budgets' },
  { path: '/presupuesto', icon: 'fa-file-invoice-dollar', label: 'Presupuesto' },
  { path: '/clientes', icon: 'fa-users', label: 'Clientes', chipKey: 'clients' },
  { section: 'Catálogo' },
  { path: '/catalogo', icon: 'fa-box-open', label: 'Productos', chipKey: 'products' },
  { path: '/proveedores', icon: 'fa-industry', label: 'Proveedores', chipKey: 'suppliers' },
  { path: '/logistica', icon: 'fa-truck-fast', label: 'Logística' },
  { section: 'Comunicación' },
  { path: '/mensajes', icon: 'fa-brands fa-whatsapp', label: 'Mensajes WA' },
  { section: 'Sistema' },
  { path: '/config', icon: 'fa-gear', label: 'Configuración' },
]

export default function Sidebar({ open, onClose }) {
  const loc = useLocation()
  const nav = useNavigate()
  const { logout } = useAuth()
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
    <aside className={`sidebar ${open ? 'open' : ''}`}>
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
          if (item.section) return <div key={i} className="sb-sec">{item.section}</div>
          const active = loc.pathname === item.path || (item.path === '/presupuesto' && loc.pathname.startsWith('/presupuesto'))
          const chip = item.chipKey ? get(item.chipKey).length : null
          return (
            <div key={item.path} className={`sb-item ${active ? 'active' : ''}`} onClick={() => goTo(item.path)}>
              <i className={`fa ${item.icon}`} />
              {item.label}
              {chip !== null && <span className="sb-chip">{chip}</span>}
            </div>
          )
        })}
        <div className="sb-item" onClick={doBackup}><i className="fa fa-cloud-arrow-down" />Backup</div>
      </nav>
      <div className="sb-foot">
        <div className="sb-user" onClick={logout}>
          <div className="sb-ava">{(userName[0] || 'A').toUpperCase()}</div>
          <div><div className="sb-uname">{userName}</div><div className="sb-urole">Cerrar sesión</div></div>
          <i className="fa fa-right-from-bracket" style={{ marginLeft: 'auto', color: 'rgba(255,255,255,.25)', fontSize: 13 }} />
        </div>
      </div>
    </aside>
  )
}
