import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'

// Plan → default seats mapping used by the "Cambiar plan" dropdown.
const PLANS = [
  { key: 'solo',      label: 'Solo',      seats: 0 },
  { key: 'equipo',    label: 'Equipo',    seats: 2 },
  { key: 'pro',       label: 'Pro',       seats: 5 },
  { key: 'unlimited', label: 'Ilimitado', seats: 999 },
]

export default function Admin() {
  const { isGlobalAdmin, user } = useAuth()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [expanded, setExpanded] = useState(null)  // workspace_id expanded
  const [members, setMembers] = useState({})      // { ws_id: [...members] }

  const load = useCallback(async () => {
    setLoading(true); setErr('')
    try {
      // 1. All workspaces (RLS lets global admin see all).
      const { data: wss, error: e1 } = await supabase
        .from('workspaces')
        .select('id, name, plan, seats_allowed, status, created_at')
        .order('created_at', { ascending: false })
      if (e1) throw e1

      // 2. Seats used per workspace (count non-owner active/invited memberships).
      const { data: mems, error: e2 } = await supabase
        .from('memberships')
        .select('workspace_id, role, status, user_id, created_at')
      if (e2) throw e2

      const used = {}
      const byWs = {}
      ;(mems || []).forEach(m => {
        if (m.role !== 'owner' && (m.status === 'active' || m.status === 'invited')) {
          used[m.workspace_id] = (used[m.workspace_id] || 0) + 1
        }
        byWs[m.workspace_id] = byWs[m.workspace_id] || []
        byWs[m.workspace_id].push(m)
      })

      setRows((wss || []).map(w => ({ ...w, seats_used: used[w.id] || 0 })))
      setMembers(byWs)
    } catch (e) {
      setErr(e.message || 'Error cargando workspaces')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { if (isGlobalAdmin) load() }, [isGlobalAdmin, load])

  const changePlan = async (wsId, planKey) => {
    const p = PLANS.find(x => x.key === planKey)
    if (!p) return
    const { error } = await supabase.from('workspaces')
      .update({ plan: p.key, seats_allowed: p.seats })
      .eq('id', wsId)
    if (error) { alert(error.message); return }
    await load()
  }

  const setSeats = async (wsId, seats) => {
    const n = parseInt(seats, 10)
    if (Number.isNaN(n) || n < 0) return
    const { error } = await supabase.from('workspaces')
      .update({ seats_allowed: n })
      .eq('id', wsId)
    if (error) { alert(error.message); return }
    await load()
  }

  const toggleStatus = async (wsId, current) => {
    const next = current === 'active' ? 'paused' : 'active'
    const { error } = await supabase.from('workspaces')
      .update({ status: next })
      .eq('id', wsId)
    if (error) { alert(error.message); return }
    await load()
  }

  const revokeMember = async (mId) => {
    if (!confirm('¿Revocar este miembro? No podrá seguir accediendo.')) return
    const { error } = await supabase.from('memberships')
      .update({ status: 'revoked' })
      .eq('id', mId)
    if (error) { alert(error.message); return }
    await load()
  }

  if (!isGlobalAdmin) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--txt3)' }}>
        <i className="fa fa-lock" style={{ fontSize: 36, marginBottom: 12 }} />
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--txt)', marginBottom: 6 }}>Acceso restringido</div>
        <div style={{ fontSize: 13 }}>Panel solo para administradores globales.</div>
      </div>
    )
  }

  return (
    <div className="pg" style={{ padding: '16px 20px' }}>
      <div className="pg-head" style={{ marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: '-.3px' }}>
            <i className="fa fa-shield-halved" style={{ marginRight: 8, color: '#7C3AED' }} />
            Admin · Workspaces
          </h1>
          <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 2 }}>
            Gestión cross-tenant · {user?.email}
          </div>
        </div>
        <button className="btn btn-secondary" onClick={load} disabled={loading}>
          <i className={`fa ${loading ? 'fa-spinner fa-spin' : 'fa-rotate-right'}`} style={{ marginRight: 6 }} />
          Refrescar
        </button>
      </div>

      {err && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', padding: 10, borderRadius: 8, marginBottom: 12, fontSize: 13 }}><i className="fa fa-triangle-exclamation" style={{ marginRight: 6 }} />{err}</div>}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--surface2)', textAlign: 'left' }}>
              <th style={th}>Workspace</th>
              <th style={th}>Plan</th>
              <th style={{ ...th, textAlign: 'center' }}>Seats</th>
              <th style={{ ...th, textAlign: 'center' }}>Estado</th>
              <th style={{ ...th, textAlign: 'right' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading && (
              <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: 'var(--txt3)' }}>Sin workspaces</td></tr>
            )}
            {rows.map(w => {
              const isOpen = expanded === w.id
              const overLimit = w.seats_used > w.seats_allowed
              return (
                <>
                  <tr key={w.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={td}>
                      <div style={{ fontWeight: 600 }}>{w.name || '—'}</div>
                      <div style={{ fontSize: 11, color: 'var(--txt3)', fontFamily: 'monospace' }}>{w.id.slice(0, 8)}…</div>
                    </td>
                    <td style={td}>
                      <select value={w.plan} onChange={e => changePlan(w.id, e.target.value)} style={sel}>
                        {PLANS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                      </select>
                    </td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <input
                        type="number" min={0}
                        value={w.seats_allowed}
                        onChange={e => setSeats(w.id, e.target.value)}
                        style={{ width: 60, padding: '4px 6px', textAlign: 'center', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', color: 'var(--txt)' }}
                      />
                      <div style={{ fontSize: 11, color: overLimit ? '#DC2626' : 'var(--txt3)', marginTop: 2 }}>
                        usados: {w.seats_used}{overLimit ? ' ⚠' : ''}
                      </div>
                    </td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 10,
                        background: w.status === 'active' ? 'rgba(22,163,74,.12)' : 'rgba(220,38,38,.12)',
                        color: w.status === 'active' ? '#16A34A' : '#DC2626',
                      }}>{w.status}</span>
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <button onClick={() => setExpanded(isOpen ? null : w.id)} style={btnLink}>
                        <i className={`fa fa-chevron-${isOpen ? 'up' : 'down'}`} /> Miembros
                      </button>
                      <button onClick={() => toggleStatus(w.id, w.status)} style={{ ...btnLink, marginLeft: 10 }}>
                        {w.status === 'active' ? 'Pausar' : 'Activar'}
                      </button>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr style={{ background: 'var(--surface2)' }}>
                      <td colSpan={5} style={{ padding: '10px 14px' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>
                          Miembros ({(members[w.id] || []).length})
                        </div>
                        {(members[w.id] || []).length === 0 ? (
                          <div style={{ fontSize: 12, color: 'var(--txt3)' }}>Sin miembros</div>
                        ) : (
                          <table style={{ width: '100%', fontSize: 12 }}>
                            <tbody>
                              {(members[w.id] || []).map(m => (
                                <tr key={m.id}>
                                  <td style={{ padding: '4px 8px', fontFamily: 'monospace' }}>{m.user_id.slice(0, 8)}…</td>
                                  <td style={{ padding: '4px 8px', fontWeight: 600 }}>{m.role}</td>
                                  <td style={{ padding: '4px 8px' }}>{m.status}</td>
                                  <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                                    {m.role !== 'owner' && m.status !== 'revoked' && (
                                      <button onClick={() => revokeMember(m.id)} style={{ ...btnLink, color: '#DC2626' }}>Revocar</button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const th = { padding: '10px 12px', fontWeight: 700, fontSize: 11, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.06em' }
const td = { padding: '10px 12px', verticalAlign: 'middle' }
const sel = { padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', color: 'var(--txt)', fontSize: 12 }
const btnLink = { background: 'none', border: 'none', color: 'var(--brand)', cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: 0 }
