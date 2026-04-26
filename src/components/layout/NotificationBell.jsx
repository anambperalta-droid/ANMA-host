import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '../../context/DataContext'
import { fmt } from '../../lib/storage'

const NOTIF_KEY = 'anma3_notif_read'

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
        icon: 'fa-box-open',
        title: `Sin stock: ${p.name}`,
        body: `El producto se agotó — reponelo antes de aceptar nuevos pedidos`,
        cta: 'Ver catálogo',
        route: '/catalogo',
        ts: pid,
      })
    } else if (minStock > 0 && stock <= minStock) {
      alerts.push({
        id: `stocklow-${p.id}`,
        level: 'warning',
        icon: 'fa-box',
        title: `Te quedan solo ${stock} ${p.name}`,
        body: `Mínimo configurado: ${minStock} unidades — es momento de reponer`,
        cta: 'Ver catálogo',
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

    // 🔴 CRÍTICO: entrega vencida
    if (b.deliveryDate && delivDays !== null && delivDays < 0 && active && b.status !== 'delivered') {
      alerts.push({
        id: `overdue-${b.id}`,
        level: 'critical',
        icon: 'fa-fire',
        title: `Entrega vencida — ${b.num}`,
        body: `${cliente} · ${Math.abs(delivDays)}d de retraso · ${fmt(b.total)}`,
        cta: 'Ver pedido',
        route: `/presupuesto/${b.id}`,
        ts: b.id,
      })
    }

    // 🔴 CRÍTICO: pago pendiente >21 días
    if (b.payStatus === 'pending' && b.status === 'confirmed' && sinceDays !== null && sinceDays > 21) {
      alerts.push({
        id: `unpaid-${b.id}`,
        level: 'critical',
        icon: 'fa-circle-dollar-to-slot',
        title: `Cobro pendiente — ${b.num}`,
        body: `${cliente} · ${sinceDays}d sin cobrar · ${fmt(b.total)}`,
        cta: 'Ver pedido',
        route: `/presupuesto/${b.id}`,
        ts: b.id,
      })
    }

    // 🟡 ALERTA: entrega próxima ≤3 días — lenguaje natural
    if (b.deliveryDate && delivDays !== null && delivDays >= 0 && delivDays <= 3 && active && b.status !== 'delivered') {
      const whenLabel = delivDays === 0 ? 'HOY' : delivDays === 1 ? 'mañana' : `en ${delivDays} días`
      alerts.push({
        id: `soon-${b.id}`,
        level: 'warning',
        icon: 'fa-truck-fast',
        title: delivDays <= 1
          ? `Debés entregar ${whenLabel} a ${cliente}`
          : `Entregá el pedido de ${cliente} ${whenLabel}`,
        body: `${b.num} · ${fmt(b.total)}`,
        cta: 'Ver pedido',
        route: `/presupuesto/${b.id}`,
        ts: b.id,
      })
    }

    // 🟡 ALERTA: confirmado sin seña 2-14 días
    if (b.status === 'confirmed' && b.payStatus === 'pending' && sinceDays !== null && sinceDays >= 2 && sinceDays <= 14) {
      alerts.push({
        id: `nosena-${b.id}`,
        level: 'warning',
        icon: 'fa-clock-rotate-left',
        title: `${b.num} lleva ${sinceDays}d sin la seña`,
        body: `${cliente} — pedido confirmado pero sin cobrar depósito · ${fmt(b.total)}`,
        cta: 'Cobrar seña',
        route: `/presupuesto/${b.id}`,
        ts: b.id,
      })
    }

    // 🟡 ALERTA: seguimiento >7 días sin respuesta
    if (['sent', 'negotiating'].includes(b.status) && sinceDays !== null && sinceDays > 7) {
      alerts.push({
        id: `followup-${b.id}`,
        level: 'warning',
        icon: 'fa-hourglass-half',
        title: `Seguimiento necesario — ${b.num}`,
        body: `${cliente} · ${sinceDays}d sin respuesta · ${fmt(b.total)}`,
        cta: 'Ver historial',
        route: '/',
        ts: b.id,
      })
    }

  })

  const order = { critical: 0, warning: 1 }
  alerts.sort((a, b) => order[a.level] - order[b.level] || b.ts - a.ts)
  return alerts
}

const LEVEL_COLORS = {
  critical: { bg: 'var(--red)', light: '#FEE2E2', text: '#991B1B', border: '#FCA5A5' },
  warning:  { bg: '#F59E0B', light: '#FEF3C7', text: '#92400E', border: '#FCD34D' },
}

