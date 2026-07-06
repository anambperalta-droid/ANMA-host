/**
 * ANMA Regalos — Env var resolvers con fallbacks.
 *
 * Vercel tiene dos conjuntos de nombres para las mismas variables:
 *   - Las que puso Ana manualmente: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
 *   - Las que la integración oficial Supabase↔Vercel crea: SUPABASE_URL,
 *     SUPABASE_ANON_KEY, POSTGRES_URL, etc (sin prefijo VITE_)
 *
 * Este helper busca las 2 variantes para que los endpoints funcionen sin
 * importar cuál esté configurada. Devuelve el string o undefined.
 */

export const supabaseUrl = () =>
  process.env.VITE_SUPABASE_URL
  || process.env.SUPABASE_URL
  || process.env.NEXT_PUBLIC_SUPABASE_URL

export const supabaseAnonKey = () =>
  process.env.VITE_SUPABASE_ANON_KEY
  || process.env.SUPABASE_ANON_KEY
  || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export const supabaseServiceKey = () =>
  process.env.SUPABASE_SERVICE_ROLE_KEY
  || process.env.SUPABASE_SERVICE_KEY
  || process.env.SERVICE_ROLE_KEY

/**
 * Devuelve un mensaje descriptivo de qué env var falta.
 * Útil para debug en Vercel — evita el genérico "Server misconfigured".
 */
export function missingSupabaseEnv() {
  const missing = []
  if (!supabaseUrl()) missing.push('VITE_SUPABASE_URL (o SUPABASE_URL)')
  if (!supabaseServiceKey()) missing.push('SUPABASE_SERVICE_ROLE_KEY')
  return missing.length ? missing.join(', ') : null
}
