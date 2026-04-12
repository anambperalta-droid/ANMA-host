// ─────────────────────────────────────────────────────────────
// Supabase Edge Function: invite-user
// Recibe { email, redirectTo, metadata } desde el cliente,
// verifica que el que llama esté autenticado, y dispara
// auth.admin.inviteUserByEmail usando el SERVICE_ROLE_KEY
// (que vive solo en el servidor, NUNCA en el bundle del frontend).
// ─────────────────────────────────────────────────────────────
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

// Whitelist explícito de destinos permitidos (defensa en profundidad,
// además de lo que configures en Supabase Dashboard > Auth > Redirect URLs).
const ALLOWED_REDIRECTS = new Set([
  'https://anma-hub.vercel.app/bienvenida',
  'https://anma-host.vercel.app/bienvenida',
  'http://localhost:5173/bienvenida',
  'http://localhost:5174/bienvenida',
])

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  try {
    // 1) Autenticación del llamador
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })

    const {
      data: { user },
      error: userErr,
    } = await userClient.auth.getUser()
    if (userErr || !user) return json({ error: 'Invalid or expired token' }, 401)

    // 2) Validación de payload
    const body = await req.json().catch(() => ({}))
    const email = String(body.email || '').trim().toLowerCase()
    const redirectTo = String(body.redirectTo || '').trim()
    const metadata = (body.metadata && typeof body.metadata === 'object') ? body.metadata : {}

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: 'Email inválido' }, 400)
    }
    if (!redirectTo || !ALLOWED_REDIRECTS.has(redirectTo)) {
      return json({
        error: 'redirectTo no permitido. Agregalo a ALLOWED_REDIRECTS y a Supabase > Auth > Redirect URLs.',
      }, 400)
    }

    // 3) Invitación con privilegios admin (server-side)
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: {
        ...metadata,
        invited_by: user.email || user.id,
        invited_at: new Date().toISOString(),
      },
    })

    if (error) {
      // Caso común: usuario ya existe
      return json({ error: error.message }, 400)
    }

    return json({
      ok: true,
      user: {
        id: data.user?.id,
        email: data.user?.email,
        invited_at: data.user?.invited_at,
      },
    })
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500)
  }
})
