-- Executed ONLY against disposable PostgreSQL in CI.
create schema if not exists auth;
create role authenticated nologin;
create role anon nologin;
create role service_role nologin bypassrls;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create schema if not exists public;
create table public.athlete_profile(id uuid primary key, user_id uuid not null, ftp_w numeric);
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
insert into public.athlete_profile(id,user_id) values
('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000011'),
('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000022');
