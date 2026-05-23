-- ═══════════════════════════════════════════════════════════════════
-- ANMA — Migración JSONB blob → tablas normalizadas
-- Fuente: public.anma_user_data (JSONB) → 11 tablas relacionales
-- Estrategia:
--   1. TRUNCATE tablas destino (estaban vacías; idempotente para re-ejecutar)
--   2. Temp tables para mapeo blob_id (numérico) → UUID nuevo
--   3. INSERT con normalización de tipos, estados y FKs
--   4. blob_id original guardado en extra->>'blob_id' para trazabilidad
-- NON-DESTRUCTIVE: anma_user_data NO se modifica.
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_ws_id     uuid;
  v_pro       jsonb;
  v_reg       jsonb;
  v_cfg_pro   jsonb;
  v_cfg_reg   jsonb;
  v_rec       jsonb;
  v_status    text;
  v_pay       text;
  v_ctype     text;
  v_date      date;
  v_new_id    uuid;
  v_blob_id   text;
  v_item_id   uuid;
  v_item_type text;
  v_move_type text;
  v_client_id uuid;
  v_num_pro   integer;
  v_num_reg   integer;
BEGIN

  -- ── 0. Truncar tablas destino ────────────────────────────────────────────────
  -- Orden: de más dependiente a menos (CASCADE para seguridad)
  TRUNCATE TABLE
    public.regalos_assignments,
    public.regalos_budgets,
    public.regalos_products,
    public.regalos_clients,
    public.pro_stock_moves,
    public.pro_budgets,
    public.pro_insumos,
    public.pro_products,
    public.pro_suppliers,
    public.pro_clients,
    public.business_profiles
  RESTART IDENTITY CASCADE;

  RAISE NOTICE 'Tablas truncadas. Iniciando migración...';

  -- ── Temp tables para mapeo de IDs (blob numérico → UUID) ────────────────────
  -- DROP previo para re-ejecución segura desde SQL Editor
  DROP TABLE IF EXISTS _pro_product_map;
  DROP TABLE IF EXISTS _pro_insumo_map;
  DROP TABLE IF EXISTS _pro_client_map;
  DROP TABLE IF EXISTS _reg_client_map;

  -- Incluyen ws_id para evitar colisiones entre workspaces
  CREATE TEMP TABLE _pro_product_map (
    blob_id text, ws_id uuid, new_id uuid NOT NULL,
    PRIMARY KEY (blob_id, ws_id)
  );
  CREATE TEMP TABLE _pro_insumo_map (
    blob_id text, ws_id uuid, new_id uuid NOT NULL,
    PRIMARY KEY (blob_id, ws_id)
  );
  CREATE TEMP TABLE _pro_client_map (
    blob_id text, ws_id uuid, new_id uuid NOT NULL,
    PRIMARY KEY (blob_id, ws_id)
  );
  CREATE TEMP TABLE _reg_client_map (
    blob_id text, ws_id uuid, new_id uuid NOT NULL,
    PRIMARY KEY (blob_id, ws_id)
  );

  -- ══════════════════════════════════════════════════════════════════════════════
  -- 1. business_profiles — una fila por workspace, combina cfg de ambas apps
  -- ══════════════════════════════════════════════════════════════════════════════
  FOR v_ws_id IN SELECT DISTINCT user_id FROM public.anma_user_data LOOP
    SELECT data->'cfg' INTO v_cfg_pro
      FROM public.anma_user_data WHERE user_id = v_ws_id::text AND site_key = 'anma-pro';
    SELECT data->'cfg' INTO v_cfg_reg
      FROM public.anma_user_data WHERE user_id = v_ws_id::text AND site_key = 'anma-regalos';

    v_num_pro := coalesce(nullif(v_cfg_pro->>'nextNum','')::integer, 1);
    v_num_reg := coalesce(nullif(v_cfg_reg->>'nextNum','')::integer, 1);

    INSERT INTO public.business_profiles (
      workspace_id,
      business_name,
      subtitle,
      currency,
      budget_prefix,
      next_num_pro,
      next_num_regalos,
      default_margin,
      default_deposit,
      validity_days
    ) VALUES (
      v_ws_id,
      coalesce(
        nullif(v_cfg_pro->>'businessName',''), nullif(v_cfg_reg->>'businessName',''),
        nullif(v_cfg_pro->>'name',''),         nullif(v_cfg_reg->>'name',''),
        'Mi Negocio'
      ),
      nullif(coalesce(v_cfg_pro->>'subtitle', v_cfg_reg->>'subtitle'), ''),
      coalesce(nullif(v_cfg_pro->>'currency',''), nullif(v_cfg_reg->>'currency',''), '$'),
      coalesce(nullif(v_cfg_pro->>'budgetPrefix',''), nullif(v_cfg_reg->>'budgetPrefix',''), 'AN'),
      v_num_pro,
      v_num_reg,
      coalesce(
        nullif(v_cfg_pro->>'defaultMargin','')::integer,
        nullif(v_cfg_reg->>'defaultMargin','')::integer,
        40
      ),
      coalesce(
        nullif(v_cfg_pro->>'defaultDeposit','')::integer,
        nullif(v_cfg_reg->>'defaultDeposit','')::integer,
        50
      ),
      coalesce(
        nullif(v_cfg_pro->>'validityDays','')::integer,
        nullif(v_cfg_reg->>'validityDays','')::integer,
        15
      )
    )
    ON CONFLICT (workspace_id) DO UPDATE SET
      next_num_pro     = GREATEST(EXCLUDED.next_num_pro,     business_profiles.next_num_pro),
      next_num_regalos = GREATEST(EXCLUDED.next_num_regalos, business_profiles.next_num_regalos),
      business_name    = EXCLUDED.business_name,
      budget_prefix    = EXCLUDED.budget_prefix,
      default_margin   = EXCLUDED.default_margin,
      default_deposit  = EXCLUDED.default_deposit,
      validity_days    = EXCLUDED.validity_days;
  END LOOP;

  RAISE NOTICE 'business_profiles: OK';

  -- ══════════════════════════════════════════════════════════════════════════════
  -- 2–6. ANMA PRO — por cada workspace con datos pro
  -- ══════════════════════════════════════════════════════════════════════════════
  FOR v_ws_id IN SELECT user_id FROM public.anma_user_data WHERE site_key = 'anma-pro' LOOP
    SELECT data INTO v_pro FROM public.anma_user_data WHERE user_id = v_ws_id::text AND site_key = 'anma-pro';
    RAISE NOTICE 'PRO workspace %: clientes=%, proveedores=%, productos=%, insumos=%, pedidos=%, movimientos=%',
      v_ws_id,
      jsonb_array_length(coalesce(v_pro->'clients',   '[]')),
      jsonb_array_length(coalesce(v_pro->'suppliers',  '[]')),
      jsonb_array_length(coalesce(v_pro->'products',   '[]')),
      jsonb_array_length(coalesce(v_pro->'insumos',    '[]')),
      jsonb_array_length(coalesce(v_pro->'budgets',    '[]')),
      jsonb_array_length(coalesce(v_pro->'stockMoves', '[]'));

    -- ── pro_clients ──────────────────────────────────────────────────────────
    FOR v_rec IN SELECT value FROM jsonb_array_elements(coalesce(v_pro->'clients', '[]')) LOOP
      v_new_id  := gen_random_uuid();
      v_blob_id := v_rec->>'id';

      -- Normalize client_type: B2C por defecto, B2B si se detecta empresa
      v_ctype := upper(coalesce(v_rec->>'type', v_rec->>'clientType', 'b2c'));
      IF v_ctype NOT IN ('B2C','B2B') THEN
        v_ctype := CASE WHEN lower(v_ctype) IN ('empresa','company','b2b','business','corporativo')
                        THEN 'B2B' ELSE 'B2C' END;
      END IF;

      BEGIN
        INSERT INTO public.pro_clients (
          id, workspace_id, name, client_type, company, contact_name,
          email, phone, address, notes, is_active, extra
        ) VALUES (
          v_new_id, v_ws_id,
          coalesce(nullif(trim(coalesce(v_rec->>'name','')), ''), 'Sin nombre'),
          v_ctype,
          nullif(trim(coalesce(v_rec->>'company','')), ''),
          nullif(trim(coalesce(v_rec->>'contact', v_rec->>'contactName', '')), ''),
          nullif(trim(coalesce(v_rec->>'email','')), ''),
          nullif(trim(coalesce(v_rec->>'phone', v_rec->>'tel', '')), ''),
          nullif(trim(coalesce(v_rec->>'address', v_rec->>'direccion', '')), ''),
          nullif(trim(coalesce(v_rec->>'notes', v_rec->>'notas', '')), ''),
          coalesce((v_rec->>'active')::boolean, true),
          jsonb_build_object('blob_id', v_blob_id)
        );
        IF v_blob_id IS NOT NULL THEN
          INSERT INTO _pro_client_map VALUES (v_blob_id, v_ws_id, v_new_id) ON CONFLICT DO NOTHING;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '  [SKIP] pro_clients ws=% blob_id=% err=%', v_ws_id, v_blob_id, SQLERRM;
      END;
    END LOOP;

    -- ── pro_suppliers ────────────────────────────────────────────────────────
    FOR v_rec IN SELECT value FROM jsonb_array_elements(coalesce(v_pro->'suppliers', '[]')) LOOP
      BEGIN
        INSERT INTO public.pro_suppliers (
          workspace_id, name, contact_name, phone, email, address, notes, is_active, extra
        ) VALUES (
          v_ws_id,
          coalesce(nullif(trim(coalesce(v_rec->>'name','')), ''), 'Sin nombre'),
          nullif(trim(coalesce(v_rec->>'contact', v_rec->>'contactName', '')), ''),
          nullif(trim(coalesce(v_rec->>'phone', v_rec->>'tel', '')), ''),
          nullif(trim(coalesce(v_rec->>'email','')), ''),
          nullif(trim(coalesce(v_rec->>'address', v_rec->>'direccion', '')), ''),
          nullif(trim(coalesce(v_rec->>'notes', v_rec->>'notas', '')), ''),
          coalesce((v_rec->>'active')::boolean, true),
          jsonb_build_object('blob_id', v_rec->>'id')
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '  [SKIP] pro_suppliers ws=% blob_id=% err=%', v_ws_id, v_rec->>'id', SQLERRM;
      END;
    END LOOP;

    -- ── pro_products ─────────────────────────────────────────────────────────
    FOR v_rec IN SELECT value FROM jsonb_array_elements(coalesce(v_pro->'products', '[]')) LOOP
      v_new_id  := gen_random_uuid();
      v_blob_id := v_rec->>'id';
      BEGIN
        INSERT INTO public.pro_products (
          id, workspace_id, name, category, unit, cost,
          price_b2c, price_b2b, stock_current, stock_min, notes, is_active, extra
        ) VALUES (
          v_new_id, v_ws_id,
          coalesce(nullif(trim(coalesce(v_rec->>'name','')), ''), 'Sin nombre'),
          nullif(trim(coalesce(v_rec->>'category', v_rec->>'categoria', '')), ''),
          coalesce(nullif(trim(coalesce(v_rec->>'unit', v_rec->>'unidad', '')), ''), 'un'),
          coalesce(nullif(v_rec->>'cost','')::numeric, 0),
          CASE WHEN nullif(v_rec->>'price','')::numeric = 0 THEN NULL
               ELSE nullif(v_rec->>'price','')::numeric END,
          CASE WHEN nullif(coalesce(v_rec->>'priceB2B', v_rec->>'price_b2b'),'')::numeric = 0 THEN NULL
               ELSE nullif(coalesce(v_rec->>'priceB2B', v_rec->>'price_b2b'),'')::numeric END,
          coalesce(nullif(v_rec->>'stock','')::numeric, 0),
          coalesce(nullif(coalesce(v_rec->>'stockMin', v_rec->>'stock_min'),'')::numeric, 0),
          nullif(trim(coalesce(v_rec->>'notes', v_rec->>'notas', '')), ''),
          coalesce((v_rec->>'active')::boolean, true),
          jsonb_build_object('blob_id', v_blob_id)
        );
        IF v_blob_id IS NOT NULL THEN
          INSERT INTO _pro_product_map VALUES (v_blob_id, v_ws_id, v_new_id) ON CONFLICT DO NOTHING;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '  [SKIP] pro_products ws=% blob_id=% err=%', v_ws_id, v_blob_id, SQLERRM;
      END;
    END LOOP;

    -- ── pro_insumos ──────────────────────────────────────────────────────────
    FOR v_rec IN SELECT value FROM jsonb_array_elements(coalesce(v_pro->'insumos', '[]')) LOOP
      v_new_id  := gen_random_uuid();
      v_blob_id := v_rec->>'id';
      BEGIN
        INSERT INTO public.pro_insumos (
          id, workspace_id, name, category, unit, cost,
          stock_current, stock_min, notes, is_active, extra
        ) VALUES (
          v_new_id, v_ws_id,
          coalesce(nullif(trim(coalesce(v_rec->>'name','')), ''), 'Sin nombre'),
          nullif(trim(coalesce(v_rec->>'category', v_rec->>'categoria', '')), ''),
          coalesce(nullif(trim(coalesce(v_rec->>'unit', v_rec->>'unidad', '')), ''), 'un'),
          coalesce(nullif(v_rec->>'cost','')::numeric, 0),
          coalesce(nullif(v_rec->>'stock','')::numeric, 0),
          coalesce(nullif(coalesce(v_rec->>'stockMin', v_rec->>'stock_min'),'')::numeric, 0),
          nullif(trim(coalesce(v_rec->>'notes', v_rec->>'notas', '')), ''),
          coalesce((v_rec->>'active')::boolean, true),
          jsonb_build_object('blob_id', v_blob_id)
        );
        IF v_blob_id IS NOT NULL THEN
          INSERT INTO _pro_insumo_map VALUES (v_blob_id, v_ws_id, v_new_id) ON CONFLICT DO NOTHING;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '  [SKIP] pro_insumos ws=% blob_id=% err=%', v_ws_id, v_blob_id, SQLERRM;
      END;
    END LOOP;

    -- ── pro_stock_moves ──────────────────────────────────────────────────────
    FOR v_rec IN SELECT value FROM jsonb_array_elements(coalesce(v_pro->'stockMoves', '[]')) LOOP
      -- Resolver item_id usando los mapeos recién construidos
      v_item_id   := NULL;
      v_item_type := NULL;
      IF v_rec->>'productId' IS NOT NULL AND v_rec->>'productId' != 'null' THEN
        SELECT new_id INTO v_item_id FROM _pro_product_map
          WHERE blob_id = v_rec->>'productId' AND ws_id = v_ws_id;
        v_item_type := 'product';
      ELSIF v_rec->>'insumoId' IS NOT NULL AND v_rec->>'insumoId' != 'null' THEN
        SELECT new_id INTO v_item_id FROM _pro_insumo_map
          WHERE blob_id = v_rec->>'insumoId' AND ws_id = v_ws_id;
        v_item_type := 'insumo';
      END IF;

      -- Saltar movimientos huérfanos (item eliminado del catálogo)
      CONTINUE WHEN v_item_id IS NULL;

      BEGIN
        v_move_type := lower(coalesce(v_rec->>'type', 'in'));
        IF v_move_type NOT IN ('in','out','adjust','sale','return') THEN v_move_type := 'in'; END IF;

        BEGIN v_date := (v_rec->>'date')::date;
        EXCEPTION WHEN OTHERS THEN v_date := current_date; END;

        INSERT INTO public.pro_stock_moves (
          workspace_id, item_id, item_type, move_type,
          qty, unit_cost_snap, note, created_at
        ) VALUES (
          v_ws_id, v_item_id, v_item_type, v_move_type,
          coalesce(nullif(v_rec->>'qty','')::numeric, 0),
          CASE WHEN nullif(coalesce(v_rec->>'purchaseCost', v_rec->>'unitCost'),'')::numeric = 0 THEN NULL
               ELSE nullif(coalesce(v_rec->>'purchaseCost', v_rec->>'unitCost'),'')::numeric END,
          nullif(trim(coalesce(v_rec->>'note', v_rec->>'ref', v_rec->>'nota', '')), ''),
          coalesce(v_date::timestamptz, now())
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '  [SKIP] pro_stock_moves ws=% item=% err=%', v_ws_id, v_item_id, SQLERRM;
      END;
    END LOOP;

    -- ── pro_budgets ──────────────────────────────────────────────────────────
    FOR v_rec IN SELECT value FROM jsonb_array_elements(coalesce(v_pro->'budgets', '[]')) LOOP
      BEGIN
        -- Normalizar status a los valores del CHECK constraint
        -- Blob usa: draft, sent, confirmed, inprogress, shipped, delivered, lost, cancelled, pending
        v_status := lower(coalesce(v_rec->>'status', 'draft'));
        v_status := CASE v_status
          WHEN 'sent'         THEN 'sent'
          WHEN 'enviado'      THEN 'sent'
          WHEN 'confirmed'    THEN 'confirmed'
          WHEN 'confirmado'   THEN 'confirmed'
          WHEN 'inprogress'   THEN 'inprogress'
          WHEN 'in-progress'  THEN 'inprogress'
          WHEN 'in_progress'  THEN 'inprogress'
          WHEN 'en proceso'   THEN 'inprogress'
          WHEN 'enproceso'    THEN 'inprogress'
          WHEN 'shipped'      THEN 'delivered'   -- sinónimo de entregado
          WHEN 'delivered'    THEN 'delivered'
          WHEN 'entregado'    THEN 'delivered'
          WHEN 'completed'    THEN 'delivered'
          WHEN 'completado'   THEN 'delivered'
          WHEN 'lost'         THEN 'cancelled'   -- perdido → cancelado
          WHEN 'cancelled'    THEN 'cancelled'
          WHEN 'canceled'     THEN 'cancelled'
          WHEN 'cancelado'    THEN 'cancelled'
          WHEN 'pending'      THEN 'draft'
          WHEN 'pendiente'    THEN 'draft'
          ELSE 'draft'
        END;

        -- Normalizar pay_status
        v_pay := lower(coalesce(v_rec->>'payStatus', v_rec->>'pay_status', 'pending'));
        v_pay := CASE v_pay
          WHEN 'partial'   THEN 'partial'
          WHEN 'parcial'   THEN 'partial'
          WHEN 'seña'      THEN 'partial'
          WHEN 'sena'      THEN 'partial'
          WHEN 'paid'      THEN 'paid'
          WHEN 'pagado'    THEN 'paid'
          WHEN 'abonado'   THEN 'paid'
          ELSE 'pending'
        END;

        -- Fecha de entrega (puede ser inválida)
        BEGIN v_date := (v_rec->>'deliveryDate')::date;
        EXCEPTION WHEN OTHERS THEN v_date := NULL; END;

        -- No hay clientId en los pedidos de Pro — el cliente está embebido inline
        -- (company/contact/wa). client_id queda NULL intencioanlmente.

        INSERT INTO public.pro_budgets (
          workspace_id, client_id, budget_number, status, pay_status,
          total, deposit_amount, delivery_date, delivery_mode,
          notes, items_data
        ) VALUES (
          v_ws_id,
          NULL,   -- sin FK a pro_clients: cliente embebido en items_data->meta
          coalesce(nullif(trim(coalesce(v_rec->>'num','')), ''), 'AN-0000'),
          v_status,
          v_pay,
          coalesce(nullif(v_rec->>'total','')::numeric, 0),
          -- depositAmt = monto real; deposit = porcentaje (50). Usar depositAmt.
          coalesce(nullif(coalesce(v_rec->>'depositAmt', v_rec->>'deposit_amount'),'')::numeric, 0),
          v_date,
          -- delivery = modo de entrega (no deliveryMode)
          nullif(trim(coalesce(v_rec->>'delivery', v_rec->>'deliveryMode', '')), ''),
          -- noteCli = notas visibles al cliente
          nullif(trim(coalesce(v_rec->>'noteCli', v_rec->>'notes', v_rec->>'notas', '')), ''),
          -- items_data: array de items + metadatos del cliente embebido
          jsonb_build_object(
            'items', coalesce(v_rec->'items', '[]'::jsonb),
            'meta',  jsonb_build_object(
              'company',    v_rec->>'company',
              'contact',    v_rec->>'contact',
              'wa',         v_rec->>'wa',
              'clientType', v_rec->>'clientType',
              'delivery',   v_rec->>'delivery',
              'logoCost',   v_rec->'logoCost',
              'shipCost',   v_rec->'shipCost',
              'deposit_pct',v_rec->'deposit',
              'noteInt',    v_rec->>'noteInt',
              'blob_id',    v_rec->>'id'
            )
          )
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '  [SKIP] pro_budgets ws=% num=% err=%', v_ws_id, v_rec->>'num', SQLERRM;
      END;
    END LOOP;

  END LOOP; -- fin workspaces anma-pro

  RAISE NOTICE 'ANMA PRO: migración completa';

  -- ══════════════════════════════════════════════════════════════════════════════
  -- 7–9. ANMA REGALOS — por cada workspace con datos regalos
  -- ══════════════════════════════════════════════════════════════════════════════
  FOR v_ws_id IN SELECT user_id FROM public.anma_user_data WHERE site_key = 'anma-regalos' LOOP
    SELECT data INTO v_reg FROM public.anma_user_data WHERE user_id = v_ws_id::text AND site_key = 'anma-regalos';
    RAISE NOTICE 'REGALOS workspace %: clientes=%, productos=%, cotizaciones=%',
      v_ws_id,
      jsonb_array_length(coalesce(v_reg->'clients',  '[]')),
      jsonb_array_length(coalesce(v_reg->'products', '[]')),
      jsonb_array_length(coalesce(v_reg->'budgets',  '[]'));

    -- ── regalos_clients ──────────────────────────────────────────────────────
    FOR v_rec IN SELECT value FROM jsonb_array_elements(coalesce(v_reg->'clients', '[]')) LOOP
      v_new_id  := gen_random_uuid();
      v_blob_id := v_rec->>'id';
      BEGIN
        INSERT INTO public.regalos_clients (
          id, workspace_id, company_name, contact_name,
          email, phone, address, notes, is_active, extra
        ) VALUES (
          v_new_id, v_ws_id,
          coalesce(
            nullif(trim(coalesce(v_rec->>'name','')), ''),
            nullif(trim(coalesce(v_rec->>'companyName', v_rec->>'company_name', '')), ''),
            'Sin nombre'
          ),
          nullif(trim(coalesce(v_rec->>'contact', v_rec->>'contactName', v_rec->>'contact_name', '')), ''),
          nullif(trim(coalesce(v_rec->>'email','')), ''),
          nullif(trim(coalesce(v_rec->>'phone', v_rec->>'tel', '')), ''),
          nullif(trim(coalesce(v_rec->>'address', v_rec->>'direccion', '')), ''),
          nullif(trim(coalesce(v_rec->>'notes', v_rec->>'notas', '')), ''),
          coalesce((v_rec->>'active')::boolean, true),
          jsonb_build_object('blob_id', v_blob_id)
        );
        IF v_blob_id IS NOT NULL THEN
          INSERT INTO _reg_client_map VALUES (v_blob_id, v_ws_id, v_new_id) ON CONFLICT DO NOTHING;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '  [SKIP] regalos_clients ws=% blob_id=% err=%', v_ws_id, v_blob_id, SQLERRM;
      END;
    END LOOP;

    -- ── regalos_products ─────────────────────────────────────────────────────
    FOR v_rec IN SELECT value FROM jsonb_array_elements(coalesce(v_reg->'products', '[]')) LOOP
      BEGIN
        INSERT INTO public.regalos_products (
          workspace_id, name, category, unit, cost, price,
          notes, image_url, is_active, extra
        ) VALUES (
          v_ws_id,
          coalesce(nullif(trim(coalesce(v_rec->>'name','')), ''), 'Sin nombre'),
          nullif(trim(coalesce(v_rec->>'category', v_rec->>'categoria', '')), ''),
          coalesce(nullif(trim(coalesce(v_rec->>'unit', v_rec->>'unidad', '')), ''), 'un'),
          coalesce(nullif(v_rec->>'cost','')::numeric, 0),
          CASE WHEN nullif(v_rec->>'price','')::numeric = 0 THEN NULL
               ELSE nullif(v_rec->>'price','')::numeric END,
          nullif(trim(coalesce(v_rec->>'notes', v_rec->>'notas', '')), ''),
          nullif(trim(coalesce(v_rec->>'imageUrl', v_rec->>'image_url', v_rec->>'imagen', '')), ''),
          coalesce((v_rec->>'active')::boolean, true),
          jsonb_build_object('blob_id', v_rec->>'id')
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '  [SKIP] regalos_products ws=% blob_id=% err=%', v_ws_id, v_rec->>'id', SQLERRM;
      END;
    END LOOP;

    -- ── regalos_budgets ──────────────────────────────────────────────────────
    FOR v_rec IN SELECT value FROM jsonb_array_elements(coalesce(v_reg->'budgets', '[]')) LOOP
      BEGIN
        -- Status (mismo mapping que pro + lost/shipped)
        v_status := lower(coalesce(v_rec->>'status', 'draft'));
        v_status := CASE v_status
          WHEN 'sent'         THEN 'sent'
          WHEN 'enviado'      THEN 'sent'
          WHEN 'confirmed'    THEN 'confirmed'
          WHEN 'confirmado'   THEN 'confirmed'
          WHEN 'inprogress'   THEN 'inprogress'
          WHEN 'in-progress'  THEN 'inprogress'
          WHEN 'in_progress'  THEN 'inprogress'
          WHEN 'en proceso'   THEN 'inprogress'
          WHEN 'enproceso'    THEN 'inprogress'
          WHEN 'shipped'      THEN 'delivered'
          WHEN 'delivered'    THEN 'delivered'
          WHEN 'entregado'    THEN 'delivered'
          WHEN 'completed'    THEN 'delivered'
          WHEN 'completado'   THEN 'delivered'
          WHEN 'lost'         THEN 'cancelled'
          WHEN 'cancelled'    THEN 'cancelled'
          WHEN 'canceled'     THEN 'cancelled'
          WHEN 'cancelado'    THEN 'cancelled'
          WHEN 'pending'      THEN 'draft'
          WHEN 'pendiente'    THEN 'draft'
          ELSE 'draft'
        END;

        -- Pay status
        v_pay := lower(coalesce(v_rec->>'payStatus', v_rec->>'pay_status', 'pending'));
        v_pay := CASE v_pay
          WHEN 'partial'   THEN 'partial'
          WHEN 'parcial'   THEN 'partial'
          WHEN 'seña'      THEN 'partial'
          WHEN 'sena'      THEN 'partial'
          WHEN 'paid'      THEN 'paid'
          WHEN 'pagado'    THEN 'paid'
          WHEN 'abonado'   THEN 'paid'
          ELSE 'pending'
        END;

        -- Fecha entrega
        BEGIN v_date := (v_rec->>'deliveryDate')::date;
        EXCEPTION WHEN OTHERS THEN v_date := NULL; END;

        -- No hay clientId en cotizaciones Regalos — cliente embebido inline

        INSERT INTO public.regalos_budgets (
          workspace_id, client_id, budget_number, occasion, status, pay_status,
          total, deposit_amount, delivery_date, notes, items_data
        ) VALUES (
          v_ws_id,
          NULL,   -- sin FK: cliente embebido en items_data->meta
          coalesce(nullif(trim(coalesce(v_rec->>'num','')), ''), 'AN-0000'),
          -- Blob usa 'ocasion' (sin tilde), no 'occasion'
          nullif(trim(coalesce(v_rec->>'ocasion', v_rec->>'occasion', v_rec->>'motivo', '')), ''),
          v_status,
          v_pay,
          coalesce(nullif(v_rec->>'total','')::numeric, 0),
          -- depositAmt = monto real; deposit = porcentaje. Usar depositAmt.
          coalesce(nullif(coalesce(v_rec->>'depositAmt', v_rec->>'deposit_amount'),'')::numeric, 0),
          v_date,
          nullif(trim(coalesce(v_rec->>'noteCli', v_rec->>'notes', v_rec->>'notas', '')), ''),
          jsonb_build_object(
            'items', coalesce(v_rec->'items', '[]'::jsonb),
            'meta',  jsonb_build_object(
              'company',    v_rec->>'company',
              'contact',    v_rec->>'contact',
              'wa',         v_rec->>'wa',
              'delivery',   v_rec->>'delivery',
              'logoCost',   v_rec->'logoCost',
              'shipCost',   v_rec->'shipCost',
              'deposit_pct',v_rec->'deposit',
              'noteInt',    v_rec->>'noteInt',
              'blob_id',    v_rec->>'id'
            )
          )
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '  [SKIP] regalos_budgets ws=% num=% err=%', v_ws_id, v_rec->>'num', SQLERRM;
      END;
    END LOOP;

  END LOOP; -- fin workspaces anma-regalos

  RAISE NOTICE 'ANMA REGALOS: migración completa';
  RAISE NOTICE '══════════════════════════════════════════════';
  RAISE NOTICE 'MIGRACIÓN COMPLETADA. Verificando conteos...';
  RAISE NOTICE '  business_profiles : %', (SELECT count(*) FROM public.business_profiles);
  RAISE NOTICE '  pro_clients       : %', (SELECT count(*) FROM public.pro_clients);
  RAISE NOTICE '  pro_suppliers     : %', (SELECT count(*) FROM public.pro_suppliers);
  RAISE NOTICE '  pro_products      : %', (SELECT count(*) FROM public.pro_products);
  RAISE NOTICE '  pro_insumos       : %', (SELECT count(*) FROM public.pro_insumos);
  RAISE NOTICE '  pro_stock_moves   : %', (SELECT count(*) FROM public.pro_stock_moves);
  RAISE NOTICE '  pro_budgets       : %', (SELECT count(*) FROM public.pro_budgets);
  RAISE NOTICE '  regalos_clients   : %', (SELECT count(*) FROM public.regalos_clients);
  RAISE NOTICE '  regalos_products  : %', (SELECT count(*) FROM public.regalos_products);
  RAISE NOTICE '  regalos_budgets   : %', (SELECT count(*) FROM public.regalos_budgets);
  RAISE NOTICE '══════════════════════════════════════════════';

END $$;

-- ── Smoke test: verificar integridad FK ────────────────────────────────────────
-- Presupuestos con client_id que apunta a cliente real (porcentaje de resolución)
SELECT
  'pro_budgets FK resolution' AS check_name,
  count(*) FILTER (WHERE client_id IS NOT NULL) AS with_client,
  count(*) FILTER (WHERE client_id IS NULL)     AS without_client,
  count(*)                                       AS total
FROM public.pro_budgets;

SELECT
  'regalos_budgets FK resolution' AS check_name,
  count(*) FILTER (WHERE client_id IS NOT NULL) AS with_client,
  count(*) FILTER (WHERE client_id IS NULL)     AS without_client,
  count(*)                                       AS total
FROM public.regalos_budgets;

-- Conteo final por tabla
SELECT relname AS table_name, n_live_tup AS rows
FROM pg_stat_user_tables
WHERE relname IN (
  'business_profiles','pro_clients','pro_suppliers','pro_products',
  'pro_insumos','pro_stock_moves','pro_budgets',
  'regalos_clients','regalos_products','regalos_budgets','regalos_assignments'
)
ORDER BY relname;
