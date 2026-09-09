import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '../../context/DataContext'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { supabase } from '../../lib/supabase'
import { fmt, db, dbW } from '../../lib/storage'
import { getEstado } from '../../lib/pedido'
import { useAdminAlerts } from '../../lib/useAdminAlerts'
import { sendBrowserNotification } from '../../lib/useRealtimeSignups'

/* ═══════════════════════════════════════════════════════════════
   ACTION ENGINE — Mapeo dinámico de categoría → acción primaria.
   Para agregar un nuevo tipo (ej: 'cumpleaños'), solo hay que
   agregar una entrada acá. El sistema renderiza el botón correcto
   sin tocar ningún otro archivo.
═══════════════════════════════════════════════════════════════ */
const ACTION_MAP = {
  /* ──────────────────────────────────────────────────────────────
     💸 PAGO — Dispara mensaje de cobro por WhatsApp.
     Extrae: clientName, budgetNum, amount, wa
  ────────────────────────────────────────────────────────────── */
  pago: {
    label: 'Cobrar',
    icon: 'fa-money-bill-wave',
    color: '#16A34A',
    bg: '#DCFCE7',
    handler: (alert, { nav, setOpen }) => {
      setOpen(false)
      const num = (alert.wa || '').replace(/\D/g, '')
      if (!num) { nav(alert.route || '/'); return }
      const parts = [
        `Hola ${alert.clientName || ''}`,
        alert.budgetNum ? `, te escribo por el pedido *${alert.budgetNum}*` : '',
        alert.amount    ? ` — queda pendiente el pago de *${alert.amount}*` : '',
        `. ¿Cómo preferís abonar?`,
      ]
      window.open(`https://wa.me/${num}?text=${encodeURIComponent(parts.join(''))}`, '_blank')
    },
  },

  /* ──────────────────────────────────────────────────────────────
     🚚 LOGÍSTICA — Navega al pedido específico con react-router.
     Extrae: budgetNum, route → /presupuesto/:id
  ────────────────────────────────────────────────────────────── */
  logistica: {
    label: 'Cambiar Estado',
    icon: 'fa-truck-ramp-box',
    color: '#2563EB',
    bg: '#EFF6FF',
    handler: (alert, { nav, setOpen }) => {
      setOpen(false)
      nav(alert.route || '/')
    },
  },

  /* ──────────────────────────────────────────────────────────────
     💬 COMERCIAL — Seguimiento por WhatsApp.
     Extrae: clientName, budgetNum, wa
  ────────────────────────────────────────────────────────────── */
  comercial: {
    label: 'Seguimiento',
    icon: 'fa-comment-dots',
    color: '#7C3AED',
    bg: '#F3E8FF',
    handler: (alert, { nav, setOpen }) => {
      setOpen(false)
      const num = (alert.wa || '').replace(/\D/g, '')
      if (!num) { nav(alert.route || '/'); return }
      const parts = [
        `Hola ${alert.clientName || ''}! ¿Cómo estás?`,
        alert.budgetNum ? ` Quería consultarte por el presupuesto *${alert.budgetNum}*` : '',
        ` que te enviamos. ¿Pudiste evaluarlo? Estoy a disposición para lo que necesites.`,
      ]
      window.open(`https://wa.me/${num}?text=${encodeURIComponent(parts.join(''))}`, '_blank')
    },
  },

  /* ──────────────────────────────────────────────────────────────
     📦 STOCK — Redirige al catálogo para reponer.
     Extrae: route → /catalogo
  ────────────────────────────────────────────────────────────── */
  stock: {
    label: 'Reponer',
    icon: 'fa-boxes-stacked',
    color: '#D97706',
    bg: '#FEF3C7',
    handler: (alert, { nav, setOpen }) => {
      setOpen(false)
      nav(alert.route || '/catalogo')
    },
  },

  /* ──────────────────────────────────────────────────────────────
     🎂 CUMPLEAÑOS — Saludar por WhatsApp.
     Extrae: clientName, wa
  ────────────────────────────────────────────────────────────── */
  cumpleaños: {
    label: 'Saludar',
    icon: 'fa-cake-candles',
    color: '#EC4899',
    bg: '#FCE7F3',
    handler: (alert, { nav, setOpen }) => {
      setOpen(false)
      const num = (alert.wa || '').replace(/\D/g, '')
      if (!num) { nav(alert.route || '/clientes'); return }
      const msg = `¡Feliz cumpleaños ${alert.clientName || ''}! 🎉 Desde todo el equipo te deseamos un excelente día. ¡Que la pases genial!`
      window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`, '_blank')
    },
  },

  /* ──────────────────────────────────────────────────────────────
     🔔 RECORDATORIO — Acción genérica de recordatorio.
     Extrae: clientName, wa, budgetNum, route
  ────────────────────────────────────────────────────────────── */
  recordatorio: {
    label: 'Contactar',
    icon: 'fa-bell',
    color: '#0891B2',
    bg: '#ECFEFF',
    handler: (alert, { nav, setOpen }) => {
      setOpen(false)
      const num = (alert.wa || '').replace(/\D/g, '')
      if (!num) { nav(alert.route || '/'); return }
      const msg = `Hola ${alert.clientName || ''}! Te contacto como recordatorio sobre ${alert.budgetNum ? `el pedido *${alert.budgetNum}*` : 'tu consulta'}. ¿En qué puedo ayudarte?`
      window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`, '_blank')
    },
  },

  /* ──────────────────────────────────────────────────────────────
     🛡️ ADMIN — Alertas del sistema (signup, pago, error).
     Navega al panel Admin. workspaceId opcional para highlight futuro.
  ────────────────────────────────────────────────────────────── */
  admin: {
    label: 'Ir al Admin',
    icon: 'fa-shield-halved',
    color: '#7C3AED',
    bg: '#F3E8FF',
    handler: (alert, { nav, setOpen }) => {
      setOpen(false)
      const ws = alert.workspaceId ? `?w=${alert.workspaceId}` : ''
      nav(`/admin${ws}`)
    },
  },

  /* ──────────────────────────────────────────────────────────────
     ⚠️ FALLBACK — Cualquier categoría nueva/desconocida.
     Siempre muestra "Gestionar Pedido" → editor completo.
  ────────────────────────────────────────────────────────────── */
  _default: {
    label: 'Gestionar Pedido',
    icon: 'fa-arrow-up-right-from-square',
    color: 'var(--brand)',
    bg: 'var(--brand-xlt)',
    handler: (alert, { nav, setOpen }) => {
      setOpen(false)
      nav(alert.route || '/')
    },
  },
}

