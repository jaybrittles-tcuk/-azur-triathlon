create or replace function public.publish_verified_weekly_draft(p_draft_id uuid)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare d public.weekly_plan_draft%rowtype; v_week uuid; v_result jsonb; v_count int; v_readback int; v_minutes numeric;
begin
 select * into d from public.weekly_plan_draft where id=p_draft_id;
 if not found then raise exception 'Draft not found'; end if;
 perform pg_advisory_xact_lock(hashtextextended(d.athlete_id::text||':'||d.week_start::text,0));
 -- Re-read locked source row and enforce current approval under this same transaction.
 select * into d from public.weekly_plan_draft where id=p_draft_id for update;
 v_result:=public.verify_weekly_publish_readiness(p_draft_id);
 select id into v_week from public.season_week
 where athlete_id=d.athlete_id and week_start=d.week_start for update;
 if v_week is null then raise exception 'Existing week target record is required'; end if;
 if exists(select 1 from public.season_week where id=v_week and locked) then raise exception 'Week locked'; end if;
 -- Draft rows are immutable and no caller-provided prescriptions are accepted.
 insert into public.planned_session
  (season_week_id,athlete_id,planned_date,sport,title,session_class,priority,duration_min,targets,prescription,rationale,terrain,status,locked,version,is_active_version)
 select v_week,d.athlete_id,(item->>'date')::date,
  (item->'session'->>'sport')::public.sport_type,
  item->'session'->>'title',
  coalesce(nullif(item->'session'->>'sessionClass',''),'endurance'),
  coalesce(nullif(item->'session'->>'priority','')::integer,2),
  (item->'session'->>'durationMin')::integer,
  coalesce(item->'session'->'targets','{}'::jsonb),
  item->'session'->'prescription',item->'session'->>'rationale',
  item->'session'->>'terrain','planned'::public.session_status,false,1,true
 from jsonb_array_elements(d.sessions) item;
 get diagnostics v_count=row_count;
 select count(*),coalesce(sum(duration_min),0) into v_readback,v_minutes from public.planned_session
 where athlete_id=d.athlete_id and planned_date between d.week_start and d.week_start+6 and is_active_version;
 if v_count<>jsonb_array_length(d.sessions) or v_readback<>v_count or v_minutes<>(v_result->>'minutes')::numeric
 then raise exception 'Calendar readback does not match approved draft'; end if;
 return jsonb_build_object('status','published_verified','draft_id',d.id,'sessions',v_count,'minutes',v_minutes);
end;$$;
revoke all on function public.publish_verified_weekly_draft(uuid) from public,anon,authenticated;
grant execute on function public.publish_verified_weekly_draft(uuid) to service_role;