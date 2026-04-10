import { useLocation } from 'react-router-dom'

const PAGE_NAMES = { '/': 'Historial', '/presupuesto': 'Presupuesto', '/clientes': 'Clientes', '/catalogo': 'Catálogo de Productos', '/proveedores': 'Proveedores', '/logistica': 'Logística', '/mensajes': 'Mensajes WhatsApp', '/config': 'Configuración' }

export default function Topbar({ onMenuClick, onSearchClick }) {
  const loc = useLocation()
  const title = PAGE_NAMES[loc.pathname] || 'ANMA'

  return (
    <header className="topbar">
      <button className="tb-btn tb-btn-menu" onClick={onMenuClick} aria-label="Menú">
        <i className="fa fa-bars" />
      </button>
      <div className="tb-page-title">{title}</div>
      <div className="tb-search" onClick={onSearchClick} style={{ cursor: 'pointer' }}>
        <i className="fa fa-magnifying-glass" />
        <input type="text" placeholder="Buscar..." readOnly style={{ cursor: 'pointer' }} />
        <span className="cmd-kbd" style={{ marginLeft: 'auto' }}>Ctrl+K</span>
      </div>
      <div className="tb-acts">
        <button className="tb-btn" onClick={onSearchClick}><i className="fa fa-bell" /></button>
        <button className="tb-btn" onClick={() => window.location.hash = '#/config'}><i className="fa fa-gear" /></button>
      </div>
    </header>
  )
}