/**
 * Resuelve la acción para una alerta dada su categoría.
 * Si la categoría no existe en ACTION_MAP, usa _default (fallback).
 */
function resolveAction(category) {
  return ACTION_MAP[category] || ACTION_MAP._default
}

/* ══════════════════════════════════════════════════════════════ */

const daysAgo = (iso) => {
  if (!iso) return null
  const d = new Date(iso + 'T00:00')
  const t = new Date(); t.setHours(0, 0, 0, 0)
  return Math.floor((t - d) / 86400000)
}
const daysUntil = (iso) => {
  if (!iso) return null
  const d = new Date(iso + 'T00:00')
  const t = new Date(); t.setHours(0, 0, 0, 0)
  return Math.ceil((d - t) / 86400000)
}

function buildAlerts(budgets, products) {
  const alerts = []

  // ── STOCK ALERTS ──
  ;(products || []).forEach(p => {
    const stock = Number(p.stock ?? -1)
    const minStock = Number(p.minStock ?? 0)
    if (!p.name || stock < 0) return
    const pid = typeof p.id === 'number' ? p.id : 0
    if (stock === 0 && minStock >= 0) {
      alerts.push({
        id: `stock0-${p.id}`,
        level: 'critical',
        category: 'stock',
        icon: 'fa-box-open',
        title: `Sin stock: ${p.name}`,
        body: `El producto se agotó — reponelo antes de aceptar nuevos pedidos`,
        route: '/catalogo',
        ts: pid,
      })
    } else if (minStock > 0 && stock <= minStock) {
      alerts.push({
        id: `stocklow-${p.id}`,
        level: 'warning',
        category: 'stock',
        icon: 'fa-box',
        title: `Te quedan solo ${stock} ${p.name}`,
        body: `Mínimo configurado: ${minStock} unidades — es momento de reponer`,
        route: '/catalogo',
        ts: pid,
      })
    }
  })

  // ── BUDGET ALERTS ──
  budgets.forEach(b => {
    const sinceDays = daysAgo(b.date)
    const delivDays = daysUntil(b.deliveryDate)
    const e = getEstado(b)
    const active = !['cerrado', 'perdido'].includes(e)
    const cliente = b.contact || b.company || 'el cliente'
    const meta = { wa: b.wa, clientName: cliente, budgetNum: b.num, amount: fmt(b.total) }

    // 🔴 CRÍTICO: entrega vencida → logística
    if (b.deliveryDate && delivDays !== null && delivDays < 0 && active && e !== 'entregado') {
      alerts.push({
        id: `overdue-${b.id}`,
        level: 'critical',
        category: 'logistica',
        icon: 'fa-fire',
        title: `Entrega vencida — ${b.num}`,
        body: `${cliente} · ${Math.abs(delivDays)}d de retraso · ${fmt(b.total)}`,
        route: `/pedido/${b.id}`,
        ts: b.id,
        ...meta,
      })
    }

    // 🔴 CRÍTICO: pago pendiente >21 días → pago
    if (b.payStatus === 'pending' && ['confirmado', 'produccion'].includes(e) && sinceDays !== null && sinceDays > 21) {
      alerts.push({
        id: `unpaid-${b.id}`,
        level: 'critical',
        category: 'pago',
        icon: 'fa-circle-dollar-to-slot',
        title: `Cobro pendiente — ${b.num}`,
        body: `${cliente} · ${sinceDays}d sin cobrar · ${fmt(b.total)}`,
        route: `/pedido/${b.id}`,
        ts: b.id,
        ...meta,
      })
    }

    // 🟡 ALERTA: entrega próxima ≤3 días → logística
    if (b.deliveryDate && delivDays !== null && delivDays >= 0 && delivDays <= 3 && active && e !== 'entregado') {
      const whenLabel = delivDays === 0 ? 'HOY' : delivDays === 1 ? 'mañana' : `en ${delivDays} días`
      alerts.push({
        id: `soon-${b.id}`,
        level: 'warning',
        category: 'logistica',
        icon: 'fa-truck-fast',
        title: delivDays <= 1
          ? `Debés entregar ${whenLabel} a ${cliente}`
          : `Entregá el pedido de ${cliente} ${whenLabel}`,
        body: `${b.num} · ${fmt(b.total)}`,
        route: `/pedido/${b.id}`,
        ts: b.id,
        ...meta,
      })
    }

    // 🟡 ALERTA: confirmado sin seña 2-14 días → pago
    if (e === 'confirmado' && b.payStatus === 'pending' && sinceDays !== null && sinceDays >= 2 && sinceDays <= 14) {
      alerts.push({
        id: `nosena-${b.id}`,
        level: 'warning',
        category: 'pago',
        icon: 'fa-clock-rotate-left',
        title: `${b.num} lleva ${sinceDays}d sin la seña`,
        body: `${cliente} — pedido confirmado pero sin cobrar depósito · ${fmt(b.total)}`,
        route: `/pedido/${b.id}`,
        ts: b.id,
        ...meta,
      })
    }

    // 🟡 ALERTA: seguimiento >7 días sin respuesta → comercial
    if (e === 'presupuestado' && sinceDays !== null && sinceDays > 7) {
      alerts.push({
        id: `followup-${b.id}`,
        level: 'warning',
        category: 'comercial',
        icon: 'fa-hourglass-half',
        title: `Seguimiento necesario — ${b.num}`,
        body: `${cliente} · ${sinceDays}d sin respuesta · ${fmt(b.total)}`,
        route: '/',
        ts: b.id,
        ...meta,
      })
    }
  })

  const order = { critical: 0, warning: 1 }
  alerts.sort((a, b) => order[a.level] - order[b.level] || b.ts - a.ts)
  return alerts
}

