-- AZUR staging: evidence-gated proposed training week and atomic coach publishing.
-- Only existing, easy, threshold-free workouts can be carried forward.
-- No athlete action after coach decision; no automated unapproved publication.
create table if not exists public.coach_adaptive_week_decision (
 id uuid primary key default gen_random_uuid(),
 athlete_id uuid not null references public.athlete_profile(id),
 coach_user_id uuid not null,
 week_start date not null,
 decision text not null check(decision in ('approved','declined')),
 rationale text not null check(length(trim(rationale)) between 15 and 1000),
 proposal_snapshot jsonb not null,
 decided_at timestamptz not null default now(),
 unique(athlete_id,week_start)
);
alter table public.coach_adaptive_week_decision enable row level security;
revoke all on public.coach_adaptive_week_decision from anon,authenticated;
grant select on public.coach_adaptive_week_decision to authenticated;
drop policy if exists coach_adaptive_decision_select on public.coach_adaptive_week_decision;
create policy coach_adaptive_decision_select on public.coach_adaptive_week_decision
 for select to authenticated using (
  coach_user_id=auth.uid() and (auth.jwt()->'app_metadata'->>'role')='coach'
  and exists(select 1 from public.coach_athlete_assignment a
    where a.athlete_id=coach_adaptive_week_decision.athlete_id
      and a.coach_user_id=auth.uid())
 );

