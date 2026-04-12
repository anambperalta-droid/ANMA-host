// ─────────────────────────────────────────────────────────────
// Cliente de invitaciones — llama a la Edge Function invite-user
// NUNCA usa service_role. Requiere sesión activa (JWT).
// ─────────────────────────────────────────────────────────────
import { supabase } from './supabase'

/**
 * Cada app solo conoce SU sitio — no expone la existencia de otros.
 * El key/label se determina automáticamente por hostname.
 */
const ALL_SITES = {
  hub: {
    key: 'hub',
    label: 'ANMA Pro',
    description: 'Gestión de stock y ventas',
    url: 'https://anma-hub.vercel.app',
    redirectTo: 'https://anma-hub.vercel.app/bienvenida',
    icon: 'fa-chart-line',
    color: '#7C3AED',
  },
  host: {
    key: 'host',
    label: 'ANMA Regalos',
    description: 'Cotización y regalos empresariales',
    url: 'https://anma-host.vercel.app',
    redirectTo: 'https://anma-host.vercel.app/bienvenida',
    icon: 'fa-gift',
    color: '#EC4899',
  },
}

/** Detecta en qué sitio estamos corriendo */
function detectCurrentSiteKey() {
  const host = typeof window !== 'undefined' ? window.location.hostname : ''
  if (host.includes('anma-host')) return 'host'
  return 'hub'
}

/** Exporta solo el sitio propio — el cliente nunca ve el otro */
export const CURRENT_SITE = ALL_SITES[detectCurrentSiteKey()]
export const SITES = [CURRENT_SITE]

export function getSiteByKey(key) {
  return ALL_SITES[key] || null
}

/**
 * Envía una invitación por email a un sitio específico.
 * @param {Object} params
 * @param {string} params.email          Email del invitado
 * @param {string} params.siteKey        'hub' | 'host'
 * @param {string} [params.fullName]     Nombre visible (metadata)
 * @param {string} [params.role]         'admin' | 'user' | 'viewer' (metadata)
 * @returns {Promise<{ok: boolean, user: object}>}
 */
export async function sendInvite({ email, siteKey, fullName = '', role = 'user' }) {
  if (!email || !email.includes('@')) throw new Error('Email inválido')
  const site = getSiteByKey(siteKey)
  if (!site) throw new Error('Sitio inválido')

  // Usa supabase.functions.invoke() — maneja JWT + apikey automáticamente
  const { data, error: fnErr } = await supabase.functions.invoke('invite-user', {
    body: {
      email: email.trim().toLowerCase(),
      redirectTo: site.redirectTo,
      metadata: {
        invited_to_site: site.key,
        site_label: site.label,
        full_name: fullName,
        role,
      },
    },
  })

  if (fnErr) {
    let msg = fnErr.message || 'Error al invocar la función'
    if (fnErr.context) {
      try {
        const body = await fnErr.context.json()
        if (body?.error) msg = body.error
      } catch { /* ignore */ }
    }
    throw new Error(msg)
  }

  if (data?.error) throw new Error(data.error)
  return data
}
