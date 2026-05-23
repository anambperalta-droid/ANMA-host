-- ═══════════════════════════════════════════════════════════════════
-- ANMA — Esquema Normalizado v1
-- Paso 1 Auditoría: Tablas relacionales + RLS para ANMA Pro y ANMA Regalos.
-- Requiere migración previa: 20260424_workspaces_rbac.sql
-- Segura para re-ejecutar: DROP IF EXISTS en policies, IF NOT EXISTS en tablas.
--
-- Convenciones:
--   workspace_id → public.workspaces(id) ON DELETE CASCADE
--   client/product FKs → ON DELETE SET NULL (preserva historial)
--   Tablas de audit/historial: sin updated_at (inmutables por diseño)
-- ═══════════════════════════════════════════════════════════════════

-- ── 0. Función trigger compartida ─────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- ════════════════════════════════════════════════════════════════════
-- 1. COMPARTIDA — business_profiles
--    Una fila por workspace. Centraliza la config del negocio para
--    ambas apps. Reemplaza progresivamente el campo "cfg" del blob
--    anma_user_data en migraciones futuras.
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.business_profiles (
  id                 uuid        primary key default gen_random_uuid(),
  workspace_id       uuid        not null references public.workspaces(id) on delete cascade,
  business_name      text        not null default 'Mi Negocio',
  subtitle           text,
  currency           text        not null default '$',
  number_format      text        not null default 'es-AR',
  logo_url           text,
  default_margin     integer     not null default 40,
  default_deposit    integer     not null default 50,
  validity_days      integer     not null default 15,
  budget_prefix      text        not null default 'AN',
  next_num_pro       integer     not null default 1,     -- contador de presupuestos ANMA Pro
  next_num_regalos   integer     not null default 1,     -- contador independiente ANMA Regalos
  payment_conditions text,
  legal_note         text,
  extra_config       jsonb       not null default '{}',  -- delivery_modes, categorías, etc.
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (workspace_id)
);

create index if not exists idx_business_profiles_workspace
  on public.business_profiles (workspace_id);

drop trigger if exists trg_business_profiles_updated_at on public.business_profiles;
create trigger trg_business_profiles_updated_at
  before update on public.business_profiles
  for each row execute function public.set_updated_at();

alter table public.business_profiles enable row level security;

drop policy if exists "bp_select" on public.business_profiles;
create policy "bp_select" on public.business_profiles for select
  using (workspace_id in (select public.my_workspace_ids()) or public.is_global_admin());

drop policy if exists "bp_insert" on public.business_profiles;
create policy "bp_insert" on public.business_profiles for insert
  with check (workspace_id in (select public.my_workspace_ids()));

drop policy if exists "bp_update" on public.business_profiles;
create policy "bp_update" on public.business_profiles for update
  using  (workspace_id in (select public.my_workspace_ids()))
  with check (workspace_id in (select public.my_workspace_ids()));

drop policy if exists "bp_delete" on public.business_profiles;
create policy "bp_delete" on public.business_profiles for delete
  using (public.my_role(workspace_id) = 'owner' or public.is_global_admin());


