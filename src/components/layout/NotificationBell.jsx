import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '../../context/DataContext'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { fmt, db, dbW } from '../../lib/storage'

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
    const active = !['cancelled', 'lost'].includes(b.status)
    const cliente = b.contact || b.company || 'el cliente'
    const meta = { wa: b.wa, clientName: cliente, budgetNum: b.num, amount: fmt(b.total) }

    // 🔴 CRÍTICO: entrega vencida → logística
    if (b.deliveryDate && delivDays !== null && delivDays < 0 && active && b.status !== 'delivered') {
      alerts.push({
        id: `overdue-${b.id}`,
        level: 'critical',
        category: 'logistica',
        icon: 'fa-fire',
        title: `Entrega vencida — ${b.num}`,
        body: `${cliente} · ${Math.abs(delivDays)}d de retraso · ${fmt(b.total)}`,
        route: `/presupuesto/${b.id}`,
        ts: b.id,
        ...meta,
      })
    }

    // 🔴 CRÍTICO: pago pendiente >21 días → pago
    if (b.payStatus === 'pending' && b.status === 'confirmed' && sinceDays !== null && sinceDays > 21) {
      alerts.push({
        id: `unpaid-${b.id}`,
        level: 'critical',
        category: 'pago',
        icon: 'fa-circle-dollar-to-slot',
        title: `Cobro pendiente — ${b.num}`,
        body: `${cliente} · ${sinceDays}d sin cobrar · ${fmt(b.total)}`,
        route: `/presupuesto/${b.id}`,
        ts: b.id,
        ...meta,
      })
    }

    // 🟡 ALERTA: entrega próxima ≤3 días → logística
    if (b.deliveryDate && delivDays !== null && delivDays >= 0 && delivDays <= 3 && active && b.status !== 'delivered') {
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
        route: `/presupuesto/${b.id}`,
        ts: b.id,
        ...meta,
      })
    }

    // 🟡 ALERTA: confirmado sin seña 2-14 días → pago
    if (b.status === 'confirmed' && b.payStatus === 'pending' && sinceDays !== null && sinceDays >= 2 && sinceDays <= 14) {
      alerts.push({
        id: `nosena-${b.id}`,
        level: 'warning',
        category: 'pago',
        icon: 'fa-clock-rotate-left',
        title: `${b.num} lleva ${sinceDays}d sin la seña`,
        body: `${cliente} — pedido confirmado pero sin cobrar depósito · ${fmt(b.total)}`,
        route: `/presupuesto/${b.id}`,
        ts: b.id,
        ...meta,
      })
    }

    // 🟡 ALERTA: seguimiento >7 días sin respuesta → comercial
    if (['sent', 'negotiating'].includes(b.status) && sinceDays !== null && sinceDays > 7) {
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

export default function NotificationBell() {
  const { get } = useData()
  const { user } = useAuth()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const [readIds, setReadIds] = useState(() => new Set(db('notifRead', [])))
  const [dismissedIds, setDismissedIds] = useState(() => new Set(db('notifDismissed', [])))

  const budgets  = get('budgets')
  const products = get('products')
  const allAlerts  = useMemo(() => buildAlerts(budgets, products), [budgets, products])
  const alerts     = useMemo(() => allAlerts.filter(a => !dismissedIds.has(a.id)), [allAlerts, dismissedIds])
  const dismissedCount = allAlerts.filter(a => dismissedIds.has(a.id)).length

  const unread      = alerts.filter(a => !readIds.has(a.id))
  const hasCritical = unread.some(a => a.level === 'critical')
  const unreadCount = unread.length

  /* ── Mark single as read — storage + Supabase ── */
  const markRead = useCallback((id) => {
    const newIds = new Set([...readIds, id])
    setReadIds(newIds)
    dbW('notifRead', [...newIds])
    persistReadToSupabase(user?.id, id)
  }, [readIds, user])

  /* ── Mark all as read — storage + Supabase batch ── */
  const markAllRead = useCallback(() => {
    const unreadAlerts = alerts.filter(a => !readIds.has(a.id))
    const newIds = new Set([...readIds, ...alerts.map(a => a.id)])
    setReadIds(newIds)
    dbW('notifRead', [...newIds])
    persistBatchReadToSupabase(user?.id, unreadAlerts.map(a => a.id))
  }, [readIds, alerts, user])

  const dismissAlert = useCallback((id) => {
    const newIds = new Set([...dismissedIds, id])
    setDismissedIds(newIds)
    dbW('notifDismissed', [...newIds])
  }, [dismissedIds])

  const restoreDismissed = useCallback(() => {
    setDismissedIds(new Set())
    dbW('notifDismissed', [])
  }, [])

  /* ── Execute action: mark read → close drawer → run handler ── */
  const executeAction = useCallback((alert) => {
    markRead(alert.id)
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
        className={`tb-btn notif-bell${hasCritical ? ' pulse-critical' : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-label="Notificaciones"
        title="Notificaciones"
        style={{
          position: 'relative',
          background: unreadCount > 0 ? (hasCritical ? '#FEE2E2' : '#FEF3C7') : '#FFF7ED',
          color: hasCritical ? '#DC2626' : '#D97706',
          borderRadius: 10, width: 36, height: 36, fontSize: 15, border: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'background .2s', flexShrink: 0,
        }}
      >
        <i className="fa fa-bell" />
        {unreadCount > 0 && (
          <span
            className="notif-badge"
            style={{ background: hasCritical ? '#EF4444' : '#F59E0B' }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
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
            alerts.map(alert => {
              const col    = LEVEL_COLORS[alert.level]
              const isRead = readIds.has(alert.id)
              const action = resolveAction(alert.category)
              return (
                <div key={alert.id} className={`notif-item${isRead ? ' read' : ''}`}
                  style={{ borderLeft: `3px solid ${col.bg}`, background: isRead ? 'var(--surface)' : col.light + '80' }}>
                  {/* Icon */}
                  <div className="notif-item-ico" style={{ background: col.bg + '22', color: col.bg }}>
                    <i className={`fa ${alert.icon}`} />
                  </div>
                  {/* Content */}
                  <div className="notif-item-body">
                    <div className="notif-item-title" style={{ color: isRead ? 'var(--txt2)' : col.text }}>
                      {alert.title}
                    </div>
                    <div className="notif-item-sub">{alert.body}</div>
                    {/* ACTION BUTTON — dinámico por categoría */}
                    <button
                      className="notif-action-btn"
                      style={{ '--na-color': action.color, '--na-bg': action.bg }}
                      onClick={(e) => { e.stopPropagation(); executeAction(alert) }}
                    >
                      <i className={`fa ${action.icon}`} />
                      {action.label}
                    </button>
                  </div>
                  {/* Unread dot */}
                  {!isRead && <div className="notif-unread-dot" style={{ background: col.bg }} />}
                  {/* Dismiss */}
                  <button
                    className="notif-dismiss-btn"
                    onClick={(e) => { e.stopPropagation(); dismissAlert(alert.id) }}
                    title="Descartar"
                  >
                    <i className="fa fa-xmark" />
                  </button>
                </div>
              )
            })
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
