/**
 * ANMA Pro — Route registry + lazy + prefetch.
 *
 * Centraliza los lazy imports de las páginas para que:
 *  1. AppShell los use como `lazy(() => loader())`
 *  2. Sidebar / BottomNav puedan invocar `prefetchRoute('clientes')` en hover
 *     y precargar el chunk antes de que el user haga click.
 *
 * El truco está en `loader()` cacheable: la primera vez devuelve el import
 * promise; las siguientes devuelven el mismo promise resuelto. Es seguro
 * llamarlo N veces.
 */
import { lazy } from 'react'

// Cada entrada: { loader, kind }
// kind: 'table' | 'form' | 'cards' | 'dashboard' — determina el skeleton contextual
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
  micuenta:    { loader: () => import('../components/pages/MiCuenta'),     kind: 'form' },
  notfound:    { loader: () => import('../components/pages/NotFound'),     kind: 'dashboard' },
}

// Cache de promesas para que múltiples hovers no disparen múltiples fetches
const _cache = new Map()
function cachedLoad(key) {
  if (!_cache.has(key)) {
    const entry = REGISTRY[key]
    if (!entry) return Promise.resolve(null)
    _cache.set(key, entry.loader().catch(err => { _cache.delete(key); throw err }))
  }
  return _cache.get(key)
}

// Lazy components — usar como <Historial /> directamente en Routes
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
export const MiCuenta    = lazy(() => cachedLoad('micuenta'))
export const NotFound    = lazy(() => cachedLoad('notfound'))

/**
 * Prefetch: dispara el download del chunk sin esperar.
 * Llamar en onMouseEnter / onTouchStart / IntersectionObserver de items de nav.
 * Cachea internamente: llamar 100 veces == 1 fetch.
 *
 * Path → key mapping inteligente:
 *   '/clientes' → 'clientes'
 *   '/' → 'dashboard'
 *   '/presupuesto/123' → 'presupuesto'
 */
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
  // Solo prefetch cuando la red lo permita (Save-Data, slow-2g excluded)
  if (typeof navigator !== 'undefined' && navigator.connection) {
    const c = navigator.connection
    if (c.saveData) return
    if (c.effectiveType === 'slow-2g' || c.effectiveType === '2g') return
  }
  cachedLoad(key)
}

/** Devuelve el kind ('table'|'form'|'cards'|'dashboard') para una ruta */
export function getRouteKind(pathname) {
  if (!pathname) return 'dashboard'
  if (pathname === '/') return 'dashboard'
  const seg = pathname.replace(/^\//, '').split('/')[0]
  return REGISTRY[seg]?.kind || 'dashboard'
}
