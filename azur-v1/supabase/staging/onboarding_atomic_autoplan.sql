-- AZUR staging: one atomic athlete completion/automatic foundation publication.
-- Authenticated athlete only. Inserts a profile if needed, invokes the existing
-- conservative generator, validates the actual calendar, and returns an
-- explicit ready/review-required outcome. No coach decision is bypassed.
create or replace function public.complete_athlete_onboarding_and_plan(p_inputs jsonb)
returns jsonb language plpgsql security invoker
set search_path=public,pg_temp as $complete$
declare
 v_user uuid:=auth.uid();
 v_name text;
 v_days int[];
 v_day_count int;
 v_hours numeric;
 v_recent numeric;
 v_ftp int;
 v_css int;
 v_run int;
 v_swim boolean;
 v_concern text;
 v_race text;
 v_date date;
 v_profile uuid;
 v_result jsonb;
 v_calendar_count int;
 v_calendar_minutes int;
 v_first date;
 v_last date;
 v_invalid int;
 v_generator_count int;
 v_calendar jsonb;
 v_today date:=(now() at time zone 'Europe/London')::date;
begin
 if v_user is null or auth.jwt()->'app_metadata'->>'role'='coach'
 then raise exception 'An authenticated athlete account is required';end if;
 if p_inputs is null or jsonb_typeof(p_inputs)<>'object' then
  raise exception 'Athlete onboarding details are required';end if;
 v_name:=trim(coalesce(p_inputs->>'display_name',''));
 if length(v_name) not between 2 and 90 then
  raise exception 'Enter your name (2–90 characters)';end if;
 v_race:=p_inputs->>'race_distance';
 if v_race is null or v_race not in ('sprint','olympic','70.3','ironman','other')
 then raise exception 'Choose a valid race distance';end if;
 if p_inputs->>'experience' not in ('first','returning','experienced')
  or p_inputs->>'device' not in ('garmin','coros','polar','apple','other','none')
 then raise exception 'Choose your experience and training device';end if;
 if jsonb_typeof(p_inputs->'weekly_hours')<>'number' then
  raise exception 'Weekly training availability must be a number';end if;
 v_hours:=(p_inputs->>'weekly_hours')::numeric;
 if v_hours<2 or v_hours>25 then raise exception 'Training availability must be 2–25 hours';end if;
 if p_inputs ? 'recent_weekly_hours' and p_inputs->'recent_weekly_hours'<>'null'::jsonb then
  if jsonb_typeof(p_inputs->'recent_weekly_hours')<>'number' then
   raise exception 'Recent completed training hours must be a number';end if;
  v_recent:=(p_inputs->>'recent_weekly_hours')::numeric;
  if v_recent<0 or v_recent>25 then raise exception 'Recent hours must be 0–25';end if;
 end if;
 if jsonb_typeof(p_inputs->'training_days')<>'array' then
  raise exception 'Choose the days you can train';end if;
 if jsonb_array_length(p_inputs->'training_days')=0
  or jsonb_array_length(p_inputs->'training_days')>7 then
  raise exception 'Choose one to seven training days';end if;
 if exists(select 1 from jsonb_array_elements(p_inputs->'training_days') day_value
  where jsonb_typeof(day_value)<>'number'
    or day_value::text not in ('0','1','2','3','4','5','6'))
 then raise exception 'Invalid training day';end if;
 select array_agg(distinct day_value::int order by day_value::int) into v_days
 from jsonb_array_elements_text(p_inputs->'training_days') day_value;
 if cardinality(v_days)<1 then raise exception 'Choose at least one training day';end if;
 if p_inputs->>'training_background' not in ('novice','regular','established')
  or p_inputs->>'training_consistency' not in ('under4','4to7','8plus')
 then raise exception 'Confirm training history and consistency';end if;
 v_concern:=p_inputs->>'current_training_concern';
 if v_concern not in ('none','yes','unsure') or v_concern is null then
  raise exception 'Confirm whether a training concern needs review';end if;
 if jsonb_typeof(p_inputs->'can_swim_200m')<>'boolean' then
  raise exception 'Confirm swimming ability';end if;
 v_swim:=(p_inputs->>'can_swim_200m')::boolean;
 if p_inputs->>'race_date' is not null and trim(p_inputs->>'race_date')<>'' then
  v_date:=(p_inputs->>'race_date')::date;
  if v_date<v_today then raise exception 'Choose a future race date or leave it blank';end if;
 end if;
 if p_inputs->>'ftp_watts' is not null then
  v_ftp:=(p_inputs->>'ftp_watts')::int;
  if v_ftp not between 60 and 650 then raise exception 'FTP must be 60–650W';end if;
 end if;
 if p_inputs->>'swim_css_seconds_per_100m' is not null then
  v_css:=(p_inputs->>'swim_css_seconds_per_100m')::int;
  if v_css not between 50 and 300 then raise exception 'CSS outside accepted range';end if;
 end if;
 if p_inputs->>'run_threshold_seconds_per_km' is not null then
  v_run:=(p_inputs->>'run_threshold_seconds_per_km')::int;
  if v_run not between 150 and 900 then raise exception 'Run threshold outside accepted range';end if;
 end if;
 -- Same lock protects re-entry and the existing generator's idempotency.
 perform pg_advisory_xact_lock(hashtext(v_user::text),55103);
 insert into public.athlete_onboarding(
  user_id,race_distance,race_date,experience,weekly_hours,device,onboarding_step,
  training_days,recent_weekly_hours,current_training_concern,
  training_background,training_consistency,can_swim_200m,
  ftp_watts,swim_css_seconds_per_100m,run_threshold_seconds_per_km,updated_at)
 values(v_user,v_race,v_date,p_inputs->>'experience',v_hours,
  p_inputs->>'device',3,v_days,v_recent,v_concern,
  p_inputs->>'training_background',p_inputs->>'training_consistency',v_swim,
  v_ftp,v_css,v_run,now())
 on conflict(user_id) do update set
  race_distance=excluded.race_distance,race_date=excluded.race_date,
  experience=excluded.experience,weekly_hours=excluded.weekly_hours,
  device=excluded.device,onboarding_step=3,training_days=excluded.training_days,
  recent_weekly_hours=excluded.recent_weekly_hours,
  current_training_concern=excluded.current_training_concern,
  training_background=excluded.training_background,
  training_consistency=excluded.training_consistency,
  can_swim_200m=excluded.can_swim_200m,
  ftp_watts=excluded.ftp_watts,
  swim_css_seconds_per_100m=excluded.swim_css_seconds_per_100m,
  run_threshold_seconds_per_km=excluded.run_threshold_seconds_per_km,
  updated_at=now();
 -- Profile user_id has no unique constraint on this staging schema.
 -- Under the per-user advisory lock, reuse one existing profile or create
 -- exactly one. Never manufacture another profile on a retry.
 if (select count(*) from public.athlete_profile where user_id=v_user)>1 then
   raise exception 'Multiple athlete profiles require support review before planning';
 end if;
 select id into v_profile from public.athlete_profile
 where user_id=v_user for update;
 if v_profile is null then
   insert into public.athlete_profile(user_id,display_name)
   values(v_user,v_name) returning id into v_profile;
 else
   update public.athlete_profile set display_name=v_name where id=v_profile;
 end if;
 if v_profile is null then raise exception 'Athlete profile could not be created';end if;
 v_result:=public.generate_onboarding_foundation();
 -- Enrich only compatible unlocked, as-yet-uncompleted foundation workouts.
 -- Still RPE-led and time-neutral; any failure rolls back onboarding.
 perform public.athlete_enrich_foundation_sessions();
 if v_result->>'status'='review_required' then
   return jsonb_build_object('status','review_required',
    'reason',v_result->>'reason','setup_saved',true,
    'calendar_changed',false,'coach_review_required',true);
 end if;
 if v_result->>'status' not in ('created','already_planned') then
  raise exception 'AZUR could not confirm automatic training generation';end if;
 select count(*),coalesce(sum(duration_min),0),min(planned_date),max(planned_date),
  coalesce(jsonb_agg(jsonb_build_object('date',planned_date,'sport',sport,
    'duration_min',duration_min,'title',title) order by planned_date,sport),'[]'::jsonb)
 into v_calendar_count,v_calendar_minutes,v_first,v_last,v_calendar
 from public.planned_session
 where athlete_id=v_profile and is_active_version
   and planned_date>=v_today and planned_date<v_today+14;
 if v_calendar_count<1 then raise exception 'No visible workouts in the athlete calendar';end if;
 -- Verify every generated workout has a valid date, approved availability,
 -- internally consistent time and safe swimming state.
 select count(*) into v_invalid from public.planned_session p
 where p.athlete_id=v_profile and p.is_active_version
  and p.planned_date>=v_today and p.planned_date<v_today+14
  and p.targets->>'generation_source'='onboarding_foundation'
  and (extract(isodow from p.planned_date)::int-1<>all(v_days)
    or (p.sport='swim' and not v_swim)
    or p.session_class<>'easy'
    or p.locked or p.status<>'planned'
    or jsonb_typeof(p.prescription->'steps') is distinct from 'array'
    or (select coalesce(sum((s.value->>'durationMin')::int),0)
        from jsonb_array_elements(p.prescription->'steps') s)<>p.duration_min);
 if v_invalid>0 then raise exception 'Generated sessions failed safety/calendar verification';end if;
 -- Freshly generated plans must match exactly what the generator reported.
 if v_result->>'status'='created' then
  v_generator_count:=(v_result->>'sessions')::int;
  if v_calendar_count<>v_generator_count then
    raise exception 'Calendar returned % workouts, expected %',v_calendar_count,v_generator_count;end if;
 end if;
 return jsonb_build_object('status','ready','setup_saved',true,
   'calendar_changed',v_result->>'status'='created',
   'sessions',v_calendar_count,'total_minutes',v_calendar_minutes,
   'first_date',v_first,'last_date',v_last,
   'training_tier',v_result->>'training_tier',
   'capacity_basis',v_result->>'capacity_basis',
   'calendar',v_calendar);
end;
$complete$;
revoke all on function public.complete_athlete_onboarding_and_plan(jsonb)
 from public,anon;
grant execute on function public.complete_athlete_onboarding_and_plan(jsonb)
 to authenticated;
