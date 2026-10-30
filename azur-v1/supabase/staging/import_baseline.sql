-- STAGING ONLY: minimal production-compatible import tables, not a whole-app clone.
-- The explicit project guard and empty-schema checks prevent use on the live app.
DO $$ BEGIN
 if current_setting('azur.staging_project_ref',true) is distinct from 'juvceqrzkeethontnezw' then
  raise exception 'Set the verified AZUR Staging project reference before bootstrap';
 end if;
 if to_regclass('public.athlete_profile') is not null or to_regclass('public.completed_activity') is not null then
  raise exception 'Staging baseline requires empty import tables';
 end if;
END $$;
create type public.sport_type as enum ('swim','bike','run');
create type public.session_status as enum ('planned','edited','completed','missed','cancelled');
create table public.athlete_profile(
 id uuid primary key default gen_random_uuid(),display_name text not null,ftp_w integer,
 run_threshold_sec_per_km integer,swim_threshold_sec_per_100m integer,
 weight_kg numeric(5,2),target_weight_kg numeric(5,2),normal_weekly_hours numeric(4,1),peak_weekly_hours numeric(4,1),
 timezone text not null default 'Europe/London',created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 user_id uuid references auth.users(id) on delete cascade,avatar_url text
);
create table public.season_week(
 id uuid primary key default gen_random_uuid(),athlete_id uuid not null references public.athlete_profile(id) on delete cascade,
 week_start date not null,phase text not null,race_focus_id uuid,target_hours numeric(4,1) not null,
 benchmark_week boolean not null default false,locked boolean not null default false,master_version integer not null default 1,
 created_at timestamptz not null default now(),unique(athlete_id,week_start)
);
-- race_focus_id is intentionally unbound: race planning is outside this import test environment.
create table public.planned_session(
 id uuid primary key default gen_random_uuid(),season_week_id uuid not null references public.season_week(id) on delete cascade,
 athlete_id uuid not null references public.athlete_profile(id) on delete cascade,planned_date date not null,
 sport public.sport_type not null,title text not null,session_class text not null,priority integer not null default 3 check(priority between 1 and 3),
 duration_min integer not null,targets jsonb not null default '{}'::jsonb,prescription jsonb not null default '{}'::jsonb,
 rationale text,terrain text,status public.session_status not null default 'planned',locked boolean not null default false,
 parent_session_id uuid references public.planned_session(id) on delete set null,version integer not null default 1,
 is_active_version boolean not null default true,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table public.completed_activity(
 id uuid primary key default gen_random_uuid(),athlete_id uuid not null references public.athlete_profile(id) on delete cascade,
 planned_session_id uuid references public.planned_session(id) on delete set null,sport public.sport_type not null,
 source text not null,source_activity_id text,start_time timestamptz not null,duration_sec integer not null,distance_m numeric(12,2),
 raw_payload jsonb not null default '{}'::jsonb,processed_metrics jsonb not null default '{}'::jsonb,
 match_confidence numeric(5,2),duplicate_group_key text,notes text,session_rpe numeric(3,1),created_at timestamptz not null default now(),
 unique(source,source_activity_id)
);
create table public.athlete_integration(
 id uuid primary key default gen_random_uuid(),athlete_id uuid not null references public.athlete_profile(id) on delete cascade,
 provider text not null,provider_athlete_id text,access_token text,refresh_token text,token_expires_at timestamptz,scopes text,
 connected_at timestamptz not null default now(),last_sync_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(athlete_id,provider)
);
alter table public.athlete_profile enable row level security;
alter table public.season_week enable row level security;
alter table public.planned_session enable row level security;
alter table public.completed_activity enable row level security;
alter table public.athlete_integration enable row level security;
revoke all on public.athlete_profile,public.season_week,public.planned_session,public.completed_activity,public.athlete_integration from public,anon,authenticated;
grant select,insert,update,delete on public.athlete_profile,public.season_week,public.planned_session,public.completed_activity to authenticated;
grant select,insert,update,delete on public.athlete_profile,public.season_week,public.planned_session,public.completed_activity,public.athlete_integration to service_role;
create policy staging_own_profile_select on public.athlete_profile for select to authenticated using(user_id=(select auth.uid()));
create policy staging_own_profile_insert on public.athlete_profile for insert to authenticated with check(user_id=(select auth.uid()));
create policy staging_own_profile_update on public.athlete_profile for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
DO $$ declare target text; begin
 foreach target in array array['season_week','planned_session','completed_activity'] loop
  execute format('create policy staging_own_select on public.%I for select to authenticated using(exists(select 1 from public.athlete_profile p where p.id=athlete_id and p.user_id=(select auth.uid())))',target);
  execute format('create policy staging_own_insert on public.%I for insert to authenticated with check(exists(select 1 from public.athlete_profile p where p.id=athlete_id and p.user_id=(select auth.uid())))',target);
  execute format('create policy staging_own_update on public.%I for update to authenticated using(exists(select 1 from public.athlete_profile p where p.id=athlete_id and p.user_id=(select auth.uid()))) with check(exists(select 1 from public.athlete_profile p where p.id=athlete_id and p.user_id=(select auth.uid())))',target);
 end loop;
end $$;
create index staging_profile_user_idx on public.athlete_profile(user_id);
create index staging_season_athlete_idx on public.season_week(athlete_id);
create index staging_plan_athlete_idx on public.planned_session(athlete_id);
create index staging_plan_week_idx on public.planned_session(season_week_id);
create index staging_plan_parent_idx on public.planned_session(parent_session_id);
create index staging_activity_athlete_idx on public.completed_activity(athlete_id);
create index staging_activity_plan_idx on public.completed_activity(planned_session_id);
-- The integration unique index already starts with athlete_id.
