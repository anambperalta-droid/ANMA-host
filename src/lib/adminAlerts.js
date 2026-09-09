/* ─────────────────────────────────────────
   ANMA — API de admin_alerts (Supabase)
   ─────────────────────────────────────────
   Persistencia de alertas críticas para Ana (nuevos signups, pagos,
   errores). Ver migración 20260929_admin_alerts.sql.

   Regla de acceso: RLS en la tabla ya filtra por email/metadata.
   Estas funciones son safe-to-call desde cualquier tab; si el user
   no es global admin, Supabase devuelve rows vacías silenciosamente.
─────────────────────────────────────────── */
import { supabase } from './supabase'

/**
 * Trae las últimas alertas (por defecto 30, no dismisses).
 * @param {Object} opts
 * @param {number} [opts.limit=30]
 * @param {boolean} [opts.includeDismissed=false]
 * @param {boolean} [opts.unreadOnly=false]
 * @returns {Promise<{data: Array, error: any}>}
 */
export async function fetchAdminAlerts({ limit = 30, includeDismissed = false, unreadOnly = false } = {}) {
  let q = supabase
    .from('admin_alerts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (!includeDismissed) q = q.is('dismissed_at', null)
  if (unreadOnly) q = q.is('read_at', null)

  const { data, error } = await q
  return { data: data || [], error }
}

export async function markAdminAlertRead(id) {
  if (!id) return { error: 'missing_id' }
  return supabase
    .from('admin_alerts')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .is('read_at', null)
}

export async function markAllAdminAlertsRead() {
  return supabase
    .from('admin_alerts')
    .update({ read_at: new Date().toISOString() })
    .is('read_at', null)
    .is('dismissed_at', null)
}

export async function dismissAdminAlert(id) {
  if (!id) return { error: 'missing_id' }
  return supabase
    .from('admin_alerts')
    .update({ dismissed_at: new Date().toISOString() })
    .eq('id', id)
}
