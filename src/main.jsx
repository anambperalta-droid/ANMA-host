import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { DataProvider } from './context/DataContext'
import { ToastProvider } from './context/ToastContext'
import { ConfirmProvider } from './context/ConfirmContext'
import App from './App'
import './index.css'
import { bootstrapSafeBackup } from './lib/safeBackup'

// Auto-snapshot a IndexedDB (anti-pérdida de localStorage)
bootstrapSafeBackup()

// Registrar Service Worker para PWA + auto-update sin pedirle al user que limpie cache.
// Flow:
//   1. Browser carga la app con el SW viejo (v3 cache-first → bug histórico).
//   2. main.jsx registra /sw.js → browser detecta que el archivo cambió.
//   3. Browser instala el SW nuevo en "waiting" state.
//   4. Nuevo SW hace skipWaiting() + clients.claim() → toma control inmediato.
//   5. Nuevo SW envía postMessage 'SW_ACTIVATED' a las tabs activas.
//   6. Acá interceptamos ese mensaje y hacemos UN reload (con flag para no loopear).
// Resultado: el user ve la nueva versión sin tener que hacer Ctrl+Shift+R.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
  // Listener: cuando el SW nuevo se activa, reload una vez para que tome los JS nuevos.
  // El sessionStorage flag evita loop si por algún motivo el SW manda dos mensajes.
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type === 'SW_ACTIVATED') {
      const flag = 'anma_sw_reloaded_' + (e.data.version || '')
      if (!sessionStorage.getItem(flag)) {
        sessionStorage.setItem(flag, '1')
        window.location.reload()
      }
    }
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <ConfirmProvider>
          <AuthProvider>
            <DataProvider>
              <App />
            </DataProvider>
          </AuthProvider>
        </ConfirmProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>
)
