-- ═══════════════════════════════════════════════════════════════════
-- ANMA Regalos — Migration: Mercado Pago subscription tracking
-- ═══════════════════════════════════════════════════════════════════
-- Aplicá este SQL UNA SOLA VEZ en:
--   Supabase Dashboard → SQL Editor → New query → Pegar todo → Run
--
-- Idempotente: si lo corrés 2 veces no rompe nada (uso IF NOT EXISTS).
-- ═══════════════════════════════════════════════════════════════════

-- 1. Columnas nuevas en `workspaces` para el ciclo de suscripción
-- ────────────────────────────────────────────────────────────────────
-- subscription_status: estado de pago del cliente
--   'trial'           → en período de prueba 7 días
--   'pending_setup'   → pagó la entrada, esperando setup manual del admin
--   'active'          → al día con su mensual
--   'pending_payment' → cuota vencida hace <= 7 días (gracia)
--   'paused'          → suspendido por falta de pago (datos guardados 90 días)
--   'churned'         → cancelado / abandonado (datos archivados)

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'trial';

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS next_payment_due_at TIMESTAMPTZ;

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS last_payment_at TIMESTAMPTZ;

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS lifetime_revenue NUMERIC DEFAULT 0;

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS contact_email TEXT;

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS contact_phone TEXT;

-- Check constraint para subscription_status (defensive)
DO $$ BEGIN
  ALTER TABLE workspaces
    ADD CONSTRAINT workspaces_subscription_status_check
    CHECK (subscription_status IN ('trial','pending_setup','active','pending_payment','paused','churned'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


-- 2. Tabla nueva: workspace_payments (historial completo de pagos)
-- ────────────────────────────────────────────────────────────────────
-- Trackea cada pago realizado: el de ingreso ($120k) y cada mensual ($30k).
-- Source of truth para reconciliación con Mercado Pago + reportes contables.

CREATE TABLE IF NOT EXISTS workspace_payments (
  id BIGSERIAL PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'ARS',
  kind TEXT NOT NULL CHECK (kind IN ('onboarding','monthly','manual','refund')),
  -- 'onboarding' → entrada $120.000 (única vez)
  -- 'monthly'    → cuota recurrente $30.000
  -- 'manual'     → cobro manual desde admin (efectivo, transferencia, etc)
  -- 'refund'     → devolución (amount negativo conceptual, pero positivo aquí + kind)
  mp_payment_id TEXT,            -- ID que devuelve Mercado Pago
  mp_status TEXT,                -- 'approved' | 'pending' | 'rejected' | 'refunded'
  mp_payment_method TEXT,        -- 'credit_card' | 'debit_card' | 'account_money' | etc
  paid_at TIMESTAMPTZ DEFAULT NOW(),
  recorded_by UUID,              -- user_id del admin que registró pago manual (null si fue MP webhook)
  notes TEXT,
  raw_payload JSONB              -- payload completo de MP para debugging
);

CREATE INDEX IF NOT EXISTS workspace_payments_ws_idx
  ON workspace_payments(workspace_id, paid_at DESC);

CREATE INDEX IF NOT EXISTS workspace_payments_mp_id_idx
  ON workspace_payments(mp_payment_id) WHERE mp_payment_id IS NOT NULL;


-- 3. RLS Policies para workspace_payments
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE workspace_payments ENABLE ROW LEVEL SECURITY;

-- Admin global puede ver y crear todo
DROP POLICY IF EXISTS payments_admin_all ON workspace_payments;
CREATE POLICY payments_admin_all ON workspace_payments
  FOR ALL TO authenticated
  USING (auth.jwt() ->> 'email' = 'ana.mbperalta@gmail.com')
  WITH CHECK (auth.jwt() ->> 'email' = 'ana.mbperalta@gmail.com');

-- Owner del workspace puede ver SUS pagos (solo lectura)
DROP POLICY IF EXISTS payments_owner_read ON workspace_payments;
CREATE POLICY payments_owner_read ON workspace_payments
  FOR SELECT TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM memberships
      WHERE user_id = auth.uid() AND role = 'owner' AND status = 'active'
    )
  );


