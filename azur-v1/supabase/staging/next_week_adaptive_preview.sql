-- Read-only, assigned-coach-only next-week adaptive recommendation.
-- Does NOT write plans, bypass coach review or use health data without consent.
create or replace function public.coach_next_week_adaptive_preview(p_athlete_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $adaptive$
declare
 v_coach uuid:=auth.uid();
 v_week date;
 v_onboarding public.athlete_onboarding%rowtype;
 v_baseline public.athlete_training_baseline%rowtype;
 v_existing_min int;
 v_existing_count int;
 v_existing jsonb;
 v_device_sessions int;
 v_device_weeks int;
 v_device_sec bigint;
 v_last7_sec bigint;
 v_manual int;
 v_rejected int;
 v_hard_sessions int;
 v_hard_feedback int;
 v_concern text;
 v_available numeric;
 v_reported numeric;
 v_observed numeric;
 v_proposed numeric;
 v_category text;
 v_reason text;
 v_limit numeric;
 v_source text;
 v_priority text;
 v_last_sport jsonb;
begin
 if v_coach is null or auth.jwt()->'app_metadata'->>'role' is distinct from 'coach'
 then raise exception 'Verified AZUR coach account required';end if;
 if not exists(select 1 from public.coach_athlete_assignment a
 where a.coach_user_id=v_coach and a.athlete_id=p_athlete_id)
 then raise exception 'Athlete is not assigned to this coach account';end if;
 select * into v_onboarding from public.athlete_onboarding
 where user_id=(select user_id from public.athlete_profile where id=p_athlete_id);
 select * into v_baseline from public.athlete_training_baseline
 where athlete_id=p_athlete_id;
 v_week:=(now() at time zone 'Europe/London')::date;
 v_week:=v_week+(8-extract(isodow from v_week)::int);

 select coalesce(sum(duration_min),0)::int,count(*),
        coalesce(jsonb_agg(jsonb_build_object('date',planned_date,'sport',sport,
         'title',title,'duration_min',duration_min,'status',status,
         'locked',locked,'generation_source',targets->>'generation_source')
         order by planned_date,sport),'[]'::jsonb)
 into v_existing_min,v_existing_count,v_existing
 from public.planned_session
 where athlete_id=p_athlete_id and is_active_version
 and planned_date>=v_week and planned_date<v_week+7;

 -- Prioritise only validated nonmanual, deduplicated device activities.
 with ranked as (
  select a.*,
   row_number() over(partition by coalesce(nullif(a.duplicate_group_key,''),
     case when a.source_activity_id is not null
      then a.source||':'||a.source_activity_id else a.id::text end)
    order by case when a.processed_metrics->>'load_status'='validated'
     and a.source<>'manual' then 0 else 1 end,a.created_at desc,a.id) as rn
  from public.completed_activity a
  where a.athlete_id=p_athlete_id
    and a.start_time between now()-interval '28 days' and now()
 ), dedup as (select * from ranked where rn=1)
 select
  count(*) filter(where source<>'manual'
   and processed_metrics->>'load_status'='validated'
   and duration_sec between 60 and 86400),
  count(distinct date_trunc('week',start_time at time zone 'Europe/London'))
   filter(where source<>'manual'
    and processed_metrics->>'load_status'='validated'
    and duration_sec between 60 and 86400),
  coalesce(sum(duration_sec) filter(where source<>'manual'
    and processed_metrics->>'load_status'='validated'
    and duration_sec between 60 and 86400),0),
  coalesce(sum(duration_sec) filter(where source<>'manual'
    and processed_metrics->>'load_status'='validated'
    and duration_sec between 60 and 86400
    and start_time>=now()-interval '7 days'),0),
  count(*) filter(where source='manual'),
  count(*) filter(where processed_metrics->>'load_status' in ('pending_validation','rejected')),
  count(*) filter(where source<>'manual'
    and processed_metrics->>'load_status'='validated'
    and start_time>=now()-interval '7 days'
    and session_rpe>=8),
  (select coalesce(jsonb_object_agg(sport,minutes),'{}'::jsonb) from (
    select sport::text as sport,
     round(sum(duration_sec)::numeric/60)::int as minutes
    from dedup where source<>'manual'
    and processed_metrics->>'load_status'='validated'
    and duration_sec between 60 and 86400
    group by sport) sports)
 into v_device_sessions,v_device_weeks,v_device_sec,v_last7_sec,v_manual,v_rejected,
  v_hard_sessions,v_last_sport
 from dedup;

 select count(*) into v_hard_feedback
 from public.session_feedback f
 where f.athlete_id=p_athlete_id
 and f.updated_at>=now()-interval '7 days'
 and f.session_rpe>=8;

 v_available:=greatest(0,least(25,coalesce(v_onboarding.weekly_hours,0)));
 v_reported:=v_onboarding.recent_weekly_hours;
 v_observed:=round(v_device_sec::numeric/14400,1);
 v_concern:=coalesce(v_onboarding.current_training_concern,'unknown');
 v_priority:=coalesce(nullif(v_baseline.development_sport,''),'not_assessed');
 v_category:='needs_coach_review';
 v_source:='incomplete_activity_coverage';
 v_proposed:=null;

 if v_concern<>'none' then
   v_category:='safety_hold';
   v_source:='athlete_reported_concern';
   v_reason:='Athlete has an unresolved training concern. Do not automatically adjust training or add intensity. Coach must assess readiness.';
 elsif v_hard_sessions>=2 or v_hard_feedback>=2 then
   v_category:='recovery_review';
   v_source:='recent_high_exertion_proxy';
   v_limit:=round(least(v_existing_min::numeric/60,coalesce(v_baseline.weekly_hours,v_available))*0.80*2)/2;
   v_proposed:=greatest(0,v_limit);
   v_reason:='Multiple high-RPE sessions were recorded in the last 7 days. Consider a recovery week and athlete check-in. RPE is a warning signal, not a medical readiness score.';
 elsif v_device_sessions<8 or v_device_weeks<3 then
   v_category:='history_needed';
   v_reason:='Not enough validated, deduplicated device history for evidence-based progression. Maintain the current approved programme and review missing sync or training logs.';
 elsif v_existing_count=0 then
   v_category:='coach_plan_needed';
   v_source:='no_future_week';
   v_reason:='No active programme exists for the next training week. Coach should generate and approve a full week before publication.';
 else
   v_category:='conservative_reference';
   v_source:='validated_28_day_device_observations';
   -- No numerical intensification from self-report or inferred sport deficits.
   -- This is only a ceiling for a coach's *next* proposed week.
   v_limit:=least(v_available,
     coalesce(v_baseline.max_weekly_hours,v_available),
     v_observed*1.05,
     v_existing_min::numeric/60*1.05,
     8);
   v_proposed:=greatest(0,round(v_limit*2)/2);
   if v_proposed<v_existing_min::numeric/60 then
    v_reason:='Observed validated volume is below the current next-week plan. Coach should reconcile missing activity sync and consider a reduction.';
   else
    v_reason:='Validated history supports maintaining a conservative easy-training week, subject to the coach confirming readiness, adherence and goal relevance.';
   end if;
 end if;

 return jsonb_build_object(
 'week_start',v_week,
 'status',v_category,
 'reason',v_reason,
 'basis',v_source,
 'confidence',case when v_device_sessions>=8 and v_device_weeks>=3 then 'limited_validated' else 'insufficient' end,
 'suggested_max_weekly_hours',v_proposed,
 'existing_week_hours',round(v_existing_min::numeric/60,2),
 'existing_sessions',v_existing,
 'existing_session_count',v_existing_count,
 'available_weekly_hours',v_available,
 'reported_recent_hours',v_reported,
 'validated_28d_hours',round(v_device_sec::numeric/3600,1),
 'validated_weekly_average_hours',v_observed,
 'validated_sessions',v_device_sessions,
 'weeks_with_validated_activities',v_device_weeks,
 'manual_activities',v_manual,
 'pending_rejected_activities',v_rejected,
 'recent_7d_validated_hours',round(v_last7_sec::numeric/3600,1),
 'recent_hard_rpe_sessions',v_hard_sessions,
 'recent_hard_rpe_feedback',v_hard_feedback,
 'training_concern',v_concern,
 'development_sport',v_priority,
 'validated_sport_minutes',v_last_sport,
 'recommendation_type','coach_review_only',
 'publication_status','no_changes_made',
 'workout_selection_guidance','Keep coach-approved easy sessions. No FTP, CSS, threshold, intensity or sport-priority progression without validated benchmarks and specific coach review.',
 'next_action',case when v_category in ('safety_hold','recovery_review') then 'Assess readiness and athlete feedback before any future plan changes'
 when v_category='history_needed' then 'Review recent device sync and actual completed training'
 when v_category='coach_plan_needed' then 'Create an approved complete training week'
 else 'Compare the proposed cap with the current plan and explicitly approve any changes' end);
end;
$adaptive$;
revoke all on function public.coach_next_week_adaptive_preview(uuid) from public,anon;
grant execute on function public.coach_next_week_adaptive_preview(uuid) to authenticated;
