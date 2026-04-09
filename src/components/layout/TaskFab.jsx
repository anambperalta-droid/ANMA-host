import { useState, useEffect, useMemo, useRef } from 'react'
import { useData } from '../../context/DataContext'
import { fmt, STATUS_MAP, PAY_STATUS_MAP } from '../../lib/storage'

const STORAGE_KEY = 'anma3_tasks'
const PRIORITIES = [
  { key: 'today', label: 'Urgente hoy', color: '#DC2626', bg: '#FEF2F2', border: '#FCA5A5' },
  { key: 'tomorrow', label: 'Manana', color: '#D97706', bg: '#FFFBEB', border: '#FCD34D' },
  { key: 'week', label: 'Esta semana', color: '#2563EB', bg: '#EFF6FF', border: '#93C5FD' },
]

function getPriority(key) {
  return PRIORITIES.find(p => p.key === key) || PRIORITIES[2]
}

export default function TaskFab() {
  const { get } = useData()
  const [open, setOpen] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [tasks, setTasks] = useState([])
  const [desc, setDesc] = useState('')
  const [priority, setPriority] = useState('today')
  const [tab, setTab] = useState('tasks')
  const panelRef = useRef()

  // Load tasks from localStorage
  useEffect(() => {
    try { setTasks(JSON.parse(localStorage.getItem(STORAGE_KEY)) || []) } catch { setTasks([]) }
  }, [])

  // Save tasks to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks))
  }, [tasks])

  // Close on click outside
  useEffect(() => {
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target) && !e.target.closest('.task-fab-btn')) {
        setPanelOpen(false)
        setOpen(false)
      }
    }
    if (panelOpen) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [panelOpen])

  // ESC
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') { setPanelOpen(false); setOpen(false) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const addTask = () => {
    if (!desc.trim()) return
    setTasks(prev => [...prev, { id: Date.now(), desc: desc.trim(), priority, done: false, created: new Date().toISOString() }])
    setDesc('')
    setOpen(false)
  }

  const toggleDone = (id) => setTasks(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t))
  const deleteTask = (id) => setTasks(prev => prev.filter(t => t.id !== id))

  const activeTasks = tasks.filter(t => !t.done)
  const doneTasks = tasks.filter(t => t.done)

  // Auto-alerts from app data
  const alerts = useMemo(() => {
    const list = []
    const budgets = get('budgets')
    const now = new Date()

    // Presupuestos enviados sin respuesta hace +7 dias
    budgets.forEach(b => {
      if (['sent', 'negotiating'].includes(b.status) && b.date) {
        const days = Math.floor((now - new Date(b.date)) / 86400000)
        if (days >= 7) {
          list.push({
            id: 'seg-' + b.id,
            type: 'seguimiento',
            icon: 'fa-clock',
            color: days >= 14 ? '#DC2626' : '#D97706',
            text: `${b.num} — ${b.company || b.contact || '?'} — ${days} dias sin respuesta`,
          })
        }
      }
    })

    // Pagos pendientes en confirmados
    budgets.forEach(b => {
      if (b.status === 'confirmed' && (!b.payStatus || b.payStatus === 'pending')) {
        list.push({
          id: 'pay-' + b.id,
          type: 'pago',
          icon: 'fa-credit-card',
          color: '#D97706',
          text: `${b.num} — ${b.company || b.contact || '?'} — Pago pendiente ${fmt(b.total)}`,
        })
      }
    })

    // Entregas proximas (en los proximos 3 dias)
    budgets.forEach(b => {
      if (b.deliveryDate && ['confirmed', 'sent', 'negotiating'].includes(b.status)) {
        const delivery = new Date(b.deliveryDate)
        const diff = Math.floor((delivery - now) / 86400000)
        if (diff >= 0 && diff <= 3) {
          list.push({
            id: 'del-' + b.id,
            type: 'entrega',
            icon: 'fa-truck',
            color: diff === 0 ? '#DC2626' : '#2563EB',
            text: `${b.num} — ${b.company || b.contact || '?'} — Entrega ${diff === 0 ? 'HOY' : diff === 1 ? 'manana' : 'en ' + diff + ' dias'}`,
          })
        }
      }
    })

    // Sena cobrada pero falta saldo
    budgets.forEach(b => {
      if (b.payStatus === 'partial' && b.status === 'confirmed') {
        const saldo = (b.total || 0) - (b.depositAmt || 0)
        if (saldo > 0) {
          list.push({
            id: 'saldo-' + b.id,
            type: 'saldo',
            icon: 'fa-coins',
            color: '#059669',
            text: `${b.num} — ${b.company || b.contact || '?'} — Saldo pendiente ${fmt(saldo)}`,
          })
        }
      }
    })

    return list
  }, [get])

  const totalPending = activeTasks.length + alerts.length

  return (
    <>
      {/* FAB Button */}
      <button
        className="task-fab-btn"
        onClick={() => { setPanelOpen(!panelOpen); if (!panelOpen) setTab('tasks') }}
        style={S.fab}
        title="Recordatorios y alertas"
      >
        <i className={`fa ${panelOpen ? 'fa-xmark' : 'fa-bell'}`} style={{ fontSize: 18 }} />
        {totalPending > 0 && (
          <span style={S.fabBadge}>{totalPending > 9 ? '9+' : totalPending}</span>
        )}
      </button>

      {/* Panel */}
      {panelOpen && (
        <div ref={panelRef} style={S.panel}>
          {/* Header */}
          <div style={S.panelHeader}>
            <div style={{ display: 'flex', gap: 0 }}>
              <button style={{ ...S.tabBtn, ...(tab === 'tasks' ? S.tabActive : {}) }} onClick={() => setTab('tasks')}>
                Tareas {activeTasks.length > 0 && <span style={S.tabChip}>{activeTasks.length}</span>}
              </button>
              <button style={{ ...S.tabBtn, ...(tab === 'alerts' ? S.tabActive : {}) }} onClick={() => setTab('alerts')}>
                Alertas {alerts.length > 0 && <span style={{ ...S.tabChip, background: '#DC2626' }}>{alerts.length}</span>}
              </button>
            </div>
            <button style={S.addBtn} onClick={() => setOpen(!open)}>
              <i className={`fa ${open ? 'fa-chevron-up' : 'fa-plus'}`} />
            </button>
          </div>

          {/* Add task form */}
          {open && (
            <div style={S.form}>
              <input
                type="text"
                value={desc}
                onChange={e => setDesc(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addTask()}
                placeholder="Descripcion de la tarea..."
                style={S.input}
                autoFocus
              />
              <div style={{ display: 'flex', gap: 6 }}>
                {PRIORITIES.map(p => (
                  <button key={p.key}
                    onClick={() => setPriority(p.key)}
                    style={{
                      ...S.prioBtn,
                      background: priority === p.key ? p.bg : 'transparent',
                      borderColor: priority === p.key ? p.color : 'var(--border)',
                      color: priority === p.key ? p.color : 'var(--txt3)',
                    }}>
                    {p.label}
                  </button>
                ))}
              </div>
              <button onClick={addTask} disabled={!desc.trim()} style={{ ...S.saveBtn, opacity: desc.trim() ? 1 : 0.4 }}>
                <i className="fa fa-floppy-disk" /> Guardar
              </button>
            </div>
          )}

          {/* Body */}
          <div style={S.body}>
            {tab === 'tasks' && (
              <>
                {activeTasks.length === 0 && doneTasks.length === 0 && (
                  <div style={S.empty}>
                    <i className="fa fa-clipboard-check" style={{ fontSize: 22, marginBottom: 8, color: 'var(--txt4)' }} />
                    <div>Sin tareas pendientes</div>
                    <div style={{ fontSize: 10, marginTop: 2 }}>Usa el + para agregar una</div>
                  </div>
                )}

                {/* Active tasks sorted by priority */}
                {[...activeTasks].sort((a, b) => {
                  const order = { today: 0, tomorrow: 1, week: 2 }
                  return (order[a.priority] ?? 2) - (order[b.priority] ?? 2)
                }).map(t => {
                  const p = getPriority(t.priority)
                  return (
                    <div key={t.id} style={{ ...S.taskItem, borderLeftColor: p.color }}>
                      <button onClick={() => toggleDone(t.id)} style={S.checkBtn}>
                        <div style={{ ...S.checkBox, borderColor: p.color }} />
                      </button>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--txt)', lineHeight: 1.4 }}>{t.desc}</div>
                        <span style={{ fontSize: 9, fontWeight: 700, color: p.color, background: p.bg, padding: '1px 6px', borderRadius: 10 }}>{p.label}</span>
                      </div>
                      <button onClick={() => deleteTask(t.id)} style={S.delBtn}><i className="fa fa-xmark" /></button>
                    </div>
                  )
                })}

                {/* Done tasks */}
                {doneTasks.length > 0 && (
                  <>
                    <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--txt4)', letterSpacing: 1, textTransform: 'uppercase', padding: '8px 0 4px' }}>
                      Completadas ({doneTasks.length})
                    </div>
                    {doneTasks.slice(-5).reverse().map(t => (
                      <div key={t.id} style={{ ...S.taskItem, borderLeftColor: 'var(--border)', opacity: 0.5 }}>
                        <button onClick={() => toggleDone(t.id)} style={S.checkBtn}>
                          <div style={{ ...S.checkBox, borderColor: 'var(--green)', background: 'var(--green)' }}>
                            <i className="fa fa-check" style={{ color: '#fff', fontSize: 7 }} />
                          </div>
                        </button>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, color: 'var(--txt3)', textDecoration: 'line-through' }}>{t.desc}</div>
                        </div>
                        <button onClick={() => deleteTask(t.id)} style={S.delBtn}><i className="fa fa-xmark" /></button>
                      </div>
                    ))}
                  </>
                )}
              </>
            )}

            {tab === 'alerts' && (
              <>
                {alerts.length === 0 && (
                  <div style={S.empty}>
                    <i className="fa fa-check-circle" style={{ fontSize: 22, marginBottom: 8, color: 'var(--green)' }} />
                    <div>Todo al dia</div>
                    <div style={{ fontSize: 10, marginTop: 2 }}>No hay alertas pendientes</div>
                  </div>
                )}
                {alerts.map(a => (
                  <div key={a.id} style={{ ...S.alertItem, borderLeftColor: a.color }}>
                    <div style={{ ...S.alertIcon, background: a.color + '12', color: a.color }}>
                      <i className={`fa ${a.icon}`} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: a.color, textTransform: 'uppercase', letterSpacing: .5, marginBottom: 2 }}>{a.type}</div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt)', lineHeight: 1.4 }}>{a.text}</div>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}

const S = {
  fab: {
    position: 'fixed', bottom: 24, right: 24, zIndex: 500,
    width: 52, height: 52, borderRadius: 16,
    background: 'linear-gradient(135deg, #7C3AED 0%, #6366F1 100%)',
    color: '#fff', border: 'none', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 8px 24px rgba(124,58,237,.35), 0 2px 8px rgba(0,0,0,.1)',
    transition: 'all .2s ease',
  },
  fabBadge: {
    position: 'absolute', top: -4, right: -4,
    background: '#DC2626', color: '#fff',
    fontSize: 9, fontWeight: 800,
    width: 20, height: 20, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: '2px solid #fff',
  },
  panel: {
    position: 'fixed', bottom: 86, right: 24, zIndex: 500,
    width: 360, maxHeight: '70vh',
    background: 'var(--surface, #fff)', borderRadius: 16,
    border: '1px solid var(--border, #E5E7F0)',
    boxShadow: '0 20px 60px rgba(0,0,0,.15), 0 4px 16px rgba(0,0,0,.06)',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
    animation: 'pgIn .2s ease both',
  },
  panelHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 14px 8px', borderBottom: '1px solid var(--border, #E5E7F0)',
    flexShrink: 0,
  },
  tabBtn: {
    background: 'none', border: 'none', padding: '6px 12px', borderRadius: 8,
    fontSize: 12, fontWeight: 600, color: 'var(--txt3, #8B90B8)',
    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
    transition: 'all .15s',
  },
  tabActive: {
    color: 'var(--brand, #7C3AED)', background: 'var(--brand-xlt, rgba(124,58,237,.08))',
  },
  tabChip: {
    background: 'var(--brand, #7C3AED)', color: '#fff',
    fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 10, minWidth: 16,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  },
  addBtn: {
    width: 30, height: 30, borderRadius: 8,
    background: 'linear-gradient(135deg, #059669 0%, #10B981 100%)',
    color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 2px 8px rgba(5,150,105,.3)',
  },
  form: {
    padding: '12px 14px', borderBottom: '1px solid var(--border, #E5E7F0)',
    display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0,
    background: 'var(--surface2, #F8F9FE)',
  },
  input: {
    width: '100%', padding: '8px 12px',
    border: '1.5px solid var(--border, #E5E7F0)', borderRadius: 8,
    fontSize: 12, fontFamily: 'inherit', color: 'var(--txt, #1E1B4B)',
    background: 'var(--surface, #fff)', outline: 'none',
  },
  prioBtn: {
    flex: 1, padding: '5px 0', borderRadius: 6, fontSize: 10, fontWeight: 700,
    border: '1.5px solid', cursor: 'pointer', transition: 'all .15s',
    fontFamily: 'inherit',
  },
  saveBtn: {
    width: '100%', padding: '8px 0', borderRadius: 8,
    background: 'linear-gradient(135deg, #059669 0%, #10B981 100%)',
    color: '#fff', border: 'none', fontSize: 12, fontWeight: 700,
    cursor: 'pointer', fontFamily: 'inherit',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    boxShadow: '0 2px 8px rgba(5,150,105,.25)',
  },
  body: {
    flex: 1, overflowY: 'auto', padding: '8px 10px',
  },
  empty: {
    textAlign: 'center', padding: '28px 16px',
    color: 'var(--txt3, #8B90B8)', fontSize: 12,
    display: 'flex', flexDirection: 'column', alignItems: 'center',
  },
  taskItem: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '8px 10px', marginBottom: 4, borderRadius: 8,
    borderLeft: '3px solid', background: 'var(--surface, #fff)',
    transition: 'background .1s',
  },
  checkBtn: {
    background: 'none', border: 'none', cursor: 'pointer', padding: 2, flexShrink: 0,
  },
  checkBox: {
    width: 16, height: 16, borderRadius: 4, border: '2px solid',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all .15s',
  },
  delBtn: {
    background: 'none', border: 'none', color: 'var(--txt4, #C4C9DF)',
    cursor: 'pointer', fontSize: 10, padding: 4, flexShrink: 0,
    transition: 'color .15s',
  },
  alertItem: {
    display: 'flex', alignItems: 'flex-start', gap: 8,
    padding: '10px 10px', marginBottom: 4, borderRadius: 8,
    borderLeft: '3px solid', background: 'var(--surface, #fff)',
  },
  alertIcon: {
    width: 28, height: 28, borderRadius: 8,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 11, flexShrink: 0,
  },
}
