-- Service-only preflight. Never infer approval from caller-supplied strings.
create or replace function public.verify_weekly_publish_readiness(p_draft_id uuid)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare d public.weekly_plan_draft%rowtype; v_decision text; v_coach uuid; v_target numeric; v_minutes numeric; v_count int;
begin
 select * into d from public.weekly_plan_draft where id=p_draft_id;
 if not found then raise exception 'Draft not found'; end if;
 if extract(isodow from d.week_start)<>1 then raise exception 'Week must begin Monday'; end if;
 if exists(select 1 from public.weekly_plan_draft next
  where next.athlete_id=d.athlete_id and next.week_start=d.week_start and next.revision>d.revision)
 then raise exception 'Superseded draft cannot publish'; end if;
 select decision,coach_user_id into v_decision,v_coach
 from public.weekly_plan_decision where draft_id=d.id order by decided_at desc,id desc limit 1;
 if v_decision is distinct from 'approved' then raise exception 'Current draft lacks latest coach approval'; end if;
 if not exists(select 1 from public.coach_athlete_assignment a where a.coach_user_id=v_coach and a.athlete_id=d.athlete_id)
 then raise exception 'Approving coach is not assigned to athlete'; end if;
 if not exists(select 1 from auth.users u where u.id=v_coach and u.raw_app_meta_data->>'role'='coach')
 then raise exception 'Approving user lacks coach role'; end if;
 if jsonb_typeof(d.sessions)<>'array' or jsonb_array_length(d.sessions) not between 1 and 21
 then raise exception 'Draft has invalid session array'; end if;
 if exists(select 1 from jsonb_array_elements(d.sessions) item
   where jsonb_typeof(item)<>'object'
   or item->>'date' is null or (item->>'date')::date not between d.week_start and d.week_start+6
   or coalesce((item->'session'->>'durationMin')::integer,0) not between 1 and 720
   or (item->'session'->>'sport') not in ('bike','run','swim')
   or nullif(btrim(item->'session'->>'title'),'') is null
   or nullif(btrim(item->'session'->>'sessionClass'),'') is null
   or coalesce((item->'session'->>'priority')::integer,0) not between 1 and 3
   or jsonb_typeof(item->'session'->'prescription')<>'object'
   or item->'session'->'prescription'='{}'::jsonb)
 then raise exception 'Draft has incomplete or out-of-week sessions'; end if;
 select count(*),sum((item->'session'->>'durationMin')::numeric) into v_count,v_minutes
 from jsonb_array_elements(d.sessions) item;
 select target_hours into v_target from public.season_week where athlete_id=d.athlete_id and week_start=d.week_start;
 if v_target is null or v_target<=0 then raise exception 'Verified week target missing'; end if;
 if v_minutes < v_target*60*0.9 or v_minutes>v_target*60*1.1
 then raise exception 'Draft duration outside target tolerance'; end if;
 if exists(select 1 from public.planned_session p where p.athlete_id=d.athlete_id and p.planned_date between d.week_start and d.week_start+6 and p.is_active_version)
 then raise exception 'Existing active sessions require reconciliation; no overwrite'; end if;
 return jsonb_build_object('status','ready_for_service_publication','draft_id',d.id,'revision',d.revision,'sessions',v_count,'minutes',v_minutes,'coach_user_id',v_coach);
end; $$;
revoke all on function public.verify_weekly_publish_readiness(uuid) from public,anon,authenticated;
grant execute on function public.verify_weekly_publish_readiness(uuid) to service_role;
-- Disable the old reference-string publishing path in staging.
revoke all on function public.publish_approved_training_week(uuid,date,jsonb,text) from service_role,public,anon,authenticated;
