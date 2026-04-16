import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { db, dbW, cfg, wCfg, ensureDefaults } from '../lib/storage'

const Ctx = createContext()

export function DataProvider({ children }) {
  const [tick, setTick] = useState(0)
  const refresh = useCallback(() => setTick((t) => t + 1), [])

  ensureDefaults()

  useEffect(() => {
    ;['suppliers', 'products', 'clients', 'budgets'].forEach(key => {
      const list = db(key, [])
      const seen = new Set()
      let changed = false
      const fixed = list.map(item => {
        if (!item.id || seen.has(item.id)) {
          item = { ...item, id: Date.now() + Math.floor(Math.random() * 99991) }
          changed = true
        }
        seen.add(item.id)
        return item
      })
      if (changed) { dbW(key, fixed); console.log(`[ANMA] Deduped IDs for ${key}`) }
    })
  }, [])

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
    return bData
  }, [refresh])

  const deleteBudget = useCallback((id) => {
    dbW('budgets', db('budgets', []).filter((b) => b.id !== id))
    refresh()
  }, [refresh])

  const updateBudgetStatus = useCallback((id, status) => {
    const bud = db('budgets', [])
    const i = bud.findIndex((b) => b.id === id)
    if (i > -1) { bud[i].status = status; dbW('budgets', bud) }
    refresh()
  }, [refresh])

  // CRUD helpers for other entities
  const saveEntity = useCallback((key, item) => {
    const list = db(key, [])
    if (item.id) {
      const i = list.findIndex((x) => x.id === item.id)
      if (i > -1) list[i] = { ...list[i], ...item }
    } else {
      item.id = Date.now() + Math.floor(Math.random() * 99991)
      list.push(item)
    }
    dbW(key, list)
    refresh()
    return item
  }, [refresh])

  const deleteEntity = useCallback((key, id) => {
    dbW(key, db(key, []).filter((x) => x.id !== id))
    refresh()
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
