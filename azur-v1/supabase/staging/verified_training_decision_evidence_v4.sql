-- Stage only: evidence-backed coach review V4.1.
-- Persist the evidence seen at decision time for later audit.
alter table public.foundation_reassessment_decision
 add column if not exists evidence_snapshot jsonb;

create or replace function public.coach_foundation_training_evidence(p_request_id uuid)
returns jsonb language plpgsql security definer
set search_path=public,pg_temp
as $evidence$
declare
 v_coach uuid:=auth.uid();
 v_athlete uuid;
 v_reported numeric;
 v_proposed numeric;
 v_total int;
 v_validated_count int;
 v_manual_count int;
 v_pending_count int;
 v_duplicate_count int;
 v_accepted_seconds bigint;
 v_manual_seconds bigint;
 v_validated_weeks int;
 v_activity_weeks jsonb;
 v_sports jsonb;
 v_avg numeric;
 v_adequacy text;
 v_note text;
begin
 if v_coach is null or auth.jwt()->'app_metadata'->>'role' is distinct from 'coach'
 then raise exception 'AZUR coach account required';end if;
 select r.athlete_id,(r.inputs->>'recent_weekly_hours')::numeric,
   (r.preview->>'total_minutes')::numeric/120
 into v_athlete,v_reported,v_proposed
 from public.foundation_reassessment_request r
 join public.coach_athlete_assignment a on a.athlete_id=r.athlete_id
 and a.coach_user_id=v_coach
 where r.id=p_request_id;
 if v_athlete is null then raise exception 'Review is not assigned to your coach account';end if;

 -- Imported activity feeds may contain the same underlying session more
 -- than once. Count validated device sessions only once per explicit
 -- duplicate group or source/activity ID, retaining ungrouped records.
 with candidates as (
   select a.*,
     row_number() over(partition by
       coalesce(nullif(a.duplicate_group_key,''),
         case when a.source_activity_id is not null
           then a.source||':'||a.source_activity_id
           else a.id::text end)
       order by case when a.processed_metrics->>'load_status'='validated'
                      and a.source<>'manual' then 0 else 1 end,
                a.created_at desc,a.id) as duplicate_rank
   from public.completed_activity a
   where a.athlete_id=v_athlete
     and a.start_time>=now()-interval '28 days'
     and a.start_time<=now()
 ), accepted as (
   select * from candidates
   where duplicate_rank=1
 ), by_week as (
   select date_trunc('week',start_time at time zone 'Europe/London')::date as week_start,
     count(*) filter(where source<>'manual'
       and processed_metrics->>'load_status'='validated'
       and duration_sec between 60 and 86400) as sessions,
     coalesce(sum(duration_sec) filter(where source<>'manual'
       and processed_metrics->>'load_status'='validated'
       and duration_sec between 60 and 86400),0) as duration_seconds
   from accepted
   group by 1
 ), by_sport as (
   select sport::text as sport,
     count(*) as sessions,
     coalesce(sum(duration_sec),0) as duration_seconds
   from accepted
   where source<>'manual'
     and processed_metrics->>'load_status'='validated'
     and duration_sec between 60 and 86400
   group by sport
 )
 select
   (select count(*) from accepted),
   (select count(*) from accepted where source<>'manual'
       and processed_metrics->>'load_status'='validated'
       and duration_sec between 60 and 86400),
   (select count(*) from accepted where source='manual'),
   (select count(*) from accepted where processed_metrics->>'load_status'
       in ('pending_validation','rejected')),
   (select count(*) from candidates where duplicate_rank>1),
   (select coalesce(sum(duration_sec),0) from accepted
       where source<>'manual' and processed_metrics->>'load_status'='validated'
       and duration_sec between 60 and 86400),
   (select coalesce(sum(duration_sec),0) from accepted
       where source='manual' and duration_sec between 60 and 86400),
   (select count(*) from by_week where sessions>0),
   (select coalesce(jsonb_agg(jsonb_build_object(
       'week_start',g.week_start::date,
       'validated_hours',round(coalesce(w.duration_seconds,0)::numeric/3600,1),
       'validated_sessions',coalesce(w.sessions,0))
       order by g.week_start),'[]'::jsonb)
     from generate_series(
       date_trunc('week',((now() at time zone 'Europe/London')::date-interval '21 days'))::date,
       date_trunc('week',(now() at time zone 'Europe/London')::date)::date,
       interval '1 week') g(week_start)
     left join by_week w on w.week_start=g.week_start::date),
   (select coalesce(jsonb_agg(jsonb_build_object(
       'sport',sport,'validated_hours',round(duration_seconds::numeric/3600,1),
       'sessions',sessions) order by sport),'[]'::jsonb) from by_sport)
 into v_total,v_validated_count,v_manual_count,v_pending_count,v_duplicate_count,
   v_accepted_seconds,v_manual_seconds,v_validated_weeks,v_activity_weeks,v_sports;
 v_avg:=round(v_accepted_seconds::numeric/14400,1);
 v_adequacy:=case
   when v_validated_count>=8 and v_validated_weeks>=3
     then 'moderate_validated_coverage'
   else 'insufficient_validated_history' end;
 v_note:=case
   when v_adequacy='insufficient_validated_history' then
    'Too little validated activity history to support an automated training-volume increase. Ask for additional evidence and check sync coverage.'
   when v_reported is not null and v_avg < v_reported*0.6 then
    'Validated activity volume is markedly below athlete-reported hours. This may reflect incomplete device sync; reconcile before approving.'
   else
    'Validated activity history is available for review. Check sport balance, missing devices, readiness, and changes in actual training before approving.'
 end;
 return jsonb_build_object(
  'window_days',28,
  'reported_weekly_hours',v_reported,
  'proposed_weekly_hours',round(v_proposed,1),
  'total_recorded_activities',v_total,
  'validated_device_activities',v_validated_count,
  'manual_activities',v_manual_count,
  'pending_or_rejected_activities',v_pending_count,
  'duplicate_records_excluded',v_duplicate_count,
  'weeks_with_activity',v_validated_weeks,
  'validated_device_hours_28d',round(v_accepted_seconds::numeric/3600,1),
  'manual_reported_hours_28d',round(v_manual_seconds::numeric/3600,1),
  'verified_weekly_average_hours',v_avg,
  'history_adequacy',v_adequacy,
  'weekly_validated_load',v_activity_weeks,
  'sport_distribution',v_sports,
  'decision_guidance',v_note,
  'note','This is partial observed device activity, not proof of full training capacity. Only deduplicated validated non-manual sessions contribute to observed volume; pending/rejected or manual training are excluded.'
 );
