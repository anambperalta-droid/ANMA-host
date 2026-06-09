import { useEffect, useRef } from 'react'
import { supabase } from './supabase'

/**
 * useRealtimeSignups — espejo del de ANMA Pro.
 * Escucha INSERT en `workspaces` para notificar al admin en tiempo real.
 */
export function useRealtimeSignups(onSignup, enabled = true) {
  const cbRef = useRef(onSignup)
  useEffect(() => { cbRef.current = onSignup }, [onSignup])

  useEffect(() => {
    if (!enabled) return

    const channel = supabase
      .channel('admin-signups')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'workspaces' },
        (payload) => {
          try {
            if (typeof cbRef.current === 'function') cbRef.current(payload.new)
          } catch { /* ignorar */ }
        }
      )
      .subscribe()

    return () => {
      try { supabase.removeChannel(channel) } catch { /* ignorar */ }
    }
  }, [enabled])
}

export async function ensureNotificationPermission() {
  if (typeof Notification === 'undefined') return 'denied'
  if (Notification.permission === 'granted') return 'granted'
  if (Notification.permission === 'denied') return 'denied'
  try { return await Notification.requestPermission() } catch { return 'denied' }
}

export function sendBrowserNotification(title, opts = {}) {
  if (typeof Notification === 'undefined') return null
  if (Notification.permission !== 'granted') return null
  try {
    return new Notification(title, {
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      requireInteraction: false,
      ...opts,
    })
  } catch {
    return null
  }
}
