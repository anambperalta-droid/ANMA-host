import { useLocation } from 'react-router-dom'
import { useEffect, useState, useRef } from 'react'
import NotificationBell from './NotificationBell'
import { useTaskFab } from '../../context/TaskFabContext'

const PAGE_NAMES = { '/': 'Dashboard', '/pedido': 'Nuevo pedido', '/clientes': 'Clientes', '/catalogo': 'Productos', '/proveedores': 'Proveedores', '/logistica': 'Logística', '/mensajes': 'Mensajes WhatsApp', '/insumos': 'Packaging', '/config': 'Configuración' }

const THEME_KEY = 'anma_theme'

// Aplica el theme guardado al cargar. La lógica de UI vive en el Sidebar > Ajustes rápidos.
function initialTheme() {
  if (typeof window === 'undefined') return 'light'
  const saved = localStorage.getItem(THEME_KEY)
  if (saved === 'dark' || saved === 'light') return saved
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

// Cloud sync status
function useSyncStatus() {
  const [status, setStatus] = useState(null)
  const timer = useRef(null)
  useEffect(() => {
    const onSaved = () => {
      setStatus('ok')
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setStatus(null), 3000)
    }
    window.addEventListener('anma:cloud-saved', onSaved)
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
  const title = PAGE_NAMES[loc.pathname] || 'ANMA Regalos'
  const [theme] = useState(initialTheme)
  const syncStatus = useSyncStatus()
  const { activeTasks } = useTaskFab()

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  return (
    <header className="topbar">
      <button className="tb-btn tb-btn-menu" onClick={onMenuClick} aria-label="Menú">
        <i className="fa fa-bars" />
      </button>
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
      {/* Campana — permanece en el Topbar como acceso rápido a notificaciones.
          Ojo/Cerebro/Sol viven en el Sidebar > Ajustes rápidos. */}
      <NotificationBell extraCount={activeTasks.length} />
    </header>
  )
}
