-- Staging-only parity for existing AZUR coach and athlete queries.
create table if not exists public.athlete_training_baseline (
 athlete_id uuid primary key references public.athlete_profile(id) on delete cascade,
 weekly_hours numeric not null check(weekly_hours>=0),
 sessions_per_week integer not null check(sessions_per_week>=0),
 swims_per_week integer not null check(swims_per_week>=0),
 longest_ride_minutes integer not null check(longest_ride_minutes>=0),
 longest_run_minutes integer not null check(longest_run_minutes>=0),
 confirmed_at timestamptz not null default now(),
 max_weekly_hours numeric check(max_weekly_hours>=0),
 strongest_sport text,
 development_sport text
);
create table if not exists public.training_priority_review (
 id uuid primary key default gen_random_uuid(),
 athlete_id uuid not null references public.athlete_profile(id) on delete cascade,
 reason text not null default 'priority_conflict',
 current_priority text not null,
 suggested_priority text not null,
 rationale text not null,
 confidence text not null default 'clear',
 status text not null default 'pending',
 created_at timestamptz not null default now(),
 reviewed_at timestamptz,
 reviewed_by uuid,
 review_note text
);
create table if not exists public.coach_monitoring_review (
 coach_user_id uuid not null,
 athlete_id uuid not null references public.athlete_profile(id) on delete cascade,
 item_key text not null,
 reviewed_at timestamptz not null default now(),
 primary key(coach_user_id,athlete_id,item_key)
);
alter table public.athlete_training_baseline enable row level security;
alter table public.training_priority_review enable row level security;
alter table public.coach_monitoring_review enable row level security;
grant select,insert,update on public.athlete_training_baseline to authenticated;
grant select on public.training_priority_review to authenticated;
grant select,insert on public.coach_monitoring_review to authenticated;
create policy "staging_baseline_own_select" on public.athlete_training_baseline for select to authenticated using (
 exists(select 1 from public.athlete_profile a where a.id=athlete_id and a.user_id=(select auth.uid()))
 or ((select auth.jwt()->'app_metadata'->>'role')='coach' and exists(select 1 from public.coach_athlete_assignment ca where ca.athlete_id=athlete_id and ca.coach_user_id=(select auth.uid())))
);
create policy "staging_baseline_own_insert" on public.athlete_training_baseline for insert to authenticated with check (
 exists(select 1 from public.athlete_profile a where a.id=athlete_id and a.user_id=(select auth.uid()))
);
create policy "staging_baseline_own_update" on public.athlete_training_baseline for update to authenticated
 using (exists(select 1 from public.athlete_profile a where a.id=athlete_id and a.user_id=(select auth.uid())))
 with check (exists(select 1 from public.athlete_profile a where a.id=athlete_id and a.user_id=(select auth.uid())));
create policy "staging_assigned_coach_priority_read" on public.training_priority_review for select to authenticated using (
 (select auth.jwt()->'app_metadata'->>'role')='coach' and exists(select 1 from public.coach_athlete_assignment ca where ca.athlete_id=training_priority_review.athlete_id and ca.coach_user_id=(select auth.uid()))
);
create policy "staging_coach_monitoring_read" on public.coach_monitoring_review for select to authenticated using (
 coach_user_id=(select auth.uid()) and (select auth.jwt()->'app_metadata'->>'role')='coach'
 and exists(select 1 from public.coach_athlete_assignment ca where ca.athlete_id=coach_monitoring_review.athlete_id and ca.coach_user_id=(select auth.uid()))
);
create policy "staging_coach_monitoring_insert" on public.coach_monitoring_review for insert to authenticated with check (
 coach_user_id=(select auth.uid()) and (select auth.jwt()->'app_metadata'->>'role')='coach'
 and exists(select 1 from public.coach_athlete_assignment ca where ca.athlete_id=coach_monitoring_review.athlete_id and ca.coach_user_id=(select auth.uid()))
);
