import { useLocation } from 'react-router-dom'
import { useEffect, useState, useRef } from 'react'
import NotificationBell from './NotificationBell'
import { useTaskFab } from '../../context/TaskFabContext'
import { usePrivacy } from '../../context/PrivacyContext'

const PAGE_NAMES = { '/': 'Dashboard', '/presupuesto': 'Presupuesto', '/clientes': 'Clientes', '/catalogo': 'Productos', '/proveedores': 'Proveedores', '/logistica': 'Logística', '/mensajes': 'Mensajes WhatsApp', '/config': 'Configuración' }

const THEME_KEY = 'anma_theme'

function initialTheme() {
  if (typeof window === 'undefined') return 'light'
  const saved = localStorage.getItem(THEME_KEY)
  if (saved === 'dark' || saved === 'light') return saved
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

// Cloud sync status: 'ok' | 'saving' | null
function useSyncStatus() {
  const [status, setStatus] = useState(null)
  const timer = useRef(null)
  useEffect(() => {
    const onWrite = () => {
      setStatus('saving')
      clearTimeout(timer.current)
    }
    const onSaved = () => {
      setStatus('ok')
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setStatus(null), 3000)
    }
    window.addEventListener('anma:cloud-saved', onSaved)
    // show 'saving' when a write is queued (debounced push not fired yet)
    window.addEventListener('anma:synced', onSaved)
    return () => {
      window.removeEventListener('anma:cloud-saved', onSaved)
      window.removeEventListener('anma:synced', onSaved)
      clearTimeout(timer.current)
    }
  }, [])
  return status
}

export default function Topbar({ onMenuClick, onCollapseClick, collapsed }) {
  const loc = useLocation()
  const title = PAGE_NAMES[loc.pathname] || 'ANMA'
  const [theme, setTheme] = useState(initialTheme)
  const { panelOpen, setPanelOpen, activeTasks, focusMode, setFocusMode } = useTaskFab()
  const { hidden, toggle } = usePrivacy()
  const syncStatus = useSyncStatus()

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
      {/* Desktop sidebar collapse toggle */}
      <button
        className="tb-btn tb-btn-collapse"
        onClick={onCollapseClick}
        title={collapsed ? 'Expandir menú lateral' : 'Colapsar menú lateral'}
        aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}
      >
        <i className="fa fa-table-columns" />
      </button>
      <span className="tb-page-title">{title}</span>
      <div style={{ flex: 1 }} />

      {/* Ocultar datos financieros */}
      <button
        className="tb-btn"
        onClick={toggle}
        title={hidden ? 'Mostrar datos financieros' : 'Ocultar datos financieros'}
        style={{
          background: hidden ? '#FEE2E2' : 'var(--surface2)',
          color: hidden ? '#DC2626' : 'var(--txt3)',
          borderRadius: 10, width: 36, height: 36, fontSize: 14, border: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, transition: 'background .2s, color .2s',
        }}
      >
        <i className={`fa ${hidden ? 'fa-eye-slash' : 'fa-eye'}`} />
      </button>

      <NotificationBell />

      {/* Tareas / Modo Enfoque — un solo botón */}
      <button
        className="tb-btn"
        onClick={() => {
          if (focusMode) { setFocusMode(false); return }
          setPanelOpen(o => !o)
        }}
        aria-label="Tareas y Modo Enfoque"
        title={focusMode ? 'Salir del Modo Enfoque' : panelOpen ? 'Cerrar tareas' : 'Ver tareas'}
        style={{
          position: 'relative',
          background: focusMode ? '#312e81' : panelOpen ? '#7C3AED' : '#EDE9FE',
          color: focusMode ? '#A5B4FC' : panelOpen ? '#fff' : '#7C3AED',
          borderRadius: 10, width: 36, height: 36, fontSize: 15,
          transition: 'background .2s, color .2s', border: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <i className={`fa ${focusMode ? 'fa-xmark' : 'fa-brain'}`} />
        {!focusMode && activeTasks.length > 0 && (
          <span style={{
            position: 'absolute', top: 4, right: 4,
            background: activeTasks.some(t => t.priority === 'today') ? '#DC2626' : '#D97706',
            color: '#fff', fontSize: 8, fontWeight: 800,
            width: 14, height: 14, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1.5px solid var(--surface)', pointerEvents: 'none',
          }}>
            {activeTasks.length > 9 ? '9+' : activeTasks.length}
          </span>
        )}
      </button>

      {/* Cloud sync indicator */}
      {syncStatus && (
        <div title={syncStatus === 'ok' ? 'Datos guardados en la nube' : 'Guardando…'} style={{
          display: 'flex', alignItems: 'center', gap: 4,
          fontSize: 11, fontWeight: 600, padding: '0 8px', height: 28,
          borderRadius: 8, transition: 'all .3s',
          background: syncStatus === 'ok' ? '#D1FAE5' : '#EDE9FE',
          color: syncStatus === 'ok' ? '#065F46' : '#7C3AED',
          border: `1px solid ${syncStatus === 'ok' ? '#A7F3D0' : '#DDD6FE'}`,
          flexShrink: 0,
        }}>
          <i className={`fa ${syncStatus === 'ok' ? 'fa-cloud-arrow-up' : 'fa-rotate fa-spin'}`} style={{ fontSize: 12 }} />
          <span className="hide-xs">{syncStatus === 'ok' ? 'Guardado' : 'Guardando'}</span>
        </div>
      )}

      {/* Tema claro/oscuro */}
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
