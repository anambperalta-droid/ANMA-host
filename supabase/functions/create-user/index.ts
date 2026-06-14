// ─────────────────────────────────────────────────────────────────
// create-user — Edge Function
// Crea un usuario con email + password directamente, sin OAuth.
// El usuario queda confirmado y puede loguearse YA con esas credenciales.
// Solo invocable por el admin global (ana.mbperalta).
// ─────────────────────────────────────────────────────────────────
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const GLOBAL_ADMIN_EMAIL = 'ana.mbperalta@gmail.com'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!token) return json({ error: 'Missing bearer token' }, 401)

    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: ANON_KEY },
    })
    if (!userRes.ok) return json({ error: 'Invalid or expired token' }, 401)
    const user = await userRes.json()
    if (!user?.id) return json({ error: 'Invalid or expired token' }, 401)

    if ((user.email || '').toLowerCase() !== GLOBAL_ADMIN_EMAIL) {
      return json({ error: 'Solo el admin global puede crear usuarios.' }, 403)
    }

    const body = await req.json().catch(() => ({}))
    const email = String(body.email || '').trim().toLowerCase()
    const password = String(body.password || '')
    const businessName = String(body.business_name || '').trim()
    const fullName = String(body.full_name || '').trim()

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return json({ error: 'Email inválido' }, 400)
    if (!password || password.length < 6)
      return json({ error: 'La contraseña debe tener al menos 6 caracteres' }, 400)

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // No requiere confirmación por email
      user_metadata: {
        business_name: businessName || fullName || email.split('@')[0],
        full_name: fullName,
        trial_started_at: new Date().toISOString(),
        is_trial: true,
        allowed_sites: ['hub'],
        created_by_admin: true,
      },
    })

    if (error) return json({ error: error.message }, 400)

    return json({
      ok: true,
      user: {
        id: data.user?.id,
        email: data.user?.email,
        business_name: businessName,
      },
      message: `Usuario creado. Puede ingresar con ${email} y la contraseña que le diste.`,
    })
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500)
  }
})
