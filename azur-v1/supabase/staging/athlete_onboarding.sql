-- Isolated staging onboarding support.
DO $$ BEGIN
 if current_setting('azur.staging_project_ref',true) is distinct from 'juvceqrzkeethontnezw' then
  raise exception 'Verified staging project required';
 end if;
END $$;
create table public.athlete_onboarding(
 user_id uuid primary key references auth.users(id) on delete cascade,
 race_distance text not null default '70.3' check(race_distance in ('sprint','olympic','70.3','ironman','other')),
 race_date date,
 experience text not null default 'first',
 weekly_hours numeric not null default 8 check(weekly_hours between 2 and 25),
 device text not null default 'none' check(device in ('garmin','coros','polar','apple','other','none')),
 onboarding_step integer not null default 0 check(onboarding_step between 0 and 3),
 updated_at timestamptz not null default now()
);
alter table public.athlete_onboarding enable row level security;
revoke all on public.athlete_onboarding from public,anon,authenticated;
grant select,insert,update on public.athlete_onboarding to authenticated;
grant all on public.athlete_onboarding to service_role;
create policy staging_own_setup_read on public.athlete_onboarding for select to authenticated using(user_id=(select auth.uid()));
create policy staging_own_setup_insert on public.athlete_onboarding for insert to authenticated with check(user_id=(select auth.uid()));
create policy staging_own_setup_update on public.athlete_onboarding for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
