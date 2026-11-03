-- Staging: athlete-initiated swimming capability update.
-- Uses invoker privileges, authenticated ownership RLS and versioned session substitution.
create or replace function public.update_foundation_swim_preference(p_can_swim boolean)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
 v_user uuid := auth.uid();
 v_athlete uuid;
 v_setup public.athlete_onboarding%rowtype;
 v_candidate public.planned_session%rowtype;
 v_week date;
 v_swaps integer := 0;
 v_removed integer := 0;
 v_today date := (now() at time zone 'Europe/London')::date;
begin
 if v_user is null or p_can_swim is null then
   raise exception 'Authenticated athlete and explicit swimming preference required';
 end if;
 perform pg_advisory_xact_lock(hashtext(v_user::text),55103);
 select * into v_setup from public.athlete_onboarding where user_id=v_user and onboarding_step=3 for update;
 if not found then raise exception 'Completed onboarding required'; end if;
 select id into v_athlete from public.athlete_profile where user_id=v_user;
 if v_athlete is null then raise exception 'Athlete profile missing'; end if;

 if p_can_swim and coalesce(trim(v_setup.current_training_concern),'') not in ('','none') then
   return jsonb_build_object('status','review_required','reason','Your current training concern requires review before adding swimming');
 end if;

 update public.athlete_onboarding
   set can_swim_200m=p_can_swim,updated_at=now()
 where user_id=v_user;

 if not p_can_swim then
   -- Withdraw only future, unlocked, uncompleted auto-generated foundation swims.
   update public.planned_session
     set is_active_version=false, updated_at=now()
   where athlete_id=v_athlete and sport='swim' and is_active_version
     and status='planned' and not locked and planned_date>=v_today
     and targets->>'generation_source'='onboarding_foundation';
   get diagnostics v_removed=row_count;
   return jsonb_build_object('status','updated','removed_swims',v_removed,'added_swims',0);
 end if;

 -- Never touch a coach-edited/completed workout. Replace at most one future
 -- unmodified foundation bike session per calendar week, leaving less load.
 for v_week in
   select distinct p.planned_date-(extract(isodow from p.planned_date)::integer-1)
   from public.planned_session p
   where p.athlete_id=v_athlete and p.is_active_version
     and p.planned_date>=v_today and p.planned_date<v_today+14
     and p.targets->>'generation_source'='onboarding_foundation'
   order by 1
 loop
   if exists (
     select 1 from public.planned_session p
     where p.athlete_id=v_athlete and p.is_active_version and p.sport='swim'
       and p.planned_date>=v_week and p.planned_date<v_week+7
   ) then continue; end if;

   select * into v_candidate from public.planned_session p
   where p.athlete_id=v_athlete and p.is_active_version
     and p.planned_date>=greatest(v_week,v_today) and p.planned_date<v_week+7
     and p.sport='bike' and p.status='planned' and not p.locked
     and p.parent_session_id is null
     and p.targets->>'generation_source'='onboarding_foundation'
   order by p.planned_date desc,p.id
   limit 1 for update;
   if not found then continue; end if;

   update public.planned_session
     set is_active_version=false,updated_at=now()
   where id=v_candidate.id and is_active_version;
   if not found then raise exception 'Foundation session changed; refresh the calendar'; end if;

   insert into public.planned_session (
     athlete_id,season_week_id,planned_date,sport,title,session_class,priority,
     duration_min,targets,prescription,rationale,status,locked,parent_session_id,version,is_active_version
   ) values (
     v_athlete,v_candidate.season_week_id,v_candidate.planned_date,'swim',
     'Foundation relaxed swim','easy',2,30,
     jsonb_build_object('rpe_min',2,'rpe_max',3,
       'generation_source','onboarding_foundation',
       'swimming_ability_athlete_reported',true,
       'requires_coach_review_for_progression',true),
     jsonb_build_object('steps',jsonb_build_array(
       jsonb_build_object('durationMin',5,'target','Easy swimming RPE 2'),
       jsonb_build_object('durationMin',20,'target','Relaxed technique and aerobic swimming with frequent rests, RPE 2–3; use a supervised pool'),
       jsonb_build_object('durationMin',5,'target','Easy swimming or rest to cool down'))),
     'Athlete confirmed comfortable 200m swimming ability. Substituted for a longer foundation bike session without increasing training load.',
     'planned',false,v_candidate.id,v_candidate.version+1,true);
   v_swaps := v_swaps + 1;
 end loop;
 return jsonb_build_object('status','updated','added_swims',v_swaps,'removed_swims',0);
end;
$$;
revoke all on function public.update_foundation_swim_preference(boolean) from public,anon;
grant execute on function public.update_foundation_swim_preference(boolean) to authenticated;
