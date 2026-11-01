-- Staging-only prerequisite for weekly coach reviews.
create table if not exists public.coach_athlete_assignment(
 coach_user_id uuid not null references auth.users(id) on delete cascade,
 athlete_id uuid not null references public.athlete_profile(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(coach_user_id,athlete_id)
);
alter table public.coach_athlete_assignment enable row level security;
revoke all on public.coach_athlete_assignment from authenticated,anon,public;
grant select on public.coach_athlete_assignment to authenticated;
grant all on public.coach_athlete_assignment to service_role;
create policy "Coaches see own assignments"
 on public.coach_athlete_assignment for select to authenticated
 using(coach_user_id=(select auth.uid()));
-- Apply on staging only if assignment table/policy do not yet exist.
-- Never copy production athlete/assignment rows into staging.
