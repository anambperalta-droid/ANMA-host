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
let _timer = null

async function doPush() {
  if (!_uid) return
  try {
    await supabase.from('anma_user_data').upsert({
      user_id: _uid,
      site_key: SITE_KEY,
      data: collectData(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,site_key' })
  } catch (e) { console.warn('[sync] push failed', e?.message) }
}

export function initSync(userId) {
  _uid = userId
  setWriteHook(userId ? () => { clearTimeout(_timer); _timer = setTimeout(doPush, 1500) } : null)
}

export async function pullFromCloud(userId) {
  if (!userId) return false
  try {
    const { data, error } = await supabase
      .from('anma_user_data')
      .select('data')
      .eq('user_id', userId)
      .eq('site_key', SITE_KEY)
      .single()
    if (error || !data?.data) return false
    DATA_KEYS.forEach(k => { if (data.data[k] !== undefined) dbW(k, data.data[k]) })
    window.dispatchEvent(new CustomEvent('anma:synced'))
    return true
  } catch (e) { console.warn('[sync] pull failed', e?.message); return false }
}
