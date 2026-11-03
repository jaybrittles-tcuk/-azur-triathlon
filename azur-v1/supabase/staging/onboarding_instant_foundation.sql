-- Staging-first, athlete-owned, conservative two-week foundation.
-- This function has invoker privileges: existing athlete RLS remains effective.
alter table public.athlete_onboarding
  add column if not exists can_swim_200m boolean not null default false;

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

  -- Availability is an upper bound, never evidence of training capacity.
  -- Without corroborated history the initial programme stays deliberately light.
  v_cap_minutes := floor(60 * least(
    v_setup.weekly_hours,
    coalesce(case
      when v_setup.recent_weekly_hours = 0 then 2.0
      else greatest(1.5, v_setup.recent_weekly_hours * 1.1)
    end, 2.5),
    case when v_setup.experience='first' then 3.0 else 5.0 end
  ));
  v_max_sessions := least(4, cardinality(v_days));
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
      v_duration := case when v_setup.experience='first' then 40 else 55 end;
      v_title := 'Foundation easy aerobic ride';
      v_prescription := jsonb_build_object('steps',jsonb_build_array(
        jsonb_build_object('durationMin',10,'target','Easy spin, RPE 2-3'),
        jsonb_build_object('durationMin',v_duration-15,'target','Comfortable aerobic riding, RPE 3-4; able to speak in full sentences'),
        jsonb_build_object('durationMin',5,'target','Easy cool-down, RPE 2')));
    elsif v_sport='run' then
      v_duration := case when v_setup.experience='first' then 25 else 35 end;
      v_title := case when v_setup.experience='first' then 'Foundation walk-run' else 'Foundation easy run' end;
      v_prescription := jsonb_build_object('steps',jsonb_build_array(
        jsonb_build_object('durationMin',5,'target','Start with a comfortable walk, RPE 2'),
        jsonb_build_object('durationMin',v_duration-10,'target',case when v_setup.experience='first' then 'Alternate gentle jogging and walking; keep RPE 2-3, walking whenever needed' else 'Easy conversational running, RPE 3-4; walk if needed' end),
        jsonb_build_object('durationMin',5,'target','Walk to cool down')));
    else
      v_duration := 30;
      v_title := 'Foundation relaxed swim';
      v_prescription := jsonb_build_object('steps',jsonb_build_array(
        jsonb_build_object('durationMin',5,'target','Easy swimming, RPE 2'),
        jsonb_build_object('durationMin',20,'target','Relaxed strokes with frequent rests, RPE 2-3; prioritise technique and safe pool conditions'),
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
      jsonb_build_object('rpe_min',2,'rpe_max',4,'generation_source','onboarding_foundation','requires_coach_review_for_progression',true),
      v_prescription,
      'Conservative initial programme based on available training days, reported history and onboarding readiness. No threshold assumptions.',
      'planned',false,true);
    v_count := v_count + 1;
    v_week_count := v_week_count + 1;
    v_week_minutes := v_week_minutes + v_duration;
    v_sequence := v_sequence + 1;
  end loop;
  if v_count = 0 then
    return jsonb_build_object('status','review_required','reason','No safe sessions fit the supplied training availability');
  end if;
  return jsonb_build_object('status','created','sessions',v_count,'first_date',v_today);
end;
$$;

revoke all on function public.generate_onboarding_foundation() from public, anon;
grant execute on function public.generate_onboarding_foundation() to authenticated;
