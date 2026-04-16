import { useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import NotificationBell from './NotificationBell'
import { useTaskFab } from '../../context/TaskFabContext'

const PAGE_NAMES = { '/': 'Historial', '/presupuesto': 'Presupuesto', '/clientes': 'Clientes', '/catalogo': 'Catálogo de Productos', '/proveedores': 'Proveedores', '/logistica': 'Logística', '/mensajes': 'Mensajes WhatsApp', '/config': 'Configuración' }

const THEME_KEY = 'anma_theme'

function initialTheme() {
  if (typeof window === 'undefined') return 'light'
  const saved = localStorage.getItem(THEME_KEY)
  if (saved === 'dark' || saved === 'light') return saved
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export default function Topbar({ onMenuClick }) {
  const loc = useLocation()
  const title = PAGE_NAMES[loc.pathname] || 'ANMA'
  const [theme, setTheme] = useState(initialTheme)
  const { panelOpen, setPanelOpen, activeTasks } = useTaskFab()

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  const toggleTheme = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'))

  return (
    <header className="topbar">
      <button className="tb-btn tb-btn-menu" onClick={onMenuClick} aria-label="Menú">
        <i className="fa fa-bars" />
      </button>
      <div className="tb-page-title">{title}</div>
      <NotificationBell />
      <button
        className="tb-btn"
        onClick={() => setPanelOpen(o => !o)}
        aria-label="Notas y recordatorios"
        title="Notas y recordatorios"
        style={{ position: 'relative' }}
      >
        <i className={`fa ${panelOpen ? 'fa-xmark' : 'fa-clipboard-list'}`} />
        {activeTasks.length > 0 && (
          <span style={{
            position: 'absolute', top: 4, right: 4,
            background: activeTasks.some(t => t.priority === 'today') ? '#DC2626' : '#D97706',
            color: '#fff', fontSize: 8, fontWeight: 800,
            width: 14, height: 14, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1.5px solid var(--surface)',
            pointerEvents: 'none',
          }}>
            {activeTasks.length > 9 ? '9+' : activeTasks.length}
          </span>
        )}
      </button>
      <button
        className="tb-btn"
        onClick={toggleTheme}
        aria-label={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
        title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
      >
        <i className={`fa ${theme === 'dark' ? 'fa-sun' : 'fa-moon'}`} />
      </button>
    </header>
  )
}
