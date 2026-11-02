-- Disposable PostgreSQL 17 fixture. Never run against an AZUR athlete database.
create schema if not exists auth;
do $$begin create role authenticated nologin; exception when duplicate_object then null; end$$;
do $$begin create role anon nologin; exception when duplicate_object then null; end$$;
do $$begin create role service_role nologin; exception when duplicate_object then null; end$$;
create table auth.users(id uuid primary key, raw_app_meta_data jsonb not null default '{}'::jsonb);
create type public.sport_type as enum ('swim','bike','run');
create type public.session_status as enum ('planned','completed','cancelled');
create table public.athlete_profile(id uuid primary key, user_id uuid,normal_weekly_hours numeric);
create table public.coach_athlete_assignment(coach_user_id uuid not null, athlete_id uuid not null, primary key(coach_user_id,athlete_id));
create table public.season_week(id uuid primary key default gen_random_uuid(),athlete_id uuid not null,week_start date not null,phase text not null,target_hours numeric not null,locked boolean not null default false);
create table public.planned_session(
 id uuid primary key default gen_random_uuid(),
 season_week_id uuid not null,athlete_id uuid not null,planned_date date not null,
 sport public.sport_type not null,title text not null,session_class text not null,
 priority integer not null,duration_min integer not null,targets jsonb not null,
 prescription jsonb not null,rationale text,terrain text,
 status public.session_status not null,locked boolean not null default false,
 version integer not null,is_active_version boolean not null default true
);
create table public.weekly_plan_draft(
 id uuid primary key default gen_random_uuid(),
 athlete_id uuid not null,week_start date not null,revision integer not null,phase text not null,
 sessions jsonb not null, proposal_fingerprint text not null,created_by uuid not null,
 created_at timestamptz not null default now(),unique(athlete_id,week_start,revision)
);
create table public.weekly_plan_decision(
 id uuid primary key default gen_random_uuid(),draft_id uuid not null references public.weekly_plan_draft(id),
 coach_user_id uuid not null,decision text not null,reason text,
 decided_at timestamptz not null default now()
);
-- Stub of the legacy signature: it must be revoked by the verified gate.
create function public.publish_approved_training_week(uuid,date,jsonb,text)
returns jsonb language sql as 'select ''{}''::jsonb';
