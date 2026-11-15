-- Staging publisher: coach-approved questionnaire baselines alongside validated history.
-- Keeps service-role-only invocation, transaction lock, no-overwrite checks and readback.
-- Applied to staging project juvceqrzkeethontnezw on 2026-11-15.
CREATE OR REPLACE FUNCTION public.publish_verified_weekly_draft(p_draft_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare d public.weekly_plan_draft%rowtype; w public.season_week%rowtype; item jsonb; body jsonb; day date; mins integer; total integer:=0; n integer:=0; existing_count integer; cap numeric; latest_decision text; approving_coach uuid; questionnaire_cap numeric; reported_hours numeric; recent_hours numeric; experience text; consistency text; concern text; swim_ready boolean; questionnaire_count integer;
begin
 if current_user <> 'service_role' then raise exception 'Service role required'; end if;
 select * into d from public.weekly_plan_draft where id=p_draft_id;
 if not found then raise exception 'Draft missing'; end if;
 perform pg_advisory_xact_lock(hashtextextended(d.athlete_id::text||':'||d.week_start::text,0));
 if exists(select 1 from public.weekly_plan_draft where athlete_id=d.athlete_id and week_start=d.week_start and revision>d.revision) then raise exception 'Superseded draft'; end if;
 select decision,coach_user_id into latest_decision,approving_coach from public.weekly_plan_decision where draft_id=d.id order by decided_at desc,id desc limit 1;
 if latest_decision is distinct from 'approved' or not exists(select 1 from public.coach_athlete_assignment a where a.coach_user_id=approving_coach and a.athlete_id=d.athlete_id) then raise exception 'Coach approval missing'; end if;
 if jsonb_typeof(d.sessions)<>'array' or jsonb_array_length(d.sessions) not between 1 and 21 then raise exception 'Draft must contain 1 to 21 workouts'; end if;
 select * into w from public.season_week where athlete_id=d.athlete_id and week_start=d.week_start for update;
 if not found or w.locked then raise exception 'Unlocked season week required'; end if;
 select count(*) into existing_count from public.planned_session where athlete_id=d.athlete_id and planned_date between d.week_start and d.week_start+6 and is_active_version;
 if existing_count>0 then raise exception 'Existing week cannot be replaced'; end if;
 for item in select value from jsonb_array_elements(d.sessions) loop
  body:=item->'session'; day:=(item->>'date')::date;
  if day<d.week_start or day>d.week_start+6 or jsonb_typeof(body)<>'object' then raise exception 'Invalid workout date or structure'; end if;
  if coalesce(body->>'sport','') not in ('swim','bike','run') or nullif(trim(body->>'title'),'') is null or coalesce(body->>'sessionClass','')='' or coalesce(body->>'priority','') not in ('1','2','3') or jsonb_typeof(body->'targets')<>'object' or jsonb_typeof(body->'prescription')<>'object' then raise exception 'Incomplete workout'; end if;
  mins:=(body->>'durationMin')::integer;
  if mins<10 or mins>240 then raise exception 'Unsafe duration'; end if;
  total:=total+mins;n:=n+1;
 end loop;
 if (select count(*) from (select value->>'date' as day,value->'session'->>'sport' as sport from jsonb_array_elements(d.sessions) group by 1,2 having count(*)>1) dup)>0 then raise exception 'Duplicate sport/day in draft'; end if; select least(w.target_hours,r.approved_weekly_hours) into cap from public.coach_history_baseline_review r where r.athlete_id=d.athlete_id and r.coach_user_id=approving_coach and r.decision='validated' and r.spike_verified and r.recovery_reviewed and r.approved_weekly_hours>0;
 if cap is null then
   select count(*),max(q.approved_weekly_hours),max(o.weekly_hours),max(o.recent_weekly_hours),
          max(o.training_background),max(o.training_consistency),max(o.current_training_concern)
   into questionnaire_count,questionnaire_cap,reported_hours,recent_hours,experience,consistency,concern
   from public.coach_questionnaire_baseline_approval q
   join public.athlete_profile ap on ap.id=q.athlete_id
   join public.athlete_onboarding o on o.user_id=ap.user_id
   where q.athlete_id=d.athlete_id and q.coach_user_id=approving_coach
     and q.questionnaire_updated_at>=o.updated_at and o.onboarding_step>=5;
   if questionnaire_count<>1 then raise exception 'Current coach-approved questionnaire baseline required'; end if;
   select o.can_swim_200m into swim_ready from public.athlete_onboarding o
     join public.athlete_profile ap on ap.user_id=o.user_id where ap.id=d.athlete_id;
   if experience not in ('novice','regular','established') or consistency not in ('under4','4to7','8plus')
      or concern is distinct from 'none' or reported_hours not between 2 and 25
      or questionnaire_cap<=0 or questionnaire_cap>least(reported_hours,case when consistency='under4' then 4 when experience='novice' then 5 else 6 end)
   then raise exception 'Questionnaire starting capacity or safety checks failed'; end if;
   if recent_hours is not null and (recent_hours<0 or recent_hours>40 or (recent_hours>0 and total>recent_hours*66))
   then raise exception 'Questionnaire recent-volume progression guard failed'; end if;
   if exists(select 1 from jsonb_array_elements(d.sessions) s where (s->'session'->>'priority')<>'1'
     or (s->'session'->>'sessionClass')<>'introductory')
   then raise exception 'Questionnaire draft must use introductory level-one workouts'; end if;
   if exists(select 1 from jsonb_array_elements(d.sessions) s
     where not exists (select 1 from public.coach_workout_library l
       where l.workout_key=s->'session'->>'id' and l.approved and l.level=1
         and l.sport::text=s->'session'->>'sport' and l.title=s->'session'->>'title'
         and l.duration_min=(s->'session'->>'durationMin')::integer
         and l.family in ('technique','aerobic_endurance','recovery')
         and l.prescription=s->'session'->'prescription'))
   then raise exception 'Questionnaire draft must match approved introductory library workouts'; end if;
   if swim_ready is not true and exists(select 1 from jsonb_array_elements(d.sessions) s
     join public.coach_workout_library l on l.workout_key=s->'session'->>'id'
     where s->'session'->>'sport'='swim' and l.family<>'technique')
   then raise exception 'Swim readiness requires technique-only workouts'; end if;
   cap:=least(w.target_hours,questionnaire_cap);
 end if;
 if cap is null or cap<=0 or total>cap*60 then raise exception 'Draft exceeds coach-approved capacity or saved week target'; end if;
 for item in select value from jsonb_array_elements(d.sessions) loop
  body:=item->'session';
  insert into public.planned_session(season_week_id,athlete_id,planned_date,sport,title,session_class,priority,duration_min,targets,prescription,rationale,status)
  values(w.id,d.athlete_id,(item->>'date')::date,(body->>'sport')::public.sport_type,body->>'title',body->>'sessionClass',(body->>'priority')::integer,(body->>'durationMin')::integer,body->'targets',body->'prescription',body->>'rationale','planned');
 end loop;
 if (select count(*) from public.planned_session where athlete_id=d.athlete_id and planned_date between d.week_start and d.week_start+6 and is_active_version)<>n then raise exception 'Calendar publication readback mismatch'; end if;
 return jsonb_build_object('published',n,'minutes',total,'week_start',d.week_start,'draft_id',d.id);
end $function$
;
