-- Staging-first, athlete-owned, conservative two-week foundation.
-- This function has invoker privileges: existing athlete RLS remains effective.
alter table public.athlete_onboarding
  add column if not exists can_swim_200m boolean not null default false;
alter table public.athlete_onboarding
  add column if not exists training_background text not null default 'unknown',
  add column if not exists training_consistency text not null default 'unknown';
alter table public.athlete_onboarding
  add constraint onboarding_training_background_check check(training_background in ('unknown','novice','regular','established')) not valid;
alter table public.athlete_onboarding
  add constraint onboarding_training_consistency_check check(training_consistency in ('unknown','under4','4to7','8plus')) not valid;

create or replace function public.generate_onboarding_foundation()
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_athlete uuid;
  v_setup public.athlete_onboarding%rowtype;
  v_today date := (now() at time zone 'Europe/London')::date;
  v_date date;
  v_week date;
  v_prior_week date;
  v_week_id uuid;
  v_day integer;
  v_count integer := 0;
  v_week_count integer := 0;
  v_week_minutes integer := 0;
  v_cap_minutes integer;
  v_max_sessions integer;
  v_tier text := 'foundation';
  v_basis text := 'unverified_history';
  v_week_target numeric;
  v_sequence integer := 0;
  v_duration integer;
  v_sport text;
  v_title text;
  v_prescription jsonb;
  v_days integer[];
