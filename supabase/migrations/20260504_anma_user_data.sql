-- ═══════════════════════════════════════════════════════════════════
-- ANMA — anma_user_data: cloud sync table for all business data
-- One JSON-blob row per workspace per site (anma-regalos / anma-pro).
-- Safe to re-run (IF NOT EXISTS + DROP POLICY IF EXISTS).
--
-- Requires the Phase-2 migration (20260424_workspaces_rbac.sql) to be
-- applied first so that my_workspace_ids() and is_global_admin() exist.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.anma_user_data (
  user_id     uuid          not null,
  site_key    text          not null,
  data        jsonb         not null default '{}',
  updated_at  timestamptz   not null default now(),
  constraint  anma_user_data_pkey primary key (user_id, site_key),
  constraint  anma_user_data_uid_fk
    foreign key (user_id) references auth.users(id) on delete cascade
);

-- Index for fast lookups by workspace
create index if not exists anma_user_data_uid_idx
  on public.anma_user_data (user_id);

-- Enable RLS
alter table public.anma_user_data enable row level security;

-- Drop any legacy / stale policies before creating canonical ones
drop policy if exists "aud_select"     on public.anma_user_data;
drop policy if exists "aud_insert"     on public.anma_user_data;
drop policy if exists "aud_update"     on public.anma_user_data;
drop policy if exists "aud_upsert"     on public.anma_user_data;
drop policy if exists "aud_select_own" on public.anma_user_data;
drop policy if exists "aud_insert_own" on public.anma_user_data;
drop policy if exists "aud_update_own" on public.anma_user_data;

-- ── SELECT: workspace members + global admin ─────────────────────
create policy "aud_select" on public.anma_user_data for select
  using (
    user_id in (select public.my_workspace_ids())
    or public.is_global_admin()
  );

-- ── INSERT: non-viewer workspace members only ─────────────────────
create policy "aud_insert" on public.anma_user_data for insert
  with check (
    user_id in (select public.my_workspace_ids())
  );

-- ── UPDATE: non-viewer workspace members only ─────────────────────
create policy "aud_update" on public.anma_user_data for update
  using  (user_id in (select public.my_workspace_ids()))
  with check (user_id in (select public.my_workspace_ids()));

-- ═══════════════════════════════════════════════════════════════════
-- DONE.
-- Run this in the Supabase SQL Editor.
-- All existing users will get a cloud row the first time they save data
-- (the write-hook in sync.js fires on every dbW call).
-- On first PWA install, pullFromCloud detects no cloud row and
-- immediately pushes all localStorage data — zero data loss.
-- ═══════════════════════════════════════════════════════════════════
