import { supabase } from './supabase'
import { db, dbW, setWriteHook } from './storage'
import { log } from './logger'

const SITE_KEY = 'anma-regalos'
// TODAS las claves de negocio — si una clave no está acá, NO viaja entre
// dispositivos/dominios. Antes faltaban insumos, stockMoves, viajes y tasks:
// solo vivían en el localStorage del navegador donde se crearon.
const DATA_KEYS = [
  'budgets', 'clients', 'suppliers', 'products', 'insumos', 'stockMoves',
  'shipments', 'viajes', 'tariffs', 'tasks', 'waTemplates',
  'despCuit', 'despDir', 'sheetsCfg',
  'notifRead', 'notifDismissed', 'provAlertsDismissed',
  'productViewMode', 'todayCollapsed',
  'cfg',
]
// Claves que son arrays de objetos con `id` → merge inteligente por item.
// El resto (escalares, arrays de strings) usa cloud-gana directo.
const MERGE_BY_ID = new Set(['budgets', 'clients', 'suppliers', 'products', 'insumos', 'stockMoves', 'shipments', 'viajes', 'tariffs', 'tasks', 'waTemplates'])

function collectData() {
  const out = {}
  DATA_KEYS.forEach(k => { out[k] = db(k, k === 'cfg' ? {} : []) })
  return out
}

/**
 * Merge two arrays by `id` using last-write-wins per item.
 * – Items only in remote: included as-is.
 * – Items only in local: always included (never lose local-only records).
 * – Items in both: the version with the higher `updatedAt` wins.
 *   Items without `updatedAt` (legacy) default to 0 → remote wins (safe).
 */
function mergeArraysById(local, remote) {
  if (!Array.isArray(remote)) return Array.isArray(local) ? local : []
  if (!Array.isArray(local) || local.length === 0) return remote
  const merged = new Map()
  remote.forEach(x => { if (x?.id != null) merged.set(String(x.id), x) })
  local.forEach(x => {
    if (x?.id == null) return
    const k = String(x.id)
    const existing = merged.get(k)
    if (!existing || (x.updatedAt || 0) > (existing.updatedAt || 0)) {
      merged.set(k, x)
    }
  })
  return Array.from(merged.values())
}

let _uid              = null   // current auth user id
let _wsId             = null   // workspace id (owner's user_id, resolved via memberships)
let _role             = null   // 'owner' | 'operator' | 'viewer'
let _timer            = null
let _beforeunloadFn   = null   // reference kept to allow removal on logout
let _pagehideFn       = null   // iOS Safari: pagehide fires when beforeunload doesn't
let _visibilityFn     = null   // mobile: flush cuando el tab se va a background
let _onlineFn         = null   // reintenta push cuando vuelve la conexion

/** Resolve the workspace the user belongs to.
 *  Falls back to self-workspace (userId) for legacy / no-membership users. */
async function resolveWorkspace(userId) {
  if (!userId) return { wsId: null, role: null }
  try {
    const { data, error } = await supabase
      .from('memberships')
      .select('workspace_id, role')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (error) {
      log.warn('[sync] membership resolve error', error.message)
      return { wsId: userId, role: 'owner' }
    }
    if (!data) return { wsId: userId, role: 'owner' }
    return { wsId: data.workspace_id, role: data.role }
  } catch (e) {
    log.warn('[sync] membership resolve failed', e?.message)
    return { wsId: userId, role: 'owner' }
  }
}

