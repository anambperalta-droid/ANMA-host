// ─────────────────────────────────────────────────────────────────
// delete-user — Edge Function
// Elimina COMPLETAMENTE un usuario: auth.users + workspaces + memberships
// + data. Solo invocable por el admin global (ana.mbperalta).
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

    // Validar quién está llamando
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: ANON_KEY },
    })
    if (!userRes.ok) return json({ error: 'Invalid or expired token' }, 401)
    const user = await userRes.json()
    if (!user?.id) return json({ error: 'Invalid or expired token' }, 401)

    // SOLO global admin puede eliminar
    if ((user.email || '').toLowerCase() !== GLOBAL_ADMIN_EMAIL) {
      return json({ error: 'Solo el admin global puede eliminar usuarios.' }, 403)
    }

    const body = await req.json().catch(() => ({}))
    const targetUserId = String(body.user_id || '').trim()
    const targetEmail  = String(body.email || '').trim().toLowerCase()

    if (!targetUserId && !targetEmail) {
      return json({ error: 'Falta user_id o email del usuario a eliminar.' }, 400)
    }

    // Auto-eliminación bloqueada por seguridad
    if (targetUserId === user.id || targetEmail === GLOBAL_ADMIN_EMAIL) {
      return json({ error: 'No podés eliminar tu propia cuenta de admin global.' }, 400)
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Resolver user_id si solo nos pasaron email
    let userId = targetUserId
    if (!userId && targetEmail) {
      // listUsers no acepta filter por email directamente — paginamos buscando
      const { data: listData, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
      if (listErr) return json({ error: 'No se pudo buscar usuarios: ' + listErr.message }, 500)
      const found = listData.users.find(u => (u.email || '').toLowerCase() === targetEmail)
      if (!found) return json({ error: 'Usuario no encontrado por ese email.' }, 404)
      userId = found.id
    }

    // ── Cleanup en cascada (ANTES de borrar auth.users, por FKs) ──
    const cleanup: Record<string, string | null> = {}

    // 1. anma_user_data (datos del negocio del user)
    {
      const { error } = await admin.from('anma_user_data').delete().eq('user_id', userId)
      cleanup.anma_user_data = error?.message || null
    }
    // 2. memberships donde es miembro
    {
      const { error } = await admin.from('memberships').delete().eq('user_id', userId)
      cleanup.memberships = error?.message || null
    }
    // 3. workspaces de su propiedad (cascade va a barrer todo lo demás vía FK)
    {
      const { error } = await admin.from('workspaces').delete().eq('owner_id', userId)
      cleanup.workspaces_owned = error?.message || null
    }
    // 4. workspaces donde su id ES el workspace_id (workspace personal)
    {
      const { error } = await admin.from('workspaces').delete().eq('id', userId)
      cleanup.workspace_personal = error?.message || null
    }

    // 5. FINALMENTE — borrar de auth.users
    const { error: delErr } = await admin.auth.admin.deleteUser(userId)
    if (delErr) {
      return json({
        error: 'Limpieza parcial OK pero falló auth.users: ' + delErr.message,
        cleanup,
      }, 500)
    }

    return json({
      ok: true,
      deleted_user_id: userId,
      deleted_email: targetEmail || undefined,
      cleanup,
      message: 'Usuario eliminado completamente. Ya puede volver a registrarse con el mismo email.',
    })
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500)
  }
})
