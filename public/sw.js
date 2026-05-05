/* ANMA Regalos — Service Worker v3
   Estrategia: Network-first para API/auth, Cache-first para assets estáticos
*/
const CACHE_VER = 'anma-regalos-v3'
const STATIC_CACHE = `${CACHE_VER}-static`
const DYNAMIC_CACHE = `${CACHE_VER}-dynamic`

/* Recursos a pre-cachear al instalar */
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
]

/* Dominios que NUNCA se cachean (auth, supabase, APIs externas) */
const BYPASS_PATTERNS = [
  'supabase.co',
  'googleapis.com',
  'gstatic.com',
  'cdnjs.cloudflare.com',
  'wa.me',
]

/* ── INSTALL: pre-cachear shell ── */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(STATIC_CACHE)
      .then(c => c.addAll(PRECACHE_URLS))
      .catch(() => { /* silenciar errores de pre-cache offline */ })
  )
  self.skipWaiting()
})

/* ── ACTIVATE: limpiar caches viejos ── */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== STATIC_CACHE && k !== DYNAMIC_CACHE)
          .map(k => caches.delete(k))
      )
    )
  )
  self.clients.claim()
})

/* ── FETCH: estrategia inteligente ── */
self.addEventListener('fetch', e => {
  const { request } = e
  const url = new URL(request.url)

  /* Solo GETs */
  if (request.method !== 'GET') return

  /* Bypass: dominios externos y rutas de autenticación */
  const isBypass = BYPASS_PATTERNS.some(p => url.hostname.includes(p)) ||
    url.pathname.startsWith('/auth') ||
    url.pathname.startsWith('/api')
  if (isBypass) return

  /* Assets estáticos (js, css, svg, fonts) → Cache-first */
  const isStaticAsset = /\.(js|css|svg|png|jpg|webp|woff2?|ttf|ico)(\?|$)/.test(url.pathname)
  if (isStaticAsset) {
    e.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached
        return fetch(request).then(res => {
          if (res.ok) {
            caches.open(STATIC_CACHE).then(c => c.put(request, res.clone()))
          }
          return res
        })
      })
    )
    return
  }

  /* Navegación (HTML) → Network-first con fallback al cache */
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request)
        .then(res => {
          if (res.ok) {
            caches.open(DYNAMIC_CACHE).then(c => c.put(request, res.clone()))
          }
          return res
        })
        .catch(() =>
          caches.match(request)
            .then(cached => cached || caches.match('/index.html'))
        )
    )
    return
  }

  /* Resto → Network-first con cache dinámico */
  e.respondWith(
    fetch(request)
      .then(res => {
        if (res.ok) {
          caches.open(DYNAMIC_CACHE).then(c => c.put(request, res.clone()))
        }
        return res
      })
      .catch(() => caches.match(request))
  )
})
