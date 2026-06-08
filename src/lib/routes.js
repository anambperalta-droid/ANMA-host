/**
 * ANMA Regalos — Route registry + lazy + prefetch (espejo de Pro)
 */
import { lazy } from 'react'

const REGISTRY = {
  dashboard:   { loader: () => import('../components/pages/Historial'),    kind: 'dashboard' },
  presupuesto: { loader: () => import('../components/pages/Presupuesto'),  kind: 'form' },
  clientes:    { loader: () => import('../components/pages/Clientes'),     kind: 'table' },
  catalogo:    { loader: () => import('../components/pages/Catalogo'),     kind: 'table' },
  insumos:     { loader: () => import('../components/pages/Insumos'),      kind: 'table' },
  proveedores: { loader: () => import('../components/pages/Proveedores'),  kind: 'cards' },
  logistica:   { loader: () => import('../components/pages/Logistica'),    kind: 'cards' },
  mensajes:    { loader: () => import('../components/pages/Mensajes'),     kind: 'cards' },
  config:      { loader: () => import('../components/pages/Config'),       kind: 'form' },
  admin:       { loader: () => import('../components/pages/Admin'),        kind: 'table' },
  importador:  { loader: () => import('../components/pages/Importador'),   kind: 'form' },
  notfound:    { loader: () => import('../components/pages/NotFound'),     kind: 'dashboard' },
}

const _cache = new Map()
function cachedLoad(key) {
  if (!_cache.has(key)) {
    const entry = REGISTRY[key]
    if (!entry) return Promise.resolve(null)
    _cache.set(key, entry.loader().catch(err => { _cache.delete(key); throw err }))
  }
  return _cache.get(key)
}

export const Historial   = lazy(() => cachedLoad('dashboard'))
export const Presupuesto = lazy(() => cachedLoad('presupuesto'))
export const Clientes    = lazy(() => cachedLoad('clientes'))
export const Catalogo    = lazy(() => cachedLoad('catalogo'))
export const Insumos     = lazy(() => cachedLoad('insumos'))
export const Proveedores = lazy(() => cachedLoad('proveedores'))
export const Logistica   = lazy(() => cachedLoad('logistica'))
export const Mensajes    = lazy(() => cachedLoad('mensajes'))
export const Config      = lazy(() => cachedLoad('config'))
export const Admin       = lazy(() => cachedLoad('admin'))
export const Importador  = lazy(() => cachedLoad('importador'))
export const NotFound    = lazy(() => cachedLoad('notfound'))

export function prefetchRoute(input) {
  if (!input) return
  const path = typeof input === 'string' ? input : ''
  let key = input
  if (path) {
    if (path === '/') key = 'dashboard'
    else {
      const seg = path.replace(/^\//, '').split('/')[0]
      key = seg === 'catalogo' ? 'catalogo' : seg
    }
  }
  if (!REGISTRY[key]) return
  if (typeof navigator !== 'undefined' && navigator.connection) {
    const c = navigator.connection
    if (c.saveData) return
    if (c.effectiveType === 'slow-2g' || c.effectiveType === '2g') return
  }
  cachedLoad(key)
}

export function getRouteKind(pathname) {
  if (!pathname) return 'dashboard'
  if (pathname === '/') return 'dashboard'
  const seg = pathname.replace(/^\//, '').split('/')[0]
  return REGISTRY[seg]?.kind || 'dashboard'
}
