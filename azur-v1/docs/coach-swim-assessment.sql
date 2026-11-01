create table if not exists public.coach_swim_assessment (
 id uuid primary key default gen_random_uuid(),
 athlete_id uuid not null references public.athlete_profile(id) on delete cascade,
 coach_user_id uuid not null references auth.users(id),
 focus text not null check (focus in ('body_position','catch','rotation','breathing','kick','sighting')),
 notes text not null default '' check(length(notes)<=800),
 assessed_at timestamptz not null default now(),
 status text not null default 'active' check(status in ('active','superseded'))
);
create index if not exists coach_swim_assessment_recent_idx on public.coach_swim_assessment(athlete_id,assessed_at desc);
alter table public.coach_swim_assessment enable row level security;
revoke all on public.coach_swim_assessment from public,anon,authenticated;
grant select,insert on public.coach_swim_assessment to authenticated;
grant all on public.coach_swim_assessment to service_role;
create policy coach_swim_assessment_read on public.coach_swim_assessment for select to authenticated
 using (exists(select 1 from public.coach_athlete_assignment a where a.athlete_id=coach_swim_assessment.athlete_id and a.coach_user_id=(select auth.uid())));
create policy coach_swim_assessment_insert on public.coach_swim_assessment for insert to authenticated
 with check (coach_user_id=(select auth.uid()) and (select auth.jwt()->'app_metadata'->>'role')='coach' and
 exists(select 1 from public.coach_athlete_assignment a where a.athlete_id=coach_swim_assessment.athlete_id and a.coach_user_id=(select auth.uid())));
