import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Versión = timestamp del build. Lo inyectamos como __BUILD_VERSION__ para
// que la UI muestre la versión que el usuario corre y detectar caché viejo.
const BUILD_VERSION = new Date().toISOString().slice(0, 16).replace('T', ' ')

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_VERSION__: JSON.stringify(BUILD_VERSION),
  },
  build: {
    rollupOptions: {
      output: {
        // Vendors en chunks propios: cambian poco entre deploys, así el browser
        // los mantiene cacheados y solo re-descarga el código de la app.
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('@supabase')) return 'vendor-supabase'
            if (id.includes('react-router')) return 'vendor-react'
            if (id.includes('react-dom') || id.includes('/react/') || id.includes('\\react\\') || id.includes('scheduler')) return 'vendor-react'
          }
        },
      },
    },
  },
  server: {
    proxy: {
      // Proxy para Resend API — evita CORS en desarrollo
      '/resend-api': {
        target: 'https://api.resend.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/resend-api/, ''),
      },
    },
  },
})
