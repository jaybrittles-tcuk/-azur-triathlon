-- V10.2 staging: balanced triathlon starter weeks, conservative and athlete-owned.
-- Reuses bike distribution; additionally distinguishes technique from endurance
-- for swim and run. Never increases load or adds intensity.
create or replace function public.athlete_balance_foundation_week()
returns jsonb language plpgsql security invoker set search_path=public,pg_temp
as $balance_week$
declare
 v_user uuid:=auth.uid();
 v_athlete uuid;
 v_setup public.athlete_onboarding%rowtype;
 v_today date:=(now() at time zone 'Europe/London')::date;
 v_bike jsonb;
 v_week record;
 v_sport text;
 v_first record;
 v_second record;
 v_target int;
 v_cut int;
 v_changed_swim int:=0;
 v_changed_run int:=0;
 v_saved int:=0;
 v_total int;
begin
 if v_user is null or auth.jwt()->'app_metadata'->>'role'='coach'
 then raise exception 'Authenticated athlete required';end if;
 perform pg_advisory_xact_lock(hashtext(v_user::text),55103);
 select * into v_setup from public.athlete_onboarding
 where user_id=v_user and onboarding_step=3;
 if not found then raise exception 'Complete onboarding first';end if;
 if coalesce(v_setup.current_training_concern,'unsure')<>'none'
 then return jsonb_build_object('status','review_required',
    'calendar_changed',false,'reason','Training concerns require coach review');
 end if;
 if (select count(*) from public.athlete_profile where user_id=v_user)<>1
 then raise exception 'Unique athlete profile required';end if;
 select id into v_athlete from public.athlete_profile where user_id=v_user;
 v_bike:=public.athlete_balance_foundation_bikes();
 for v_week in
   select w.id,w.week_start from public.season_week w
   where w.athlete_id=v_athlete and w.week_start<v_today+14
     and w.week_start+7>v_today and w.phase='Foundation' and not w.locked
   order by w.week_start
 loop
   foreach v_sport in array array['swim','run'] loop
     if v_sport='swim' and v_setup.can_swim_200m is distinct from true then continue;end if;
     -- Never rebalance a partially completed, edited, moved or coach-owned
     -- discipline even if one planned session remains.
     if exists(select 1 from public.planned_session p
       where p.athlete_id=v_athlete and p.is_active_version
       and p.planned_date>=v_week.week_start
       and p.planned_date<v_week.week_start+7 and p.sport::text=v_sport
       and (p.planned_date<v_today or p.status<>'planned' or p.locked
         or p.session_class<>'easy'
         or p.targets->>'generation_source'<>'onboarding_foundation'))
     then continue;end if;
     if (select count(*) from public.planned_session p
       where p.athlete_id=v_athlete and p.is_active_version
       and p.planned_date>=v_week.week_start
       and p.planned_date<v_week.week_start+7 and p.sport::text=v_sport)<>2
     then continue;end if;
     select p.id,p.planned_date,p.duration_min into v_first
      from public.planned_session p
      where p.athlete_id=v_athlete and p.is_active_version
        and p.planned_date>=v_week.week_start
        and p.planned_date<v_week.week_start+7 and p.sport::text=v_sport
      order by p.planned_date,p.id limit 1;
     select p.id,p.planned_date,p.duration_min into v_second
      from public.planned_session p
      where p.athlete_id=v_athlete and p.is_active_version
        and p.planned_date>=v_week.week_start
        and p.planned_date<v_week.week_start+7 and p.sport::text=v_sport
      order by p.planned_date,p.id offset 1 limit 1;
     -- Preserve the later endurance workout, shortening only the earlier
     -- technique workout when its original easy duration is at least 45 min.
     v_target:=case
       when v_sport='swim' and v_first.duration_min>=45 then 35
       when v_sport='run' and v_first.duration_min>=55 then 40
       else null end;
     if v_target is null or v_target>=v_first.duration_min then continue;end if;
     v_cut:=v_first.duration_min-v_target;
     update public.planned_session p set
       duration_min=v_target,
       title=case when v_sport='swim'
         then 'Swim technique · focused skills'
         else 'Run technique · easy rhythm' end,
       rationale=case when v_sport='swim'
         then 'Why today matters: a shorter skill-first swim allows careful stroke and breathing practice while reserving the second swim for relaxed aerobic repeatability.'
         else 'Why today matters: a shorter low-effort rhythm session develops consistent running form, leaving space for recovery before your longer aerobic run.' end,
       prescription=jsonb_build_object(
         'focus',case when v_sport='swim' then 'Technique with controlled recovery'
                  else 'Relaxed run mechanics' end,
         'steps',jsonb_build_array(
           jsonb_build_object('durationMin',5,'target','Easy warm-up RPE 1-2'),
           jsonb_build_object('durationMin',v_target-10,
             'target','Comfortable technique with breaks, RPE 2-3'),
           jsonb_build_object('durationMin',5,'target','Very easy cool-down RPE 1-2'))),
       targets=(coalesce(p.targets,'{}'::jsonb)-
           'enhanced_rpe_structure_v1'-'workout_purpose'-'intensity_verified')||
         jsonb_build_object(
           'foundation_multisport_balance_v1',true,
           'original_duration_min',v_first.duration_min,
           'minutes_returned_to_recovery',v_cut,
           'requires_coach_review_for_progression',true),
       updated_at=now()
     where p.id=v_first.id and p.athlete_id=v_athlete
       and p.is_active_version and p.status='planned' and not p.locked
       and p.duration_min=v_first.duration_min
       and p.planned_date=v_first.planned_date;
     if not found then raise exception 'Starter session changed while balancing';end if;
     if v_sport='swim' then v_changed_swim:=v_changed_swim+1;
      else v_changed_run:=v_changed_run+1;end if;
     v_saved:=v_saved+v_cut;
   end loop;
 end loop;
 return jsonb_build_object('status','balanced',
   'bike_sessions_balanced',coalesce((v_bike->>'bike_sessions_balanced')::int,0),
   'swim_sessions_balanced',v_changed_swim,
   'run_sessions_balanced',v_changed_run,
   'minutes_returned_to_recovery',v_saved+
       coalesce((v_bike->>'minutes_returned_to_recovery')::int,0),
   'calendar_changed',coalesce((v_bike->>'calendar_changed')::boolean,false)
     or v_changed_swim+v_changed_run>0,
   'no_intensity_added',true);
end;
$balance_week$;
revoke all on function public.athlete_balance_foundation_week() from public,anon;
grant execute on function public.athlete_balance_foundation_week() to authenticated;
