-- AZUR Weekly Planner V1. Service-only transactional publisher.
-- Caller must pass an explicitly coach-approved, fully validated proposal.
-- Never expose this function to authenticated/anon roles.
create or replace function public.publish_approved_training_week(
 p_athlete_id uuid, p_week_start date, p_sessions jsonb, p_approval_reference text
) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_week_id uuid; v_count integer; v_row jsonb; v_day date;
begin
 if p_week_start is null or extract(isodow from p_week_start) <> 1 then
   raise exception 'Week must start on Monday';
 end if;
 if p_approval_reference is null or length(trim(p_approval_reference)) < 8 then
   raise exception 'Verified coach approval reference required';
 end if;
 if p_sessions is null or jsonb_typeof(p_sessions) <> 'array'
    or jsonb_array_length(p_sessions) not between 1 and 21 then
   raise exception 'A valid approved weekly session array is required';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_athlete_id::text || ':' || p_week_start::text,0));
 if not exists(select 1 from public.athlete_profile where id=p_athlete_id) then
   raise exception 'Athlete does not exist';
 end if;
 if exists(select 1 from public.planned_session
           where athlete_id=p_athlete_id and planned_date between p_week_start and p_week_start+6
             and is_active_version) then
   raise exception 'Active sessions already exist; do not overwrite';
 end if;
 for v_row in select value from jsonb_array_elements(p_sessions) loop
   if jsonb_typeof(v_row) <> 'object' then raise exception 'Invalid session row'; end if;
   v_day := (v_row->>'planned_date')::date;
   if v_day not between p_week_start and p_week_start+6 then
      raise exception 'Session outside approved week';
   end if;
   if nullif(trim(v_row->>'title'),'') is null
      or coalesce((v_row->>'duration_min')::integer,0) not between 1 and 720
      or coalesce((v_row->>'priority')::integer,0) not between 1 and 3
      or jsonb_typeof(v_row->'prescription') <> 'object'
      or v_row->'prescription'='{}'::jsonb
      or nullif(trim(v_row->>'session_class'),'') is null then
     raise exception 'Incomplete prescription; publication blocked';
   end if;
 end loop;
 select id into v_week_id from public.season_week
   where athlete_id=p_athlete_id and week_start=p_week_start for update;
 if v_week_id is null then
   insert into public.season_week(athlete_id,week_start,phase,target_hours)
   select p_athlete_id,p_week_start,'general',coalesce(normal_weekly_hours,0)
   from public.athlete_profile where id=p_athlete_id
   returning id into v_week_id;
 elsif exists(select 1 from public.season_week where id=v_week_id and locked) then
   raise exception 'Week is locked';
 end if;
 insert into public.planned_session
 (season_week_id,athlete_id,planned_date,sport,title,session_class,priority,duration_min,targets,prescription,rationale,terrain,status,locked,version,is_active_version)
 select v_week_id,p_athlete_id,(item->>'planned_date')::date,
   (item->>'sport')::public.sport_type,
   item->>'title',item->>'session_class',(item->>'priority')::integer,
   (item->>'duration_min')::integer,coalesce(item->'targets','{}'::jsonb),
   item->'prescription',item->>'rationale',item->>'terrain',
   'planned'::public.session_status,false,1,true
 from jsonb_array_elements(p_sessions) as item;
 get diagnostics v_count = row_count;
 return jsonb_build_object('status','published','athlete_id',p_athlete_id,
   'week_start',p_week_start,'season_week_id',v_week_id,'sessions',v_count,
   'approval_reference',p_approval_reference);
end;
$$;
revoke all on function public.publish_approved_training_week(uuid,date,jsonb,text) from public, anon, authenticated;
grant execute on function public.publish_approved_training_week(uuid,date,jsonb,text) to service_role;
