-- AZUR staging: immutable athlete requests and audited assigned-coach decisions.
create table if not exists public.foundation_reassessment_request (
 id uuid primary key default gen_random_uuid(),
 athlete_id uuid not null references public.athlete_profile(id),
 inputs jsonb not null,
 preview jsonb not null,
 preview_hash text not null,
 created_at timestamptz not null default now(),
 unique(athlete_id,preview_hash),
 check(jsonb_typeof(inputs)='object' and jsonb_typeof(preview)='object')
);
create table if not exists public.foundation_reassessment_decision (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null unique references public.foundation_reassessment_request(id),
 coach_user_id uuid not null,
 decision text not null check(decision in ('approved','rejected')),
 review_note text not null check(length(trim(review_note)) between 15 and 1000),
 decided_at timestamptz not null default now()
);
alter table public.foundation_reassessment_request enable row level security;
alter table public.foundation_reassessment_decision enable row level security;
revoke all on public.foundation_reassessment_request,public.foundation_reassessment_decision from anon;
revoke all on public.foundation_reassessment_request,public.foundation_reassessment_decision from authenticated;
grant select,insert on public.foundation_reassessment_request to authenticated;
grant select,insert on public.foundation_reassessment_decision to authenticated;
drop policy if exists foundation_request_athlete_select on public.foundation_reassessment_request;
create policy foundation_request_athlete_select on public.foundation_reassessment_request
 for select to authenticated using (
  exists(select 1 from public.athlete_profile p where p.id=athlete_id and p.user_id=(select auth.uid()))
 );
drop policy if exists foundation_request_assigned_coach_select on public.foundation_reassessment_request;
create policy foundation_request_assigned_coach_select on public.foundation_reassessment_request
 for select to authenticated using (
  (auth.jwt()->'app_metadata'->>'role')='coach' and
  exists(select 1 from public.coach_athlete_assignment a
   where a.athlete_id=athlete_id and a.coach_user_id=(select auth.uid()))
 );
drop policy if exists foundation_request_athlete_insert on public.foundation_reassessment_request;
create policy foundation_request_athlete_insert on public.foundation_reassessment_request
 for insert to authenticated with check (
   exists(select 1 from public.athlete_profile p where p.id=athlete_id and p.user_id=(select auth.uid()))
 );
drop policy if exists foundation_decision_athlete_select on public.foundation_reassessment_decision;
create policy foundation_decision_athlete_select on public.foundation_reassessment_decision
 for select to authenticated using (
   exists(select 1 from public.foundation_reassessment_request r
      join public.athlete_profile p on p.id=r.athlete_id
      where r.id=request_id and p.user_id=(select auth.uid()))
 );
drop policy if exists foundation_decision_coach_select on public.foundation_reassessment_decision;
create policy foundation_decision_coach_select on public.foundation_reassessment_decision
 for select to authenticated using (
   (auth.jwt()->'app_metadata'->>'role')='coach' and coach_user_id=(select auth.uid())
   and exists(select 1 from public.foundation_reassessment_request r
      join public.coach_athlete_assignment a on a.athlete_id=r.athlete_id
      where r.id=request_id and a.coach_user_id=(select auth.uid()))
 );
drop policy if exists foundation_decision_coach_insert on public.foundation_reassessment_decision;
create policy foundation_decision_coach_insert on public.foundation_reassessment_decision
 for insert to authenticated with check (
   (auth.jwt()->'app_metadata'->>'role')='coach'
   and coach_user_id=(select auth.uid())
   and exists(select 1 from public.foundation_reassessment_request r
    join public.coach_athlete_assignment a on a.athlete_id=r.athlete_id
    where r.id=request_id and a.coach_user_id=(select auth.uid()))
 );

