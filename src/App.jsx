import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useLocation, useSearchParams } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Login from './components/layout/Login'
import AppShell from './components/layout/AppShell'
import ErrorBoundary from './components/layout/ErrorBoundary'

// Páginas secundarias lazy: no forman parte del flujo principal post-login,
// así el bundle inicial solo carga Login + AppShell.
const Bienvenida      = lazy(() => import('./components/pages/Bienvenida'))
const PortalProveedor = lazy(() => import('./components/pages/PortalProveedor'))
const Alta            = lazy(() => import('./components/pages/Alta'))
const Activar         = lazy(() => import('./components/pages/Activar'))
const PagoResultado   = lazy(() => import('./components/pages/PagoResultado'))

// Respeta ?next=/algo después de login. Whitelist: solo paths internos.
function NavigateToNext({ fallback = '/' }) {
  const [params] = useSearchParams()
  const next = params.get('next')
  const safe = next && next.startsWith('/') && !next.startsWith('//') ? next : fallback
  return <Navigate to={safe} replace />
}

export default function App() {
  const { authed, loading } = useAuth()
  const loc = useLocation()
  const hash = loc.hash || ''
  const search = loc.search || ''
  const hasAuthParams = hash.includes('access_token') || search.includes('code=') || search.includes('token_hash=')

  if (loading && !hasAuthParams) return <div className="sk sk-kpi" style={{ height: '100vh' }} />

  return (
    <ErrorBoundary>
      <Suspense fallback={<div className="sk sk-kpi" style={{ height: '100vh' }} />}>
      <Routes>
        <Route path="/portal-proveedor" element={<PortalProveedor />} />
        <Route path="/alta" element={<Alta appName="ANMA Regalos" />} />
        <Route path="/bienvenida" element={<Bienvenida />} />
        <Route path="/login" element={
          hasAuthParams ? <Navigate to={'/bienvenida' + search + hash} replace /> :
          authed ? <NavigateToNext /> : <Login />
        } />
        {/* Activación + páginas de retorno post-checkout MP */}
        <Route path="/activar" element={!authed ? <Navigate to="/login?next=/activar" replace /> : <Activar />} />
        <Route path="/pago-exitoso" element={<PagoResultado variant="exitoso" />} />
        <Route path="/pago-pendiente" element={<PagoResultado variant="pendiente" />} />
        <Route path="/pago-error" element={<PagoResultado variant="error" />} />
        <Route path="/*" element={
          hasAuthParams ? <Navigate to={'/bienvenida' + search + hash} replace /> :
          authed ? <AppShell /> : <Navigate to="/login" />
        } />
      </Routes>
      </Suspense>
    </ErrorBoundary>
  )
}