/* ── Helpers Supabase (fire-and-forget, silencioso si tabla no existe) ── */
function persistReadToSupabase(userId, notifId) {
  if (!userId) return
  supabase
    .from('notif_read')
    .upsert(
      { user_id: userId, notif_id: notifId, read_at: new Date().toISOString() },
      { onConflict: 'user_id,notif_id' }
    )
    .then(null, () => {})
}

function persistBatchReadToSupabase(userId, notifIds) {
  if (!userId || !notifIds.length) return
  const rows = notifIds.map(id => ({
    user_id: userId,
    notif_id: id,
    read_at: new Date().toISOString(),
  }))
  supabase
    .from('notif_read')
    .upsert(rows, { onConflict: 'user_id,notif_id' })
    .then(null, () => {})
}

const LEVEL_COLORS = {
  critical: { bg: 'var(--red)', light: '#FEE2E2', text: '#991B1B', border: '#FCA5A5' },
  warning:  { bg: '#F59E0B',   light: '#FEF3C7', text: '#92400E', border: '#FCD34D' },
}

/* Color del ÍCONO por categoría (independiente del semáforo del borde).
   Borde-izquierdo = urgencia; ícono = tipo. Dos ejes visuales. */
const CATEGORY_STYLE = {
  logistica:    { color: '#2563EB', bg: '#EFF6FF', label: 'Entrega' },
  pago:         { color: '#059669', bg: '#ECFDF5', label: 'Cobro' },
  comercial:    { color: '#7C3AED', bg: '#F5F3FF', label: 'Presupuesto' },
  stock:        { color: '#B45309', bg: '#FEF3C7', label: 'Stock' },
  insumo:       { color: '#B45309', bg: '#FEF3C7', label: 'Insumo' },
  cumpleaños:   { color: '#DB2777', bg: '#FCE7F3', label: 'Cumpleaños' },
  recordatorio: { color: '#0891B2', bg: '#ECFEFF', label: 'Recordatorio' },
  admin:        { color: '#7C3AED', bg: '#F3E8FF', label: 'Sistema' },
}
const catStyle = (cat) => CATEGORY_STYLE[cat] || { color: 'var(--brand)', bg: 'var(--brand-xlt)', label: 'Alerta' }