-- Only allow submission of exactly the latest server-generated material-increase preview.
create or replace function public.submit_foundation_coach_review(p_inputs jsonb,p_expected_preview jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
 v_user uuid:=auth.uid();v_athlete uuid;v_actual jsonb;
 v_id uuid;v_existing text;v_has_coach boolean;
begin
 if v_user is null then raise exception 'Athlete sign-in required';end if;
 perform pg_advisory_xact_lock(hashtext(v_user::text),55103);
 select id into v_athlete from public.athlete_profile where user_id=v_user;
 if v_athlete is null then raise exception 'Athlete account missing';end if;
 v_actual:=public.preview_foundation_reassessment(p_inputs);
 if v_actual is distinct from p_expected_preview then raise exception 'Preview changed. Refresh before requesting review';end if;
 if v_actual->>'status'<>'coach_review_required'
   or v_actual->>'reason' not like 'Material increase beyond 20%%' then
     return jsonb_build_object('status','not_reviewable','reason',coalesce(v_actual->>'reason','Coach review not required for this proposal'));
 end if;
 select exists(select 1 from public.coach_athlete_assignment
  where athlete_id=v_athlete) into v_has_coach;
 if not v_has_coach then
  return jsonb_build_object('status','coach_assignment_required',
   'reason','Connect to an AZUR coach before requesting a material training increase');
 end if;
 v_existing:=md5(p_inputs::text||'|'||p_expected_preview::text);
 insert into public.foundation_reassessment_request(athlete_id,inputs,preview,preview_hash)
 values(v_athlete,p_inputs,p_expected_preview,v_existing)
 on conflict(athlete_id,preview_hash) do nothing
 returning id into v_id;
 if v_id is null then
   select id into v_id from public.foundation_reassessment_request
   where athlete_id=v_athlete and preview_hash=v_existing;
 end if;
 if v_id is null then raise exception 'Unable to save coach review request';end if;
 return jsonb_build_object('status','submitted','request_id',v_id);
end;
$$;
revoke all on function public.submit_foundation_coach_review(jsonb,jsonb) from public,anon;
grant execute on function public.submit_foundation_coach_review(jsonb,jsonb) to authenticated;

-- Coach approval is a narrow exception: the old three-hour planned week alone
-- must not be treated as verified training capacity. The coach has to explicitly
-- approve this exact plan, and the athlete then confirms it themselves.
-- The original function continues to enforce RLS, no edits to current week,
-- existing coach workout safeguards and atomic rechecking.
create or replace function public.apply_foundation_reassessment(
 p_inputs jsonb,p_expected_preview jsonb,p_confirm boolean)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
 v_user uuid:=auth.uid();v_athlete uuid;v_plan jsonb;
 v_start date;v_week date;v_week_id uuid;v_item jsonb;v_n int:=0;
 v_approved boolean:=false;
begin
 if v_user is null or p_confirm is distinct from true then
   raise exception 'Authenticated, explicit athlete confirmation is required';
 end if;
 perform pg_advisory_xact_lock(hashtext(v_user::text),55103);
 select id into v_athlete from public.athlete_profile where user_id=v_user;
 if v_athlete is null then raise exception 'Athlete profile missing';end if;
 v_plan:=public.preview_foundation_reassessment(p_inputs);
 if p_expected_preview is distinct from v_plan then
   raise exception 'Preview or calendar changed. Refresh and review the updated proposal';
 end if;
 if v_plan->>'status'='coach_review_required'
   and v_plan->>'reason' like 'Material increase beyond 20%%' then
   select exists(
     select 1 from public.foundation_reassessment_request r
       join public.foundation_reassessment_decision d on d.request_id=r.id
       join public.coach_athlete_assignment a on a.athlete_id=r.athlete_id
           and a.coach_user_id=d.coach_user_id
     where r.athlete_id=v_athlete and r.inputs=p_inputs and r.preview=v_plan
       and d.decision='approved'
   ) into v_approved;
 end if;
 if v_plan->>'status'<>'ready_for_confirmation' and not v_approved then
   raise exception 'Coach review required or calendar is not safely replaceable: %',coalesce(v_plan->>'reason','invalid plan');
 end if;
 v_start:=(v_plan->>'week_start')::date;
 if exists(select 1 from public.season_week w where w.athlete_id=v_athlete
   and w.week_start in (v_start,v_start+7) and (w.locked or w.phase<>'Foundation')) then
   raise exception 'Coach-managed or locked training week cannot be replaced';
 end if;
 if exists(select 1 from public.planned_session p where p.athlete_id=v_athlete
   and p.is_active_version and p.planned_date>=v_start and p.planned_date<v_start+14
   and (p.locked or p.status<>'planned'
    or coalesce(p.targets->>'generation_source','')<>'onboarding_foundation')) then
   raise exception 'A coach-authored, completed or locked session exists; do not replace';
 end if;
 update public.athlete_onboarding set
   training_background=p_inputs->>'training_background',
   training_consistency=p_inputs->>'training_consistency',
   weekly_hours=(p_inputs->>'weekly_hours')::numeric,
   recent_weekly_hours=(p_inputs->>'recent_weekly_hours')::numeric,
   training_days=(select array_agg(distinct x.value::int order by x.value::int)
      from jsonb_array_elements_text(p_inputs->'training_days') x(value)),
   can_swim_200m=(p_inputs->>'can_swim_200m')::boolean,
   updated_at=now()
 where user_id=v_user and onboarding_step=3;
 if not found then raise exception 'Onboarding not found';end if;
 update public.planned_session p set is_active_version=false,updated_at=now()
 where p.athlete_id=v_athlete and p.is_active_version and
   p.planned_date>=v_start and p.planned_date<v_start+14
   and p.status='planned' and not p.locked and
   p.targets->>'generation_source'='onboarding_foundation';
 for v_item in select value from jsonb_array_elements(v_plan->'sessions') loop
   v_week:=(v_item->>'week_start')::date;
   insert into public.season_week(athlete_id,week_start,phase,target_hours,benchmark_week,locked)
   values(v_athlete,v_week,'Foundation',round((v_plan->>'week_cap_minutes')::numeric/60,1),false,false)
   on conflict(athlete_id,week_start) do nothing;
   select id into v_week_id from public.season_week where athlete_id=v_athlete
     and week_start=v_week and phase='Foundation' and not locked;
   if v_week_id is null then raise exception 'Safe foundation week missing';end if;
   update public.season_week
     set target_hours=round((v_plan->>'week_cap_minutes')::numeric/60,1)
     where id=v_week_id and phase='Foundation' and not locked;
   insert into public.planned_session(
    season_week_id,athlete_id,planned_date,sport,title,session_class,priority,
    duration_min,targets,prescription,rationale,status,locked,is_active_version)
   values(v_week_id,v_athlete,(v_item->>'date')::date,
    (v_item->>'sport')::public.sport_type,v_item->>'title','easy',2,
    (v_item->>'duration_min')::int,
    jsonb_build_object('generation_source','onboarding_foundation',
      'selection_source',v_item->>'selection_source','workout_library_id',v_item->>'workout_library_id',
      'session_family',v_item->>'family','training_tier',v_plan->>'training_tier',
      'capacity_basis',v_plan->>'capacity_basis','athlete_reported',true,
      'coach_approved_increase',v_approved,
      'rpe_min',2,'rpe_max',4,'requires_coach_review_for_progression',true),
    v_item->'prescription',
    case when v_approved then 'Exact increase authorised by assigned coach; athlete confirmed. No automatic intensity progression.'
      else 'Athlete-confirmed conservative foundation; major changes require coach review.' end,
    'planned',false,true);
   v_n:=v_n+1;
 end loop;
 return jsonb_build_object('status','applied','sessions',v_n,'week_start',v_start,
   'coach_approved_increase',v_approved);
end;
$$;
revoke all on function public.apply_foundation_reassessment(jsonb,jsonb,boolean) from public,anon;
grant execute on function public.apply_foundation_reassessment(jsonb,jsonb,boolean) to authenticated;
