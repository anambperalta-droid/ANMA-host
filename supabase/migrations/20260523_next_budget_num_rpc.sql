-- ═══════════════════════════════════════════════════════════════════
-- ANMA — Función RPC: next_budget_num
-- Contador atómico server-side para números de presupuesto.
-- Elimina la posibilidad de duplicados AN-XXXX en escenarios
-- multi-dispositivo o multi-operador.
--
-- Lógica:
--   1. Verifica que el caller pertenece al workspace (via my_workspace_ids).
--   2. Hace UPSERT del perfil si no existe aún.
--   3. Avanza el contador a GREATEST(server, local) y reserva el número.
--   4. Retorna el número reservado para el presupuesto actual.
--
-- Si el server ya usó el número local (colisión), retorna uno mayor.
-- El frontend actualiza el presupuesto con el número canónico.
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.next_budget_num(
  p_workspace_id UUID,
  p_site_key     TEXT,
  p_local_next   INTEGER DEFAULT 1
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_num INTEGER;
BEGIN
  -- ── Autorización: el caller debe pertenecer al workspace ──────────
  IF p_workspace_id NOT IN (SELECT public.my_workspace_ids()) THEN
    RAISE EXCEPTION 'access denied';
  END IF;

  -- ── Validación de site_key ────────────────────────────────────────
  IF p_site_key NOT IN ('anma-pro', 'anma-regalos') THEN
    RAISE EXCEPTION 'invalid site_key: %', p_site_key;
  END IF;

  -- ── Garantizar que existe la fila de perfil ───────────────────────
  -- Si no existe, se inserta con los defaults (next_num_* = 1).
  INSERT INTO public.business_profiles (workspace_id)
  VALUES (p_workspace_id)
  ON CONFLICT (workspace_id) DO NOTHING;

  -- ── Reserva atómica del número ────────────────────────────────────
  -- GREATEST(server, local): si el local está por delante del server
  -- (migración de datos existentes o device adelantado), el server
  -- se pone al día. Si el server está por delante (colisión), gana el server.
  -- +1: avanza el contador. RETURNING devuelve el valor post-UPDATE,
  -- restamos 1 para obtener el número que acabamos de reservar.
  IF p_site_key = 'anma-pro' THEN
    UPDATE public.business_profiles
    SET
      next_num_pro = GREATEST(next_num_pro, p_local_next) + 1,
      updated_at   = NOW()
    WHERE workspace_id = p_workspace_id
    RETURNING next_num_pro - 1 INTO v_num;

  ELSE -- 'anma-regalos'
    UPDATE public.business_profiles
    SET
      next_num_regalos = GREATEST(next_num_regalos, p_local_next) + 1,
      updated_at       = NOW()
    WHERE workspace_id = p_workspace_id
    RETURNING next_num_regalos - 1 INTO v_num;
  END IF;

  -- Fallback defensivo: si el UPDATE no afectó filas por algún motivo
  RETURN COALESCE(v_num, p_local_next);
END;
$$;

-- Permiso: solo usuarios autenticados. La autorización interna ya verifica workspace.
GRANT EXECUTE ON FUNCTION public.next_budget_num TO authenticated;

-- ═══════════════════════════════════════════════════════════════════
-- FIN: next_budget_num
-- ═══════════════════════════════════════════════════════════════════
