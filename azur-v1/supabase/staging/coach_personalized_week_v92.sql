-- V9.2: personalised *full-week* preview and atomic assigned-coach publication.
-- Wraps the already validated conservative week planner. No automatic
-- workload increase, no hard-session insertion or athlete confirmation.
create or replace function public.coach_personalized_week_preview(p_athlete_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $preview$
declare
 v_coach uuid:=auth.uid();
 v_base jsonb;
 v_session jsonb;
 v_sport text;
 v_duration int;
 v_key text;
 v_workout jsonb;
 v_steps jsonb;
 v_pool jsonb;
 v_step jsonb;
 v_presc jsonb;
 v_item jsonb;
 v_sessions jsonb:='[]'::jsonb;
 v_count int:=0;
 v_total int:=0;
 v_why text;
begin
 if v_coach is null or auth.jwt()->'app_metadata'->>'role' is distinct from 'coach'
    or not exists(select 1 from public.coach_athlete_assignment a
      where a.athlete_id=p_athlete_id and a.coach_user_id=v_coach)
 then raise exception 'Assigned AZUR coach required';end if;
 v_base:=public.coach_adaptive_week_proposal(p_athlete_id);
 if v_base->>'status'<>'ready_for_coach' then
   return v_base||jsonb_build_object('personalized_sessions',0,
     'planner_version','v9.2','reason',v_base->>'reason');
 end if;
 if (v_base->>'proposed_minutes')::int>(v_base->>'source_minutes')::int
    or (v_base->>'proposed_minutes')::int>480 then
   raise exception 'V9.2 cannot raise the approved source-week load';end if;
 for v_session in select value from jsonb_array_elements(v_base->'sessions') loop
   v_sport:=v_session->>'sport';
   v_duration:=(v_session->>'duration_min')::int;
   v_key:=case when v_base->>'adaptation'='recovery_reduction'
     then null
     when v_sport='bike' and v_duration=90 then 'azur-bike-aerobic-base-90'
     when v_sport='swim' and v_duration=45 then 'azur-swim-technique-base-45'
     when v_sport='swim' and v_duration=55 then 'azur-swim-aerobic-base-55'
     else null end;
   v_presc:=v_session->'prescription';
   v_workout:=null;
   v_why:='Existing approved RPE-based easy workout; no unverified intensity or added duration.';
   if v_key is not null then
     v_workout:=public.coach_verified_workout_preview(p_athlete_id,v_key);
     if v_workout->>'status'='ready_for_coach_review'
        and (v_workout->>'duration_min')::int=v_duration then
       if v_sport='bike' then
         v_steps:='[]'::jsonb;
         for v_step in select value from jsonb_array_elements(v_workout->'steps') loop
           v_steps:=v_steps||jsonb_build_array(jsonb_build_object(
             'durationMin',(v_step->>'duration_min')::int,
             'target',v_step->>'target',
             'powerMinWatts',v_step->'power_min_w',
             'powerMaxWatts',v_step->'power_max_w'));
         end loop;
         v_presc:=jsonb_build_object('steps',v_steps,
           'focus','Verified FTP-based easy aerobic endurance');
       else
         v_pool:='[]'::jsonb;
         for v_step in select value from jsonb_array_elements(v_workout->'pool_segments') loop
           v_pool:=v_pool||jsonb_build_array(jsonb_build_object(
             'repeats',(v_step->>'repeats')::int,
             'distanceMeters',(v_step->>'distance_m')::int,
             'restSeconds',(v_step->>'rest_seconds')::int,
             'target',v_step->>'target',
             'purpose',v_step->>'purpose',
             'paceMinSecondsPer100m',v_step->'pace_min_seconds_per_100m',
             'paceMaxSecondsPer100m',v_step->'pace_max_seconds_per_100m'));
         end loop;
         v_presc:=jsonb_build_object('poolSegments',v_pool,
           'focus','Verified CSS-based controlled aerobic swimming',
           'totalDistanceMeters',(v_workout->>'swim_total_distance_m')::int);
       end if;
       v_count:=v_count+1;
       v_why:='Verified recent benchmark and an exact-duration, coach-approved level-1 aerobic template. Coach must assess readiness before publishing.';
     end if;
   end if;
   v_item:=v_session||jsonb_build_object(
     'prescription',v_presc,
     'personalized',v_why like 'Verified recent benchmark%',
     'workout_key',case when v_why like 'Verified recent benchmark%' then v_key else null end,
     'benchmark_id',case when v_why like 'Verified recent benchmark%' then v_workout->>'verified_benchmark_id' else null end,
     'benchmark_value',case when v_why like 'Verified recent benchmark%' then v_workout->'benchmark_value' else null end,
     'selection_reason',v_why);
   v_sessions:=v_sessions||jsonb_build_array(v_item);
   v_total:=v_total+v_duration;
 end loop;
 if v_total<>(v_base->>'proposed_minutes')::int
  or jsonb_array_length(v_sessions)<>jsonb_array_length(v_base->'sessions') then
  raise exception 'Personalized proposed week differs in time or count from safe source';end if;
 return v_base||jsonb_build_object('sessions',v_sessions,
   'personalized_sessions',v_count,'planner_version','v9.2',
   'calendar_changed',false,'publication_requires_coach',true,
   'workout_safety','Only exact-duration, approved level-1 aerobic workouts with current coach-verified benchmarks; otherwise original easy RPE prescription. No automatic duration or intensity progression.');
end;
$preview$;
revoke all on function public.coach_personalized_week_preview(uuid) from public,anon;
grant execute on function public.coach_personalized_week_preview(uuid) to authenticated;

create or replace function public.coach_decide_personalized_week(
 p_athlete_id uuid,p_preview jsonb,p_decision text,p_rationale text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $decide$
declare
 v_coach uuid:=auth.uid();
 v_user uuid;
 v_current jsonb;
 v_week date;
 v_week_id uuid;
 v_item jsonb;
 v_count int:=0;
 v_minutes int:=0;
 v_personalized int:=0;
begin
 if v_coach is null or auth.jwt()->'app_metadata'->>'role' is distinct from 'coach'
   or not exists(select 1 from public.coach_athlete_assignment a
      where a.coach_user_id=v_coach and a.athlete_id=p_athlete_id)
 then raise exception 'Assigned AZUR coach required';end if;
 if p_decision not in ('approved','declined')
  or length(trim(coalesce(p_rationale,''))) not between 15 and 1000 then
  raise exception 'Decision and 15–1000 character coaching rationale required';end if;
 select user_id into v_user from public.athlete_profile where id=p_athlete_id;
 if v_user is null then raise exception 'Athlete profile unavailable';end if;
 perform pg_advisory_xact_lock(hashtext(v_user::text),55103);
 v_current:=public.coach_personalized_week_preview(p_athlete_id);
 if v_current is distinct from p_preview then
  raise exception 'Calendar, benchmarks or planned week changed. Regenerate and re-review';end if;
 if v_current->>'status'<>'ready_for_coach'
   or v_current->>'planner_version'<>'v9.2' then
  raise exception 'Blocked proposals cannot be decided';end if;
 v_week:=(v_current->>'week_start')::date;
 if exists(select 1 from public.coach_adaptive_week_decision
  where athlete_id=p_athlete_id and week_start=v_week) then
  raise exception 'This week already has a recorded coaching decision';end if;
 if p_decision='declined' then
  insert into public.coach_adaptive_week_decision
   (athlete_id,coach_user_id,week_start,decision,rationale,proposal_snapshot)
  values(p_athlete_id,v_coach,v_week,'declined',trim(p_rationale),v_current);
  return jsonb_build_object('status','declined','calendar_changed',false,'week_start',v_week);
 end if;
 if exists(select 1 from public.planned_session p
    where p.athlete_id=p_athlete_id and p.is_active_version
    and p.planned_date>=v_week and p.planned_date<v_week+7)
 or exists(select 1 from public.season_week w
    where w.athlete_id=p_athlete_id and w.week_start=v_week
      and (w.locked or w.phase<>'Foundation')) then
  raise exception 'Future week is no longer empty, available or unlocked';end if;
 if (v_current->>'proposed_minutes')::int>(v_current->>'source_minutes')::int
  or (v_current->>'proposed_minutes')::int>480 then
  raise exception 'Unsafe weekly workload increase';end if;
 insert into public.season_week
  (athlete_id,week_start,phase,target_hours,benchmark_week,locked)
 values(p_athlete_id,v_week,'Foundation',round((v_current->>'proposed_minutes')::numeric/60,1),false,false)
 on conflict(athlete_id,week_start) do nothing;
 select id into v_week_id from public.season_week
 where athlete_id=p_athlete_id and week_start=v_week
   and phase='Foundation' and not locked;
 if v_week_id is null then raise exception 'Destination training week not safe';end if;
 update public.season_week set target_hours=round((v_current->>'proposed_minutes')::numeric/60,1)
 where id=v_week_id and not locked and phase='Foundation';
 for v_item in select value from jsonb_array_elements(v_current->'sessions') loop
  if (v_item->>'date')::date<v_week or (v_item->>'date')::date>=v_week+7
    or (v_item->>'duration_min')::int not between 20 and 180 then
   raise exception 'Invalid planned session target';end if;
  insert into public.planned_session
    (season_week_id,athlete_id,planned_date,sport,title,session_class,priority,
     duration_min,targets,prescription,rationale,status,locked,is_active_version)
  values(v_week_id,p_athlete_id,(v_item->>'date')::date,
    (v_item->>'sport')::public.sport_type,v_item->>'title','easy',2,
    (v_item->>'duration_min')::int,
    jsonb_build_object('generation_source','coach_personalized_v92',
     'coach_approved',true,'coach_user_id',v_coach,
     'source_session_id',v_item->>'source_session_id',
     'verified_workout_key',v_item->>'workout_key',
     'verified_benchmark_id',v_item->>'benchmark_id',
     'verified_benchmark_value',v_item->'benchmark_value',
     'personalized',coalesce((v_item->>'personalized')::boolean,false),
     'race_phase',v_current->>'race_phase',
     'race_distance',v_current->>'race_distance',
     'adaptation',v_current->>'adaptation',
     'requires_coach_review_for_progression',true),
    v_item->'prescription',
    'Complete individual AZUR week reviewed and atomically published by the assigned coach. No automatic volume increase.',
    'planned',false,true);
  v_count:=v_count+1;
  v_minutes:=v_minutes+(v_item->>'duration_min')::int;
  if coalesce((v_item->>'personalized')::boolean,false) then
   v_personalized:=v_personalized+1;end if;
 end loop;
 if v_count<>jsonb_array_length(v_current->'sessions')
  or v_minutes<>(v_current->>'proposed_minutes')::int
  or v_personalized<>(v_current->>'personalized_sessions')::int then
  raise exception 'Published count, load or benchmark use differs from reviewed proposal';end if;
 insert into public.coach_adaptive_week_decision
  (athlete_id,coach_user_id,week_start,decision,rationale,proposal_snapshot)
 values(p_athlete_id,v_coach,v_week,'approved',trim(p_rationale),v_current);
 return jsonb_build_object('status','approved_and_published',
  'calendar_changed',true,'week_start',v_week,'sessions',v_count,
  'personalized_sessions',v_personalized,'total_minutes',v_minutes);
end;
$decide$;
revoke all on function public.coach_decide_personalized_week(uuid,jsonb,text,text) from public,anon;
grant execute on function public.coach_decide_personalized_week(uuid,jsonb,text,text) to authenticated;