async function doPush(retryCount = 0) {
  if (!_uid || !_wsId) return
  if (_role === 'viewer') return
  try {
    const { error } = await supabase.from('anma_user_data').upsert({
      user_id:    _wsId,
      site_key:   SITE_KEY,
      data:       collectData(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,site_key' })
    if (error) {
      if (retryCount < 1) setTimeout(() => doPush(retryCount + 1), 4000)
      else log.warn('[sync] push failed after retry', error.message)
      return
    }
    window.dispatchEvent(new CustomEvent('anma:cloud-saved'))
  } catch (e) {
    if (retryCount < 1) setTimeout(() => doPush(retryCount + 1), 4000)
    else log.warn('[sync] push failed', e?.message)
  }
}

/** Call once after login. Sets up the debounced write-hook. */
export function initSync(userId) {
  _uid = userId

  // Remove any previous listeners (handles logout + user switch)
  if (_beforeunloadFn) { window.removeEventListener('beforeunload', _beforeunloadFn); _beforeunloadFn = null }
  if (_pagehideFn)     { window.removeEventListener('pagehide',     _pagehideFn);     _pagehideFn     = null }
  if (_visibilityFn)   { document.removeEventListener('visibilitychange', _visibilityFn); _visibilityFn = null }
  if (_onlineFn)       { window.removeEventListener('online',       _onlineFn);       _onlineFn       = null }

  if (!userId) { _wsId = null; _role = null; setWriteHook(null); return }

  // Flush al cambiar de tab / cerrar / suspender. beforeunload solo en desktop;
  // iOS Safari necesita pagehide + visibilitychange. Sin esto las escrituras
  // dentro del debounce de 1.5s se pierden al cambiar de app en mobile.
  _beforeunloadFn = () => flushSync()
  _pagehideFn     = () => flushSync()
  _visibilityFn   = () => { if (document.visibilityState === 'hidden') flushSync() }
  _onlineFn       = () => flushSync()
  window.addEventListener('beforeunload',          _beforeunloadFn)
  window.addEventListener('pagehide',              _pagehideFn)
  document.addEventListener('visibilitychange',    _visibilityFn)
  window.addEventListener('online',                _onlineFn)

  resolveWorkspace(userId).then(({ wsId, role }) => {
    _wsId = wsId
    _role = role
    // Viewers can read but never push — skip the write hook entirely.
    if (role !== 'viewer') {
      setWriteHook(() => { clearTimeout(_timer); _timer = setTimeout(doPush, 1500) })
    }
  })
}

/**
 * Pull cloud data on login/session restore.
 *
 * Strategy:
 *  – If no cloud row exists   → push all local data immediately (first-time migration).
 *  – If cloud row exists      → smart-merge: cloud wins on conflicts, local-only
 *    records are preserved. nextNum uses the higher value to prevent duplicate
 *    budget numbers across devices.
 *  – If local had extra records after merge → push the merged result back to cloud.
 */
export async function pullFromCloud(userId) {
  if (!userId) return false
  try {
    const { wsId, role } = await resolveWorkspace(userId)
    _wsId = wsId
    _role = role
    if (!wsId) return false

    const { data, error } = await supabase
      .from('anma_user_data')
      .select('data')
      .eq('user_id', wsId)
      .eq('site_key', SITE_KEY)
      .single()

    if (error || !data?.data) {
      // ── No cloud row yet ──────────────────────────────────────────
      // Push all local data immediately so the next device gets it.
      doPush()
      return false
    }

    // ── Smart merge ───────────────────────────────────────────────
    const cloud = data.data
    let needsPushBack = false   // true if local had records not in cloud

    DATA_KEYS.forEach(k => {
      if (cloud[k] === undefined) {
        // La nube no conoce esta clave (ej. clave nueva en el sync, o datos
        // que nunca se subieron). Si hay datos locales → push completo para
        // que la nube quede al día y otros dispositivos los reciban.
        const local = db(k, null)
        const hasLocal = local !== null && (!Array.isArray(local) || local.length > 0)
        if (hasLocal) needsPushBack = true
        return
      }
      const local = db(k, k === 'cfg' ? {} : [])

      if (k === 'cfg') {
        // Config: cloud wins for most keys; nextNum uses the higher value
        const merged = { ...local, ...cloud[k] }
        const localNum = Number(local.nextNum) || 1
        const cloudNum = Number(cloud[k].nextNum) || 1
        if (localNum > cloudNum) {
          merged.nextNum = localNum
          needsPushBack = true
        }
        dbW(k, merged)
      } else if (MERGE_BY_ID.has(k) && Array.isArray(cloud[k]) && Array.isArray(local)) {
        const merged = mergeArraysById(local, cloud[k])
        const cloudMap = new Map(cloud[k].map(x => [String(x?.id), x]).filter(([id]) => id !== 'null'))
        const localWon = merged.some(item => {
          if (item?.id == null) return false
          const cv = cloudMap.get(String(item.id))
          return !cv || (item.updatedAt || 0) > (cv.updatedAt || 0)
        })
        if (merged.length !== cloud[k].length || localWon) needsPushBack = true
        dbW(k, merged)
      } else {
        // Escalares y arrays simples (sin id): la nube gana. mergeArraysById
        // devolvería [] para arrays de strings — por eso NO se mergean.
        dbW(k, cloud[k])
      }
    })

    // Push merged result back so cloud has the full dataset
    if (needsPushBack) doPush()

    window.dispatchEvent(new CustomEvent('anma:synced'))
    return true
  } catch (e) {
    log.warn('[sync] pull failed', e?.message)
    return false
  }
}

/** Force an immediate push, cancelling any pending debounce timer.
 *  Use after critical saves (config, payments) to persist instantly. */
export function flushSync() {
  clearTimeout(_timer)
  doPush()
}

/** Expose current workspace context for other modules (audit log, UI). */
export function getSyncContext() {
  return { userId: _uid, workspaceId: _wsId, role: _role }
}