-- 4. Función helper para calcular subscription_status auto
-- ────────────────────────────────────────────────────────────────────
-- Devuelve el estado correcto según las fechas del workspace.
-- Se llama desde el cron job (o manualmente desde el admin) para
-- sincronizar estados sin esperar a que el user accione.

CREATE OR REPLACE FUNCTION calc_subscription_status(ws_id UUID)
RETURNS TEXT AS $$
DECLARE
  ws RECORD;
  days_overdue INTEGER;
BEGIN
  SELECT * INTO ws FROM workspaces WHERE id = ws_id;
  IF ws IS NULL THEN RETURN 'churned'; END IF;
  -- Si nunca activó, sigue en trial (manejado por el trial.js client-side)
  IF ws.activated_at IS NULL THEN RETURN 'trial'; END IF;
  -- Si no hay fecha de próximo vencimiento, asumimos activo
  IF ws.next_payment_due_at IS NULL THEN RETURN 'active'; END IF;
  -- Vencimiento
  days_overdue := EXTRACT(DAY FROM (NOW() - ws.next_payment_due_at));
  IF days_overdue <= 0 THEN RETURN 'active'; END IF;
  IF days_overdue <= 7 THEN RETURN 'pending_payment'; END IF;
  IF days_overdue <= 90 THEN RETURN 'paused'; END IF;
  RETURN 'churned';
END;
$$ LANGUAGE plpgsql STABLE;


-- 5. Trigger automático: al insertar un pago aprobado, actualizar workspace
-- ────────────────────────────────────────────────────────────────────
-- Cuando llega un pago confirmado, este trigger:
--  - Setea activated_at si es el primer pago (onboarding)
--  - Avanza next_payment_due_at +30 días
--  - Suma al lifetime_revenue
--  - Marca subscription_status = 'pending_setup' (entrada) o 'active' (mensual)

CREATE OR REPLACE FUNCTION on_payment_received()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.mp_status = 'approved' OR NEW.kind = 'manual' THEN
    UPDATE workspaces SET
      last_payment_at = NEW.paid_at,
      lifetime_revenue = COALESCE(lifetime_revenue, 0) + NEW.amount,
      activated_at = COALESCE(activated_at, NEW.paid_at),
      next_payment_due_at = COALESCE(next_payment_due_at, NEW.paid_at) + INTERVAL '30 days',
      subscription_status = CASE
        WHEN NEW.kind = 'onboarding' THEN 'pending_setup'
        ELSE 'active'
      END
    WHERE id = NEW.workspace_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS payment_received_trigger ON workspace_payments;
CREATE TRIGGER payment_received_trigger
  AFTER INSERT ON workspace_payments
  FOR EACH ROW
  EXECUTE FUNCTION on_payment_received();


-- 6. View: resumen de cobros (para el dashboard admin)
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW workspace_billing_summary AS
SELECT
  w.id,
  w.name,
  w.subscription_status,
  w.activated_at,
  w.next_payment_due_at,
  w.last_payment_at,
  w.lifetime_revenue,
  CASE
    WHEN w.next_payment_due_at IS NULL THEN NULL
    ELSE EXTRACT(DAY FROM (w.next_payment_due_at - NOW()))::INTEGER
  END AS days_until_due,
  (
    SELECT COUNT(*) FROM workspace_payments p
    WHERE p.workspace_id = w.id AND p.mp_status IN ('approved') OR p.kind = 'manual'
  ) AS payments_count,
  (
    SELECT MAX(paid_at) FROM workspace_payments p
    WHERE p.workspace_id = w.id
  ) AS latest_payment_at
FROM workspaces w;


-- ═══════════════════════════════════════════════════════════════════
-- ✓ Migration completa. No requiere acción adicional.
--   Para verificar:
--     SELECT * FROM workspace_billing_summary LIMIT 5;
-- ═══════════════════════════════════════════════════════════════════
