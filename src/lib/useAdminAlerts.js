/* ─────────────────────────────────────────
   ANMA — useAdminAlerts hook
   ─────────────────────────────────────────
   Trae + escucha en realtime las admin_alerts. Solo se activa cuando
   isGlobalAdmin === true, para no gastar Realtime en usuarios normales.

   Uso desde NotificationBell (Topbar): montado a nivel global,
   funciona en toda la app (resuelve Bug #3 del audit — el hook
   anterior useRealtimeSignups solo funcionaba en /admin).
─────────────────────────────────────────── */
import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from './supabase'
import { fetchAdminAlerts, markAdminAlertRead, markAllAdminAlertsRead, dismissAdminAlert } from './adminAlerts'

export function useAdminAlerts(enabled = false) {
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(false)
  const onNewCbRef = useRef(null)

  const refresh = useCallback(async () => {
    if (!enabled) return
    setLoading(true)
    const { data } = await fetchAdminAlerts({ limit: 50 })
    setAlerts(data)
    setLoading(false)
  }, [enabled])

  // Carga inicial
  useEffect(() => { refresh() }, [refresh])

  // Realtime: INSERT + UPDATE
  useEffect(() => {
    if (!enabled) return
    const channel = supabase
      .channel('admin-alerts-live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'admin_alerts' },
        (payload) => {
          if (payload.new?.dismissed_at) return
          setAlerts(prev => {
            if (prev.some(a => a.id === payload.new.id)) return prev
            return [payload.new, ...prev].slice(0, 50)
          })
          if (typeof onNewCbRef.current === 'function') {
            try { onNewCbRef.current(payload.new) } catch { /* ignorar */ }
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'admin_alerts' },
        (payload) => {
          setAlerts(prev => prev.map(a => a.id === payload.new.id ? payload.new : a))
        }
      )
      .subscribe()
    return () => {
      try { supabase.removeChannel(channel) } catch { /* ignorar */ }
    }
  }, [enabled])

  const unreadCount = alerts.filter(a => !a.read_at && !a.dismissed_at).length

  const markRead = useCallback(async (id) => {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, read_at: new Date().toISOString() } : a))
    await markAdminAlertRead(id)
  }, [])

  const markAllRead = useCallback(async () => {
    const now = new Date().toISOString()
    setAlerts(prev => prev.map(a => a.read_at ? a : { ...a, read_at: now }))
    await markAllAdminAlertsRead()
  }, [])

  const dismiss = useCallback(async (id) => {
    setAlerts(prev => prev.filter(a => a.id !== id))
    await dismissAdminAlert(id)
  }, [])

  const onNew = useCallback((fn) => { onNewCbRef.current = fn }, [])

  return { alerts, unreadCount, loading, refresh, markRead, markAllRead, dismiss, onNew }
}
