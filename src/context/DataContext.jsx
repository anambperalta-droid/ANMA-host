import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { db, dbW, cfg, wCfg, ensureDefaults } from '../lib/storage'
import { logAudit } from '../lib/audit'
import { supabase } from '../lib/supabase'
import { getSyncContext } from '../lib/sync'

const Ctx = createContext()

const SITE_KEY = 'anma-regalos'

// Monotonic unique-ID generator — never collides, even within the same millisecond
let __idSeed = Date.now()
const nextId = () => { __idSeed += 1; return __idSeed }

// ── Atomic budget number reservation ─────────────────────────────────────────
// Calls the server-side RPC to reserve the next budget number atomically.
// If the server detects a collision (another device used the same local number),
// it returns a different canonical number. We update the budget in localStorage
// and dispatch an event so the UI re-renders with the corrected number.
// Fire-and-forget: callers remain synchronous and see the local number instantly.
function _reserveBudgetNum(workspaceId, localNum, prefix, budgetId) {
  if (!workspaceId) return
  supabase
    .rpc('next_budget_num', {
      p_workspace_id: workspaceId,
      p_site_key:     SITE_KEY,
      p_local_next:   localNum,
    })
    .then(({ data: serverNum, error }) => {
      if (error || serverNum == null) return
      if (serverNum !== localNum) {
        // Collision detected: update the budget with the server-assigned number
        const list = db('budgets', [])
        const idx  = list.findIndex(b => b.id === budgetId)
        if (idx > -1) {
          list[idx].num       = `${prefix}-${String(serverNum).padStart(4, '0')}`
          list[idx].updatedAt = Date.now()
          dbW('budgets', list)
          wCfg({ nextNum: serverNum + 1 })
          window.dispatchEvent(new CustomEvent('anma:num-corrected'))
        }
      }
    })
    .catch(() => { /* server unreachable — local number stands as fallback */ })
}

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
    ;['suppliers', 'products', 'clients', 'budgets'].forEach(key => {
      db(key, []).forEach(it => { if (typeof it.id === 'number' && it.id >= __idSeed) __idSeed = it.id + 1 })
    })
    return true
  })

  useEffect(() => {
    const h = () => refresh()
    window.addEventListener('anma:synced', h)
    window.addEventListener('anma:num-corrected', h)
    return () => {
      window.removeEventListener('anma:synced', h)
      window.removeEventListener('anma:num-corrected', h)
    }
  }, [refresh])

  const get = useCallback((key, fallback = []) => db(key, fallback), [tick])
  const set = useCallback((key, val) => { dbW(key, val); refresh() }, [refresh])

  const config = useCallback(() => cfg(), [tick])
  const updateConfig = useCallback((patch) => { wCfg(patch); refresh() }, [refresh])

  /* ── Presupuesto / Cotización ── */
  const saveBudget = useCallback((bData) => {
    const bud   = db('budgets', [])
    const c     = cfg()
    const isNew = !bData.id

    if (bData.id) {
      // Update existing — stamp updatedAt for last-write-wins merge
      const i = bud.findIndex((b) => b.id === bData.id)
      if (i > -1) bud[i] = { ...bud[i], ...bData, updatedAt: Date.now() }
    } else {
      // New budget — use local counter for immediate UX, then confirm with server
      const num    = c.nextNum || 1
      const prefix = c.budgetPrefix || 'AN'
      bData.id        = nextId()
      bData.num       = `${prefix}-${String(num).padStart(4, '0')}`
      bData.date      = new Date().toISOString().slice(0, 10)
      bData.updatedAt = Date.now()
      bud.push(bData)
      wCfg({ nextNum: num + 1 })
      // Reserve canonical number on server — corrects collision if another device used the same num
      _reserveBudgetNum(getSyncContext().workspaceId, num, prefix, bData.id)
    }

    dbW('budgets', bud)
    refresh()
    logAudit(isNew ? 'create' : 'update', 'budget', bData.id, { num: bData.num, total: bData.total })
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
    const i   = bud.findIndex((b) => b.id === id)
    if (i > -1) { bud[i].status = status; bud[i].updatedAt = Date.now(); dbW('budgets', bud) }
    refresh()
    logAudit('status_change', 'budget', id, { status })
  }, [refresh])

  /* ── CRUD genérico ── */
  const saveEntity = useCallback((key, item) => {
    const list     = db(key, [])
    const isNew    = !item.id || !list.some(x => x.id === item.id)
    item.updatedAt = Date.now()

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
    logAudit(isNew ? 'create' : 'update', key, item.id, { name: item.name || item.title || null })
    return item
  }, [refresh])

  const deleteEntity = useCallback((key, id) => {
    const existing = db(key, []).find(x => x.id === id)
    dbW(key, db(key, []).filter((x) => x.id !== id))
    refresh()
    logAudit('delete', key, id, existing ? { name: existing.name || existing.title || null } : null)
  }, [refresh])

  /**
   * Importación masiva upsert para una clave de localStorage.
   * Deduplicación por nombre (normStr) dentro del workspace del usuario.
   *
   * @param {string}  key           Clave de localStorage: 'clients'|'suppliers'|'products'
   * @param {Array}   filas         Filas parseadas por importParser (incluyen _status, _row, _raw)
   * @param {object}  [opts]
   * @param {Array}   [opts.supplierList]  Lista de proveedores ya insertados para resolver supplierId
   * @returns {{ nuevos, actualizados, omitidos, total, listaActualizada }}
   */
  const importarEntidades = useCallback((key, filas, { supplierList } = {}) => {
    const nameKey   = key === 'clients' ? 'company' : 'name'
    const list      = db(key, [])
    const ts        = Date.now()
    let nuevos = 0, actualizados = 0, omitidos = 0

    const byName = new Map(list.map(x => [String(x[nameKey] || '').toLowerCase().trim(), x]))
    const supplierByName = supplierList
      ? new Map(supplierList.map(s => [String(s.name || '').toLowerCase().trim(), s]))
      : null

    const updated = [...list]

    for (const fila of filas) {
      if (fila._status === 'empty') { omitidos++; continue }

      const { _row, _raw, _status, supplierName, ...datos } = fila
      datos.updatedAt = ts

      if (supplierName && supplierByName) {
        const match = supplierByName.get(String(supplierName).toLowerCase().trim())
        if (match) datos.supplierId = match.id
      }

      const norm = String(datos[nameKey] || '').toLowerCase().trim()
      if (!norm) { omitidos++; continue }

      const existing = byName.get(norm)
      if (existing) {
        const idx = updated.findIndex(x => x.id === existing.id)
        if (idx > -1) updated[idx] = { ...updated[idx], ...datos, id: existing.id }
        byName.set(norm, updated[idx > -1 ? idx : 0])
        actualizados++
      } else {
        const newItem = { ...datos, id: nextId() }
        updated.push(newItem)
        byName.set(norm, newItem)
        nuevos++
      }
    }

    dbW(key, updated)
    refresh()
    logAudit('import', key, null, { nuevos, actualizados, omitidos })
    return { nuevos, actualizados, omitidos, total: filas.length, listaActualizada: updated }
  }, [refresh])

  /* ── Descuento de stock de kit (batch atómico + registro de movimientos) ──
     Recibe la alternativa aprobada, lee todos los stores de una vez, aplica todos
     los cambios en memoria y escribe en un solo bloque. Registra cada deducción
     como un stockMove para trazabilidad completa. */
  const deductKitStock = useCallback((approvedAlt, budgetRef = '') => {
    if (!approvedAlt?.kits?.length) return
    const today    = new Date().toISOString().slice(0, 10)
    const moves    = db('stockMoves', [])
    const insumos  = db('insumos', [])
    const products = db('products', [])
    const numV = (v) => { const n = Number(v); return isNaN(n) ? 0 : n }

    approvedAlt.kits.forEach(kit => {
      const kitQty = numV(kit.qty)
      if (!kitQty) return

      // Packaging / Insumos (componente A)
      ;(kit.packaging || []).forEach(comp => {
        if (!comp.name) return
        const qty = numV(comp.qty) * kitQty
        if (!qty) return
        const idx = insumos.findIndex(x => (comp.id && x.id === comp.id) || x.name === comp.name)
        moves.push({
          id: nextId(), type: 'sale', date: today,
          insumoId: idx > -1 ? insumos[idx].id : null,
          qty, costUnit: numV(comp.costUnit),
          ref: budgetRef || 'Kit', note: `${kit.name || 'Kit'} — ${comp.name}`,
        })
        if (idx > -1 && typeof insumos[idx].stock === 'number') {
          insumos[idx] = { ...insumos[idx], stock: Math.max(0, insumos[idx].stock - qty), lastMove: today, updatedAt: Date.now() }
        }
      })

      // Productos del kit (componente B)
      ;(kit.products || []).forEach(comp => {
        if (!comp.name) return
        const qty = numV(comp.qty) * kitQty
        if (!qty) return
        const idx = products.findIndex(x => (comp.id && x.id === comp.id) || x.name === comp.name)
        moves.push({
          id: nextId(), type: 'sale', date: today,
          productId: idx > -1 ? products[idx].id : null,
          qty, costUnit: numV(comp.costUnit),
          ref: budgetRef || 'Kit', note: `${kit.name || 'Kit'} — ${comp.name}`,
        })
        if (idx > -1 && typeof products[idx].stock === 'number') {
          products[idx] = { ...products[idx], stock: Math.max(0, products[idx].stock - qty), lastMove: today, updatedAt: Date.now() }
        }
      })
    })

    // Batch write — single window for all three stores
    dbW('stockMoves', moves)
    dbW('insumos', insumos)
    dbW('products', products)
    refresh()
  }, [refresh])

  return (
    <Ctx.Provider value={{
      get, set, config, updateConfig, refresh, tick,
      saveBudget, deleteBudget, updateBudgetStatus,
      saveEntity, deleteEntity, importarEntidades,
      deductKitStock,
    }}>
      {children}
    </Ctx.Provider>
  )
}

export const useData = () => useContext(Ctx)
