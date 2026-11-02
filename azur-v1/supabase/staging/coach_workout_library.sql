create table if not exists public.coach_workout_library (
 id uuid primary key default gen_random_uuid(),
 workout_key text not null unique,
 title text not null,
 sport text not null check (sport in ('swim','bike','run')),
 family text not null check (family in ('aerobic_endurance','threshold','vo2max','strength_endurance','race_specific','recovery','technique')),
 duration_min integer not null check (duration_min between 10 and 360),
 level integer not null check (level between 1 and 3),
 phases text[] not null check (cardinality(phases)>0),
 prescription jsonb not null check (jsonb_typeof(prescription)='object' and prescription <> '{}'::jsonb),
 approved boolean not null default false,
 reviewed_by uuid references auth.users(id),
 reviewed_at timestamptz,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 constraint approval_record_complete check ((approved=false and reviewed_by is null and reviewed_at is null) or (approved=true and reviewed_by is not null and reviewed_at is not null)),
 constraint valid_phases check (phases <@ array['base','build','peak','taper','recovery']::text[])
);
alter table public.coach_workout_library enable row level security;
revoke all on public.coach_workout_library from anon;
grant select,insert,update on public.coach_workout_library to authenticated;
create policy "coach read library" on public.coach_workout_library for select to authenticated using ((select auth.jwt())->'app_metadata'->>'role'='coach');
create policy "coach add unapproved workouts" on public.coach_workout_library for insert to authenticated with check ((select auth.jwt())->'app_metadata'->>'role'='coach' and created_by=(select auth.uid()) and approved=false and reviewed_by is null and reviewed_at is null);
create policy "coach edit own draft or approve" on public.coach_workout_library for update to authenticated using ((select auth.jwt())->'app_metadata'->>'role'='coach' and (created_by=(select auth.uid())) and approved=false) with check ((select auth.jwt())->'app_metadata'->>'role'='coach' and created_by=(select auth.uid()) and (approved=false or (reviewed_by=(select auth.uid()) and reviewed_at is not null)));
