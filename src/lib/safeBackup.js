/* ═══════════════════════════════════════
   ANMA — Safety Backup
   Mirror localStorage anma3_* keys to IndexedDB
   so accidental clears of localStorage don't lose all data.
═══════════════════════════════════════ */

const DB_NAME = 'anma_safe_backup'
const STORE = 'snapshots'
const PREFIX = 'anma3_'
const KEEP = 7

function openDB() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1)
    r.onupgradeneeded = () => {
      const db = r.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'ts' })
      }
    }
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

function collectLocalStorage() {
  const data = {}
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith(PREFIX)) {
      data[k] = localStorage.getItem(k)
    }
  }
  return data
}

let _lastSnap = 0
export async function safetySnapshot(force = false) {
  try {
    if (typeof indexedDB === 'undefined') return
    const now = Date.now()
    if (!force && now - _lastSnap < 60_000) return
    _lastSnap = now

    const data = collectLocalStorage()
    if (Object.keys(data).length === 0) return

    const db = await openDB()
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    store.put({ ts: now, data })

    const all = []
    store.openCursor().onsuccess = (e) => {
      const cur = e.target.result
      if (cur) { all.push(cur.key); cur.continue() }
      else if (all.length > KEEP) {
        const toDel = all.sort((a,b) => a-b).slice(0, all.length - KEEP)
        toDel.forEach(k => store.delete(k))
      }
    }
  } catch (e) {
    // silent
  }
}

export async function listSnapshots() {
  try {
    const db = await openDB()
    return await new Promise((resolve) => {
      const out = []
      const tx = db.transaction(STORE, 'readonly')
      tx.objectStore(STORE).openCursor().onsuccess = (e) => {
        const cur = e.target.result
        if (cur) { out.push({ ts: cur.value.ts, keys: Object.keys(cur.value.data).length }); cur.continue() }
        else resolve(out.sort((a,b) => b.ts - a.ts))
      }
    })
  } catch { return [] }
}

export async function restoreSnapshot(ts) {
  try {
    const db = await openDB()
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly')
      tx.objectStore(STORE).get(ts).onsuccess = (e) => {
        const snap = e.target.result
        if (!snap) return resolve(false)
        Object.entries(snap.data).forEach(([k, v]) => localStorage.setItem(k, v))
        resolve(true)
      }
    })
  } catch { return false }
}

let _bootstrapped = false
export function bootstrapSafeBackup() {
  if (_bootstrapped) return
  _bootstrapped = true
  setTimeout(() => safetySnapshot(true), 3000)
  setInterval(() => safetySnapshot(), 5 * 60_000)
  window.addEventListener('beforeunload', () => { safetySnapshot(true) })
}
