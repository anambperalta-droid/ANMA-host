import { supabase } from './supabase'
import { getSyncContext } from './sync'

/** Fire-and-forget insert into public.audit_log.
 *  Never blocks UI; failures only log to console. */
export function logAudit(action, entity, entityId, meta) {
  try {
    const { workspaceId } = getSyncContext()
    if (!workspaceId) return
    supabase.auth.getUser().then(({ data }) => {
      const u = data?.user
      if (!u) return
      supabase.from('audit_log').insert({
        workspace_id: workspaceId,
        actor_user_id: u.id,
        actor_email: u.email || null,
        action,
        entity,
        entity_id: entityId != null ? String(entityId) : null,
        meta: meta || null,
      }).then(({ error }) => {
        if (error) console.warn('[audit] insert failed', error.message)
      })
    })
  } catch (e) { console.warn('[audit] error', e?.message) }
}
