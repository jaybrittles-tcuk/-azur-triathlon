-- Staging: safe starter-week bike allocation, replacing duplicate 2h easy rides.
-- Shorten only the SECOND easy bike when an eligible same-week pair exists.
-- No added intensity, moved day, longer run/ride, removal of completed data, or automated VO2.
create or replace function public.athlete_balance_foundation_bikes()
returns jsonb language plpgsql security invoker set search_path=public,pg_temp
as $balance$
declare
 v_user uuid:=auth.uid();
 v_athlete uuid;
 v_setup public.athlete_onboarding%rowtype;
 v_today date:=(now() at time zone 'Europe/London')::date;
 v_week record;
 v_first record;
 v_second record;
 v_target integer;
 v_saved integer:=0;
 v_changed integer:=0;
begin
 if v_user is null or auth.jwt()->'app_metadata'->>'role'='coach'
 then raise exception 'An authenticated athlete account is required';end if;
 perform pg_advisory_xact_lock(hashtext(v_user::text),55103);
 select * into v_setup from public.athlete_onboarding
 where user_id=v_user and onboarding_step=3;
 if not found then raise exception 'Complete athlete onboarding first';end if;
 if coalesce(v_setup.current_training_concern,'unsure')<>'none' then
  return jsonb_build_object('status','review_required',
   'reason','A training concern requires coach review; no workout distribution changed.',
   'calendar_changed',false);
 end if;
 if (select count(*) from public.athlete_profile where user_id=v_user)<>1
 then raise exception 'Unique athlete profile required';end if;
 select id into v_athlete from public.athlete_profile where user_id=v_user;
 for v_week in
   select sw.id,sw.week_start
   from public.season_week sw
   where sw.athlete_id=v_athlete and sw.week_start<v_today+14
     and sw.week_start+7>v_today and sw.phase='Foundation' and not sw.locked
   order by sw.week_start
 loop
   -- Allow no changes if any ride in this week has already begun, been
   -- completed, manually changed, moved, locked, or coach-authored.
   if exists(select 1 from public.planned_session p
     where p.athlete_id=v_athlete and p.is_active_version
       and p.planned_date>=v_week.week_start
       and p.planned_date<v_week.week_start+7 and p.sport='bike'
       and (p.planned_date<v_today or p.status<>'planned'
         or p.locked or p.session_class<>'easy'
         or p.targets->>'generation_source'<>'onboarding_foundation')) then
      continue;
   end if;
   if (select count(*) from public.planned_session p
     where p.athlete_id=v_athlete and p.is_active_version
      and p.planned_date>=v_week.week_start
      and p.planned_date<v_week.week_start+7 and p.sport='bike')<>2 then
     continue;
   end if;
   select p.id,p.duration_min,p.planned_date into v_first
   from public.planned_session p where p.athlete_id=v_athlete
     and p.is_active_version and p.planned_date>=v_week.week_start
     and p.planned_date<v_week.week_start+7 and p.sport='bike'
   order by p.planned_date,p.id limit 1;
   select p.id,p.duration_min,p.planned_date into v_second
   from public.planned_session p where p.athlete_id=v_athlete
     and p.is_active_version and p.planned_date>=v_week.week_start
     and p.planned_date<v_week.week_start+7 and p.sport='bike'
   order by p.planned_date,p.id offset 1 limit 1;
   -- Preserve the original longer ride. For high-continuation weeks,
   -- shorten a duplicate 120m ride to 60m; for regular-continuation,
   -- shorten 75m to 45m. Never lengthen a session.
   v_target:=case
      when v_first.duration_min>=90 and v_second.duration_min>=90 then 60
      when v_first.duration_min>=70 and v_second.duration_min>=70 then 45
      else null end;
   if v_target is null or v_target>=v_second.duration_min then continue;end if;
   update public.planned_session p set
     duration_min=v_target,
     title='Foundation aerobic technique · shorter ride',
     prescription=jsonb_build_object('steps',jsonb_build_array(
       jsonb_build_object('durationMin',10,'target','Easy gradual warm-up, RPE 1-3'),
       jsonb_build_object('durationMin',v_target-15,'target','Easy aerobic technique, RPE 2-3'),
       jsonb_build_object('durationMin',5,'target','Easy cool-down, RPE 1-2'))),
     rationale='Second weekly bike session is intentionally shorter to balance aerobic endurance, technique and recovery; the longer ride is preserved. No extra intensity was added.',
     targets=(coalesce(p.targets,'{}'::jsonb)-
       'enhanced_rpe_structure_v1'-'workout_purpose'-'intensity_verified')||
       jsonb_build_object('foundation_bike_balance_v1',true,
        'prior_duration_min',v_second.duration_min,
        'minutes_reallocated_to_recovery',v_second.duration_min-v_target,
        'requires_coach_review_for_progression',true),
     updated_at=now()
   where p.id=v_second.id and p.athlete_id=v_athlete
    and p.is_active_version and p.status='planned'
    and not p.locked and p.duration_min=v_second.duration_min
    and p.planned_date=v_second.planned_date;
   if not found then raise exception 'Bike week changed during scheduling';end if;
   v_saved:=v_saved+(v_second.duration_min-v_target);
   v_changed:=v_changed+1;
 end loop;
 return jsonb_build_object('status','updated','bike_sessions_balanced',v_changed,
  'minutes_returned_to_recovery',v_saved,'calendar_changed',v_changed>0,
  'note','Only an upcoming second easy ride was shortened; the long ride and all existing activity/completion records remain unchanged.');
end;
$balance$;
revoke all on function public.athlete_balance_foundation_bikes() from public,anon;
grant execute on function public.athlete_balance_foundation_bikes() to authenticated;
