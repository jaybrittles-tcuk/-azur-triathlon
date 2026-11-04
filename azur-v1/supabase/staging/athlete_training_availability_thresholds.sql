-- Staging-only onboarding readiness for two-week aerobic foundation.
alter table public.athlete_onboarding
  add column if not exists training_days integer[] not null default '{}'::integer[],
  add column if not exists ftp_watts integer,
  add column if not exists swim_css_seconds_per_100m integer,
  add column if not exists run_threshold_seconds_per_km integer,
  add column if not exists recent_weekly_hours numeric,
  add column if not exists current_training_concern text;
alter table public.athlete_onboarding
  drop constraint if exists onboarding_training_days_check,
  add constraint onboarding_training_days_check check (
    cardinality(training_days)<=7 and training_days <@ array[0,1,2,3,4,5,6]::integer[]
    and array_position(training_days,null) is null
  );
alter table public.athlete_onboarding
  drop constraint if exists onboarding_ftp_range,
  add constraint onboarding_ftp_range check(ftp_watts is null or ftp_watts between 60 and 650);
alter table public.athlete_onboarding
  drop constraint if exists onboarding_css_range,
  add constraint onboarding_css_range check(swim_css_seconds_per_100m is null or swim_css_seconds_per_100m between 50 and 300);
alter table public.athlete_onboarding
  drop constraint if exists onboarding_run_threshold_range,
  add constraint onboarding_run_threshold_range check(run_threshold_seconds_per_km is null or run_threshold_seconds_per_km between 150 and 900);
alter table public.athlete_onboarding
  drop constraint if exists onboarding_recent_hours_range,
  add constraint onboarding_recent_hours_range check(recent_weekly_hours is null or recent_weekly_hours between 0 and 25);
alter table public.athlete_onboarding
  drop constraint if exists onboarding_current_concern,
  add constraint onboarding_current_concern check(current_training_concern is null or current_training_concern in ('none','yes','unsure'));
comment on column public.athlete_onboarding.ftp_watts is 'Athlete-reported cycling FTP, not coach-verified.';
comment on column public.athlete_onboarding.swim_css_seconds_per_100m is 'Athlete-reported CSS in seconds per 100 metres, not coach-verified.';
comment on column public.athlete_onboarding.run_threshold_seconds_per_km is 'Athlete-reported running threshold pace in seconds per kilometre, not coach-verified.';
comment on column public.athlete_onboarding.training_days is 'Monday=0 through Sunday=6; empty means availability not specified.';
