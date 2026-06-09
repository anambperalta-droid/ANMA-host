import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { useRealtimeSignups, ensureNotificationPermission, sendBrowserNotification } from '../../lib/useRealtimeSignups'

/**
 * ANMA Regalos — Admin global (cross-tenant)
 *
 * Vista profesional para gestionar workspaces, trials y conversiones.
 * 3 tabs principales:
 *   1. Trials   — usuarios en período de prueba (priorizados por urgencia)
 *   2. Pagados  — clientes que ya convirtieron
 *   3. Todos    — vista completa con filtros manuales
 *
 * + métricas headline (cards) que dan el pulso del negocio de un vistazo.
 */

const SITE_KEY = 'anma-regalos'
const TRIAL_DAYS = 7
const RECOVERY_WINDOW_DAYS = 14   // mostramos trials expirados hasta N días post-vencimiento

// Mapeo plan → seats por default
const PLANS = [
  { key: 'solo',      label: 'Solo',      seats: 0 },
  { key: 'equipo',    label: 'Equipo',    seats: 2 },
  { key: 'pro',       label: 'Pro',       seats: 5 },
  { key: 'unlimited', label: 'Ilimitado', seats: 999 },
]

// ── Helpers ─────────────────────────────────────────────────────────────
const daysSince = (iso) => {
  if (!iso) return Infinity
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

const deriveTrialState = (ws) => {
  // Trial = workspace plan 'solo' + recién creado
  if (ws.plan !== 'solo') return { isTrial: false, label: ws.plan, daysLeft: null, urgency: 'paid' }
  const age = daysSince(ws.created_at)
  const daysLeft = TRIAL_DAYS - age
  if (daysLeft >= 4) return { isTrial: true, daysLeft, urgency: 'fresh', label: `${daysLeft}d` }
  if (daysLeft >= 2) return { isTrial: true, daysLeft, urgency: 'warm', label: `${daysLeft}d` }
  if (daysLeft >= 1) return { isTrial: true, daysLeft, urgency: 'hot',  label: `${daysLeft}d` }
  if (daysLeft === 0) return { isTrial: true, daysLeft, urgency: 'last', label: 'HOY' }
  // Expirado pero dentro de la ventana de recovery
  if (daysLeft >= -RECOVERY_WINDOW_DAYS) return { isTrial: true, daysLeft, urgency: 'expired', label: `vencido ${-daysLeft}d` }
  return { isTrial: false, label: 'vencido', daysLeft, urgency: 'lost' }
}

// Conversion-likely signal: cuántos datos cargó el workspace
const deriveTemperature = (data) => {
  if (!data) return { level: 'cold', icon: '❄️', label: 'Sin uso', tone: '#94A3B8' }
  const budgets  = Array.isArray(data.budgets)  ? data.budgets.length  : 0
  const clients  = Array.isArray(data.clients)  ? data.clients.length  : 0
  const products = Array.isArray(data.products) ? data.products.length : 0
  if (budgets >= 5 || clients >= 10) return { level: 'hot',  icon: '🔥', label: 'Caliente', tone: '#DC2626' }
  if (budgets >= 1 || clients >= 3 || products >= 3) return { level: 'warm', icon: '🌡️', label: 'Tibio', tone: '#D97706' }
  return { level: 'cold', icon: '❄️', label: 'Frío', tone: '#94A3B8' }
}

const urgencyTone = (u) => ({
  fresh:   { bg: 'rgba(124,58,237,.10)', fg: '#7C3AED' },
  warm:    { bg: 'rgba(217,119,6,.12)',  fg: '#D97706' },
  hot:     { bg: 'rgba(220,38,38,.12)',  fg: '#DC2626' },
  last:    { bg: '#DC2626',              fg: '#fff' },
  expired: { bg: 'rgba(148,163,184,.18)', fg: '#475569' },
  paid:    { bg: 'rgba(22,163,74,.12)',  fg: '#16A34A' },
  lost:    { bg: 'rgba(148,163,184,.12)', fg: '#94A3B8' },
}[u] || { bg: 'var(--surface2)', fg: 'var(--txt3)' })

const fmtDate = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

// Mensaje WhatsApp pre-cargado para contactar prospect
const waLink = (wsName, kind = 'trial') => {
  const msgs = {
    trial:    `¡Hola! Soy de ANMA Regalos. Vi que estás probando el sistema con ${wsName || 'tu negocio'}. ¿Cómo va? Si necesitás una mano, estoy acá.`,
    expiring: `¡Hola! Te escribo desde ANMA Regalos. Tu prueba está por vencer y no quiero que pierdas tus datos. ¿Charlamos para activar tu plan?`,
    expired:  `¡Hola! Tu prueba de ANMA Regalos terminó hace unos días. Tus datos siguen guardados — si querés retomarlos, en 1 click activamos.`,
    paid:     `¡Hola! Soy de ANMA Regalos. ¿Cómo está yendo todo con el sistema?`,
  }
  return `https://api.whatsapp.com/send?text=${encodeURIComponent(msgs[kind] || msgs.trial)}`
}

// ── Componente ──────────────────────────────────────────────────────────
export default function Admin() {
  const { isGlobalAdmin, user } = useAuth()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [tab, setTab] = useState('trials')        // 'trials' | 'paid' | 'all'
  const [expanded, setExpanded] = useState(null)
  const [members, setMembers] = useState({})
  const [notifPerm, setNotifPerm] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'denied')
  const [recentSignups, setRecentSignups] = useState([])
  const toast = useToast()

  const load = useCallback(async () => {
    setLoading(true); setErr('')
    try {
      // 1. Scope: usuarios con datos en este sitio + traemos updated_at + el blob data
      //    para derivar 'temperature' (cuántos datos cargó).
      const { data: siteUsers, error: e0 } = await supabase
        .from('anma_user_data')
        .select('user_id, updated_at, data')
        .eq('site_key', SITE_KEY)
      if (e0) throw e0
      const userActivity = new Map()
      ;(siteUsers || []).forEach(r => userActivity.set(r.user_id, { updated_at: r.updated_at, data: r.data }))
      const allowedWsIds = new Set(userActivity.keys())

      // 2. Workspaces
      const { data: wss, error: e1 } = await supabase
        .from('workspaces')
        .select('id, name, plan, seats_allowed, status, created_at')
        .order('created_at', { ascending: false })
      if (e1) throw e1
      const scopedWss = (wss || []).filter(w => allowedWsIds.has(w.id))

      // 3. Memberships
      const { data: mems, error: e2 } = await supabase
        .from('memberships')
        .select('id, workspace_id, role, status, user_id, created_at')
      if (e2) throw e2

      const used = {}
      const byWs = {}
      ;(mems || []).forEach(m => {
        if (!allowedWsIds.has(m.workspace_id)) return
        if (m.role !== 'owner' && (m.status === 'active' || m.status === 'invited')) {
          used[m.workspace_id] = (used[m.workspace_id] || 0) + 1
        }
        byWs[m.workspace_id] = byWs[m.workspace_id] || []
        byWs[m.workspace_id].push(m)
      })

      // 4. Enriquecer cada workspace
      const enriched = scopedWss.map(w => {
        const act = userActivity.get(w.id) || {}
        return {
          ...w,
          seats_used: used[w.id] || 0,
          last_activity: act.updated_at,
          trial: deriveTrialState(w),
          temp:  deriveTemperature(act.data),
        }
      })

      setRows(enriched)
      setMembers(byWs)
    } catch (e) {
      setErr(e.message || 'Error cargando workspaces')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { if (isGlobalAdmin) load() }, [isGlobalAdmin, load])

  // ── Realtime: nuevos signups en vivo ──────────────────────────────────
  useRealtimeSignups((newWs) => {
    if (!newWs?.id) return
    const wsName = newWs.name || 'Nuevo workspace'
    toast(`🎉 Nuevo signup: ${wsName}`, 'ok')
    const n = sendBrowserNotification('Nuevo signup en ANMA Regalos', {
      body: `${wsName} acaba de registrarse. Mirá tu Admin para contactarlos.`,
      tag: 'anma-signup',
    })
    if (n) { n.onclick = () => { window.focus(); n.close() } }
    setRecentSignups(prev => [{ id: newWs.id, name: wsName, at: Date.now() }, ...prev].slice(0, 10))
    load()
  }, isGlobalAdmin)

  const enableNotifs = async () => {
    const perm = await ensureNotificationPermission()
    setNotifPerm(perm)
    if (perm === 'granted') {
      sendBrowserNotification('Notificaciones activadas ✓', {
        body: 'Te avisaremos cuando alguien nuevo se registre.',
        tag: 'anma-notif-test',
      })
      toast('Notificaciones activadas. Te avisaremos en vivo.', 'ok')
    } else if (perm === 'denied') {
      toast('Bloqueadas. Activalas desde la barra del navegador.', 'in')
    }
  }

  // ── Acciones admin ─────────────────────────────────────────────────────
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

  // ── Filtrado por tab ───────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (tab === 'trials') {
      // Trials activos + recientemente vencidos (recovery window), ordenados por urgencia
      return rows
        .filter(w => w.trial.isTrial)
        .sort((a, b) => {
          // Prioridad: last (vence hoy) > hot > warm > fresh > expired
          const order = { last: 0, hot: 1, warm: 2, fresh: 3, expired: 4 }
          return (order[a.trial.urgency] ?? 99) - (order[b.trial.urgency] ?? 99)
        })
    }
    if (tab === 'paid') {
      return rows.filter(w => w.plan !== 'solo' || (w.plan === 'solo' && !w.trial.isTrial && w.trial.urgency === 'lost'))
                 .filter(w => w.plan !== 'solo')
    }
    return rows  // 'all'
  }, [rows, tab])

  // ── Métricas headline ──────────────────────────────────────────────────
  const metrics = useMemo(() => {
    const trialsActivos = rows.filter(w => w.trial.isTrial && w.trial.daysLeft >= 0).length
    const vencenPronto  = rows.filter(w => w.trial.isTrial && w.trial.daysLeft >= 0 && w.trial.daysLeft <= 2).length
    const pagados       = rows.filter(w => w.plan !== 'solo' && w.status === 'active').length
    const convertidos30 = rows.filter(w => w.plan !== 'solo' && daysSince(w.created_at) <= 30).length
    const hotProspects  = rows.filter(w => w.trial.isTrial && w.trial.daysLeft >= 0 && w.temp.level === 'hot').length
    return { trialsActivos, vencenPronto, pagados, convertidos30, hotProspects }
  }, [rows])

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
      <style>{`
        .admin-mcard{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:16px 18px;display:flex;align-items:center;gap:14px;transition:transform .15s,box-shadow .15s}
        .admin-mcard:hover{transform:translateY(-1px);box-shadow:0 6px 18px rgba(0,0,0,.06)}
        .admin-mcard-ico{width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}
        .admin-mcard-val{font-size:22px;font-weight:800;color:var(--txt);line-height:1;letter-spacing:-.3px}
        .admin-mcard-lbl{font-size:11px;font-weight:700;color:var(--txt3);text-transform:uppercase;letter-spacing:.05em;margin-top:4px}
        .admin-mgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-bottom:18px}

        .admin-tabs{display:inline-flex;background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:3px;gap:1px;margin-bottom:14px}
        .admin-tab{padding:8px 18px;border:none;background:none;border-radius:7px;font-size:12.5px;font-weight:600;cursor:pointer;color:var(--txt3);transition:all .15s;font-family:inherit;display:inline-flex;align-items:center;gap:6px}
        .admin-tab.active{background:var(--surface);color:var(--txt);box-shadow:0 1px 3px rgba(0,0,0,.08);font-weight:700}
        .admin-tab .chip{background:var(--brand);color:#fff;font-size:10px;font-weight:800;padding:1px 7px;border-radius:99px;min-width:18px;text-align:center}
        .admin-tab.active .chip{background:var(--brand)}
        .admin-tab:not(.active) .chip{background:var(--surface3);color:var(--txt2)}

        .trial-row{transition:background .15s}
        .trial-row:hover{background:var(--surface2)}
        .trial-actions a,.trial-actions button{display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border-radius:7px;border:1px solid var(--border);background:var(--surface);color:var(--txt2);font-size:11.5px;font-weight:600;cursor:pointer;text-decoration:none;font-family:inherit;transition:all .12s;white-space:nowrap}
        .trial-actions a:hover,.trial-actions button:hover{border-color:var(--brand);color:var(--brand)}
        .trial-actions .wa-btn{background:#25D366;color:#fff;border-color:#25D366}
        .trial-actions .wa-btn:hover{background:#1eb755;color:#fff;border-color:#1eb755}

        .urgency-pill{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:99px;font-size:11px;font-weight:700;white-space:nowrap}

        @media(max-width:780px){
          .admin-tabs{display:flex;width:100%;overflow-x:auto;scrollbar-width:none}
          .admin-tabs::-webkit-scrollbar{display:none}
          .admin-tab{flex-shrink:0}
        }
      `}</style>

      {/* ── Header ───────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: '-.3px' }}>
            <i className="fa fa-shield-halved" style={{ marginRight: 8, color: '#7C3AED' }} />
            Admin · ANMA Regalos
          </h1>
          <div style={{ fontSize: 12, color: 'var(--txt3)', marginTop: 2 }}>
            Gestión cross-tenant · {user?.email}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {notifPerm !== 'granted' && (
            <button
              className="btn btn-secondary"
              onClick={enableNotifs}
              title={notifPerm === 'denied' ? 'Notificaciones bloqueadas en el navegador' : 'Activar notificaciones del navegador'}
              style={notifPerm === 'denied' ? { opacity: .7 } : { background: 'rgba(124,58,237,.08)', color: '#7C3AED', borderColor: 'rgba(124,58,237,.25)' }}
            >
              <i className={`fa ${notifPerm === 'denied' ? 'fa-bell-slash' : 'fa-bell'}`} style={{ marginRight: 6 }} />
              {notifPerm === 'denied' ? 'Notif. bloqueadas' : 'Activar avisos'}
            </button>
          )}
          {notifPerm === 'granted' && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: 'rgba(22,163,74,.10)', color: '#16A34A', border: '1px solid rgba(22,163,74,.25)', borderRadius: 8, fontSize: 12, fontWeight: 700 }}>
              <i className="fa fa-bell" /> Avisos en vivo activos
            </span>
          )}
          <button className="btn btn-secondary" onClick={load} disabled={loading}>
            <i className={`fa ${loading ? 'fa-spinner fa-spin' : 'fa-rotate-right'}`} style={{ marginRight: 6 }} />
            Refrescar
          </button>
        </div>
      </div>

      {recentSignups.length > 0 && (
        <div style={{ marginBottom: 14, padding: '10px 14px', background: 'linear-gradient(90deg, rgba(124,58,237,.08), rgba(99,102,241,.05))', border: '1px solid rgba(124,58,237,.25)', borderRadius: 10, fontSize: 12.5, color: 'var(--txt2)' }}>
          <i className="fa fa-bolt" style={{ color: '#7C3AED', marginRight: 6 }} />
          <strong>{recentSignups.length} signup{recentSignups.length !== 1 ? 's' : ''} en esta sesión:</strong>{' '}
          {recentSignups.slice(0, 3).map((s, i) => (
            <span key={s.id}>{i > 0 && ' · '}{s.name}</span>
          ))}
          {recentSignups.length > 3 && ` +${recentSignups.length - 3} más`}
          <button onClick={() => setRecentSignups([])} style={{ marginLeft: 10, background: 'transparent', border: 'none', color: 'var(--txt3)', cursor: 'pointer', fontSize: 11 }}>
            <i className="fa fa-xmark" />
          </button>
        </div>
      )}

      {/* ── Métricas headline ────────────────────────────────────────── */}
      <div className="admin-mgrid">
        <div className="admin-mcard">
          <div className="admin-mcard-ico" style={{ background: 'rgba(124,58,237,.12)', color: '#7C3AED' }}>
            <i className="fa fa-rocket" />
          </div>
          <div>
            <div className="admin-mcard-val">{metrics.trialsActivos}</div>
            <div className="admin-mcard-lbl">Trials activos</div>
          </div>
        </div>
        <div className="admin-mcard">
          <div className="admin-mcard-ico" style={{ background: 'rgba(220,38,38,.12)', color: '#DC2626' }}>
            <i className="fa fa-hourglass-half" />
          </div>
          <div>
            <div className="admin-mcard-val" style={{ color: metrics.vencenPronto > 0 ? '#DC2626' : undefined }}>
              {metrics.vencenPronto}
            </div>
            <div className="admin-mcard-lbl">Vencen en 48h</div>
          </div>
        </div>
        <div className="admin-mcard">
          <div className="admin-mcard-ico" style={{ background: 'rgba(217,119,6,.12)', color: '#D97706' }}>
            <i className="fa fa-fire" />
          </div>
          <div>
            <div className="admin-mcard-val">{metrics.hotProspects}</div>
            <div className="admin-mcard-lbl">Prospectos calientes</div>
          </div>
        </div>
        <div className="admin-mcard">
          <div className="admin-mcard-ico" style={{ background: 'rgba(22,163,74,.12)', color: '#16A34A' }}>
            <i className="fa fa-check-circle" />
          </div>
          <div>
            <div className="admin-mcard-val">{metrics.pagados}</div>
            <div className="admin-mcard-lbl">Clientes pagos</div>
          </div>
        </div>
        <div className="admin-mcard">
          <div className="admin-mcard-ico" style={{ background: 'rgba(99,102,241,.12)', color: '#6366F1' }}>
            <i className="fa fa-chart-line" />
          </div>
          <div>
            <div className="admin-mcard-val">{metrics.convertidos30}</div>
            <div className="admin-mcard-lbl">Convertidos · 30d</div>
          </div>
        </div>
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────── */}
      <div className="admin-tabs">
        <button className={`admin-tab ${tab === 'trials' ? 'active' : ''}`} onClick={() => setTab('trials')}>
          <i className="fa fa-rocket" /> Trials <span className="chip">{rows.filter(w => w.trial.isTrial).length}</span>
        </button>
        <button className={`admin-tab ${tab === 'paid' ? 'active' : ''}`} onClick={() => setTab('paid')}>
          <i className="fa fa-credit-card" /> Pagados <span className="chip">{rows.filter(w => w.plan !== 'solo').length}</span>
        </button>
        <button className={`admin-tab ${tab === 'all' ? 'active' : ''}`} onClick={() => setTab('all')}>
          <i className="fa fa-list" /> Todos <span className="chip">{rows.length}</span>
        </button>
      </div>

      {err && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', padding: 10, borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          <i className="fa fa-triangle-exclamation" style={{ marginRight: 6 }} />{err}
        </div>
      )}

      {/* ── Tabla ───────────────────────────────────────────────────── */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: tab === 'trials' ? 920 : 720 }}>
            <thead>
              <tr style={{ background: 'var(--surface2)', textAlign: 'left' }}>
                <th style={th}>Workspace</th>
                {tab === 'trials' && <th style={{ ...th, textAlign: 'center' }}>Trial</th>}
                {tab === 'trials' && <th style={{ ...th, textAlign: 'center' }}>Actividad</th>}
                {tab === 'trials' && <th style={{ ...th, textAlign: 'center' }}>Últ. uso</th>}
                <th style={th}>Plan</th>
                {tab !== 'trials' && <th style={{ ...th, textAlign: 'center' }}>Seats</th>}
                <th style={{ ...th, textAlign: 'center' }}>Estado</th>
                <th style={{ ...th, textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={tab === 'trials' ? 7 : 5} style={{ padding: 24, textAlign: 'center', color: 'var(--txt3)' }}>
                  <i className="fa fa-spinner fa-spin" style={{ marginRight: 8 }} />
                  Cargando…
                </td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={tab === 'trials' ? 7 : 5} style={{ padding: 32, textAlign: 'center', color: 'var(--txt3)' }}>
                  {tab === 'trials' ? 'Sin trials por ahora — todo bajo control.' :
                   tab === 'paid'   ? 'Sin clientes pagos todavía.' :
                   'Sin workspaces.'}
                </td></tr>
              )}
              {!loading && filtered.map(w => {
                const isOpen = expanded === w.id
                const overLimit = w.seats_used > w.seats_allowed
                const ut = urgencyTone(w.trial.urgency)
                const waKind = w.trial.urgency === 'last' || w.trial.urgency === 'hot'
                  ? 'expiring'
                  : w.trial.urgency === 'expired' ? 'expired'
                  : w.plan !== 'solo' ? 'paid' : 'trial'
                return (
                  <>
                    <tr key={w.id} className="trial-row" style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={td}>
                        <div style={{ fontWeight: 600 }}>{w.name || 'Sin nombre'}</div>
                        <div style={{ fontSize: 11, color: 'var(--txt3)', fontFamily: 'monospace', marginTop: 2 }}>
                          {w.id.slice(0, 8)}… · creado {fmtDate(w.created_at)}
                        </div>
                      </td>
                      {tab === 'trials' && (
                        <>
                          <td style={{ ...td, textAlign: 'center' }}>
                            <span className="urgency-pill" style={{ background: ut.bg, color: ut.fg }}>
                              {w.trial.urgency === 'expired' ? <i className="fa fa-clock" /> :
                               w.trial.urgency === 'last'    ? <i className="fa fa-fire" /> :
                               <i className="fa fa-rocket" />}
                              {w.trial.label}
                            </span>
                          </td>
                          <td style={{ ...td, textAlign: 'center' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: w.temp.tone }}>
                              <span style={{ fontSize: 14 }}>{w.temp.icon}</span> {w.temp.label}
                            </span>
                          </td>
                          <td style={{ ...td, textAlign: 'center', fontSize: 11.5, color: 'var(--txt3)' }}>
                            {w.last_activity ? `${daysSince(w.last_activity)}d` : '—'}
                          </td>
                        </>
                      )}
                      <td style={td}>
                        <select value={w.plan} onChange={e => changePlan(w.id, e.target.value)} style={sel}>
                          {PLANS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                        </select>
                      </td>
                      {tab !== 'trials' && (
                        <td style={{ ...td, textAlign: 'center' }}>
                          <input
                            type="number" min={0} value={w.seats_allowed}
                            onChange={e => setSeats(w.id, e.target.value)}
                            style={{ width: 60, padding: '4px 6px', textAlign: 'center', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', color: 'var(--txt)' }}
                          />
                          <div style={{ fontSize: 11, color: overLimit ? '#DC2626' : 'var(--txt3)', marginTop: 2 }}>
                            usados: {w.seats_used}{overLimit ? ' ⚠' : ''}
                          </div>
                        </td>
                      )}
                      <td style={{ ...td, textAlign: 'center' }}>
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 10,
                          background: w.status === 'active' ? 'rgba(22,163,74,.12)' : 'rgba(220,38,38,.12)',
                          color: w.status === 'active' ? '#16A34A' : '#DC2626',
                        }}>{w.status}</span>
                      </td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        <div className="trial-actions" style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                          <a href={waLink(w.name, waKind)} target="_blank" rel="noopener noreferrer" className="wa-btn">
                            <i className="fa-brands fa-whatsapp" /> WhatsApp
                          </a>
                          <button onClick={() => setExpanded(isOpen ? null : w.id)} title="Ver miembros">
                            <i className={`fa fa-chevron-${isOpen ? 'up' : 'down'}`} /> Miembros
                          </button>
                          <button onClick={() => toggleStatus(w.id, w.status)} title={w.status === 'active' ? 'Pausar' : 'Activar'}>
                            <i className={`fa fa-${w.status === 'active' ? 'pause' : 'play'}`} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr style={{ background: 'var(--surface2)' }}>
                        <td colSpan={tab === 'trials' ? 7 : 5} style={{ padding: '10px 14px' }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>
                            Miembros ({(members[w.id] || []).length})
                          </div>
                          {(members[w.id] || []).length === 0 ? (
                            <div style={{ fontSize: 12, color: 'var(--txt3)' }}>Sin miembros invitados</div>
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
                                        <button onClick={() => revokeMember(m.id)} style={btnLink}>Revocar</button>
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

      {/* ── Leyenda de temperatura/urgencia ─────────────────────────── */}
      {tab === 'trials' && filtered.length > 0 && (
        <div style={{ marginTop: 14, padding: '10px 14px', background: 'var(--surface2)', borderRadius: 10, fontSize: 11.5, color: 'var(--txt3)', lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--txt2)' }}>Cómo leer:</strong>{' '}
          <span style={{ color: '#DC2626', fontWeight: 700 }}>HOY</span> vence ya ·{' '}
          <span style={{ color: '#DC2626' }}>1-3d</span> contactar urgente ·{' '}
          <span style={{ color: '#D97706' }}>4-5d</span> a tiempo ·{' '}
          🔥 caliente (cargó muchos datos, alta intención) · ❄️ frío (sin uso, probablemente abandone)
        </div>
      )}
    </div>
  )
}

const th = { padding: '10px 12px', fontWeight: 700, fontSize: 11, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.06em' }
const td = { padding: '10px 12px', verticalAlign: 'middle' }
const sel = { padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', color: 'var(--txt)', fontSize: 12 }
const btnLink = { background: 'none', border: 'none', color: 'var(--brand)', cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: 0 }
