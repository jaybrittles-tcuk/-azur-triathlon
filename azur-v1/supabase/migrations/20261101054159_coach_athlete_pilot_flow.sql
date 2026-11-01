-- Assigned coaches can read feedback only for their own athletes and matching sessions.
create policy "Assigned coaches read session feedback"
on public.session_feedback for select to authenticated
using (
  (auth.jwt()->'app_metadata'->>'role') = 'coach'
  and exists (
    select 1 from public.coach_athlete_assignment a
    join public.planned_session s on s.athlete_id=a.athlete_id
    where a.coach_user_id=(select auth.uid())
      and a.athlete_id=session_feedback.athlete_id
      and s.id=session_feedback.planned_session_id
  )
);

-- Create an explicitly coach-confirmed week only when the athlete has none for this date.
-- A failed schedule rolls back the new week in the same transaction.
create or replace function public.coach_schedule_bike_with_week(
 p_athlete_id uuid, p_date date, p_workout_id text, p_workout_version integer,
 p_title text, p_duration_min integer, p_prescription jsonb, p_rationale text,
 p_week_phase text, p_week_hours numeric
) returns uuid language plpgsql security definer set search_path=''
as $$
declare v_coach uuid:=auth.uid(); v_week_date date;
begin
 if v_coach is null or (auth.jwt()->'app_metadata'->>'role') is distinct from 'coach'
 then raise exception 'Verified coach access required'; end if;
 if not exists(select 1 from public.coach_athlete_assignment where coach_user_id=v_coach and athlete_id=p_athlete_id)
 then raise exception 'Athlete is not assigned to coach'; end if;
 if p_date is null or p_date<current_date or p_date>current_date+365
 then raise exception 'Choose a date within the next year'; end if;
 if p_week_phase is null or p_week_phase not in ('base','build','peak','taper','recovery')
 or p_week_hours is null or p_week_hours<2 or p_week_hours>25 or p_week_hours::text in ('NaN','Infinity','-Infinity')
 then raise exception 'Confirm a training phase and weekly hours between 2 and 25'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_athlete_id::text||p_date::text,0));
 v_week_date:=p_date-((extract(isodow from p_date)::integer)-1);
 insert into public.season_week(athlete_id,week_start,phase,target_hours)
 values(p_athlete_id,v_week_date,p_week_phase,p_week_hours)
 on conflict(athlete_id,week_start) do nothing;
 return public.coach_schedule_approved_bike_session(
  p_athlete_id,p_date,p_workout_id,p_workout_version,p_title,p_duration_min,p_prescription,p_rationale
 );
end $$;
revoke all on function public.coach_schedule_bike_with_week(uuid,date,text,integer,text,integer,jsonb,text,text,numeric) from public,anon;
grant execute on function public.coach_schedule_bike_with_week(uuid,date,text,integer,text,integer,jsonb,text,text,numeric) to authenticated;

-- Keep athlete feedback and manually recorded effort/notes consistent.
create or replace function public.athlete_save_session_feedback(
 p_session_id uuid, p_rpe integer, p_notes text
) returns uuid language plpgsql security definer set search_path=''
as $$
declare v_athlete uuid; v_feedback uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select id into v_athlete from public.athlete_profile where user_id=auth.uid();
 if v_athlete is null then raise exception 'Athlete profile required'; end if;
 if (p_rpe is not null and (p_rpe<1 or p_rpe>10)) or length(coalesce(p_notes,''))>2000
 then raise exception 'Enter RPE 1–10 and notes up to 2000 characters'; end if;
 perform 1 from public.planned_session where id=p_session_id and athlete_id=v_athlete for update;
 if not found then raise exception 'Session not available to this athlete'; end if;
 insert into public.session_feedback(athlete_id,planned_session_id,session_rpe,notes,updated_at)
 values(v_athlete,p_session_id,p_rpe,nullif(btrim(p_notes),''),now())
 on conflict(planned_session_id) do update
 set session_rpe=excluded.session_rpe,notes=excluded.notes,updated_at=now()
 where public.session_feedback.athlete_id=v_athlete
 returning id into v_feedback;
 if v_feedback is null then raise exception 'Feedback ownership mismatch'; end if;
 update public.completed_activity set session_rpe=p_rpe,notes=nullif(btrim(p_notes),'')
 where athlete_id=v_athlete and planned_session_id=p_session_id and source='manual';
 return v_feedback;
end $$;
revoke all on function public.athlete_save_session_feedback(uuid,integer,text) from public,anon;
grant execute on function public.athlete_save_session_feedback(uuid,integer,text) to authenticated;
