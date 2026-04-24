import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const ALLOWED_REDIRECTS = new Set([
  'https://anma-hub.vercel.app/bienvenida',
  'https://anma-host.vercel.app/bienvenida',
  'http://localhost:5173/bienvenida',
  'http://localhost:5174/bienvenida',
])

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

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

    // Validar token via REST directo — bypass SDK local verification (ES256 compatible)
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: ANON_KEY,
      },
    })
    if (!userRes.ok) return json({ error: 'Invalid or expired token' }, 401)
    const user = await userRes.json()
    if (!user?.id) return json({ error: 'Invalid or expired token' }, 401)

    const body = await req.json().catch(() => ({}))
    const email = String(body.email || '').trim().toLowerCase()
    const redirectTo = String(body.redirectTo || '').trim()
    const metadata = (body.metadata && typeof body.metadata === 'object') ? body.metadata : {}

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return json({ error: 'Email inválido' }, 400)
    if (!redirectTo || !ALLOWED_REDIRECTS.has(redirectTo))
      return json({ error: 'redirectTo no permitido.' }, 400)

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // ── RBAC: determine the invoker's workspace and seat headroom ──
    // The invoker is always inviting into their OWN workspace (workspace_id = user.id).
    // Global admin (ana.mbperalta) bypasses seat limit.
    const isGlobalAdmin = (user.email || '').toLowerCase() === 'ana.mbperalta@gmail.com'
    const workspaceId: string = user.id

    const requestedRole = String(metadata.role || 'operator').toLowerCase()
    const normalizedRole = ['admin', 'owner', 'operator', 'viewer'].includes(requestedRole)
      ? requestedRole
      : 'operator'

    // Only seat-count operators (not admins invited as co-owners — rare case).
    const countsAgainstSeats = normalizedRole === 'operator' || normalizedRole === 'viewer'

    if (!isGlobalAdmin && countsAgainstSeats) {
      // Check workspace exists + seat availability using service_role client.
      const { data: ws, error: wsErr } = await admin
        .from('workspaces')
        .select('id, seats_allowed, plan, status')
        .eq('id', workspaceId)
        .single()

      if (wsErr || !ws) {
        return json({ error: 'No encontramos tu workspace. Cerrá sesión e ingresá de nuevo.' }, 400)
      }
      if (ws.status !== 'active') {
        return json({ error: `Workspace ${ws.status}. Contactá al administrador.` }, 403)
      }

      const { count: used, error: cntErr } = await admin
        .from('memberships')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .neq('role', 'owner')
        .in('status', ['active', 'invited'])

      if (cntErr) return json({ error: 'No se pudo verificar cupo de equipo.' }, 500)

      const seatsUsed = used || 0
      const seatsAllowed = ws.seats_allowed || 0

      if (seatsUsed >= seatsAllowed) {
        return json({
          error: `Llegaste al límite de tu plan (${seatsAllowed} operador${seatsAllowed === 1 ? '' : 'es'}). Actualizá tu plan o eliminá un miembro inactivo.`,
          code: 'SEAT_LIMIT',
          seatsUsed,
          seatsAllowed,
          plan: ws.plan,
        }, 402)
      }
    }

    // Compose metadata — inject workspace + inviter info.
    const finalMetadata = {
      ...metadata,
      role: normalizedRole,
      invited_to_workspace: workspaceId,
      invited_by_user: user.id,
      invited_by: user.email || user.id,
      invited_at: new Date().toISOString(),
    }

    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: finalMetadata,
    })

    if (error) return json({ error: error.message }, 400)

    return json({ ok: true, user: { id: data.user?.id, email: data.user?.email } })
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500)
  }
})
