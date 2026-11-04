-- V10 staging: four-week coach decision support only.
-- Does not generate prescribed workouts or write to the athlete calendar.
-- Missing verified activity data is NOT interpreted as zero athletic capacity.
create or replace function public.coach_four_week_progression_preview(p_athlete_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $fourweeks$
declare
 v_coach uuid:=auth.uid();
 v_base jsonb;
 v_onboarding public.athlete_onboarding%rowtype;
 v_baseline public.athlete_training_baseline%rowtype;
 v_source date;
 v_race date;
 v_distance text;
 v_reported numeric;
 v_observed numeric;
 v_source_minutes integer;
 v_week_sessions integer;
 v_cap integer;
 v_week_cap integer;
 v_previous_minutes integer;
 v_week_minutes integer;
 v_recovery integer;
 v_start date;
 v_end date;
 v_phase text;
 v_status text;
 v_reason text;
 v_signal text;
 v_rows jsonb:='[]'::jsonb;
 v_sport_minutes jsonb;
 v_long_ride numeric;
 v_long_run numeric;
 v_recent_ride numeric;
 v_recent_run numeric;
 v_n integer;
 v_has_data boolean;
 v_minutes_by_sport jsonb;
 v_swim_minutes integer;
 v_bike_minutes integer;
 v_run_minutes integer;
 v_original_sum integer;
 v_age_covered integer;
 v_hard integer;
 v_source_signature text;
 v_block_reason text;
begin
 if v_coach is null or auth.jwt()->'app_metadata'->>'role' is distinct from 'coach'
 or not exists(select 1 from public.coach_athlete_assignment ca
 where ca.athlete_id=p_athlete_id and ca.coach_user_id=v_coach)
 then raise exception 'An assigned AZUR coach is required';end if;
 v_base:=public.coach_next_week_adaptive_preview(p_athlete_id);
 select * into v_onboarding from public.athlete_onboarding
 where user_id=(select p.user_id from public.athlete_profile p where p.id=p_athlete_id);
 if not found or v_onboarding.onboarding_step<>3 then
   raise exception 'Completed athlete onboarding required';end if;
 select * into v_baseline from public.athlete_training_baseline where athlete_id=p_athlete_id;
 v_source:=(v_base->>'week_start')::date;
 v_source_minutes:=round((v_base->>'existing_week_hours')::numeric*60);
 v_week_sessions:=coalesce((v_base->>'existing_session_count')::integer,0);
 v_reported:=(v_base->>'reported_recent_hours')::numeric;
 v_observed:=(v_base->>'validated_weekly_average_hours')::numeric;
 v_age_covered:=coalesce((v_base->>'weeks_with_validated_activities')::int,0);
 v_hard:=coalesce((v_base->>'recent_hard_rpe_sessions')::int,0)+
   coalesce((v_base->>'recent_hard_rpe_feedback')::int,0);
 v_race:=v_onboarding.race_date;
 v_distance:=lower(coalesce(v_onboarding.race_distance,'unknown'));
 select coalesce(md5(string_agg(
 p.id::text||':'||p.updated_at::text||':'||p.duration_min::text||':'||
 p.planned_date::text||':'||p.status::text||':'||p.locked::text,
 '|' order by p.id)),md5('empty'))
 into v_source_signature
 from public.planned_session p where p.athlete_id=p_athlete_id
 and p.is_active_version and p.planned_date>=v_source and p.planned_date<v_source+7;

 -- Source distribution reflects the coach-approved calendar, NOT inferred sport
 -- strengths, weaknesses, or a new race specific prescription.
 select coalesce(sum(duration_min) filter(where sport='swim'),0),
 coalesce(sum(duration_min) filter(where sport='bike'),0),
 coalesce(sum(duration_min) filter(where sport='run'),0)
 into v_swim_minutes,v_bike_minutes,v_run_minutes
 from public.planned_session p
 where p.athlete_id=p_athlete_id and p.is_active_version
 and p.planned_date>=v_source and p.planned_date<v_source+7
 and p.status='planned' and not p.locked;
 v_original_sum:=v_swim_minutes+v_bike_minutes+v_run_minutes;
 
 -- Long session ceilings must never be inferred from self-reported
 -- threshold scores. Use verified deduplicated device activity and the
 -- confirmed baseline only for conservative review boundaries.
 with dedup as (
  select a.*,row_number() over(partition by coalesce(nullif(a.duplicate_group_key,''),
   case when a.source_activity_id is not null then a.source||':'||a.source_activity_id
    else a.id::text end)
   order by case when a.source<>'manual'
      and a.processed_metrics->>'load_status'='validated' then 0 else 1 end,
      a.created_at desc,a.id) rn
  from public.completed_activity a where a.athlete_id=p_athlete_id
  and a.start_time>=now()-interval '28 days' and a.start_time<=now()
 )
 select max(duration_sec/60.0) filter(where sport='bike'),
 max(duration_sec/60.0) filter(where sport='run')
 into v_recent_ride,v_recent_run
 from dedup where rn=1 and source<>'manual'
 and processed_metrics->>'load_status'='validated'
 and duration_sec between 60 and 86400;
 v_long_ride:=case when v_recent_ride is null or v_baseline.longest_ride_minutes is null
   then null else round(least(v_recent_ride*1.05,v_baseline.longest_ride_minutes*1.05)) end;
 v_long_run:=case when v_recent_run is null or v_baseline.longest_run_minutes is null
   then null else round(least(v_recent_run*1.05,v_baseline.longest_run_minutes*1.05)) end;

 v_block_reason:=case
   when v_base->>'status'='safety_hold' then 'Unresolved athlete training concern; coach must assess before any multiweek progression.'
   when v_base->>'status'='recovery_review' then 'Recent high exertion: recovery assessment must precede progression.'
   when v_age_covered<3 or (v_base->>'validated_sessions')::int<8 then 'At least three weeks and eight deduplicated validated device sessions are needed; incomplete sync is not low fitness.'
   when v_week_sessions<3 or v_original_sum<>v_source_minutes or exists(
     select 1 from public.planned_session ps where ps.athlete_id=p_athlete_id
      and ps.is_active_version and ps.planned_date>=v_source and ps.planned_date<v_source+7
      and (ps.locked or ps.status<>'planned' or ps.session_class<>'easy'))
     or exists(select 1 from public.season_week sw where sw.athlete_id=p_athlete_id
      and sw.week_start=v_source and (sw.locked or sw.phase<>'Foundation'))
   then 'A complete, unlocked, easy foundation source week is required.'
   when v_race is null then 'Race date not set: this four-week block cannot be race aware.'
   when v_distance not in ('70.3','ironman') then 'Race distance must be confirmed.'
   when v_onboarding.weekly_hours is null or v_onboarding.weekly_hours<2 then 'Training availability not confirmed.'
   else null end;
 v_cap:=floor(least(480,
   coalesce(v_onboarding.weekly_hours,0)*60,
   coalesce(v_baseline.max_weekly_hours,v_onboarding.weekly_hours,0)*60,
   coalesce(v_observed,0)*60*1.05));
 if v_cap<60 and v_block_reason is null then
  v_block_reason:='Validated history and available hours do not support a safe weekly recommendation';
 end if;
 
 v_previous_minutes:=least(v_source_minutes,v_cap);
 for v_n in 1..4 loop
  v_start:=v_source+v_n*7;
  v_end:=v_start+7;
  v_phase:=case
    when v_start>v_race then 'post_race'
    when v_race-v_start<=27 then 'taper_or_race'
    when v_race-v_start<=83 then 'build'
    else 'base' end;
  if v_block_reason is not null then
    v_status:='hold';
    v_reason:=v_block_reason;
  elsif v_phase in ('taper_or_race','post_race') then
    v_status:='coach_bespoke';
    v_reason:='Taper, race and post-race recovery require an individual coach-managed plan; no automated generic block.';
  else
    v_status:='coach_review';
    v_reason:=case when v_n=4 then
     'Recovery/deload week. Reduce overall easy aerobic time; confirm recent exertion and readiness.'
     else 'Coach-reviewed volume change up to 5% from the previous week, capped by observed training and availability. No automatic intensity increase.' end;
  end if;
  v_week_minutes:=null;v_sport_minutes:=null;
  if v_status='coach_review' then
    -- Coach-reviewed advisory, never an automated publication.
    -- Max +5% between weeks, always capped by observed device volume,
    -- athlete availability, and the 8-hour conservative planning ceiling.
    if v_n=1 then
      v_week_minutes:=least(v_source_minutes,v_cap);
    elsif v_n=4 then
      v_week_minutes:=floor(v_previous_minutes*0.75/5)*5;
    else
      v_week_minutes:=least(v_cap,floor(v_previous_minutes*1.05/5)*5);
    end if;
    v_week_minutes:=greatest(0,floor(v_week_minutes/5)*5);
    v_previous_minutes:=v_week_minutes;
    if v_week_minutes<60 then
      v_status:='hold';
      v_reason:='No safe positive training volume recommended from current evidence.';
      v_week_minutes:=null;
    else
      v_sport_minutes:=jsonb_build_object(
        'swim',round(v_swim_minutes::numeric*v_week_minutes/v_source_minutes),
        'bike',round(v_bike_minutes::numeric*v_week_minutes/v_source_minutes),
        'run',v_week_minutes-round(v_swim_minutes::numeric*v_week_minutes/v_source_minutes)
              -round(v_bike_minutes::numeric*v_week_minutes/v_source_minutes));
    end if;
  end if;
  v_rows:=v_rows||jsonb_build_array(jsonb_build_object(
    'week',v_n,'week_start',v_start,'week_end_exclusive',v_end,
    'phase',v_phase,'status',v_status,'reason',v_reason,
    'suggested_minutes',v_week_minutes,'sport_minutes',v_sport_minutes,
    'relative_to_source',case when v_week_minutes is null then null
      else round(v_week_minutes::numeric/nullif(v_source_minutes,0),2) end,
    'recovery_week',v_n=4,
    'new_workouts_automatically_scheduled',false));
 end loop;
 return jsonb_build_object(
  'status',case when v_block_reason is null then 'review_available' else 'history_or_safety_hold' end,
  'block_reason',v_block_reason,'race_distance',v_distance,'race_date',v_race,
  'source_week_start',v_source,'source_week_minutes',v_source_minutes,
  'validated_sessions',v_base->'validated_sessions','validated_weeks',v_age_covered,
  'observed_weekly_hours',v_observed,'reported_weekly_hours',v_reported,
  'max_reference_minutes',case when v_block_reason is null then v_cap else null end,
  'long_bike_review_ceiling_min',v_long_ride,
  'long_run_review_ceiling_min',v_long_run,
  'source_calendar_fingerprint',v_source_signature,
  'weeks',v_rows,
  'coach_approval_required',true,'calendar_changed',false,
  'recommendation_only',true,
  'note','A four-week planning scaffold, not four published programmes. Verified thresholds alone never authorise more volume, longer runs, harder intervals, race simulations or taper prescriptions. Each actual week must pass a fresh activity/readiness review and separate atomic coach approval.');
end;
$fourweeks$;
revoke all on function public.coach_four_week_progression_preview(uuid) from public,anon;
grant execute on function public.coach_four_week_progression_preview(uuid) to authenticated;
