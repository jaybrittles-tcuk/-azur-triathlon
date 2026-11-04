-- Staging-only coach-authorised first-week target. No service key in the client.
-- Uses the existing invoker RPC, limited to the authenticated assigned coach.
create policy staging_assigned_coach_initial_week_insert
 on public.season_week for insert to authenticated
 with check(
  (select auth.uid()) is not null
  and ((select auth.jwt())->'app_metadata'->>'role')='coach'
  and exists(select 1 from public.coach_athlete_assignment a
    where a.coach_user_id=(select auth.uid()) and a.athlete_id=season_week.athlete_id)
  and phase='base' and not locked and not benchmark_week
  and target_hours between 2 and 25
  and extract(isodow from week_start)=1
 );
grant select,insert on public.coach_initial_target_approval to authenticated;
create policy staging_coach_target_approval_select on public.coach_initial_target_approval
 for select to authenticated using(
  coach_user_id=(select auth.uid())
  and ((select auth.jwt())->'app_metadata'->>'role')='coach'
 );
create policy staging_coach_target_approval_insert on public.coach_initial_target_approval
 for insert to authenticated with check(
  coach_user_id=(select auth.uid())
  and ((select auth.jwt())->'app_metadata'->>'role')='coach'
  and exists(select 1 from public.coach_athlete_assignment a where
    a.coach_user_id=(select auth.uid()) and a.athlete_id=coach_initial_target_approval.athlete_id)
 );
create or replace function public.approve_initial_week_target(
 p_coach_id uuid,p_athlete_id uuid,p_week_start date,p_target_hours numeric,p_confirmed_history boolean)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_profile record;v_onboard record;v_week uuid;
begin
 if (select auth.uid()) is null or (select auth.uid()) is distinct from p_coach_id
 or ((select auth.jwt())->'app_metadata'->>'role') is distinct from 'coach'
 then raise exception 'Authenticated coach required';end if;
 if not coalesce(p_confirmed_history,false) then raise exception 'Coach must confirm recent training history';end if;
 if p_week_start is null or extract(isodow from p_week_start)<>1 then raise exception 'Week must start Monday';end if;
 if p_week_start < current_date-interval '7 days' then raise exception 'Week is too old';end if;
 if not exists(select 1 from public.coach_athlete_assignment a where a.coach_user_id=p_coach_id and a.athlete_id=p_athlete_id) then raise exception 'Assignment required';end if;
 select user_id into v_profile from public.athlete_profile where id=p_athlete_id;
 if v_profile.user_id is null then raise exception 'Athlete profile missing';end if;
 select onboarding_step,weekly_hours,recent_weekly_hours,current_training_concern,training_days into v_onboard
 from public.athlete_onboarding where user_id=v_profile.user_id;
 if v_onboard.onboarding_step is distinct from 3 then raise exception 'Onboarding incomplete';end if;
 if v_onboard.current_training_concern is distinct from 'none' then raise exception 'Training concern requires separate coach review';end if;
 if v_onboard.recent_weekly_hours is null or v_onboard.recent_weekly_hours<=0 then raise exception 'Recent training load must be confirmed';end if;
 if cardinality(v_onboard.training_days)<2 then raise exception 'Training days not confirmed';end if;
 if p_target_hours is null or p_target_hours<2 or
 p_target_hours>least(v_onboard.weekly_hours,v_onboard.recent_weekly_hours,25) then raise exception 'Target exceeds availability or recent load';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_athlete_id::text||':'||p_week_start::text,0));
 if exists(select 1 from public.season_week where athlete_id=p_athlete_id and week_start=p_week_start)
 or exists(select 1 from public.weekly_plan_draft where athlete_id=p_athlete_id and week_start=p_week_start)
 or exists(select 1 from public.planned_session where athlete_id=p_athlete_id and planned_date between p_week_start and p_week_start+6 and is_active_version)
 then raise exception 'Existing week requires reconciliation';end if;
 insert into public.season_week(athlete_id,week_start,phase,target_hours,benchmark_week,locked)
 values(p_athlete_id,p_week_start,'base',p_target_hours,false,false) returning id into v_week;
 insert into public.coach_initial_target_approval(coach_user_id,athlete_id,week_start,target_hours,recent_hours_snapshot,availability_hours_snapshot,acknowledged_training_history)
 values(p_coach_id,p_athlete_id,p_week_start,p_target_hours,v_onboard.recent_weekly_hours,v_onboard.weekly_hours,true);
 return jsonb_build_object('status','coach_target_approved','season_week_id',v_week,'week_start',p_week_start,'target_hours',p_target_hours);
end;$$;
revoke all on function public.approve_initial_week_target(uuid,uuid,date,numeric,boolean) from public,anon;
grant execute on function public.approve_initial_week_target(uuid,uuid,date,numeric,boolean) to authenticated;
