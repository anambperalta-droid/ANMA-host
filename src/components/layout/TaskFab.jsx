import { useState, useEffect, useRef } from 'react'

const STORAGE_KEY = 'anma3_tasks'
const PRIORITIES = [
  { key: 'today',    label: 'Urgente hoy',   color: '#DC2626', bg: '#FEF2F2' },
  { key: 'tomorrow', label: 'Mañana',         color: '#D97706', bg: '#FFFBEB' },
  { key: 'week',     label: 'Esta semana',    color: '#2563EB', bg: '#EFF6FF' },
]
const getPriority = (key) => PRIORITIES.find(p => p.key === key) || PRIORITIES[2]

export default function TaskFab() {
  const [panelOpen, setPanelOpen] = useState(false)
  const [formOpen, setFormOpen]   = useState(false)
  const [tasks, setTasks]         = useState([])
  const [desc, setDesc]           = useState('')
  const [priority, setPriority]   = useState('today')
  const panelRef = useRef()
  const inputRef = useRef()

  useEffect(() => {
    try { setTasks(JSON.parse(localStorage.getItem(STORAGE_KEY)) || []) } catch { setTasks([]) }
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks))
  }, [tasks])

  useEffect(() => {
    const h = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target) && !e.target.closest('.tfab-btn'))
        setPanelOpen(false)
    }
    if (panelOpen) document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [panelOpen])

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') { setPanelOpen(false); setFormOpen(false) } }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  useEffect(() => {
    if (formOpen && inputRef.current) inputRef.current.focus()
  }, [formOpen])

  const addTask = () => {
    if (!desc.trim()) return
    setTasks(prev => [...prev, { id: Date.now(), desc: desc.trim(), priority, done: false }])
    setDesc(''); setFormOpen(false)
  }
  const toggleDone = (id) => setTasks(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t))
  const deleteTask = (id) => setTasks(prev => prev.filter(t => t.id !== id))
  const clearDone  = ()   => setTasks(prev => prev.filter(t => !t.done))

  const active = tasks.filter(t => !t.done).sort((a, b) => {
    const o = { today: 0, tomorrow: 1, week: 2 }
    return (o[a.priority] ?? 2) - (o[b.priority] ?? 2)
  })
  const done = tasks.filter(t => t.done)

  return (
    <>
      {/* FAB */}
      <button
        className="tfab-btn"
        onClick={() => setPanelOpen(o => !o)}
        title="Notas y recordatorios"
        style={{
          position: 'fixed', bottom: 36, right: 28, zIndex: 500,
          width: 50, height: 50, borderRadius: 14,
          background: 'var(--grad)', color: '#fff', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 6px 20px rgba(124,58,237,.35)',
          transition: 'transform .15s, box-shadow .15s',
          fontSize: 18,
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)'; e.currentTarget.style.boxShadow = '0 10px 28px rgba(124,58,237,.45)' }}
        onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 6px 20px rgba(124,58,237,.35)' }}
      >
        <i className={`fa ${panelOpen ? 'fa-xmark' : 'fa-clipboard-list'}`} />
        {active.length > 0 && (
          <span style={{
            position: 'absolute', top: -4, right: -4,
            background: active.some(t => t.priority === 'today') ? '#DC2626' : '#D97706',
            color: '#fff', fontSize: 9, fontWeight: 800,
            width: 18, height: 18, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid #fff',
          }}>
            {active.length > 9 ? '9+' : active.length}
          </span>
        )}
      </button>

      {/* PANEL */}
      {panelOpen && (
        <div ref={panelRef} style={{
          position: 'fixed', bottom: 96, right: 28, zIndex: 500,
          width: 340, maxHeight: '72vh',
          background: 'var(--surface)', borderRadius: 16,
          border: '1px solid var(--border)',
          boxShadow: '0 16px 48px rgba(0,0,0,.15)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          animation: 'pgIn .18s ease both',
        }}>

          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '13px 14px 10px', borderBottom: '1px solid var(--border)',
            background: 'var(--surface2)', flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="fa fa-clipboard-list" style={{ color: 'var(--brand)', fontSize: 14 }} />
              <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--txt)' }}>Notas y recordatorios</span>
              {active.length > 0 && (
                <span style={{
                  background: 'var(--brand)', color: '#fff',
                  fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 99,
                }}>
                  {active.length}
                </span>
              )}
            </div>
            <button
              onClick={() => { setFormOpen(o => !o) }}
              title="Nueva nota"
              style={{
                width: 28, height: 28, borderRadius: 8,
                background: formOpen ? 'var(--brand-xlt)' : 'var(--acento-grad)',
                border: 'none', cursor: 'pointer', fontSize: 11, color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <i className={`fa ${formOpen ? 'fa-xmark' : 'fa-plus'}`} style={{ color: formOpen ? 'var(--brand)' : '#fff' }} />
            </button>
          </div>

          {/* Formulario */}
          {formOpen && (
            <div style={{
              padding: '10px 12px', borderBottom: '1px solid var(--border)',
              background: 'var(--surface2)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 7,
            }}>
              <input
                ref={inputRef}
                type="text"
                value={desc}
                onChange={e => setDesc(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addTask()}
                placeholder="Escribí tu nota o tarea..."
                style={{
                  width: '100%', padding: '8px 10px',
                  border: '1.5px solid var(--border)', borderRadius: 8,
                  fontSize: 12, fontFamily: 'inherit', color: 'var(--txt)',
                  background: 'var(--surface)', outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              <div style={{ display: 'flex', gap: 5 }}>
                {PRIORITIES.map(p => (
                  <button key={p.key} onClick={() => setPriority(p.key)} style={{
                    flex: 1, padding: '5px 0', borderRadius: 6,
                    fontSize: 9.5, fontWeight: 700, border: '1.5px solid',
                    borderColor: priority === p.key ? p.color : 'var(--border)',
                    background: priority === p.key ? p.bg : 'transparent',
                    color: priority === p.key ? p.color : 'var(--txt3)',
                    cursor: 'pointer', fontFamily: 'inherit', transition: 'all .12s',
                  }}>
                    {p.label}
                  </button>
                ))}
              </div>
              <button onClick={addTask} disabled={!desc.trim()} style={{
                width: '100%', padding: '7px 0', borderRadius: 8,
                background: desc.trim() ? 'var(--acento-grad)' : 'var(--surface3)',
                color: desc.trim() ? '#fff' : 'var(--txt4)',
                border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                fontFamily: 'inherit', transition: 'all .15s',
              }}>
                <i className="fa fa-floppy-disk" style={{ marginRight: 5 }} />Guardar
              </button>
            </div>
          )}

          {/* Lista */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px' }}>
            {tasks.length === 0 ? (
              <div style={{
                textAlign: 'center', padding: '32px 16px',
                color: 'var(--txt4)', fontSize: 12,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              }}>
                <i className="fa fa-note-sticky" style={{ fontSize: 24, color: 'var(--brand)', opacity: .4 }} />
                <div style={{ fontWeight: 600 }}>Sin notas</div>
                <div style={{ fontSize: 11 }}>Tocá el + para agregar</div>
              </div>
            ) : (
              <>
                {active.map(t => {
                  const p = getPriority(t.priority)
                  return (
                    <div key={t.id} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 10px', marginBottom: 3, borderRadius: 9,
                      borderLeft: `3px solid ${p.color}`,
                      background: 'var(--surface)',
                      border: `1px solid ${p.color}22`, borderLeftWidth: 3,
                      borderLeftColor: p.color,
                    }}>
                      <button onClick={() => toggleDone(t.id)} style={{
                        width: 16, height: 16, borderRadius: 4,
                        border: `2px solid ${p.color}`, background: 'none',
                        cursor: 'pointer', flexShrink: 0, padding: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--txt)', lineHeight: 1.4 }}>{t.desc}</div>
                        <span style={{
                          fontSize: 9, fontWeight: 700, color: p.color,
                          background: p.bg, padding: '1px 6px', borderRadius: 10,
                        }}>{p.label}</span>
                      </div>
                      <button onClick={() => deleteTask(t.id)} style={{
                        background: 'none', border: 'none', color: 'var(--txt4)',
                        cursor: 'pointer', fontSize: 11, padding: 3, flexShrink: 0,
                        borderRadius: 4, transition: 'color .12s',
                      }}><i className="fa fa-xmark" /></button>
                    </div>
                  )
                })}

                {done.length > 0 && (
                  <>
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      fontSize: 9, fontWeight: 700, color: 'var(--txt4)',
                      letterSpacing: 1, textTransform: 'uppercase',
                      padding: '10px 2px 4px',
                    }}>
                      <span>Completadas ({done.length})</span>
                      <button onClick={clearDone} style={{
                        background: 'none', border: 'none', color: 'var(--txt4)',
                        fontSize: 9, cursor: 'pointer', fontWeight: 700, letterSpacing: .5,
                        padding: '2px 4px', borderRadius: 4,
                      }}>Limpiar</button>
                    </div>
                    {done.slice(-4).reverse().map(t => (
                      <div key={t.id} style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '7px 10px', marginBottom: 3, borderRadius: 9,
                        borderLeft: '3px solid var(--border)', opacity: .45,
                        background: 'var(--surface2)',
                      }}>
                        <button onClick={() => toggleDone(t.id)} style={{
                          width: 16, height: 16, borderRadius: 4,
                          border: '2px solid var(--green)', background: 'var(--green)',
                          cursor: 'pointer', flexShrink: 0, padding: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <i className="fa fa-check" style={{ color: '#fff', fontSize: 7 }} />
                        </button>
                        <div style={{ fontSize: 12, color: 'var(--txt3)', textDecoration: 'line-through', flex: 1 }}>{t.desc}</div>
                        <button onClick={() => deleteTask(t.id)} style={{
                          background: 'none', border: 'none', color: 'var(--txt4)',
                          cursor: 'pointer', fontSize: 11, padding: 3, flexShrink: 0,
                        }}><i className="fa fa-xmark" /></button>
                      </div>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
