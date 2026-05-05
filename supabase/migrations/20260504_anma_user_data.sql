-- ═══════════════════════════════════════════════════════════════════
-- ANMA — anma_user_data RLS policies
-- La tabla ya existe con user_id text. Solo configuramos RLS.
-- Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

alter table public.anma_user_data enable row level security;

drop policy if exists "aud_select"     on public.anma_user_data;
drop policy if exists "aud_insert"     on public.anma_user_data;
drop policy if exists "aud_update"     on public.anma_user_data;
drop policy if exists "aud_upsert"     on public.anma_user_data;
drop policy if exists "aud_select_own" on public.anma_user_data;
drop policy if exists "aud_insert_own" on public.anma_user_data;
drop policy if exists "aud_update_own" on public.anma_user_data;

create policy "aud_select" on public.anma_user_data for select
  using (
    user_id::text in (select public.my_workspace_ids_text())
    or public.is_global_admin()
  );

create policy "aud_insert" on public.anma_user_data for insert
  with check (
    user_id::text in (select public.my_workspace_ids_text())
  );

create policy "aud_update" on public.anma_user_data for update
  using  (user_id::text in (select public.my_workspace_ids_text()))
  with check (user_id::text in (select public.my_workspace_ids_text()));
