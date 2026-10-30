-- STAGING ONLY: install the single-use OAuth state store for the isolated project.
DO $$ BEGIN
 if current_setting('azur.staging_project_ref',true) is distinct from 'juvceqrzkeethontnezw' then
  raise exception 'Set the verified AZUR Staging project reference before installing OAuth';
 end if;
END $$;
create table public.intervals_oauth_state (
 state text primary key,
 athlete_id uuid not null references public.athlete_profile(id) on delete cascade,
 code_verifier text not null,
 expires_at timestamptz not null,
 created_at timestamptz not null default now()
);
alter table public.intervals_oauth_state enable row level security;
revoke all on public.intervals_oauth_state from public,anon,authenticated;
grant select,insert,delete on public.intervals_oauth_state to service_role;
create index intervals_oauth_state_athlete_idx on public.intervals_oauth_state(athlete_id);