create or replace function public.coach_adaptive_week_proposal(p_athlete_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $proposal$
declare
 v_coach uuid:=auth.uid();
 v_basis jsonb;
 v_start date;
 v_target date;
 v_onboarding public.athlete_onboarding%rowtype;
 v_source_count int;
 v_source_min int;
 v_source_sports int;
 v_block text:='';
 v_candidate jsonb:='[]'::jsonb;
 v_record record;
 v_duration int;
 v_prescription jsonb;
 v_main int;
 v_original_main int;
 v_total int:=0;
 v_source_sig text;
 v_target_date date;
 v_mode text;
 v_limit numeric;
 v_race_weeks integer;
 v_race_phase text;
 v_race_reason text;
 v_distance text;
 v_development_sport text;
 v_strongest_sport text;
 v_priority_reason text;
 v_target_window text;
begin
 if v_coach is null or auth.jwt()->'app_metadata'->>'role' is distinct from 'coach'
 then raise exception 'Assigned AZUR coach required';end if;
 if not exists(select 1 from public.coach_athlete_assignment
   where athlete_id=p_athlete_id and coach_user_id=v_coach)
 then raise exception 'Athlete not assigned to this coach';end if;
 v_basis:=public.coach_next_week_adaptive_preview(p_athlete_id);
 v_start:=(v_basis->>'week_start')::date;
 select * into v_onboarding from public.athlete_onboarding
 where user_id=(select p.user_id from public.athlete_profile p where p.id=p_athlete_id);

 select count(*),coalesce(sum(duration_min),0),count(distinct sport)
 into v_source_count,v_source_min,v_source_sports
 from public.planned_session where athlete_id=p_athlete_id
 and is_active_version and planned_date>=v_start and planned_date<v_start+7;
 select coalesce(md5(string_agg(
    p.id::text||':'||p.updated_at::text||':'||p.duration_min::text||':'||
    p.status::text||':'||p.locked::text||':'||p.prescription::text||':'||p.targets::text,
    '|' order by p.id)),md5('empty'))
 into v_source_sig from public.planned_session p
 where p.athlete_id=p_athlete_id and p.is_active_version
 and p.planned_date>=v_start and p.planned_date<v_start+7;

 -- Choose the first genuinely empty, unlocked future week. Never replace
 -- a partially filled, coach-authored, locked or completed training week.
 select candidate into v_target
 from generate_series(1,4) n
 cross join lateral (select (v_start+n*7)::date as candidate) c
 where not exists(
  select 1 from public.planned_session p
  where p.athlete_id=p_athlete_id and p.is_active_version
    and p.planned_date>=candidate and p.planned_date<candidate+7)
 and not exists(
  select 1 from public.season_week w
  where w.athlete_id=p_athlete_id and w.week_start=candidate
   and (w.locked or w.phase<>'Foundation'))
 and not exists(
  select 1 from public.coach_adaptive_week_decision d
  where d.athlete_id=p_athlete_id and d.week_start=candidate)
 order by candidate limit 1;

 -- Race-aware policy: classify relative to the actual target week.
 -- Classification is guidance; it never authorises higher intensity or volume.
 v_distance:=lower(coalesce(v_onboarding.race_distance,'unknown'));
 select nullif(b.development_sport,''),nullif(b.strongest_sport,'')
 into v_development_sport,v_strongest_sport
 from public.athlete_training_baseline b where b.athlete_id=p_athlete_id;
 v_development_sport:=case when v_development_sport in ('swim','bike','run')
   then v_development_sport else null end;
 v_strongest_sport:=case when v_strongest_sport in ('swim','bike','run')
   then v_strongest_sport else null end;
 v_race_weeks:=case when v_onboarding.race_date is null or v_target is null
   then null else floor((v_onboarding.race_date-v_target)::numeric/7)::int end;
 v_race_phase:=case
   when v_onboarding.race_date is null then 'race_unset'
   when v_target>v_onboarding.race_date then 'post_race'
   when v_race_weeks<=3 then 'taper_or_race'
   when v_race_weeks<=11 then 'build'
   else 'base' end;
 v_target_window:=case when v_target is null then 'no_target_week'
  else v_target::text end;
 v_race_reason:=case v_race_phase
   when 'base' then 'Base phase: maintain easy aerobic frequency and technique with no unverified intensity progression.'
   when 'build' then 'Build phase: validate sport-specific progression and race durability with the coach before increasing intensity or volume.'
   when 'taper_or_race' then 'Taper/race phase: bespoke coach-managed sessions and race-week reduction required; continuation is blocked.'
   when 'post_race' then 'Post-race recovery and return-to-training must be coach-reviewed; continuation is blocked.'
   else 'Set a race date before AZUR can make race-specific training recommendations.' end;
 v_priority_reason:=case when v_development_sport is null
   then 'Development sport not confirmed: do not infer weaknesses from missing activities.'
   else 'Athlete-confirmed development sport: '||v_development_sport||
    '. Coach to assess technique and suitable frequency, without automatically adding load.' end;
 v_mode:=case when v_basis->>'status'='recovery_review'
   then 'recovery_reduction' else 'easy_continuation' end;
 if exists(select 1 from public.coach_adaptive_week_decision d
   where d.athlete_id=p_athlete_id and d.decision='approved'
     and d.proposal_snapshot->>'source_week_start'=v_start::text)
 then
   v_block:='An adaptive future week has already been published from this source. Review completed training before generating another.';
 end if;
 v_limit:=(v_basis->>'suggested_max_weekly_hours')::numeric;
 if v_target is null then
  v_block:='No empty, unlocked training week available within the four-week planning horizon';
 elsif v_block<>'' then
  null;
 elsif v_race_phase in ('taper_or_race','post_race') then
  v_block:='Race phase safety hold: '||v_race_reason;
 elsif v_basis->>'status' not in ('conservative_reference','recovery_review') then
  v_block:='Insufficient validated evidence or unresolved safety concern: '||coalesce(v_basis->>'reason','review required');
 elsif v_source_count<3 or v_source_count>7 or v_source_sports<2 then
  v_block:='A complete easy-training source week is required before proposing a future week';
 elsif exists(
  select 1 from public.planned_session p
  where p.athlete_id=p_athlete_id and p.is_active_version
   and p.planned_date>=v_start and p.planned_date<v_start+7
   and (not (extract(isodow from p.planned_date)::int-1=any(v_onboarding.training_days))
     or (p.sport='swim' and not coalesce(v_onboarding.can_swim_200m,false))))
 then
   v_block:='The source week conflicts with current training availability or swim safety confirmation';
 elsif v_onboarding.weekly_hours is null or v_onboarding.weekly_hours<2 then
   v_block:='Athlete training availability must be confirmed before continuation';
 elsif exists(
  select 1 from public.planned_session p
  where p.athlete_id=p_athlete_id and p.is_active_version
  and p.planned_date>=v_start and p.planned_date<v_start+7
  and (p.status<>'planned' or p.locked or p.session_class<>'easy'
    or jsonb_typeof(p.prescription->'steps') is distinct from 'array'
    or jsonb_array_length(p.prescription->'steps')<>3
    or p.prescription::text ~* '(FTP|CSS|%|threshold[[:space:]]*(pace|power|[0-9])|zone[[:space:]]*[1-9])'
    or (select sum((x.value->>'durationMin')::int)
        from jsonb_array_elements(p.prescription->'steps') x)<>p.duration_min)
 ) then
  v_block:='Source week contains coach-locked, non-easy, unstructured or threshold-based workouts';
 elsif v_basis->>'status'='conservative_reference'
    and (v_limit is null or v_limit*60 < v_source_min) then
  v_block:='Evidence-based ceiling is below the source week; coach must revise the load rather than copy it';
 end if;

 if v_target is not null and v_block='' then
  for v_record in
   select p.* from public.planned_session p
   where p.athlete_id=p_athlete_id and p.is_active_version
     and p.planned_date>=v_start and p.planned_date<v_start+7
   order by p.planned_date,p.id
  loop
   v_duration:=v_record.duration_min;
   v_prescription:=v_record.prescription;
   if v_mode='recovery_reduction' then
     v_duration:=greatest(20,floor(v_duration*0.8/5)::int*5);
     v_original_main:=(v_prescription#>>'{steps,1,durationMin}')::int;
     v_main:=v_original_main-(v_record.duration_min-v_duration);
     if v_main<5 then
      v_block:='Safe recovery reduction cannot preserve prescribed warm-up, main work and cooldown';
      exit;
     end if;
     v_prescription:=jsonb_set(v_prescription,'{steps,1,durationMin}',to_jsonb(v_main),false);
   end if;
   v_target_date:=v_target+(v_record.planned_date-v_start);
   v_candidate:=v_candidate||jsonb_build_array(jsonb_build_object(
      'date',v_target_date,'sport',v_record.sport,'title',v_record.title,
      'duration_min',v_duration,'source_session_id',v_record.id,
      'prescription',v_prescription,
      'selection_reason',case when v_mode='recovery_reduction'
       then 'Coach-reviewed recovery proposal, easier and shorter than the original aerobic session'
       else 'Maintain a previously coach-approved easy session without increasing intensity or weekly volume' end));
   v_total:=v_total+v_duration;
  end loop;
 end if;
 if v_block='' and (v_total>480 or v_total<=0
    or v_total>v_onboarding.weekly_hours*60) then
   v_block:='Resulting training volume is outside safe foundation limits';
 end if;
 return jsonb_build_object(
   'status',case when v_block='' then 'ready_for_coach' else 'blocked' end,
   'reason',nullif(v_block,''),
   'week_start',v_target,
   'source_week_start',v_start,
   'source_fingerprint',v_source_sig,
   'source_minutes',v_source_min,
   'proposed_minutes',v_total,
   'adaptation',v_mode,
   'race_phase',v_race_phase,
   'race_date',v_onboarding.race_date,
   'race_distance',v_distance,
   'weeks_to_race',v_race_weeks,
   'race_reason',v_race_reason,
   'development_sport',v_development_sport,
   'strongest_sport',v_strongest_sport,
   'sport_priority_reason',v_priority_reason,
   'race_guidance_only',true,
   'evidence_status',v_basis->>'status',
   'validated_28d_hours',v_basis->>'validated_28d_hours',
   'confidence',v_basis->>'confidence',
   'sessions',v_candidate,
   'coach_approval_required',true,
   'calendar_changed',false,
   'workout_safety','Only existing easy, RPE-led structured workouts; no new threshold sessions or intensity.');
end;
$proposal$;
revoke all on function public.coach_adaptive_week_proposal(uuid) from public,anon;
grant execute on function public.coach_adaptive_week_proposal(uuid) to authenticated;

create or replace function public.coach_decide_adaptive_week(
 p_athlete_id uuid,p_preview jsonb,p_decision text,p_rationale text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $decision$
declare
 v_coach uuid:=auth.uid();
 v_athlete_user uuid;
 v_actual jsonb;
 v_target date;
 v_item jsonb;
 v_week_id uuid;
 v_count int:=0;
 v_minutes int:=0;
begin
 if v_coach is null or auth.jwt()->'app_metadata'->>'role' is distinct from 'coach'
 then raise exception 'Only an assigned AZUR coach may make this decision';end if;
 if p_decision not in ('approved','declined')
    or length(trim(coalesce(p_rationale,''))) not between 15 and 1000 then
  raise exception 'Decision and a coaching rationale of 15–1000 characters required';
 end if;
 if not exists(select 1 from public.coach_athlete_assignment a
  where a.athlete_id=p_athlete_id and a.coach_user_id=v_coach)
 then raise exception 'Athlete not assigned to current coach';end if;
 select user_id into v_athlete_user from public.athlete_profile where id=p_athlete_id;
 if v_athlete_user is null then raise exception 'Athlete profile missing';end if;
 perform pg_advisory_xact_lock(hashtext(v_athlete_user::text),55103);
 v_actual:=public.coach_adaptive_week_proposal(p_athlete_id);
 if v_actual is distinct from p_preview then
  raise exception 'Proposal, evidence or calendar has changed. Regenerate and review before deciding';
 end if;
 if v_actual->>'status'<>'ready_for_coach' then
  raise exception 'Cannot decide a blocked adaptive proposal: %',coalesce(v_actual->>'reason','unknown');
 end if;
 v_target:=(v_actual->>'week_start')::date;
 if exists(select 1 from public.coach_adaptive_week_decision
   where athlete_id=p_athlete_id and week_start=v_target)
 then raise exception 'This adaptive week has already been decided';end if;
 if p_decision='declined' then
   insert into public.coach_adaptive_week_decision(
    athlete_id,coach_user_id,week_start,decision,rationale,proposal_snapshot)
   values(p_athlete_id,v_coach,v_target,'declined',trim(p_rationale),v_actual);
   return jsonb_build_object('status','declined','calendar_changed',false,'week_start',v_target);
 end if;
 if exists(select 1 from public.planned_session p
  where p.athlete_id=p_athlete_id and p.is_active_version
  and p.planned_date>=v_target and p.planned_date<v_target+7)
 or exists(select 1 from public.season_week w
  where w.athlete_id=p_athlete_id and w.week_start=v_target
   and (w.locked or w.phase<>'Foundation')) then
   raise exception 'Destination week is no longer empty or safe';
 end if;
 insert into public.season_week
  (athlete_id,week_start,phase,target_hours,benchmark_week,locked)
 values(p_athlete_id,v_target,'Foundation',
   round((v_actual->>'proposed_minutes')::numeric/60,1),false,false)
 on conflict(athlete_id,week_start) do nothing;
 select id into v_week_id from public.season_week
 where athlete_id=p_athlete_id and week_start=v_target
   and phase='Foundation' and not locked;
 if v_week_id is null then raise exception 'Safe target week missing';end if;
 update public.season_week
 set target_hours=round((v_actual->>'proposed_minutes')::numeric/60,1)
 where id=v_week_id;
 for v_item in select value from jsonb_array_elements(v_actual->'sessions') loop
   if (v_item->>'date')::date<v_target
      or (v_item->>'date')::date>=v_target+7 then
     raise exception 'Invalid workout date in proposal';
   end if;
   if (v_item->>'duration_min')::int not between 20 and 180 then
     raise exception 'Invalid workout duration';
   end if;
   insert into public.planned_session(
     season_week_id,athlete_id,planned_date,sport,title,
     session_class,priority,duration_min,targets,prescription,
     rationale,status,locked,is_active_version)
   values(
     v_week_id,p_athlete_id,(v_item->>'date')::date,
     (v_item->>'sport')::public.sport_type,v_item->>'title',
     'easy',2,(v_item->>'duration_min')::int,
     jsonb_build_object(
       'generation_source','coach_adaptive_continuation',
       'adaptive_source_session_id',v_item->>'source_session_id',
       'adaptation',v_actual->>'adaptation',
       'race_phase',v_actual->>'race_phase',
       'race_distance',v_actual->>'race_distance',
       'race_date',v_actual->>'race_date',
       'development_sport',v_actual->>'development_sport',
       'race_guidance_only',true,
       'coach_approved',true,'coach_user_id',v_coach,
       'evidence_status',v_actual->>'evidence_status',
       'rpe_min',2,'rpe_max',4,
       'requires_coach_review_for_progression',true),
     v_item->'prescription',
     'AZUR race-aware easy-training continuation, reviewed and published by assigned coach. Race phase recorded for audit; no automatic intensity or load progression.',
     'planned',false,true);
   v_minutes:=v_minutes+(v_item->>'duration_min')::int;
   v_count:=v_count+1;
 end loop;
 if v_count<>jsonb_array_length(v_actual->'sessions')
   or v_minutes<>(v_actual->>'proposed_minutes')::int
   or v_minutes>480 then
   raise exception 'Published plan does not match approved proposal';
 end if;
 insert into public.coach_adaptive_week_decision(
   athlete_id,coach_user_id,week_start,decision,rationale,proposal_snapshot)
 values(p_athlete_id,v_coach,v_target,'approved',trim(p_rationale),v_actual);
 return jsonb_build_object('status','approved_and_published',
   'calendar_changed',true,'sessions',v_count,
   'total_minutes',v_minutes,'week_start',v_target);
end;
$decision$;
revoke all on function public.coach_decide_adaptive_week(uuid,jsonb,text,text) from public,anon;
grant execute on function public.coach_decide_adaptive_week(uuid,jsonb,text,text) to authenticated;
