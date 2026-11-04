-- Staging V7: read-only race-specific prescription readiness.
-- Thresholds in onboarding are ATHLETE-REPORTED, never verified benchmarks.
-- Supplied FTP/CSS values cannot unlock threshold workouts.
create or replace function public.coach_race_workout_readiness(p_athlete_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $ready$
declare
 v_coach uuid:=auth.uid();
 v_setup public.athlete_onboarding%rowtype;
 v_baseline public.athlete_training_baseline%rowtype;
 v_summary jsonb;
 v_event text;
 v_race date;
 v_weeks integer;
 v_phase text;
 v_eligible jsonb;
 v_gated jsonb;
 v_sport jsonb;
 v_totals jsonb;
 v_notes jsonb;
 v_next date;
 v_sim_12 date;
 v_sim_4 date;
begin
 if v_coach is null or auth.jwt()->'app_metadata'->>'role' is distinct from 'coach'
 then raise exception 'Assigned AZUR coach account required';end if;
 if not exists(select 1 from public.coach_athlete_assignment a
  where a.athlete_id=p_athlete_id and a.coach_user_id=v_coach)
 then raise exception 'This athlete is not assigned to you';end if;
 select * into v_setup from public.athlete_onboarding o
  where o.user_id=(select p.user_id from public.athlete_profile p where p.id=p_athlete_id);
 if not found or v_setup.onboarding_step<>3
 then raise exception 'Completed athlete onboarding is required';end if;
 select * into v_baseline from public.athlete_training_baseline
 where athlete_id=p_athlete_id;
 v_summary:=public.coach_next_week_adaptive_preview(p_athlete_id);
 v_event:=lower(coalesce(v_setup.race_distance,'unknown'));
 v_race:=v_setup.race_date;
 v_next:=(v_summary->>'week_start')::date;
 v_weeks:=case when v_race is null then null
  else floor((v_race-v_next)::numeric/7)::integer end;
 v_phase:=case when v_race is null then 'race_unset'
  when v_race<v_next then 'post_race'
  when v_weeks<=3 then 'taper_or_race'
  when v_weeks<=11 then 'build' else 'base' end;
 v_sim_12:=case when v_race is null then null else v_race-84 end;
 v_sim_4:=case when v_race is null then null else v_race-28 end;
 
 -- The exact approved run workout must be RPE-led, with an internally
 -- consistent prescription. No FTP, CSS, numerical zones or threshold pace.
 select coalesce(jsonb_agg(jsonb_build_object('workout_key',x.workout_key,
  'title',x.title,'sport',x.sport,'duration_min',x.duration_min,
  'family',x.family,'prescription_kind','easy_rpe_structured')
  order by x.sport,x.duration_min,x.workout_key),'[]'::jsonb)
 into v_eligible
 from public.coach_workout_library x
 where x.approved=true and x.level=1 and x.sport='run'
 and x.family in ('aerobic_endurance','technique')
 and 'base'=any(x.phases)
 and jsonb_typeof(x.prescription->'steps')='array'
 and jsonb_array_length(x.prescription->'steps') between 3 and 5
 and x.prescription::text !~* '(FTP|CSS|%|threshold[[:space:]]*(pace|power|[0-9])|zone[[:space:]]*[1-9])'
 and (select sum((s.value->>'durationMin')::integer)
  from jsonb_array_elements(x.prescription->'steps') s)=x.duration_min;

 select coalesce(jsonb_agg(jsonb_build_object(
   'sport',x.sport,'title',x.title,'family',x.family,'duration_min',x.duration_min,
   'block_reason',case when x.sport='bike' then 'FTP-dependent workout: no verified bike threshold provenance'
    when x.sport='swim' then 'CSS-dependent workout: no verified swim threshold provenance'
    else 'Not authorised for automatic progression' end)
   order by x.sport,x.title),'[]'::jsonb)
 into v_gated
 from public.coach_workout_library x
 where x.approved=true and
 (x.sport in ('bike','swim') or x.family='threshold' or x.level>1);
 
 -- Device observations are evidence of completed activity, not proof of
 -- functional threshold, sport weakness or medical readiness.
 select coalesce(jsonb_object_agg(sport,jsonb_build_object(
   'validated_sessions',sessions,
   'observed_hours_28d',round(seconds::numeric/3600,1))),'{}'::jsonb)
 into v_sport
 from (
 with dedup as (
  select a.*,row_number() over(partition by coalesce(
    nullif(a.duplicate_group_key,''),
    case when a.source_activity_id is not null
     then a.source||':'||a.source_activity_id else a.id::text end)
    order by case when a.source<>'manual'
      and a.processed_metrics->>'load_status'='validated'
      then 0 else 1 end,a.created_at desc,a.id) rn
  from public.completed_activity a
  where a.athlete_id=p_athlete_id and a.start_time between now()-interval '28 days' and now()
 )
 select sport::text sport,count(*)::integer sessions,
  coalesce(sum(duration_sec),0)::bigint seconds
 from dedup where rn=1 and source<>'manual'
  and processed_metrics->>'load_status'='validated'
  and duration_sec between 60 and 86400
 group by sport
 ) s;
 v_notes:=jsonb_build_array(
  'Bike: long aerobic endurance may be considered only within verified completed duration and availability; FTP intervals remain locked until a validated test.',
  'Run: easy RPE-based workouts may be selected from the approved library without increasing weekly volume; progression requires validated run durability and coach review.',
  'Swim: technique and relaxed aerobic RPE sessions remain available. CSS intervals require benchmark verification and an explicit rest-aware pool prescription.',
  'Race simulations are coach-planned events, not automatically inserted. Confirm ability, recovery, venue safety and appropriate distances.',
  'Taper and post-race require a bespoke coach-managed plan, not generic continuation.'
 );
 return jsonb_build_object(
 'race_distance',v_event,'race_date',v_race,'week_start',v_next,
 'race_phase',v_phase,'weeks_to_race',v_weeks,
 'simulation_12_week_date',v_sim_12,'simulation_4_week_date',v_sim_4,
 'training_concern',v_setup.current_training_concern,
 'development_sport',case when v_baseline.development_sport in ('swim','bike','run')
  then v_baseline.development_sport else null end,
 'reported_thresholds',jsonb_build_object(
   'ftp_watts',v_setup.ftp_watts,
   'swim_css_seconds_per_100m',v_setup.swim_css_seconds_per_100m,
   'run_threshold_seconds_per_km',v_setup.run_threshold_seconds_per_km,
   'provenance','athlete_entered_unverified'),
 'threshold_prescription_allowed',false,
 'race_simulation_auto_publish_allowed',false,
 'approved_easy_run_options',v_eligible,
 'gated_coach_library_workouts',v_gated,
 'observed_sport_training',v_sport,
 'validated_activity_count',v_summary->'validated_sessions',
 'training_evidence_status',v_summary->>'status',
 'coach_review_required',true,
 'guidance',v_notes,
 'calendar_changed',false);
end;
$ready$;
revoke all on function public.coach_race_workout_readiness(uuid) from public,anon;
grant execute on function public.coach_race_workout_readiness(uuid) to authenticated;
