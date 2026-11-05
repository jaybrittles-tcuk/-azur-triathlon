-- Staging only: audit an existing Foundation target without overwriting its plan.
-- An existing target is not automatically coach-approved.
create or replace function public.audit_existing_foundation_target(
 p_coach_id uuid,p_athlete_id uuid,p_week_start date,p_confirmed_history boolean)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_week public.season_week%rowtype;v_onboard record;v_user uuid;
begin
 if auth.uid() is distinct from p_coach_id or
    (auth.jwt()->'app_metadata'->>'role') is distinct from 'coach'
 then raise exception 'Authenticated coach required';end if;
 if not coalesce(p_confirmed_history,false) then raise exception 'Coach must confirm training history';end if;
 if p_week_start is null or extract(isodow from p_week_start)<>1 then raise exception 'Monday required';end if;
 if not exists(select 1 from public.coach_athlete_assignment where coach_user_id=p_coach_id and athlete_id=p_athlete_id)
 then raise exception 'Assigned coach required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_athlete_id::text||':'||p_week_start::text,0));
 -- SELECT FOR UPDATE requires a separate UPDATE RLS policy; this audit never updates the week.
 -- The transaction advisory lock serialises audits for the same athlete and week.
 select * into v_week from public.season_week where athlete_id=p_athlete_id and week_start=p_week_start;
 if not found or v_week.locked or lower(trim(v_week.phase))<>'foundation'
 then raise exception 'Only an unlocked existing Foundation week can be audited';end if;
 if exists(select 1 from public.coach_initial_target_approval where athlete_id=p_athlete_id and week_start=p_week_start)
 then raise exception 'Existing approval requires reconciliation; do not overwrite';end if;
 -- A baseline target audit is independent of existing, editable planned workouts.
 -- Never alter those workouts, and refuse locked or non-planned sessions.
 if exists(select 1 from public.weekly_plan_draft where athlete_id=p_athlete_id and week_start=p_week_start)
 then raise exception 'Existing weekly draft requires reconciliation';end if;
 if exists(select 1 from public.planned_session
   where athlete_id=p_athlete_id and planned_date between p_week_start and p_week_start+6
   and is_active_version and (locked or status is distinct from 'planned'))
 then raise exception 'Locked or progressed sessions require reconciliation';end if;
 select user_id into v_user from public.athlete_profile where id=p_athlete_id;
 select onboarding_step,weekly_hours,recent_weekly_hours,current_training_concern,training_days into v_onboard
 from public.athlete_onboarding where user_id=v_user;
 if v_onboard.onboarding_step is distinct from 3 or v_onboard.current_training_concern is distinct from 'none'
 then raise exception 'Onboarding or training safety check incomplete';end if;
 if v_onboard.recent_weekly_hours is null or v_onboard.recent_weekly_hours<=0
 or cardinality(v_onboard.training_days)<2 then raise exception 'Training history or availability requires review';end if;
 if v_week.target_hours<2 or v_week.target_hours>least(v_onboard.weekly_hours,v_onboard.recent_weekly_hours,25)
 then raise exception 'Existing target exceeds recent training or availability';end if;
 insert into public.coach_initial_target_approval
 (coach_user_id,athlete_id,week_start,target_hours,recent_hours_snapshot,availability_hours_snapshot,acknowledged_training_history)
 values(p_coach_id,p_athlete_id,p_week_start,v_week.target_hours,v_onboard.recent_weekly_hours,v_onboard.weekly_hours,true);
 return jsonb_build_object('status','foundation_target_audited','target_hours',v_week.target_hours,'phase',v_week.phase);
end;$$;
revoke all on function public.audit_existing_foundation_target(uuid,uuid,date,boolean) from public,anon;
grant execute on function public.audit_existing_foundation_target(uuid,uuid,date,boolean) to authenticated;
