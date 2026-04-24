-- ═══════════════════════════════════════════════════════════════════
-- ANMA — RBAC Phase 2 — Workspaces + Memberships + Audit + RLS
-- Apply in Supabase SQL Editor (single transaction).
-- Safe to re-run: uses IF NOT EXISTS + drop-policy-if-exists + casts.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Tables ──────────────────────────────────────────────────────

create table if not exists public.workspaces (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  plan text not null default 'solo' check (plan in ('solo','equipo','pro','unlimited')),
  seats_allowed int not null default 0,
  status text not null default 'active' check (status in ('active','paused','cancelled')),
  created_at timestamptz not null default now()
);

create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','operator','viewer')),
  status text not null default 'active' check (status in ('active','invited','revoked')),
  invited_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create index if not exists memberships_user_idx on public.memberships(user_id);
create index if not exists memberships_ws_idx on public.memberships(workspace_id);

create table if not exists public.audit_log (
  id bigserial primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_user_id uuid references auth.users(id),
  actor_email text,
  action text not null,
  entity text not null,
  entity_id text,
  meta jsonb,
  ts timestamptz not null default now()
);

create index if not exists audit_ws_ts_idx on public.audit_log(workspace_id, ts desc);

-- ── 2. Helper functions (all return uuid-typed values) ─────────────

create or replace function public.my_workspace_ids()
returns setof uuid
language sql stable security definer
set search_path = public
as $$
  select workspace_id from public.memberships
  where user_id = auth.uid() and status = 'active'
$$;

-- Same list but as text, used to compare against text-typed columns
-- (e.g. anma_user_data.user_id is stored as text in some schemas).
create or replace function public.my_workspace_ids_text()
returns setof text
language sql stable security definer
set search_path = public
as $$
  select workspace_id::text from public.memberships
  where user_id = auth.uid() and status = 'active'
$$;

create or replace function public.is_global_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((auth.jwt() ->> 'email') = 'ana.mbperalta@gmail.com', false)
$$;

create or replace function public.my_role(ws_id uuid)
returns text
language sql stable security definer
set search_path = public
as $$
  select role from public.memberships
  where user_id = auth.uid() and workspace_id = ws_id and status = 'active'
  limit 1
$$;

-- ── 3. Auto-create workspace + owner membership on first login ─────

create or replace function public.ensure_workspace_for_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_invited_ws uuid;
  v_role text;
  v_invited_by uuid;
begin
  v_invited_ws := nullif(new.raw_user_meta_data ->> 'invited_to_workspace', '')::uuid;
  v_role := coalesce(nullif(new.raw_user_meta_data ->> 'role', ''), 'operator');
  v_invited_by := nullif(new.raw_user_meta_data ->> 'invited_by_user', '')::uuid;

  if v_invited_ws is not null then
    insert into public.memberships (workspace_id, user_id, role, status, invited_by)
    values (v_invited_ws, new.id, v_role, 'active', v_invited_by)
    on conflict (workspace_id, user_id) do nothing;
  else
    insert into public.workspaces (id, name, plan, seats_allowed)
    values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email), 'solo', 0)
    on conflict (id) do nothing;

    insert into public.memberships (workspace_id, user_id, role, status)
    values (new.id, new.id, 'owner', 'active')
    on conflict (workspace_id, user_id) do nothing;
  end if;

  return new;
end
$$;

drop trigger if exists on_auth_user_created_ws on auth.users;
create trigger on_auth_user_created_ws
  after insert on auth.users
  for each row execute function public.ensure_workspace_for_new_user();

-- Backfill for existing users.
insert into public.workspaces (id, name, plan, seats_allowed)
select u.id, coalesce(u.raw_user_meta_data ->> 'full_name', u.email), 'solo', 0
from auth.users u
where not exists (select 1 from public.workspaces w where w.id = u.id)
on conflict (id) do nothing;

insert into public.memberships (workspace_id, user_id, role, status)
select u.id, u.id, 'owner', 'active'
from auth.users u
where not exists (
  select 1 from public.memberships m
  where m.workspace_id = u.id and m.user_id = u.id
)
on conflict (workspace_id, user_id) do nothing;

-- ── 4. RLS — workspaces ────────────────────────────────────────────

alter table public.workspaces enable row level security;

drop policy if exists "ws_select_members" on public.workspaces;
create policy "ws_select_members" on public.workspaces for select
  using (id in (select public.my_workspace_ids()) or public.is_global_admin());

drop policy if exists "ws_update_owner" on public.workspaces;
create policy "ws_update_owner" on public.workspaces for update
  using (id = auth.uid() or public.is_global_admin())
  with check (id = auth.uid() or public.is_global_admin());

-- ── 5. RLS — memberships ───────────────────────────────────────────

