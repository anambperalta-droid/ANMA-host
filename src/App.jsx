import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Login from './components/layout/Login'
import AppShell from './components/layout/AppShell'
import Bienvenida from './components/pages/Bienvenida'
import PortalProveedor from './components/pages/PortalProveedor'
import Alta from './components/pages/Alta'
import Activar from './components/pages/Activar'
import PagoResultado from './components/pages/PagoResultado'
import ErrorBoundary from './components/layout/ErrorBoundary'

function AuthRedirect() {
  const loc = useLocation()
  const hash = loc.hash || ''
  const search = loc.search || ''
  const hasToken = hash.includes('access_token') || search.includes('code=') || search.includes('token_hash=')
  if (hasToken) {
    return <Navigate to={'/bienvenida' + search + hash} replace />
  }
  return null
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
      <Routes>
        <Route path="/portal-proveedor" element={<PortalProveedor />} />
        <Route path="/alta" element={<Alta appName="ANMA Regalos" />} />
        <Route path="/bienvenida" element={<Bienvenida />} />
        <Route path="/login" element={
          hasAuthParams ? <Navigate to={'/bienvenida' + search + hash} replace /> :
          authed ? <Navigate to="/" /> : <Login />
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
    </ErrorBoundary>
  )
}
