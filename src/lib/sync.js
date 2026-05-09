import { supabase } from './supabase'
import { db, dbW, setWriteHook } from './storage'

const SITE_KEY = 'anma-regalos'
const DATA_KEYS = ['budgets', 'clients', 'suppliers', 'products', 'cfg']

function collectData() {
  const out = {}
  DATA_KEYS.forEach(k => { out[k] = db(k, k === 'cfg' ? {} : []) })
  return out
}

/**
 * Merge two arrays by `id`.
 * – Cloud items are authoritative (used as-is).
 * – Local-only items (id not present in cloud) are appended.
 * This guarantees we NEVER lose a record that exists locally.
 */
function mergeArraysById(local, remote) {
  if (!Array.isArray(remote)) return Array.isArray(local) ? local : []
  if (!Array.isArray(local) || local.length === 0) return remote
  const remoteIds = new Set(
    remote.map(x => (x?.id != null ? String(x.id) : null)).filter(Boolean)
  )
  const localOnly = local.filter(x => x?.id != null && !remoteIds.has(String(x.id)))
  return localOnly.length > 0 ? [...remote, ...localOnly] : remote
}

let _uid    = null   // current auth user id
let _wsId   = null   // workspace id (owner's user_id, resolved via memberships)
let _role   = null   // 'owner' | 'operator' | 'viewer'
let _timer  = null

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
      console.warn('[sync] membership resolve error', error.message)
      return { wsId: userId, role: 'owner' }
    }
    if (!data) return { wsId: userId, role: 'owner' }
    return { wsId: data.workspace_id, role: data.role }
  } catch (e) {
    console.warn('[sync] membership resolve failed', e?.message)
    return { wsId: userId, role: 'owner' }
  }
}

async function doPush() {
  if (!_uid || !_wsId) return
  if (_role === 'viewer') return
  try {
    const { error } = await supabase.from('anma_user_data').upsert({
      user_id:    _wsId,
      site_key:   SITE_KEY,
      data:       collectData(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,site_key' })
    if (!error) window.dispatchEvent(new CustomEvent('anma:cloud-saved'))
  } catch (e) { console.warn('[sync] push failed', e?.message) }
}

/** Call once after login. Sets up the debounced write-hook. */
export function initSync(userId) {
  _uid = userId
  if (!userId) { _wsId = null; _role = null; setWriteHook(null); return }
  resolveWorkspace(userId).then(({ wsId, role }) => {
    _wsId = wsId
    _role = role
    // Every dbW call triggers a debounced push (1.5 s idle)
    setWriteHook(() => { clearTimeout(_timer); _timer = setTimeout(doPush, 1500) })
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
      if (cloud[k] === undefined) return
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
      } else if (Array.isArray(cloud[k]) && Array.isArray(local)) {
        const merged = mergeArraysById(local, cloud[k])
        if (merged.length > cloud[k].length) needsPushBack = true
        dbW(k, merged)
      } else {
        dbW(k, cloud[k])
      }
    })

    // Push merged result back so cloud has the full dataset
    if (needsPushBack) doPush()

    window.dispatchEvent(new CustomEvent('anma:synced'))
    return true
  } catch (e) {
    console.warn('[sync] pull failed', e?.message)
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
