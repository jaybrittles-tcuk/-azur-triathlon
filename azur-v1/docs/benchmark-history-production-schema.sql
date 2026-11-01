-- Applied to production through Supabase migration tool: athlete_benchmark_history_v1
-- Additive schema. Mirrors isolated staging table. Never reapply manually on a database
-- where the migration has already been installed.
create table public.athlete_benchmark_history(
 id uuid primary key default gen_random_uuid(),
 athlete_id uuid not null references public.athlete_profile(id) on delete cascade,
 metric text not null check(metric in ('bike_ftp_w','run_threshold_sec_km','swim_css_sec_100m')),
 value numeric not null check(value > 0 and value < 10000),
 assessed_on date not null,
 source text not null check(source in ('structured_test','race','device_estimate','coach_assessed','manual_other')),
 source_note text,
 recorded_at timestamptz not null default now(),
 constraint benchmark_metric_bounds check(
  (metric='bike_ftp_w' and value between 30 and 1500) or
  (metric='run_threshold_sec_km' and value between 90 and 1800) or
  (metric='swim_css_sec_100m' and value between 30 and 900)
 )
);
create index benchmark_athlete_metric_date_idx on public.athlete_benchmark_history(athlete_id,metric,assessed_on desc);
alter table public.athlete_benchmark_history enable row level security;
revoke all on public.athlete_benchmark_history from public,anon,authenticated;
grant select,insert on public.athlete_benchmark_history to authenticated;
grant all on public.athlete_benchmark_history to service_role;
create policy athlete_benchmark_own_select on public.athlete_benchmark_history for select to authenticated using(
 exists(select 1 from public.athlete_profile p where p.id=athlete_id and p.user_id=(select auth.uid()))
);
create policy athlete_benchmark_own_insert on public.athlete_benchmark_history for insert to authenticated with check(
 exists(select 1 from public.athlete_profile p where p.id=athlete_id and p.user_id=(select auth.uid()))
 and assessed_on<=current_date
);
