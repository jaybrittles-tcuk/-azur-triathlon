-- Executed ONLY against disposable PostgreSQL in CI.
create schema if not exists auth;
create role authenticated nologin;
create role anon nologin;
create role service_role nologin bypassrls;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create schema if not exists public;
create table public.athlete_profile(id uuid primary key, user_id uuid, display_name text not null, ftp_w integer);
create type public.sport_type as enum ('swim','bike','run');
create table public.completed_activity(
 id uuid primary key default gen_random_uuid(),
 athlete_id uuid not null references public.athlete_profile(id),
 sport public.sport_type not null,
 planned_session_id uuid,
 raw_payload jsonb not null default '{}'::jsonb,
 processed_metrics jsonb not null default '{}'::jsonb,
 duplicate_group_key text,
 source text not null,source_activity_id text,
 start_time timestamptz not null,duration_sec integer not null,distance_m numeric,
 unique(source,source_activity_id)
);
insert into public.athlete_profile(id,user_id,display_name) values
('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000011','Synthetic A'),
('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000022','Synthetic B');

-- Match the live athlete-owned completed-activity write model for permission tests.
alter table public.completed_activity enable row level security;
grant select,insert,update,delete on public.completed_activity to authenticated;
create policy "Athletes can view own completed activities" on public.completed_activity
 for select to authenticated using (exists(select 1 from public.athlete_profile p where p.id=athlete_id and p.user_id=(select auth.uid())));
create policy "Athletes can create own completed activities" on public.completed_activity
 for insert to authenticated with check (exists(select 1 from public.athlete_profile p where p.id=athlete_id and p.user_id=(select auth.uid())));
create policy "Athletes can update own completed activities" on public.completed_activity
 for update to authenticated
 using (exists(select 1 from public.athlete_profile p where p.id=athlete_id and p.user_id=(select auth.uid())))
 with check (exists(select 1 from public.athlete_profile p where p.id=athlete_id and p.user_id=(select auth.uid())));