end;
$evidence$;
revoke all on function public.coach_foundation_training_evidence(uuid) from public,anon;
grant execute on function public.coach_foundation_training_evidence(uuid) to authenticated;

create or replace function public.decide_foundation_reassessment(
 p_request_id uuid,p_decision text,p_review_note text)
returns jsonb
language plpgsql security definer
set search_path=public,pg_temp
as $decision$
declare
 v_coach uuid:=auth.uid();
 v_role text:=auth.jwt()->'app_metadata'->>'role';
 v_request public.foundation_reassessment_request%rowtype;
 v_athlete_user uuid;
 v_plan jsonb;
 v_saved_claim text;
 v_week_start date;
 v_current_start date;
 v_existing_sig text;
 v_item jsonb;
 v_week date;
 v_week_id uuid;
 v_count integer:=0;
 v_total integer:=0;
 v_week_minutes integer;
 v_week_cap integer;
 v_evidence jsonb;
begin
 if v_coach is null or v_role is distinct from 'coach' then
   raise exception 'Only an authenticated AZUR coach can decide training';
 end if;
 if p_request_id is null or p_decision not in ('approved','rejected')
   or length(trim(coalesce(p_review_note,''))) not between 15 and 1000 then
   raise exception 'Decision and a 15–1000 character coaching rationale are required';
 end if;

 select * into v_request
 from public.foundation_reassessment_request where id=p_request_id for update;
 if not found then raise exception 'Review request not found';end if;
 -- Permissions are checked against the *current* assignment at decision time.
 if not exists(select 1 from public.coach_athlete_assignment a
   where a.athlete_id=v_request.athlete_id and a.coach_user_id=v_coach)
 then raise exception 'This athlete is not assigned to your coach account';end if;
 if exists(select 1 from public.foundation_reassessment_decision d
   where d.request_id=p_request_id) then
   raise exception 'This review has already been decided';
 end if;
 select p.user_id into v_athlete_user from public.athlete_profile p
 where p.id=v_request.athlete_id;
 if v_athlete_user is null then raise exception 'Athlete account missing';end if;

 -- Capture the evidence available at the moment of the decision, not
 -- merely what happens to be synced when the coach opens the screen later.
 v_evidence:=public.coach_foundation_training_evidence(p_request_id);
 -- A coach can decline without altering any planned sessions.
 if p_decision='rejected' then
   insert into public.foundation_reassessment_decision
     (request_id,coach_user_id,decision,review_note,evidence_snapshot)
   values(p_request_id,v_coach,'rejected',trim(p_review_note),v_evidence);
   return jsonb_build_object('status','declined','calendar_changed',false,
      'request_id',p_request_id);
 end if;

 -- Serialize all planning changes for this athlete, including the athlete RPC.
 perform pg_advisory_xact_lock(hashtext(v_athlete_user::text),55103);
 if exists(select 1 from public.athlete_onboarding o
   where o.user_id=v_athlete_user and o.current_training_concern is distinct from 'none')
 then raise exception 'A current training concern requires a new safety review';end if;

 -- Recompute using the *original athlete's* authenticated preview function.
 -- This temporary claim switch is limited to the privileged function, is restored
 -- before any writes and is never accepted from request parameters.
 v_saved_claim:=current_setting('request.jwt.claim.sub',true);
 perform set_config('request.jwt.claim.sub',v_athlete_user::text,true);
 v_plan:=public.preview_foundation_reassessment(v_request.inputs);
 perform set_config('request.jwt.claim.sub',coalesce(v_saved_claim,''),true);
 if v_plan is distinct from v_request.preview then
   raise exception 'The calendar or proposal has changed; ask the athlete to submit a fresh review';
 end if;
 if v_plan->>'status'<>'coach_review_required'
   or v_plan->>'reason' not like 'Material increase beyond 20%%' then
   raise exception 'This proposal is not eligible for coach-authorised increase';
 end if;
 v_week_start:=(v_plan->>'week_start')::date;
 v_current_start:=(now() at time zone 'Europe/London')::date;
 v_current_start:=v_current_start+(8-extract(isodow from v_current_start)::int);
 if v_week_start<>v_current_start then
   raise exception 'The proposed weeks are no longer current. Request a fresh preview';
 end if;
 v_week_cap:=(v_plan->>'week_cap_minutes')::integer;
 if v_week_cap<=0 or v_week_cap>480
   or jsonb_typeof(v_plan->'sessions')<>'array'
   or jsonb_array_length(v_plan->'sessions')=0
   or jsonb_array_length(v_plan->'sessions')>12 then
   raise exception 'Unacceptable foundation plan';
 end if;
 if exists(select 1 from public.season_week w
   where w.athlete_id=v_request.athlete_id
     and w.week_start in (v_week_start,v_week_start+7)
     and (w.locked or w.phase<>'Foundation'))
 then raise exception 'Coach-managed or locked training week must be preserved';end if;
 if exists(select 1 from public.planned_session p
   where p.athlete_id=v_request.athlete_id and p.is_active_version
   and p.planned_date>=v_week_start and p.planned_date<v_week_start+14
   and (p.locked or p.status<>'planned'
     or coalesce(p.targets->>'generation_source','')<>'onboarding_foundation'))
 then raise exception 'Completed, changed or coach-authored sessions must be preserved';end if;

 -- Independent fingerprint check. The exact-preview recomputation already
 -- checks this; this duplicate guard prevents a regression in either layer.
 select coalesce(md5(string_agg(
  p.id::text||':'||p.updated_at::text||':'||p.status::text||':'||
  p.locked::text||':'||p.is_active_version::text,
  '|' order by p.id)),md5('empty'))
 into v_existing_sig from public.planned_session p
 where p.athlete_id=v_request.athlete_id and p.is_active_version
 and p.planned_date>=v_week_start and p.planned_date<v_week_start+14;
 if v_existing_sig is distinct from v_plan->>'calendar_fingerprint' then
   raise exception 'The athlete calendar changed since review';end if;

 -- Do not change the current week. No completed/coach-managed sessions are touched.
 update public.athlete_onboarding set
   training_background=v_request.inputs->>'training_background',
   training_consistency=v_request.inputs->>'training_consistency',
   weekly_hours=(v_request.inputs->>'weekly_hours')::numeric,
   recent_weekly_hours=(v_request.inputs->>'recent_weekly_hours')::numeric,
   training_days=(select array_agg(distinct value::int order by value::int)
      from jsonb_array_elements_text(v_request.inputs->'training_days') value),
   can_swim_200m=(v_request.inputs->>'can_swim_200m')::boolean,
   updated_at=now()
 where user_id=v_athlete_user and onboarding_step=3;
 if not found then raise exception 'Completed athlete onboarding missing';end if;

 update public.planned_session p set is_active_version=false,updated_at=now()
 where p.athlete_id=v_request.athlete_id and p.is_active_version
   and p.planned_date>=v_week_start and p.planned_date<v_week_start+14
   and p.status='planned' and not p.locked
   and p.targets->>'generation_source'='onboarding_foundation';

 for v_item in select value from jsonb_array_elements(v_plan->'sessions') loop
   v_week:=(v_item->>'week_start')::date;
   if v_week not in (v_week_start,v_week_start+7)
     or (v_item->>'date')::date<v_week
     or (v_item->>'date')::date>=v_week+7 then
     raise exception 'Preview includes an invalid future workout date';
   end if;
   if (v_item->>'duration_min')::int not between 15 and 180 then
      raise exception 'Workout duration outside approved foundation bounds';end if;
   insert into public.season_week
     (athlete_id,week_start,phase,target_hours,benchmark_week,locked)
   values (v_request.athlete_id,v_week,'Foundation',
      round(v_week_cap::numeric/60,1),false,false)
   on conflict(athlete_id,week_start) do nothing;
   select id into v_week_id from public.season_week
    where athlete_id=v_request.athlete_id and week_start=v_week
      and phase='Foundation' and not locked;
   if v_week_id is null then raise exception 'Foundation training week not available';end if;
   update public.season_week set target_hours=round(v_week_cap::numeric/60,1)
    where id=v_week_id and phase='Foundation' and not locked;
   insert into public.planned_session
    (season_week_id,athlete_id,planned_date,sport,title,session_class,priority,
     duration_min,targets,prescription,rationale,status,locked,is_active_version)
   values (
     v_week_id,v_request.athlete_id,(v_item->>'date')::date,
     (v_item->>'sport')::public.sport_type,v_item->>'title','easy',2,
     (v_item->>'duration_min')::int,
     jsonb_build_object('generation_source','onboarding_foundation',
       'selection_source',v_item->>'selection_source',
       'workout_library_id',v_item->>'workout_library_id',
       'session_family',v_item->>'family',
       'training_tier',v_plan->>'training_tier',
       'capacity_basis',v_plan->>'capacity_basis',
       'athlete_reported',true,'coach_approved_increase',true,
       'approval_request_id',p_request_id,
       'rpe_min',2,'rpe_max',4,
       'requires_coach_review_for_progression',true),
     v_item->'prescription',
     'Automatically published upon assigned coach approval of this exact future-week programme. No automatic intensity progression.',
     'planned',false,true);
   v_count:=v_count+1;
   v_total:=v_total+(v_item->>'duration_min')::int;
 end loop;
 if v_total<>(v_plan->>'total_minutes')::integer then
   raise exception 'Published volume differs from the approved proposal';end if;
 if exists(
  select 1 from public.planned_session p
  where p.athlete_id=v_request.athlete_id and p.is_active_version
   and p.planned_date>=v_week_start and p.planned_date<v_week_start+14
  group by p.planned_date-(extract(isodow from p.planned_date)::int-1)
  having sum(p.duration_min)>v_week_cap
 ) then raise exception 'Published week exceeds the approved capacity cap';end if;
 insert into public.foundation_reassessment_decision
   (request_id,coach_user_id,decision,review_note,evidence_snapshot)
 values(p_request_id,v_coach,'approved',trim(p_review_note),v_evidence);
 return jsonb_build_object('status','approved_and_applied',
   'calendar_changed',true,'sessions',v_count,
   'week_start',v_week_start,'request_id',p_request_id);
end;
$decision$;


revoke all on function public.decide_foundation_reassessment(uuid,text,text) from public,anon;
grant execute on function public.decide_foundation_reassessment(uuid,text,text) to authenticated;
