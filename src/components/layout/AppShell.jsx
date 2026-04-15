import { useState, useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import { useData } from '../../context/DataContext'
import { applyThemeColors } from '../../lib/theme'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import CommandPalette from './CommandPalette'
import TaskFab from './TaskFab'
import Historial from '../pages/Historial'
import Presupuesto from '../pages/Presupuesto'
import Clientes from '../pages/Clientes'
import Catalogo from '../pages/Catalogo'
import Proveedores from '../pages/Proveedores'
import Logistica from '../pages/Logistica'
import Mensajes from '../pages/Mensajes'
import Config from '../pages/Config'

export default function AppShell() {
  const { config } = useData()
  const [cmdOpen, setCmdOpen] = useState(false)
  const [sideOpen, setSideOpen] = useState(false)

  /* ── Marca blanca: aplica colores guardados al montar ── */
  useEffect(() => {
    const c = config()
    applyThemeColors(c.brandColor || '#7C3AED', c.accentColor || '#059669')
  })

  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setCmdOpen(true) }
      if (e.key === 'Escape' && cmdOpen) { setCmdOpen(false) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [cmdOpen])

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <Sidebar open={sideOpen} onClose={() => setSideOpen(false)} />
      {sideOpen && <div className="sb-overlay" onClick={() => setSideOpen(false)} />}
      <div className="main">
        <Topbar onMenuClick={() => setSideOpen(!sideOpen)} />
        <div className="content">
          <Routes>
            <Route path="/" element={<Historial />} />
            <Route path="/presupuesto" element={<Presupuesto />} />
            <Route path="/presupuesto/:id" element={<Presupuesto />} />
            <Route path="/clientes" element={<Clientes />} />
            <Route path="/catalogo" element={<Catalogo />} />
            <Route path="/proveedores" element={<Proveedores />} />
            <Route path="/logistica" element={<Logistica />} />
            <Route path="/mensajes" element={<Mensajes />} />
            <Route path="/config" element={<Config />} />
          </Routes>
        </div>
      </div>
      {cmdOpen && <CommandPalette onClose={() => setCmdOpen(false)} />}
      <TaskFab />
    </div>
  )
}
