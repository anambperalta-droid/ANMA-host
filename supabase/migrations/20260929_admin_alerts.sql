-- ═══════════════════════════════════════════════════════════════════
-- ANMA — Tabla admin_alerts + trigger desde workspaces + RLS + realtime
-- ═══════════════════════════════════════════════════════════════════
-- Migración espejo de anma-app (comparte Supabase). Ver comentarios
-- completos en anma-app/supabase/migrations/20260929_admin_alerts.sql
--
-- Idempotente: seguro correr múltiples veces.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.admin_alerts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type          text NOT NULL,
  title         text NOT NULL,
  body          text,
  workspace_id  uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  meta          jsonb DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  read_at       timestamptz,
  dismissed_at  timestamptz
);

CREATE INDEX IF NOT EXISTS idx_admin_alerts_unread
  ON public.admin_alerts (created_at DESC)
  WHERE read_at IS NULL AND dismissed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_admin_alerts_type
  ON public.admin_alerts (type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_alerts_workspace
  ON public.admin_alerts (workspace_id)
  WHERE workspace_id IS NOT NULL;

ALTER TABLE public.admin_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_alerts_read ON public.admin_alerts;
CREATE POLICY admin_alerts_read ON public.admin_alerts
  FOR SELECT TO authenticated
  USING (
    (auth.jwt() ->> 'email') = 'ana.mbperalta@gmail.com'
    OR COALESCE(((auth.jwt() -> 'user_metadata') ->> 'is_global_admin')::boolean, false) = true
  );

DROP POLICY IF EXISTS admin_alerts_update ON public.admin_alerts;
CREATE POLICY admin_alerts_update ON public.admin_alerts
  FOR UPDATE TO authenticated
  USING (
    (auth.jwt() ->> 'email') = 'ana.mbperalta@gmail.com'
    OR COALESCE(((auth.jwt() -> 'user_metadata') ->> 'is_global_admin')::boolean, false) = true
  )
  WITH CHECK (
    (auth.jwt() ->> 'email') = 'ana.mbperalta@gmail.com'
    OR COALESCE(((auth.jwt() -> 'user_metadata') ->> 'is_global_admin')::boolean, false) = true
  );

CREATE OR REPLACE FUNCTION public.log_workspace_signup_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_wsname text;
BEGIN
  BEGIN
    SELECT u.email INTO v_email FROM auth.users u WHERE u.id = NEW.id LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_email := NULL;
  END;
  v_wsname := COALESCE(NULLIF(NEW.name, ''), v_email, 'sin nombre');
  INSERT INTO public.admin_alerts (type, title, body, workspace_id, meta)
  VALUES (
    'signup',
    'Nuevo signup: ' || v_wsname,
    'Se registró un nuevo workspace en ANMA. Contactalos para acompañar el onboarding.',
    NEW.id,
    jsonb_build_object('plan', NEW.plan, 'name', v_wsname, 'email', v_email, 'seats', NEW.seats_allowed)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_workspace_created_alert ON public.workspaces;
CREATE TRIGGER on_workspace_created_alert
  AFTER INSERT ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.log_workspace_signup_alert();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'admin_alerts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_alerts;
  END IF;
END $$;