export default function NotificationBell() {
  const { get } = useData()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const [readIds, setReadIds] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(NOTIF_KEY) || '[]')) } catch { return new Set() }
  })
  const [dismissedIds, setDismissedIds] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('anma3_notif_dismissed') || '[]')) } catch { return new Set() }
  })

  const budgets = get('budgets')
  const products = get('products')
  const allAlerts = useMemo(() => buildAlerts(budgets, products), [budgets, products])
  const alerts = useMemo(() => allAlerts.filter(a => !dismissedIds.has(a.id)), [allAlerts, dismissedIds])
  const dismissedCount = allAlerts.filter(a => dismissedIds.has(a.id)).length

  const unread = alerts.filter(a => !readIds.has(a.id))
  const hasCritical = unread.some(a => a.level === 'critical')
  const unreadCount = unread.length

  const markAllRead = useCallback(() => {
    const newIds = new Set([...readIds, ...alerts.map(a => a.id)])
    setReadIds(newIds)
    localStorage.setItem(NOTIF_KEY, JSON.stringify([...newIds]))
  }, [readIds, alerts])

  const markRead = useCallback((id) => {
    const newIds = new Set([...readIds, id])
    setReadIds(newIds)
    localStorage.setItem(NOTIF_KEY, JSON.stringify([...newIds]))
  }, [readIds])

  const dismissAlert = useCallback((id) => {
    const newIds = new Set([...dismissedIds, id])
    setDismissedIds(newIds)
    localStorage.setItem('anma3_notif_dismissed', JSON.stringify([...newIds]))
  }, [dismissedIds])

  const restoreDismissed = useCallback(() => {
    setDismissedIds(new Set())
    localStorage.setItem('anma3_notif_dismissed', '[]')
  }, [])

  const handleCTA = (alert) => {
    markRead(alert.id)
    setOpen(false)
    nav(alert.route)
  }

  useEffect(() => {
    if (!open) return
    const h = (e) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open])

  return (
    <>
      <button
        className={`tb-btn notif-bell ${hasCritical ? 'pulse-critical' : ''}`}
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
          <span className="notif-badge" style={{ background: hasCritical ? 'var(--red)' : '#F59E0B' }}>
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
                {unreadCount} nuevas
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
              const col = LEVEL_COLORS[alert.level]
              const isRead = readIds.has(alert.id)
              return (
                <div key={alert.id} className={`notif-item ${isRead ? 'read' : ''}`}
                  style={{ borderLeft: `3px solid ${col.bg}`, background: isRead ? 'var(--surface)' : col.light + '80', padding: '10px 12px', display: 'flex', gap: 10, alignItems: 'flex-start', position: 'relative' }}>
                  <div style={{ width: 20, height: 20, borderRadius: 6, background: col.bg + '22', color: col.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, flexShrink: 0, marginTop: 1 }}>
                    <i className={`fa ${alert.icon}`} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0, paddingRight: 18 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: isRead ? 'var(--txt2)' : col.text, lineHeight: 1.3 }}>
                      {alert.title}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 2, lineHeight: 1.3 }}>{alert.body}</div>
                    <a onClick={(e) => { e.preventDefault(); handleCTA(alert) }} href="#"
                      style={{ display: 'inline-block', marginTop: 4, fontSize: 10.5, fontWeight: 600, color: col.bg, textDecoration: 'none', cursor: 'pointer' }}>
                      {alert.cta} →
                    </a>
                  </div>
                  {!isRead && <div style={{ position: 'absolute', right: 26, top: 14, width: 7, height: 7, borderRadius: '50%', background: col.bg, flexShrink: 0 }} title="No leída" />}
                  <button
                    onClick={(e) => { e.stopPropagation(); dismissAlert(alert.id) }}
                    title="Descartar (ya está resuelta)"
                    style={{
                      position: 'absolute', right: 6, top: 6,
                      width: 22, height: 22, borderRadius: 6,
                      background: 'transparent', border: 'none',
                      color: 'var(--txt4)', cursor: 'pointer', fontSize: 11,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all .15s', fontFamily: 'inherit',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,.06)'; e.currentTarget.style.color = 'var(--txt2)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--txt4)' }}
                  >
                    <i className="fa fa-xmark" />
                  </button>
                </div>
              )
            })
          )}
          {dismissedCount > 0 && (
            <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)', textAlign: 'center', background: 'var(--surface2)' }}>
              <button onClick={restoreDismissed}
                style={{ background: 'transparent', border: 'none', color: 'var(--brand)', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <i className="fa fa-rotate-left" style={{ fontSize: 10 }} />
                Restaurar {dismissedCount} descartada{dismissedCount !== 1 ? 's' : ''}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