/* ── Item: card compacta, clickeable, tinte solo cuando NO leída */
function NotifItem({ alert, isRead: isReadFlag, executeAction, dismissAlert }) {
  const col    = LEVEL_COLORS[alert.level]
  const cat    = catStyle(alert.category)
  const action = resolveAction(alert.category)
  return (
    <div
      className={`notif-item${isReadFlag ? ' read' : ''}`}
      role="button" tabIndex={0}
      onClick={() => executeAction(alert)}
      onKeyDown={(e) => { if (e.key === 'Enter') executeAction(alert) }}
      style={{ borderLeft: `3px solid ${col.bg}`, background: isReadFlag ? 'var(--surface)' : col.light + '80' }}
      title={`${cat.label} · ${action.label}`}
    >
      {/* Ícono con color por CATEGORÍA (no por nivel) — segundo eje visual */}
      <div className="notif-item-ico" style={{ background: cat.bg, color: cat.color }}>
        <i className={`fa ${alert.icon}`} />
      </div>
      <div className="notif-item-body">
        <div className="notif-item-title" style={{ color: isReadFlag ? 'var(--txt2)' : col.text }}>
          {alert.title}
        </div>
        <div className="notif-item-sub">{alert.body}</div>
      </div>
      {!isReadFlag && <div className="notif-unread-dot" style={{ background: col.bg }} />}
      <button
        className="notif-dismiss-btn"
        onClick={(e) => { e.stopPropagation(); dismissAlert(alert) }}
        title="Descartar"
      >
        <i className="fa fa-xmark" />
      </button>
    </div>
  )
}