-- ════════════════════════════════════════════════════════════════════
-- 2. ANMA PRO — pro_clients
--    Clientes B2C (personas) y B2B (empresas). Leads y activos.
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.pro_clients (
  id            uuid        primary key default gen_random_uuid(),
  workspace_id  uuid        not null references public.workspaces(id) on delete cascade,
  name          text        not null,
  client_type   text        not null default 'B2C'
                            check (client_type in ('B2C', 'B2B')),
  company       text,
  contact_name  text,
  email         text,
  phone         text,
  address       text,
  notes         text,
  tags          text[]      not null default array[]::text[],
  is_active     boolean     not null default true,
  extra         jsonb       not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_pro_clients_workspace
  on public.pro_clients (workspace_id);
create index if not exists idx_pro_clients_type
  on public.pro_clients (workspace_id, client_type);

drop trigger if exists trg_pro_clients_updated_at on public.pro_clients;
create trigger trg_pro_clients_updated_at
  before update on public.pro_clients
  for each row execute function public.set_updated_at();

alter table public.pro_clients enable row level security;

drop policy if exists "pc_select" on public.pro_clients;
create policy "pc_select" on public.pro_clients for select
  using (workspace_id in (select public.my_workspace_ids()) or public.is_global_admin());

drop policy if exists "pc_insert" on public.pro_clients;
create policy "pc_insert" on public.pro_clients for insert
  with check (
    workspace_id in (select public.my_workspace_ids())
    and public.my_role(workspace_id) in ('owner', 'operator')
  );

drop policy if exists "pc_update" on public.pro_clients;
create policy "pc_update" on public.pro_clients for update
  using  (workspace_id in (select public.my_workspace_ids()))
  with check (
    workspace_id in (select public.my_workspace_ids())
    and public.my_role(workspace_id) in ('owner', 'operator')
  );

drop policy if exists "pc_delete" on public.pro_clients;
create policy "pc_delete" on public.pro_clients for delete
  using (public.my_role(workspace_id) = 'owner' or public.is_global_admin());


-- ════════════════════════════════════════════════════════════════════
-- 3. ANMA PRO — pro_suppliers
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.pro_suppliers (
  id            uuid        primary key default gen_random_uuid(),
  workspace_id  uuid        not null references public.workspaces(id) on delete cascade,
  name          text        not null,
  contact_name  text,
  phone         text,
  email         text,
  address       text,
  notes         text,
  is_active     boolean     not null default true,
  extra         jsonb       not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_pro_suppliers_workspace
  on public.pro_suppliers (workspace_id);

drop trigger if exists trg_pro_suppliers_updated_at on public.pro_suppliers;
create trigger trg_pro_suppliers_updated_at
  before update on public.pro_suppliers
  for each row execute function public.set_updated_at();

alter table public.pro_suppliers enable row level security;

drop policy if exists "ps_select" on public.pro_suppliers;
create policy "ps_select" on public.pro_suppliers for select
  using (workspace_id in (select public.my_workspace_ids()) or public.is_global_admin());

drop policy if exists "ps_insert" on public.pro_suppliers;
create policy "ps_insert" on public.pro_suppliers for insert
  with check (
    workspace_id in (select public.my_workspace_ids())
    and public.my_role(workspace_id) in ('owner', 'operator')
  );

drop policy if exists "ps_update" on public.pro_suppliers;
create policy "ps_update" on public.pro_suppliers for update
  using  (workspace_id in (select public.my_workspace_ids()))
  with check (
    workspace_id in (select public.my_workspace_ids())
    and public.my_role(workspace_id) in ('owner', 'operator')
  );

drop policy if exists "ps_delete" on public.pro_suppliers;
create policy "ps_delete" on public.pro_suppliers for delete
  using (public.my_role(workspace_id) = 'owner' or public.is_global_admin());


-- ════════════════════════════════════════════════════════════════════
-- 4. ANMA PRO — pro_products (catálogo de productos terminados)
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.pro_products (
  id              uuid          primary key default gen_random_uuid(),
  workspace_id    uuid          not null references public.workspaces(id) on delete cascade,
  name            text          not null,
  category        text,
  unit            text          not null default 'un',
  cost            numeric(12,2) not null default 0,
  price_b2c       numeric(12,2),
  price_b2b       numeric(12,2),
  stock_current   numeric(12,3) not null default 0,
  stock_min       numeric(12,3) not null default 0,
  notes           text,
  is_active       boolean       not null default true,
  extra           jsonb         not null default '{}',
  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now()
);

create index if not exists idx_pro_products_workspace
  on public.pro_products (workspace_id);
create index if not exists idx_pro_products_active
  on public.pro_products (workspace_id, is_active);

drop trigger if exists trg_pro_products_updated_at on public.pro_products;
create trigger trg_pro_products_updated_at
  before update on public.pro_products
  for each row execute function public.set_updated_at();

alter table public.pro_products enable row level security;

drop policy if exists "pp_select" on public.pro_products;
create policy "pp_select" on public.pro_products for select
  using (workspace_id in (select public.my_workspace_ids()) or public.is_global_admin());

drop policy if exists "pp_insert" on public.pro_products;
create policy "pp_insert" on public.pro_products for insert
  with check (
    workspace_id in (select public.my_workspace_ids())
    and public.my_role(workspace_id) in ('owner', 'operator')
  );

drop policy if exists "pp_update" on public.pro_products;
create policy "pp_update" on public.pro_products for update
  using  (workspace_id in (select public.my_workspace_ids()))
  with check (
    workspace_id in (select public.my_workspace_ids())
    and public.my_role(workspace_id) in ('owner', 'operator')
  );

drop policy if exists "pp_delete" on public.pro_products;
create policy "pp_delete" on public.pro_products for delete
  using (public.my_role(workspace_id) = 'owner' or public.is_global_admin());


-- ════════════════════════════════════════════════════════════════════
-- 5. ANMA PRO — pro_insumos
--    supplier_id ON DELETE SET NULL: insumo sobrevive sin proveedor.
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.pro_insumos (
  id              uuid          primary key default gen_random_uuid(),
  workspace_id    uuid          not null references public.workspaces(id) on delete cascade,
  name            text          not null,
  category        text,
  unit            text          not null default 'un',
  cost            numeric(12,2) not null default 0,
  stock_current   numeric(12,3) not null default 0,
  stock_min       numeric(12,3) not null default 0,
  supplier_id     uuid          references public.pro_suppliers(id) on delete set null,
  notes           text,
  is_active       boolean       not null default true,
  extra           jsonb         not null default '{}',
  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now()
);

create index if not exists idx_pro_insumos_workspace
  on public.pro_insumos (workspace_id);
create index if not exists idx_pro_insumos_supplier
  on public.pro_insumos (supplier_id);

drop trigger if exists trg_pro_insumos_updated_at on public.pro_insumos;
create trigger trg_pro_insumos_updated_at
  before update on public.pro_insumos
  for each row execute function public.set_updated_at();

alter table public.pro_insumos enable row level security;

drop policy if exists "pi_select" on public.pro_insumos;
create policy "pi_select" on public.pro_insumos for select
  using (workspace_id in (select public.my_workspace_ids()) or public.is_global_admin());

drop policy if exists "pi_insert" on public.pro_insumos;
create policy "pi_insert" on public.pro_insumos for insert
  with check (
    workspace_id in (select public.my_workspace_ids())
    and public.my_role(workspace_id) in ('owner', 'operator')
  );

drop policy if exists "pi_update" on public.pro_insumos;
create policy "pi_update" on public.pro_insumos for update
  using  (workspace_id in (select public.my_workspace_ids()))
  with check (
    workspace_id in (select public.my_workspace_ids())
    and public.my_role(workspace_id) in ('owner', 'operator')
  );

drop policy if exists "pi_delete" on public.pro_insumos;
create policy "pi_delete" on public.pro_insumos for delete
  using (public.my_role(workspace_id) = 'owner' or public.is_global_admin());


-- ════════════════════════════════════════════════════════════════════
-- 6. ANMA PRO — pro_stock_moves (registro inmutable de movimientos)
--    Sin updated_at: los movimientos no se editan, solo se agregan.
--    Sin FK a pro_products/pro_insumos: el historial de stock debe
--    sobrevivir aunque el ítem original sea eliminado.
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.pro_stock_moves (
  id                uuid          primary key default gen_random_uuid(),
  workspace_id      uuid          not null references public.workspaces(id) on delete cascade,
  item_id           uuid          not null,
  item_type         text          not null check (item_type in ('product', 'insumo')),
  move_type         text          not null check (move_type in ('in','out','adjust','sale','return')),
  qty               numeric(12,3) not null,
  unit_cost_snap    numeric(12,2),           -- snapshot del costo al momento del movimiento
  note              text,
  related_budget_id uuid,                    -- referencia débil (sin FK) al presupuesto origen
  created_at        timestamptz   not null default now()
);

create index if not exists idx_pro_stock_moves_workspace
  on public.pro_stock_moves (workspace_id);
create index if not exists idx_pro_stock_moves_item
  on public.pro_stock_moves (item_id, item_type);
create index if not exists idx_pro_stock_moves_date
  on public.pro_stock_moves (workspace_id, created_at desc);

alter table public.pro_stock_moves enable row level security;

drop policy if exists "psm_select" on public.pro_stock_moves;
create policy "psm_select" on public.pro_stock_moves for select
  using (workspace_id in (select public.my_workspace_ids()) or public.is_global_admin());

drop policy if exists "psm_insert" on public.pro_stock_moves;
create policy "psm_insert" on public.pro_stock_moves for insert
  with check (
    workspace_id in (select public.my_workspace_ids())
    and public.my_role(workspace_id) in ('owner', 'operator')
  );

-- Sin UPDATE policy: movimientos son inmutables por diseño.
drop policy if exists "psm_delete" on public.pro_stock_moves;
create policy "psm_delete" on public.pro_stock_moves for delete
  using (public.my_role(workspace_id) = 'owner' or public.is_global_admin());


-- ════════════════════════════════════════════════════════════════════
-- 7. ANMA PRO — pro_budgets
--    client_id ON DELETE SET NULL: presupuestos históricos se preservan
--    aunque el cliente sea eliminado. Nunca se pierden ventas confirmadas.
--    balance_amount: columna generada, siempre consistente con total.
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.pro_budgets (
  id              uuid          primary key default gen_random_uuid(),
  workspace_id    uuid          not null references public.workspaces(id) on delete cascade,
  client_id       uuid          references public.pro_clients(id) on delete set null,
  budget_number   text          not null,
  status          text          not null default 'draft'
                                check (status in ('draft','sent','confirmed','inprogress','delivered','cancelled')),
  pay_status      text          not null default 'pending'
                                check (pay_status in ('pending','partial','paid')),
  total           numeric(12,2) not null default 0,
  deposit_amount  numeric(12,2) not null default 0,
  balance_amount  numeric(12,2) generated always as (total - deposit_amount) stored,
  delivery_date   date,
  delivery_mode   text,
  notes           text,
  items_data      jsonb         not null default '{}',
  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now()
);

create index if not exists idx_pro_budgets_workspace
  on public.pro_budgets (workspace_id);
create index if not exists idx_pro_budgets_client
  on public.pro_budgets (client_id);
create index if not exists idx_pro_budgets_status
  on public.pro_budgets (workspace_id, status);
create index if not exists idx_pro_budgets_date
  on public.pro_budgets (workspace_id, created_at desc);

drop trigger if exists trg_pro_budgets_updated_at on public.pro_budgets;
create trigger trg_pro_budgets_updated_at
  before update on public.pro_budgets
  for each row execute function public.set_updated_at();

alter table public.pro_budgets enable row level security;

drop policy if exists "pb_select" on public.pro_budgets;
create policy "pb_select" on public.pro_budgets for select
  using (workspace_id in (select public.my_workspace_ids()) or public.is_global_admin());

drop policy if exists "pb_insert" on public.pro_budgets;
create policy "pb_insert" on public.pro_budgets for insert
  with check (
    workspace_id in (select public.my_workspace_ids())
    and public.my_role(workspace_id) in ('owner', 'operator')
  );

drop policy if exists "pb_update" on public.pro_budgets;
create policy "pb_update" on public.pro_budgets for update
  using  (workspace_id in (select public.my_workspace_ids()))
  with check (
    workspace_id in (select public.my_workspace_ids())
    and public.my_role(workspace_id) in ('owner', 'operator')
  );

drop policy if exists "pb_delete" on public.pro_budgets;
create policy "pb_delete" on public.pro_budgets for delete
  using (public.my_role(workspace_id) = 'owner' or public.is_global_admin());


-- ════════════════════════════════════════════════════════════════════
-- 8. ANMA REGALOS — regalos_clients
--    Clientes de ANMA Regalos: empresas que piden regalos corporativos.
--    Separado de pro_clients — contextos y campos distintos.
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.regalos_clients (
  id            uuid        primary key default gen_random_uuid(),
  workspace_id  uuid        not null references public.workspaces(id) on delete cascade,
  company_name  text        not null,
  contact_name  text,
  email         text,
  phone         text,
  address       text,
  notes         text,
  is_active     boolean     not null default true,
  extra         jsonb       not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_regalos_clients_workspace
  on public.regalos_clients (workspace_id);

drop trigger if exists trg_regalos_clients_updated_at on public.regalos_clients;
create trigger trg_regalos_clients_updated_at
  before update on public.regalos_clients
  for each row execute function public.set_updated_at();

alter table public.regalos_clients enable row level security;

drop policy if exists "rc_select" on public.regalos_clients;
create policy "rc_select" on public.regalos_clients for select
  using (workspace_id in (select public.my_workspace_ids()) or public.is_global_admin());

drop policy if exists "rc_insert" on public.regalos_clients;
create policy "rc_insert" on public.regalos_clients for insert
  with check (
    workspace_id in (select public.my_workspace_ids())
    and public.my_role(workspace_id) in ('owner', 'operator')
  );

drop policy if exists "rc_update" on public.regalos_clients;
create policy "rc_update" on public.regalos_clients for update
  using  (workspace_id in (select public.my_workspace_ids()))
  with check (
    workspace_id in (select public.my_workspace_ids())
    and public.my_role(workspace_id) in ('owner', 'operator')
  );

drop policy if exists "rc_delete" on public.regalos_clients;
create policy "rc_delete" on public.regalos_clients for delete
  using (public.my_role(workspace_id) = 'owner' or public.is_global_admin());


-- ════════════════════════════════════════════════════════════════════
-- 9. ANMA REGALOS — regalos_products (catálogo de regalos)
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.regalos_products (
  id            uuid          primary key default gen_random_uuid(),
  workspace_id  uuid          not null references public.workspaces(id) on delete cascade,
  name          text          not null,
  category      text,
  unit          text          not null default 'un',
  cost          numeric(12,2) not null default 0,
  price         numeric(12,2),
  notes         text,
  image_url     text,
  is_active     boolean       not null default true,
  extra         jsonb         not null default '{}',
  created_at    timestamptz   not null default now(),
  updated_at    timestamptz   not null default now()
);

create index if not exists idx_regalos_products_workspace
  on public.regalos_products (workspace_id);
create index if not exists idx_regalos_products_active
  on public.regalos_products (workspace_id, is_active);

drop trigger if exists trg_regalos_products_updated_at on public.regalos_products;
create trigger trg_regalos_products_updated_at
  before update on public.regalos_products
  for each row execute function public.set_updated_at();

alter table public.regalos_products enable row level security;

drop policy if exists "rp_select" on public.regalos_products;
create policy "rp_select" on public.regalos_products for select
  using (workspace_id in (select public.my_workspace_ids()) or public.is_global_admin());

drop policy if exists "rp_insert" on public.regalos_products;
create policy "rp_insert" on public.regalos_products for insert
  with check (
    workspace_id in (select public.my_workspace_ids())
    and public.my_role(workspace_id) in ('owner', 'operator')
  );

drop policy if exists "rp_update" on public.regalos_products;
create policy "rp_update" on public.regalos_products for update
  using  (workspace_id in (select public.my_workspace_ids()))
  with check (
    workspace_id in (select public.my_workspace_ids())
    and public.my_role(workspace_id) in ('owner', 'operator')
  );

drop policy if exists "rp_delete" on public.regalos_products;
create policy "rp_delete" on public.regalos_products for delete
  using (public.my_role(workspace_id) = 'owner' or public.is_global_admin());


-- ════════════════════════════════════════════════════════════════════
-- 10. ANMA REGALOS — regalos_budgets (cotizaciones)
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.regalos_budgets (
  id              uuid          primary key default gen_random_uuid(),
  workspace_id    uuid          not null references public.workspaces(id) on delete cascade,
  client_id       uuid          references public.regalos_clients(id) on delete set null,
  budget_number   text          not null,
  occasion        text,
  status          text          not null default 'draft'
                                check (status in ('draft','sent','confirmed','inprogress','delivered','cancelled')),
  pay_status      text          not null default 'pending'
                                check (pay_status in ('pending','partial','paid')),
  total           numeric(12,2) not null default 0,
  deposit_amount  numeric(12,2) not null default 0,
  balance_amount  numeric(12,2) generated always as (total - deposit_amount) stored,
  delivery_date   date,
  notes           text,
  items_data      jsonb         not null default '{}',
  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now()
);

create index if not exists idx_regalos_budgets_workspace
  on public.regalos_budgets (workspace_id);
create index if not exists idx_regalos_budgets_client
  on public.regalos_budgets (client_id);
create index if not exists idx_regalos_budgets_status
  on public.regalos_budgets (workspace_id, status);
create index if not exists idx_regalos_budgets_date
  on public.regalos_budgets (workspace_id, created_at desc);

drop trigger if exists trg_regalos_budgets_updated_at on public.regalos_budgets;
create trigger trg_regalos_budgets_updated_at
  before update on public.regalos_budgets
  for each row execute function public.set_updated_at();

alter table public.regalos_budgets enable row level security;

drop policy if exists "rb_select" on public.regalos_budgets;
create policy "rb_select" on public.regalos_budgets for select
  using (workspace_id in (select public.my_workspace_ids()) or public.is_global_admin());

drop policy if exists "rb_insert" on public.regalos_budgets;
create policy "rb_insert" on public.regalos_budgets for insert
  with check (
    workspace_id in (select public.my_workspace_ids())
    and public.my_role(workspace_id) in ('owner', 'operator')
  );

drop policy if exists "rb_update" on public.regalos_budgets;
create policy "rb_update" on public.regalos_budgets for update
  using  (workspace_id in (select public.my_workspace_ids()))
  with check (
    workspace_id in (select public.my_workspace_ids())
    and public.my_role(workspace_id) in ('owner', 'operator')
  );

drop policy if exists "rb_delete" on public.regalos_budgets;
create policy "rb_delete" on public.regalos_budgets for delete
  using (public.my_role(workspace_id) = 'owner' or public.is_global_admin());


-- ════════════════════════════════════════════════════════════════════
-- 11. ANMA REGALOS — regalos_assignments (historial inmutable de regalos)
--     Todos los FK son ON DELETE SET NULL + snapshots de texto.
--     Sin updated_at: el historial de asignaciones es inmutable.
-- ════════════════════════════════════════════════════════════════════
create table if not exists public.regalos_assignments (
  id                uuid          primary key default gen_random_uuid(),
  workspace_id      uuid          not null references public.workspaces(id) on delete cascade,
  -- FKs con SET NULL: el historial sobrevive aunque se eliminen cliente/budget/producto
  client_id         uuid          references public.regalos_clients(id)  on delete set null,
  budget_id         uuid          references public.regalos_budgets(id)  on delete set null,
  product_id        uuid          references public.regalos_products(id) on delete set null,
  -- Snapshots: preservan el dato en el momento del evento
  client_name_snap  text,
  product_name_snap text,
  -- Datos del evento de regalo
  qty               integer       not null default 1,
  unit_cost_snap    numeric(12,2),
  occasion          text,
  gifted_at         date          not null default current_date,
  recipient_name    text,
  recipient_email   text,
  notes             text,
  extra             jsonb         not null default '{}',
  created_at        timestamptz   not null default now()
);

create index if not exists idx_regalos_assignments_workspace
  on public.regalos_assignments (workspace_id);
create index if not exists idx_regalos_assignments_client
  on public.regalos_assignments (client_id);
create index if not exists idx_regalos_assignments_product
  on public.regalos_assignments (product_id);
create index if not exists idx_regalos_assignments_date
  on public.regalos_assignments (workspace_id, gifted_at desc);

alter table public.regalos_assignments enable row level security;

drop policy if exists "ra_select" on public.regalos_assignments;
create policy "ra_select" on public.regalos_assignments for select
  using (workspace_id in (select public.my_workspace_ids()) or public.is_global_admin());

drop policy if exists "ra_insert" on public.regalos_assignments;
create policy "ra_insert" on public.regalos_assignments for insert
  with check (
    workspace_id in (select public.my_workspace_ids())
    and public.my_role(workspace_id) in ('owner', 'operator')
  );

-- Sin UPDATE policy: historial de asignaciones es inmutable por diseño.
drop policy if exists "ra_delete" on public.regalos_assignments;
create policy "ra_delete" on public.regalos_assignments for delete
  using (public.my_role(workspace_id) = 'owner' or public.is_global_admin());


-- ═══════════════════════════════════════════════════════════════════
-- FIN MIGRACIÓN 20260523_normalized_schema.sql
-- Tablas creadas: 11
--   business_profiles
--   pro_clients · pro_suppliers · pro_products · pro_insumos
--   pro_stock_moves · pro_budgets
--   regalos_clients · regalos_products · regalos_budgets
--   regalos_assignments
-- ═══════════════════════════════════════════════════════════════════
