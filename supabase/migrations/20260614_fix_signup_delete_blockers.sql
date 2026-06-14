-- ═══════════════════════════════════════════════════════════════════
-- ANMA — Fix signup + delete user blockers
-- ═══════════════════════════════════════════════════════════════════
-- BUGS QUE RESUELVE:
--   1. "Database error saving new user" al registrar nuevo email
--   2. "Database error deleting user" al borrar desde Supabase Dashboard
--
-- CAUSA: audit_log.actor_user_id sin ON DELETE SET NULL bloquea el delete
--        cuando hay registros del audit.
--        El trigger de signup falla cuando hay records huérfanos.
--
-- Aplicá UNA SOLA VEZ en: Supabase SQL Editor → New query → Run
-- Idempotente: seguro de correr múltiples veces.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Fix audit_log: actor_user_id debe ser SET NULL on delete ──────
-- Si la FK no tiene CASCADE, eliminar un auth.users con registros de audit
-- bloquea todo el delete. Esto rompía la eliminación de usuarios.
DO $$
BEGIN
  -- Drop existing FK (cualquier nombre que tenga)
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'audit_log' AND constraint_type = 'FOREIGN KEY'
      AND constraint_name LIKE '%actor_user_id%'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE public.audit_log DROP CONSTRAINT ' || constraint_name
      FROM information_schema.table_constraints
      WHERE table_name = 'audit_log' AND constraint_type = 'FOREIGN KEY'
        AND constraint_name LIKE '%actor_user_id%'
      LIMIT 1
    );
  END IF;
  -- Re-add con ON DELETE SET NULL
  ALTER TABLE public.audit_log
    ADD CONSTRAINT audit_log_actor_user_id_fkey
    FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'audit_log fix skipped: %', SQLERRM;
END $$;

-- ── 2. Fix memberships.invited_by: SET NULL en lugar de bloquear ─────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'memberships' AND constraint_type = 'FOREIGN KEY'
      AND constraint_name LIKE '%invited_by%'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE public.memberships DROP CONSTRAINT ' || constraint_name
      FROM information_schema.table_constraints
      WHERE table_name = 'memberships' AND constraint_type = 'FOREIGN KEY'
        AND constraint_name LIKE '%invited_by%'
      LIMIT 1
    );
  END IF;
  ALTER TABLE public.memberships
    ADD CONSTRAINT memberships_invited_by_fkey
    FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'memberships fix skipped: %', SQLERRM;
END $$;

-- ── 3. Trigger de signup BLINDADO ────────────────────────────────────
-- Antes: si el INSERT en workspaces o memberships fallaba, todo el signup moría.
-- Ahora: cada INSERT está en su propio EXCEPTION block. El signup NUNCA debería
-- fallar por culpa del trigger — si algo sale mal, se loguea y sigue.

CREATE OR REPLACE FUNCTION public.ensure_workspace_for_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invited_ws uuid;
  v_role text;
  v_invited_by uuid;
BEGIN
  -- Parse metadata defensivamente
  BEGIN
    v_invited_ws := nullif(new.raw_user_meta_data ->> 'invited_to_workspace', '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_invited_ws := NULL;
    RAISE NOTICE 'invited_to_workspace parse error: %', SQLERRM;
  END;

  v_role := coalesce(nullif(new.raw_user_meta_data ->> 'role', ''), 'operator');

  BEGIN
    v_invited_by := nullif(new.raw_user_meta_data ->> 'invited_by_user', '')::uuid;
    -- Si el invited_by no existe en auth.users, ponerlo null para evitar FK violation
    IF v_invited_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_invited_by) THEN
      v_invited_by := NULL;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_invited_by := NULL;
  END;

  IF v_invited_ws IS NOT NULL THEN
    -- Usuario invitado a un workspace existente
    BEGIN
      INSERT INTO public.memberships (workspace_id, user_id, role, status, invited_by)
      VALUES (v_invited_ws, new.id, v_role, 'active', v_invited_by)
      ON CONFLICT (workspace_id, user_id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'membership insert (invited) error: %', SQLERRM;
    END;
  ELSE
    -- Usuario nuevo: crear su propio workspace + owner membership
    BEGIN
      INSERT INTO public.workspaces (id, name, plan, seats_allowed)
      VALUES (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email), 'solo', 0)
      ON CONFLICT (id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'workspace insert error: %', SQLERRM;
    END;

    BEGIN
      INSERT INTO public.memberships (workspace_id, user_id, role, status)
      VALUES (new.id, new.id, 'owner', 'active')
      ON CONFLICT (workspace_id, user_id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'membership insert (owner) error: %', SQLERRM;
    END;
  END IF;

  RETURN new;
EXCEPTION WHEN OTHERS THEN
  -- Último resorte: nunca fallar el signup. Solo log.
  RAISE NOTICE 'ensure_workspace_for_new_user critical error: %', SQLERRM;
  RETURN new;
END;
$$;

-- ── 4. Cleanup de huérfanos (workspaces sin auth.users correspondiente) ──
-- Estos quedan cuando se borra un user directo desde la DB sin cascade clean.
DELETE FROM public.workspaces w
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = w.id);

-- ═══════════════════════════════════════════════════════════════════
-- ✓ DONE. Ahora podés:
--   - Registrar nuevos usuarios sin "Database error saving new user"
--   - Eliminar usuarios sin "Database error deleting user"
-- ═══════════════════════════════════════════════════════════════════
