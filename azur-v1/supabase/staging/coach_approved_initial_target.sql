-- Staging-only, service-initiated and coach-confirmed weekly training target.
-- Never permit a coach to infer recent load from availability alone.
create table if not exists public.coach_initial_target_approval (
 id uuid primary key default gen_random_uuid(),
 coach_user_id uuid not null references auth.users(id),
 athlete_id uuid not null references public.athlete_profile(id),
 week_start date not null,
 target_hours numeric not null check(target_hours between 2 and 25),
 recent_hours_snapshot numeric not null,
 availability_hours_snapshot numeric not null,
 acknowledged_training_history boolean not null check(acknowledged_training_history),
 created_at timestamptz not null default now(),
 unique(athlete_id,week_start)
);
alter table public.coach_initial_target_approval enable row level security;
revoke all on public.coach_initial_target_approval from public,anon,authenticated;
grant select,insert on public.coach_initial_target_approval to service_role;

create or replace function public.approve_initial_week_target(
 p_coach_id uuid,p_athlete_id uuid,p_week_start date,p_target_hours numeric,p_confirmed_history boolean)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_profile record;v_onboard record;v_week uuid;
begin
 if not coalesce(p_confirmed_history,false) then raise exception 'Coach must confirm recent training history';end if;
 if extract(isodow from p_week_start)<>1 then raise exception 'Week must start Monday';end if;
 if p_week_start < current_date-interval '7 days' then raise exception 'Week is too old';end if;
 if not exists(select 1 from auth.users u where u.id=p_coach_id and u.raw_app_meta_data->>'role'='coach') then raise exception 'Coach verification required';end if;
 if not exists(select 1 from public.coach_athlete_assignment a where a.coach_user_id=p_coach_id and a.athlete_id=p_athlete_id) then raise exception 'Assignment required';end if;
 select user_id into v_profile from public.athlete_profile where id=p_athlete_id;
 if v_profile.user_id is null then raise exception 'Athlete profile missing';end if;
 select onboarding_step,weekly_hours,recent_weekly_hours,current_training_concern,training_days into v_onboard
 from public.athlete_onboarding where user_id=v_profile.user_id;
 if v_onboard.onboarding_step is distinct from 3 then raise exception 'Onboarding incomplete';end if;
 if v_onboard.current_training_concern is distinct from 'none' then raise exception 'Training concern requires separate clinical/coach review';end if;
 if v_onboard.recent_weekly_hours is null or v_onboard.recent_weekly_hours<=0 then raise exception 'Recent training load must be verified';end if;
 if cardinality(v_onboard.training_days)<2 then raise exception 'Training days not confirmed';end if;
 if p_target_hours is null or p_target_hours<2 or
 p_target_hours>least(v_onboard.weekly_hours,v_onboard.recent_weekly_hours,25) then raise exception 'Requested target exceeds verified availability or reported recent load';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_athlete_id::text||':'||p_week_start::text,0));
 if exists(select 1 from public.season_week where athlete_id=p_athlete_id and week_start=p_week_start)
 or exists(select 1 from public.weekly_plan_draft where athlete_id=p_athlete_id and week_start=p_week_start)
 or exists(select 1 from public.planned_session where athlete_id=p_athlete_id and planned_date between p_week_start and p_week_start+6 and is_active_version)
 then raise exception 'Existing week must be reconciled; no overwrite';end if;
 insert into public.season_week(athlete_id,week_start,phase,target_hours,benchmark_week,locked)
 values(p_athlete_id,p_week_start,'base',p_target_hours,false,false) returning id into v_week;
 insert into public.coach_initial_target_approval(coach_user_id,athlete_id,week_start,target_hours,recent_hours_snapshot,availability_hours_snapshot,acknowledged_training_history)
 values(p_coach_id,p_athlete_id,p_week_start,p_target_hours,v_onboard.recent_weekly_hours,v_onboard.weekly_hours,true);
 return jsonb_build_object('status','coach_target_approved','season_week_id',v_week,'week_start',p_week_start,'target_hours',p_target_hours);
end;$$;
revoke all on function public.approve_initial_week_target(uuid,uuid,date,numeric,boolean) from public,anon,authenticated;
grant execute on function public.approve_initial_week_target(uuid,uuid,date,numeric,boolean) to service_role;
