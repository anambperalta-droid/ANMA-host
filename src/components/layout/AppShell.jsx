import { useState, useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import { useData } from '../../context/DataContext'
import { useAuth } from '../../context/AuthContext'
import { applyThemeColors } from '../../lib/theme'
import { TaskFabProvider, useTaskFab } from '../../context/TaskFabContext'
import { PrivacyProvider } from '../../context/PrivacyContext'
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
import Admin from '../pages/Admin'

const PRIORITIES = [
  { key: 'today',    label: 'Urgente hoy',  color: '#DC2626', bg: '#FEF2F2' },
  { key: 'tomorrow', label: 'Mañana',        color: '#D97706', bg: '#FFFBEB' },
  { key: 'week',     label: 'Esta semana',   color: '#2563EB', bg: '#EFF6FF' },
]
const getPriority = (key) => PRIORITIES.find(p => p.key === key) || PRIORITIES[2]

function FocusOverlay() {
  const { setFocusMode, tasks, setTasks, activeTasks } = useTaskFab()
  const [formOpen, setFormOpen] = useState(false)
  const [desc, setDesc] = useState('')
  const [priority, setPriority] = useState('today')

  const active = [...activeTasks].sort((a, b) => {
    const o = { today: 0, tomorrow: 1, week: 2 }
    return (o[a.priority] ?? 2) - (o[b.priority] ?? 2)
  })

  const toggleDone = (id) => setTasks(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t))
  const addTask = () => {
    if (!desc.trim()) return
    setTasks(prev => [...prev, { id: Date.now(), desc: desc.trim(), priority, done: false }])
    setDesc(''); setFormOpen(false)
  }

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') setFocusMode(false) }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [setFocusMode])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 900,
      background: 'rgba(15,23,42,0.93)',
      backdropFilter: 'blur(10px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      animation: 'pgIn .2s ease both',
    }}>
      <div style={{
        width: '100%', maxWidth: 540,
        maxHeight: 'calc(100vh - 48px)',
        background: 'var(--surface)', borderRadius: 20,
        boxShadow: '0 32px 80px rgba(0,0,0,.5)',
        border: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        margin: '0 16px',
      }}>
        <div style={{
          padding: '18px 20px 16px',
          background: 'linear-gradient(135deg, #1e1b4b, #312e81)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              background: 'rgba(255,255,255,.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <i className="fa fa-brain" style={{ color: '#A5B4FC', fontSize: 18 }} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16, color: '#fff', letterSpacing: '-.2px' }}>Modo Enfoque</div>
              <div style={{ fontSize: 11, color: '#A5B4FC', marginTop: 1 }}>
                {active.length === 0 ? 'Sin tareas pendientes 🎉' : `${active.length} tarea${active.length !== 1 ? 's' : ''} pendiente${active.length !== 1 ? 's' : ''}`}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setFormOpen(f => !f)} title="Nueva tarea" style={{
              background: 'rgba(255,255,255,.12)', border: 'none', color: '#fff',
              width: 32, height: 32, borderRadius: 8, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
            }}>
              <i className={`fa ${formOpen ? 'fa-xmark' : 'fa-plus'}`} />
            </button>
            <button onClick={() => setFocusMode(false)} title="Salir (ESC)" style={{
              background: 'rgba(255,255,255,.1)', border: 'none', color: '#A5B4FC',
              width: 32, height: 32, borderRadius: 8, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
            }}>
              <i className="fa fa-xmark" />
            </button>
          </div>
        </div>

        {formOpen && (
          <div style={{
            padding: '10px 14px', borderBottom: '1px solid var(--border)',
            background: 'var(--surface2)', flexShrink: 0,
            display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            <input autoFocus type="text" value={desc}
              onChange={e => setDesc(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addTask()}
              placeholder="Escribí la tarea..."
              style={{
                width: '100%', padding: '9px 12px', border: '1.5px solid var(--border)',
                borderRadius: 9, fontSize: 13, fontFamily: 'inherit',
                color: 'var(--txt)', background: 'var(--surface)', outline: 'none', boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: 5 }}>
              {PRIORITIES.map(p => (
                <button key={p.key} onClick={() => setPriority(p.key)} style={{
                  flex: 1, padding: '5px 0', borderRadius: 6, fontSize: 10, fontWeight: 700,
                  border: '1.5px solid', cursor: 'pointer', fontFamily: 'inherit', transition: 'all .12s',
                  borderColor: priority === p.key ? p.color : 'var(--border)',
                  background: priority === p.key ? p.bg : 'transparent',
                  color: priority === p.key ? p.color : 'var(--txt3)',
                }}>{p.label}</button>
              ))}
            </div>
            <button onClick={addTask} disabled={!desc.trim()} style={{
              width: '100%', padding: '8px', borderRadius: 8, border: 'none',
              background: desc.trim() ? 'linear-gradient(135deg,#312e81,#4F46E5)' : 'var(--surface2)',
              color: desc.trim() ? '#fff' : 'var(--txt4)',
              fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            }}>
              <i className="fa fa-floppy-disk" style={{ marginRight: 6 }} />Guardar tarea
            </button>
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
          {active.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '52px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <div style={{ fontSize: 44 }}>🎯</div>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--txt)' }}>¡Todo listo!</div>
              <div style={{ fontSize: 12, color: 'var(--txt3)' }}>No tenés tareas pendientes</div>
              <button onClick={() => setFormOpen(true)} style={{
                marginTop: 8, padding: '8px 20px', borderRadius: 20,
                background: 'linear-gradient(135deg,#312e81,#4F46E5)',
                color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}>
                <i className="fa fa-plus" style={{ marginRight: 6 }} />Agregar tarea
              </button>
            </div>
          ) : active.map(t => {
            const p = getPriority(t.priority)
            return (
              <div key={t.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '13px 14px', marginBottom: 6, borderRadius: 12,
                background: p.bg, borderLeft: `4px solid ${p.color}`,
                border: `1.5px solid ${p.color}22`, borderLeftWidth: 4, borderLeftColor: p.color,
              }}>
                <button onClick={() => toggleDone(t.id)} style={{
                  width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                  border: `2px solid ${p.color}`, background: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#1E293B', lineHeight: 1.45 }}>{t.desc}</div>
                  <span style={{
                    fontSize: 9.5, fontWeight: 700, color: p.color,
                    background: 'rgba(255,255,255,.7)', padding: '1px 8px', borderRadius: 10,
                  }}>{p.label}</span>
                </div>
              </div>
            )
          })}
        </div>

        <div style={{
          padding: '10px 16px 12px', borderTop: '1px solid var(--border)',
          background: 'var(--surface2)', textAlign: 'center', flexShrink: 0,
        }}>
          <button onClick={() => setFocusMode(false)} style={{
            fontSize: 12, color: 'var(--txt3)', background: 'none', border: 'none', cursor: 'pointer',
          }}>
            <i className="fa fa-arrow-left" style={{ marginRight: 6 }} />Volver al dashboard
          </button>
        </div>
      </div>
    </div>
  )
}

function NoAccess() {
  return (
    <div style={{ padding: 48, textAlign: 'center', color: 'var(--txt3)' }}>
      <i className="fa fa-lock" style={{ fontSize: 36, marginBottom: 12, color: 'var(--txt4)' }} />
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--txt)', marginBottom: 6 }}>Acceso restringido</div>
      <div style={{ fontSize: 13 }}>Tu cuenta no tiene permiso para esta sección. Contactá al administrador del workspace.</div>
    </div>
  )
}

function Guard({ perm, children }) {
  const { can } = useAuth()
  return can(perm) ? children : <NoAccess />
}

function AdminGuard({ children }) {
  const { isGlobalAdmin } = useAuth()
  return isGlobalAdmin ? children : <NoAccess />
}

function AppShellInner() {
  const { config } = useData()
  const { focusMode } = useTaskFab()
  const [cmdOpen, setCmdOpen] = useState(false)
  const [sideOpen, setSideOpen] = useState(false)

  useEffect(() => {
    const c = config()
    applyThemeColors(c.brandColor || '#7C3AED', c.accentColor || '#059669')
  })

  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setCmdOpen(true) }
      if (e.key === 'Escape') {
        if (cmdOpen) { setCmdOpen(false); return }
        const opens = document.querySelectorAll('.modal-bg.open')
        if (opens.length) {
          const top = opens[opens.length - 1]
          const closeBtn = top.querySelector('.mclose')
          if (closeBtn) { closeBtn.click(); return }
          top.click()
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [cmdOpen])

  // Seleccionar todo al enfocar cualquier input numérico (evita escribir sobre el 0)
  useEffect(() => {
    const numFocus = (e) => { if (e.target.type === 'number') e.target.select() }
    document.addEventListener('focus', numFocus, true)
    return () => document.removeEventListener('focus', numFocus, true)
  }, [])

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <Sidebar open={sideOpen} onClose={() => setSideOpen(false)} />
      {sideOpen && <div className="sb-overlay" onClick={() => setSideOpen(false)} />}
      <div className="main">
        <Topbar onMenuClick={() => setSideOpen(!sideOpen)} />
        <div className="content">
          <Routes>
            <Route path="/" element={<Guard perm="dashboard.view"><Historial /></Guard>} />
            <Route path="/presupuesto" element={<Guard perm="pedido.create"><Presupuesto /></Guard>} />
            <Route path="/presupuesto/:id" element={<Guard perm="pedido.edit"><Presupuesto /></Guard>} />
            <Route path="/clientes" element={<Guard perm="cliente.view"><Clientes /></Guard>} />
            <Route path="/catalogo" element={<Guard perm="catalogo.view"><Catalogo /></Guard>} />
            <Route path="/proveedores" element={<Guard perm="proveedor.view"><Proveedores /></Guard>} />
            <Route path="/logistica" element={<Guard perm="logistica.view"><Logistica /></Guard>} />
            <Route path="/mensajes" element={<Guard perm="mensajes.view"><Mensajes /></Guard>} />
            <Route path="/config" element={<Guard perm="config.access"><Config /></Guard>} />
            <Route path="/admin" element={<AdminGuard><Admin /></AdminGuard>} />
          </Routes>
        </div>
      </div>
      {cmdOpen && <CommandPalette onClose={() => setCmdOpen(false)} />}
      <TaskFab />
      {focusMode && <FocusOverlay />}
    </div>
  )
}

export default function AppShell() {
  return (
    <PrivacyProvider>
      <TaskFabProvider>
        <AppShellInner />
      </TaskFabProvider>
    </PrivacyProvider>
  )
}