begin
  if v_user is null then raise exception 'Authenticated athlete required'; end if;
  perform pg_advisory_xact_lock(hashtext(v_user::text), 55103);

  select * into v_setup from public.athlete_onboarding
    where user_id = v_user and onboarding_step = 3;
  if not found then raise exception 'Finish your onboarding before generating training'; end if;

  select id into v_athlete from public.athlete_profile where user_id = v_user;
  if v_athlete is null then raise exception 'Athlete profile missing'; end if;

  if coalesce(trim(v_setup.current_training_concern),'') not in ('','none') then
    return jsonb_build_object('status','review_required','reason','Training concern requires review before exercise is prescribed');
  end if;
  select array_agg(distinct day_index order by day_index)
    into v_days from unnest(v_setup.training_days) as day_index
    where day_index between 0 and 6;
  if coalesce(cardinality(v_days),0) = 0 then
    return jsonb_build_object('status','review_required','reason','Choose at least one training day');
  end if;

  if exists(select 1 from public.planned_session
    where athlete_id=v_athlete and is_active_version
    and planned_date >= v_today and planned_date < v_today + 14) then
    return jsonb_build_object('status','already_planned','reason','Existing sessions preserved');
  end if;

  -- Race-distance experience is NOT a proxy for endurance training capacity.
  -- Self-reported training history remains unverified; never prescribe intensity
  -- or a sudden increase based on it. Availability is only an upper bound.
  if v_setup.training_background = 'established'
     and v_setup.training_consistency = '8plus'
     and coalesce(v_setup.recent_weekly_hours,0) >= 5 then
    v_tier := 'established_continuation';
    v_basis := 'athlete_reported_consistent_8plus_weeks';
    v_week_target := least(v_setup.weekly_hours,v_setup.recent_weekly_hours*0.85,8.0);
    v_max_sessions := least(6,cardinality(v_days));
  elsif v_setup.training_background in ('regular','established')
     and v_setup.training_consistency in ('4to7','8plus')
     and coalesce(v_setup.recent_weekly_hours,0) >= 3 then
    v_tier := 'regular_continuation';
    v_basis := 'athlete_reported_consistent_4plus_weeks';
    v_week_target := least(v_setup.weekly_hours,v_setup.recent_weekly_hours*0.75,5.5);
    v_max_sessions := least(5,cardinality(v_days));
  else
    v_tier := 'foundation';
    v_basis := 'limited_or_unverified_training_history';
    v_week_target := least(v_setup.weekly_hours,
      case when v_setup.recent_weekly_hours=0 then 2.0
           else least(coalesce(v_setup.recent_weekly_hours,2.5),3.0) end);
    v_max_sessions := least(4,cardinality(v_days));
  end if;
  v_cap_minutes := greatest(0,floor(v_week_target*60));
  -- Enforce one recovery day even when all seven are offered.
  v_max_sessions := least(v_max_sessions,6);

  v_prior_week := null;

  for v_date in select generate_series(v_today, v_today + 13, interval '1 day')::date loop
    v_week := v_date - (extract(isodow from v_date)::integer - 1);
    if v_prior_week is distinct from v_week then
      v_prior_week := v_week;
      v_week_minutes := 0;
      v_week_count := 0;
    end if;
    v_day := extract(isodow from v_date)::integer - 1;
    if not (v_day = any(v_days)) or v_week_count >= v_max_sessions then continue; end if;

    if v_setup.can_swim_200m then
      v_sport := (array['bike','run','swim'])[v_sequence % 3 + 1];
    else
      v_sport := (array['bike','run'])[v_sequence % 2 + 1];
    end if;
    if v_sport='bike' then
      v_duration := case v_tier when 'established_continuation' then 120 when 'regular_continuation' then 75 else 40 end;
      v_title := 'Foundation easy aerobic ride';
      v_prescription := jsonb_build_object('steps',jsonb_build_array(
        jsonb_build_object('durationMin',10,'target','Easy spin, RPE 2-3'),
        jsonb_build_object('durationMin',v_duration-15,'target','Comfortable aerobic riding, RPE 3-4; able to speak in full sentences'),
        jsonb_build_object('durationMin',5,'target','Easy cool-down, RPE 2')));
    elsif v_sport='run' then
      v_duration := case v_tier when 'established_continuation' then 55 when 'regular_continuation' then 40 else 25 end;
      v_title := case when v_tier='foundation' then 'Foundation walk-run' else 'Foundation easy run' end;
      v_prescription := jsonb_build_object('steps',jsonb_build_array(
        jsonb_build_object('durationMin',5,'target','Start with a comfortable walk, RPE 2'),
        jsonb_build_object('durationMin',v_duration-10,'target',case when v_tier='foundation' then 'Alternate gentle jogging and walking; keep RPE 2-3, walking whenever needed' else 'Easy conversational running, RPE 3-4; walk if needed' end),
        jsonb_build_object('durationMin',5,'target','Walk to cool down')));
    else
      v_duration := case v_tier when 'established_continuation' then 45 when 'regular_continuation' then 35 else 30 end;
      v_title := 'Foundation relaxed swim';
      v_prescription := jsonb_build_object('steps',jsonb_build_array(
        jsonb_build_object('durationMin',5,'target','Easy swimming, RPE 2'),
        jsonb_build_object('durationMin',v_duration-10,'target','Relaxed strokes with rests as needed, RPE 2-3; prioritise technique and safe pool conditions'),
        jsonb_build_object('durationMin',5,'target','Very easy swimming and rest')));
    end if;
    -- Do not insert a session that would exceed the conservative weekly cap.
    if v_week_minutes + v_duration > v_cap_minutes then continue; end if;

    insert into public.season_week(athlete_id,week_start,phase,target_hours,benchmark_week,locked)
      values(v_athlete,v_week,'Foundation',round(v_cap_minutes::numeric/60,1),false,false)
      on conflict(athlete_id,week_start) do nothing;
    select id into v_week_id from public.season_week
      where athlete_id=v_athlete and week_start=v_week;
    if v_week_id is null then raise exception 'Unable to locate foundation week'; end if;

    insert into public.planned_session(
      season_week_id,athlete_id,planned_date,sport,title,session_class,priority,
      duration_min,targets,prescription,rationale,status,locked,is_active_version
    ) values (
      v_week_id,v_athlete,v_date,v_sport::public.sport_type,v_title,'easy',2,
      v_duration,
      jsonb_build_object('rpe_min',2,'rpe_max',4,'generation_source','onboarding_foundation','requires_coach_review_for_progression',true,
      'training_tier',v_tier,'capacity_basis',v_basis,'athlete_reported',true,'weekly_capacity_cap_minutes',v_cap_minutes),
      v_prescription,
      'Starter programme: '||replace(v_tier,'_',' ')||'. Based on athlete-reported history, consistency, schedule and readiness. Training remains RPE-led; no threshold or performance assumptions. Later progression requires review.',
      'planned',false,true);
    v_count := v_count + 1;
    v_week_count := v_week_count + 1;
    v_week_minutes := v_week_minutes + v_duration;
    v_sequence := v_sequence + 1;
  end loop;
  if v_count = 0 then
    return jsonb_build_object('status','review_required','reason','No safe sessions fit the supplied training availability');
  end if;
  return jsonb_build_object('status','created','sessions',v_count,'first_date',v_today,
  'training_tier',v_tier,'capacity_basis',v_basis,'weekly_capacity_cap_minutes',v_cap_minutes);
end;
$$;

revoke all on function public.generate_onboarding_foundation() from public, anon;
grant execute on function public.generate_onboarding_foundation() to authenticated;
