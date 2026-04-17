import { useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import NotificationBell from './NotificationBell'
import { useTaskFab } from '../../context/TaskFabContext'
import { usePrivacy } from '../../context/PrivacyContext'

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
  const { hidden, toggle } = usePrivacy()

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
      <div style={{ flex: 1 }} />
      <button
  className="tb-btn"
  onClick={toggle}
  title={hidden ? 'Mostrar datos financieros' : 'Ocultar datos financieros'}
  style={{
    background: hidden ? '#FEE2E2' : 'var(--surface2)',
    color: hidden ? '#DC2626' : 'var(--txt3)',
    borderRadius: 10,
    width: 36,
    height: 36,
    fontSize: 14,
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    transition: 'background .2s, color .2s',
  }}
>
  <i className={`fa ${hidden ? 'fa-eye-slash' : 'fa-eye'}`} />
</button>
      <NotificationBell />
      <button
        className="tb-btn"
        onClick={() => setPanelOpen(o => !o)}
        aria-label="Notas y recordatorios"
        title="Notas y recordatorios"
        style={{
          position: 'relative',
          background: panelOpen ? '#7C3AED' : '#EDE9FE',
          color: panelOpen ? '#fff' : '#7C3AED',
          borderRadius: 10,
          width: 36,
          height: 36,
          fontSize: 15,
          transition: 'background .2s, color .2s',
          border: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
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
