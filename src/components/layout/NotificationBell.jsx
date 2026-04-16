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

function buildAlerts(budgets) {
  const alerts = []
  const now = new Date()

  budgets.forEach(b => {
    const sinceDays = daysAgo(b.date)
    const delivDays = daysUntil(b.deliveryDate)
    const active = !['cancelled', 'lost'].includes(b.status)

    // 🔴 CRÍTICO: entrega vencida
    if (b.deliveryDate && delivDays !== null && delivDays < 0 && active && b.status !== 'delivered') {
      alerts.push({
        id: `overdue-${b.id}`,
        level: 'critical',
        icon: 'fa-fire',
        title: `Entrega vencida — ${b.num}`,
        body: `${b.contact || b.company || '—'} · ${Math.abs(delivDays)}d de retraso · ${fmt(b.total)}`,
        cta: 'Ver pedido',
        route: `/presupuesto/${b.id}`,
        ts: b.id,
      })
    }

    // 🔴 CRÍTICO: pago pendiente >21 días en estado confirmado
    if (b.payStatus === 'pending' && b.status === 'confirmed' && sinceDays !== null && sinceDays > 21) {
      alerts.push({
        id: `unpaid-${b.id}`,
        level: 'critical',
        icon: 'fa-circle-dollar-to-slot',
        title: `Cobro pendiente — ${b.num}`,
        body: `${b.contact || b.company || '—'} · ${sinceDays}d sin cobrar · ${fmt(b.total)}`,
        cta: 'Ver pedido',
        route: `/presupuesto/${b.id}`,
        ts: b.id,
      })
    }

    // 🟡 ALERTA: entrega en ≤3 días
    if (b.deliveryDate && delivDays !== null && delivDays >= 0 && delivDays <= 3 && active && b.status !== 'delivered') {
      alerts.push({
        id: `soon-${b.id}`,
        level: 'warning',
        icon: 'fa-truck-fast',
        title: `Entrega en ${delivDays === 0 ? 'HOY' : delivDays + (delivDays === 1 ? ' día' : ' días')} — ${b.num}`,
        body: `${b.contact || b.company || '—'} · ${fmt(b.total)}`,
        cta: 'Ver pedido',
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
        body: `${b.contact || b.company || '—'} · ${sinceDays}d sin respuesta · ${fmt(b.total)}`,
        cta: 'Ver historial',
        route: '/',
        ts: b.id,
      })
    }

    // 🟢 ÉXITO: confirmado en últimas 48h
    if (b.status === 'confirmed' && sinceDays !== null && sinceDays <= 2) {
      alerts.push({
        id: `confirmed-${b.id}`,
        level: 'success',
        icon: 'fa-circle-check',
        title: `Pedido confirmado — ${b.num}`,
        body: `${b.contact || b.company || '—'} · ${fmt(b.total)}`,
        cta: 'Ver pedido',
        route: `/presupuesto/${b.id}`,
        ts: b.id,
      })
    }

    // 🟢 ÉXITO: cobrado en últimas 48h
    if ((b.payStatus === 'paid' || b.payStatus === 'partial') && sinceDays !== null && sinceDays <= 2) {
      alerts.push({
        id: `paid-${b.id}`,
        level: 'success',
        icon: 'fa-sack-dollar',
        title: `${b.payStatus === 'paid' ? 'Pago recibido' : 'Seña recibida'} — ${b.num}`,
        body: `${b.contact || b.company || '—'} · ${fmt(b.total)}`,
        cta: 'Ver pedido',
        route: `/presupuesto/${b.id}`,
        ts: b.id,
      })
    }
  })

  // Ordenar: critical → warning → success, luego por ts desc
  const order = { critical: 0, warning: 1, success: 2 }
  alerts.sort((a, b) => order[a.level] - order[b.level] || b.ts - a.ts)
  return alerts
}

const LEVEL_COLORS = {
  critical: { bg: 'var(--red)', light: '#FEE2E2', text: '#991B1B', border: '#FCA5A5' },
  warning:  { bg: '#F59E0B', light: '#FEF3C7', text: '#92400E', border: '#FCD34D' },
  success:  { bg: '#10B981', light: '#D1FAE5', text: '#065F46', border: '#6EE7B7' },
}

export default function NotificationBell() {
  const { get } = useData()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const [readIds, setReadIds] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(NOTIF_KEY) || '[]')) } catch { return new Set() }
  })

  const budgets = get('budgets')
  const alerts = useMemo(() => buildAlerts(budgets), [budgets])

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

  const handleCTA = (alert) => {
    markRead(alert.id)
    setOpen(false)
    nav(alert.route)
  }

  // Cerrar con ESC
  useEffect(() => {
    if (!open) return
    const h = (e) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open])

  return (
    <>
      {/* CAMPANA */}
      <button
        className={`tb-btn notif-bell ${hasCritical ? 'pulse-critical' : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-label="Notificaciones"
        title="Notificaciones"
        style={{
          position: 'relative',
          background: unreadCount > 0 ? (hasCritical ? '#FEE2E2' : '#FEF3C7') : '#FFF7ED',
          color: hasCritical ? '#DC2626' : '#D97706',
          borderRadius: 10,
          width: 36,
          height: 36,
          fontSize: 15,
          border: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'background .2s',
          flexShrink: 0,
        }}
      >
        <i className="fa fa-bell" />
        {unreadCount > 0 && (
          <span className="notif-badge" style={{
            background: hasCritical ? 'var(--red)' : '#F59E0B',
          }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* OVERLAY */}
      {open && (
        <div className="notif-overlay" onClick={() => setOpen(false)} />
      )}

      {/* DRAWER */}
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
                  style={{ borderLeft: `3px solid ${col.bg}`, background: isRead ? 'var(--surface)' : col.light + 'cc' }}>
                  <div className="notif-item-ico" style={{ background: col.bg + '22', color: col.bg }}>
                    <i className={`fa ${alert.icon}`} />
                  </div>
                  <div className="notif-item-body">
                    <div className="notif-item-title" style={{ color: isRead ? 'var(--txt2)' : col.text }}>
                      {alert.title}
                    </div>
                    <div className="notif-item-desc">{alert.body}</div>
                    <button className="notif-cta" style={{ background: col.bg, color: '#fff' }}
                      onClick={() => handleCTA(alert)}>
                      {alert.cta} <i className="fa fa-arrow-right" style={{ fontSize: 9, marginLeft: 4 }} />
                    </button>
                  </div>
                  {!isRead && (
                    <div className="notif-dot" style={{ background: col.bg }} title="No leída" />
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </>
  )
}
