/* ANMA Regalos — Service Worker v4
   ESTRATEGIA NUEVA (anti-cache-stale):
   - JS/CSS/HTML → network-first (siempre lo último del server, fallback offline)
   - Imágenes/fonts → stale-while-revalidate (rápido pero se actualiza)
   - Supabase / APIs → bypass (sin cache, jamás)

   Decisión: SaaS con updates frecuentes > optimización de bandwidth.
   El bug histórico (cliente ve versión vieja después de deploy) se elimina así.
*/
const CACHE_VER = 'anma-regalos-v4'
const RUNTIME = `${CACHE_VER}-runtime`
const OFFLINE_FALLBACK = `${CACHE_VER}-offline`

/* Solo cacheamos un shell mínimo offline */
const PRECACHE = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg']

const BYPASS_PATTERNS = [
  'supabase.co', 'googleapis.com', 'gstatic.com',
  'cdnjs.cloudflare.com', 'wa.me', '/auth', '/api',
]

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(OFFLINE_FALLBACK)
      .then(c => c.addAll(PRECACHE))
      .catch(() => { /* silenciar offline */ })
  )
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys
      .filter(k => k !== RUNTIME && k !== OFFLINE_FALLBACK)
      .map(k => caches.delete(k))
    )
    await self.clients.claim()
    // Avisar a TODAS las tabs que hay nueva versión activa
    const clients = await self.clients.matchAll({ type: 'window' })
    clients.forEach(c => c.postMessage({ type: 'SW_ACTIVATED', version: CACHE_VER }))
  })())
})

self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', e => {
  const { request } = e
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  const isBypass = BYPASS_PATTERNS.some(p =>
    url.hostname.includes(p) || url.pathname.startsWith(p)
  )
  if (isBypass) return

  /* Imágenes / fonts → stale-while-revalidate (cache OK por ahora, refresh bg) */
  const isMedia = /\.(svg|png|jpg|jpeg|webp|woff2?|ttf|ico)(\?|$)/.test(url.pathname)
  if (isMedia) {
    e.respondWith((async () => {
      const cache = await caches.open(RUNTIME)
      const cached = await cache.match(request)
      const fetchPromise = fetch(request).then(res => {
        if (res.ok) cache.put(request, res.clone())
        return res
      }).catch(() => cached)
      return cached || fetchPromise
    })())
    return
  }

  /* JS / CSS / HTML → NETWORK-FIRST (anti-stale, este era el bug). */
  e.respondWith((async () => {
    try {
      const fresh = await fetch(request, { cache: 'no-store' })
      if (fresh.ok) {
        const cache = await caches.open(RUNTIME)
        cache.put(request, fresh.clone())
      }
      return fresh
    } catch {
      // Offline → fallback al cache si existe
      const cached = await caches.match(request)
      return cached || caches.match('/index.html')
    }
  })())
})
