import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { db, dbW, cfg, wCfg, ensureDefaults } from '../lib/storage'
import { logAudit } from '../lib/audit'

const Ctx = createContext()

// Monotonic unique-ID generator — never collides, even within the same millisecond
let __idSeed = Date.now()
const nextId = () => { __idSeed += 1; return __idSeed }

export function DataProvider({ children }) {
  const [tick, setTick] = useState(0)
  const refresh = useCallback(() => setTick((t) => t + 1), [])

  ensureDefaults()

  // Synchronous ID migration — runs before first render so selections/deletes never hit duplicate/missing IDs
  useState(() => {
    ;['suppliers', 'products', 'clients', 'budgets'].forEach(key => {
      const list = db(key, [])
      const seen = new Set()
      let changed = false
      const fixed = list.map(item => {
        if (!item.id || seen.has(item.id)) {
          item = { ...item, id: nextId() }
          changed = true
        }
        seen.add(item.id)
        return item
      })
      if (changed) dbW(key, fixed)
    })
    // Keep __idSeed above any existing id
    ;['suppliers', 'products', 'clients', 'budgets'].forEach(key => {
      db(key, []).forEach(it => { if (typeof it.id === 'number' && it.id >= __idSeed) __idSeed = it.id + 1 })
    })
    return true
  })

  useEffect(() => {
    const h = () => refresh()
    window.addEventListener('anma:synced', h)
    return () => window.removeEventListener('anma:synced', h)
  }, [refresh])

  const get = useCallback((key, fallback = []) => db(key, fallback), [tick])
  const set = useCallback((key, val) => { dbW(key, val); refresh() }, [refresh])

  const config = useCallback(() => cfg(), [tick])
  const updateConfig = useCallback((patch) => { wCfg(patch); refresh() }, [refresh])

  // Budget helpers
  const saveBudget = useCallback((bData) => {
    const bud = db('budgets', [])
    const c = cfg()
    if (bData.id) {
      const i = bud.findIndex((b) => b.id === bData.id)
      if (i > -1) bud[i] = { ...bud[i], ...bData }
    } else {
      const num = c.nextNum || 1
      bData.id = Date.now()
      bData.num = `${c.budgetPrefix || 'AN'}-${String(num).padStart(4, '0')}`
      bData.date = new Date().toISOString().slice(0, 10)
      bud.push(bData)
      wCfg({ nextNum: num + 1 })
    }
    dbW('budgets', bud)
    refresh()
    logAudit(bData.id ? 'update' : 'create', 'budget', bData.id, { num: bData.num, total: bData.total })
    return bData
  }, [refresh])

  const deleteBudget = useCallback((id) => {
    const existing = db('budgets', []).find(b => b.id === id)
    dbW('budgets', db('budgets', []).filter((b) => b.id !== id))
    refresh()
    logAudit('delete', 'budget', id, existing ? { num: existing.num, total: existing.total } : null)
  }, [refresh])

  const updateBudgetStatus = useCallback((id, status) => {
    const bud = db('budgets', [])
    const i = bud.findIndex((b) => b.id === id)
    if (i > -1) { bud[i].status = status; dbW('budgets', bud) }
    refresh()
    logAudit('status_change', 'budget', id, { status })
  }, [refresh])

  // CRUD helpers for other entities
  const saveEntity = useCallback((key, item) => {
    const list = db(key, [])
    const wasExisting = item.id && list.some(x => x.id === item.id)
    if (item.id) {
      const i = list.findIndex((x) => x.id === item.id)
      if (i > -1) {
        list[i] = { ...list[i], ...item }
      } else {
        list.push(item)
      }
    } else {
      item.id = nextId()
      list.push(item)
    }
    dbW(key, list)
    refresh()
    logAudit(wasExisting ? 'update' : 'create', key, item.id, { name: item.name || item.title || null })
    return item
  }, [refresh])

  const deleteEntity = useCallback((key, id) => {
    const existing = db(key, []).find(x => x.id === id)
    dbW(key, db(key, []).filter((x) => x.id !== id))
    refresh()
    logAudit('delete', key, id, existing ? { name: existing.name || existing.title || null } : null)
  }, [refresh])

  return (
    <Ctx.Provider value={{
      get, set, config, updateConfig, refresh, tick,
      saveBudget, deleteBudget, updateBudgetStatus,
      saveEntity, deleteEntity,
    }}>
      {children}
    </Ctx.Provider>
  )
}

export const useData = () => useContext(Ctx)
