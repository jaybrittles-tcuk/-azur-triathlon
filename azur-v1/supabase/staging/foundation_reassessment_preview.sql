-- Athlete-driven draft preview and explicit, atomic application on staging.
-- Preview is read-only; applying never changes completed, locked or coach-authored sessions.
create or replace function public.preview_foundation_reassessment(p_inputs jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
 v_user uuid:=auth.uid(); v_athlete uuid;
 v_setup public.athlete_onboarding%rowtype;
 v_background text; v_consistency text; v_concern text;
 v_hours numeric; v_recent numeric; v_swim boolean; v_days int[];
 v_week date; v_date date; v_start date;
 v_tier text:='foundation';v_reason text:='limited or unverified training history';
 v_cap int; v_sessions_limit int; v_week_min int; v_count int; v_seq int; v_duration int;
 v_sport text;v_title text;v_steps jsonb;v_plan jsonb:='[]'::jsonb;
 v_existing int;v_existing_min int;v_existing_max int:=0;
 v_sig text;v_blocked text:='';v_total int:=0;v_week_total int:=0;
begin
 if v_user is null then raise exception 'Authentication required'; end if;
 select * into v_setup from public.athlete_onboarding where user_id=v_user and onboarding_step=3;
 if not found then raise exception 'Complete athlete onboarding first'; end if;
 select id into v_athlete from public.athlete_profile where user_id=v_user;
 if v_athlete is null then raise exception 'Athlete profile missing'; end if;
 if p_inputs is null or jsonb_typeof(p_inputs)<>'object' then raise exception 'Reassessment input must be an object'; end if;
 v_background:=p_inputs->>'training_background';
 v_consistency:=p_inputs->>'training_consistency';
 v_concern:=v_setup.current_training_concern;
 if v_background not in ('novice','regular','established') or v_background is null
    or v_consistency not in ('under4','4to7','8plus') or v_consistency is null then
   raise exception 'Training background and consistency are required';
 end if;
 if jsonb_typeof(p_inputs->'weekly_hours')<>'number'
    or jsonb_typeof(p_inputs->'recent_weekly_hours') not in ('number','null') then
   raise exception 'Weekly hours and recent completed hours must be numeric (or null)';
 end if;
 v_hours:=(p_inputs->>'weekly_hours')::numeric;
 v_recent:=(p_inputs->>'recent_weekly_hours')::numeric;
 if v_hours<2 or v_hours>25 or (v_recent is not null and (v_recent<0 or v_recent>25))
    or v_hours is null then raise exception 'Training hours out of supported range'; end if;
 if jsonb_typeof(p_inputs->'can_swim_200m')<>'boolean' then
   raise exception 'Swimming ability confirmation required';
 end if;
 v_swim:=(p_inputs->>'can_swim_200m')::boolean;
 if jsonb_typeof(p_inputs->'training_days')<>'array'
    or jsonb_array_length(p_inputs->'training_days')=0
    or jsonb_array_length(p_inputs->'training_days')>7 then
   raise exception 'Select valid training days';
 end if;
 if exists(select 1 from jsonb_array_elements(p_inputs->'training_days') x
   where jsonb_typeof(x.value)<>'number' or x.value::text not in ('0','1','2','3','4','5','6')) then
   raise exception 'Training days must be integers 0-6';
 end if;
 select array_agg(distinct value::int order by value::int)
 into v_days from jsonb_array_elements_text(p_inputs->'training_days') value;
 if v_concern is distinct from 'none' then
    return jsonb_build_object('status','review_required','reason','Current training concern requires coach review before modifying sessions');
 end if;
 if v_background='established' and v_consistency='8plus' and coalesce(v_recent,0)>=5 then
   v_tier:='established_continuation';v_reason:='athlete-reported 8+ consistent weeks';
   v_cap:=floor(60*least(v_hours,v_recent*0.85,8.0));v_sessions_limit:=least(6,cardinality(v_days));
 elsif v_background in ('regular','established') and v_consistency in ('4to7','8plus')
    and coalesce(v_recent,0)>=3 then
   v_tier:='regular_continuation';v_reason:='athlete-reported 4+ consistent weeks';
   v_cap:=floor(60*least(v_hours,v_recent*0.75,5.5));v_sessions_limit:=least(5,cardinality(v_days));
 else
   v_cap:=floor(60*least(v_hours,case when v_recent=0 then 2.0 else least(coalesce(v_recent,2.5),3.0) end));
   v_sessions_limit:=least(4,cardinality(v_days));
 end if;
 -- Future only. Never silently change the current training week.
 v_start:=(now() at time zone 'Europe/London')::date;
 v_start:=v_start+(8-extract(isodow from v_start)::int);
 select coalesce(md5(string_agg(
  p.id::text||':'||p.updated_at::text||':'||p.status::text||':'||p.locked::text||':'||p.is_active_version::text,
  '|' order by p.id)),md5('empty'))
 into v_sig from public.planned_session p
 where p.athlete_id=v_athlete and p.is_active_version
 and p.planned_date>=v_start and p.planned_date<v_start+14;
 if exists(select 1 from public.season_week w
  where w.athlete_id=v_athlete and w.week_start in (v_start,v_start+7)
    and w.locked) then v_blocked:='A coach-locked week cannot be replaced'; end if;
 if exists(select 1 from public.planned_session p
  where p.athlete_id=v_athlete and p.is_active_version
    and p.planned_date>=v_start and p.planned_date<v_start+14
    and (p.locked or p.status<>'planned'
     or coalesce(p.targets->>'generation_source','')<>'onboarding_foundation')) then
    v_blocked:='Existing coach-authored, edited, completed or locked sessions must be preserved';
 end if;
 -- Current week is protected and will never be replaced.
 for v_week in select v_start union all select v_start+7 loop
   v_week_min:=0;v_count:=0;v_seq:=0;
   for v_date in select generate_series(v_week,v_week+6,interval '1 day')::date loop
     if not (extract(isodow from v_date)::int-1=any(v_days)) or v_count>=v_sessions_limit then continue; end if;
     if v_swim then v_sport:=(array['bike','run','swim'])[v_seq%3+1];
     else v_sport:=(array['bike','run'])[v_seq%2+1]; end if;
     if v_sport='bike' then
       v_duration:=case v_tier when 'established_continuation' then 120 when 'regular_continuation' then 75 else 40 end;
       v_title:='Foundation easy aerobic ride';
       v_steps:=jsonb_build_array(
         jsonb_build_object('durationMin',10,'target','Easy spin, RPE 2–3'),
         jsonb_build_object('durationMin',v_duration-15,'target','Conversational aerobic riding, RPE 3–4'),
         jsonb_build_object('durationMin',5,'target','Easy cooldown, RPE 2'));
     elsif v_sport='run' then
       v_duration:=case v_tier when 'established_continuation' then 55 when 'regular_continuation' then 40 else 25 end;
       v_title:=case when v_tier='foundation' then 'Foundation walk-run' else 'Foundation easy run' end;
       v_steps:=jsonb_build_array(
         jsonb_build_object('durationMin',5,'target','Comfortable walk warm-up, RPE 2'),
         jsonb_build_object('durationMin',v_duration-10,'target',
           case when v_tier='foundation' then 'Easy jog/walk intervals as needed, RPE 2–3' else 'Easy conversational running, RPE 3–4; walk if needed' end),
         jsonb_build_object('durationMin',5,'target','Walk to cool down'));
     else
       v_duration:=case v_tier when 'established_continuation' then 45 when 'regular_continuation' then 35 else 30 end;
       v_title:='Foundation relaxed swim';
       v_steps:=jsonb_build_array(
         jsonb_build_object('durationMin',5,'target','Very easy swimming, RPE 2'),
         jsonb_build_object('durationMin',v_duration-10,'target','Technique-focused easy swimming and breaks, RPE 2–3, supervised pool'),
         jsonb_build_object('durationMin',5,'target','Easy cooldown or rest'));
     end if;
     if v_week_min+v_duration>v_cap then continue; end if;
     v_plan:=v_plan||jsonb_build_array(jsonb_build_object(
       'date',v_date,'sport',v_sport,'title',v_title,'duration_min',v_duration,
       'prescription',jsonb_build_object('steps',v_steps,
          'focus','Easy aerobic foundation · RPE-led session'),
       'week_start',v_week));
     v_week_min:=v_week_min+v_duration;v_total:=v_total+v_duration;
     v_count:=v_count+1;v_seq:=v_seq+1;
   end loop;
   select coalesce(sum(p.duration_min),0),count(*)
     into v_existing_min,v_existing from public.planned_session p
     where p.athlete_id=v_athlete and p.is_active_version
       and p.planned_date>=v_week and p.planned_date<v_week+7;
   if v_existing>0 and v_week_min>v_existing_min*1.20 then
     v_blocked:='Material increase beyond 20% of existing weekly training requires coach approval';
   end if;
   v_existing_max:=greatest(v_existing_max,v_existing_min);
 end loop;
 if jsonb_array_length(v_plan)=0 then
   v_blocked:='No safe workouts fit the submitted training availability';
 end if;
 return jsonb_build_object('status',case when v_blocked='' then 'ready_for_confirmation' else 'coach_review_required' end,
   'reason',nullif(v_blocked,''),'week_start',v_start,'week_cap_minutes',v_cap,
   'training_tier',v_tier,'capacity_basis',v_reason,'athlete_reported',true,
   'total_minutes',v_total,'existing_peak_week_minutes',v_existing_max,
   'calendar_fingerprint',v_sig,'sessions',v_plan);
end;
$$;

create or replace function public.apply_foundation_reassessment(
 p_inputs jsonb,p_expected_preview jsonb,p_confirm boolean)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
 v_user uuid:=auth.uid();v_athlete uuid;v_plan jsonb;
 v_start date;v_week date;v_week_id uuid;v_item jsonb;v_n int:=0;
begin
 if v_user is null or p_confirm is distinct from true then
   raise exception 'Authenticated, explicit confirmation is required';
 end if;
 perform pg_advisory_xact_lock(hashtext(v_user::text),55103);
 select id into v_athlete from public.athlete_profile where user_id=v_user;
 if v_athlete is null then raise exception 'Athlete profile missing'; end if;
 v_plan:=public.preview_foundation_reassessment(p_inputs);
 if v_plan->>'status'<>'ready_for_confirmation' then
   raise exception 'Coach review required or the calendar is not safely replaceable: %',coalesce(v_plan->>'reason','invalid plan');
 end if;
 if p_expected_preview is distinct from v_plan then
   raise exception 'Preview or calendar changed. Refresh and review the updated proposal';
 end if;
 v_start:=(v_plan->>'week_start')::date;
 -- Concurrent edits are blocked by the advisory lock plus the latest
 -- fingerprint. Only athlete-owned, uncompleted autogenerated sessions qualify.
 if exists(select 1 from public.planned_session p
 where p.athlete_id=v_athlete and p.is_active_version
 and p.planned_date>=v_start and p.planned_date<v_start+14
 and (p.locked or p.status<>'planned'
   or coalesce(p.targets->>'generation_source','')<>'onboarding_foundation')) then
   raise exception 'A non-foundation or modified session exists; do not replace';
 end if;
 update public.athlete_onboarding
 set training_background=p_inputs->>'training_background',
     training_consistency=p_inputs->>'training_consistency',
     weekly_hours=(p_inputs->>'weekly_hours')::numeric,
     recent_weekly_hours=(p_inputs->>'recent_weekly_hours')::numeric,
     training_days=(select array_agg(distinct x.value::int order by x.value::int)
       from jsonb_array_elements_text(p_inputs->'training_days') x(value)),
     can_swim_200m=(p_inputs->>'can_swim_200m')::boolean,
     updated_at=now()
 where user_id=v_user and onboarding_step=3;
 if not found then raise exception 'Onboarding not found'; end if;
 update public.planned_session p set is_active_version=false,updated_at=now()
 where p.athlete_id=v_athlete and p.is_active_version
   and p.planned_date>=v_start and p.planned_date<v_start+14
   and p.status='planned' and not p.locked
   and p.targets->>'generation_source'='onboarding_foundation';
 for v_item in select value from jsonb_array_elements(v_plan->'sessions') loop
   v_week:=(v_item->>'week_start')::date;
   insert into public.season_week (athlete_id,week_start,phase,target_hours,benchmark_week,locked)
   values (v_athlete,v_week,'Foundation',
      round((v_plan->>'week_cap_minutes')::numeric/60,1),false,false)
   on conflict(athlete_id,week_start) do nothing;
   select id into v_week_id from public.season_week
     where athlete_id=v_athlete and week_start=v_week;
   if v_week_id is null then raise exception 'Foundation week missing'; end if;
   insert into public.planned_session (
    season_week_id,athlete_id,planned_date,sport,title,session_class,priority,
    duration_min,targets,prescription,rationale,status,locked,is_active_version)
   values (v_week_id,v_athlete,(v_item->>'date')::date,
    (v_item->>'sport')::public.sport_type,v_item->>'title','easy',2,
    (v_item->>'duration_min')::int,
    jsonb_build_object('generation_source','onboarding_foundation','training_tier',v_plan->>'training_tier',
      'capacity_basis',v_plan->>'capacity_basis','athlete_reported',true,
      'rpe_min',2,'rpe_max',4,'requires_coach_review_for_progression',true),
    v_item->'prescription',
    'Athlete-confirmed reassessment, easy RPE-based foundation. Coach review required for material increases and progression.',
    'planned',false,true);
   v_n:=v_n+1;
 end loop;
 return jsonb_build_object('status','applied','sessions',v_n,'week_start',v_start);
end;
$$;
revoke all on function public.preview_foundation_reassessment(jsonb) from public,anon;
grant execute on function public.preview_foundation_reassessment(jsonb) to authenticated;
revoke all on function public.apply_foundation_reassessment(jsonb,jsonb,boolean) from public,anon;
grant execute on function public.apply_foundation_reassessment(jsonb,jsonb,boolean) to authenticated;