/* ── Agrupamiento visual: colapsa ≥3 alertas iguales bajo un header (evita
   la "pared roja" cuando hay muchas entregas vencidas idénticas). ── */
const GROUP_THRESHOLD = 3
function groupAlerts(alerts) {
  const out = []
  let bucket = null
  for (const a of alerts) {
    const key = `${a.category}::${a.level}`
    if (bucket && bucket.key === key) bucket.items.push(a)
    else { bucket = { key, category: a.category, level: a.level, items: [a] }; out.push(bucket) }
  }
  return out
}
function renderGroupedAlerts(alerts, { isRead, executeAction, dismissAlert, expandedGroups, setExpandedGroups }) {
  const groups = groupAlerts(alerts)
  const nodes = []
  for (const g of groups) {
    if (g.items.length < GROUP_THRESHOLD) {
      for (const a of g.items) {
        nodes.push(<NotifItem key={a.id} alert={a} isRead={isRead(a)} executeAction={executeAction} dismissAlert={dismissAlert} />)
      }
      continue
    }
    const col = LEVEL_COLORS[g.level]
    const cat = catStyle(g.category)
    const first = g.items[0]
    const isExpanded = expandedGroups.has(g.key)
    const unreadInGroup = g.items.filter(a => !isRead(a)).length
    const groupTitle = ({
      logistica:    'Entregas vencidas o próximas',
      pago:         'Cobros pendientes',
      comercial:    'Presupuestos por seguir',
      stock:        'Stock bajo o agotado',
      insumo:       'Insumos por reponer',
      cumpleaños:   'Cumpleaños',
      recordatorio: 'Recordatorios',
      admin:        'Alertas del sistema',
    })[g.category] || `${g.items.length} alertas`
    nodes.push(
      <div key={g.key} className="notif-group">
        <button
          className="notif-group-head"
          onClick={() => setExpandedGroups(prev => { const next = new Set(prev); next.has(g.key) ? next.delete(g.key) : next.add(g.key); return next })}
          style={{ borderLeft: `3px solid ${col.bg}`, background: unreadInGroup > 0 ? col.light + '80' : 'var(--surface)' }}
        >
          {/* Ícono con color por CATEGORÍA (no por nivel) — el borde ya trae el semáforo */}
          <div className="notif-item-ico" style={{ background: cat.bg, color: cat.color }}>
            <i className={`fa ${first.icon}`} />
          </div>
          <div className="notif-item-body">
            <div className="notif-item-title" style={{ color: unreadInGroup > 0 ? col.text : 'var(--txt2)' }}>
              {groupTitle} <span style={{ color: 'var(--txt3)', fontWeight: 600 }}>· {g.items.length}</span>
            </div>
            <div className="notif-item-sub">
              {unreadInGroup > 0 ? `${unreadInGroup} sin leer` : 'Todas leídas'} · tocá para {isExpanded ? 'colapsar' : 'ver todas'}
            </div>
          </div>
          <i className={`fa fa-chevron-${isExpanded ? 'up' : 'down'}`} style={{ color: 'var(--txt3)', fontSize: 11, marginRight: 6 }} />
        </button>
        {isExpanded && (
          <div className="notif-group-list">
            {g.items.map(a => (
              <NotifItem key={a.id} alert={a} isRead={isRead(a)} executeAction={executeAction} dismissAlert={dismissAlert} />
            ))}
          </div>
        )}
      </div>
    )
  }
  return nodes
}

