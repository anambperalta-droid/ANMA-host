import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { DataProvider } from './context/DataContext'
import { ToastProvider } from './context/ToastContext'
import App from './App'
import './index.css'
import { bootstrapSafeBackup } from './lib/safeBackup'

// Auto-snapshot a IndexedDB (anti-pérdida de localStorage)
bootstrapSafeBackup()

// Registrar Service Worker para PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <DataProvider>
            <App />
          </DataProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>
)
