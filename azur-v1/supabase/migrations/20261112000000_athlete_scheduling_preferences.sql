-- AZUR V2 scheduling preferences: athlete-owned, separate from prescribed training.
-- Apply to staging only after review; do not apply to production.
create table if not exists public.athlete_scheduling_preferences (
 user_id uuid primary key references auth.users(id) on delete cascade,
 preferences jsonb not null,
 updated_at timestamptz not null default now(),
 constraint preferences_object check (jsonb_typeof(preferences) = 'object')
);
alter table public.athlete_scheduling_preferences enable row level security;
revoke all on public.athlete_scheduling_preferences from anon;
grant select,insert,update on public.athlete_scheduling_preferences to authenticated;
drop policy if exists athlete_schedule_read_own on public.athlete_scheduling_preferences;
create policy athlete_schedule_read_own on public.athlete_scheduling_preferences
 for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists athlete_schedule_insert_own on public.athlete_scheduling_preferences;
create policy athlete_schedule_insert_own on public.athlete_scheduling_preferences
 for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists athlete_schedule_update_own on public.athlete_scheduling_preferences;
create policy athlete_schedule_update_own on public.athlete_scheduling_preferences
 for update to authenticated using ((select auth.uid()) = user_id)
 with check ((select auth.uid()) = user_id);
