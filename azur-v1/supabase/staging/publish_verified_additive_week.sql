create or replace function public.publish_verified_additive_week(p_draft_id uuid)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare d public.weekly_plan_draft%rowtype; v_week uuid; v_snapshot jsonb; v_current jsonb;
 v_coach uuid;v_decision text;v_target numeric;v_existing numeric;v_added numeric;v_inserted int;v_item jsonb;
begin
 select * into d from public.weekly_plan_draft where id=p_draft_id;
 if not found then raise exception 'Draft not found'; end if;
 perform pg_advisory_xact_lock(hashtextextended(d.athlete_id::text||':'||d.week_start::text,0));
 select * into d from public.weekly_plan_draft where id=p_draft_id for update;
 if exists(select 1 from public.weekly_plan_draft later where later.athlete_id=d.athlete_id and later.week_start=d.week_start and later.revision>d.revision)
 then raise exception 'Superseded draft cannot publish'; end if;
 select decision,coach_user_id into v_decision,v_coach from public.weekly_plan_decision where draft_id=p_draft_id order by decided_at desc,id desc limit 1;
 if v_decision is distinct from 'approved' then raise exception 'Latest coach approval required'; end if;
 if not exists(select 1 from public.coach_athlete_assignment a join auth.users u on u.id=a.coach_user_id
 where a.athlete_id=d.athlete_id and a.coach_user_id=v_coach and u.raw_app_meta_data->>'role'='coach')
 then raise exception 'Approving coach not authorised'; end if;
 select existing_sessions into v_snapshot from public.weekly_additive_baseline where draft_id=p_draft_id;
 if v_snapshot is null then raise exception 'Preapproval baseline missing'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
 'id',id,'date',planned_date,'sport',sport,'title',title,'sessionClass',session_class,
 'priority',priority,'durationMin',duration_min,'targets',targets,'prescription',prescription,
 'rationale',rationale,'terrain',terrain,'status',status,'locked',locked,'version',version
 ) order by id),'[]'::jsonb) into v_current
 from public.planned_session where athlete_id=d.athlete_id and planned_date between d.week_start and d.week_start+6 and is_active_version;
 if v_current<>v_snapshot then raise exception 'Existing week changed since coach review'; end if;
 if jsonb_array_length(d.sessions) not between 1 and 17 then raise exception 'Invalid additive session count'; end if;
 if jsonb_array_length(d.sessions)+jsonb_array_length(v_snapshot)>21 then raise exception 'Weekly session cap exceeded'; end if;
 select id,target_hours into v_week,v_target from public.season_week
 where athlete_id=d.athlete_id and week_start=d.week_start and not locked for update;
 if v_week is null or v_target<=0 then raise exception 'Valid unlocked target week required'; end if;
 select coalesce(sum((x->>'durationMin')::numeric),0) into v_existing from jsonb_array_elements(v_snapshot) x;
 select coalesce(sum((x->'session'->>'durationMin')::numeric),0) into v_added from jsonb_array_elements(d.sessions) x;
 if v_existing+v_added not between v_target*60*0.9 and v_target*60*1.1
 then raise exception 'Combined training duration outside approved target tolerance'; end if;
 for v_item in select value from jsonb_array_elements(d.sessions) loop
  if (v_item->>'date')::date not between d.week_start and d.week_start+6
    or (v_item->'session'->>'sport') not in ('swim','bike','run')
    or nullif(btrim(v_item->'session'->>'title'),'') is null
    or nullif(btrim(v_item->'session'->>'sessionClass'),'') is null
    or coalesce((v_item->'session'->>'priority')::integer,0) not between 1 and 3
    or coalesce((v_item->'session'->>'durationMin')::integer,0) not between 1 and 720
    or jsonb_typeof(v_item->'session'->'targets')<>'object'
    or jsonb_typeof(v_item->'session'->'prescription')<>'object'
    or v_item->'session'->'prescription'='{}'::jsonb
   then raise exception 'Invalid approved additive session'; end if;
  if exists(select 1 from jsonb_array_elements(v_snapshot) e where e->>'date'=v_item->>'date')
   then raise exception 'Additive session overlaps an existing training day'; end if;
 end loop;
 if (select count(distinct value->>'date') from jsonb_array_elements(d.sessions))<>jsonb_array_length(d.sessions)
 then raise exception 'Duplicate addition date'; end if;
 insert into public.planned_session
 (season_week_id,athlete_id,planned_date,sport,title,session_class,priority,duration_min,targets,prescription,rationale,terrain,status,locked,version,is_active_version)
 select v_week,d.athlete_id,(item->>'date')::date,(item->'session'->>'sport')::public.sport_type,
 item->'session'->>'title',item->'session'->>'sessionClass',(item->'session'->>'priority')::integer,
 (item->'session'->>'durationMin')::integer,item->'session'->'targets',item->'session'->'prescription',
 item->'session'->>'rationale',item->'session'->>'terrain','planned'::public.session_status,false,1,true
 from jsonb_array_elements(d.sessions) item;
 get diagnostics v_inserted=row_count;
 if v_inserted<>jsonb_array_length(d.sessions) then raise exception 'Not all approved additions published'; end if;
 if (select count(*) from public.planned_session where athlete_id=d.athlete_id and planned_date between d.week_start and d.week_start+6 and is_active_version)
 <>jsonb_array_length(v_snapshot)+v_inserted then raise exception 'Calendar readback count mismatch'; end if;
 if exists(select 1 from jsonb_array_elements(d.sessions) item where not exists(
 select 1 from public.planned_session p where p.athlete_id=d.athlete_id and p.is_active_version
 and p.planned_date=(item->>'date')::date and p.sport::text=item->'session'->>'sport'
 and p.title=item->'session'->>'title' and p.duration_min=(item->'session'->>'durationMin')::int
 and p.prescription=item->'session'->'prescription' and p.targets=item->'session'->'targets'
 and p.session_class=item->'session'->>'sessionClass' and p.priority=(item->'session'->>'priority')::int
 )) then raise exception 'Published workout differs from approved addition'; end if;
 return jsonb_build_object('status','published_additions','draft_id',p_draft_id,'added',v_inserted,'total_minutes',v_existing+v_added);
end;$$;
revoke all on function public.publish_verified_additive_week(uuid) from public,anon,authenticated;
grant execute on function public.publish_verified_additive_week(uuid) to service_role;