export default function NotificationBell({ extraCount = 0, className = '', variant = 'topbar' }) {
  // extraCount: cuenta adicional a sumar al badge global (p.ej. tareas activas).
  // variant='sidebar' → estilos coherentes con el quick-bar del sidebar.
  const { get } = useData()
  const { user, isGlobalAdmin } = useAuth()
  const toast = useToast()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const [readIds, setReadIds] = useState(() => new Set(db('notifRead', [])))
  const [dismissedIds, setDismissedIds] = useState(() => new Set(db('notifDismissed', [])))
  // Grupos expandidos (por key "categoria:level"). Un grupo con ≥3 alertas
  // iguales se muestra colapsado por defecto (evita la "pared roja").
  const [expandedGroups, setExpandedGroups] = useState(() => new Set())

  const budgets  = get('budgets')
  const products = get('products')
  const localAlerts = useMemo(() => buildAlerts(budgets, products), [budgets, products])

  /* ── Admin alerts (Supabase, solo si isGlobalAdmin) ─────────────
     Vive en Topbar → funciona en toda la app (no solo en /admin). */
  const adminHook = useAdminAlerts(isGlobalAdmin)
  const adminAlerts = useMemo(() => (adminHook.alerts || []).map(a => ({
    id:        `admin-${a.id}`,
    _adminId:  a.id,
    _isAdmin:  true,
    _readAt:   a.read_at,
    level:     a.type === 'error' ? 'critical' : 'warning',
    category:  'admin',
    icon:      a.type === 'signup'  ? 'fa-user-plus'
             : a.type === 'payment' ? 'fa-money-bill-trend-up'
             : a.type === 'error'   ? 'fa-triangle-exclamation'
             : 'fa-shield-halved',
    title:     a.title,
    body:      a.body || '',
    workspaceId: a.workspace_id,
    ts:        new Date(a.created_at).getTime(),
  })), [adminHook.alerts])

  // Toast + browser notification cuando llega admin alert nuevo por realtime
  const lastAdminNotifIdRef = useRef(null)
  useEffect(() => {
    adminHook.onNew((newAlert) => {
      if (!newAlert?.id) return
      if (lastAdminNotifIdRef.current === newAlert.id) return
      lastAdminNotifIdRef.current = newAlert.id
      toast(`🎉 ${newAlert.title}`, 'ok')
      const n = sendBrowserNotification(newAlert.title, {
        body: newAlert.body || 'Nueva alerta en ANMA Admin',
        tag: `admin-alert-${newAlert.id}`,
      })
      if (n) { n.onclick = () => { window.focus(); n.close() } }
    })
  }, [adminHook, toast])

  const allAlerts = useMemo(() => [...adminAlerts, ...localAlerts], [adminAlerts, localAlerts])
  const alerts = useMemo(() => allAlerts.filter(a => !dismissedIds.has(a.id)), [allAlerts, dismissedIds])
  const dismissedCount = allAlerts.filter(a => dismissedIds.has(a.id)).length

  const isRead = useCallback((a) => a._isAdmin ? !!a._readAt : readIds.has(a.id), [readIds])
  const unread      = alerts.filter(a => !isRead(a))
  const hasCritical = unread.some(a => a.level === 'critical')
  const unreadCount = unread.length

  /* ── Mark single as read — enruta según origen (admin=Supabase, local=localStorage) ── */
  const markRead = useCallback((alertOrId) => {
    const alert = typeof alertOrId === 'object' ? alertOrId : alerts.find(a => a.id === alertOrId)
    if (!alert) return
    if (alert._isAdmin) {
      adminHook.markRead(alert._adminId)
      return
    }
    const newIds = new Set([...readIds, alert.id])
    setReadIds(newIds)
    dbW('notifRead', [...newIds])
    persistReadToSupabase(user?.id, alert.id)
  }, [readIds, user, alerts, adminHook])

  /* ── Mark all as read — locales + admin ── */
  const markAllRead = useCallback(() => {
    const unreadLocal = alerts.filter(a => !a._isAdmin && !readIds.has(a.id))
    const newIds = new Set([...readIds, ...alerts.filter(a => !a._isAdmin).map(a => a.id)])
    setReadIds(newIds)
    dbW('notifRead', [...newIds])
    persistBatchReadToSupabase(user?.id, unreadLocal.map(a => a.id))
    if (isGlobalAdmin) adminHook.markAllRead()
  }, [readIds, alerts, user, isGlobalAdmin, adminHook])

  const dismissAlert = useCallback((alertOrId) => {
    const alert = typeof alertOrId === 'object' ? alertOrId : alerts.find(a => a.id === alertOrId)
    if (!alert) return
    if (alert._isAdmin) {
      adminHook.dismiss(alert._adminId)
      return
    }
    const newIds = new Set([...dismissedIds, alert.id])
    setDismissedIds(newIds)
    dbW('notifDismissed', [...newIds])
  }, [dismissedIds, alerts, adminHook])

  const restoreDismissed = useCallback(() => {
    setDismissedIds(new Set())
    dbW('notifDismissed', [])
  }, [])

  /* ── Execute action: mark read → close drawer → run handler ── */
  const executeAction = useCallback((alert) => {
    markRead(alert)
    const action = resolveAction(alert.category)
    action.handler(alert, { nav, setOpen })
  }, [markRead, nav])

  useEffect(() => {
    if (!open) return
    const h = (e) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open])

  return (
    <>
      <button
        className={`${className || 'tb-btn'} notif-bell${hasCritical ? ' is-alert pulse-critical' : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-label="Notificaciones"
        title="Notificaciones"
      >
        <i className="fa fa-bell" style={
          variant === 'sidebar'
            ? (hasCritical ? { color: '#F87171' } : (unreadCount + extraCount) > 0 ? { color: '#FBBF24' } : undefined)
            : (!hasCritical && (unreadCount + extraCount) > 0 ? { color: '#D97706' } : undefined)
        } />
        {(unreadCount + extraCount) > 0 && (
          <span
            className="notif-badge"
            style={{ background: hasCritical ? '#EF4444' : '#F59E0B' }}
          >
            {(unreadCount + extraCount) > 9 ? '9+' : (unreadCount + extraCount)}
          </span>
        )}
      </button>

      {open && <div className="notif-overlay" onClick={() => setOpen(false)} />}

      <div className={`notif-drawer ${open ? 'open' : ''}`}>
        <div className="notif-drawer-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="fa fa-bell" style={{ color: 'var(--brand)' }} />
            <span style={{ fontWeight: 700, fontSize: 14 }}>Notificaciones</span>
            {unreadCount > 0 && (
              <span style={{ background: 'var(--brand)', color: '#fff', borderRadius: 99, fontSize: 10, fontWeight: 800, padding: '1px 7px' }}>
                {unreadCount}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {unreadCount > 0 && (
              <button className="notif-mark-all" onClick={markAllRead} title="Marcar todas como leídas">
                <i className="fa fa-check-double" /> Leer todas
              </button>
            )}
            <button className="tb-btn" onClick={() => setOpen(false)} style={{ width: 28, height: 28, fontSize: 13 }}>
              <i className="fa fa-xmark" />
            </button>
          </div>
        </div>

        <div className="notif-list">
          {alerts.length === 0 ? (
            <div className="notif-empty">
              <i className="fa fa-check-circle" style={{ fontSize: 28, color: '#10B981', marginBottom: 8 }} />
              <div style={{ fontWeight: 600, fontSize: 13 }}>Todo en orden</div>
              <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 4 }}>No hay alertas pendientes</div>
            </div>
          ) : (
            renderGroupedAlerts(alerts, { isRead, executeAction, dismissAlert, expandedGroups, setExpandedGroups })
          )}
          {dismissedCount > 0 && (
            <div className="notif-restore">
              <button onClick={restoreDismissed}>
                <i className="fa fa-rotate-left" />
                Restaurar {dismissedCount} descartada{dismissedCount !== 1 ? 's' : ''}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
