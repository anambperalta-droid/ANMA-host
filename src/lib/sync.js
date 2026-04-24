import { supabase } from './supabase'
import { db, dbW, setWriteHook } from './storage'

const SITE_KEY = 'anma-regalos'
const DATA_KEYS = ['budgets', 'clients', 'suppliers', 'products', 'cfg']

function collectData() {
  const out = {}
  DATA_KEYS.forEach(k => { out[k] = db(k, k === 'cfg' ? {} : []) })
  return out
}

let _uid = null
let _wsId = null
let _role = null
let _timer = null

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
    await supabase.from('anma_user_data').upsert({
      user_id: _wsId,
      site_key: SITE_KEY,
      data: collectData(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,site_key' })
  } catch (e) { console.warn('[sync] push failed', e?.message) }
}

export function initSync(userId) {
  _uid = userId
  if (!userId) { _wsId = null; _role = null; setWriteHook(null); return }
  resolveWorkspace(userId).then(({ wsId, role }) => {
    _wsId = wsId
    _role = role
    setWriteHook(() => { clearTimeout(_timer); _timer = setTimeout(doPush, 1500) })
  })
}

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
    if (error || !data?.data) return false
    DATA_KEYS.forEach(k => { if (data.data[k] !== undefined) dbW(k, data.data[k]) })
    window.dispatchEvent(new CustomEvent('anma:synced'))
    return true
  } catch (e) { console.warn('[sync] pull failed', e?.message); return false }
}

export function getSyncContext() {
  return { userId: _uid, workspaceId: _wsId, role: _role }
}
