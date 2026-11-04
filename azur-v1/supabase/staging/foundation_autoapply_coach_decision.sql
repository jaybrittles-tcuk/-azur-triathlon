-- Staging: A coach approval atomically updates the athlete's future foundation
-- calendar. Rejections leave the calendar unchanged. No second athlete click.
-- Execute with definer privileges only after revalidating assignment, role,
-- injury state, exact server-generated preview, and calendar fingerprint.
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

 -- A coach can decline without altering any planned sessions.
 if p_decision='rejected' then
   insert into public.foundation_reassessment_decision
     (request_id,coach_user_id,decision,review_note)
   values(p_request_id,v_coach,'rejected',trim(p_review_note));
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
   (request_id,coach_user_id,decision,review_note)
 values(p_request_id,v_coach,'approved',trim(p_review_note));
 return jsonb_build_object('status','approved_and_applied',
   'calendar_changed',true,'sessions',v_count,
   'week_start',v_week_start,'request_id',p_request_id);
end;
$decision$;

revoke all on function public.decide_foundation_reassessment(uuid,text,text)
 from public,anon;
grant execute on function public.decide_foundation_reassessment(uuid,text,text)
 to authenticated;

-- Legacy athlete routine-change apply remains intact. The athlete UI no longer
-- offers an extra apply action for coach-reviewed proposals.

-- Athlete sees the most recent coach decision and whether it actually changed
-- the active calendar. A declined proposal never counts as applied.
create or replace function public.latest_foundation_coach_decision()
returns jsonb language plpgsql security invoker
set search_path=public,pg_temp
as $latest$
declare v_user uuid:=auth.uid();v_athlete uuid;v_review record;
 v_applied int;
begin
 if v_user is null then raise exception 'Athlete authentication required';end if;
 select id into v_athlete from public.athlete_profile where user_id=v_user;
 if v_athlete is null then return jsonb_build_object('status','none');end if;
 select r.id as request_id,d.decision,d.review_note,d.decided_at
 into v_review
 from public.foundation_reassessment_request r
 join public.foundation_reassessment_decision d on d.request_id=r.id
 where r.athlete_id=v_athlete
 order by d.decided_at desc limit 1;
 if not found then return jsonb_build_object('status','none');end if;
 select count(*) into v_applied from public.planned_session p
 where p.athlete_id=v_athlete
 and p.is_active_version
 and p.targets->>'approval_request_id'=v_review.request_id::text;
 return jsonb_build_object(
   'status',case when v_review.decision='rejected' then 'declined'
                 when v_applied>0 then 'approved_and_applied'
                 else 'approved_pending_recheck' end,
   'coach_note',v_review.review_note,'decided_at',v_review.decided_at,
   'active_sessions',v_applied
 );
end;
$latest$;
revoke all on function public.latest_foundation_coach_decision() from public,anon;
grant execute on function public.latest_foundation_coach_decision() to authenticated;

-- Read-only evidence: source of training history is shown to the assigned coach.
-- No reported hours are silently promoted to verified completed volume.
create or replace function public.coach_foundation_training_evidence(p_request_id uuid)
returns jsonb language plpgsql security definer
set search_path=public,pg_temp
as $evidence$
declare
 v_coach uuid:=auth.uid();
 v_athlete uuid;
 v_summary record;
begin
 if v_coach is null or auth.jwt()->'app_metadata'->>'role' is distinct from 'coach'
 then raise exception 'AZUR coach account required';end if;
 select r.athlete_id into v_athlete from public.foundation_reassessment_request r
 join public.coach_athlete_assignment a on a.athlete_id=r.athlete_id
 and a.coach_user_id=v_coach
 where r.id=p_request_id;
 if v_athlete is null then raise exception 'Review request is not assigned to your coach account';end if;
 select
  count(*)::int as total_activities,
  count(*) filter(where source='manual')::int as manually_entered,
  count(*) filter(where source<>'manual'
    and processed_metrics->>'load_status'='validated')::int as validated_device_activities,
  count(*) filter(where coalesce(processed_metrics->>'load_status','') in
    ('rejected','pending_validation'))::int as awaiting_or_rejected,
  count(distinct (start_time at time zone 'Europe/London')::date)::int as active_days,
  coalesce(sum(duration_sec) filter(
    where source<>'manual' and processed_metrics->>'load_status'='validated'
      and duration_sec between 60 and 86400),0)::bigint as validated_device_seconds,
  coalesce(sum(duration_sec) filter(where source='manual'
     and duration_sec between 60 and 86400),0)::bigint as manually_reported_seconds,
  count(distinct date_trunc('week',start_time at time zone 'Europe/London'))::int as weeks_with_activity
 into v_summary
 from public.completed_activity
 where athlete_id=v_athlete and start_time>=now()-interval '28 days'
   and start_time<=now();
 return jsonb_build_object(
   'window_days',28,
   'total_recorded_activities',v_summary.total_activities,
   'validated_device_activities',v_summary.validated_device_activities,
   'manual_activities',v_summary.manually_entered,
   'pending_or_rejected_activities',v_summary.awaiting_or_rejected,
   'active_days',v_summary.active_days,
   'weeks_with_activity',v_summary.weeks_with_activity,
   'validated_device_hours_28d',round(v_summary.validated_device_seconds::numeric/3600,1),
   'manual_reported_hours_28d',round(v_summary.manually_reported_seconds::numeric/3600,1),
   'verified_weekly_average_hours',round(v_summary.validated_device_seconds::numeric/3600/4,1),
   'history_adequacy',case when v_summary.validated_device_activities<4
     or v_summary.weeks_with_activity<3 then 'insufficient_validated_history'
     else 'some_validated_history' end,
   'note','Only activity records with validated device load_status contribute to verified volume. Manual, pending and rejected records never count towards verified weekly hours.'
 );
end;
$evidence$;
revoke all on function public.coach_foundation_training_evidence(uuid) from public,anon;
grant execute on function public.coach_foundation_training_evidence(uuid) to authenticated;