alter table public.memberships enable row level security;

drop policy if exists "mem_select_workspace" on public.memberships;
create policy "mem_select_workspace" on public.memberships for select
  using (
    workspace_id in (select public.my_workspace_ids())
    or public.is_global_admin()
  );

drop policy if exists "mem_insert_owner" on public.memberships;
create policy "mem_insert_owner" on public.memberships for insert
  with check (
    public.my_role(workspace_id) = 'owner'
    or public.is_global_admin()
  );

drop policy if exists "mem_update_owner" on public.memberships;
create policy "mem_update_owner" on public.memberships for update
  using (
    public.my_role(workspace_id) = 'owner'
    or public.is_global_admin()
  );

drop policy if exists "mem_delete_owner" on public.memberships;
create policy "mem_delete_owner" on public.memberships for delete
  using (
    public.my_role(workspace_id) = 'owner'
    or public.is_global_admin()
  );

-- ── 6. RLS — audit_log ─────────────────────────────────────────────

alter table public.audit_log enable row level security;

drop policy if exists "audit_select_owner" on public.audit_log;
create policy "audit_select_owner" on public.audit_log for select
  using (
    public.my_role(workspace_id) = 'owner'
    or public.is_global_admin()
  );

drop policy if exists "audit_insert_member" on public.audit_log;
create policy "audit_insert_member" on public.audit_log for insert
  with check (
    workspace_id in (select public.my_workspace_ids())
  );

-- ── 7. anma_user_data — RLS type-safe rewrite ──────────────────────
-- anma_user_data.user_id may be stored as text (legacy) or uuid.
-- We use the _text variant of the helper for safe comparison regardless.

do $$
declare
  uid_type text;
begin
  select data_type into uid_type
  from information_schema.columns
  where table_schema='public' and table_name='anma_user_data' and column_name='user_id';

  if uid_type is null then
    raise notice 'anma_user_data table does not exist yet — skipping RLS rewrite';
    return;
  end if;

  execute 'alter table public.anma_user_data enable row level security';

  -- Drop any legacy policies before creating new ones.
  execute 'drop policy if exists "aud_select_own" on public.anma_user_data';
  execute 'drop policy if exists "aud_insert_own" on public.anma_user_data';
  execute 'drop policy if exists "aud_update_own" on public.anma_user_data';
  execute 'drop policy if exists "aud_select" on public.anma_user_data';
  execute 'drop policy if exists "aud_insert" on public.anma_user_data';
  execute 'drop policy if exists "aud_update" on public.anma_user_data';
  execute 'drop policy if exists "aud_upsert" on public.anma_user_data';

  if uid_type = 'uuid' then
    execute $p$
      create policy "aud_select" on public.anma_user_data for select
        using (user_id in (select public.my_workspace_ids()) or public.is_global_admin())
    $p$;
    execute $p$
      create policy "aud_insert" on public.anma_user_data for insert
        with check (user_id in (select public.my_workspace_ids()))
    $p$;
    execute $p$
      create policy "aud_update" on public.anma_user_data for update
        using (user_id in (select public.my_workspace_ids()))
        with check (user_id in (select public.my_workspace_ids()))
    $p$;
  else
    -- text / varchar comparison
    execute $p$
      create policy "aud_select" on public.anma_user_data for select
        using (user_id in (select public.my_workspace_ids_text()) or public.is_global_admin())
    $p$;
    execute $p$
      create policy "aud_insert" on public.anma_user_data for insert
        with check (user_id in (select public.my_workspace_ids_text()))
    $p$;
    execute $p$
      create policy "aud_update" on public.anma_user_data for update
        using (user_id in (select public.my_workspace_ids_text()))
        with check (user_id in (select public.my_workspace_ids_text()))
    $p$;
  end if;
end $$;

-- ── 8. Seat limit helpers ──────────────────────────────────────────

create or replace function public.seats_used(ws_id uuid)
returns int
language sql stable security definer
set search_path = public
as $$
  select count(*)::int from public.memberships
  where workspace_id = ws_id
    and role <> 'owner'
    and status in ('active','invited')
$$;

create or replace function public.seats_available(ws_id uuid)
returns int
language sql stable security definer
set search_path = public
as $$
  select greatest(0, coalesce((select seats_allowed from public.workspaces where id = ws_id), 0) - public.seats_used(ws_id))
$$;

-- ═══════════════════════════════════════════════════════════════════
-- DONE. Next steps:
--   1. (Optional) set initial seats for owners:
--      update public.workspaces set plan='pro', seats_allowed=5
--      where id = (select id from auth.users where lower(email)='owner@example.com');
--   2. Deploy updated invite-user Edge Function.
--   3. Deploy updated sync.js.
-- ═══════════════════════════════════════════════════════════════════
